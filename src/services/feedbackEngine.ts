import { DetectedObject, HazardType, SeverityLevel } from '../types/detection';

/**
 * ============================================================================
 * RoadGuard Formal Feedback-to-Rule Engine
 * ============================================================================
 * Addresses Faculty Review Modification #1 & #5:
 * - Differentiates reproducible, verified feedback compilation from ad-hoc
 *   manual prompt refinement.
 * - Enforces strict split isolation: rules may ONLY be compiled from
 *   'calibration' split corrections, never from 'held_out_test' data.
 * - Defines formal confidence calibration and severity scoring formulas.
 */

export type NegativeCaseCategory =
  | 'manhole'
  | 'shadow'
  | 'water_puddle'
  | 'paint_marking'
  | 'speed_breaker'
  | 'normal_road';

export type SplitTag = 'calibration' | 'held_out_test' | 'production_live';

export interface DriverCorrectionSubmission {
  id: string;
  timestamp: string;
  splitTag: SplitTag;
  region: string;
  predictedType: HazardType;
  predictedBox2d?: [number, number, number, number];
  rawConfidence: number;
  trueNegativeClass: NegativeCaseCategory;
  operatorNote: string;
  verificationStatus: 'pending_verification' | 'verified' | 'rejected';
  verifiedBy?: string;
  verifiedAt?: string;
}

export interface VerifiedFeedbackRule {
  ruleId: string;
  ruleHash: string;
  ruleSetVersion: string;
  sourceCorrectionIds: string[];
  targetPredictedTypes: HazardType[];
  trueNegativeClass: NegativeCaseCategory;
  triggerCues: string[];
  geometricSignature: {
    circularityMin?: number;
    edgeSharpnessMax?: number;
    specularRatioMin?: number;
    stripePeriodicity?: boolean;
  };
  confidencePenalty: number; // Deterministic delta subtracted during post-inference gating
  suppressionThreshold: number; // Tau: if calibratedConfidence < tau, prediction is suppressed
  canonicalConstraint: string; // Machine-compiled constraint serialized into inference schema
  compiledFromSplit: 'calibration' | 'production_live';
  verifiedQuorum: number;
  createdAt: string;
}

export interface RuleApplicationTrace {
  objectIndex: number;
  originalType: HazardType;
  rawConfidence: number;
  matchedRuleId: string | null;
  penaltyApplied: number;
  calibratedConfidence: number;
  suppressed: boolean;
  suppressionReason?: string;
}

export interface ConfidenceAndSeverityBreakdown {
  rawConfidence: number;
  rulePenalty: number;
  calibratedConfidence: number;
  boxAreaRatio: number;
  classHazardWeight: number;
  severityScore: number; // 0-100 continuous score
  severityTier: SeverityLevel; // 'low' | 'medium' | 'high'
}

export const CALIBRATION_CONFIDENCE_THRESHOLD_TAU = 0.55;
export const RULE_SET_VERSION = 'v2.0-verified-calibration';

/**
 * Deterministic FNV-1a 32-bit hash for rule provenance & reproducibility.
 */
export function computeRuleHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Canonical taxonomy mapping from confusion category to deterministic visual cues
 * and calibrated penalties. No manual free-form prompt rewriting is performed.
 */
const CONFUSION_TAXONOMY_SPEC: Record<
  NegativeCaseCategory,
  {
    targetPredictedTypes: HazardType[];
    triggerCues: string[];
    geometricSignature: VerifiedFeedbackRule['geometricSignature'];
    confidencePenalty: number;
    canonicalConstraint: string;
  }
