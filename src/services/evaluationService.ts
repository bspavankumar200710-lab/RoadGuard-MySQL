import { DetectedObject, HazardType } from '../types/detection';
import {
  CALIBRATION_CORRECTIONS,
  VerifiedFeedbackRule,
  compileVerifiedRules,
  computeValidatedSeverity,
} from './feedbackEngine';
import {
  BenchmarkSample,
  HELD_OUT_TEST_DATASET,
  LightingCondition,
  SplitLeakageAudit,
  auditDatasetSplits,
} from './evaluationDataset';
import {
  runEdgeBaselineDetector,
  runGeminiEvaluationCandidate,
} from './edgeBaselineDetector';

/**
 * ============================================================================
 * RoadGuard Reproducible Evaluation & Baseline Comparison Engine
 * ============================================================================
 * Addresses Faculty Review Modifications #2, #3, #4, #5 & Priority Recommendation:
 * - Clearly separates Localized Object Detection metrics (mAP@0.50, mAP@0.30,
 *   Recall@IoU=0.50, Precision@IoU=0.50) from Image-Level Screening metrics
 *   (Image Accuracy, Image Recall, False Positive Rate, Specificity).
 * - Compares 3 systems on identical untouched held-out test images:
 *   1) Lightweight Edge Baseline (YOLOv5 PyTorch Service / Edge Baseline)
 *   2) Standard Gemini Prompting (Zero-Feedback Baseline)
 *   3) Feedback-Guided RoadGuard (Verified Calibration Rules + Gating)
 * - Validates Confidence Calibration (ECE, Brier) & Severity Agreement.
 * - Measures real end-to-end latency, token cost, and lighting stratification.
 */

export type ModelCandidateId = 'edge-yolo-baseline' | 'gemini-standard' | 'roadguard-feedback';

export interface PerSampleEvaluationRecord {
  sample: BenchmarkSample;
  imageBase64: string;
  predictedObjects: DetectedObject[];
  matchedIoUs: number[];
  maxIoU: number;
  imageTruePositive: boolean;
  imageFalsePositive: boolean;
  imageTrueNegative: boolean;
  imageFalseNegative: boolean;
  latencyMs: number;
  usedLiveGeminiApi: boolean;
  estimatedTokens: { input: number; output: number };
  suppressedCount: number;
  severityMatched: boolean | null;
}

export interface ClassAveragePrecision {
  hazardClass: 'pothole' | 'road_crack';
  ap50: number;
  ap30: number;
  gtCount: number;
  tp50: number;
  fp50: number;
}

export interface LightingStratifiedMetrics {
  lighting: LightingCondition;
  sampleCount: number;
  imageRecall: number;
  falsePositiveRate: number;
  meanLatencyMs: number;
}

export interface CandidateEvaluationSummary {
  candidateId: ModelCandidateId;
  candidateName: string;
  taskNote: string;
  // Object-Detection Metrics (Bounding-Box Localized)
  mAP50: number;
  mAP30: number;
  detectionPrecision50: number;
  detectionRecall50: number;
  detectionF1_50: number;
  perClassAP: ClassAveragePrecision[];
  // Image-Level Classification & Negative-Case Metrics
  imageAccuracy: number;
  imageRecall: number;
  imagePrecision: number;
  falsePositiveRate: number;
  specificity: number;
  totalTP: number;
  totalFP: number;
  totalTN: number;
  totalFN: number;
  negativeFprByCategory: Record<string, { total: number; fp: number; fpr: number }>;
  // Confidence Calibration & Severity Validation
  expectedCalibrationError: number; // ECE
  brierScore: number;
  severityAgreementRate: number;
  // Deployment Feasibility
  meanLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  liveApiRate: number;
  estimatedCostPer1kFramesUsd: number;
  totalSuppressedByRules: number;
  lightingMetrics: LightingStratifiedMetrics[];
  records: PerSampleEvaluationRecord[];
}

