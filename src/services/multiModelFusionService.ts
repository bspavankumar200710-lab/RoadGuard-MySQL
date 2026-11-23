import { IAIDetectionService, DetectionInputSource } from './aiDetectionService';
import { DetectionResult, DetectedObject, DetectionMode, HazardType, SeverityLevel } from '../types/detection';
import { yoloV5DetectionService } from './yoloV5DetectionService';
import { geminiFeedbackService } from './geminiDetectionService';
import {
  compileVerifiedRules,
  CALIBRATION_CORRECTIONS,
  applyVerifiedRulesToDetections,
} from './feedbackEngine';

/**
 * Computes 2D Intersection over Union (IoU) between two normalized boxes [ymin, xmin, ymax, xmax] (0-1000).
 */
function computeBoxIoU(
  boxA: [number, number, number, number],
  boxB: [number, number, number, number]
): number {
  const ymin = Math.max(boxA[0], boxB[0]);
  const xmin = Math.max(boxA[1], boxB[1]);
  const ymax = Math.min(boxA[2], boxB[2]);
  const xmax = Math.min(boxA[3], boxB[3]);

  const interArea = Math.max(0, ymax - ymin) * Math.max(0, xmax - xmin);
  const areaA = Math.max(0, boxA[2] - boxA[0]) * Math.max(0, boxA[3] - boxA[1]);
  const areaB = Math.max(0, boxB[2] - boxB[0]) * Math.max(0, boxB[3] - boxB[1]);
  const unionArea = areaA + areaB - interArea;

  return unionArea > 0 ? interArea / unionArea : 0;
}

/**
 * Checks whether the center point of either box falls within the perimeter of the other box.
 * This guarantees reliable spatial consensus between tightly localized CNN boxes and broader VLM bounding boxes.
 */
function boxContainsCenter(
  boxA: [number, number, number, number],
  boxB: [number, number, number, number]
): boolean {
  const cA_y = (boxA[0] + boxA[2]) / 2.0;
  const cA_x = (boxA[1] + boxA[3]) / 2.0;
  const cB_y = (boxB[0] + boxB[2]) / 2.0;
  const cB_x = (boxB[1] + boxB[3]) / 2.0;

  const aInB = boxB[0] <= cA_y && cA_y <= boxB[2] && boxB[1] <= cA_x && cA_x <= boxB[3];
  const bInA = boxA[0] <= cB_y && cB_y <= boxA[2] && boxA[1] <= cB_x && cB_x <= boxA[3];

  return aInB || bInA;
}

export class MultiModelFusionService implements IAIDetectionService {
  public readonly id = 'roadguard-fusion';
  public readonly name = 'RoadGuard Multi-Model AI (YOLO + Gemini + Feedback Gating)';
  public readonly version = 'v3.5-exhaustive';
  public readonly isReady = true;