> = {
  manhole: {
    targetPredictedTypes: ['pothole', 'other_hazard'],
    triggerCues: [
      'manhole',
      'sewer',
      'utility cover',
      'metallic lid',
      'circular grate',
      'drain cover',
      'flush iron',
    ],
    geometricSignature: { circularityMin: 0.78 },
    confidencePenalty: 0.42,
    canonicalConstraint:
      'EXCLUDE circular/square flush metallic utility lids, sewer grates, or manhole rims lacking broken asphalt spalling.',
  },
  shadow: {
    targetPredictedTypes: ['road_crack', 'pothole', 'other_hazard'],
    triggerCues: [
      'shadow',
      'tree canopy',
      'silhouette',
      'pole shadow',
      'bridge shadow',
      'dark band',
      'overcast shade',
    ],
    geometricSignature: { edgeSharpnessMax: 0.35 },
    confidencePenalty: 0.40,
    canonicalConstraint:
      'EXCLUDE uniform low-texture dark bands or dappled tree/pole/overpass shadows that preserve intact asphalt aggregate.',
  },
  water_puddle: {
    targetPredictedTypes: ['pothole', 'road_crack'],
    triggerCues: [
      'puddle',
      'water',
      'rainwater',
      'reflection',
      'specular',
      'wet sheen',
      'standing water',
    ],
    geometricSignature: { specularRatioMin: 0.65 },
    confidencePenalty: 0.38,
    canonicalConstraint:
      'EXCLUDE shallow reflective rainwater pools or wet glare patches unless jagged vertical cavity walls are visible.',
  },
  paint_marking: {
    targetPredictedTypes: ['road_crack', 'broken_sign', 'other_hazard'],
    triggerCues: [
      'paint',
      'zebra',
      'crosswalk',
      'lane marking',
      'thermoplastic',
      'road arrow',
      'striped',
    ],
    geometricSignature: { stripePeriodicity: true },
    confidencePenalty: 0.44,
    canonicalConstraint:
      'EXCLUDE high-luminance white/yellow lane striping, crosswalk bars, and directional thermoplastic pavement markings.',
  },
  speed_breaker: {
    targetPredictedTypes: ['pothole', 'road_crack', 'other_hazard'],
    triggerCues: [
      'speed breaker',
      'speed hump',
      'rumble strip',
      'speed bump',
      'transverse mound',
    ],
    geometricSignature: { stripePeriodicity: true },
    confidencePenalty: 0.39,
    canonicalConstraint:
      'EXCLUDE intentional painted or molded transverse speed humps / rumble strips spanning full lane width.',
  },
  normal_road: {
    targetPredictedTypes: ['pothole', 'road_crack', 'broken_sign', 'other_hazard'],
    triggerCues: ['clean asphalt', 'patch repair', 'sealed tar', 'intact pavement'],
    geometricSignature: {},
    confidencePenalty: 0.35,
    canonicalConstraint:
      'EXCLUDE intact tar-sealed joints and smooth resurfaced asphalt patches without active edge breakup.',
  },
};

/**
 * Verified calibration-split driver corrections (reproducible seed set).
 * Strictly isolated from the held_out_test split.
 */
