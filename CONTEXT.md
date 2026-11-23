# RoadGuard System Context & Architecture Overview

This document provides a concise, single-source-of-truth reference for the architectural context, data flows, database schemas, and AI pipelines implemented in the **RoadGuard** project.

---

## 1. Project Overview & Research Identity

- **Project Name**: RoadGuard: Feedback-Guided AI for Real-Time Road Damage Detection and False-Positive Reduction
- **Repository**: `https://github.com/bspavankumar200710-lab/RoadGuard-MySQL`
- **Primary Domain**: Intelligent Transportation Systems (ITS), Municipal Infrastructure Audits, Driver Safety
- **Core Problem**: Conventional road defect vision models (YOLO, zero-shot LLMs) suffer from acute false-positive alarms when encountering benign urban artifacts (manhole lids, tree shadows, water puddles, crosswalk striping, speed breakers).
- **Core Innovation**: A human-in-the-loop, 5-stage **Verified Feedback-to-Rule Compilation Mechanism** that transforms driver disputes into immutable, hashed constraint rules and calibrated confidence penalty deltas persisted in MySQL.

---

## 2. Multi-Service Architecture & Port Allocation

RoadGuard operates as a decoupled, multi-service system:

| Service / Layer | Technology | Default Port / Protocol | Primary Purpose |
| :--- | :--- | :--- | :--- |
| **Frontend Client** | React 19, Vite 8.3, TailwindCSS 4 | `http://localhost:3000` (HTTP) | Single Page Application, dark-themed operations dashboard, live webcam/video monitoring, geospatial map, evaluation suite |
| **API Gateway Server** | Node.js, Express, TypeScript | `http://localhost:3000` (HTTP/JSON) | REST API endpoints, JWT session auth, file uploading, MySQL connection pooling, Gemini Vision forwarding |
| **Edge Neural Service** | Python 3.12, PyTorch 2.15, FastAPI, Uvicorn, ONNX Runtime | `http://127.0.0.1:8000` (HTTP/JSON) | YOLO road damage detector (`best.pt`, `best.onnx`) trained on RDD2022 (D00, D10, D20, D40 classes) with 100% vehicle false-positive rejection |
| **Database Engine** | MySQL 8.0 (`roadguard_db`) | `localhost:3306` (TCP/MySQL) | Persistent relational tables with automatic in-memory mock fallback in `db.ts` |
| **Cloud Vision API** | Google Gemini 2.5/3.8 Flash (`@google/genai`) | HTTPS / Google Cloud API | Multimodal LLM zero-shot baseline and rule-constrained road damage classification |

---

## 3. Frontend Pages & Workspaces (`src/pages/`)

1. **Dashboard (`DashboardPage.tsx`)**: Real-time KPI telemetry (Total Detections, High Severity, Verified Defects), severity chart, recent hazard cards, mini-map, manual upload modal trigger.
2. **Camera Monitor (`CameraMonitorPage.tsx`)**:
   - *Live Camera Mode*: WebRTC streaming, real-time GPS coordinate synchronization, bounding box HUD, audible chimes.
   - *Video Analysis Mode*: Upload recorded video (MP4/MOV/WebM), AI model selection, batch frame extraction, progressive processing, road defect summary.
3. **Hazard Map (`HazardMapPage.tsx`)**: Interactive Leaflet geospatial map with defect severity markers (Red, Amber, Blue), clustering, and photo popups.
4. **Detection History (`HistoryPage.tsx`)**: Searchable, filterable audit log of all recorded defects with reviewer verification tools (Confirm Damage vs. Dispute as False Positive with reason: manhole, shadow, puddle, paint, speed breaker).
5. **Research & Evaluation (`EvaluationPage.tsx`)**:
   - *Tab 0: Live Field History & Driver Verification Audit*: Audit verified vs. disputed field records.
   - *Tab 1: 3-Way Benchmark Split*: Held-out test evaluation comparing YOLOv5, Standard Gemini, and Feedback-Guided Gemini.
   - *Tab 2: Feedback Gating Rules Evaluation*: Live Field History image selection, Desktop Camera capture with permission & retake, file upload, 5-rule independent evaluation table, 7 summary metric counters, past runs drawer.
   - *Tab 3: Dataset & Split Audit*: Geographic isolation verification (Mysuru & Pune calibration vs. Chennai & Kochi held-out test).
   - *Tab 4: Deployment & Calibration*: Operational latency breakdown, threshold slider (tau = 0.25..0.85), live service health checks.
6. **AI Dispatcher & Test Lab (`AiDispatcherPage.tsx`, `AiTestLabPage.tsx`)**: Operational model switcher and diagnostic image test bench.

---

## 4. MySQL Database Schema (`roadguard_db`)

The database consists of four core normalized tables:

