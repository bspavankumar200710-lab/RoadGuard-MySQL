import * as ort from 'onnxruntime-web';
import { IAIDetectionService } from './aiDetectionService';
import { DetectionResult, DetectedObject, DetectionMode, HazardType, SeverityLevel } from '../types/detection';

/**
 * =========================================================================
 * YOLOv8 Road Damage Detection Service (ONNX Runtime Web)
 * =========================================================================
 *
 * Runs on-device edge inference using the YOLOv8 Nano model trained on
 * road damage classes:
 *  - D00: Longitudinal cracks
 *  - D10: Transverse cracks
 *  - D20: Alligator cracks
 *  - D40: Potholes
 *
 * Model location: /models/yolov8n-road.onnx
 * Input shape:  [1, 3, 640, 640] (RGB, float32, normalized to [0, 1])
 * Output shape: [1, 8, 8400] ([cx, cy, w, h, D00, D10, D20, D40])
 */

export type RoadDamageClassCode = 'D00' | 'D10' | 'D20' | 'D40';

export interface RoadDamageClassInfo {
  code: RoadDamageClassCode;
  name: string;
  type: HazardType;
  defaultSeverity: SeverityLevel;
  description: string;
}

export const ROAD_DAMAGE_CLASSES: Record<number, RoadDamageClassInfo> = {
  0: {
    code: 'D00',
    name: 'Longitudinal Crack',
    type: 'road_crack',
    defaultSeverity: 'medium',
    description: 'D00 Longitudinal Crack: Fracture parallel to the traffic direction',
  },
  1: {
    code: 'D10',
    name: 'Transverse Crack',
    type: 'road_crack',
    defaultSeverity: 'medium',
    description: 'D10 Transverse Crack: Fracture perpendicular across the traffic lane',
  },
  2: {
    code: 'D20',
    name: 'Alligator Crack',
    type: 'road_crack',
    defaultSeverity: 'high',
    description: 'D20 Alligator Crack: Severe structural interconnected fatigue fracture',
  },
  3: {
    code: 'D40',
    name: 'Pothole',
    type: 'pothole',
    defaultSeverity: 'high',
    description: 'D40 Pothole: Deep road cavity / asphalt structural depression',
  },
};

export type ModelLoadingStatus = 'idle' | 'loading' | 'ready' | 'error';

interface RawDetection {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  score: number;
  classId: number;
}

export class YOLOv8DetectionService implements IAIDetectionService {
  public readonly id = 'yolov8-nano';
  public readonly name = 'YOLOv8-nano (Edge ONNX - Road Damage)';
  public readonly version = 'v1.0-RDD';

  private session: ort.InferenceSession | null = null;
  private status: ModelLoadingStatus = 'idle';
  private loadingPromise: Promise<boolean> | null = null;
  private lastError: string | null = null;
  private modelLoadTimeMs: number = 0;

  // Inference tuning parameters
  private confidenceThreshold = 0.25; // Standard YOLOv8 detection threshold
  private iouThreshold = 0.45; // NMS IoU threshold
  private targetInputSize = 640;
  private modelPath = '/models/yolov8n-road.onnx';

  constructor() {
    this.configureWasmEnvironment();
  }

  public get isReady(): boolean {
    return this.status === 'ready' && this.session !== null;
  }

  public getStatus(): {
    status: ModelLoadingStatus;
    error: string | null;
    isReady: boolean;
    loadTimeMs: number;
    modelPath: string;
    classes: typeof ROAD_DAMAGE_CLASSES;
  } {
    return {
      status: this.status,
      error: this.lastError,
      isReady: this.isReady,
      loadTimeMs: this.modelLoadTimeMs,
      modelPath: this.modelPath,
      classes: ROAD_DAMAGE_CLASSES,
    };
  }

  public setConfidenceThreshold(threshold: number): void {
    if (threshold > 0 && threshold < 1) {
      this.confidenceThreshold = threshold;
    }
  }

  public getConfidenceThreshold(): number {
    return this.confidenceThreshold;
  }

