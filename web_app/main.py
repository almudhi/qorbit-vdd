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
# Advanced Analysis (computed locally, no AI needed)
# ─────────────────────────────────────────────────────────
_ACTION_MAP = {
    "POTHOLES":          ("إصلاح الحفر الخطيرة في سطح الطريق فوراً",         "فوري",       "immediate"),
    "CONSTRUCTION_ROAD": ("تأمين منطقة الإنشاء وتحويل مسار المرور",          "فوري",       "immediate"),
    "SAND_ON_ROAD":      ("إزالة الرمال من سطح الطريق لتجنب الانزلاق",       "فوري",       "immediate"),
    "BAD_STREETLIGHT":   ("صيانة عمود الإنارة أو استبداله لتحسين الرؤية",    "قصير المدى", "short_term"),
    "BROKEN_SIGNAGE":    ("استبدال اللافتة التوجيهية المكسورة",               "قصير المدى", "short_term"),
    "BAD_BILLBOARD":     ("إصلاح أو إزالة اللافتة الإعلانية المتضررة",       "قصير المدى", "short_term"),
    "UNKEPT_FACADE":     ("ترميم واجهة المبنى وإعادة صيانتها",               "قصير المدى", "short_term"),
    "CLUTTER_SIDEWALK":  ("إزالة العوائق من الرصيف لإتاحة حركة المشاة",      "قصير المدى", "short_term"),
    "GARBAGE":           ("جمع النفايات وتنظيف المنطقة",                      "قصير المدى", "short_term"),
    "GRAFFITI":          ("تنظيف وطلاء الجدران والأسطح المتضررة",             "طويل المدى", "long_term"),
    "FADED_SIGNAGE":     ("تجديد اللافتات الباهتة وإعادة طلاء الإشارات",     "طويل المدى", "long_term"),
}

_QUAD_LABELS = {
    "top_left":     "الجزء العلوي الأيسر",
    "top_right":    "الجزء العلوي الأيمن",
    "bottom_left":  "الجزء السفلي الأيسر",
    "bottom_right": "الجزء السفلي الأيمن",
}