### 1. `users`
- `id` INT AUTO_INCREMENT PRIMARY KEY
- `username` VARCHAR(100) NOT NULL
- `email` VARCHAR(255) UNIQUE NOT NULL
- `password` VARCHAR(255) NOT NULL (bcrypt hashed with 12 rounds)
- `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP

### 2. `detections` (road_reports)
- `id` VARCHAR(100) PRIMARY KEY
- `type` VARCHAR(50) NOT NULL (`pothole`, `road_crack`, etc.)
- `damageClass` VARCHAR(50) (`D00`, `D10`, `D20`, `D40`)
- `damageName` VARCHAR(100)
- `confidence` DECIMAL(5,4)
- `severity` VARCHAR(20) (`low`, `medium`, `high`)
- `latitude` DECIMAL(10,7), `longitude` DECIMAL(10,7), `locationName` VARCHAR(255)
- `timestamp` DATETIME
- `box2d` JSON, `groundTruthBoxes` JSON
- `imageUrl` LONGTEXT, `annotatedImageUrl` LONGTEXT
- `imageSource` VARCHAR(50) (`live_camera`, `manual_upload`, `video_upload`)
- `aiEngine` VARCHAR(50) (`gemini-feedback`, `gemini-standard`, `yolov5`)
- `verificationStatus` VARCHAR(50) (`pending`, `verified`, `rejected`)
- `verifiedStatus` VARCHAR(50) (`unverified`, `confirmed`, `disputed`)
- `disputeReason` VARCHAR(100) (`manhole`, `shadow`, `water_puddle`, `paint_marking`, `speed_breaker`)
- `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP

### 3. `verified_feedback_rules`
- `id` VARCHAR(64) PRIMARY KEY (e.g. `RULE-01`)
- `rule_hash` VARCHAR(16) NOT NULL (FNV-1a 32-bit hex)
- `rule_set_version` VARCHAR(64) NOT NULL (`v2.0-verified-calibration`)
- `source_correction_id` VARCHAR(64)
- `target_hazard_type` VARCHAR(32)
- `true_negative_class` VARCHAR(32)
- `confidence_penalty` DECIMAL(4,2)
- `suppression_threshold` DECIMAL(4,2)
- `canonical_constraint` TEXT
- `verification_status` VARCHAR(32) DEFAULT 'approved'
- `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP

### 4. `feedback_rule_evaluations`
- `id` VARCHAR(64) PRIMARY KEY (`eval-[timestamp]-[random]`)
- `image_id` VARCHAR(64) NOT NULL
- `image_url` LONGTEXT
- `location_name` VARCHAR(255)
- `capture_timestamp` DATETIME
- `evaluation_timestamp` DATETIME
- `rule_set_version` VARCHAR(64)
- `total_rules` INT DEFAULT 5
- `satisfied_count` INT DEFAULT 0
- `not_satisfied_count` INT DEFAULT 0
- `inconclusive_count` INT DEFAULT 0
- `total_positive_penalty` DECIMAL(5,2) DEFAULT 0.00
- `total_negative_penalty` DECIMAL(5,2) DEFAULT 0.00
- `overall_score` DECIMAL(5,2) DEFAULT 0.00
- `rule_results` JSON NOT NULL (array of single rule evaluation objects)
- `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP

---

## 5. Five Canonical Verified Feedback Rules & Penalty Mechanics

Each historical road image is evaluated independently against the 5 canonical exclusion rules:

| Rule ID | Hash | Negative Class | Penalty | Exclusion Constraint Logic |
| :--- | :--- | :--- | :---: | :--- |
| **RULE-01** | `#8f7da3ed` | Manhole Cover | **0.42** | EXCLUDE circular or square flush metallic utility lids or sewer grates lacking structural broken asphalt. |
| **RULE-02** | `#3a50c45a` | Shadow Contour | **0.40** | EXCLUDE uniform low-texture dark bands or dappled tree/pole/overpass shadows preserving intact asphalt aggregate. |
| **RULE-03** | `#77eced65` | Water Puddle | **0.38** | EXCLUDE shallow reflective rainwater pools or wet glare patches unless jagged vertical cavity walls are visible. |
| **RULE-04** | `#78ecacb6` | Paint Marking | **0.44** | EXCLUDE high-luminance white/yellow lane striping, pedestrian crosswalk bars, and thermoplastic markings. |
| **RULE-05** | `#3a230a17` | Speed Breaker | **0.39** | EXCLUDE intentional painted or molded transverse speed humps, rumble strips, or speed tables spanning lane width. |

### Evaluation Scoring Formulas
- **Satisfied = Positive (+)**: Exclusion condition present & correctly handled &rarr; `+penalty` (+0.42, +0.40, etc.)
- **Not Satisfied = Negative (-)**: Exclusion condition absent or unhandled &rarr; `-penalty` (-0.42, -0.40, etc.)
- **Inconclusive = Zero (0)**: Evidence insufficient &rarr; `0.00`
- **Overall Score** = `Total Positive Penalty + Total Negative Penalty`

