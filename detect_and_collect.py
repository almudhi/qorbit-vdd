"""
=============================================================
  مشروع رصد التشوه البصري بالدرون والذكاء الاصطناعي
  Drone Visual Distortion Detection + DP Path Optimizer
  + Roboflow-ready Dataset Collector
=============================================================
المتطلبات:
    pip install opencv-python ultralytics numpy requests

الاستخدام:
    python detect_and_collect.py                  # كاميرا افتراضية
    python detect_and_collect.py --source 0       # كاميرا رقم 0
    python detect_and_collect.py --source rtsp://... # بث مباشر من الدرون
    python detect_and_collect.py --source video.mp4  # ملف فيديو

الناتج:
    dataset/images/   <- صور JPEG
    dataset/labels/   <- ملفات YOLO .txt
    dataset/data.yaml <- ملف Roboflow/YOLOv11
=============================================================
"""

import cv2
import numpy as np
import os
import time
import argparse
import json
import shutil
from datetime import datetime
from pathlib import Path

# ───────────────────────────────────────────────
# الإعدادات الرئيسية
# ───────────────────────────────────────────────
CONFIG = {
    # فئات التشوه البصري (تطابق dataset حقتك في Roboflow)
    "classes": {
        0: "graffiti",        # كتابة على الجدران
        1: "crack",           # تصدع / شقوق
        2: "structural_damage",# ضرر إنشائي
        3: "stain",           # بقع / تلوث بصري
    },

    # ألوان كل فئة للعرض (BGR)
    "colors": {
        0: (0,  165, 255),   # برتقالي
        1: (0,  0,   220),   # أحمر
        2: (0,  60,  180),   # أحمر داكن
        3: (180,130, 0  ),   # أزرق
    },

    # شبكة DP لتخطيط المسار (N×N)
    "grid_size": 5,

    # عدد الإطارات بين كل حفظ تلقائي للصورة
    "save_every_n_frames": 30,

    # الحد الأدنى للثقة
    "confidence_threshold": 0.40,

    # مجلد حفظ الـ dataset
    "output_dir": "dataset",

    # تفعيل الـ DP overlay
    "show_dp_grid": True,
}