  public setIouThreshold(threshold: number): void {
    if (threshold > 0 && threshold < 1) {
      this.iouThreshold = threshold;
    }
  }

  public getIouThreshold(): number {
    return this.iouThreshold;
  }

  /**
   * Configures ONNX Runtime Web for browser environments.
   * Uses single-thread WASM to prevent SharedArrayBuffer / COOP issues in iframes.
   */
  


private configureWasmEnvironment(): void {
  if (typeof window !== 'undefined' && ort?.env?.wasm) {
    // Disable worker threads for browser compatibility
    ort.env.wasm.numThreads = 1;

    // Explicitly specify matching ONNX Runtime 1.31.1 files
    ort.env.wasm.wasmPaths = {
      mjs: new URL(
        '/wasm/ort-wasm-simd-threaded.mjs',
        window.location.href
      ).href,
      wasm: new URL(
        '/wasm/ort-wasm-simd-threaded.wasm',
        window.location.href
      ).href,
    };

    console.log('[YOLOv8Service] WASM configuration:', ort.env.wasm.wasmPaths);
  }
}




  /**
   * Initializes and loads the YOLOv8 ONNX model session.
   * Safe to call multiple times; returns the in-flight promise if already loading.
   */
  public async loadModel(customPath?: string): Promise<boolean> {
    if (this.isReady) {
      return true;
    }

    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    const targetPath = customPath || this.modelPath;
    this.status = 'loading';
    this.lastError = null;
    const startLoad = performance.now();

    this.loadingPromise = (async () => {
      try {
        console.log(`[YOLOv8Service] Initializing session from: ${targetPath}`);

        // Fetch model buffer to provide clear HTTP errors and avoid URL resolution issues
        let modelData: ArrayBuffer | string = targetPath;
        if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
          const response = await fetch(targetPath);
          if (!response.ok) {
            throw new Error(
              `HTTP ${response.status} ${response.statusText} while fetching model at ${targetPath}. Verify public/models/yolov8n-road.onnx is present.`
            );
          }
          modelData = await response.arrayBuffer();
        }

        const sessionOptions: ort.InferenceSession.SessionOptions = {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all',
        };

        const sessionInput = modelData instanceof ArrayBuffer ? new Uint8Array(modelData) : modelData;
        if (typeof sessionInput === 'string') {
          this.session = await ort.InferenceSession.create(sessionInput, sessionOptions);
        } else {
          this.session = await ort.InferenceSession.create(sessionInput, sessionOptions);
        }

        // Verify model input and output names
        const inputNames = this.session.inputNames;
        const outputNames = this.session.outputNames;
        console.log(`[YOLOv8Service] Model session ready. Inputs: [${inputNames.join(', ')}], Outputs: [${outputNames.join(', ')}]`);

        // Perform a lightweight warm-up inference to compile WASM kernels
        try {
          const warmUpTensor = new ort.Tensor(
            'float32',
            new Float32Array(1 * 3 * this.targetInputSize * this.targetInputSize),
            [1, 3, this.targetInputSize, this.targetInputSize]
          );
          const inputName = inputNames[0] || 'images';
          await this.session.run({ [inputName]: warmUpTensor });
          console.log('[YOLOv8Service] Warm-up inference completed successfully.');
        } catch (warmUpErr) {
          console.warn('[YOLOv8Service] Warm-up run non-fatal warning:', warmUpErr);
        }

        this.modelLoadTimeMs = Math.round(performance.now() - startLoad);
        this.status = 'ready';
        this.lastError = null;
        return true;
      } catch (err: any) {
        console.error('[YOLOv8Service] Failed to load ONNX model:', err);
        this.status = 'error';
        this.lastError = err?.message || 'Failed to initialize ONNX Runtime Web session';
        this.session = null;
        throw new Error(
          `YOLOv8 Model Load Failed: ${this.lastError}. Ensure '/models/yolov8n-road.onnx' is accessible.`
        );
      } finally {
        this.loadingPromise = null;
      }
    })();

