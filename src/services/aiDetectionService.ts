import { DetectionResult, DetectionMode } from '../types/detection';

export type DetectionInputSource =
  | string
  | HTMLVideoElement
  | HTMLCanvasElement
  | ImageData
  | ImageBitmap
  | HTMLImageElement;

/**
 * Common AI Detection Service Contract
 * Supports the 3 primary detection architectures evaluated in RoadGuard:
 *  1. Standard Gemini Vision (baseline, unaugmented prompt)
 *  2. Feedback-Guided Gemini Vision (prompt-gated with verified reviewer rules)
 *  3. YOLOv5 Road Damage Detection (dedicated Python FastAPI neural detector)
 */
export interface IAIDetectionService {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly isReady: boolean;
  detectRoadProblems(
    source: DetectionInputSource,
    mimeType?: string,
    mode?: DetectionMode
  ): Promise<DetectionResult>;
}

export type SupportedDetectorModel =
  | 'roadguard-fusion'
  | 'gemini-standard'
  | 'gemini-feedback'
  | 'yolov5'
  | 'gemini-vision' // Backward-compatible alias for gemini-feedback
  | 'yolov8-nano';   // Backward-compatible alias for yolov5

