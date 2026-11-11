import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  RoadHazardRecord,
  DetectedObject,
  GPSStatus,
  CameraStatus,
  HazardType,
  SeverityLevel,
  DetectionMode,
} from '../types/detection';
import { geminiDetectionService } from '../services/geminiDetectionService';
import { yoloV8DetectionService } from '../services/yoloV8DetectionService';
import { detectorRegistry } from '../services/detectorRegistry';
import { SupportedDetectorModel } from '../services/aiDetectionService';
import { locationService, LocationCoordinates } from '../services/locationService';
import { detectionService } from '../services/detectionService';
import { audioAlertService } from '../services/audioAlertService';
import { agentLearningService, LearnedCorrection } from '../services/agentLearningService';
import { imageStorageService } from '../services/imageStorageService';
import { useAuth } from '../contexts/AuthContext';
import {
  Camera,
  CameraOff,
  Navigation,
  AlertTriangle,
  Volume2,
  VolumeX,
  RefreshCw,
  Zap,
  ShieldAlert,
  Flame,
  CheckCircle2,
  AlertCircle,
  Eye,
  Radio,
  Mic,
  Database,
  Flashlight,
  FlashlightOff,
  Gauge,
  Layers,
  Car,
  Maximize2,
  Brain,
  ThumbsDown,
  Sparkles,
  X,
  FileText,
  Cpu,
} from 'lucide-react';
import { driveSessionService, DriveSummary } from '../services/driveSessionService';

interface MonitorPageProps {
  isMonitoring: boolean;
  onToggleMonitoring: (start: boolean) => void;
  onOpenDemo: () => void;
  onViewSummary?: () => void;
  lastSummary?: DriveSummary | null;
}