  public async detectRoadProblems(
    source: DetectionInputSource,
    mimeType: string = 'image/jpeg',
    mode: DetectionMode = 'both'
  ): Promise<DetectionResult> {
    const startTime = performance.now();

    // In speed-only mode, delegate to Gemini Vision speed perception head
    if (mode === 'speed') {
      return geminiFeedbackService.detectRoadProblems(source, mimeType, mode);
    }

    // Phase 1: Run YOLO High-Density Sliced Detection & Gemini Vision in parallel
    const [yoloResult, geminiResult] = await Promise.all([
      yoloV5DetectionService
        .detectRoadProblems(source, mimeType, mode)
        .catch((err) => {
          console.warn('[MultiModelFusion] YOLO detection exception:', err?.message || err);
          return { detected: false, objects: [], latencyMs: 0, modelUsed: 'yolo-offline' };
        }),
      geminiFeedbackService
        .detectRoadProblems(source, mimeType, mode)
        .catch((err) => {
          console.warn('[MultiModelFusion] Gemini vision exception:', err?.message || err);
          return { detected: false, objects: [], latencyMs: 0, modelUsed: 'gemini-offline' };
        }),
    ]);

    const verifiedRules = compileVerifiedRules(CALIBRATION_CORRECTIONS);

    // Phase 2: Independent Feedback Gating Engine Verification
    const gatedYOLO = applyVerifiedRulesToDetections(yoloResult.objects || [], verifiedRules).keptObjects;
    const gatedGemini = applyVerifiedRulesToDetections(geminiResult.objects || [], verifiedRules).keptObjects;

    // Phase 3: High-Precision Complementary Consensus & Multi-Model Fusion
    const fusedList: DetectedObject[] = [];
    const matchedYOLOIndices = new Set<number>();

    // 3A. Match Gemini detections with YOLO localized boxes
    for (const geminiObj of gatedGemini) {
      if (mode === 'potholes' && geminiObj.type !== 'pothole') {
        continue;
      }

      if (!geminiObj.box2d) {
        // If Gemini did not provide localized box, preserve as scene-level hazard
        fusedList.push({
          ...geminiObj,
          description: `[Gemini Semantic Detection] ${geminiObj.description}`,
        });
        continue;
      }

      let bestMatchIdx = -1;
      let highestIoU = 0;

      for (let i = 0; i < gatedYOLO.length; i++) {
        if (matchedYOLOIndices.has(i)) continue;
        const yoloObj = gatedYOLO[i];
        if (!yoloObj.box2d) continue;

        const iou = computeBoxIoU(geminiObj.box2d, yoloObj.box2d);
        const contains = boxContainsCenter(geminiObj.box2d, yoloObj.box2d);

        if (iou >= 0.12 || contains) {
          if (iou > highestIoU || highestIoU === 0) {
            highestIoU = Math.max(iou, 0.20);
            bestMatchIdx = i;
          }
        }
      }

      if (bestMatchIdx >= 0) {
        // Consensus Confirmed: Both YOLO and Gemini detected this physical pothole!
        matchedYOLOIndices.add(bestMatchIdx);
        const yoloMatch = gatedYOLO[bestMatchIdx];
        const boostedConfidence = Number(
          Math.min(0.99, Math.max(yoloMatch.confidence, geminiObj.confidence) + 0.08).toFixed(3)
        );

        fusedList.push({
          type: 'pothole',
          confidence: boostedConfidence,
          severity:
            yoloMatch.severity === 'high' || geminiObj.severity === 'high'
              ? 'high'
              : 'medium',
          description: `[AI Consensus Confirmed: YOLO + Gemini] ${yoloMatch.description}. Verified by Gemini: ${geminiObj.description}`,
          box2d: yoloMatch.box2d, // High-precision pixel bounding box from YOLO
          damageClass: 'D40',
          visualEvidence: geminiObj.visualEvidence || yoloMatch.description,
        });
      } else {
        // Gemini-only detection: Preserve genuine detection even when YOLO missed it
        if (geminiObj.confidence >= 0.40) {
          fusedList.push({
            ...geminiObj,
            type: 'pothole',
            damageClass: 'D40',
            description: `[Gemini Vision Verified Pothole] ${geminiObj.description}`,
          });
        }
      }
    }

    // 3B. Preserve YOLO-only detections: genuine localized defects captured by tiled YOLO
    const sceneHasDamage = gatedGemini.length > 0;

    for (let i = 0; i < gatedYOLO.length; i++) {
      if (matchedYOLOIndices.has(i)) continue;
      const yoloObj = gatedYOLO[i];

      // In potholes mode, preserve D40 potholes or alligator-cracked asphalt cavities
      if (mode === 'potholes') {
        const isPotholeOrCavity =
          yoloObj.type === 'pothole' ||
          yoloObj.damageClass === 'D40' ||
          (yoloObj.damageClass === 'D20' && yoloObj.box2d && yoloObj.box2d[0] >= 180); // Road surface cavities

        // If Gemini verified damage on the road, retain all localized pothole candidates down to 0.04.
        // If Gemini verified a clean road, require high confidence (>= 0.25) to prevent false positives.
        const minYoloConf = sceneHasDamage ? 0.04 : 0.25;

        if (isPotholeOrCavity && yoloObj.confidence >= minYoloConf) {
          fusedList.push({
            ...yoloObj,
            type: 'pothole',
            damageClass: 'D40',
            description: `[YOLO Sliced Pothole] ${yoloObj.description}`,
          });
        }
      } else {
        if (yoloObj.confidence >= 0.12) {
          fusedList.push({
            ...yoloObj,
            description: `[YOLO Sliced Detector] ${yoloObj.description}`,
          });
        }
      }
    }

    // Phase 4: Spatial Deduplication while strictly preserving separate nearby potholes
    // Cluster boxes of the same hazard type with IoU >= 0.40 into single representative
    const finalKept: DetectedObject[] = [];
    const sortedFused = [...fusedList].sort((a, b) => b.confidence - a.confidence);

    for (const cand of sortedFused) {
      if (mode === 'potholes' && cand.type !== 'pothole') {
        continue;
      }

      if (!cand.box2d) {
        finalKept.push(cand);
        continue;
      }

      let isDuplicateOfExisting = false;
      for (const existing of finalKept) {
        if (!existing.box2d) continue;
        if (existing.type !== cand.type) continue;

        const iou = computeBoxIoU(cand.box2d, existing.box2d);
        if (iou >= 0.40) {
          // It's the same physical hazard; existing already has higher confidence
          isDuplicateOfExisting = true;
          break;
        }
      }

      if (!isDuplicateOfExisting) {
        if (!cand.decisionCategory) {
          cand.decisionCategory = cand.confidence >= 0.65 ? 'confirmed_pothole' : 'uncertain_candidate';
        }
        finalKept.push(cand);
      }
    }

    const totalLatencyMs = Math.round(performance.now() - startTime);

    return {
      detected: finalKept.length > 0,
      objects: finalKept,
      latencyMs: totalLatencyMs,
      modelUsed: mode === 'potholes'
        ? `${this.name} [Exhaustive Potholes-Only Scan]`
        : this.name,
    };
  }
}

export const multiModelFusionService = new MultiModelFusionService();
