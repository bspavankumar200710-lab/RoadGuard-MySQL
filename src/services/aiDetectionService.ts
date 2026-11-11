import { DetectionResult, DetectionMode } from '../types/detection';

/**
 * Common AI Detection Service Contract
 * Designed so detection backends (YOLOv8-nano, Gemini Vision, etc.)
 * can be swapped interchangeably without altering camera, dashboard, or map UI.
 */
export interface IAIDetectionService {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly isReady: boolean;
  detectRoadProblems(imageBase64: string, mimeType?: string, mode?: DetectionMode): Promise<DetectionResult>;
}

export type SupportedDetectorModel = 'gemini-vision' | 'yolov8-nano';
