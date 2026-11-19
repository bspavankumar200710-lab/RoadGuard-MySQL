import { IAIDetectionService, SupportedDetectorModel } from './aiDetectionService';
import {
  geminiStandardService,
  geminiFeedbackService,
  geminiDetectionService,
} from './geminiDetectionService';
import { yoloV5DetectionService } from './yoloV5DetectionService';

const STORAGE_KEY = 'roadguard_active_detector';

export interface DetectorMetadata {
  id: SupportedDetectorModel;
  name: string;
  badge: string;
  description: string;
  classes: string[];
  latencyType: string;
  isReady: boolean;
}

type Listener = (detector: IAIDetectionService) => void;

class DetectorRegistry {
  private activeId: SupportedDetectorModel = 'gemini-feedback';
  private listeners: Set<Listener> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY) as SupportedDetectorModel | null;
        if (
          saved === 'gemini-standard' ||
          saved === 'gemini-feedback' ||
          saved === 'yolov5' ||
          saved === 'gemini-vision' ||
          saved === 'yolov8-nano'
        ) {
          this.activeId = saved;
        }
      } catch {
        // Fall back to default
      }
    }
  }

  public getActiveDetectorId(): SupportedDetectorModel {
    return this.activeId;
  }

  public getActiveDetector(): IAIDetectionService {
    return this.resolveDetector(this.activeId);
  }

  public resolveDetector(id: SupportedDetectorModel): IAIDetectionService {
    switch (id) {
      case 'gemini-standard':
        return geminiStandardService;
      case 'gemini-feedback':
      case 'gemini-vision':
        return geminiFeedbackService;
      case 'yolov5':
      case 'yolov8-nano':
      default:
        return yoloV5DetectionService;
    }
  }

  public setActiveDetector(id: SupportedDetectorModel): void {
    if (this.activeId === id) return;
    this.activeId = id;

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, id);
      } catch {}
    }

    const current = this.getActiveDetector();
    this.listeners.forEach((listener) => {
      try {
        listener(current);
      } catch (err) {
        console.error('[DetectorRegistry] Listener notification error:', err);
      }
    });
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getAvailableDetectors(): DetectorMetadata[] {
    return [
      {
        id: 'gemini-feedback',
        name: 'Feedback-Guided Gemini Vision',
        badge: 'Proposed Method (Verified Rules)',
        description: 'Large multimodal model augmented with verified driver corrections & post-inference gating to eliminate false positives.',
        classes: ['Potholes', 'Road Cracks', 'Broken Signs', 'Vehicle Speeds'],
        latencyType: 'Cloud Vision API (~350-700ms)',
        isReady: geminiFeedbackService.isReady,
      },
      {
        id: 'gemini-standard',
        name: 'Standard Gemini Vision',
        badge: 'Baseline Zero-Feedback',
        description: 'Standard prompt baseline without verified feedback gating constraints. Used for comparative false-positive audit.',
        classes: ['Potholes', 'Road Cracks', 'Broken Signs', 'Vehicle Speeds'],
        latencyType: 'Cloud Vision API (~350-700ms)',
        isReady: geminiStandardService.isReady,
      },
      {
        id: 'yolov5',
        name: 'YOLOv5 Road Damage Detector',
        badge: 'Specialized Neural Detector',
        description: 'Dedicated Python YOLOv5 FastAPI service trained on RDD2022 road damage classes: D00, D10, D20, D40.',
        classes: ['D00 (Longitudinal Cracks)', 'D10 (Transverse Cracks)', 'D20 (Alligator Cracks)', 'D40 (Potholes)'],
        latencyType: 'FastAPI Microservice (~40-90ms)',
        isReady: yoloV5DetectionService.isReady,
      },
    ];
  }
}

export const detectorRegistry = new DetectorRegistry();

// Backward compatible helper function
export function getActiveDetector(modelType?: SupportedDetectorModel): IAIDetectionService {
  if (modelType) {
    return detectorRegistry.resolveDetector(modelType);
  }
  return detectorRegistry.getActiveDetector();
}