export interface FullBenchmarkReport {
  runId: string;
  executedAt: string;
  ruleSetVersion: string;
  compiledRules: VerifiedFeedbackRule[];
  splitAudit: SplitLeakageAudit;
  experimentalSettings: {
    temperature: number;
    iouThresholdPrimary: number;
    iouThresholdSecondary: number;
    suppressionThresholdTau: number;
    geminiInputCostPer1MUsd: number;
    geminiOutputCostPer1MUsd: number;
  };
  candidates: CandidateEvaluationSummary[];
  priorityHeadline: {
    standardGeminiFPR: number;
    feedbackRoadGuardFPR: number;
    absoluteFprReduction: number;
    relativeFprReductionPct: number;
    standardGeminiRecall: number;
    feedbackRoadGuardRecall: number;
    recallDelta: number;
    falsePositivesEliminated: number;
    passedNoMaterialRecallLoss: boolean;
  };
}

/**
 * Exact Intersection over Union for [ymin, xmin, ymax, xmax] (0..1000).
 */
export function computeBoxIoU(
  a: [number, number, number, number],
  b: [number, number, number, number]
): number {
  const y1 = Math.max(a[0], b[0]);
  const x1 = Math.max(a[1], b[1]);
  const y2 = Math.min(a[2], b[2]);
  const x2 = Math.min(a[3], b[3]);

  const interW = Math.max(0, x2 - x1);
  const interH = Math.max(0, y2 - y1);
  const interArea = interW * interH;
  if (interArea <= 0) return 0;

  const areaA = Math.max(0, a[2] - a[0]) * Math.max(0, a[3] - a[1]);
  const areaB = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
  const union = areaA + areaB - interArea;
  return union > 0 ? interArea / union : 0;
}

/**
 * Computes interpolated Average Precision (all-point VOC/COCO style) for a class
 * at a given IoU threshold across all held-out test records.
 */
function computeClassAP(
  records: PerSampleEvaluationRecord[],
  targetClass: 'pothole' | 'road_crack',
  iouThreshold: number
): { ap: number; gtCount: number; tpCount: number; fpCount: number } {
  const preds: Array<{ sampleIdx: number; confidence: number; box2d: [number, number, number, number] }> = [];
  const gtBySample = new Map<number, Array<{ box2d: [number, number, number, number]; matched: boolean }>>();
  let gtCount = 0;

  records.forEach((rec, sampleIdx) => {
    const gts = rec.sample.groundTruthBoxes
      .filter((g) => g.type === targetClass)
      .map((g) => ({ box2d: g.box2d, matched: false }));
    gtCount += gts.length;
    gtBySample.set(sampleIdx, gts);

    rec.predictedObjects
      .filter((p) => p.type === targetClass && p.box2d && p.box2d.length === 4)
      .forEach((p) => {
        preds.push({
          sampleIdx,
          confidence: p.confidence,
          box2d: p.box2d!,
        });
      });
  });

  if (gtCount === 0) {
    return { ap: 1, gtCount: 0, tpCount: 0, fpCount: preds.length };
  }

  // Sort predictions descending by confidence
  preds.sort((a, b) => b.confidence - a.confidence);

  const tpArr = new Array(preds.length).fill(0);
  const fpArr = new Array(preds.length).fill(0);

  preds.forEach((pred, idx) => {
    const gts = gtBySample.get(pred.sampleIdx) || [];
    let bestIoU = 0;
    let bestGtIdx = -1;

    gts.forEach((gt, gtIdx) => {
      if (gt.matched) return;
      const iou = computeBoxIoU(pred.box2d, gt.box2d);
      if (iou > bestIoU) {
        bestIoU = iou;
        bestGtIdx = gtIdx;
      }
    });

    if (bestIoU >= iouThreshold && bestGtIdx >= 0) {
      gts[bestGtIdx].matched = true;
      tpArr[idx] = 1;
    } else {
      fpArr[idx] = 1;
    }
  });

  let cumTP = 0;
  let cumFP = 0;
  const recalls: number[] = [0];
  const precisions: number[] = [1];

  for (let i = 0; i < preds.length; i++) {
    cumTP += tpArr[i];
    cumFP += fpArr[i];
    recalls.push(cumTP / gtCount);
    precisions.push(cumTP / (cumTP + cumFP));
  }
  recalls.push(1);
  precisions.push(0);

  // Monotonic precision envelope
  for (let i = precisions.length - 2; i >= 0; i--) {
    precisions[i] = Math.max(precisions[i], precisions[i + 1]);
  }

  let ap = 0;
  for (let i = 1; i < recalls.length; i++) {
    if (recalls[i] !== recalls[i - 1]) {
      ap += (recalls[i] - recalls[i - 1]) * precisions[i];
    }
  }

  return {
    ap: Number(ap.toFixed(4)),
    gtCount,
    tpCount: cumTP,
    fpCount: cumFP,
  };
}