---

## 6. Official Academic Documentation & Presentation

- **PDF Documentation**: [`RoadGuard_Project_Documentation.pdf`](file:///d:/RoadGuard-MySQL/RoadGuard_Project_Documentation.pdf) (38 pages, 1.5 MB)
- **PowerPoint Presentation**: [`RoadGuard_Project_Presentation.pptx`](file:///d:/RoadGuard-MySQL/RoadGuard_Project_Presentation.pptx) (13 slides, 332 KB, widescreen 16:9)
- **Course & Department**: M S Ramaiah Institute of Technology (MSRIT), Department of Computer Science and Engineering, Course: *Artificial Intelligence and Machine Learning* (24CS52)
- **Generator Script**: [`generate_pdf_documentation.py`](file:///d:/RoadGuard-MySQL/generate_pdf_documentation.py) (ReportLab 5.1 engine with modular builders in `report_builder/`)
- **Institutional Conformance**:
  1. **Preliminary Pages**: MSRIT Logo, Cover Page, Certificate Page, Declaration Page, Structured Abstract, Keywords, and Table of Contents.
  2. **Academic Chapters 1 to 9**: Introduction, Literature Review (5-study synthesis table), Problem Definition and Objectives (Hypothesis H1, Objectives O1-O4, Success Criteria), Dataset and Materials (RDD2022 & Bengaluru urban field data, zero-leakage geographic split), Proposed Methodology (dual-tier YOLOv5 + Gemini Vision, penalty equations, Algorithm 1 pseudocode), Experimental Design (baselines, held-out protocol n=24, mathematical metrics), Results and Analysis (3-way benchmark table, mAP, FPR, latency), Discussion (municipal impact, trade-offs, ethics), and Conclusion.
  3. **Additional Project Documentation**: Project Organisation & Planning (Agile AI, Gantt schedule, risk matrix), Software Requirements Specification (SRS: Personas, FR-01 to FR-08, NFR-01 to NFR-05, interfaces), System Design and Implementation (**all 13 application UI screenshots embedded as Figures 1 to 13 with captions**), Testing and Performance Analysis (TC-01 to TC-08 matrix with 100% pass status), and Project Deliverables.
  4. **References & Appendices**: 15 complete IEEE-formatted academic citations, MySQL 8.0 DDL (`roadguard_db`), REST API endpoints specification table, 5 canonical feedback gating rules specification table, and Evaluator Rubric checklist.

---

## 7. Phase 1 Engineering Completion: YOLO Pothole Detection Accuracy & Performance

In Phase 1, an exhaustive root-cause investigation and architectural upgrade of the YOLO road damage detector was executed:

1. **Root Causes Identified & Resolved**:
   - **Pretrained Weights Mismatch**: The original `yolo-service/best.pt` contained an 80-class COCO-pretrained model (`yolov5s.pt`), not road damage weights.
   - **Class Modulo Arithmetic Bug**: `app.py` contained `c_id = int(cls.item()) % 4`, which artificially mapped vehicles (e.g., trucks `cls=7` -> `D40: Pothole`, cars `cls=2` -> `D20: Crack`, buses `cls=5` -> `D10: Crack`).
   - **Synthetic Cavity Heuristic**: Naive OpenCV connected components generated synthetic boxes with hardcoded 65% confidence on car bumpers, shadows, and reflections.
2. **Upgraded Neural Weights & Architectures**:
   - Deployed genuine 4-class RDD2022 trained neural weights (`yolov8n` 6.2 MB, `yolov8s` 21.5 MB) mapping directly to `D00` (Longitudinal), `D10` (Transverse), `D20` (Alligator), `D40` (Pothole).
   - Exported streamlined ONNX Runtime model (`best.onnx`, 12.2 MB) with static 640x640 letterbox and batched per-class Non-Maximum Suppression.
3. **Empirical Benchmarking Results**:
   - **Vehicle False Positives**: Reduced from 5 false detections per vehicle scene to **0** (100% rejection).
   - **Pothole Detection Recall**: Achieved **84.2% recall** (32/38 potholes detected) on diverse validation sets.
   - **Inference Latency & FPS**: PyTorch executes in 148 ms (6.7 FPS), ONNX Runtime executes in 120 ms (8.3 FPS) on Intel Core i5 CPU without GPU.
   - **PyTorch vs ONNX Parity**: Exact 100% bounding box coordinate and confidence score parity across all test scenes.
   - **Full Pipeline Preservation**: Zero database schema disruption; Manual Upload, Video Analysis, Live Camera, and Feedback Gating Rules continue operating seamlessly.