# ───────────────────────────────────────────────
# خوارزمية البرمجة الديناميكية - DP Path Planner
# ───────────────────────────────────────────────
class DPPathPlanner:
    """
    يقسّم الإطار إلى شبكة N×N.
    كل خلية تحمل درجة خطورة التشوه.
    DP تجد المسار الأمثل من (0,0) إلى (N-1,N-1)
    الذي يمر بأكبر عدد من نقاط التشوه.

    الصيغة:
        dp[i][j] = score[i][j] + max(dp[i-1][j], dp[i][j-1])
    """

    def __init__(self, grid_size: int = 5):
        self.N = grid_size
        self.grid   = np.zeros((grid_size, grid_size), dtype=float)
        self.dp     = np.zeros((grid_size, grid_size), dtype=float)
        self.path   = []

    def update_grid(self, detections: list, frame_w: int, frame_h: int):
        """تحديث شبكة الدرجات بناءً على اكتشافات YOLO"""
        self.grid.fill(0)
        cell_w = frame_w / self.N
        cell_h = frame_h / self.N

        # درجة خطورة كل فئة
        severity = {0: 1.0, 1: 2.5, 2: 3.0, 3: 0.8}

        for det in detections:
            cx = (det["x1"] + det["x2"]) / 2
            cy = (det["y1"] + det["y2"]) / 2
            col = min(int(cx / cell_w), self.N - 1)
            row = min(int(cy / cell_h), self.N - 1)
            cls = det["class_id"]
            self.grid[row][col] += severity.get(cls, 1.0) * det["confidence"]

    def solve(self) -> float:
        """تنفيذ DP وإرجاع أعلى درجة مسار"""
        N = self.N
        dp = np.full((N, N), -np.inf)
        dp[0][0] = self.grid[0][0]

        for i in range(N):
            for j in range(N):
                if i == 0 and j == 0:
                    continue
                top  = dp[i-1][j] if i > 0 else -np.inf
                left = dp[i][j-1] if j > 0 else -np.inf
                best = max(top, left)
                dp[i][j] = self.grid[i][j] + (best if best != -np.inf else 0)

        self.dp = dp

        # Traceback - تتبع المسار
        self.path = []
        r, c = N - 1, N - 1
        self.path.append((r, c))
        while r > 0 or c > 0:
            top  = dp[r-1][c] if r > 0 else -np.inf
            left = dp[r][c-1] if c > 0 else -np.inf
            if top >= left:
                r -= 1
            else:
                c -= 1
            self.path.append((r, c))
        self.path.reverse()

        return float(dp[N-1][N-1]) if dp[N-1][N-1] != -np.inf else 0.0

    def draw_overlay(self, frame: np.ndarray) -> np.ndarray:
        """رسم شبكة DP على الإطار"""
        h, w = frame.shape[:2]
        overlay = frame.copy()
        cell_w = w / self.N
        cell_h = h / self.N

        # رسم الخلايا
        for i in range(self.N):
            for j in range(self.N):
                x1 = int(j * cell_w)
                y1 = int(i * cell_h)
                x2 = int((j+1) * cell_w)
                y2 = int((i+1) * cell_h)

                score = self.grid[i][j]
                if score > 2.0:
                    color = (0, 0, 180)
                elif score > 1.0:
                    color = (0, 120, 255)
                elif score > 0.3:
                    color = (0, 200, 255)
                else:
                    color = (50, 50, 50)

                alpha = min(0.35, 0.1 + score * 0.08)
                cv2.rectangle(overlay, (x1, y1), (x2, y2), color, -1)
                cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0, frame)
                overlay = frame.copy()
                cv2.rectangle(frame, (x1, y1), (x2, y2), (80, 80, 80), 1)

                # قيمة dp
                dp_val = self.dp[i][j]
                if dp_val > 0:
                    cv2.putText(frame,
                        f"{dp_val:.1f}",
                        (x1 + 4, y2 - 6),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.32,
                        (200, 200, 200), 1, cv2.LINE_AA)

        # رسم المسار الأمثل
        path_cells = set(self.path)
        for (r, c) in self.path:
            x1 = int(c * cell_w) + 3
            y1 = int(r * cell_h) + 3
            x2 = int((c+1) * cell_w) - 3
            y2 = int((r+1) * cell_h) - 3
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 220, 120), 2)

        # رسم خط المسار
        if len(self.path) > 1:
            for k in range(len(self.path) - 1):
                r1, c1 = self.path[k]
                r2, c2 = self.path[k+1]
                cx1 = int((c1 + 0.5) * cell_w)
                cy1 = int((r1 + 0.5) * cell_h)
                cx2 = int((c2 + 0.5) * cell_w)
                cy2 = int((r2 + 0.5) * cell_h)
                cv2.arrowedLine(frame, (cx1, cy1), (cx2, cy2),
                                (0, 255, 120), 2, tipLength=0.3)

        return frame


