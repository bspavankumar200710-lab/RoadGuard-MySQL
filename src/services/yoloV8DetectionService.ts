import * as ort from 'onnxruntime-web';
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

  // Tensor inspection metadata
  private inputTensorName = 'images';
  private outputTensorName = 'output0';
  private inputDims = [1, 3, 640, 640];
  private outputDims = [1, 8, 8400];

  // Runtime telemetry
  private frameCount = 0;
  private lastInferenceLatencyMs = 0;
  private lastDetectionsCount = 0;
  private isInferring = false;

  // Reusable buffers and canvases to avoid per-frame GC pauses
  private offscreenCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private offscreenCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
  private inputBuffer: Float32Array = new Float32Array(1 * 3 * 640 * 640);

  constructor() {
    this.configureWasmEnvironment();
  }

  public get isReady(): boolean {
    return this.status === 'ready' && this.session !== null;
  }

  public get hasOnnxSession(): boolean {
    return this.status === 'ready' && this.session !== null;
  }

  public get isUsingFallback(): boolean {
    return false;
  }

  public getStatus() {
    return {
      status: this.status,
      error: this.lastError,
      isReady: this.isReady,
      hasOnnxSession: this.hasOnnxSession,
      usingEdgeFallback: false,
      loadTimeMs: this.modelLoadTimeMs,
      modelPath: this.modelPath,
      classes: ROAD_DAMAGE_CLASSES,
      confidenceThreshold: this.confidenceThreshold,
      iouThreshold: this.iouThreshold,
      frameCount: this.frameCount,
      lastInferenceLatencyMs: this.lastInferenceLatencyMs,
      lastDetectionsCount: this.lastDetectionsCount,
      inputShape: this.inputDims,
      outputShape: this.outputDims,
      backend: 'wasm' as const,
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
   * Uses single-thread WASM for maximum cross-browser compatibility.
   */
  private configureWasmEnvironment(): void {
    if (typeof window !== 'undefined' && ort?.env?.wasm) {
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.simd = true;
      ort.env.wasm.proxy = false;

      const origin = window.location.origin || '';
      const wasmPrefix = `${origin}/wasm/`;

      ort.env.wasm.wasmPaths = {
        mjs: `${wasmPrefix}ort-wasm-simd-threaded.mjs`,
        wasm: `${wasmPrefix}ort-wasm-simd-threaded.wasm`,
      };

      console.log('[YOLOv8Service] ONNX Runtime Web configured:', ort.env.wasm.wasmPaths);
    }
  }

  /**
   * Initializes and loads the YOLOv8 ONNX model session once and reuses it.
   * If loading fails, sets status to 'error' and reports the exact failure.
   */
  public async loadModel(customPath?: string): Promise<boolean> {
    if (this.session && this.status === 'ready') {
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
        console.log(`[YOLOv8Service] Initializing road damage ONNX model from: ${targetPath}`);

        let modelBytes: Uint8Array | null = null;

        if (typeof fetch !== 'undefined') {
          const response = await fetch(targetPath);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText} when fetching model weights from ${targetPath}`);
          }

          const contentType = (response.headers.get('content-type') || '').toLowerCase();
          if (contentType.includes('text/html') || contentType.includes('application/json')) {
            throw new Error(`Server returned '${contentType}' instead of binary ONNX weights for ${targetPath}`);
          }

          const buffer = await response.arrayBuffer();
          const bytes = new Uint8Array(buffer);

          // Guard against HTML error pages or empty payload
          if (bytes.byteLength < 1024 || (bytes[0] === 0x3c && (bytes[1] === 0x21 || bytes[1] === 0x68))) {
            throw new Error(`Downloaded model file appears corrupted or is an HTML error page (${bytes.byteLength} bytes)`);
          }

          modelBytes = bytes;
        }

        if (!modelBytes || modelBytes.byteLength === 0) {
          throw new Error(`Failed to read model bytes from ${targetPath}`);
        }

        const sessionOptions: ort.InferenceSession.SessionOptions = {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all',
        };

        this.session = await ort.InferenceSession.create(modelBytes, sessionOptions);

        if (this.session.inputNames.length > 0) {
          this.inputTensorName = this.session.inputNames[0];
        }
        if (this.session.outputNames.length > 0) {
          this.outputTensorName = this.session.outputNames[0];
        }

        // Lightweight warm-up inference to compile WASM kernels before real-time camera starts
        try {
          const warmUpTensor = new ort.Tensor(
            'float32',
            new Float32Array(1 * 3 * this.targetInputSize * this.targetInputSize),
            [1, 3, this.targetInputSize, this.targetInputSize]
          );
          const warmUpResults = await this.session.run({ [this.inputTensorName]: warmUpTensor });
          const outTensor = warmUpResults[this.outputTensorName];
          if (outTensor?.dims) {
            this.outputDims = Array.from(outTensor.dims);
          }
        } catch (warmUpErr) {
          console.warn('[YOLOv8Service] Warm-up inference warning (non-fatal):', warmUpErr);
        }

        this.modelLoadTimeMs = Math.round(performance.now() - startLoad);
        this.status = 'ready';
        this.lastError = null;

        console.log(
          `[YOLOv8Service] YOLOv8 model loaded successfully in ${this.modelLoadTimeMs}ms. Inputs: [${this.inputTensorName}], Outputs: [${this.outputTensorName}] shape: ${JSON.stringify(this.outputDims)}`
        );
        return true;
      } catch (err: any) {
        this.session = null;
        this.status = 'error';
        this.lastError = err?.message || String(err);
        console.error('[YOLOv8Service] YOLOv8 model loading failed:', this.lastError);
        throw err;
      } finally {
        this.loadingPromise = null;
      }
    })();

    return this.loadingPromise;
  }

  /**
   * Performs end-to-end detection on a camera frame, canvas, or photo snapshot.
   * Preprocesses image (letterbox + RGB normalization), runs ONNX inference,
   * decodes YOLOv8 outputs, executes NMS, and maps to D00-D40 road damage classes.
   *
   * Supports HTMLVideoElement directly to bypass unnecessary base64 conversions in live camera loops.
   */
  public async detectRoadProblems(
    source: DetectionInputSource,
    _mimeType: string = 'image/jpeg',
    mode: DetectionMode = 'both'
  ): Promise<DetectionResult> {
    const startTime = performance.now();

    // Mode filter: YOLOv8 model detects surface damage, not vehicle speeds
    if (mode === 'speed') {
      return {
        detected: false,
        objects: [],
        latencyMs: Math.round(performance.now() - startTime),
        modelUsed: `${this.id} (${this.name})`,
      };
    }

    if (!source) {
      throw new Error('[YOLOv8Service] detectRoadProblems called with empty input source.');
    }

    // Ensure model session is ready
    if (!this.session) {
      if (this.status !== 'loading') {
        await this.loadModel();
      } else if (this.loadingPromise) {
        await this.loadingPromise;
      }
    }

    if (!this.session) {
      throw new Error(`[YOLOv8Service] ONNX session unavailable. Current status: ${this.status}. Error: ${this.lastError || 'None'}`);
    }

    // Prevent overlapping inference calls
    if (this.isInferring) {
      return {
        detected: false,
        objects: [],
        latencyMs: 0,
        modelUsed: `${this.id} (skipped: concurrent inference in progress)`,
      };
    }

    this.isInferring = true;
    try {
      // 1. Preprocessing: Letterbox resize to 640x640 and normalize RGB float32
      const { tensor, origW, origH, scale, padX, padY } = await this.preprocessImage(source);

      // 2. Inference execution
      const inputName = this.inputTensorName || this.session.inputNames[0] || 'images';
      const results = await this.session.run({ [inputName]: tensor });

      // 3. Extract output tensor
      const outputName = this.outputTensorName || this.session.outputNames[0] || 'output0';
      const outputTensor = results[outputName];
      if (!outputTensor) {
        throw new Error(
          `[YOLOv8Service] Output tensor '${outputName}' not found in session results. Available outputs: [${Object.keys(results).join(', ')}]`
        );
      }

      const outputData = outputTensor.data as Float32Array;
      const dims = Array.from(outputTensor.dims);

      // 4. Output decoding and Non-Maximum Suppression (NMS)
      let detectedObjects = this.postprocess(
        outputData,
        dims,
        origW,
        origH,
        scale,
        padX,
        padY
      );

      // Filter by mode
      if (mode === 'potholes') {
        detectedObjects = detectedObjects.filter((o) => o.type === 'pothole');
      }

      const latencyMs = Math.round(performance.now() - startTime);

      // Update real telemetry
      this.frameCount++;
      this.lastInferenceLatencyMs = latencyMs;
      this.lastDetectionsCount = detectedObjects.length;

      // Throttled logging: log on frame 1, every 100 frames, or occasionally when damage detected
      if (
        this.frameCount === 1 ||
        this.frameCount % 100 === 0 ||
        (detectedObjects.length > 0 && this.frameCount % 25 === 0)
      ) {
        console.log(
          `[YOLOv8Service] Frame #${this.frameCount} (${latencyMs}ms): ${detectedObjects.length} road damage detection(s) [threshold=${this.confidenceThreshold}]`
        );
      }

      return {
        detected: detectedObjects.length > 0,
        objects: detectedObjects,
        latencyMs,
        modelUsed: `${this.id} (${this.name} - D00/D10/D20/D40)`,
      };
    } catch (err: any) {
      console.error('[YOLOv8Service] Detection error during inference:', err);
      throw new Error(`YOLOv8 Detection Failed: ${err?.message || 'Unknown inference error'}`);
    } finally {
      this.isInferring = false;
    }
  }

  /**
   * Preprocesses an input source (video, canvas, image, base64) into a letterboxed
   * 1x3x640x640 Float32Array tensor.
   * Maintains original aspect ratio with padding and normalizes RGB values to [0.0, 1.0].
   */
  public async preprocessImage(source: DetectionInputSource): Promise<{
    tensor: ort.Tensor;
    origW: number;
    origH: number;
    scale: number;
    padX: number;
    padY: number;
  }> {
    let drawable: CanvasImageSource | null = null;
    let origW = 640;
    let origH = 640;

    if (typeof source === 'string') {
      const img = await this.loadImage(source);
      origW = img.naturalWidth || img.width || 640;
      origH = img.naturalHeight || img.height || 640;
      drawable = img;
    } else if (typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement) {
      origW = source.videoWidth;
      origH = source.videoHeight;
      if (!origW || !origH) {
        throw new Error('[YOLOv8Service] Video frame dimensions are 0x0. Camera may not have finished starting.');
      }
      drawable = source;
    } else if (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) {
      origW = source.width;
      origH = source.height;
      drawable = source;
    } else if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
      origW = source.width;
      origH = source.height;
      drawable = source;
    } else if (typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement) {
      origW = source.naturalWidth || source.width || 640;
      origH = source.naturalHeight || source.height || 640;
      drawable = source;
    } else if (typeof ImageData !== 'undefined' && source instanceof ImageData) {
      origW = source.width;
      origH = source.height;
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = origW;
      tempCanvas.height = origH;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.putImageData(source, 0, 0);
        drawable = tempCanvas;
      }
    }

    if (!drawable) {
      throw new Error('[YOLOv8Service] Unsupported or invalid image source passed to preprocessImage.');
    }

    const targetSize = this.targetInputSize;
    const scale = Math.min(targetSize / origW, targetSize / origH);
    const scaledW = Math.round(origW * scale);
    const scaledH = Math.round(origH * scale);
    const padX = Math.floor((targetSize - scaledW) / 2);
    const padY = Math.floor((targetSize - scaledH) / 2);

    // Reuse offscreen canvas with willReadFrequently optimization
    if (!this.offscreenCanvas) {
      if (typeof OffscreenCanvas !== 'undefined') {
        this.offscreenCanvas = new OffscreenCanvas(targetSize, targetSize);
      } else if (typeof document !== 'undefined') {
        const c = document.createElement('canvas');
        c.width = targetSize;
        c.height = targetSize;
        this.offscreenCanvas = c;
      }
    }

    if (!this.offscreenCtx && this.offscreenCanvas) {
      this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true }) as any;
    }

    const ctx = this.offscreenCtx;
    if (!ctx) {
      throw new Error('[YOLOv8Service] Failed to obtain 2D rendering context for preprocessing.');
    }

    // Fill with neutral YOLO letterbox gray (114, 114, 114)
    ctx.fillStyle = '#727272';
    ctx.fillRect(0, 0, targetSize, targetSize);

    // Draw scaled image centered in the canvas
    ctx.drawImage(drawable, padX, padY, scaledW, scaledH);

    const imageData = ctx.getImageData(0, 0, targetSize, targetSize);
    const rgba = imageData.data;
    const numPixels = targetSize * targetSize;

    // Convert RGBA HWC to RGB Planar NCHW Float32Array [1, 3, 640, 640] normalized to [0.0, 1.0]
    const floatData = this.inputBuffer;
    const channelOffsetG = numPixels;
    const channelOffsetB = numPixels * 2;

    for (let i = 0; i < numPixels; i++) {
      const i4 = i * 4;
      floatData[i] = rgba[i4] / 255.0;                     // R channel
      floatData[channelOffsetG + i] = rgba[i4 + 1] / 255.0; // G channel
      floatData[channelOffsetB + i] = rgba[i4 + 2] / 255.0; // B channel
    }

    const tensor = new ort.Tensor('float32', floatData, [1, 3, targetSize, targetSize]);
    return { tensor, origW, origH, scale, padX, padY };
  }

  /**
   * Decodes the raw output tensor, dynamically handles channel ordering,
   * maps back to original image coordinates, applies NMS, and creates DetectedObject records.
   */
  private postprocess(
    outputData: Float32Array,
    dims: number[],
    origW: number,
    origH: number,
    scale: number,
    padX: number,
    padY: number
  ): DetectedObject[] {
    const numClasses = 4; // D00, D10, D20, D40
    const rawCandidates: RawDetection[] = [];

    // Support both [1, 8, 8400] (channels-first) and [1, 8400, 8] (channels-last)
    const isChannelsFirst = dims.length >= 3 && dims[1] === 4 + numClasses;
    const numAnchors = isChannelsFirst ? dims[2] : (dims[1] || 8400);

    // Parse each anchor
    for (let col = 0; col < numAnchors; col++) {
      let maxScore = -1;
      let bestClass = -1;

      for (let c = 0; c < numClasses; c++) {
        const score = isChannelsFirst
          ? outputData[(4 + c) * numAnchors + col]
          : outputData[col * (4 + numClasses) + (4 + c)];

        if (score > maxScore) {
          maxScore = score;
          bestClass = c;
        }
      }

      // Filter by confidence threshold
      if (maxScore >= this.confidenceThreshold && bestClass >= 0) {
        const cx = isChannelsFirst
          ? outputData[0 * numAnchors + col]
          : outputData[col * (4 + numClasses) + 0];
        const cy = isChannelsFirst
          ? outputData[1 * numAnchors + col]
          : outputData[col * (4 + numClasses) + 1];
        const w = isChannelsFirst
          ? outputData[2 * numAnchors + col]
          : outputData[col * (4 + numClasses) + 2];
        const h = isChannelsFirst
          ? outputData[3 * numAnchors + col]
          : outputData[col * (4 + numClasses) + 3];

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

        // Skip degenerate boxes (must have at least 4x4 pixels)
        if (origX2 - origX1 >= 4 && origY2 - origY1 >= 4) {
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
        // Potholes and Alligator cracks are high road safety concerns
        severity = box.score > 0.45 || boxAreaRatio > 0.02 ? 'high' : 'medium';
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
   * Loads an image element from a base64 data string or URL.
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

// Auto-trigger lightweight readiness check in browser environment without blocking paint
if (typeof window !== 'undefined') {
  setTimeout(() => {
    yoloV8DetectionService.loadModel().catch(() => {});
  }, 1000);
}