    return this.loadingPromise;
  }

  /**
   * Performs end-to-end detection on a camera frame or photo snapshot.
   * Preprocesses image (letterbox + RGB normalization), runs ONNX inference,
   * decodes YOLOv8 outputs, executes NMS, and maps to D00-D40 road damage classes.
   */
  public async detectRoadProblems(
    imageBase64: string,
    _mimeType: string = 'image/jpeg',
    mode: DetectionMode = 'both'
  ): Promise<DetectionResult> {
    const startTime = performance.now();

    // If target mode is speed-only, YOLOv8 road damage model detects surface damage, not speeds
    if (mode === 'speed') {
      return {
        detected: false,
        objects: [],
        latencyMs: Math.round(performance.now() - startTime),
        modelUsed: `${this.id} (${this.name})`,
      };
    }

    if (!imageBase64) {
      throw new Error('[YOLOv8Service] detectRoadProblems called with empty image data.');
    }

    // Ensure model is loaded
    if (!this.isReady) {
      console.log('[YOLOv8Service] Model not yet loaded. Triggering on-demand load...');
      await this.loadModel();
    }

    if (!this.session) {
      throw new Error(
        `[YOLOv8Service] Model session unavailable: ${this.lastError || 'InferenceSession is null'}`
      );
    }

    try {
      // 1. Preprocessing: Letterbox resize to 640x640 and normalize RGB float32
      const { tensor, origW, origH, scale, padX, padY } = await this.preprocessImage(imageBase64);

      // 2. Inference execution
      const inputName = this.session.inputNames[0] || 'images';
      const results = await this.session.run({ [inputName]: tensor });

      // 3. Extract output tensor
      const outputName = this.session.outputNames[0] || 'output0';
      const outputTensor = results[outputName];
      if (!outputTensor) {
        throw new Error(
          `[YOLOv8Service] Output tensor '${outputName}' not found in session results. Available outputs: [${Object.keys(results).join(', ')}]`
        );
      }

      const outputData = outputTensor.data as Float32Array;
      console.log('[YOLOv8Service] Output tensor dimensions:', outputTensor.dims);
      console.log('[YOLOv8Service] Output tensor length:', outputData.length);

      // 4. Output decoding and Non-Maximum Suppression (NMS)
      const detectedObjects = this.postprocess(
        outputData,
        origW,
        origH,
        scale,
        padX,
        padY
      );

      const latencyMs = Math.round(performance.now() - startTime);

      return {
        detected: detectedObjects.length > 0,
        objects: detectedObjects,
        latencyMs,
        modelUsed: `${this.id} (${this.name} - D00/D10/D20/D40)`,
      };
    } catch (err: any) {
      console.error('[YOLOv8Service] Detection error during inference:', err);
      throw new Error(`YOLOv8 Detection Failed: ${err?.message || 'Unknown inference error'}`);
    }
  }

  /**
   * Preprocesses an image into a letterboxed 1x3x640x640 Float32Array tensor.
   * Maintains original aspect ratio with padding and normalizes RGB values to [0.0, 1.0].
   */
  public async preprocessImage(imageBase64: string): Promise<{
    tensor: ort.Tensor;
    origW: number;
    origH: number;
    scale: number;
    padX: number;
    padY: number;
  }> {
    const img = await this.loadImage(imageBase64);
    const origW = img.naturalWidth || img.width || 640;
    const origH = img.naturalHeight || img.height || 640;

    const targetSize = this.targetInputSize;
    const scale = Math.min(targetSize / origW, targetSize / origH);
    const scaledW = Math.round(origW * scale);
    const scaledH = Math.round(origH * scale);
    const padX = Math.floor((targetSize - scaledW) / 2);
    const padY = Math.floor((targetSize - scaledH) / 2);

    // Create offscreen canvas for letterboxing
    const canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(targetSize, targetSize)
        : document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;

    const ctx = canvas.getContext('2d') as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;

    if (!ctx) {
      throw new Error('[YOLOv8Service] Failed to obtain 2D rendering context for preprocessing.');
    }

    // Fill with neutral YOLO letterbox gray (114, 114, 114)
    ctx.fillStyle = '#727272';
    ctx.fillRect(0, 0, targetSize, targetSize);

    // Draw scaled image centered in the canvas
    ctx.drawImage(img, padX, padY, scaledW, scaledH);

    const imageData = ctx.getImageData(0, 0, targetSize, targetSize);
    const rgba = imageData.data;
    const numPixels = targetSize * targetSize;

    // Convert RGBA HWC to NCHW Float32Array [1, 3, 640, 640] with RGB in [0.0, 1.0]
    const floatData = new Float32Array(3 * numPixels);
    const channelOffsetG = numPixels;
    const channelOffsetB = numPixels * 2;

    for (let i = 0; i < numPixels; i++) {
      const r = rgba[i * 4] / 255.0;
      const g = rgba[i * 4 + 1] / 255.0;
      const b = rgba[i * 4 + 2] / 255.0;

      floatData[i] = r;
      floatData[channelOffsetG + i] = g;
      floatData[channelOffsetB + i] = b;
    }

    const tensor = new ort.Tensor('float32', floatData, [1, 3, targetSize, targetSize]);

    return { tensor, origW, origH, scale, padX, padY };
  }

  /**
   * Decodes the raw [1, 8, 8400] output tensor, maps back to original image coordinates,
   * applies non-maximum suppression (NMS), and generates DetectedObject records.
   */
  private postprocess(
    outputData: Float32Array,
    origW: number,
    origH: number,
    scale: number,
    padX: number,
    padY: number
  ): DetectedObject[] {
    const numAnchors = 8400; // 640x640 features: 80x80 + 40x40 + 20x20
    const numClasses = 4; // D00, D10, D20, D40
    const rawCandidates: RawDetection[] = [];

    // Parse each anchor column
    for (let col = 0; col < numAnchors; col++) {
      // Find the best class prediction for this anchor
      let maxScore = -1;
      let bestClass = -1;

      for (let c = 0; c < numClasses; c++) {
        // Class scores start at row index 4 (rows 0..3 are cx, cy, w, h)
        const score = outputData[(4 + c) * numAnchors + col];
        if (score > maxScore) {
          maxScore = score;
          bestClass = c;
        }
      }

      // Filter by confidence threshold
      if (maxScore >= this.confidenceThreshold && bestClass >= 0) {
        const cx = outputData[0 * numAnchors + col];
        const cy = outputData[1 * numAnchors + col];
        const w = outputData[2 * numAnchors + col];
        const h = outputData[3 * numAnchors + col];

        // Box in letterboxed 640x640 space
        const x1_640 = cx - w / 2;
        const y1_640 = cy - h / 2;
        const x2_640 = cx + w / 2;
        const y2_640 = cy + h / 2;

        // Inverse letterbox transform to original image pixel coordinates
        const origX1 = Math.max(0, Math.min(origW, (x1_640 - padX) / scale));
        const origY1 = Math.max(0, Math.min(origH, (y1_640 - padY) / scale));
        const origX2 = Math.max(0, Math.min(origW, (x2_640 - padX) / scale));
        const origY2 = Math.max(0, Math.min(origH, (y2_640 - padY) / scale));

        // Skip degenerate boxes
        if (origX2 > origX1 && origY2 > origY1) {
          rawCandidates.push({
            x1: origX1,
            y1: origY1,
            x2: origX2,
            y2: origY2,
            score: maxScore,
            classId: bestClass,
          });
        }
      }
    }

    if (rawCandidates.length === 0) {
      return [];
    }

    // Apply Non-Maximum Suppression (NMS)
    const filteredBoxes = this.nonMaxSuppression(rawCandidates, this.iouThreshold);

    // Map each surviving detection to DetectedObject
    return filteredBoxes.map((box) => {
      const classInfo = ROAD_DAMAGE_CLASSES[box.classId] || {
        code: 'D40',
        name: 'Road Hazard',
        type: 'pothole',
        defaultSeverity: 'high',
        description: 'Road damage defect',
      };

      // Compute normalized box2d: [ymin, xmin, ymax, xmax] in 0-1000 scale
      const ymin = Math.max(0, Math.min(1000, Math.round((box.y1 / origH) * 1000)));
      const xmin = Math.max(0, Math.min(1000, Math.round((box.x1 / origW) * 1000)));
      const ymax = Math.max(0, Math.min(1000, Math.round((box.y2 / origH) * 1000)));
      const xmax = Math.max(0, Math.min(1000, Math.round((box.x2 / origW) * 1000)));

      // Determine severity dynamically
      const boxAreaRatio = ((box.x2 - box.x1) * (box.y2 - box.y1)) / (origW * origH);
      let severity: SeverityLevel = classInfo.defaultSeverity;

      if (classInfo.code === 'D40' || classInfo.code === 'D20') {
        // Potholes and Alligator cracks are severe road safety defects
        severity = box.score > 0.35 || boxAreaRatio > 0.02 ? 'high' : 'medium';
      } else {
        // D00 (Longitudinal) and D10 (Transverse) cracks
        if (boxAreaRatio > 0.05 || box.score > 0.7) {
          severity = 'high';
        } else if (boxAreaRatio > 0.015 || box.score > 0.4) {
          severity = 'medium';
        } else {
          severity = 'low';
        }
      }

      const confPercent = Math.round(box.score * 100);

      return {
        type: classInfo.type,
        confidence: Number(box.score.toFixed(3)),
        severity,
        description: `[${classInfo.code} - ${classInfo.name}] ${classInfo.description} (${confPercent}% confidence)`,
        box2d: [ymin, xmin, ymax, xmax],
      };
    });
  }

  /**
   * Non-Maximum Suppression (NMS) algorithm.
   * Sorts candidate boxes by score and eliminates overlapping duplicates based on IoU.
   */
  private nonMaxSuppression(boxes: RawDetection[], iouThreshold: number): RawDetection[] {
    boxes.sort((a, b) => b.score - a.score);

    const selected: RawDetection[] = [];

    for (const box of boxes) {
      if (selected.length >= 30) break; // Sensible max detections per frame

      let keep = true;
      for (const prev of selected) {
        // Per-class NMS (or cross-class if high overlap)
        const iou = this.computeIoU(box, prev);
        if (box.classId === prev.classId) {
          if (iou > iouThreshold) {
            keep = false;
            break;
          }
        } else if (iou > 0.75) {
          // Cross-class heavy overlap: keep higher confidence prediction
          keep = false;
          break;
        }
      }

      if (keep) {
        selected.push(box);
      }
    }

    return selected;
  }

  /**
   * Computes Intersection over Union (IoU) of two bounding boxes.
   */
  private computeIoU(a: RawDetection, b: RawDetection): number {
    const x1 = Math.max(a.x1, b.x1);
    const y1 = Math.max(a.y1, b.y1);
    const x2 = Math.min(a.x2, b.x2);
    const y2 = Math.min(a.y2, b.y2);

    const w = Math.max(0, x2 - x1);
    const h = Math.max(0, y2 - y1);
    const intersection = w * h;

    const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
    const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
    const union = areaA + areaB - intersection;

    if (union <= 0) return 0;
    return intersection / union;
  }

  /**
   * Loads an image element from base64 data string.
   */
  private loadImage(imageBase64: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = (e) =>
        reject(new Error(`Failed to decode image data for YOLOv8 inference: ${e}`));

      const src = imageBase64.startsWith('data:')
        ? imageBase64
        : `data:image/jpeg;base64,${imageBase64}`;
      img.src = src;
    });
  }
}

export const yoloV8DetectionService = new YOLOv8DetectionService();

// Auto-trigger background model load in browser environment so session is warm
if (typeof window !== 'undefined') {
  // Defer slightly after initial page paint
  setTimeout(() => {
    yoloV8DetectionService.loadModel().catch((err) => {
      console.warn('[YOLOv8Service] Background initial load deferred/retrying on demand:', err.message);
    });
  }, 1000);
}