export const CALIBRATION_CORRECTIONS: DriverCorrectionSubmission[] = [
  {
    id: 'corr-cal-001',
    timestamp: '2026-10-12T09:14:00.000Z',
    splitTag: 'calibration',
    region: 'Bengaluru South Corridor',
    predictedType: 'pothole',
    predictedBox2d: [560, 410, 690, 560],
    rawConfidence: 0.81,
    trueNegativeClass: 'manhole',
    operatorNote: 'Circular cast-iron utility cover flush with asphalt misclassified as D40 pothole.',
    verificationStatus: 'verified',
    verifiedBy: 'Municipal QA Reviewer #1',
    verifiedAt: '2026-10-12T11:05:00.000Z',
  },
  {
    id: 'corr-cal-002',
    timestamp: '2026-10-12T09:42:00.000Z',
    splitTag: 'calibration',
    region: 'Bengaluru Outer Ring',
    predictedType: 'road_crack',
    predictedBox2d: [490, 220, 740, 680],
    rawConfidence: 0.78,
    trueNegativeClass: 'shadow',
    operatorNote: 'Overhead metro viaduct & tree branch shadow cast diagonally across clean asphalt.',
    verificationStatus: 'verified',
    verifiedBy: 'Municipal QA Reviewer #1',
    verifiedAt: '2026-10-12T11:09:00.000Z',
  },
  {
    id: 'corr-cal-003',
    timestamp: '2026-10-13T14:20:00.000Z',
    splitTag: 'calibration',
    region: 'Bengaluru Silk Board',
    predictedType: 'pothole',
    predictedBox2d: [580, 310, 730, 610],
    rawConfidence: 0.76,
    trueNegativeClass: 'water_puddle',
    operatorNote: 'Post-rain surface reflection pool with intact smooth perimeter flagged as pothole.',
    verificationStatus: 'verified',
    verifiedBy: 'Municipal QA Reviewer #2',
    verifiedAt: '2026-10-13T16:00:00.000Z',
  },
  {
    id: 'corr-cal-004',
    timestamp: '2026-10-14T08:30:00.000Z',
    splitTag: 'calibration',
    region: 'Bengaluru Indiranagar',
    predictedType: 'road_crack',
    predictedBox2d: [540, 260, 780, 740],
    rawConfidence: 0.74,
    trueNegativeClass: 'paint_marking',
    operatorNote: 'Worn thermoplastic pedestrian crosswalk striping misread as transverse cracking.',
    verificationStatus: 'verified',
    verifiedBy: 'Municipal QA Reviewer #2',
    verifiedAt: '2026-10-14T10:15:00.000Z',
  },
  {
    id: 'corr-cal-005',
    timestamp: '2026-10-14T17:05:00.000Z',
    splitTag: 'calibration',
    region: 'Bengaluru Whitefield',
    predictedType: 'pothole',
    predictedBox2d: [600, 190, 710, 810],
    rawConfidence: 0.75,
    trueNegativeClass: 'speed_breaker',
    operatorNote: 'Painted asphalt speed hump across full lane width flagged as surface defect.',
    verificationStatus: 'verified',
    verifiedBy: 'Municipal QA Reviewer #1',
    verifiedAt: '2026-10-14T18:10:00.000Z',
  },
  {
    id: 'corr-cal-006',
    timestamp: '2026-10-15T10:00:00.000Z',
    splitTag: 'calibration',
    region: 'Bengaluru Koramangala',
    predictedType: 'road_crack',
    predictedBox2d: [510, 460, 780, 540],
    rawConfidence: 0.72,
    trueNegativeClass: 'normal_road',
    operatorNote: 'Unverified submission kept pending until reviewer quorum confirms intact tar seam.',
    verificationStatus: 'pending_verification',
  },
];

/**
 * Deterministic Rule Compiler:
 * Transforms verified driver corrections (NEVER held-out test records) into
 * versioned, reproducible feedback rules.
 */
export function compileVerifiedRules(
  submissions: DriverCorrectionSubmission[]
): VerifiedFeedbackRule[] {
  const verifiedCalibration = submissions.filter((s) => {
    if (s.splitTag === 'held_out_test') {
      throw new Error(
        `[SplitLeakageGuard] Forbidden attempt to compile rule from held_out_test submission ${s.id}`
      );
    }
    return s.verificationStatus === 'verified';
  });

  // Group verified corrections by trueNegativeClass
  const grouped = new Map<NegativeCaseCategory, DriverCorrectionSubmission[]>();
  for (const sub of verifiedCalibration) {
    const existing = grouped.get(sub.trueNegativeClass) || [];
    existing.push(sub);
    grouped.set(sub.trueNegativeClass, existing);
  }

  const rules: VerifiedFeedbackRule[] = [];
  let idx = 1;

  for (const [negClass, group] of grouped.entries()) {
    const spec = CONFUSION_TAXONOMY_SPEC[negClass];
    const sourceIds = group.map((g) => g.id).sort();
    const ruleId = `RULE-${String(idx).padStart(2, '0')}`;
    const canonicalPayload = JSON.stringify({
      negClass,
      targetPredictedTypes: spec.targetPredictedTypes,
      confidencePenalty: spec.confidencePenalty,
      suppressionThreshold: CALIBRATION_CONFIDENCE_THRESHOLD_TAU,
      sourceIds,
    });

    rules.push({
      ruleId,
      ruleHash: computeRuleHash(canonicalPayload),
      ruleSetVersion: RULE_SET_VERSION,
      sourceCorrectionIds: sourceIds,
      targetPredictedTypes: spec.targetPredictedTypes,
      trueNegativeClass: negClass,
      triggerCues: spec.triggerCues,
      geometricSignature: spec.geometricSignature,
      confidencePenalty: spec.confidencePenalty,
      suppressionThreshold: CALIBRATION_CONFIDENCE_THRESHOLD_TAU,
      canonicalConstraint: spec.canonicalConstraint,
      compiledFromSplit: group[0].splitTag === 'production_live' ? 'production_live' : 'calibration',
      verifiedQuorum: group.length,
      createdAt: group[group.length - 1].verifiedAt || group[group.length - 1].timestamp,
    });
    idx++;
  }

  return rules;
}

