import { IAIDetectionService, DetectionInputSource } from './aiDetectionService';
import {
  DetectionResult,
  DetectedObject,
  DetectionMode,
  HazardType,
  SeverityLevel,
} from '../types/detection';

/**
 * =========================================================================
 * YOLOv5 Road Damage Detection Client Service (FastAPI Microservice)
 * =========================================================================
 *
 * Connects to the dedicated Python YOLOv5 FastAPI service running at:
 *  - http://127.0.0.1:8000/detect (or proxied via /api/yolov5/detect)
 *
 * Supports road damage classes:
 *  - D00: Longitudinal cracks
 *  - D10: Transverse cracks
 *  - D20: Alligator cracks
 *  - D40: Potholes
 */

export interface YOLOv5Status {
  status: 'idle' | 'checking' | 'ready' | 'offline';
  isReady: boolean;
  serviceUrl: string;
  device: string;
  confidenceThreshold: number;
  iouThreshold: number;
  frameCount: number;
  lastLatencyMs: number;
  lastDetectionsCount: number;
}

export class YOLOv5DetectionService implements IAIDetectionService {
  public readonly id = 'yolov5';
  public readonly name = 'YOLOv5 Road Damage Detector (FastAPI)';
  public readonly version = 'v5.0-RDD2022';

  private serviceUrl = typeof window !== 'undefined' ? '/api/yolov5' : 'http://127.0.0.1:8000';
  private directUrl = 'http://127.0.0.1:8000';
  private status: 'idle' | 'checking' | 'ready' | 'offline' = 'idle';
  private isChecking = false;
  private confidenceThreshold = 0.15;
  private iouThreshold = 0.45;

  private frameCount = 0;
  private lastLatencyMs = 0;
  private lastDetectionsCount = 0;
  private isInferring = false;
  private cachedCanvas: HTMLCanvasElement | null = null;

  constructor() {
    this.checkHealth().catch(() => {});
  }

  public get isReady(): boolean {
    return this.status === 'ready';
  }

  public getStatus(): YOLOv5Status {
    return {
      status: this.status,
      isReady: this.isReady,
      serviceUrl: this.serviceUrl,
      device: 'PyTorch (CPU/GPU)',
      confidenceThreshold: this.confidenceThreshold,
      iouThreshold: this.iouThreshold,
      frameCount: this.frameCount,
      lastLatencyMs: this.lastLatencyMs,
      lastDetectionsCount: this.lastDetectionsCount,
    };
  }

  public setConfidenceThreshold(thresh: number): void {
    if (thresh > 0 && thresh < 1) {
      this.confidenceThreshold = thresh;
    }
  }

  public getConfidenceThreshold(): number {
    return this.confidenceThreshold;
  }

  public async checkHealth(): Promise<boolean> {
    if (this.isChecking) return this.status === 'ready';
    this.isChecking = true;
    try {
      // First try via Express proxy /api/yolov5/health
      let res = await fetch(`${this.serviceUrl}/health`).catch(() => null);

      if (!res || !res.ok) {
        // Fallback check directly to localhost:8000
        res = await fetch(`${this.directUrl}/health`).catch(() => null);
        if (res && res.ok) {
          this.serviceUrl = this.directUrl;
        }
      }

      this.status = res && res.ok ? 'ready' : 'offline';
      return this.status === 'ready';
    } catch {
      this.status = 'offline';
      return false;
    } finally {
      this.isChecking = false;
    }
  }

  public async detectRoadProblems(
    source: DetectionInputSource,
    _mimeType: string = 'image/jpeg',
    mode: DetectionMode = 'both'
  ): Promise<DetectionResult> {
    const startTime = performance.now();

    if (mode === 'speed') {
      return {
        detected: false,
        objects: [],
        latencyMs: Math.round(performance.now() - startTime),
        modelUsed: `${this.id} (${this.name})`,
      };
    }

    if (this.isInferring) {
      return {
        detected: false,
        objects: [],
        latencyMs: 0,
        modelUsed: `${this.id} (skipped: concurrent inference)`,
      };
    }

    this.isInferring = true;
    try {
      const base64Data = await this.sourceToBase64(source);

      // Call YOLOv5 endpoint
      const response = await fetch(`${this.serviceUrl}/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64Data,
          confidence: mode === 'potholes' ? 0.035 : this.confidenceThreshold,
          iou: this.iouThreshold,
          mode,
        }),
      });

      if (!response.ok) {
        throw new Error(`YOLOv5 service returned HTTP ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      const latencyMs = Math.round(performance.now() - startTime);

      this.frameCount++;
      this.lastLatencyMs = latencyMs;
      this.lastDetectionsCount = data.objects ? data.objects.length : 0;
      this.status = 'ready';

      const detectedObjects: DetectedObject[] = (data.objects || []).map((o: any) => ({
        type: o.type as HazardType,
        confidence: Number(o.confidence),
        severity: (o.severity || 'medium') as SeverityLevel,
        description: o.description || `[${o.classCode || 'D40'} - ${o.className || 'Pothole'}] Road defect detected`,
        box2d: o.box2d as [number, number, number, number],
        damageClass: o.classCode || (o.type === 'pothole' ? 'D40' : 'D20'),
        visualEvidence: o.description,
      }));

      return {
        detected: detectedObjects.length > 0,
        objects: detectedObjects,
        latencyMs,
        modelUsed: `${this.id} (${this.name})`,
      };
    } catch (err: any) {
      console.warn('[YOLOv5Service] Inference request failed:', err?.message || err);
      this.status = 'offline';
      throw new Error(`YOLOv5 Detection Failed: ${err?.message || 'Check if yolo-service is running'}`);
    } finally {
      this.isInferring = false;
    }
  }

  private async sourceToBase64(source: DetectionInputSource): Promise<string> {
    if (typeof source === 'string') {
      return source;
    }

    let width = 640;
    let height = 480;
    let drawable: CanvasImageSource | null = null;

    if (typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement) {
      width = source.videoWidth || 640;
      height = source.videoHeight || 480;
      drawable = source;
    } else if (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) {
      return source.toDataURL('image/jpeg', 0.85);
    } else if (typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement) {
      width = source.naturalWidth || source.width || 640;
      height = source.naturalHeight || source.height || 480;
      drawable = source;
    }

    if (!this.cachedCanvas) {
      this.cachedCanvas = document.createElement('canvas');
    }
    this.cachedCanvas.width = width;
    this.cachedCanvas.height = height;
    const ctx = this.cachedCanvas.getContext('2d');
    if (ctx && drawable) {
      ctx.drawImage(drawable, 0, 0, width, height);
      return this.cachedCanvas.toDataURL('image/jpeg', 0.85);
    }

    throw new Error('Unsupported image source passed to YOLOv5Service');
  }
}

export const yoloV5DetectionService = new YOLOv5DetectionService();