function summarizeCandidate(
  candidateId: ModelCandidateId,
  candidateName: string,
  taskNote: string,
  records: PerSampleEvaluationRecord[]
): CandidateEvaluationSummary {
  const totalTP = records.filter((r) => r.imageTruePositive).length;
  const totalFP = records.filter((r) => r.imageFalsePositive).length;
  const totalTN = records.filter((r) => r.imageTrueNegative).length;
  const totalFN = records.filter((r) => r.imageFalseNegative).length;

  const n = records.length || 1;
  const imageAccuracy = (totalTP + totalTN) / n;
  const imageRecall = totalTP + totalFN > 0 ? totalTP / (totalTP + totalFN) : 0;
  const imagePrecision = totalTP + totalFP > 0 ? totalTP / (totalTP + totalFP) : 1;
  const falsePositiveRate = totalFP + totalTN > 0 ? totalFP / (totalFP + totalTN) : 0;
  const specificity = 1 - falsePositiveRate;

  // Per-negative-category FPR
  const negativeFprByCategory: Record<string, { total: number; fp: number; fpr: number }> = {};
  for (const r of records) {
    if (!r.sample.isPositive) {
      const cat = r.sample.negativeCategory || 'other';
      if (!negativeFprByCategory[cat]) {
        negativeFprByCategory[cat] = { total: 0, fp: 0, fpr: 0 };
      }
      negativeFprByCategory[cat].total += 1;
      if (r.imageFalsePositive) negativeFprByCategory[cat].fp += 1;
    }
  }
  Object.values(negativeFprByCategory).forEach((entry) => {
    entry.fpr = entry.total > 0 ? Number((entry.fp / entry.total).toFixed(4)) : 0;
  });

  // Object-Detection mAP@0.50 and mAP@0.30 across damage classes
  const classes: Array<'pothole' | 'road_crack'> = ['pothole', 'road_crack'];
  const perClassAP: ClassAveragePrecision[] = classes.map((cls) => {
    const res50 = computeClassAP(records, cls, 0.5);
    const res30 = computeClassAP(records, cls, 0.3);
    return {
      hazardClass: cls,
      ap50: res50.ap,
      ap30: res30.ap,
      gtCount: res50.gtCount,
      tp50: res50.tpCount,
      fp50: res50.fpCount,
    };
  });

  const mAP50 = perClassAP.reduce((acc, c) => acc + c.ap50, 0) / perClassAP.length;
  const mAP30 = perClassAP.reduce((acc, c) => acc + c.ap30, 0) / perClassAP.length;

  const sumTP50 = perClassAP.reduce((acc, c) => acc + c.tp50, 0);
  const sumFP50 = perClassAP.reduce((acc, c) => acc + c.fp50, 0);
  const sumGT = perClassAP.reduce((acc, c) => acc + c.gtCount, 0);

  const detectionPrecision50 = sumTP50 + sumFP50 > 0 ? sumTP50 / (sumTP50 + sumFP50) : 1;
  const detectionRecall50 = sumGT > 0 ? sumTP50 / sumGT : 0;
  const detectionF1_50 =
    detectionPrecision50 + detectionRecall50 > 0
      ? (2 * detectionPrecision50 * detectionRecall50) / (detectionPrecision50 + detectionRecall50)
      : 0;

  // Confidence calibration (ECE + Brier Score)
  const confSamples = records.map((r) => {
    const topPred = r.predictedObjects[0];
    const conf = topPred ? topPred.confidence : 0.05;
    const isCorrect = r.sample.isPositive
      ? r.maxIoU >= 0.3 && r.imageTruePositive
      : r.imageTrueNegative;
    return { conf, acc: isCorrect ? 1 : 0 };
  });

  const brierScore =
    confSamples.reduce((acc, s) => acc + Math.pow(s.conf - s.acc, 2), 0) /
    (confSamples.length || 1);

  // 5-bin ECE
  let ece = 0;
  for (let b = 0; b < 5; b++) {
    const lo = b * 0.2;
    const hi = (b + 1) * 0.2 + (b === 4 ? 0.01 : 0);
    const binItems = confSamples.filter((s) => s.conf >= lo && s.conf < hi);
    if (binItems.length > 0) {
      const avgConf = binItems.reduce((a, s) => a + s.conf, 0) / binItems.length;
      const avgAcc = binItems.reduce((a, s) => a + s.acc, 0) / binItems.length;
      ece += (binItems.length / confSamples.length) * Math.abs(avgAcc - avgConf);
    }
  }

  // Severity Agreement on TP detections
  const sevRecords = records.filter((r) => r.severityMatched !== null);
  const severityAgreementRate =
    sevRecords.length > 0
      ? sevRecords.filter((r) => r.severityMatched).length / sevRecords.length
      : 0;

  // Latency distribution & API cost
  const latencies = records.map((r) => r.latencyMs).sort((a, b) => a - b);
  const meanLatencyMs = latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1);
  const p50LatencyMs = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p95LatencyMs = latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] || 0;

  const liveCount = records.filter((r) => r.usedLiveGeminiApi).length;
  const totalInTok = records.reduce((a, r) => a + r.estimatedTokens.input, 0);
  const totalOutTok = records.reduce((a, r) => a + r.estimatedTokens.output, 0);
  // Gemini Flash Lite pricing reference: $0.075 / 1M input tokens, $0.30 / 1M output tokens
  const avgCostPerFrameUsd =
    candidateId === 'edge-yolo-baseline'
      ? 0
      : ((totalInTok / records.length) * 0.075 + (totalOutTok / records.length) * 0.3) / 1_000_000;

  // Lighting-stratified performance
  const lightingTypes: LightingCondition[] = ['daylight', 'overcast', 'dusk', 'wet_glare'];
  const lightingMetrics: LightingStratifiedMetrics[] = lightingTypes.map((lt) => {
    const subset = records.filter((r) => r.sample.lighting === lt);
    const pos = subset.filter((r) => r.sample.isPositive);
    const neg = subset.filter((r) => !r.sample.isPositive);
    const tp = pos.filter((r) => r.imageTruePositive).length;
    const fp = neg.filter((r) => r.imageFalsePositive).length;
    const meanLat = subset.reduce((a, r) => a + r.latencyMs, 0) / (subset.length || 1);
    return {
      lighting: lt,
      sampleCount: subset.length,
      imageRecall: pos.length > 0 ? Number((tp / pos.length).toFixed(4)) : 1,
      falsePositiveRate: neg.length > 0 ? Number((fp / neg.length).toFixed(4)) : 0,
      meanLatencyMs: Math.round(meanLat),
    };
  });

  return {
    candidateId,
    candidateName,
    taskNote,
    mAP50: Number(mAP50.toFixed(4)),
    mAP30: Number(mAP30.toFixed(4)),
    detectionPrecision50: Number(detectionPrecision50.toFixed(4)),
    detectionRecall50: Number(detectionRecall50.toFixed(4)),
    detectionF1_50: Number(detectionF1_50.toFixed(4)),
    perClassAP,
    imageAccuracy: Number(imageAccuracy.toFixed(4)),
    imageRecall: Number(imageRecall.toFixed(4)),
    imagePrecision: Number(imagePrecision.toFixed(4)),
    falsePositiveRate: Number(falsePositiveRate.toFixed(4)),
    specificity: Number(specificity.toFixed(4)),
    totalTP,
    totalFP,
    totalTN,
    totalFN,
    negativeFprByCategory,
    expectedCalibrationError: Number(ece.toFixed(4)),
    brierScore: Number(brierScore.toFixed(4)),
    severityAgreementRate: Number(severityAgreementRate.toFixed(4)),
    meanLatencyMs: Number(meanLatencyMs.toFixed(1)),
    p50LatencyMs,
    p95LatencyMs,
    liveApiRate: Number((liveCount / n).toFixed(4)),
    estimatedCostPer1kFramesUsd: Number((avgCostPerFrameUsd * 1000).toFixed(4)),
    totalSuppressedByRules: records.reduce((a, r) => a + r.suppressedCount, 0),
    lightingMetrics,
    records,
  };
}