# ───────────────────────────────────────────────
# Dataset Collector - حفظ البيانات لـ Roboflow
# ───────────────────────────────────────────────
class RoboflowDatasetCollector:
    """
    يحفظ الإطارات بصيغة YOLO (images + labels)
    جاهزة للرفع على Roboflow.
    """

    def __init__(self, output_dir: str, classes: dict):
        self.output_dir = Path(output_dir)
        self.classes    = classes
        self.img_dir    = self.output_dir / "images"
        self.lbl_dir    = self.output_dir / "labels"
        self.img_dir.mkdir(parents=True, exist_ok=True)
        self.lbl_dir.mkdir(parents=True, exist_ok=True)
        self.saved_count = 0
        self._write_yaml()

    def _write_yaml(self):
        """كتابة data.yaml لـ YOLOv11 / Roboflow"""
        yaml_path = self.output_dir / "data.yaml"
        names_list = [self.classes[i] for i in sorted(self.classes)]
        content = f"""# Roboflow / YOLOv11 dataset config
# Auto-generated by detect_and_collect.py

path: {self.output_dir.resolve()}
train: images
val: images

nc: {len(self.classes)}
names: {names_list}
"""
        yaml_path.write_text(content)

    def save_frame(self,
                   frame: np.ndarray,
                   detections: list,
                   frame_id: int) -> str:
        """
        حفظ صورة + ملف YOLO label
        تنسيق label:  class_id cx cy w h  (نسب 0..1)
        """
        ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
        name = f"drone_{ts}_{frame_id:05d}"

        # حفظ الصورة
        img_path = self.img_dir / f"{name}.jpg"
        cv2.imwrite(str(img_path), frame, [cv2.IMWRITE_JPEG_QUALITY, 95])

        # كتابة الـ label
        lbl_path = self.lbl_dir / f"{name}.txt"
        h, w = frame.shape[:2]
        lines = []
        for det in detections:
            cx = ((det["x1"] + det["x2"]) / 2) / w
            cy = ((det["y1"] + det["y2"]) / 2) / h
            bw = (det["x2"] - det["x1"]) / w
            bh = (det["y2"] - det["y1"]) / h
            lines.append(f"{det['class_id']} {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}")

        lbl_path.write_text("\n".join(lines))
        self.saved_count += 1
        return name

    def export_summary(self) -> dict:
        """ملخص الـ dataset المجموع"""
        class_counts = {v: 0 for v in self.classes.values()}
        for lbl_file in self.lbl_dir.glob("*.txt"):
            for line in lbl_file.read_text().strip().splitlines():
                parts = line.split()
                if parts:
                    cls_id = int(parts[0])
                    cls_name = self.classes.get(cls_id, "unknown")
                    class_counts[cls_name] = class_counts.get(cls_name, 0) + 1
        return {
            "total_images": self.saved_count,
            "class_counts": class_counts,
            "output_dir":   str(self.output_dir.resolve()),
            "yaml_path":    str(self.output_dir / "data.yaml"),
        }


# ───────────────────────────────────────────────
# Mock Detector - للاختبار بدون GPU/YOLO
# ───────────────────────────────────────────────
class MockYOLODetector:
    """
    محاكي للاكتشاف — يولّد صناديق عشوائية.
    استبدله بـ YOLODetector عند توفر النموذج.
    """
    def __init__(self, classes: dict, conf_thresh: float):
        self.classes     = classes
        self.conf_thresh = conf_thresh
        self._frame_n    = 0

    def detect(self, frame: np.ndarray) -> list:
        self._frame_n += 1
        if self._frame_n % 5 != 0:
            return []
        h, w = frame.shape[:2]
        detections = []
        n_det = np.random.randint(0, 4)
        for _ in range(n_det):
            cls_id = np.random.choice(list(self.classes.keys()))
            x1 = np.random.randint(0, w - 100)
            y1 = np.random.randint(0, h - 100)
            x2 = x1 + np.random.randint(60, 180)
            y2 = y1 + np.random.randint(40, 120)
            conf = np.random.uniform(self.conf_thresh, 1.0)
            detections.append({
                "class_id":   cls_id,
                "class_name": self.classes[cls_id],
                "confidence": round(conf, 3),
                "x1": min(x1, w-1), "y1": min(y1, h-1),
                "x2": min(x2, w-1), "y2": min(y2, h-1),
            })
        return detections


