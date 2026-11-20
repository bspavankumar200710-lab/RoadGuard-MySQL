import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  RoadHazardRecord,
  DetectedObject,
  DetectionResult,
  GPSStatus,
  CameraStatus,
  HazardType,
  SeverityLevel,
  DetectionMode,
} from '../types/detection';
import { geminiDetectionService, geminiStandardService, geminiFeedbackService } from '../services/geminiDetectionService';
import { yoloV5DetectionService } from '../services/yoloV5DetectionService';
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
  MapPin,
  UploadCloud,
  Film,
  Play,
  Pause,
  RotateCcw,
  Clock,
  CheckCircle,
  FolderOpen,
  Trash2,
  ChevronRight,
  Sliders,
} from 'lucide-react';
import { driveSessionService, DriveSummary } from '../services/driveSessionService';

export interface VideoDetectionItem {
  id: string;
  timestampSec: number;
  formattedTimestamp: string;
  objectType: HazardType;
  damageClass: string;
  damageName: string;
  confidence: number;
  severity: SeverityLevel;
  description: string;
  box2d?: [number, number, number, number];
  frameSnapshot: string;
  recordId?: string;
}

export interface VideoAnalysisReport {
  completed: boolean;
  modelUsed: string;
  totalFramesProcessed: number;
  videoDurationSec: number;
  totalPotholesDetected: number;
  totalCracksDetected: number;
  averageConfidence: number;
  detections: VideoDetectionItem[];
}

function formatVideoTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00.0';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`;
}

interface SmoothedDetection extends DetectedObject {
  id: string;
  lastSeenTime: number;
}

function computeBox2dIoU(
  a: [number, number, number, number],
  b: [number, number, number, number]
): number {
  const ymin = Math.max(a[0], b[0]);
  const xmin = Math.max(a[1], b[1]);
  const ymax = Math.min(a[2], b[2]);
  const xmax = Math.min(a[3], b[3]);

  const w = Math.max(0, xmax - xmin);
  const h = Math.max(0, ymax - ymin);
  const intersection = w * h;

  const areaA = (a[2] - a[0]) * (a[3] - a[1]);
  const areaB = (b[2] - b[0]) * (b[3] - b[1]);
  const union = areaA + areaB - intersection;

  return union > 0 ? intersection / union : 0;
}

function computeCoverBoundingBox(
  box2d: [number, number, number, number],
  videoWidth: number,
  videoHeight: number,
  containerWidth: number,
  containerHeight: number
): React.CSSProperties {
  const [ymin, xmin, ymax, xmax] = box2d;
  if (!videoWidth || !videoHeight || !containerWidth || !containerHeight) {
    return {
      top: `${ymin / 10}%`,
      left: `${xmin / 10}%`,
      width: `${Math.max(2, (xmax - xmin) / 10)}%`,
      height: `${Math.max(2, (ymax - ymin) / 10)}%`,
    };
  }

  const videoAspect = videoWidth / videoHeight;
  const containerAspect = containerWidth / containerHeight;

  let renderedWidth: number;
  let renderedHeight: number;
  let offsetX: number;
  let offsetY: number;

  if (videoAspect > containerAspect) {
    // Video is wider than container: matches container height, cropped horizontally
    renderedHeight = containerHeight;
    renderedWidth = containerHeight * videoAspect;
    offsetX = (containerWidth - renderedWidth) / 2;
    offsetY = 0;
  } else {
    // Video is taller than container: matches container width, cropped vertically
    renderedWidth = containerWidth;
    renderedHeight = containerWidth / videoAspect;
    offsetX = 0;
    offsetY = (containerHeight - renderedHeight) / 2;
  }

  const x1Norm = xmin / 1000;
  const y1Norm = ymin / 1000;
  const x2Norm = xmax / 1000;
  const y2Norm = ymax / 1000;

  const pixelLeft = offsetX + x1Norm * renderedWidth;
  const pixelTop = offsetY + y1Norm * renderedHeight;
  const pixelWidth = Math.max(16, (x2Norm - x1Norm) * renderedWidth);
  const pixelHeight = Math.max(16, (y2Norm - y1Norm) * renderedHeight);

  return {
    top: `${(pixelTop / containerHeight) * 100}%`,
    left: `${(pixelLeft / containerWidth) * 100}%`,
    width: `${(pixelWidth / containerWidth) * 100}%`,
    height: `${(pixelHeight / containerHeight) * 100}%`,
  };
}

interface MonitorPageProps {
  isMonitoring: boolean;
  onToggleMonitoring: (start: boolean) => void;
  onNavigateToMap?: (hazardId?: string) => void;
  onOpenDemo: () => void;
  onViewSummary?: () => void;
  lastSummary?: DriveSummary | null;
}

