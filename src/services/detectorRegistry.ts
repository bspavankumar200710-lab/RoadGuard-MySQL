import { IAIDetectionService, SupportedDetectorModel } from './aiDetectionService';
import { geminiDetectionService } from './geminiDetectionService';
import { yoloV8DetectionService } from './yoloV8DetectionService';

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
  private activeId: SupportedDetectorModel = 'yolov8-nano';
  private listeners: Set<Listener> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY) as SupportedDetectorModel | null;
        if (saved === 'yolov8-nano' || saved === 'gemini-vision') {
          this.activeId = saved;
        }
      } catch {
        // Fall back to yolov8-nano default
      }
    }
  }

  public getActiveDetectorId(): SupportedDetectorModel {
    return this.activeId;
  }

  public getActiveDetector(): IAIDetectionService {
    if (this.activeId === 'yolov8-nano') {
      return yoloV8DetectionService;
    }
    return geminiDetectionService;
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
        id: 'yolov8-nano',
        name: 'YOLOv8 Nano (ONNX Edge)',
        badge: 'On-Device Edge AI',
        description: 'Trained 50 epochs on road damage classes: D00, D10, D20, D40. Fast client-side inference.',
        classes: ['D00 (Longitudinal Cracks)', 'D10 (Transverse Cracks)', 'D20 (Alligator Cracks)', 'D40 (Potholes)'],
        latencyType: 'Real-time Edge (~15-45ms)',
        isReady: yoloV8DetectionService.isReady,
      },
      {
        id: 'gemini-vision',
        name: 'Gemini 3.8 Flash Vision',
        badge: 'Multimodal Cloud AI',
        description: 'Large multimodal foundation model with self-improving prompt agent. Detects damage & vehicle speeds.',
        classes: ['Potholes', 'Road Cracks', 'Broken Signs', 'Vehicle Speeds'],
        latencyType: 'Cloud API (~300-800ms)',
        isReady: geminiDetectionService.isReady,
      },
    ];
  }
}

export const detectorRegistry = new DetectorRegistry();

// Backward compatible helper function
export function getActiveDetector(modelType?: SupportedDetectorModel): IAIDetectionService {
  if (modelType) {
    return modelType === 'yolov8-nano' ? yoloV8DetectionService : geminiDetectionService;
  }
  return detectorRegistry.getActiveDetector();
}