# ───────────────────────────────────────────────
# YOLO Detector - الكشف الحقيقي
# ───────────────────────────────────────────────
class YOLODetector:
    """
    كاشف YOLOv11 حقيقي.
    model_path: مسار ملف .pt أو .engine (TensorRT)
    """
    def __init__(self, model_path: str, classes: dict, conf_thresh: float):
        from ultralytics import YOLO
        print(f"[YOLO] تحميل النموذج: {model_path}")
        self.model       = YOLO(model_path)
        self.classes     = classes
        self.conf_thresh = conf_thresh

    def detect(self, frame: np.ndarray) -> list:
        results = self.model(frame,
                             conf=self.conf_thresh,
                             verbose=False)[0]
        detections = []
        for box in results.boxes:
            cls_id = int(box.cls[0])
            conf   = float(box.conf[0])
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            detections.append({
                "class_id":   cls_id,
                "class_name": self.classes.get(cls_id, f"cls_{cls_id}"),
                "confidence": round(conf, 3),
                "x1": x1, "y1": y1,
                "x2": x2, "y2": y2,
            })
        return detections


# ───────────────────────────────────────────────
# رسم صناديق الاكتشاف
# ───────────────────────────────────────────────
def draw_detections(frame: np.ndarray,
                    detections: list,
                    colors: dict) -> np.ndarray:
    for det in detections:
        x1, y1, x2, y2 = det["x1"], det["y1"], det["x2"], det["y2"]
        cls_id = det["class_id"]
        color  = colors.get(cls_id, (255, 255, 255))
        label  = f"{det['class_name']}  {det['confidence']:.2f}"

        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)
        cv2.rectangle(frame, (x1, y1 - th - 8), (x1 + tw + 6, y1), color, -1)
        cv2.putText(frame, label,
                    (x1 + 3, y1 - 4),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55,
                    (255, 255, 255), 1, cv2.LINE_AA)
    return frame


