# مشروع رصد التشوه البصري بالدرون والذكاء الاصطناعي
### Drone Visual Distortion Detection + DP Path Optimizer

---

## التثبيت

```bash
pip install -r requirements.txt
```

---

## طرق التشغيل

```bash
# كاميرا الجهاز (ويب كام)
python detect_and_collect.py

# كاميرا رقم محدد
python detect_and_collect.py --source 0

# بث RTSP من الدرون (DJI Mavic/Matrice)
python detect_and_collect.py --source rtsp://192.168.1.1:554/live

# فيديو مسجل
python detect_and_collect.py --source flight_video.mp4

# مع نموذج YOLOv11 حقيقي
python detect_and_collect.py --source 0 --model best.pt --conf 0.45
```

---

## أزرار التحكم أثناء التشغيل

| المفتاح | الوظيفة |
|---------|---------|
| `S`     | حفظ الإطار الحالي فوراً |
| `D`     | إظهار / إخفاء شبكة DP |
| `Q`     | إنهاء وتصدير الـ Dataset |

---

## مخرجات الكود

```
dataset/
├── images/          ← صور JPEG للتدريب
├── labels/          ← ملفات YOLO .txt (class cx cy w h)
├── data.yaml        ← ملف إعداد Roboflow/YOLOv11
└── export_summary.json
```

---

## رفع Dataset على Roboflow

1. افتح [roboflow.com](https://roboflow.com) وادخل مشروعك **TO-YOLO-FINAL**
2. **Upload** ← اختر مجلد `dataset/images`
3. Roboflow يقرأ ملفات `labels/` تلقائياً لأنها بنفس الاسم
4. راجع التسميات ← **Add to Dataset**
5. أعد التدريب من **Train** أو صدّر الـ Dataset لـ Google Colab

---

## خوارزمية DP - الفكرة

```
الشبكة N×N تمثل مناطق الصورة
كل خلية = درجة خطورة التشوه (من YOLO)

dp[i][j] = grid[i][j] + max(dp[i-1][j], dp[i][j-1])

المسار الأمثل = أعلى تجميع للتشوه من (0,0) إلى (N-1,N-1)
التعقيد: O(N²) زمن، O(N²) مساحة
```

---

## فئات التشوه

| ID | الفئة | الوصف |
|----|-------|-------|
| 0  | graffiti | كتابة على الجدران |
| 1  | crack | تصدعات وشقوق |
| 2  | structural_damage | أضرار إنشائية |
| 3  | stain | بقع وتلوث بصري |

> عدّل فئات `CONFIG["classes"]` في الكود لتطابق dataset حقتك في Roboflow

---

## للعمل مع RTSP الدرون (DJI)

```bash
# DJI Mavic / Air - تفعيل البث أولاً من تطبيق DJI Fly
python detect_and_collect.py --source rtsp://192.168.10.1:554/live

# DJI Matrice مع SDK
python detect_and_collect.py --source rtsp://192.168.1.119/stream
```
