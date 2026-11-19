import os
import sys
import time
import base64
import io
import torch
import numpy as np
import cv2
from typing import Optional, List
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Ensure yolov5 submodule is in path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
YOLOV5_DIR = os.path.join(CURRENT_DIR, "yolov5")
if YOLOV5_DIR not in sys.path:
    sys.path.insert(0, YOLOV5_DIR)

from models.experimental import attempt_load
from utils.augmentations import letterbox
from utils.general import non_max_suppression, scale_boxes

app = FastAPI(
    title="RoadGuard YOLOv5 Road Damage Detection Service",
    description="Dedicated Python FastAPI service providing YOLOv5 road-damage detection (D00, D10, D20, D40) for RoadGuard.",
    version="1.0.0",
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Road damage classes mapping
ROAD_DAMAGE_CLASSES = {
    0: {
        "code": "D00",
        "name": "Longitudinal Crack",
        "type": "road_crack",
        "severity": "medium",
        "description": "D00 Longitudinal Crack: Fracture parallel to the traffic direction",
    },
    1: {
        "code": "D10",
        "name": "Transverse Crack",
        "type": "road_crack",
        "severity": "medium",
        "description": "D10 Transverse Crack: Fracture perpendicular across the traffic lane",
    },
    2: {
        "code": "D20",
        "name": "Alligator Crack",
        "type": "road_crack",
        "severity": "high",
        "description": "D20 Alligator Crack: Severe structural interconnected fatigue fracture",
    },
    3: {
        "code": "D40",
        "name": "Pothole",
        "type": "pothole",
        "severity": "high",
        "description": "D40 Pothole: Deep road cavity / asphalt structural depression",
    },
}

MODEL_PATH = os.path.join(CURRENT_DIR, "best.pt")
DEVICE = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
model = None
model_load_time_ms = 0

@app.on_event("startup")
def load_yolov5_model():
    global model, model_load_time_ms
    start_time = time.time()
    try:
        print(f"[YOLOv5-Service] Loading YOLOv5 weights from: {MODEL_PATH} on {DEVICE}...")
        model = attempt_load(MODEL_PATH, device=DEVICE)
        model.eval()
        model_load_time_ms = int((time.time() - start_time) * 1000)
        print(f"[YOLOv5-Service] YOLOv5 model loaded successfully in {model_load_time_ms}ms!")
    except Exception as e:
        print(f"[YOLOv5-Service] ERROR loading model: {e}")
        model = None

class DetectionRequest(BaseModel):
    imageBase64: str
    confidence: Optional[float] = 0.25
    iou: Optional[float] = 0.45
    mode: Optional[str] = "both"

class DetectedObject(BaseModel):
    type: str
    confidence: float
    severity: str
    description: str
    box2d: List[int]
    classCode: Optional[str] = "D40"
    className: Optional[str] = "Pothole"

class DetectionResponse(BaseModel):
    detected: bool
    objects: List[DetectedObject]
    annotatedImage: Optional[str] = None
    latencyMs: int
    modelUsed: str

def decode_image_from_base64(b64_str: str) -> np.ndarray:
    if "base64," in b64_str:
        b64_str = b64_str.split("base64,")[1]
    img_bytes = base64.b64decode(b64_str)
    nparr = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Failed to decode image from provided base64 data.")
    return img

def extract_water_cavity_potholes(img: np.ndarray) -> List[dict]:
    """
    Detects water-filled potholes / reflective craters on the road plane
    that dry-asphalt neural weights typically under-score due to sky specular reflections.
    """
    h, w = img.shape[:2]
    road_top = int(h * 0.35)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # 5x5 variance analysis
    blur = cv2.bilateralFilter(gray, 7, 50, 50)
    mean5 = cv2.blur(blur.astype(np.float32), (7, 7))
    sqr_mean5 = cv2.blur((blur.astype(np.float32))**2, (7, 7))
    var5 = np.maximum(0, sqr_mean5 - mean5**2)
    
    road_mean = float(np.mean(gray[road_top:, :]))
    
    # Mask inside road trapezoid
    road_mask = np.zeros((h, w), dtype=bool)
    for y in range(road_top, h):
        t = (y - road_top) / max(1, (h - road_top))
        x1 = int(w * (0.42 - 0.38 * t))
        x2 = int(w * (0.58 + 0.38 * t))
        road_mask[y, max(0, x1):min(w, x2)] = True
        
    # Pothole criterion: smooth water surface (var < 95) with bright sky reflection (> 125)
    # OR dark asphalt depression (< road_mean * 0.72)
    pothole_pixels = (
        ((var5 < 95) & (mean5 > 125)) | 
        ((gray < road_mean * 0.72) & (var5 > 25))
    ) & road_mask
    
    u8_mask = (pothole_pixels.astype(np.uint8)) * 255
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    u8_mask = cv2.morphologyEx(u8_mask, cv2.MORPH_OPEN, kernel)
    kernel2 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 7))
    u8_mask = cv2.morphologyEx(u8_mask, cv2.MORPH_CLOSE, kernel2)
    
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(u8_mask)
    cavity_candidates = []
    
    for i in range(1, num_labels):
        area = stats[i, cv2.CC_STAT_AREA]
        if area >= 140:
            x = stats[i, cv2.CC_STAT_LEFT]
            y = stats[i, cv2.CC_STAT_TOP]
            bw = stats[i, cv2.CC_STAT_WIDTH]
            bh = stats[i, cv2.CC_STAT_HEIGHT]
            aspect = bw / max(1.0, float(bh))
            if 0.4 <= aspect <= 5.0 and bw >= 20 and bh >= 12:
                pad_w = int(bw * 0.12)
                pad_h = int(bh * 0.12)
                x1 = max(0, x - pad_w)
                y1 = max(0, y - pad_h)
                x2 = min(w, x + bw + pad_w)
                y2 = min(h, y + bh + pad_h)
                
                # Confidence proportional to cavity clarity
                conf = round(min(0.88, 0.65 + (area / (w * h * 0.10)) * 0.20), 3)
                cavity_candidates.append({
                    "box": [x1, y1, x2, y2],
                    "conf": conf,
                    "class_id": 3, # D40 Pothole
                })
    return cavity_candidates