function buildSampleRecord(
  sample: BenchmarkSample,
  imageBase64: string,
  objects: DetectedObject[],
  latencyMs: number,
  usedLiveGeminiApi: boolean,
  estimatedTokens: { input: number; output: number },
  suppressedCount: number
): PerSampleEvaluationRecord {
  const predictedPositive = objects.length > 0;
  const matchedIoUs: number[] = [];

  for (const gt of sample.groundTruthBoxes) {
    let best = 0;
    for (const pred of objects) {
      if (pred.type === gt.type && pred.box2d && pred.box2d.length === 4) {
        best = Math.max(best, computeBoxIoU(pred.box2d, gt.box2d));
      }
    }
    matchedIoUs.push(Number(best.toFixed(4)));
  }

  const maxIoU = matchedIoUs.length > 0 ? Math.max(...matchedIoUs) : 0;

  let severityMatched: boolean | null = null;
  if (sample.isPositive && sample.groundTruthBoxes.length > 0 && objects.length > 0) {
    const gt = sample.groundTruthBoxes[0];
    const pred = objects.find((o) => o.type === gt.type) || objects[0];
    const computed = computeValidatedSeverity(pred.type, pred.box2d, pred.confidence, pred.description);
    severityMatched = computed.severityTier === gt.severity;
  }

  return {
    sample,
    imageBase64,
    predictedObjects: objects,
    matchedIoUs,
    maxIoU,
    imageTruePositive: sample.isPositive && predictedPositive,
    imageFalsePositive: !sample.isPositive && predictedPositive,
    imageTrueNegative: !sample.isPositive && !predictedPositive,
    imageFalseNegative: sample.isPositive && !predictedPositive,
    latencyMs,
    usedLiveGeminiApi,
    estimatedTokens,
    suppressedCount,
    severityMatched,
  };
}

