@echo off
TITLE RoadGuard Full-Stack Service Launcher
echo ========================================================
echo RoadGuard: Feedback-Guided AI for Real-Time Road Damage
echo Detection and False-Positive Reduction
echo ========================================================
echo.

echo [1/2] Starting YOLOv5 FastAPI Road-Damage Microservice on Port 8000...
start "RoadGuard YOLOv5 Microservice (Port 8000)" cmd /k "cd /d %~dp0 && call .\yolov8_env\Scripts\activate && python yolo-service\app.py"

echo [2/2] Starting RoadGuard Web Application & Node Server on Port 3000...
start "RoadGuard Web & API Server (Port 3000)" cmd /k "cd /d %~dp0 && npm run dev"

echo.
echo ========================================================
echo Services launched!
echo - Web Application UI: http://localhost:3000
echo - YOLOv5 FastAPI Docs: http://127.0.0.1:8000/docs
echo - YOLOv5 Health Check: http://127.0.0.1:8000/health
echo ========================================================
pause
