# RoadGuard – Real-Time Traffic & Pothole Monitor

RoadGuard is a mobile-first, full-stack road safety web application designed for smartphones mounted on a car dashboard. It continuously monitors the road ahead using the device camera, detects potholes, road cracks, and damaged road signs using Google Gemini AI Vision, tags each hazard with real-time GPS coordinates, and plots them on a live interactive map.

---

## 🚀 Key Features

1. **Dashboard Overview**
   - High-level road health metrics: Total detections, potholes, road cracks, broken road signs, and today's logged issues.
   - Severity breakdowns (Low, Medium, High) with interactive distribution charts.
   - Recent detections feed with one-touch "View on Map".

2. **Live Camera Road Monitor (Dashboard Mount)**
   - Designed for hands-free smartphone car mounts.
   - Uses device camera (`facingMode: 'environment'` preferred).
   - Periodic frame capture (1–2s intervals) to optimize AI vision inference.
   - On-screen hazard overlay badges (e.g. *POTHOLE DETECTED - Confidence 94% - Severity HIGH*).
   - Real-time GPS coordinates and connection status telemetry.
   - Audible hazard alert chimes via Web Audio API.

3. **Live Interactive Hazard Map**
   - Powered by Google Maps Platform JavaScript API (`@googlemaps/js-api-loader`).
   - Live Google Maps real-time Traffic layer toggle (`google.maps.TrafficLayer`) for live traffic conditions.
   - Switch between Roadmap view and Satellite/Hybrid view.
   - Custom color-coded vector pins for Potholes (red), Road Cracks (amber), and Broken Signs (purple).
   - Real-time Current Location marker with "Center on My Location" action.
   - Category filtering: `[All]`, `[Potholes]`, `[Road Cracks]`, `[Broken Signs]`.
   - Rich interactive detail cards with snapshot thumbnails, coordinates, confidence %, severity, and time.

4. **Detection History & Management**
   - Full history log with thumbnails, confidence scores, and date/time.
   - Sort by Newest, Oldest, or Highest Severity.
   - Filter by hazard category or search by description.
   - Export detection records to JSON.
   - Individual deletion or bulk database reset.

5. **Demo Test Mode (Development & Desktop Testing)**
   - Test road hazard analysis without needing a physical camera or live driving.
   - Includes sample road conditions: Deep asphalt pothole, road surface crack, damaged speed limit sign, and clean smooth highway (negative control).
   - Supports custom image upload from device storage.
   - Runs real AI vision inference via Gemini Vision and geotags results to the live map.

---

## 🛠️ Architecture & Modularity

- **AI Detection Layer (`src/services/aiDetectionService.ts`)**:
  - `IAIDetectionService`: Common contract separating model backends from the UI.
  - `GeminiDetectionService`: Active server-proxied implementation utilizing `@google/genai` with model `gemini-3.8-flash`.
  - `YOLOv8DetectionService`: Pre-configured architecture stub for future on-device edge deployment with ONNX Runtime Web.
- **Location Service (`src/services/locationService.ts`)**:
  - Browser Geolocation API wrapper with continuous watch, accuracy filtering, and simulated GPS trajectory for testing.
- **Data Persistence (`src/services/detectionService.ts`)**:
  - Full-stack synchronization with Express REST endpoints (`/api/detections`) and automatic `localStorage` offline fallback.

---

## ⚙️ Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# GEMINI_API_KEY: Required for Gemini Vision image analysis.
# In Google AI Studio, this is injected automatically from Secrets.
GEMINI_API_KEY="your_api_key_here"

# PORT: (Default: 3000)
PORT=3000
```

---

## 🏃 Running the Application

### Development:
```bash
npm run dev
```
Starts the full-stack Express server on `http://localhost:3000` with Vite middleware.

### Production Build:
```bash
npm run build
npm start
```

---

## 🛡️ Road Safety Warning

**Do not interact with the phone while driving.**
RoadGuard is designed to operate completely hands-free after mounting and pressing "Start Monitoring". Hazard warnings are signaled via audible audio chimes.