/**
 * Serializes verified rules into a deterministic schema block for inference.
 * Distinct from manual prompt engineering: generated strictly from verified rules.
 */
export function serializeRulesForInference(rules: VerifiedFeedbackRule[]): string {
  if (rules.length === 0) return '';
  const lines = rules.map(
    (r) =>
      `[${r.ruleId} | hash=${r.ruleHash} | neg_class=${r.trueNegativeClass} | penalty=-${r.confidencePenalty.toFixed(2)}] ${r.canonicalConstraint}`
  );
  return `\nVERIFIED_FEEDBACK_RULE_SCHEMA (${RULE_SET_VERSION}, count=${rules.length}):\n${lines.join('\n')}`;
}

/**
 * Post-Inference Deterministic Rule Gating & Confidence Calibration.
 * Evaluates each predicted object against compiled verified rules using
 * textual cue matching + optional scene morphological descriptors.
 */
export function applyVerifiedRulesToDetections(
  objects: DetectedObject[],
  rules: VerifiedFeedbackRule[],
  sceneMorphology?: {
    hasCircularMetallicRim?: boolean;
    hasSoftShadowBoundary?: boolean;
    hasSpecularPuddleSheen?: boolean;
    hasPeriodicPaintStripes?: boolean;
    hasTransverseSpeedHump?: boolean;
    hasStructuralAsphaltBreakup?: boolean;
  }
): {
  keptObjects: DetectedObject[];
  suppressedObjects: DetectedObject[];
  traces: RuleApplicationTrace[];
} {
  const keptObjects: DetectedObject[] = [];
  const suppressedObjects: DetectedObject[] = [];
  const traces: RuleApplicationTrace[] = [];

  objects.forEach((obj, index) => {
    const descLower = (obj.description || '').toLowerCase();
    let matchedRule: VerifiedFeedbackRule | null = null;
    let maxPenalty = 0;
    let matchReason = '';

    for (const rule of rules) {
      if (!rule.targetPredictedTypes.includes(obj.type)) continue;

      const cueHit = rule.triggerCues.find((cue) => descLower.includes(cue));
      let morphologyHit = false;

      if (sceneMorphology && !sceneMorphology.hasStructuralAsphaltBreakup) {
        if (rule.trueNegativeClass === 'manhole' && sceneMorphology.hasCircularMetallicRim) {
          morphologyHit = true;
        } else if (rule.trueNegativeClass === 'shadow' && sceneMorphology.hasSoftShadowBoundary) {
          morphologyHit = true;
        } else if (rule.trueNegativeClass === 'water_puddle' && sceneMorphology.hasSpecularPuddleSheen) {
          morphologyHit = true;
        } else if (rule.trueNegativeClass === 'paint_marking' && sceneMorphology.hasPeriodicPaintStripes) {
          morphologyHit = true;
        } else if (rule.trueNegativeClass === 'speed_breaker' && sceneMorphology.hasTransverseSpeedHump) {
          morphologyHit = true;
        }
      }

      if (cueHit || morphologyHit) {
        if (rule.confidencePenalty > maxPenalty) {
          maxPenalty = rule.confidencePenalty;
          matchedRule = rule;
          matchReason = cueHit
            ? `Cue "${cueHit}" matched ${rule.ruleId} (${rule.trueNegativeClass})`
            : `Morphology signature matched ${rule.ruleId} (${rule.trueNegativeClass})`;
        }
      }
    }

    const rawConfidence = Math.min(1, Math.max(0, obj.confidence));
    const calibratedConfidence = Number(Math.max(0, rawConfidence - maxPenalty).toFixed(3));
    const suppressed = Boolean(
      matchedRule && calibratedConfidence < matchedRule.suppressionThreshold
    );

    traces.push({
      objectIndex: index,
      originalType: obj.type,
      rawConfidence,
      matchedRuleId: matchedRule ? matchedRule.ruleId : null,
      penaltyApplied: maxPenalty,
      calibratedConfidence,
      suppressed,
      suppressionReason: suppressed ? matchReason : undefined,
    });

    const updatedObj: DetectedObject = {
      ...obj,
      confidence: calibratedConfidence,
    };

    if (suppressed) {
      suppressedObjects.push(updatedObj);
    } else {
      keptObjects.push(updatedObj);
    }
  });

  return { keptObjects, suppressedObjects, traces };
}