def compute_advanced_analysis(detections: list, fw: int, fh: int, dp_score: float) -> dict:
    n = len(detections)

    # Severity breakdown counts
    sev_breakdown = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for d in detections:
        sv = d.get("severity", "low")
        sev_breakdown[sv] = sev_breakdown.get(sv, 0) + 1

    # Quadrant distribution
    quads = {"top_left": 0, "top_right": 0, "bottom_left": 0, "bottom_right": 0}
    for d in detections:
        cx = (d["x1"] + d["x2"]) / 2
        cy = (d["y1"] + d["y2"]) / 2
        h_key = "left"   if cx < fw / 2 else "right"
        v_key = "top"    if cy < fh / 2 else "bottom"
        quads[f"{v_key}_{h_key}"] += 1

    # Bounding-box area coverage (% of image)
    img_area = max(fw * fh, 1)
    total_box_area = sum(
        max(0, d["x2"] - d["x1"]) * max(0, d["y2"] - d["y1"])
        for d in detections
    )
    area_pct = round(min(total_box_area / img_area * 100, 100), 1)

    # Clustering (std-dev of normalised bbox centres)
    if n > 1:
        cxs = [(d["x1"] + d["x2"]) / 2 / fw for d in detections]
        cys = [(d["y1"] + d["y2"]) / 2 / fh for d in detections]
        spread = (float(np.std(cxs)) + float(np.std(cys))) / 2
        if   spread < 0.12: clustering = "مركّزة في نقطة واحدة"
        elif spread < 0.28: clustering = "شبه متجمعة"
        else:               clustering = "موزعة على الصورة"
    elif n == 1:
        clustering = "اكتشاف واحد"
    else:
        clustering = "لا تشوهات"

    # Priority actions (deduplicated, sorted by severity desc)
    seen: set = set()
    priority_actions = []
    for d in sorted(detections, key=lambda x: SEVERITY_ORDER.index(x.get("severity", "low")), reverse=True):
        cn = d["class_name"]
        if cn not in seen:
            seen.add(cn)
            am = _ACTION_MAP.get(cn, {
                "0": f"معالجة {cn.replace('_', ' ')}",
                "1": "قصير المدى",
                "2": "short_term",
            })
            if isinstance(am, tuple):
                action_text, urgency_ar, urgency_en = am
            else:
                action_text = am.get("0", cn)
                urgency_ar  = am.get("1", "قصير المدى")
                urgency_en  = am.get("2", "short_term")
            priority_actions.append({
                "rank":       len(priority_actions) + 1,
                "class_name": cn,
                "severity":   d.get("severity", "medium"),
                "action":     action_text,
                "urgency":    urgency_ar,
                "urgency_en": urgency_en,
                "confidence": d["confidence"],
            })

    # Overall risk assessment
    if   sev_breakdown["critical"] > 0 or dp_score > 10:
        risk_level, risk_label = "critical", "حرج — تدخّل فوري لا غنى عنه"
    elif sev_breakdown["high"]     > 0 or dp_score > 6:
        risk_level, risk_label = "high",     "مرتفع — يستلزم اهتماماً عاجلاً"
    elif sev_breakdown["medium"]   > 0 or dp_score > 3:
        risk_level, risk_label = "medium",   "متوسط — يحتاج متابعة دورية"
    elif n > 0:
        risk_level, risk_label = "low",      "منخفض — الحالة مقبولة حالياً"
    else:
        risk_level, risk_label = "none",     "لا تشوهات — المنطقة آمنة"

    most_affected = max(quads, key=quads.get) if any(quads.values()) else None

    return {
        "severity_breakdown":    sev_breakdown,
        "quadrant_distribution": quads,
        "most_affected_quadrant": _QUAD_LABELS.get(most_affected, "—") if most_affected else "—",
        "area_coverage_pct":     area_pct,
        "priority_actions":      priority_actions[:5],
        "overall_risk_level":    risk_level,
        "overall_risk_label":    risk_label,
        "clustering":            clustering,
        "unique_classes":        len(seen),
    }


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
def run_claude(img_bytes: bytes, detections: list, api_key: str,
               dp_score: float = 0.0, advanced: dict | None = None) -> str:
    if not api_key:
        return ""
    try:
        import anthropic as ant
        client = ant.Anthropic(api_key=api_key)

        img_b64 = base64.standard_b64encode(img_bytes).decode()

        if detections:
            sorted_dets = sorted(detections,
                                 key=lambda x: SEVERITY_ORDER.index(x.get("severity", "low")),
                                 reverse=True)
            det_lines = "\n".join(
                f"  • {d['class_name'].replace('_',' ')} — ثقة {d['confidence']*100:.0f}% — خطورة: {d['severity']}"
                for d in sorted_dets
            )
            det_ctx = f"التشوهات المكتشفة ({len(detections)} اكتشاف):\n{det_lines}\n"
        else:
            det_ctx = "لم يكتشف النموذج أي تشوهات بصرية.\n"

        adv_ctx = ""
        if advanced:
            sb = advanced["severity_breakdown"]
            adv_ctx = (
                f"درجة خطر المسار الديناميكي (DP): {dp_score:.2f}\n"
                f"توزيع مستويات الخطورة: حرج={sb['critical']} | مرتفع={sb['high']} | متوسط={sb['medium']} | منخفض={sb['low']}\n"
                f"نسبة تغطية التشوهات: {advanced['area_coverage_pct']}% من مساحة الصورة\n"
                f"توزيع التشوهات: {advanced['clustering']}\n"
                f"المنطقة الأكثر تأثراً: {advanced['most_affected_quadrant']}\n"
                f"عدد فئات التشوه الفريدة: {advanced['unique_classes']}\n"
            )

        prompt = (
            "أنت مهندس مدني وخبير في تقييم البنية التحتية الحضرية من مرئيات الطائرات المسيّرة.\n\n"
            f"{det_ctx}\n{adv_ctx}\n"
            "بناءً على بيانات التحليل الآلي والصورة المرفقة، قدّم تقريراً مهنياً شاملاً "
            "باللغة العربية وفق الهيكل الآتي:\n\n"
            "## 1. التقييم العام\n"
            "وصف دقيق للحالة الإجمالية للمنطقة (2-3 جمل).\n\n"
            "## 2. أبرز المخاطر\n"
            "أهم المخاطر على السلامة العامة والبنية التحتية مرتبةً تنازلياً.\n\n"
            "## 3. الأولويات التنفيذية\n"
            "ثلاثة إجراءات محددة وقابلة للتنفيذ مرتبة حسب الإلحاح.\n\n"
            "## 4. الجدول الزمني المقترح\n"
            "فوري (خلال 72 ساعة) / قصير المدى (أسبوع–شهر) / طويل المدى (3–6 أشهر).\n\n"
            "## 5. التوصية النهائية\n"
            "جملة واحدة تلخّص أهم قرار يجب اتخاذه.\n\n"
            "استخدم لغة تقنية مهنية دقيقة. الحد الأقصى 300 كلمة."
        )

        msg = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=800,
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

    # Advanced analysis (local, no AI)
    advanced = compute_advanced_analysis(detections, w, h, dp_score)

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
    claude_text = run_claude(sbuf.tobytes(), detections, api_key, dp_score, advanced)

    # Summary
    class_counts: dict = {}
    max_sv = "none"
    for d in detections:
        class_counts[d["class_name"]] = class_counts.get(d["class_name"], 0) + 1
        if SEVERITY_ORDER.index(d["severity"]) > SEVERITY_ORDER.index(max_sv):
            max_sv = d["severity"]

    return {
        "detections":        detections,
        "count":             len(detections),
        "class_counts":      class_counts,
        "max_severity":      max_sv,
        "dp_score":          round(dp_score, 3),
        "dp_path":           dp_path,
        "dp_grid":           dp_grid,
        "advanced_analysis": advanced,
        "claude_analysis":   claude_text,
        "annotated_image":   annotated_b64,
        "image_size":        {"width": w, "height": h},
    }


# Serve static frontend (must be last)
_static = Path(__file__).parent / "static"
app.mount("/", StaticFiles(directory=str(_static), html=True), name="static")