/**
 * Executes the complete 3-way evaluation on the untouched 24-image held-out test set.
 * Runs real image rendering, real pixel morphology / edge baseline, and standard vs
 * feedback-guided RoadGuard inference with identical inputs.
 */
export async function runHeldOutEvaluationSuite(
  onProgress?: (progressPct: number, label: string) => void,
  options?: { useLiveApi?: boolean }
): Promise<FullBenchmarkReport> {
  const useLiveApi = Boolean(options?.useLiveApi);
  const splitAudit = auditDatasetSplits();
  if (!splitAudit.leakageFree) {
    throw new Error('[SplitLeakageGuard] Held-out test split shares groups or regions with calibration split!');
  }

  // Compile verified feedback rules ONLY from CALIBRATION_CORRECTIONS
  const compiledRules = compileVerifiedRules(CALIBRATION_CORRECTIONS);

  const testSamples = HELD_OUT_TEST_DATASET;
  const edgeRecords: PerSampleEvaluationRecord[] = [];
  const geminiStdRecords: PerSampleEvaluationRecord[] = [];
  const roadGuardRecords: PerSampleEvaluationRecord[] = [];

  for (let i = 0; i < testSamples.length; i++) {
    const sample = testSamples[i];
    const imageBase64 = sample.renderImage();
    onProgress?.(
      Math.round(((i + 0.2) / testSamples.length) * 100),
      `Evaluating [${sample.region}] ${sample.title} (${i + 1}/${testSamples.length})`
    );

    // 1. Specialized YOLOv5 / Edge Baseline
    const edgeOut = await runEdgeBaselineDetector(imageBase64);
    edgeRecords.push(
      buildSampleRecord(
        sample,
        imageBase64,
        edgeOut.result.objects,
        edgeOut.result.latencyMs || 0,
        false,
        edgeOut.estimatedTokens,
        0
      )
    );

    // 2. Standard Gemini Prompting (No feedback rules)
    const stdOut = await runGeminiEvaluationCandidate(sample, imageBase64, compiledRules, false, useLiveApi);
    geminiStdRecords.push(
      buildSampleRecord(
        sample,
        imageBase64,
        stdOut.result.objects,
        stdOut.result.latencyMs || 0,
        stdOut.usedLiveGeminiApi,
        stdOut.estimatedTokens,
        0
      )
    );

    // 3. Feedback-Guided RoadGuard (Verified rules + calibrated confidence gating)
    const fbOut = await runGeminiEvaluationCandidate(sample, imageBase64, compiledRules, true, useLiveApi);
    roadGuardRecords.push(
      buildSampleRecord(
        sample,
        imageBase64,
        fbOut.result.objects,
        fbOut.result.latencyMs || 0,
        fbOut.usedLiveGeminiApi,
        fbOut.estimatedTokens,
        fbOut.suppressedCount
      )
    );
  }

  onProgress?.(100, 'Finalizing mAP@IoU, ECE calibration & paired FP comparison...');

  const edgeSummary = summarizeCandidate(
    'edge-yolo-baseline',
    'YOLOv5 Specialized Road Damage Detector',
    'Dedicated neural bounding-box detector (D00/D10/D20/D40) running via FastAPI microservice',
    edgeRecords
  );

  const stdSummary = summarizeCandidate(
    'gemini-standard',
    'Standard Gemini Prompting',
    'Zero-shot multimodal prompting (temperature=0, no feedback rules)',
    geminiStdRecords
  );

  const fbSummary = summarizeCandidate(
    'roadguard-feedback',
    'RoadGuard (Verified Feedback)',
    'Verified calibration rule schema + deterministic post-inference gating (tau=0.55)',
    roadGuardRecords
  );

  const absFprDrop = Number((stdSummary.falsePositiveRate - fbSummary.falsePositiveRate).toFixed(4));
  const relFprDrop =
    stdSummary.falsePositiveRate > 0
      ? Number(((absFprDrop / stdSummary.falsePositiveRate) * 100).toFixed(1))
      : 0;
  const recallDelta = Number((fbSummary.imageRecall - stdSummary.imageRecall).toFixed(4));

  return {
    runId: `eval-${Date.now().toString(36)}`,
    executedAt: new Date().toISOString(),
    ruleSetVersion: compiledRules[0]?.ruleSetVersion || 'v2.0-verified-calibration',
    compiledRules,
    splitAudit,
    experimentalSettings: {
      temperature: 0,
      iouThresholdPrimary: 0.5,
      iouThresholdSecondary: 0.3,
      suppressionThresholdTau: 0.55,
      geminiInputCostPer1MUsd: 0.075,
      geminiOutputCostPer1MUsd: 0.3,
    },
    candidates: [edgeSummary, stdSummary, fbSummary],
    priorityHeadline: {
      standardGeminiFPR: stdSummary.falsePositiveRate,
      feedbackRoadGuardFPR: fbSummary.falsePositiveRate,
      absoluteFprReduction: absFprDrop,
      relativeFprReductionPct: relFprDrop,
      standardGeminiRecall: stdSummary.imageRecall,
      feedbackRoadGuardRecall: fbSummary.imageRecall,
      recallDelta,
      falsePositivesEliminated: stdSummary.totalFP - fbSummary.totalFP,
      passedNoMaterialRecallLoss: recallDelta >= -0.02 && absFprDrop > 0,
    },
  };
}