export const MonitorPage: React.FC<MonitorPageProps> = ({
  isMonitoring,
  onToggleMonitoring,
  onOpenDemo,
  onViewSummary,
  lastSummary,
}) => {
  const { userProfile, updatePreferredMode } = useAuth();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureTimerRef = useRef<any>(null);

  // Status & Device States
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(true);
  const [flashlightOn, setFlashlightOn] = useState<boolean>(false);
  const [flashlightSupported, setFlashlightSupported] = useState<boolean>(false);

  // Detection Target Mode: 'both' | 'potholes' | 'speed'
  const [detectionMode, setDetectionMode] = useState<DetectionMode>(
    userProfile?.preferredMode || 'both'
  );

  // GPS State
  const [gpsCoords, setGpsCoords] = useState<LocationCoordinates | null>(null);
  const [gpsStatus, setGpsStatus] = useState<GPSStatus>('prompt');
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Detection Run States
  const [detectionCount, setDetectionCount] = useState<number>(() => detectionService.getStats().total);
  const [currentDetections, setCurrentDetections] = useState<DetectedObject[]>([]);
  const [latestSavedRecord, setLatestSavedRecord] = useState<RoadHazardRecord | null>(null);
  const [trainTarget, setTrainTarget] = useState<RoadHazardRecord | null>(null);
  const [trainCategory, setTrainCategory] = useState<LearnedCorrection['actualCategory']>('manhole');
  const [learnedCount, setLearnedCount] = useState<number>(() => agentLearningService.getAll().length);
  const [isAnalyzingFrame, setIsAnalyzingFrame] = useState<boolean>(false);
  const [lastFrameTime, setLastFrameTime] = useState<number | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [realtimeNotification, setRealtimeNotification] = useState<string | null>(null);

  // AI Detector Engine State: 'yolov8-nano' | 'gemini-vision'
  const [activeDetectorId, setActiveDetectorId] = useState<SupportedDetectorModel>(() =>
    detectorRegistry.getActiveDetectorId()
  );
  const [yoloStatus, setYoloStatus] = useState(() => yoloV8DetectionService.getStatus());

  // Listen to detector switches across the app
  useEffect(() => {
    const unsub = detectorRegistry.subscribe(() => {
      setActiveDetectorId(detectorRegistry.getActiveDetectorId());
      setYoloStatus(yoloV8DetectionService.getStatus());
    });
    return unsub;
  }, []);

  // Poll YOLOv8 status while loading
  useEffect(() => {
    const interval = setInterval(() => {
      setYoloStatus(yoloV8DetectionService.getStatus());
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  // Load YOLOv8 model if it's the active detector and not yet ready
  useEffect(() => {
    if (activeDetectorId === 'yolov8-nano' && !yoloV8DetectionService.isReady) {
      yoloV8DetectionService
        .loadModel()
        .then(() => {
          setYoloStatus(yoloV8DetectionService.getStatus());
        })
        .catch((err) => {
          setYoloStatus(yoloV8DetectionService.getStatus());
          setAnalysisError(`YOLOv8 Load: ${err.message}`);
        });
    }
  }, [activeDetectorId]);

  const handleDetectorChange = (newDetector: SupportedDetectorModel) => {
    detectorRegistry.setActiveDetector(newDetector);
    setActiveDetectorId(newDetector);
    setAnalysisError(null);
    if (newDetector === 'yolov8-nano' && !yoloV8DetectionService.isReady) {
      yoloV8DetectionService
        .loadModel()
        .then(() => {
          setYoloStatus(yoloV8DetectionService.getStatus());
        })
        .catch((err) => {
          setYoloStatus(yoloV8DetectionService.getStatus());
          setAnalysisError(`YOLOv8 Model Load Error: ${err.message}`);
        });
    }
  };

  // Sync mode with user preference
  useEffect(() => {
    if (userProfile?.preferredMode && userProfile.preferredMode !== detectionMode) {
      setDetectionMode(userProfile.preferredMode);
    }
  }, [userProfile?.preferredMode]);

  const handleModeChange = (newMode: DetectionMode) => {
    setDetectionMode(newMode);
    updatePreferredMode(newMode).catch(() => {});
  };

  const showNotification = (msg: string) => {
    setRealtimeNotification(msg);
    setTimeout(() => {
      setRealtimeNotification((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  // Subscribe to GPS location updates
  useEffect(() => {
    const unsubscribe = locationService.subscribe((coords, status, errorMsg) => {
      setGpsCoords(coords);
      setGpsStatus(status);
      setGpsError(errorMsg || null);
      if (coords && isMonitoring) {
        driveSessionService.recordCoordinate(coords);
      }
    });
    return unsubscribe;
  }, [isMonitoring]);

  // Update detection count on changes
  useEffect(() => {
    const updateStats = (records: RoadHazardRecord[]) => {
      setDetectionCount(records.length);
      if (records.length > 0 && !latestSavedRecord) {
        setLatestSavedRecord(records[0]);
      }
    };
    const unsub = detectionService.subscribe(updateStats);
    return unsub;
  }, [latestSavedRecord]);

  // Handle camera start/stop
  const startCamera = useCallback(async () => {
    try {
      setCameraStatus('requesting');
      setCameraError(null);

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API is not supported in this browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        try {
          const capabilities = (videoTrack.getCapabilities ? videoTrack.getCapabilities() : {}) as any;
          if (capabilities && 'torch' in capabilities) {
            setFlashlightSupported(true);
          } else {
            setFlashlightSupported(true);
          }
        } catch {
          setFlashlightSupported(true);
        }
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraStatus('active');
    } catch (err: any) {
      console.warn('Camera access denied or error:', err);
      setCameraStatus('denied');
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera permission was denied. Please allow camera access in your browser settings.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('No video camera was detected on this device.');
      } else {
        setCameraError(err.message || 'Unable to access camera.');
      }
    }
  }, [facingMode]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (videoTrack && videoTrack.readyState === 'live') {
        try {
          (videoTrack as any).applyConstraints({ advanced: [{ torch: false }] });
        } catch {}
      }
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setFlashlightOn(false);
    setCameraStatus('idle');
  }, []);

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  useEffect(() => {
    if (cameraStatus === 'active' || isMonitoring) {
      startCamera();
    }
  }, [facingMode]);

  useEffect(() => {
    if (isMonitoring) {
      startCamera();
      locationService.startTracking();
    } else {
      if (captureTimerRef.current) {
        clearTimeout(captureTimerRef.current);
        captureTimerRef.current = null;
      }
      stopCamera();
    }
    return () => {
      if (captureTimerRef.current) {
        clearTimeout(captureTimerRef.current);
      }
    };
  }, [isMonitoring, startCamera, stopCamera]);

  // Frame Capture and AI Processing Loop
  const captureAndAnalyzeFrame = useCallback(async () => {
    if (!isMonitoring || isAnalyzingFrame || !videoRef.current || videoRef.current.readyState < 2) {
      return;
    }

    try {
      setIsAnalyzingFrame(true);
      setAnalysisError(null);

      const video = videoRef.current;
      const canvas = canvasRef.current || document.createElement('canvas');
      canvas.width = 720; // High resolution frame for high-precision pothole & car speed analysis
      canvas.height = 480;
      const ctx = canvas.getContext('2d');

      if (!ctx) return;

      // Draw high resolution frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageBase64 = canvas.toDataURL('image/jpeg', 0.88);

      setLastFrameTime(Date.now());

      // Query active detector model (YOLOv8-nano ONNX Edge or Gemini Flash Vision)
      const activeDetector = detectorRegistry.getActiveDetector();
      const result = await activeDetector.detectRoadProblems(imageBase64, 'image/jpeg', detectionMode);

      if (result.detected && result.objects.length > 0) {
        setCurrentDetections(result.objects);

        for (const obj of result.objects) {
          // Suppress if matches learned mistake rule
          if (agentLearningService.isSuppressed(obj.type, obj.description)) {
            continue;
          }

          const lat = gpsCoords?.latitude || null;
          const lng = gpsCoords?.longitude || null;
          const locationHint = lat && lng ? `${lat.toFixed(4)}°, ${lng.toFixed(4)}°` : 'Current location';

          const damageClass = imageStorageService.extractDamageClass(obj);
          const damageName = imageStorageService.resolveDamageName(damageClass, obj.type);

          // Duplicate detection suppression: prevent repeated reports for the same damage in live video
          const isDuplicate = imageStorageService.isDuplicateDetection(
            obj.type,
            damageClass,
            lat,
            lng,
            obj.box2d
          );

          if (isDuplicate) {
            // Still provide brief audio/chime if speed changed, but avoid spamming Storage
            continue;
          }

          // Spoken voice announcement & Audio alerts
          if (soundEnabled) {
            if (obj.type === 'vehicle_speed') {
              audioAlertService.announceDetection(
                'vehicle_speed',
                obj.severity,
                `${obj.vehicleType || 'vehicle'} at ${obj.estimatedSpeedKmh || 50} km/h`
              );
            } else {
              audioAlertService.announceDetection(obj.type, obj.severity, locationHint);
            }
          }

          // Persistent Database Storage ( Storage original + annotated + Cloud MySQL)
          const record = await detectionService.addDetection({
            type: obj.type,
            damageClass,
            damageName,
            confidence: obj.confidence,
            severity: obj.severity,
            description: obj.description,
            latitude: lat,
            longitude: lng,
            locationName: locationHint,
            imageUrl: imageBase64,
            imageSource: 'live_camera',
            aiEngine: activeDetectorId,
            verificationStatus: 'pending',
            box2d: obj.box2d,
            vehicleType: obj.vehicleType,
            estimatedSpeedKmh: obj.estimatedSpeedKmh,
            speedLimitKmh: obj.speedLimitKmh,
            isOverSpeed: obj.isOverSpeed,
          });

          setLatestSavedRecord(record);
          driveSessionService.addHazardToSession(record);

          // Toast banner notification
          if (obj.type === 'vehicle_speed') {
            showNotification(`🏎️ ${damageName} (${damageClass}) • Cloud Photo Saved`);
          } else {
            showNotification(`🚨 ${damageClass}: ${damageName} at ${locationHint} • Cloud Report Saved`);
          }
        }
      } else {
        setCurrentDetections([]);
      }
    } catch (err: any) {
      console.warn('Frame processing cycle error:', err);
      setAnalysisError(err?.message || 'Frame analysis cycle failed');
    } finally {
      setIsAnalyzingFrame(false);

      if (isMonitoring) {
        captureTimerRef.current = setTimeout(captureAndAnalyzeFrame, 1400);
      }
    }
  }, [isMonitoring, isAnalyzingFrame, gpsCoords, soundEnabled, detectionMode, activeDetectorId]);

  useEffect(() => {
    if (isMonitoring && cameraStatus === 'active' && !isAnalyzingFrame) {
      captureTimerRef.current = setTimeout(captureAndAnalyzeFrame, 900);
    }
    return () => {
      if (captureTimerRef.current) {
        clearTimeout(captureTimerRef.current);
      }
    };
  }, [isMonitoring, cameraStatus, isAnalyzingFrame, captureAndAnalyzeFrame]);

  const toggleSound = () => setSoundEnabled((prev) => !prev);
  const toggleVoice = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    audioAlertService.setVoiceMuted(!next);
  };

  const toggleFlashlight = async () => {
    const nextState = !flashlightOn;
    setFlashlightOn(nextState);

    if (streamRef.current) {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (videoTrack && videoTrack.readyState === 'live') {
        try {
          await (videoTrack as any).applyConstraints({
            advanced: [{ torch: nextState }],
          });
        } catch {
          // Fall back to software screen illumination
        }
      }
    }
  };

  const formattedGPS = locationService.formatCoordinates(gpsCoords);

  return (
    <div className="relative flex-1 flex flex-col h-full bg-slate-950 overflow-hidden select-none">
      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Top Floating Control Bar */}
      <div className="p-3 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 flex items-center justify-between z-30">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-600/60 border border-blue-400/40 flex items-center justify-center font-black text-sm shadow-md text-white">
            RG
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm tracking-wider uppercase text-slate-100">
                ROADGUARD
              </span>
              {isMonitoring && (
                <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">
                  <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                  Live AI Active
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400">High-Precision AI Vision & Vehicle Speed Radar</p>
          </div>
        </div>

        {/* Top Controls: Sound, Voice & Camera Flip */}
        <div className="flex items-center gap-2">
          {/* Voice Narrator Toggle */}
          <button
            onClick={toggleVoice}
            className={`p-2 rounded-xl border backdrop-blur-md transition-all ${
              voiceEnabled
                ? 'bg-blue-600/80 border-blue-500 text-white shadow-sm'
                : 'bg-slate-900/60 border-slate-800 text-slate-500'
            }`}
            title={voiceEnabled ? 'Voice Announcements ON' : 'Voice Announcements OFF'}
          >
            <Mic className="w-4 h-4" />
          </button>

          {/* Audio Chime Toggle */}
          <button
            onClick={toggleSound}
            className={`p-2 rounded-xl border backdrop-blur-md transition-all ${
              soundEnabled
                ? 'bg-slate-800/80 border-slate-700 text-cyan-400'
                : 'bg-slate-900/60 border-slate-800 text-slate-500'
            }`}
            title={soundEnabled ? 'Audio Chimes On' : 'Audio Chimes Off'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Flip Camera */}
          <button
            onClick={toggleFacingMode}
            className="p-2 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-300 hover:text-white backdrop-blur-md active:scale-95 transition-all"
            title="Switch Camera (Rear/Front)"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {/* Flashlight / Torch Toggle */}
          <button
            onClick={toggleFlashlight}
            className={`p-2 rounded-xl border backdrop-blur-md transition-all active:scale-95 ${
              flashlightOn
                ? 'bg-amber-400 border-amber-300 text-slate-950 shadow-lg shadow-amber-400/40 animate-pulse'
                : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-amber-300'
            }`}
            title={flashlightOn ? 'Turn Flashlight OFF' : 'Turn Flashlight ON (Night Driving)'}
          >
            {flashlightOn ? (
              <Flashlight className="w-4 h-4 text-slate-950 fill-slate-950" />
            ) : (
              <FlashlightOff className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* AI Model Engine Selector Bar */}
      <div className="bg-slate-900/95 px-3 py-2 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 z-20">
        <div className="flex items-center gap-1.5 text-xs text-slate-300">
          <Cpu className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="font-bold text-[10px] sm:text-[11px] text-slate-400">AI MODEL:</span>
          {activeDetectorId === 'yolov8-nano' && (
            <span className="hidden md:inline-flex items-center gap-1 text-[10px] text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded-full border border-cyan-800/60 font-mono">
              <span>RDD: D00, D10, D20, D40</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => handleDetectorChange('yolov8-nano')}
            className={`px-2 sm:px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-bold transition-all flex items-center gap-1.5 ${
              activeDetectorId === 'yolov8-nano'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                yoloStatus.isReady
                  ? 'bg-emerald-400 animate-pulse'
                  : yoloStatus.status === 'loading'
                  ? 'bg-amber-400 animate-ping'
                  : yoloStatus.status === 'error'
                  ? 'bg-rose-500'
                  : 'bg-slate-500'
              }`}
            />
            <span>YOLOv8 Nano (Edge ONNX)</span>
            {yoloStatus.status === 'loading' && (
              <span className="text-[9px] text-blue-200 animate-pulse">Loading...</span>
            )}
          </button>

          <button
            onClick={() => handleDetectorChange('gemini-vision')}
            className={`px-2 sm:px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-bold transition-all flex items-center gap-1.5 ${
              activeDetectorId === 'gemini-vision'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3 h-3 text-purple-300 shrink-0" />
            <span>Gemini 3.8 Flash</span>
          </button>
        </div>
      </div>

      {/* Target Mode Selector Tabs: Potholes, Vehicle Speed, or Both */}
      <div className="bg-slate-900/95 px-3 py-2 border-b border-slate-800 flex items-center justify-between z-20">
        <div className="flex items-center gap-1.5 text-xs text-slate-300 shrink-0">
          <Layers className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="font-bold text-[10px] sm:text-[11px] text-slate-400">TARGET:</span>
        </div>
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => handleModeChange('both')}
            className={`px-2 sm:px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-bold transition-all ${
              detectionMode === 'both'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span className="hidden sm:inline">All (Potholes & Speed)</span>
            <span className="sm:hidden">All</span>
          </button>
          <button
            onClick={() => handleModeChange('potholes')}
            className={`px-2 sm:px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-bold transition-all ${
              detectionMode === 'potholes'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span className="hidden sm:inline">🕳️ Potholes Only</span>
            <span className="sm:hidden">🕳️ Potholes</span>
          </button>
          <button
            onClick={() => handleModeChange('speed')}
            className={`px-2 sm:px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-bold transition-all ${
              detectionMode === 'speed'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span className="hidden sm:inline">🏎️ Car/Scooter Speed Only</span>
            <span className="sm:hidden">🏎️ Speeds</span>
          </button>
        </div>
      </div>

      {/* Warning/Error Banner if Model Failed */}
      {analysisError && (
        <div className="bg-rose-950/95 border-b border-rose-500/40 px-3 py-2 text-rose-200 text-xs flex items-center justify-between z-30 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="truncate max-w-sm sm:max-w-md">{analysisError}</span>
          </div>
          {activeDetectorId === 'yolov8-nano' && (
            <button
              onClick={() => {
                setAnalysisError(null);
                yoloV8DetectionService.loadModel().catch((err) => {
                  setAnalysisError(`Retry Failed: ${err.message}`);
                });
              }}
              className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-[10px] shrink-0"
            >
              Retry Load
            </button>
          )}
        </div>
      )}

      {/* Main Camera Viewport */}
      <div className="relative flex-1 w-full bg-black overflow-hidden flex items-center justify-center">
        {/* Flashlight Screen Illuminator Overlay */}
        {flashlightOn && (
          <div
            className="absolute inset-0 pointer-events-none z-10 bg-white/20 backdrop-brightness-150 transition-opacity duration-300 ring-4 ring-inset ring-amber-400/30"
            title="Road Illuminator Active"
          />
        )}

        {/* Live Video Element */}
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            cameraStatus === 'active' ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Real-time Bounding Box Overlays */}
        {cameraStatus === 'active' &&
          currentDetections.map((det, idx) => {
            if (!det.box2d || det.box2d.length !== 4) return null;
            const [ymin, xmin, ymax, xmax] = det.box2d;
            const top = Math.max(0, ymin / 10);
            const left = Math.max(0, xmin / 10);
            const width = Math.max(2, (xmax - xmin) / 10);
            const height = Math.max(2, (ymax - ymin) / 10);

            const isSpeed = det.type === 'vehicle_speed';
            const isHigh = det.severity === 'high';
            const strokeColor = isSpeed
              ? 'border-cyan-400 bg-cyan-500/10'
              : isHigh
              ? 'border-rose-500 bg-rose-500/10 shadow-lg shadow-rose-500/20'
              : 'border-amber-400 bg-amber-400/10 shadow-lg shadow-amber-400/20';
            const badgeColor = isSpeed
              ? 'bg-cyan-500 text-slate-950'
              : isHigh
              ? 'bg-rose-600 text-white'
              : 'bg-amber-500 text-slate-950';

            const label =
              det.description.split(']')[0]?.replace('[', '') || det.type.replace('_', ' ');

            return (
              <div
                key={`bbox-${idx}`}
                className={`absolute pointer-events-none border-2 rounded-lg transition-all duration-150 z-20 ${strokeColor}`}
                style={{
                  top: `${top}%`,
                  left: `${left}%`,
                  width: `${width}%`,
                  height: `${height}%`,
                }}
              >
                <div
                  className={`absolute -top-5 left-0 px-1.5 py-0.5 rounded text-[10px] font-bold font-mono tracking-tight shadow-md flex items-center gap-1 whitespace-nowrap ${badgeColor}`}
                >
                  <span>{label}</span>
                  <span>{Math.round(det.confidence * 100)}%</span>
                </div>
              </div>
            );
          })}

        {/* Real-time Toast Banner for Live Detections */}
        {realtimeNotification && (
          <div className="absolute top-4 inset-x-3 z-40 flex justify-center animate-in slide-in-from-top-3 fade-in duration-200">
            <div className="p-3 bg-slate-900/95 border-2 border-cyan-400 text-white rounded-2xl shadow-2xl backdrop-blur-md flex items-center justify-between gap-2.5 max-w-md w-full">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="p-1.5 bg-blue-600 rounded-lg text-white font-bold shrink-0">
                  <Database className="w-4 h-4 animate-bounce" />
                </span>
                <p className="text-xs font-bold leading-tight truncate">{realtimeNotification}</p>
              </div>

              {latestSavedRecord && (
                <button
                  onClick={() => setTrainTarget(latestSavedRecord)}
                  className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold shrink-0 flex items-center gap-1 shadow"
                  title="Teach Visual Agent about false positive"
                >
                  <Brain className="w-3 h-3" />
                  <span>Not Hazard?</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Targeting Reticle Overlay */}
        {cameraStatus === 'active' && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
            <div className="w-56 h-0.5 bg-cyan-400/20 mb-6 rounded-full" />
            <div className="w-72 h-44 border-2 border-dashed border-cyan-400/30 rounded-2xl relative">
              <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-cyan-400" />
              <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-cyan-400" />
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-cyan-400" />
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-cyan-400" />

              {/* Center Crosshairs */}
              <div className="absolute inset-0 flex items-center justify-center opacity-30">
                <div className="w-6 h-0.5 bg-cyan-400" />
                <div className="h-6 w-0.5 bg-cyan-400 absolute" />
              </div>
            </div>
            <span className="text-[10px] text-cyan-300 font-mono font-bold tracking-widest mt-2 uppercase bg-slate-950/80 px-2.5 py-0.5 rounded-full border border-cyan-400/30">
              {detectionMode === 'potholes'
                ? 'High-Precision Road Surface Scan'
                : detectionMode === 'speed'
                ? 'Vehicle Speed Radar & Scooter Tracking'
                : 'Road Hazards & Vehicle Speed Active'}
            </span>
          </div>
        )}

        {/* Active Analysis Pulse Indicator */}
        {isAnalyzingFrame && (
          <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-900/90 backdrop-blur-md border border-blue-400/50 text-blue-200 text-[10px] font-mono shadow-lg">
            <Eye className="w-3.5 h-3.5 animate-spin text-cyan-400" />
            <span>AI Analyzing Frame...</span>
          </div>
        )}

        {/* Camera Inactive / Permission Prompt Screen */}
        {cameraStatus !== 'active' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 text-center bg-slate-950/90 backdrop-blur-sm">
            <div className="w-16 h-16 rounded-3xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 mb-4 shadow-xl">
              {cameraStatus === 'denied' ? (
                <CameraOff className="w-8 h-8 text-rose-400" />
              ) : (
                <Camera className="w-8 h-8" />
              )}
            </div>

            <h3 className="text-lg font-bold text-white mb-1">
              {cameraStatus === 'denied' ? 'Camera Access Blocked' : 'Road Camera Ready'}
            </h3>

            <p className="text-xs text-slate-400 max-w-xs mb-5 leading-relaxed">
              {cameraError ||
                'Mount your phone on the car dashboard or motorcycle/scooter handle. Start monitoring to detect potholes and track moving vehicle speeds with real-time audio chimes and automatic photo database saves.'}
            </p>

            <div className="flex flex-col gap-2.5 w-full max-w-xs">
              <button
                onClick={() => onToggleMonitoring(true)}
                className="w-full py-3.5 px-5 rounded-2xl bg-blue-600 hover:bg-blue-500 active:scale-98 font-bold text-white shadow-xl shadow-blue-600/30 flex items-center justify-center gap-2 text-sm transition-all"
              >
                <Camera className="w-4 h-4" />
                Start Real-Time Detection
              </button>

              <button
                onClick={onOpenDemo}
                className="w-full py-3 px-4 rounded-2xl bg-slate-900 border border-slate-700/80 hover:bg-slate-800 text-cyan-400 font-semibold text-xs flex items-center justify-center gap-2 transition-all"
              >
                <Zap className="w-3.5 h-3.5" />
                Test Road Hazard / Speed Demo
              </button>

              {(lastSummary || driveSessionService.getLastSummary()) && onViewSummary && (
                <button
                  onClick={onViewSummary}
                  className="w-full py-2.5 px-4 rounded-2xl bg-slate-900/90 border border-blue-500/40 hover:bg-blue-950/60 text-blue-300 font-semibold text-xs flex items-center justify-center gap-2 transition-all"
                >
                  <FileText className="w-3.5 h-3.5 text-blue-400" />
                  <span>View Last Post-Drive Summary</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Real-time Detections Card Overlay */}
        {currentDetections.length > 0 && (
          <div className="absolute top-16 inset-x-4 z-20 flex flex-col gap-2 max-w-md mx-auto pointer-events-none">
            {currentDetections.map((detection, index) => {
              const isSpeed = detection.type === 'vehicle_speed';
              const isHigh = detection.severity === 'high';

              const borderColor = isSpeed
                ? 'border-blue-400 bg-blue-950/90 text-blue-100 shadow-blue-500/40'
                : isHigh
                ? 'border-red-500 bg-red-950/90 text-red-200 shadow-red-500/30'
                : 'border-amber-500 bg-amber-950/90 text-amber-200 shadow-amber-500/30';

              return (
                <div
                  key={index}
                  className={`p-3.5 rounded-2xl border-2 backdrop-blur-md shadow-2xl flex items-center justify-between gap-3 animate-in zoom-in-95 duration-200 ${borderColor}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-black/40 text-xl">
                      {isSpeed ? '🏎️' : detection.type === 'pothole' ? '🕳️' : '⚡'}
                    </div>
                    <div>
                      <h4 className="font-black text-sm tracking-wide flex items-center gap-1.5">
                        {isSpeed
                          ? `${(detection.vehicleType || 'vehicle').toUpperCase()} SPEED DETECTED`
                          : detection.type === 'pothole'
                          ? 'POTHOLE DETECTED'
                          : 'ROAD CRACK DETECTED'}
                      </h4>
                      <p className="text-[11px] opacity-90 line-clamp-1">{detection.description}</p>
                      <div className="text-[10px] text-cyan-300 font-mono mt-0.5 flex items-center gap-1">
                        <Database className="w-3 h-3 text-cyan-400" />
                        <span>Saved to Database with GPS & Photo</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    {isSpeed && detection.estimatedSpeedKmh ? (
                      <div className="text-base font-black font-mono text-cyan-300">
                        {detection.estimatedSpeedKmh} <span className="text-[10px]">km/h</span>
                      </div>
                    ) : (
                      <span
                        className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                          isHigh ? 'bg-red-600 text-white' : 'bg-amber-600 text-white'
                        }`}
                      >
                        {detection.severity}
                      </span>
                    )}
                    <div className="text-[10px] font-mono opacity-80 mt-0.5">
                      Conf: {Math.round(detection.confidence * 100)}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Driver Safety Warning Banner */}
      <div className="bg-amber-950/90 border-t border-b border-amber-500/30 px-3 py-1.5 text-center flex items-center justify-center gap-1.5 text-amber-300 text-[11px] font-medium z-30">
        <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-amber-400" />
        <span>Hands-free voice detection active. Keep eyes on the road while driving.</span>
      </div>

      {/* Bottom Telemetry & Controls Panel */}
      <div className="p-3.5 sm:p-4 bg-slate-900/95 border-t border-slate-800 z-30 flex flex-col gap-2.5 sm:gap-3 pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))] md:pb-4">
        {/* Telemetry Row */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          {/* GPS Status Box */}
          <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center gap-2.5">
            <div
              className={`p-2 rounded-lg ${
                gpsStatus === 'connected' || gpsStatus === 'demo'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-rose-500/20 text-rose-400'
              }`}
            >
              <Navigation className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                <span>GPS Telemetry</span>
                <span
                  className={
                    gpsStatus === 'connected'
                      ? 'text-emerald-400'
                      : gpsStatus === 'demo'
                      ? 'text-cyan-400'
                      : 'text-amber-400'
                  }
                >
                  {gpsStatus === 'connected'
                    ? 'Connected'
                    : gpsStatus === 'demo'
                    ? 'Simulated'
                    : gpsStatus === 'denied'
                    ? 'Permission Denied'
                    : 'Searching'}
                </span>
              </div>
              <div className="font-mono text-[11px] text-slate-200 truncate mt-0.5">
                {formattedGPS.combined}
              </div>
            </div>
          </div>

          {/* Detections Counter Box */}
          <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                Saved in Database
              </div>
              <div className="font-black text-base text-slate-100 leading-tight">
                {detectionCount} records
              </div>
            </div>
          </div>
        </div>

        {/* Start / Stop Monitoring Action Row */}
        <div className="flex items-center gap-2">
          {isMonitoring ? (
            <button
              onClick={() => onToggleMonitoring(false)}
              className="flex-1 py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-700 active:scale-98 font-bold text-white shadow-xl shadow-rose-600/30 flex items-center justify-center gap-2 text-base transition-all"
            >
              <CameraOff className="w-5 h-5" />
              STOP MONITORING
            </button>
          ) : (
            <button
              onClick={() => onToggleMonitoring(true)}
              className="flex-1 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 active:scale-98 font-bold text-white shadow-xl shadow-blue-600/30 flex items-center justify-center gap-2 text-base transition-all"
            >
              <Camera className="w-5 h-5" />
              START REAL-TIME MONITORING
            </button>
          )}

          {/* Quick Flashlight Button */}
          <button
            onClick={toggleFlashlight}
            className={`p-3.5 rounded-2xl border transition-all flex items-center justify-center ${
              flashlightOn
                ? 'bg-amber-400 border-amber-300 text-slate-950 shadow-lg shadow-amber-400/40 animate-pulse'
                : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:text-amber-400'
            }`}
            title={flashlightOn ? 'Flashlight ON (Tap to turn OFF)' : 'Flashlight OFF (Tap to turn ON)'}
          >
            {flashlightOn ? (
              <Flashlight className="w-5 h-5 fill-slate-950" />
            ) : (
              <FlashlightOff className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Latest Detection Summary Card */}
        {latestSavedRecord && (
          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-xl">
                {latestSavedRecord.type === 'vehicle_speed'
                  ? '🏎️'
                  : latestSavedRecord.type === 'pothole'
                  ? '🕳️'
                  : '⚡'}
              </span>
              <div className="min-w-0">
                <div className="font-semibold text-slate-200 capitalize truncate">
                  Latest: {latestSavedRecord.type.replace('_', ' ')}
                  {latestSavedRecord.estimatedSpeedKmh && ` (${latestSavedRecord.estimatedSpeedKmh} km/h)`}
                </div>
                <div className="text-[10px] text-slate-400 capitalize">
                  {latestSavedRecord.severity} severity • {latestSavedRecord.locationName}
                </div>
              </div>
            </div>

            <span
              className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-full shrink-0 ${
                latestSavedRecord.severity === 'high'
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
              }`}
            >
              {latestSavedRecord.severity}
            </span>
          </div>
        )}
      </div>

      {/* Quick Visual Agent Self-Improvement / False Positive Modal */}
      {trainTarget && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full overflow-hidden shadow-2xl text-white animate-in fade-in zoom-in duration-150">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-indigo-400 animate-pulse" />
                <div>
                  <h4 className="font-extrabold text-sm text-white">Teach Visual Agent</h4>
                  <span className="text-[10px] text-slate-400">Report False Positive in Real-Time</span>
                </div>
              </div>
              <button onClick={() => setTrainTarget(null)} className="p-1 rounded-lg text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700 space-y-1">
                <span className="text-slate-400 font-bold block text-[10px] uppercase">Detected As</span>
                <div className="font-bold text-amber-300 capitalize">{trainTarget.type.replace('_', ' ')}</div>
                <p className="text-slate-300 italic text-[11px] truncate">{trainTarget.description}</p>
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-1.5">What is this actually?</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: 'manhole', label: '🔘 Manhole Lid' },
                    { id: 'shadow', label: '🌲 Tree Shadow' },
                    { id: 'water_puddle', label: '💧 Water Puddle' },
                    { id: 'speed_breaker', label: '🛑 Speed Hump' },
                    { id: 'paint_marking', label: '🎨 Road Stripe' },
                    { id: 'normal_road', label: '🛣️ Normal Asphalt' },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setTrainCategory(cat.id as any)}
                      className={`p-2 rounded-xl border text-left font-semibold text-[11px] transition-all ${
                        trainCategory === cat.id
                          ? 'bg-indigo-600 border-indigo-400 text-white shadow-md'
                          : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-700/60'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-indigo-950/60 p-2 rounded-lg border border-indigo-800/60 text-[10px] text-indigo-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span>Agent will immediately suppress this false positive on future video frames.</span>
              </div>
            </div>

            <div className="p-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
              <button
                onClick={() => setTrainTarget(null)}
                className="py-1.5 px-3 text-slate-400 hover:text-white font-semibold text-xs"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!trainTarget) return;
                  await agentLearningService.teachMistake(
                    trainTarget.type,
                    trainCategory,
                    `Driver reported false positive for ${trainTarget.type}. Actual: ${trainCategory}.`
                  );
                  await detectionService.deleteDetection(trainTarget.id);
                  setLearnedCount((prev) => prev + 1);
                  setTrainTarget(null);
                  showNotification(`🧠 Agent updated! Ignored "${trainCategory.replace('_', ' ')}" in real time.`);
                }}
                className="py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
              >
                <Brain className="w-3.5 h-3.5" />
                <span>Apply Rule & Train</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
