"""
Drone Visual Distortion Detection - Web API
FastAPI backend: YOLOv11 inference + Claude AI vision analysis
"""

import os
import io
import base64
import json
import numpy as np
import cv2
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, UploadFile, File, HTTPException, Header
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

# ─────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────
CLASSES = {
    0:  "BAD_BILLBOARD",
    1:  "BAD_STREETLIGHT",
    2:  "BROKEN_SIGNAGE",
    3:  "CLUTTER_SIDEWALK",
    4:  "CONSTRUCTION_ROAD",
    5:  "FADED_SIGNAGE",
    6:  "GARBAGE",
    7:  "GRAFFITI",
    8:  "POTHOLES",
    9:  "SAND_ON_ROAD",
    10: "UNKEPT_FACADE",
}

CLASS_COLORS_BGR = {
    0:  (0,  140, 255),   # orange       — BAD_BILLBOARD
    1:  (0,  210, 255),   # yellow       — BAD_STREETLIGHT
    2:  (0,  50,  210),   # red          — BROKEN_SIGNAGE
    3:  (200,170,  0),    # teal         — CLUTTER_SIDEWALK
    4:  (0,   0,  210),   # dark red     — CONSTRUCTION_ROAD
    5:  (140,140, 140),   # gray         — FADED_SIGNAGE
    6:  (0,  160,  60),   # green        — GARBAGE
    7:  (180,  0, 180),   # purple       — GRAFFITI
    8:  (0,   0,  240),   # bright red   — POTHOLES
    9:  (0,  200, 200),   # sand/yellow  — SAND_ON_ROAD
    10: (0,  100, 180),   # brown        — UNKEPT_FACADE
}

CLASS_SEVERITY = {
    0:  "medium",    # BAD_BILLBOARD
    1:  "medium",    # BAD_STREETLIGHT
    2:  "medium",    # BROKEN_SIGNAGE
    3:  "low",       # CLUTTER_SIDEWALK
    4:  "high",      # CONSTRUCTION_ROAD
    5:  "low",       # FADED_SIGNAGE
    6:  "low",       # GARBAGE
    7:  "medium",    # GRAFFITI
    8:  "critical",  # POTHOLES
    9:  "high",      # SAND_ON_ROAD
    10: "medium",    # UNKEPT_FACADE
}

SEVERITY_SCORE = {
    0:  1.0,   # BAD_BILLBOARD
    1:  1.2,   # BAD_STREETLIGHT
    2:  1.5,   # BROKEN_SIGNAGE
    3:  0.8,   # CLUTTER_SIDEWALK
    4:  2.5,   # CONSTRUCTION_ROAD
    5:  0.5,   # FADED_SIGNAGE
    6:  0.8,   # GARBAGE
    7:  1.0,   # GRAFFITI
    8:  3.0,   # POTHOLES
    9:  2.0,   # SAND_ON_ROAD
    10: 1.2,   # UNKEPT_FACADE
}
SEVERITY_ORDER = ["none", "low", "medium", "high", "critical"]

CONF_THRESHOLD  = float(os.environ.get("CONF_THRESHOLD", "0.15"))
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
MAX_FILE_BYTES  = 20 * 1024 * 1024  # 20 MB
GRID_SIZE       = 5

# Try several default locations for best.pt
_MODEL_CANDIDATES = [
    os.environ.get("MODEL_PATH", ""),
    str(Path(__file__).parent.parent / "best.pt"),
    r"C:\Users\ABADY\Downloads\best.pt",
    "best.pt",
]

# ─────────────────────────────────────────────────────────
# YOLO model singleton
# ─────────────────────────────────────────────────────────
_yolo_model  = None
_yolo_error  = ""
_yolo_path   = ""