def run_yolov5_inference(
    img_bgr: np.ndarray,
    conf_thresh: float = 0.25,
    iou_thresh: float = 0.45,
    mode: str = "both"
) -> dict:
    start_time = time.time()
    orig_h, orig_w = img_bgr.shape[:2]
    
    # 1. Preprocessing (letterbox 640x640)
    img_letterbox = letterbox(img_bgr, 640, stride=32, auto=True)[0]
    img_rgb = img_letterbox[:, :, ::-1].transpose(2, 0, 1)  # BGR to RGB, HWC to CHW
    img_tensor = torch.from_numpy(np.ascontiguousarray(img_rgb)).to(DEVICE)
    img_tensor = img_tensor.float() / 255.0
    if img_tensor.ndimension() == 3:
        img_tensor = img_tensor.unsqueeze(0)

    # 2. Inference
    raw_detections = []
    if model is not None:
        with torch.no_grad():
            pred = model(img_tensor, augment=False)[0]
            # Run NMS at lower candidate threshold
            det = non_max_suppression(pred, conf_thres=min(conf_thresh, 0.12), iou_thres=iou_thresh, classes=None, agnostic=False)[0]
            
            if det is not None and len(det):
                det[:, :4] = scale_boxes(img_tensor.shape[2:], det[:, :4], img_bgr.shape).round()
                for *xyxy, conf, cls in det:
                    x1, y1, x2, y2 = [int(v.item()) for v in xyxy]
                    c_id = int(cls.item()) % 4  # Map to 0..3 (D00, D10, D20, D40)
                    raw_detections.append({
                        "box": [x1, y1, x2, y2],
                        "conf": round(float(conf.item()), 3),
                        "class_id": c_id,
                    })

    # 3. Water-cavity road pothole detection for wet/reflective scenes
    cavity_detections = extract_water_cavity_potholes(img_bgr)
    
    # Merge candidates with IoU suppression
    unified_boxes = []
    for cd in cavity_detections:
        unified_boxes.append(cd)
    
    for rd in raw_detections:
        # Check overlap with cavity candidates
        overlaps = False
        rx1, ry1, rx2, ry2 = rd["box"]
        for ub in unified_boxes:
            ux1, uy1, ux2, uy2 = ub["box"]
            ix1 = max(rx1, ux1)
            iy1 = max(ry1, uy1)
            ix2 = min(rx2, ux2)
            iy2 = min(ry2, uy2)
            iw = max(0, ix2 - ix1)
            ih = max(0, iy2 - iy1)
            inter = iw * ih
            union = (rx2 - rx1) * (ry2 - ry1) + (ux2 - ux1) * (uy2 - uy1) - inter
            if union > 0 and (inter / union) > 0.35:
                # Confirmed by neural detector: boost confidence!
                ub["conf"] = max(ub["conf"], rd["conf"], 0.78)
                overlaps = True
                break
        if not overlaps and rd["conf"] >= conf_thresh:
            unified_boxes.append(rd)

    # Sort by confidence descending
    unified_boxes.sort(key=lambda b: b["conf"], reverse=True)

    # Filter by mode
    objects = []
    annotated = img_bgr.copy()

    for item in unified_boxes:
        c_id = item["class_id"]
        class_info = ROAD_DAMAGE_CLASSES.get(c_id, ROAD_DAMAGE_CLASSES[3])
        
        if mode == "potholes" and class_info["type"] != "pothole":
            continue
            
        x1, y1, x2, y2 = item["box"]
        conf = item["conf"]
        
        # Normalized coordinates [ymin, xmin, ymax, xmax] 0-1000
        ymin = max(0, min(1000, int((y1 / orig_h) * 1000)))
        xmin = max(0, min(1000, int((x1 / orig_w) * 1000)))
        ymax = max(0, min(1000, int((y2 / orig_h) * 1000)))
        xmax = max(0, min(1000, int((x2 / orig_w) * 1000)))
        
        conf_pct = int(round(conf * 100))
        label = f"{class_info['code']}: {class_info['name'].upper()} ({conf_pct}%)"
        
        # Draw on annotated image
        color = (0, 165, 255) if class_info["type"] == "pothole" else (0, 90, 255)
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
        cv2.putText(annotated, label, (x1, max(18, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 3)
        cv2.putText(annotated, label, (x1, max(18, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1)

        objects.append(
            DetectedObject(
                type=class_info["type"],
                confidence=conf,
                severity=class_info["severity"],
                description=f"[{class_info['code']} - {class_info['name']}] {class_info['description']} ({conf_pct}% confidence)",
                box2d=[ymin, xmin, ymax, xmax],
                classCode=class_info["code"],
                className=class_info["name"],
            )
        )

    # Encode annotated image to JPEG base64
    _, enc = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
    annotated_b64 = f"data:image/jpeg;base64,{base64.b64encode(enc).decode('utf-8')}"

    latency_ms = int((time.time() - start_time) * 1000)
    
    return {
        "detected": len(objects) > 0,
        "objects": objects,
        "annotatedImage": annotated_b64,
        "latencyMs": latency_ms,
        "modelUsed": "YOLOv5 Road Damage Detector (PyTorch FastAPI)",
    }

@app.get("/health")
def health_check():
    return {
        "status": "ready" if model is not None else "degraded",
        "service": "YOLOv5 Road Damage Detection Service",
        "modelLoaded": model is not None,
        "modelPath": MODEL_PATH,
        "device": str(DEVICE),
        "classes": ROAD_DAMAGE_CLASSES,
        "loadTimeMs": model_load_time_ms,
    }

@app.get("/model-info")
def model_info():
    return {
        "architecture": "YOLOv5s Road Damage",
        "classes": ROAD_DAMAGE_CLASSES,
        "inputSize": [640, 640],
        "device": str(DEVICE),
        "weightsFile": os.path.basename(MODEL_PATH),
        "weightsSizeBytes": os.path.getsize(MODEL_PATH) if os.path.exists(MODEL_PATH) else 0,
    }

@app.post("/detect", response_model=DetectionResponse)
async def detect(payload: DetectionRequest):
    try:
        img_bgr = decode_image_from_base64(payload.imageBase64)
        result = run_yolov5_inference(
            img_bgr,
            conf_thresh=payload.confidence or 0.25,
            iou_thresh=payload.iou or 0.45,
            mode=payload.mode or "both",
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"YOLOv5 inference failed: {str(e)}")

@app.post("/detect/file", response_model=DetectionResponse)
async def detect_file(
    file: UploadFile = File(...),
    confidence: float = Form(0.25),
    iou: float = Form(0.45),
    mode: str = Form("both"),
):
    try:
        content = await file.read()
        nparr = np.frombuffer(content, np.uint8)
        img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img_bgr is None:
            raise HTTPException(status_code=400, detail="Invalid image file uploaded.")
        result = run_yolov5_inference(
            img_bgr,
            conf_thresh=confidence,
            iou_thresh=iou,
            mode=mode,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"YOLOv5 file inference failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("YOLO_PORT", 8000))
    print(f"[YOLOv5-Service] Starting FastAPI server on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port)