/**
 * Formal Confidence & Severity Scoring Definition (Review Modification #5):
 *
 * 1. Calibrated Confidence:
 *    c_cal = clamp(p_raw - sum_penalty, 0, 1)
 *
 * 2. Structural Severity Score S in [0, 100]:
 *    S = 100 * (0.45 * A_norm + 0.35 * w_class + 0.20 * c_cal)
 *    where A_norm = min(1, boxAreaFraction / 0.12)
 *          w_class in { D40/pothole: 1.0, D20/alligator: 0.85, D10/transverse: 0.55, D00/longitudinal: 0.50, broken_sign: 0.45 }
 *    Tier mapping:
 *      S >= 65 => 'high'
 *      35 <= S < 65 => 'medium'
 *      S < 35 => 'low'
 */
export function computeValidatedSeverity(
  type: HazardType,
  box2d: [number, number, number, number] | undefined,
  calibratedConfidence: number,
  description: string = ''
): ConfidenceAndSeverityBreakdown {
  let boxAreaRatio = 0.03;
  if (box2d && box2d.length === 4) {
    const [ymin, xmin, ymax, xmax] = box2d;
    const h = Math.max(0, ymax - ymin) / 1000;
    const w = Math.max(0, xmax - xmin) / 1000;
    boxAreaRatio = Math.max(0.002, Math.min(1, h * w));
  }

  const aNorm = Math.min(1, boxAreaRatio / 0.12);
  const descUpper = description.toUpperCase();

  let classHazardWeight = 0.5;
  if (type === 'pothole' || descUpper.includes('D40')) {
    classHazardWeight = 1.0;
  } else if (descUpper.includes('D20') || descUpper.includes('ALLIGATOR')) {
    classHazardWeight = 0.85;
  } else if (descUpper.includes('D10') || descUpper.includes('TRANSVERSE')) {
    classHazardWeight = 0.55;
  } else if (type === 'road_crack' || descUpper.includes('D00')) {
    classHazardWeight = 0.5;
  } else if (type === 'broken_sign') {
    classHazardWeight = 0.45;
  }

  const severityScore = Math.round(
    100 * (0.45 * aNorm + 0.35 * classHazardWeight + 0.20 * calibratedConfidence)
  );

  const severityTier: SeverityLevel =
    severityScore >= 65 ? 'high' : severityScore >= 35 ? 'medium' : 'low';

  return {
    rawConfidence: calibratedConfidence,
    rulePenalty: 0,
    calibratedConfidence,
    boxAreaRatio: Number(boxAreaRatio.toFixed(4)),
    classHazardWeight,
    severityScore,
    severityTier,
  };
}