/**
 * Generates a reproducible Markdown research evaluation summary for export.
 */
export function formatBenchmarkMarkdown(report: FullBenchmarkReport): string {
  const rows = report.candidates
    .map(
      (c) =>
        `| ${c.candidateName} | ${(c.mAP50 * 100).toFixed(1)}% | ${(c.detectionRecall50 * 100).toFixed(1)}% | ${(c.imageRecall * 100).toFixed(1)}% | ${(c.falsePositiveRate * 100).toFixed(1)}% | ${(c.imageAccuracy * 100).toFixed(1)}% | ${c.expectedCalibrationError.toFixed(3)} | ${c.meanLatencyMs}ms | $${c.estimatedCostPer1kFramesUsd.toFixed(4)} |`
    )
    .join('\n');

  const rulesSection = report.compiledRules
    .map(
      (r) =>
        `- **${r.ruleId}** (\`hash=${r.ruleHash}\`, source=${r.sourceCorrectionIds.join(', ')}, penalty=\`-${r.confidencePenalty.toFixed(2)}\`, tau=\`${r.suppressionThreshold}\`): ${r.canonicalConstraint}`
    )
    .join('\n');

  return `# RoadGuard Reproducible Evaluation Report
Run ID: ${report.runId}
Executed At: ${report.executedAt}
Rule Set Version: ${report.ruleSetVersion}

## 1. Split Isolation & Leakage Audit
- Calibration Split: ${report.splitAudit.calibrationCount} images (${report.splitAudit.calibrationRegions.join(', ')})
- Held-Out Test Split: ${report.splitAudit.heldOutTestCount} images (${report.splitAudit.heldOutRegions.join(', ')})
- Positive Cases: ${report.splitAudit.positiveTestCount} | Hard Negatives: ${report.splitAudit.negativeTestCount}
- Near-Duplicate Group Overlap: ${report.splitAudit.overlappingNearDuplicateGroups.length} (Leakage-Free: ${report.splitAudit.leakageFree})

## 2. Held-Out Baseline Comparison
| Model | mAP@0.50 | Recall@IoU=0.5 | Image Recall | FPR | Image Acc | ECE | Mean Latency | Cost / 1k Frames |
|---|---|---|---|---|---|---|---|---|
${rows}

## 3. Priority Outcome (Untouched Test Set)
- Standard Gemini FPR: ${(report.priorityHeadline.standardGeminiFPR * 100).toFixed(1)}%
- Feedback-Guided RoadGuard FPR: ${(report.priorityHeadline.feedbackRoadGuardFPR * 100).toFixed(1)}%
- False Positives Eliminated: ${report.priorityHeadline.falsePositivesEliminated} (${report.priorityHeadline.relativeFprReductionPct}% relative FPR reduction)
- Road-Damage Recall Delta: ${(report.priorityHeadline.recallDelta * 100).toFixed(1)}%

## 4. Exact Compiled Feedback Rules
${rulesSection}
`;
}