export const MonitorPage: React.FC<MonitorPageProps> = ({
  isMonitoring,
  onToggleMonitoring,
  onNavigateToMap,
  onOpenDemo,
  onViewSummary,
  lastSummary,
}) => {
  const { userProfile, updatePreferredMode } = useAuth();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureTimerRef = useRef<any>(null);
  const isMonitoringRef = useRef<boolean>(isMonitoring);
  const isAnalyzingRef = useRef<boolean>(false);
  const smoothedDetectionsRef = useRef<SmoothedDetection[]>([]);

  // Layout & Video Dimensions for surgical bounding box alignment
  const [containerDimensions, setContainerDimensions] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

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

  // Manual Snap & Geotag to Hazard Map (Requirement 3: Steps 1-6)
  const [isManualCapturing, setIsManualCapturing] = useState<boolean>(false);
  const [manualCaptureResult, setManualCaptureResult] = useState<{
    success: boolean;
    recordId?: string;
    message: string;
    hazardName?: string;
    damageClass?: string;
    confidence?: number;
    severity?: string;
    coords?: { lat: number; lng: number };
  } | null>(null);

  // AI Detector Engine State: 'gemini-feedback' | 'gemini-standard' | 'yolov5'
  const [activeDetectorId, setActiveDetectorId] = useState<SupportedDetectorModel>(() =>
    detectorRegistry.getActiveDetectorId()
  );
  const [yoloStatus, setYoloStatus] = useState(() => yoloV5DetectionService.getStatus());

  // =========================================================================
  // VIDEO ANALYSIS & POTHOLE DETECTION STATES
  // =========================================================================
  const [activeMonitorTab, setActiveMonitorTab] = useState<'live' | 'video'>('live');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<{
    name: string;
    sizeMb: string;
    durationSec: number;
    formattedDuration: string;
    width: number;
    height: number;
  } | null>(null);
  const [isDraggingVideo, setIsDraggingVideo] = useState<boolean>(false);
  const [selectedVideoModel, setSelectedVideoModel] = useState<SupportedDetectorModel>('yolov5');
  const [isVideoAnalyzing, setIsVideoAnalyzing] = useState<boolean>(false);
  const [videoAnalysisError, setVideoAnalysisError] = useState<string | null>(null);
  const [videoAnalysisProgress, setVideoAnalysisProgress] = useState<{
    currentFrame: number;
    totalFrames: number;
    percent: number;
    currentTimestampStr: string;
    potholesFound: number;
  }>({
    currentFrame: 0,
    totalFrames: 0,
    percent: 0,
    currentTimestampStr: '00:00.0',
    potholesFound: 0,
  });
  const [videoAnalysisResults, setVideoAnalysisResults] = useState<VideoAnalysisReport | null>(null);

  // Annotated Video Playback Refs & States
  const annotatedVideoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortVideoAnalysisRef = useRef<boolean>(false);
  const [annotatedCurrentTime, setAnnotatedCurrentTime] = useState<number>(0);
  const [isAnnotatedPlaying, setIsAnnotatedPlaying] = useState<boolean>(false);
  const [previewZoomImage, setPreviewZoomImage] = useState<string | null>(null);

  // Revoke object URL when replaced or unmounted
  useEffect(() => {
    return () => {
      if (videoPreviewUrl) {
        URL.revokeObjectURL(videoPreviewUrl);
      }
    };
  }, [videoPreviewUrl]);

  const handleTabSwitch = (newTab: 'live' | 'video') => {
    if (newTab === 'video' && isMonitoring) {
      onToggleMonitoring(false);
      stopCamera();
    }
    setActiveMonitorTab(newTab);
  };

  const handleVideoFileSelect = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    const validExts = ['mp4', 'mov', 'webm'];
    if (!validExts.includes(ext || '') && !file.type.startsWith('video/')) {
      setVideoAnalysisError('Unsupported video format. Please upload an MP4, MOV, or WebM file.');
      return;
    }

    setVideoAnalysisError(null);
    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
    }

    const url = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoPreviewUrl(url);
    setVideoAnalysisResults(null);

    const tempVid = document.createElement('video');
    tempVid.preload = 'metadata';
    tempVid.src = url;
    tempVid.onloadedmetadata = () => {
      const dur = tempVid.duration || 0;
      setVideoMetadata({
        name: file.name,
        sizeMb: (file.size / (1024 * 1024)).toFixed(1) + ' MB',
        durationSec: dur,
        formattedDuration: formatVideoTime(dur),
        width: tempVid.videoWidth || 1280,
        height: tempVid.videoHeight || 720,
      });
    };
  };

  const handleRemoveVideo = () => {
    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
    }
    setVideoFile(null);
    setVideoPreviewUrl(null);
    setVideoMetadata(null);
    setVideoAnalysisResults(null);
    setVideoAnalysisError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleStartVideoAnalysis = async () => {
    if (!videoPreviewUrl || !videoFile) return;

    setIsVideoAnalyzing(true);
    setVideoAnalysisError(null);
    abortVideoAnalysisRef.current = false;
    setVideoAnalysisResults(null);

    try {
      const hiddenVid = document.createElement('video');
      hiddenVid.preload = 'auto';
      hiddenVid.muted = true;
      hiddenVid.playsInline = true;
      hiddenVid.src = videoPreviewUrl;

      await new Promise<void>((resolve, reject) => {
        hiddenVid.onloadedmetadata = () => resolve();
        hiddenVid.onerror = () => reject(new Error('Failed to load video file. Ensure format is MP4, MOV or WebM.'));
      });

      const duration = hiddenVid.duration || 10;
      // Step calculation for frame extraction:
      // Short video (<= 25s): 0.5s intervals
      // Medium video (25s - 60s): 1.0s intervals
      // Long video (> 60s): sample evenly up to 75 frames to protect memory and responsiveness
      const stepSec = duration <= 25 ? 0.5 : duration <= 60 ? 1.0 : Math.max(1.0, duration / 75);
      const timestamps: number[] = [];
      for (let t = 0; t < duration; t += stepSec) {
        timestamps.push(t);
      }
      if (timestamps.length === 0 || timestamps[timestamps.length - 1] < duration - 0.2) {
        timestamps.push(Math.max(0, duration - 0.1));
      }

      const totalFrames = timestamps.length;
      const offCanvas = document.createElement('canvas');
      offCanvas.width = 640;
      offCanvas.height = Math.round(640 * ((hiddenVid.videoHeight || 480) / (hiddenVid.videoWidth || 640))) || 360;
      const offCtx = offCanvas.getContext('2d');

      const foundDetections: VideoDetectionItem[] = [];
      const detector = detectorRegistry.resolveDetector(selectedVideoModel);

      // Verify microservice connectivity if YOLOv5 selected
      if (selectedVideoModel === 'yolov5') {
        const ready = await yoloV5DetectionService.checkHealth();
        if (!ready) {
          throw new Error('YOLOv5 FastAPI microservice is offline at http://127.0.0.1:8000. Start it with: python yolo-service/app.py');
        }
      }

      for (let i = 0; i < totalFrames; i++) {
        if (abortVideoAnalysisRef.current) {
          break;
        }

        const t = timestamps[i];
        hiddenVid.currentTime = t;

        await new Promise<void>((res) => {
          const onSeeked = () => {
            hiddenVid.removeEventListener('seeked', onSeeked);
            res();
          };
          hiddenVid.addEventListener('seeked', onSeeked);
          setTimeout(res, 800);
        });

        if (offCtx) {
          offCtx.drawImage(hiddenVid, 0, 0, offCanvas.width, offCanvas.height);
        }

        setVideoAnalysisProgress({
          currentFrame: i + 1,
          totalFrames,
          percent: Math.round(((i + 1) / totalFrames) * 100),
          currentTimestampStr: formatVideoTime(t),
          potholesFound: foundDetections.filter((d) => d.damageClass === 'D40').length,
        });

        // Run real model inference on this frame
        try {
          const result = await detector.detectRoadProblems(offCanvas, 'image/jpeg', 'both');

          if (result && result.detected && result.objects.length > 0) {
            const frameSnapshot = offCanvas.toDataURL('image/jpeg', 0.8);

            for (const obj of result.objects) {
              const isPothole =
                obj.type === 'pothole' ||
                obj.description.toLowerCase().includes('pothole') ||
                obj.description.includes('D40');

              let damageClass = isPothole ? 'D40' : 'D10';
              if (obj.description.includes('D00')) damageClass = 'D00';
              else if (obj.description.includes('D10')) damageClass = 'D10';
              else if (obj.description.includes('D20')) damageClass = 'D20';
              else if (obj.description.includes('D40') || isPothole) damageClass = 'D40';

              const damageName =
                damageClass === 'D40'
                  ? 'Pothole'
                  : damageClass === 'D00'
                  ? 'Longitudinal Crack'
                  : damageClass === 'D10'
                  ? 'Transverse Crack'
                  : 'Alligator Crack';

              // Create annotated thumbnail snapshot
              const boxCanvas = document.createElement('canvas');
              boxCanvas.width = offCanvas.width;
              boxCanvas.height = offCanvas.height;
              const bCtx = boxCanvas.getContext('2d');
              if (bCtx) {
                bCtx.drawImage(offCanvas, 0, 0);
                if (obj.box2d) {
                  const [ymin, xmin, ymax, xmax] = obj.box2d;
                  const bx = (xmin / 1000) * boxCanvas.width;
                  const by = (ymin / 1000) * boxCanvas.height;
                  const bw = Math.max(8, ((xmax - xmin) / 1000) * boxCanvas.width);
                  const bh = Math.max(8, ((ymax - ymin) / 1000) * boxCanvas.height);
                  bCtx.lineWidth = 3;
                  bCtx.strokeStyle = obj.severity === 'high' ? '#ef4444' : '#f59e0b';
                  bCtx.strokeRect(bx, by, bw, bh);
                  bCtx.fillStyle = obj.severity === 'high' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(245, 158, 11, 0.25)';
                  bCtx.fillRect(bx, by, bw, bh);
                }
              }
              const annotatedSnapshot = boxCanvas.toDataURL('image/jpeg', 0.85);

              // Persist real detection to MySQL via detectionService
              const saved = await detectionService.addDetection({
                type: isPothole ? 'pothole' : 'road_crack',
                damageClass,
                damageName,
                confidence: obj.confidence,
                severity: obj.severity,
                description: `[${damageClass} - ${damageName}] ${Math.round(obj.confidence * 100)}% confidence at ${formatVideoTime(t)} in video: ${videoFile.name}`,
                latitude: null, // GPS absent in recording - no fake coordinates
                longitude: null,
                locationName: `Video: ${videoFile.name} @ ${formatVideoTime(t)}`,
                box2d: obj.box2d,
                imageUrl: frameSnapshot,
                annotatedImageUrl: annotatedSnapshot,
                imageSource: 'video_upload',
                aiEngine: selectedVideoModel,
                verificationStatus: 'verified',
                verifiedStatus: 'confirmed',
              });

              foundDetections.push({
                id: saved.id,
                timestampSec: t,
                formattedTimestamp: formatVideoTime(t),
                objectType: saved.type,
                damageClass,
                damageName,
                confidence: obj.confidence,
                severity: obj.severity,
                description: saved.description,
                box2d: obj.box2d,
                frameSnapshot: annotatedSnapshot,
                recordId: saved.id,
              });
            }
          }
        } catch (inferErr: any) {
          console.warn(`[VideoAnalysis] Inference error on frame ${i + 1}:`, inferErr);
        }
      }

      const totalPotholes = foundDetections.filter((d) => d.damageClass === 'D40').length;
      const totalCracks = foundDetections.filter((d) => d.damageClass !== 'D40').length;
      const avgConfidence =
        foundDetections.length > 0
          ? Math.round(
              (foundDetections.reduce((acc, d) => acc + d.confidence, 0) / foundDetections.length) * 100
            )
          : 0;

      const modelDisplayName =
        selectedVideoModel === 'yolov5'
          ? 'YOLOv5 RDD2022 (best.pt)'
          : selectedVideoModel === 'gemini-feedback'
          ? 'Feedback-Guided Gemini Vision'
          : 'Standard Gemini Vision';

      setVideoAnalysisResults({
        completed: true,
        modelUsed: modelDisplayName,
        totalFramesProcessed: totalFrames,
        videoDurationSec: duration,
        totalPotholesDetected: totalPotholes,
        totalCracksDetected: totalCracks,
        averageConfidence: avgConfidence,
        detections: foundDetections,
      });

      showNotification(`🎉 Video analysis complete! Detected ${totalPotholes} potholes across ${totalFrames} frames.`);
    } catch (err: any) {
      console.error('[VideoAnalysis] Analysis error:', err);
      setVideoAnalysisError(err?.message || 'Failed to analyze video');
    } finally {
      setIsVideoAnalyzing(false);
    }
  };

  const handleAbortVideoAnalysis = () => {
    abortVideoAnalysisRef.current = true;
    setIsVideoAnalyzing(false);
    showNotification('Video analysis cancelled.');
  };

  const handleToggleAnnotatedPlayback = () => {
    if (!annotatedVideoRef.current) return;
    if (annotatedVideoRef.current.paused) {
      annotatedVideoRef.current.play();
      setIsAnnotatedPlaying(true);
    } else {
      annotatedVideoRef.current.pause();
      setIsAnnotatedPlaying(false);
    }
  };

  const handleJumpToTimestamp = (sec: number) => {
    if (annotatedVideoRef.current) {
      annotatedVideoRef.current.currentTime = Math.max(0, sec - 0.2);
      annotatedVideoRef.current.play();
      setIsAnnotatedPlaying(true);
    }
  };

  const handleReplayVideo = () => {
    if (annotatedVideoRef.current) {
      annotatedVideoRef.current.currentTime = 0;
      annotatedVideoRef.current.play();
      setIsAnnotatedPlaying(true);
    }
  };

  // Keep isMonitoringRef synchronized
  useEffect(() => {
    isMonitoringRef.current = isMonitoring;
  }, [isMonitoring]);

  // Track container dimensions via ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        setContainerDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setVideoDimensions({
        width: videoRef.current.videoWidth || 1280,
        height: videoRef.current.videoHeight || 720,
      });
    }
  };

  // Listen to detector switches across the app
  useEffect(() => {
    const unsub = detectorRegistry.subscribe(() => {
      setActiveDetectorId(detectorRegistry.getActiveDetectorId());
      setYoloStatus(yoloV5DetectionService.getStatus());
    });
    return unsub;
  }, []);

  // Poll YOLOv5 status while active
  useEffect(() => {
    const interval = setInterval(() => {
      yoloV5DetectionService.checkHealth().then(() => {
        setYoloStatus(yoloV5DetectionService.getStatus());
      });
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const handleDetectorChange = (newDetector: SupportedDetectorModel) => {
    detectorRegistry.setActiveDetector(newDetector);
    setActiveDetectorId(newDetector);
    setAnalysisError(null);
    if (newDetector === 'yolov5' || newDetector === 'yolov8-nano') {
      yoloV5DetectionService
        .checkHealth()
        .then((ready) => {
          setYoloStatus(yoloV5DetectionService.getStatus());
          if (!ready) {
            setAnalysisError('YOLOv5 FastAPI microservice is offline at http://127.0.0.1:8000. Start it with: python yolo-service/app.py');
          }
        })
        .catch((err) => {
          setYoloStatus(yoloV5DetectionService.getStatus());
          setAnalysisError(`YOLOv5 Service Error: ${err.message}`);
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
        streamRef.current = null;
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
        videoTrack.onended = () => {
          console.warn('[MonitorPage] Camera track ended or device disconnected.');
          setCameraStatus('denied');
          setCameraError('Camera stream was closed or disconnected.');
        };

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
        setVideoDimensions({
          width: videoRef.current.videoWidth || 1280,
          height: videoRef.current.videoHeight || 720,
        });
      }
      setCameraStatus('active');
    } catch (err: any) {
      console.warn('[MonitorPage] Camera access denied or error:', err);
      setCameraStatus('denied');
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera permission was denied. Please allow camera access in your browser settings.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('No video camera was detected on this device.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setCameraError('Camera is currently in use by another application.');
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

  // Frame Capture and AI Processing Loop
  const captureAndAnalyzeFrame = useCallback(async () => {
    if (
      !isMonitoringRef.current ||
      isAnalyzingRef.current ||
      !videoRef.current ||
      videoRef.current.readyState < 2
    ) {
      return;
    }

    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      if (isMonitoringRef.current) {
        captureTimerRef.current = setTimeout(captureAndAnalyzeFrame, 150);
      }
      return;
    }

    try {
      isAnalyzingRef.current = true;
      setIsAnalyzingFrame(true);
      setAnalysisError(null);

      setLastFrameTime(Date.now());

      let result: DetectionResult;
      const isYolo = activeDetectorId === 'yolov5' || activeDetectorId === 'yolov8-nano';

      if (isYolo) {
        // Run dedicated YOLOv5 FastAPI detector
        result = await yoloV5DetectionService.detectRoadProblems(video, 'image/jpeg', detectionMode);
      } else {
        // Gemini API requires base64 encoded snapshot
        const canvas = canvasRef.current || document.createElement('canvas');
        canvas.width = 720;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageBase64 = canvas.toDataURL('image/jpeg', 0.85);
          const activeDetector = detectorRegistry.getActiveDetector();
          result = await activeDetector.detectRoadProblems(imageBase64, 'image/jpeg', detectionMode);
        } else {
          result = { detected: false, objects: [] };
        }
      }

      // Check if monitoring was stopped while inference was in flight
      if (!isMonitoringRef.current) {
        return;
      }

      // Synchronize YOLOv5 telemetry status
      if (isYolo) {
        setYoloStatus(yoloV5DetectionService.getStatus());
      }

      // Process and smooth bounding boxes
      if (result.detected && result.objects.length > 0) {
        const now = Date.now();
        const existing = [...smoothedDetectionsRef.current];
        const updatedList: SmoothedDetection[] = [];

        for (const newObj of result.objects) {
          if (!newObj.box2d) continue;

          let matchedIdx = -1;
          let bestIoU = 0.35;
          for (let i = 0; i < existing.length; i++) {
            if (existing[i].type === newObj.type && existing[i].box2d) {
              const iou = computeBox2dIoU(existing[i].box2d!, newObj.box2d);
              if (iou > bestIoU) {
                bestIoU = iou;
                matchedIdx = i;
              }
            }
          }

          if (matchedIdx >= 0) {
            const prev = existing[matchedIdx];
            const smoothedBox: [number, number, number, number] = [
              Math.round(prev.box2d![0] * 0.4 + newObj.box2d[0] * 0.6),
              Math.round(prev.box2d![1] * 0.4 + newObj.box2d[1] * 0.6),
              Math.round(prev.box2d![2] * 0.4 + newObj.box2d[2] * 0.6),
              Math.round(prev.box2d![3] * 0.4 + newObj.box2d[3] * 0.6),
            ];
            updatedList.push({
              ...newObj,
              box2d: smoothedBox,
              id: prev.id,
              lastSeenTime: now,
            });
            existing.splice(matchedIdx, 1);
          } else {
            updatedList.push({
              ...newObj,
              id: `det-${now}-${Math.random().toString(36).slice(2, 7)}`,
              lastSeenTime: now,
            });
          }
        }

        // Retain disappearing detections for up to 350ms to eliminate flicker
        for (const prev of existing) {
          if (now - prev.lastSeenTime < 350) {
            updatedList.push(prev);
          }
        }

        smoothedDetectionsRef.current = updatedList;
        setCurrentDetections(updatedList);

        // Persistent saving for verified non-duplicate detections
        let savedFrameBase64: string | null = null;

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

          // Duplicate detection suppression
          const isDuplicate = imageStorageService.isDuplicateDetection(
            obj.type,
            damageClass,
            lat,
            lng,
            obj.box2d
          );

          if (isDuplicate) {
            continue;
          }

          // Spoken voice & chimes
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

          // Capture photo ONLY when saving is required
          if (!savedFrameBase64) {
            const snapCanvas = canvasRef.current || document.createElement('canvas');
            snapCanvas.width = video.videoWidth || 1280;
            snapCanvas.height = video.videoHeight || 720;
            const snapCtx = snapCanvas.getContext('2d');
            if (snapCtx) {
              snapCtx.drawImage(video, 0, 0, snapCanvas.width, snapCanvas.height);
              savedFrameBase64 = snapCanvas.toDataURL('image/jpeg', 0.85);
            }
          }

          if (savedFrameBase64) {
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
              imageUrl: savedFrameBase64,
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

            showNotification(`🚨 ${damageClass}: ${damageName} at ${locationHint} • Saved`);
          }
        }
      } else {
        // Smoothly fade out detections
        const now = Date.now();
        const unexpired = smoothedDetectionsRef.current.filter((d) => now - d.lastSeenTime < 350);
        smoothedDetectionsRef.current = unexpired;
        setCurrentDetections(unexpired);
      }
    } catch (err: any) {
      console.warn('[MonitorPage] Frame inference cycle error:', err);
      setAnalysisError(err?.message || 'Frame analysis cycle failed');
    } finally {
      isAnalyzingRef.current = false;
      setIsAnalyzingFrame(false);

      if (isMonitoringRef.current) {
        // Controlled frame rate: ~130ms for YOLOv5 (yielding ~7-8 FPS), 4500ms for Gemini
        const nextDelayMs = activeDetectorId === 'gemini-vision' ? 4500 : 130;
        captureTimerRef.current = setTimeout(captureAndAnalyzeFrame, nextDelayMs);
      }
    }
  }, [gpsCoords, soundEnabled, detectionMode, activeDetectorId]);

  // Manual Snap & Geotag to Hazard Map (Requirement 3: Steps 1-6)
  const handleManualCaptureAndMap = useCallback(async () => {
    if (!videoRef.current || videoRef.current.readyState < 2) {
      if (cameraStatus !== 'active') {
        await startCamera();
      }
      showNotification('Camera stream is initializing. Please tap capture again in a moment.');
      return;
    }

    try {
      setIsManualCapturing(true);
      setManualCaptureResult(null);

      const video = videoRef.current;
      const snapCanvas = canvasRef.current || document.createElement('canvas');
      snapCanvas.width = video.videoWidth || 1280;
      snapCanvas.height = video.videoHeight || 720;
      const snapCtx = snapCanvas.getContext('2d');
      if (!snapCtx) throw new Error('Could not initialize canvas rendering context');
      snapCtx.drawImage(video, 0, 0, snapCanvas.width, snapCanvas.height);
      const snapshotBase64 = snapCanvas.toDataURL('image/jpeg', 0.88);

      // STEP 3: Automatic GPS Telemetry collection at the exact moment of capture
      let captureCoords: LocationCoordinates | null = gpsCoords;
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        try {
          const freshPos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 8000,
              maximumAge: 0,
            });
          });
          captureCoords = {
            latitude: freshPos.coords.latitude,
            longitude: freshPos.coords.longitude,
            accuracy: freshPos.coords.accuracy,
            heading: freshPos.coords.heading,
            speed: freshPos.coords.speed,
          };
          setGpsCoords(captureCoords);
          setGpsStatus('connected');
        } catch (geoErr: any) {
          console.warn('[MonitorPage] Direct GPS capture fallback to cached location:', geoErr);
        }
      }

      // Check GPS availability (Requirement 4: If GPS is unavailable, do not create a falsely geotagged hazard)
      if (!captureCoords || captureCoords.latitude == null || captureCoords.longitude == null) {
        setManualCaptureResult({
          success: false,
          message: 'GPS Telemetry Required: Cannot geotag hazard without actual device location. Please enable GPS permissions.',
        });
        showNotification('⚠️ GPS Required: Enable location permissions to geotag road damage.');
        return;
      }

      // STEP 4: AI Detection (YOLOv5 or Gemini according to active model)
      const detector = detectorRegistry.getActiveDetector();
      const result = await detector.detectRoadProblems(snapshotBase64, 'image/jpeg', 'potholes');

      if (!result.detected || !result.objects || result.objects.length === 0) {
        setManualCaptureResult({
          success: false,
          message: 'No road damage detected in frame (confidence below threshold). No hazard was created.',
        });
        showNotification('ℹ️ No road damage detected in current view.');
        return;
      }

      // Filter for genuine road damage categories
      const roadDamageObjs = result.objects.filter(
        (o) => o.type === 'pothole' || o.type === 'road_crack' || o.type === 'broken_sign' || o.type === 'other_hazard'
      );

      if (roadDamageObjs.length === 0) {
        setManualCaptureResult({
          success: false,
          message: 'No supported road damage category detected in this frame.',
        });
        return;
      }

      const topHazard = roadDamageObjs[0];
      const damageClass = imageStorageService.extractDamageClass(topHazard);
      const damageName = imageStorageService.resolveDamageName(damageClass, topHazard.type);
      const locHint = `${captureCoords.latitude.toFixed(4)}°, ${captureCoords.longitude.toFixed(4)}°`;

      // STEP 5: Automatic Hazard Creation in Database
      const newRecord = await detectionService.addDetection({
        type: topHazard.type,
        damageClass,
        damageName,
        confidence: topHazard.confidence,
        severity: topHazard.severity,
        description: topHazard.description,
        latitude: captureCoords.latitude,
        longitude: captureCoords.longitude,
        locationName: locHint,
        imageUrl: snapshotBase64,
        imageSource: 'live_camera',
        aiEngine: activeDetectorId,
        verificationStatus: 'pending',
        box2d: topHazard.box2d,
      });

      // STEP 6: Automatic Hazard Map Update & Direct Link
      setLatestSavedRecord(newRecord);
      setManualCaptureResult({
        success: true,
        recordId: newRecord.id,
        message: `${damageName} (${damageClass}) detected with ${Math.round(topHazard.confidence * 100)}% confidence and geotagged to Hazard Map!`,
        hazardName: damageName,
        damageClass,
        confidence: topHazard.confidence,
        severity: topHazard.severity,
        coords: { lat: captureCoords.latitude, lng: captureCoords.longitude },
      });

      showNotification(`🚨 ${damageName} Geotagged & Saved to Database!`);

      if (soundEnabled) {
        audioAlertService.announceDetection(topHazard.type, topHazard.severity, locHint);
      }
    } catch (err: any) {
      console.error('[MonitorPage] Manual snap & geotag failed:', err);
      setManualCaptureResult({
        success: false,
        message: err?.message || 'AI detection or database save failed. Please check network and retry.',
      });
      showNotification('❌ Detection failed. Please retry.');
    } finally {
      setIsManualCapturing(false);
    }
  }, [cameraStatus, gpsCoords, startCamera, activeDetectorId, soundEnabled]);

  useEffect(() => {
    // Keep camera stream active so user immediately sees road and can capture
    startCamera();
    locationService.startTracking();

    if (isMonitoring) {
      captureTimerRef.current = setTimeout(captureAndAnalyzeFrame, 600);
    } else {
      if (captureTimerRef.current) {
        clearTimeout(captureTimerRef.current);
        captureTimerRef.current = null;
      }
      smoothedDetectionsRef.current = [];
      setCurrentDetections([]);
    }
    return () => {
      if (captureTimerRef.current) {
        clearTimeout(captureTimerRef.current);
        captureTimerRef.current = null;
      }
      stopCamera();
    };
  }, [isMonitoring, startCamera, stopCamera, captureAndAnalyzeFrame]);

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
            <p className="text-[10px] text-slate-400">High-Precision Road Damage AI & Geotagging</p>
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

      {/* Mode Switch Tabs: Live Camera Detection vs Upload Recorded Video */}
      <div className="bg-slate-900/95 px-3 py-2 border-b border-slate-800 flex items-center justify-between gap-3 z-30">
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 w-full sm:w-auto">
          <button
            onClick={() => handleTabSwitch('live')}
            className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              activeMonitorTab === 'live'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Live Camera Detection</span>
          </button>
          <button
            onClick={() => handleTabSwitch('video')}
            className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              activeMonitorTab === 'video'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>Upload Recorded Video</span>
          </button>
        </div>

        {activeMonitorTab === 'video' ? (
          <div className="hidden sm:flex items-center gap-2 text-xs text-purple-300 font-mono">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>AI Pothole Video Scanner</span>
          </div>
        ) : (
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400">
            <Navigation className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-mono text-[11px]">{formattedGPS.combined}</span>
          </div>
        )}
      </div>

      {activeMonitorTab === 'live' ? (
        <>
      {/* AI Model Engine Selector Bar */}
      <div className="bg-slate-900/95 px-3 py-2 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 z-20">
        <div className="flex items-center flex-wrap gap-2 text-xs text-slate-300">
          <Cpu className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="font-bold text-[10px] sm:text-[11px] text-slate-400">AI MODEL:</span>
          {(activeDetectorId === 'yolov5' || activeDetectorId === 'yolov8-nano') && (
            <div className="inline-flex items-center flex-wrap gap-1.5 text-[10px] font-mono text-cyan-300 bg-cyan-950/80 px-2.5 py-0.5 rounded-full border border-cyan-800/60">
              <span className="font-bold text-cyan-200">YOLOv5 RDD: D00, D10, D20, D40</span>
              {yoloStatus.lastLatencyMs > 0 && (
                <span className="text-emerald-400 font-bold">• Latency: {yoloStatus.lastLatencyMs}ms</span>
              )}
              {yoloStatus.frameCount > 0 && (
                <span className="text-blue-300">• Frames: {yoloStatus.frameCount}</span>
              )}
              <span className="text-amber-300">• Conf: {Math.round(yoloStatus.confidenceThreshold * 100)}%</span>
            </div>
          )}
          {activeDetectorId === 'gemini-feedback' && (
            <span className="text-[10px] font-mono text-purple-300 bg-purple-950/80 px-2 py-0.5 rounded-full border border-purple-800/60 font-semibold">
              Feedback Rules Gating Active (v2.0-verified)
            </span>
          )}
          {activeDetectorId === 'gemini-standard' && (
            <span className="text-[10px] font-mono text-slate-300 bg-slate-800/80 px-2 py-0.5 rounded-full border border-slate-700/60">
              Zero-Feedback Baseline Prompt
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => handleDetectorChange('gemini-feedback')}
            className={`px-2 sm:px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-bold transition-all flex items-center gap-1.5 ${
              activeDetectorId === 'gemini-feedback' || activeDetectorId === 'gemini-vision'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3 h-3 text-purple-200 shrink-0" />
            <span>Feedback Gemini</span>
          </button>

          <button
            onClick={() => handleDetectorChange('gemini-standard')}
            className={`px-2 sm:px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-bold transition-all flex items-center gap-1.5 ${
              activeDetectorId === 'gemini-standard'
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>Standard Gemini</span>
          </button>

          <button
            onClick={() => handleDetectorChange('yolov5')}
            className={`px-2 sm:px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-bold transition-all flex items-center gap-1.5 ${
              activeDetectorId === 'yolov5' || activeDetectorId === 'yolov8-nano'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                yoloStatus.isReady ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
              }`}
            />
            <span>YOLOv5 (PyTorch)</span>
          </button>
        </div>
      </div>

      {/* Target Mode Selector Tabs: All Road Damage vs Potholes Only */}
      <div className="bg-slate-900/95 px-3 py-2 border-b border-slate-800 flex items-center justify-between z-20">
        <div className="flex items-center gap-1.5 text-xs text-slate-300 shrink-0">
          <Layers className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="font-bold text-[10px] sm:text-[11px] text-slate-400">TARGET:</span>
        </div>
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => handleModeChange('both')}
            className={`px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-bold transition-all ${
              detectionMode === 'both'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>All Damage (Potholes & Cracks)</span>
          </button>
          <button
            onClick={() => handleModeChange('potholes')}
            className={`px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-bold transition-all ${
              detectionMode === 'potholes'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>🕳️ Potholes Only</span>
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
          {(activeDetectorId === 'yolov5' || activeDetectorId === 'yolov8-nano') && (
            <button
              onClick={() => {
                setAnalysisError(null);
                yoloV5DetectionService.checkHealth().then((ready) => {
                  setYoloStatus(yoloV5DetectionService.getStatus());
                  if (!ready) {
                    setAnalysisError('YOLOv5 FastAPI microservice is offline at http://127.0.0.1:8000');
                  }
                });
              }}
              className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-[10px] shrink-0"
            >
              Retry Connection
            </button>
          )}
        </div>
      )}

      {/* Main Camera Viewport */}
      <div ref={containerRef} className="relative flex-1 w-full bg-black overflow-hidden flex items-center justify-center">
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
          onLoadedMetadata={handleLoadedMetadata}
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            cameraStatus === 'active' ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Real-time Bounding Box Overlays */}
        {cameraStatus === 'active' &&
          currentDetections.map((det, idx) => {
            if (!det.box2d || det.box2d.length !== 4) return null;
            const boxStyle = computeCoverBoundingBox(
              det.box2d,
              videoDimensions.width,
              videoDimensions.height,
              containerDimensions.width,
              containerDimensions.height
            );

            const isHigh = det.severity === 'high';
            const isMed = det.severity === 'medium';

            const strokeColor = isHigh
              ? 'border-rose-500 bg-rose-500/15 shadow-lg shadow-rose-500/30'
              : isMed
              ? 'border-amber-400 bg-amber-400/15 shadow-lg shadow-amber-400/30'
              : 'border-blue-400 bg-blue-400/15 shadow-lg shadow-blue-400/30';

            const badgeColor = isHigh
              ? 'bg-rose-600 text-white'
              : isMed
              ? 'bg-amber-500 text-slate-950'
              : 'bg-blue-600 text-white';

            const label =
              det.description.split(']')[0]?.replace('[', '') || det.type.replace('_', ' ');

            return (
              <div
                key={`bbox-${idx}-${det.type}`}
                className={`absolute pointer-events-none border-2 rounded-xl transition-all duration-100 z-20 ${strokeColor}`}
                style={boxStyle}
              >
                <div
                  className={`absolute -top-5 left-0 px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-tight shadow-md flex items-center gap-1.5 whitespace-nowrap ${badgeColor}`}
                >
                  <span>{label}</span>
                  <span className="opacity-90">{Math.round(det.confidence * 100)}%</span>
                  <span className="uppercase text-[9px] px-1 rounded bg-black/30">
                    {det.severity}
                  </span>
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
                ? 'High-Precision Pothole Scan'
                : 'Road Hazards & Cracks Active'}
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
                'Mount your phone on the vehicle dashboard. Capture damaged road photos to automatically detect potholes and cracks with real-time GPS geotagging on the Hazard Map.'}
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
                Test Road Hazard Demo
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
              const isHigh = detection.severity === 'high';

              const borderColor = isHigh
                ? 'border-red-500 bg-red-950/90 text-red-200 shadow-red-500/30'
                : 'border-amber-500 bg-amber-950/90 text-amber-200 shadow-amber-500/30';

              return (
                <div
                  key={index}
                  className={`p-3.5 rounded-2xl border-2 backdrop-blur-md shadow-2xl flex items-center justify-between gap-3 animate-in zoom-in-95 duration-200 ${borderColor}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-black/40 text-xl">
                      {detection.type === 'pothole' ? '🕳️' : '⚡'}
                    </div>
                    <div>
                      <h4 className="font-black text-sm tracking-wide flex items-center gap-1.5">
                        {detection.type === 'pothole'
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
                    <span
                      className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                        isHigh ? 'bg-red-600 text-white' : 'bg-amber-600 text-white'
                      }`}
                    >
                      {detection.severity}
                    </span>
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

        {/* Manual Shutter & Real-Time Monitoring Controls */}
        <div className="flex flex-col sm:flex-row items-center gap-2">
          {/* Prominent Manual Shutter Button for Geotagging to Hazard Map */}
          <button
            onClick={handleManualCaptureAndMap}
            disabled={isManualCapturing}
            className="w-full sm:flex-1 py-3.5 px-4 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 active:scale-98 text-white font-extrabold text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-xl shadow-blue-600/30 transition-all border border-blue-400/30 disabled:opacity-50"
          >
            {isManualCapturing ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin text-cyan-300" />
                <span>AI Analyzing & Geotagging...</span>
              </>
            ) : (
              <>
                <Camera className="w-5 h-5 text-white" />
                <span>📸 Capture Road Damage & Geotag</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {isMonitoring ? (
              <button
                onClick={() => onToggleMonitoring(false)}
                className="flex-1 sm:flex-initial py-3 px-4 rounded-2xl bg-rose-600/90 hover:bg-rose-700 active:scale-98 font-bold text-white shadow-lg shadow-rose-600/20 flex items-center justify-center gap-2 text-xs sm:text-sm transition-all border border-rose-500/30"
              >
                <CameraOff className="w-4 h-4" />
                <span>Stop Auto</span>
              </button>
            ) : (
              <button
                onClick={() => onToggleMonitoring(true)}
                className="flex-1 sm:flex-initial py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 active:scale-98 font-bold text-slate-200 shadow-md flex items-center justify-center gap-2 text-xs sm:text-sm transition-all border border-slate-700"
              >
                <Radio className="w-4 h-4 text-emerald-400" />
                <span>Auto Stream</span>
              </button>
            )}

            {/* Quick Flashlight Button */}
            <button
              onClick={toggleFlashlight}
              className={`p-3 rounded-2xl border transition-all flex items-center justify-center ${
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
        </div>

        {/* Manual Capture & Geotag Result Card */}
        {manualCaptureResult && (
          <div
            className={`p-3.5 rounded-2xl border-2 backdrop-blur-md shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200 ${
              manualCaptureResult.success
                ? 'bg-emerald-950/90 border-emerald-500/60 text-emerald-100 shadow-emerald-900/30'
                : 'bg-slate-900/90 border-amber-500/60 text-amber-100 shadow-amber-900/20'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`p-2.5 rounded-xl text-xl shrink-0 ${
                  manualCaptureResult.success ? 'bg-emerald-500/20' : 'bg-amber-500/20'
                }`}
              >
                {manualCaptureResult.success ? '📍' : '⚠️'}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-extrabold text-sm">
                    {manualCaptureResult.success ? 'Hazard Geotagged to Map!' : 'Capture Notice'}
                  </span>
                  {manualCaptureResult.damageClass && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/30 text-emerald-200 font-bold">
                      {manualCaptureResult.damageClass}
                    </span>
                  )}
                  {manualCaptureResult.severity && (
                    <span
                      className={`text-[9px] uppercase font-black px-2 py-0.5 rounded-full ${
                        manualCaptureResult.severity === 'high'
                          ? 'bg-red-600 text-white'
                          : 'bg-amber-500 text-slate-950'
                      }`}
                    >
                      {manualCaptureResult.severity}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-300 mt-0.5 leading-snug">
                  {manualCaptureResult.message}
                </p>
                {manualCaptureResult.coords && (
                  <span className="text-[10px] font-mono text-cyan-300 mt-0.5 block">
                    GPS: {manualCaptureResult.coords.lat.toFixed(5)}°, {manualCaptureResult.coords.lng.toFixed(5)}°
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              {manualCaptureResult.success && onNavigateToMap && (
                <button
                  onClick={() => onNavigateToMap(manualCaptureResult.recordId)}
                  className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 active:scale-95 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-500/25 transition-all"
                >
                  <MapPin className="w-3.5 h-3.5 fill-slate-950" />
                  <span>View on Hazard Map 🗺️</span>
                </button>
              )}
              <button
                onClick={() => setManualCaptureResult(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Latest Detection Summary Card */}
        {latestSavedRecord && (
          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-xl">
                {latestSavedRecord.type === 'pothole' ? '🕳️' : '⚡'}
              </span>
              <div className="min-w-0">
                <div className="font-semibold text-slate-200 capitalize truncate">
                  Latest: {latestSavedRecord.type.replace('_', ' ')}
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
        </>
      ) : (
        /* =========================================================================
           VIDEO ANALYSIS & AI POTHOLE DETECTION VIEW (Sections 1 - 6)
           ========================================================================= */
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-950 text-slate-100">
          <div className="max-w-6xl mx-auto space-y-6 pb-16">
            {/* 1. Header & AI Model Selection Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl backdrop-blur-md">
              <div className="flex items-start gap-3.5">
                <div className="p-3 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/30 shrink-0">
                  <Film className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="text-lg sm:text-xl font-black text-white tracking-wide uppercase">
                      VIDEO ANALYSIS
                    </h2>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono">
                      AI Pothole Detection
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 max-w-xl">
                    Upload recorded road video footage (MP4, MOV, WebM). Run frame-by-frame inference using trained road-damage neural models, annotate detected potholes with bounding boxes, and log hazard records to MySQL.
                  </p>
                </div>
              </div>

              {/* 2. AI Model Selection Dropdown */}
              <div className="flex flex-col gap-1.5 w-full lg:w-96 shrink-0 bg-slate-950/70 p-3 rounded-2xl border border-slate-800">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-300 flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                    <span>AI DETECTION MODEL:</span>
                  </span>
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                      selectedVideoModel === 'yolov5'
                        ? yoloStatus.isReady
                          ? 'text-emerald-300 bg-emerald-950/80 border border-emerald-500/40'
                          : 'text-amber-300 bg-amber-950/80 border border-amber-500/40 animate-pulse'
                        : 'text-purple-300 bg-purple-950/80 border border-purple-500/40'
                    }`}
                  >
                    {selectedVideoModel === 'yolov5'
                      ? yoloStatus.isReady
                        ? '● FASTAPI ONLINE'
                        : '○ MICROSERVICE CHECKING'
                      : '● API CONNECTED'}
                  </span>
                </div>

                <select
                  value={selectedVideoModel}
                  onChange={(e) => setSelectedVideoModel(e.target.value as SupportedDetectorModel)}
                  disabled={isVideoAnalyzing}
                  className="w-full bg-slate-900 border border-slate-700 hover:border-slate-600 rounded-xl px-3 py-2 text-xs font-semibold text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all cursor-pointer disabled:opacity-50"
                >
                  <option value="yolov5">
                    YOLOv5 Road Damage Detector (yolo-service/best.pt • RDD2022)
                  </option>
                  <option value="gemini-feedback">
                    Feedback-Guided Gemini Vision (v2.0 Rules Gating)
                  </option>
                  <option value="gemini-standard">
                    Standard Gemini Vision (Zero-Feedback Baseline)
                  </option>
                </select>

                <div className="text-[10px] text-slate-400 font-mono leading-tight">
                  {selectedVideoModel === 'yolov5' && (
                    <span className="text-cyan-300">
                      Trained Weights: <code className="text-white">yolo-service/best.pt</code> • Classes: D40 (Potholes), D00, D10, D20
                    </span>
                  )}
                  {selectedVideoModel === 'gemini-feedback' && (
                    <span className="text-purple-300">
                      Multimodal Cloud Vision • Active feedback false-positive suppression
                    </span>
                  )}
                  {selectedVideoModel === 'gemini-standard' && (
                    <span className="text-slate-300">
                      Baseline prompt pipeline without false-positive suppression gating
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Error Notification Banner if any */}
            {videoAnalysisError && (
              <div className="p-4 rounded-2xl bg-rose-950/90 border border-rose-500/60 text-rose-200 text-xs flex items-center justify-between gap-3 animate-in fade-in">
                <div className="flex items-center gap-2.5">
                  <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
                  <span className="font-semibold">{videoAnalysisError}</span>
                </div>
                <button
                  onClick={() => setVideoAnalysisError(null)}
                  className="p-1 rounded-lg hover:bg-rose-900/60 text-rose-300 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Hidden Video File Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleVideoFileSelect(f);
              }}
              className="hidden"
            />

            {/* 3. Drag-and-Drop Video Upload Area or Video Preview */}
            {!videoPreviewUrl ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingVideo(true);
                }}
                onDragLeave={() => setIsDraggingVideo(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingVideo(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleVideoFileSelect(f);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`p-10 rounded-3xl border-2 border-dashed transition-all flex flex-col items-center justify-center text-center cursor-pointer ${
                  isDraggingVideo
                    ? 'border-purple-400 bg-purple-950/30 scale-[1.01]'
                    : 'border-slate-700 hover:border-purple-500/60 bg-slate-900/50 hover:bg-slate-900/80'
                }`}
              >
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600/20 to-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-4 shadow-lg">
                  <UploadCloud className="w-8 h-8 animate-pulse text-purple-300" />
                </div>
                <h3 className="text-base sm:text-lg font-bold text-white mb-1">
                  Drag and drop your road footage here, or browse files
                </h3>
                <p className="text-xs text-slate-400 max-w-md mb-5">
                  Supported formats: MP4, MOV, WebM. Videos are processed frame-by-frame using real AI inference without data simulation.
                </p>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="py-2.5 px-5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-95 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-blue-600/25 transition-all"
                  >
                    <FolderOpen className="w-4 h-4" />
                    <span>Browse Files</span>
                  </button>
                </div>

                <div className="flex items-center gap-2 mt-6 text-[11px] text-slate-400">
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">MP4</span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">MOV</span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">WebM</span>
                  <span>• Maximum video size 500 MB</span>
                </div>
              </div>
            ) : (
              <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
                <div className="flex flex-col lg:flex-row gap-5">
                  {/* Video Preview Player */}
                  <div className="w-full lg:w-3/5 rounded-2xl overflow-hidden bg-black border border-slate-800 relative aspect-video flex items-center justify-center">
                    <video
                      src={videoPreviewUrl}
                      controls
                      playsInline
                      className="w-full h-full object-contain"
                    />
                  </div>

                  {/* Video Metadata & Start Button */}
                  <div className="w-full lg:w-2/5 flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block">
                            Uploaded Recording
                          </span>
                          <h4 className="font-extrabold text-sm sm:text-base text-white truncate" title={videoMetadata?.name}>
                            {videoMetadata?.name || videoFile?.name}
                          </h4>
                        </div>
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold uppercase shrink-0">
                          Ready
                        </span>
                      </div>

                      {/* Metadata Details */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-0.5">
                          <span className="text-[10px] text-slate-400 uppercase block font-semibold">File Size</span>
                          <span className="font-mono font-bold text-slate-200">{videoMetadata?.sizeMb || 'N/A'}</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-0.5">
                          <span className="text-[10px] text-slate-400 uppercase block font-semibold">Duration</span>
                          <span className="font-mono font-bold text-slate-200">{videoMetadata?.formattedDuration || 'N/A'}</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-0.5">
                          <span className="text-[10px] text-slate-400 uppercase block font-semibold">Resolution</span>
                          <span className="font-mono font-bold text-slate-200">
                            {videoMetadata?.width ? `${videoMetadata.width} × ${videoMetadata.height}px` : 'Standard HD'}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-0.5">
                          <span className="text-[10px] text-slate-400 uppercase block font-semibold">Detection Target</span>
                          <span className="font-mono font-bold text-cyan-300">Potholes (D40) & Cracks</span>
                        </div>
                      </div>

                      {/* Replace / Remove Controls */}
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isVideoAnalyzing}
                          className="py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                          <span>Replace Video</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleRemoveVideo}
                          disabled={isVideoAnalyzing}
                          className="py-1.5 px-3 rounded-xl bg-rose-950/60 hover:bg-rose-900/60 border border-rose-800/40 text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      </div>
                    </div>

                    {/* START VIDEO ANALYSIS BUTTON */}
                    <button
                      type="button"
                      onClick={handleStartVideoAnalysis}
                      disabled={isVideoAnalyzing}
                      className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 active:scale-98 text-white font-extrabold text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-xl shadow-indigo-600/30 transition-all border border-indigo-400/30 disabled:opacity-60 cursor-pointer"
                    >
                      {isVideoAnalyzing ? (
                        <>
                          <RefreshCw className="w-5 h-5 animate-spin text-cyan-300" />
                          <span>Extracting Frames & Analyzing Road Damage...</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-5 h-5 fill-amber-300 text-amber-300" />
                          <span>START VIDEO ANALYSIS</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Live In-Progress Video Analysis Bar */}
                {isVideoAnalyzing && (
                  <div className="p-4 rounded-2xl bg-slate-950 border border-indigo-500/40 space-y-2.5 animate-in fade-in">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 font-bold text-indigo-300">
                        <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                        <span>
                          Processing Frame {videoAnalysisProgress.currentFrame} / {videoAnalysisProgress.totalFrames}
                        </span>
                        <span className="font-mono text-slate-400">({videoAnalysisProgress.percent}%)</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-cyan-300 text-[11px]">
                          Timestamp: {videoAnalysisProgress.currentTimestampStr}
                        </span>
                        <span className="font-bold text-rose-400 text-[11px] px-2 py-0.5 rounded-full bg-rose-950/80 border border-rose-800/40">
                          🕳️ {videoAnalysisProgress.potholesFound} potholes found
                        </span>
                        <button
                          type="button"
                          onClick={handleAbortVideoAnalysis}
                          className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors"
                        >
                          Abort
                        </button>
                      </div>
                    </div>

                    {/* Progress Fill Bar */}
                    <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 transition-all duration-200"
                        style={{ width: `${videoAnalysisProgress.percent}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 4. Dedicated Video Analysis Results Section */}
            {videoAnalysisResults && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-300">
                {/* Results Header Card */}
                <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        <CheckCircle className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-black text-base sm:text-lg text-white">
                          Video Analysis Report
                        </h3>
                        <p className="text-xs text-slate-400">
                          Frame-by-frame neural inference complete • All detected hazards stored in MySQL database
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono font-bold px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        Status: Processed & Saved to MySQL
                      </span>
                    </div>
                  </div>

                  {/* 4 Metric Summary Cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Total Potholes */}
                    <div className="p-3.5 rounded-2xl bg-slate-950 border border-rose-500/30 space-y-1">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="font-bold uppercase tracking-wider text-[10px]">Potholes (D40)</span>
                        <span className="text-base">🕳️</span>
                      </div>
                      <div className="text-2xl font-black text-rose-400 font-mono">
                        {videoAnalysisResults.totalPotholesDetected}
                      </div>
                      <span className="text-[10px] text-slate-400 block">Identified road cavities</span>
                    </div>

                    {/* Total Cracks */}
                    <div className="p-3.5 rounded-2xl bg-slate-950 border border-amber-500/30 space-y-1">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="font-bold uppercase tracking-wider text-[10px]">Cracks (D00-D20)</span>
                        <span className="text-base">⚡</span>
                      </div>
                      <div className="text-2xl font-black text-amber-400 font-mono">
                        {videoAnalysisResults.totalCracksDetected}
                      </div>
                      <span className="text-[10px] text-slate-400 block">Longitudinal / Alligator</span>
                    </div>

                    {/* Frames Analyzed */}
                    <div className="p-3.5 rounded-2xl bg-slate-950 border border-blue-500/30 space-y-1">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="font-bold uppercase tracking-wider text-[10px]">Frames Analyzed</span>
                        <Film className="w-4 h-4 text-blue-400" />
                      </div>
                      <div className="text-2xl font-black text-blue-400 font-mono">
                        {videoAnalysisResults.totalFramesProcessed}
                      </div>
                      <span className="text-[10px] text-slate-400 block">
                        Across {videoAnalysisResults.videoDurationSec.toFixed(1)}s video
                      </span>
                    </div>

                    {/* AI Model & Confidence */}
                    <div className="p-3.5 rounded-2xl bg-slate-950 border border-purple-500/30 space-y-1">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="font-bold uppercase tracking-wider text-[10px]">AI Model</span>
                        <Cpu className="w-4 h-4 text-purple-400" />
                      </div>
                      <div className="text-xl font-black text-purple-300 truncate" title={videoAnalysisResults.modelUsed}>
                        {videoAnalysisResults.modelUsed.split('(')[0]}
                      </div>
                      <span className="text-[10px] text-emerald-400 font-mono font-bold block">
                        Avg. Confidence: {videoAnalysisResults.averageConfidence}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Annotated Video Replay Section */}
                <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-2">
                      <Play className="w-4 h-4 text-cyan-400" />
                      <h4 className="font-bold text-sm text-white uppercase tracking-wider">
                        Annotated Video Replay (Bounding Box Overlay)
                      </h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleReplayVideo}
                        className="py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Replay Annotated Video</span>
                      </button>
                    </div>
                  </div>

                  {/* Video Player with dynamic overlay */}
                  <div className="relative rounded-2xl overflow-hidden bg-black border border-slate-800 aspect-video flex items-center justify-center max-h-[500px]">
                    <video
                      ref={annotatedVideoRef}
                      src={videoPreviewUrl || undefined}
                      playsInline
                      onTimeUpdate={() => {
                        if (annotatedVideoRef.current) {
                          setAnnotatedCurrentTime(annotatedVideoRef.current.currentTime);
                        }
                      }}
                      onPlay={() => setIsAnnotatedPlaying(true)}
                      onPause={() => setIsAnnotatedPlaying(false)}
                      className="w-full h-full object-contain"
                    />

                    {/* Synchronized Bounding Box Overlays on Video */}
                    {videoAnalysisResults.detections
                      .filter((det) => Math.abs(det.timestampSec - annotatedCurrentTime) <= 0.8)
                      .map((det) => {
                        if (!det.box2d) return null;
                        const [ymin, xmin, ymax, xmax] = det.box2d;
                        const top = `${ymin / 10}%`;
                        const left = `${xmin / 10}%`;
                        const width = `${Math.max(3, (xmax - xmin) / 10)}%`;
                        const height = `${Math.max(3, (ymax - ymin) / 10)}%`;

                        const isHigh = det.severity === 'high';
                        const stroke = isHigh
                          ? 'border-rose-500 bg-rose-500/20 shadow-lg shadow-rose-500/30'
                          : 'border-amber-400 bg-amber-400/20 shadow-lg shadow-amber-400/30';
                        const badge = isHigh ? 'bg-rose-600 text-white' : 'bg-amber-500 text-slate-950';

                        return (
                          <div
                            key={det.id}
                            className={`absolute pointer-events-none border-2 rounded-xl transition-all duration-75 z-20 ${stroke}`}
                            style={{ top, left, width, height }}
                          >
                            <div
                              className={`absolute -top-5 left-0 px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-tight shadow-md flex items-center gap-1.5 whitespace-nowrap ${badge}`}
                            >
                              <span>[{det.damageClass} - {det.damageName}]</span>
                              <span>{Math.round(det.confidence * 100)}%</span>
                              <span className="uppercase text-[9px] px-1 rounded bg-black/30">
                                {det.severity}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  {/* Playback Controls & Timestamp Scrubber */}
                  <div className="flex items-center justify-between gap-3 p-2.5 bg-slate-950/80 rounded-xl border border-slate-800 text-xs">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleToggleAnnotatedPlayback}
                        className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                        title={isAnnotatedPlaying ? 'Pause' : 'Play'}
                      >
                        {isAnnotatedPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={handleReplayVideo}
                        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                        title="Replay from beginning"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex-1 flex items-center gap-3">
                      <span className="font-mono text-[11px] text-cyan-300 shrink-0">
                        {formatVideoTime(annotatedCurrentTime)}
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={videoAnalysisResults.videoDurationSec || 100}
                        step={0.1}
                        value={annotatedCurrentTime}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setAnnotatedCurrentTime(val);
                          if (annotatedVideoRef.current) {
                            annotatedVideoRef.current.currentTime = val;
                          }
                        }}
                        className="w-full accent-indigo-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                      />
                      <span className="font-mono text-[11px] text-slate-400 shrink-0">
                        {formatVideoTime(videoAnalysisResults.videoDurationSec)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 5. Detection Results Table */}
                <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                    <div>
                      <h4 className="font-black text-base text-white">
                        Detection Results Table ({videoAnalysisResults.detections.length})
                      </h4>
                      <p className="text-xs text-slate-400">
                        All values generated directly by {videoAnalysisResults.modelUsed}
                      </p>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400">
                      Click any row or &quot;Jump to Frame&quot; to inspect detection
                    </span>
                  </div>

                  {videoAnalysisResults.detections.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 text-xs rounded-2xl bg-slate-950/60 border border-slate-800">
                      No potholes or severe road damage detected in this video footage. Road surface appears clear.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            <th className="py-3 px-3">#</th>
                            <th className="py-3 px-3">Timestamp</th>
                            <th className="py-3 px-3">Object</th>
                            <th className="py-3 px-3">Confidence</th>
                            <th className="py-3 px-3">Severity</th>
                            <th className="py-3 px-3">Snapshot</th>
                            <th className="py-3 px-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono">
                          {videoAnalysisResults.detections.map((det, index) => {
                            const isPothole = det.damageClass === 'D40';
                            return (
                              <tr
                                key={det.id}
                                className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                                onClick={() => handleJumpToTimestamp(det.timestampSec)}
                              >
                                <td className="py-3 px-3 text-slate-400 font-bold">
                                  #{index + 1}
                                </td>
                                <td className="py-3 px-3">
                                  <span className="flex items-center gap-1.5 text-cyan-300 font-bold">
                                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                                    <span>{det.formattedTimestamp}</span>
                                  </span>
                                </td>
                                <td className="py-3 px-3">
                                  <div className="flex items-center gap-1.5">
                                    <span>{isPothole ? '🕳️' : '⚡'}</span>
                                    <span className="font-sans font-bold text-slate-100">
                                      {det.damageName}
                                    </span>
                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                                      {det.damageClass}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-3 px-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-16 h-2 rounded-full bg-slate-800 overflow-hidden">
                                      <div
                                        className={`h-full ${
                                          det.confidence >= 0.8
                                            ? 'bg-emerald-400'
                                            : det.confidence >= 0.6
                                            ? 'bg-amber-400'
                                            : 'bg-blue-400'
                                        }`}
                                        style={{ width: `${Math.round(det.confidence * 100)}%` }}
                                      />
                                    </div>
                                    <span className="font-bold text-slate-200">
                                      {Math.round(det.confidence * 100)}%
                                    </span>
                                  </div>
                                </td>
                                <td className="py-3 px-3">
                                  <span
                                    className={`text-[9px] uppercase font-black px-2 py-0.5 rounded-full ${
                                      det.severity === 'high'
                                        ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                    }`}
                                  >
                                    {det.severity}
                                  </span>
                                </td>
                                <td className="py-3 px-3">
                                  <img
                                    src={det.frameSnapshot}
                                    alt="Frame"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPreviewZoomImage(det.frameSnapshot);
                                    }}
                                    className="w-12 h-8 object-cover rounded-lg border border-slate-700 hover:scale-125 transition-transform cursor-zoom-in"
                                  />
                                </td>
                                <td className="py-3 px-3 text-right">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleJumpToTimestamp(det.timestampSec);
                                    }}
                                    className="py-1 px-2.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-white font-sans text-[11px] font-bold flex items-center gap-1 ml-auto shadow transition-colors"
                                  >
                                    <Play className="w-3 h-3" />
                                    <span>Jump to Frame</span>
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Informational Database & GPS Footer */}
                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 space-y-1 font-sans">
                    <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Database Persistence Verified</span>
                    </div>
                    <p>
                      Each detected road damage instance above has been permanently stored in MySQL via <code className="text-slate-300">detectionService.addDetection</code> with <code className="text-slate-300">imageSource: &apos;video_upload&apos;</code>.
                    </p>
                    <p className="text-slate-500 text-[10px]">
                      GPS Notice: Because no live GPS receiver was active during video recording, coordinates are recorded as null. In compliance with RoadGuard specifications, no simulated or fake coordinates were generated.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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

      {/* Zoom Modal for Frame Snapshot */}
      {previewZoomImage && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setPreviewZoomImage(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-700 rounded-3xl overflow-hidden shadow-2xl p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPreviewZoomImage(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-black/60 text-white hover:bg-black/90 z-10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={previewZoomImage}
              alt="Zoomed Detection Frame"
              className="w-full h-auto max-h-[85vh] object-contain rounded-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};