def load_yolo() -> bool:
    global _yolo_model, _yolo_error, _yolo_path
    if _yolo_model is not None:
        return True

    for candidate in _MODEL_CANDIDATES:
        if not candidate:
            continue
        p = Path(candidate)
        if p.exists():
            try:
                from ultralytics import YOLO
                _yolo_model = YOLO(str(p))
                _yolo_path  = str(p)
                print(f"[YOLO] Loaded: {p}")
                return True
            except Exception as exc:
                _yolo_error = str(exc)
                print(f"[YOLO] Load failed ({p}): {exc}")

    _yolo_error = "best.pt not found. Set MODEL_PATH env var."
    print(f"[YOLO] {_yolo_error}")
    return False


# ─────────────────────────────────────────────────────────
# DP Path Planner
# ─────────────────────────────────────────────────────────
def compute_dp(detections: list, fw: int, fh: int, n: int = GRID_SIZE):
    grid = np.zeros((n, n), dtype=float)
    cw, ch = fw / n, fh / n

    for d in detections:
        cx = (d["x1"] + d["x2"]) / 2
        cy = (d["y1"] + d["y2"]) / 2
        col = min(int(cx / cw), n - 1)
        row = min(int(cy / ch), n - 1)
        grid[row][col] += SEVERITY_SCORE.get(d["class_id"], 1.0) * d["confidence"]

    dp = np.full((n, n), -np.inf)
    dp[0][0] = grid[0][0]
    for i in range(n):
        for j in range(n):
            if i == 0 and j == 0:
                continue
            top  = dp[i-1][j] if i > 0 else -np.inf
            left = dp[i][j-1] if j > 0 else -np.inf
            best = max(top, left)
            dp[i][j] = grid[i][j] + (best if best != -np.inf else 0.0)

    path, r, c = [], n - 1, n - 1
    path.append((r, c))
    while r > 0 or c > 0:
        top  = dp[r-1][c] if r > 0 else -np.inf
        left = dp[r][c-1] if c > 0 else -np.inf
        if top >= left:
            r -= 1
        else:
            c -= 1
        path.append((r, c))
    path.reverse()

    score = float(dp[n-1][n-1]) if dp[n-1][n-1] != -np.inf else 0.0
    return score, path, grid.tolist()


# ─────────────────────────────────────────────────────────
# Drawing helpers
# ─────────────────────────────────────────────────────────
def draw_detections(frame: np.ndarray, detections: list) -> np.ndarray:
    for d in detections:
        x1, y1, x2, y2 = d["x1"], d["y1"], d["x2"], d["y2"]
        color = CLASS_COLORS_BGR.get(d["class_id"], (200, 200, 200))
        label = f"{d['class_name'].replace('_', ' ')}  {d['confidence']:.2f}"

        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)
        cv2.rectangle(frame, (x1, y1 - th - 8), (x1 + tw + 6, y1), color, -1)
        cv2.putText(frame, label, (x1 + 3, y1 - 4),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)
    return frame


def draw_dp_overlay(frame: np.ndarray, dp_path: list, fw: int, fh: int, n: int = GRID_SIZE):
    cw, ch = fw / n, fh / n
    for r, c in dp_path:
        x1, y1 = int(c * cw) + 3, int(r * ch) + 3
        x2, y2 = int((c+1) * cw) - 3, int((r+1) * ch) - 3
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 220, 120), 1)
    if len(dp_path) > 1:
        for k in range(len(dp_path) - 1):
            r1, c1 = dp_path[k]
            r2, c2 = dp_path[k+1]
            p1 = (int((c1 + 0.5) * cw), int((r1 + 0.5) * ch))
            p2 = (int((c2 + 0.5) * cw), int((r2 + 0.5) * ch))
            cv2.arrowedLine(frame, p1, p2, (0, 255, 120), 1, tipLength=0.3)
    return frame


# ─────────────────────────────────────────────────────────
# YOLO inference
# ─────────────────────────────────────────────────────────
def run_yolo(frame: np.ndarray) -> list:
    if not _yolo_model:
        return []
    results = _yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]
    # Use class names directly from the model (overrides hardcoded CLASSES)
    model_names = _yolo_model.names
    detections = []
    for box in results.boxes:
        cls_id = int(box.cls[0])
        conf   = float(box.conf[0])
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        name = model_names.get(cls_id, CLASSES.get(cls_id, f"class_{cls_id}"))
        detections.append({
            "class_id":   cls_id,
            "class_name": name,
            "confidence": round(conf, 3),
            "severity":   CLASS_SEVERITY.get(cls_id, "medium"),
            "x1": x1, "y1": y1, "x2": x2, "y2": y2,
        })
    return detections