# ───────────────────────────────────────────────
# HUD - معلومات الشاشة
# ───────────────────────────────────────────────
def draw_hud(frame: np.ndarray,
             fps: float,
             saved: int,
             dp_score: float,
             det_count: int,
             mode: str) -> np.ndarray:
    h, w = frame.shape[:2]
    lines = [
        f"FPS: {fps:.1f}",
        f"Detections: {det_count}",
        f"DP Score: {dp_score:.2f}",
        f"Saved: {saved}",
        f"Mode: {mode}",
    ]
    y0 = 24
    for i, line in enumerate(lines):
        y = y0 + i * 22
        cv2.putText(frame, line,
                    (10, y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55,
                    (0, 0, 0), 3, cv2.LINE_AA)
        cv2.putText(frame, line,
                    (10, y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55,
                    (255, 255, 255), 1, cv2.LINE_AA)

    # تعليمات
    tips = "[S] Save  [D] DP Grid  [Q] Quit"
    cv2.putText(frame, tips,
                (10, h - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45,
                (0, 0, 0), 2, cv2.LINE_AA)
    cv2.putText(frame, tips,
                (10, h - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45,
                (180, 255, 180), 1, cv2.LINE_AA)
    return frame


# ───────────────────────────────────────────────
# الحلقة الرئيسية
# ───────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="Drone Visual Distortion Detection + DP Path Optimizer"
    )
    parser.add_argument("--source",  default="0",
        help="مصدر الفيديو: 0 (كاميرا), rtsp://..., أو مسار فيديو")
    parser.add_argument("--model",   default=None,
        help="مسار نموذج YOLOv11 .pt (اختياري)")
    parser.add_argument("--output",  default=CONFIG["output_dir"],
        help="مجلد حفظ الـ dataset")
    parser.add_argument("--conf",    default=CONFIG["confidence_threshold"],
        type=float, help="حد الثقة (0-1)")
    args = parser.parse_args()

    # ── فتح مصدر الفيديو ──
    source = int(args.source) if args.source.isdigit() else args.source
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        print(f"[ERROR] لا يمكن فتح المصدر: {args.source}")
        print("تأكد من توصيل الكاميرا أو صحة الـ RTSP URL")
        return

    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    print(f"[OK] تم فتح المصدر: {args.source}")

    # ── تحميل المكتبات ──
    if args.model and Path(args.model).exists():
        detector = YOLODetector(args.model, CONFIG["classes"], args.conf)
        mode = "YOLO"
    else:
        print("[INFO] لم يُحدد نموذج YOLO — تشغيل وضع المحاكاة (Mock)")
        detector = MockYOLODetector(CONFIG["classes"], args.conf)
        mode = "MOCK"

    planner   = DPPathPlanner(CONFIG["grid_size"])
    collector = RoboflowDatasetCollector(args.output, CONFIG["classes"])

    show_dp   = CONFIG["show_dp_grid"]
    frame_idx = 0
    dp_score  = 0.0
    prev_time = time.time()
    fps       = 0.0

    print("\n[START] النظام يعمل...")
    print("  [S] حفظ الإطار الحالي")
    print("  [D] إظهار/إخفاء شبكة DP")
    print("  [Q] إنهاء وتصدير الـ dataset\n")

    while True:
        ret, frame = cap.read()
        if not ret:
            print("[END] انتهى الفيديو أو انقطع الاتصال")
            break

        frame_idx += 1

        # ── حساب FPS ──
        now = time.time()
        fps = 0.9 * fps + 0.1 * (1.0 / max(now - prev_time, 1e-6))
        prev_time = now

        # ── الكشف ──
        detections = detector.detect(frame)

        # ── تحديث DP وحل المسار ──
        planner.update_grid(detections, frame.shape[1], frame.shape[0])
        dp_score = planner.solve()

        # ── رسم DP overlay ──
        if show_dp:
            frame = planner.draw_overlay(frame)

        # ── رسم صناديق الكشف ──
        frame = draw_detections(frame, detections, CONFIG["colors"])

        # ── HUD ──
        frame = draw_hud(frame, fps, collector.saved_count,
                         dp_score, len(detections), mode)

        # ── حفظ تلقائي عند وجود اكتشافات ──
        if (detections and
                frame_idx % CONFIG["save_every_n_frames"] == 0):
            collector.save_frame(frame, detections, frame_idx)

        # ── عرض الإطار ──
        cv2.imshow("Drone Visual Distortion Detection", frame)

        # ── التحكم بلوحة المفاتيح ──
        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            break
        elif key == ord('s'):
            name = collector.save_frame(frame, detections, frame_idx)
            print(f"[SAVED] {name}")
        elif key == ord('d'):
            show_dp = not show_dp
            print(f"[DP Grid] {'ON' if show_dp else 'OFF'}")

    # ── إنهاء وتصدير ──
    cap.release()
    cv2.destroyAllWindows()

    summary = collector.export_summary()
    print("\n" + "="*50)
    print("  ملخص الـ Dataset المُصدَّر")
    print("="*50)
    print(f"  إجمالي الصور:   {summary['total_images']}")
    print(f"  توزيع الفئات:")
    for cls, cnt in summary["class_counts"].items():
        print(f"    {cls:<22} {cnt}")
    print(f"  مجلد الحفظ:     {summary['output_dir']}")
    print(f"  ملف الإعداد:    {summary['yaml_path']}")
    print("="*50)
    print("\n[ROBOFLOW] خطوات الرفع:")
    print("  1. افتح roboflow.com وادخل على مشروعك TO-YOLO-FINAL")
    print("  2. Upload > اختر مجلد dataset/images")
    print("  3. Roboflow سيقرأ ملفات labels تلقائياً")
    print("  4. راجع التسميات ثم Add to Dataset\n")

    # حفظ ملخص JSON
    summary_path = Path(args.output) / "export_summary.json"
    summary_path.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2)
    )
    print(f"[JSON] ملخص محفوظ في: {summary_path}\n")


if __name__ == "__main__":
    main()