# ─────────────────────────────────────────────────────────
# Claude AI analysis
# ─────────────────────────────────────────────────────────
def run_claude(img_bytes: bytes, detections: list, api_key: str) -> str:
    if not api_key:
        return ""
    try:
        import anthropic as ant
        client = ant.Anthropic(api_key=api_key)

        img_b64 = base64.standard_b64encode(img_bytes).decode()
        det_ctx = (
            f"YOLO model already detected: {', '.join(set(d['class_name'] for d in detections))}. "
            if detections else ""
        )

        prompt = (
            "You are a structural engineer analyzing drone imagery for building damage. "
            f"{det_ctx}"
            "Analyze this image and provide:\n"
            "1. Distortion/damage assessment (2-3 sentences)\n"
            "2. Overall severity: Low / Medium / High / Critical\n"
            "3. Recommended action\n"
            "4. Key observations\n\n"
            "Be concise and technical. Max 180 words."
        )

        msg = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=512,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/jpeg",
                            "data": img_b64,
                        },
                    },
                    {"type": "text", "text": prompt},
                ],
            }],
        )
        return msg.content[0].text
    except Exception as exc:
        return f"Analysis unavailable: {exc}"


# ─────────────────────────────────────────────────────────
# FastAPI app
# ─────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    load_yolo()
    yield

app = FastAPI(title="Drone VDD API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "yolo":   _yolo_model is not None,
        "yolo_path": _yolo_path,
        "yolo_error": _yolo_error,
        "claude": bool(ANTHROPIC_API_KEY),
    }


@app.post("/api/detect")
async def detect(
    file: UploadFile = File(...),
    x_api_key: Optional[str] = Header(None),
):
    contents = await file.read()
    if len(contents) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds 20 MB limit")

    nparr = np.frombuffer(contents, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if frame is None:
        raise HTTPException(status_code=400, detail="Invalid or unsupported image")

    h, w = frame.shape[:2]

    # YOLO detection
    detections = run_yolo(frame)

    # DP risk path
    dp_score, dp_path, dp_grid = compute_dp(detections, w, h)

    # Draw bounding boxes + DP overlay on annotated copy
    annotated = frame.copy()
    annotated = draw_dp_overlay(annotated, dp_path, w, h)
    annotated = draw_detections(annotated, detections)
    _, buf = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 88])
    annotated_b64 = base64.standard_b64encode(buf.tobytes()).decode()

    # Resize original for Claude (max 1024px)
    scale = min(1.0, 1024 / max(w, h))
    small = cv2.resize(frame, (int(w * scale), int(h * scale))) if scale < 1 else frame
    _, sbuf = cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, 85])

    api_key = x_api_key or ANTHROPIC_API_KEY
    claude_text = run_claude(sbuf.tobytes(), detections, api_key)

    # Summary
    class_counts: dict = {}
    max_sv = "none"
    for d in detections:
        class_counts[d["class_name"]] = class_counts.get(d["class_name"], 0) + 1
        if SEVERITY_ORDER.index(d["severity"]) > SEVERITY_ORDER.index(max_sv):
            max_sv = d["severity"]

    return {
        "detections":     detections,
        "count":          len(detections),
        "class_counts":   class_counts,
        "max_severity":   max_sv,
        "dp_score":       round(dp_score, 3),
        "dp_path":        dp_path,
        "dp_grid":        dp_grid,
        "claude_analysis": claude_text,
        "annotated_image": annotated_b64,
        "image_size":     {"width": w, "height": h},
    }


# Serve static frontend (must be last)
_static = Path(__file__).parent / "static"
app.mount("/", StaticFiles(directory=str(_static), html=True), name="static")
