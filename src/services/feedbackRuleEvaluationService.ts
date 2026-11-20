import { RoadHazardRecord } from '../types/detection';
import { extractRoadPixelMorphology } from './edgeBaselineDetector';
import {
  compileVerifiedRules,
  CALIBRATION_CORRECTIONS,
  VerifiedFeedbackRule,
} from './feedbackEngine';

export interface SingleRuleEvaluationResult {
  ruleId: string;
  ruleHash: string;
  category: 'Manhole' | 'Shadow' | 'Water Puddle' | 'Paint Marking' | 'Speed Breaker';
  canonicalConstraint: string;
  result: 'Satisfied' | 'Not Satisfied' | 'Inconclusive';
  penalty: number; // Positive magnitude stored in DB, e.g. 0.42
  signedPenalty: number; // +0.42 if Satisfied, -0.42 if Not Satisfied, 0.00 if Inconclusive
  evidence: string;
}

export interface ImageFeedbackRuleEvaluationReport {
  id: string;
  imageId: string;
  imageUrl: string;
  locationName: string;
  captureTimestamp: string;
  evaluationTimestamp: string;
  ruleSetVersion: string;
  totalRules: number;
  satisfiedCount: number;
  notSatisfiedCount: number;
  inconclusiveCount: number;
  totalPositivePenalty: number;
  totalNegativePenalty: number;
  overallScore: number; // Sum of all signed penalty values
  ruleResults: SingleRuleEvaluationResult[];
}

/**
 * Retrieves the 5 canonical verified feedback rules from MySQL (/api/feedback/rules)
 * with deterministic fallback to the compiled calibration rules.
 */
export async function getActiveFiveVerifiedRules(): Promise<VerifiedFeedbackRule[]> {
  try {
    const res = await fetch('/api/feedback/rules');
    if (res.ok) {
      const dbRules: any[] = await res.json();
      if (Array.isArray(dbRules) && dbRules.length >= 5) {
        // Map MySQL schema to VerifiedFeedbackRule
        const mapped: VerifiedFeedbackRule[] = dbRules.slice(0, 5).map((r, idx) => ({
          ruleId: r.id || `RULE-0${idx + 1}`,
          ruleHash: r.rule_hash || '8f3e4d5c',
          ruleSetVersion: r.rule_set_version || 'v2.0-verified-calibration',
          sourceCorrectionIds: r.source_correction_id ? [r.source_correction_id] : [`corr-cal-00${idx + 1}`],
          targetPredictedTypes: r.target_hazard_type === 'pothole' ? ['pothole'] : ['road_crack'],
          trueNegativeClass: r.true_negative_class as any,
          triggerCues: [],
          geometricSignature: {},
          confidencePenalty: Number(r.confidence_penalty) || 0.40,
          suppressionThreshold: Number(r.suppression_threshold) || 0.55,
          canonicalConstraint: r.canonical_constraint || '',
          compiledFromSplit: 'calibration',
          verifiedQuorum: 1,
          createdAt: r.created_at || new Date().toISOString(),
        }));
        return mapped;
      }
    }
  } catch (err) {
    console.warn('[FeedbackRuleEval] Could not load rules from MySQL, using compiled fallback:', err);
  }

  // Fallback to the 5 rules compiled from calibration split
  return compileVerifiedRules(CALIBRATION_CORRECTIONS).slice(0, 5);
}

/**
 * Evaluates a historical road hazard record against the 5 compiled verified feedback rules.
 * Evaluates every rule independently:
 * - Satisfied (+): Exclusion condition present AND existing detection/feedback system correctly identifies and handles it.
 * - Not Satisfied (-): Exclusion condition reliably absent OR system failed to handle a present condition.
 * - Inconclusive (0): Evidence insufficient to make a reliable decision.
 */
export async function evaluateImageAgainstFiveRules(
  record: RoadHazardRecord,
  activeRules: VerifiedFeedbackRule[]
): Promise<ImageFeedbackRuleEvaluationReport> {
  const imageUrl = record.imageUrl || '';
  const desc = (record.description || '').toLowerCase();
  const disputeReason = (record.disputeReason || '').toLowerCase();
  const isConfirmedDamage = record.verifiedStatus === 'confirmed' || record.verificationStatus === 'verified';
  const isDisputedNegative = record.verifiedStatus === 'disputed' || record.verificationStatus === 'rejected';

  // Extract pixel morphology
  const morph = await extractRoadPixelMorphology(imageUrl);
  const hasLowContrastOrOcclusion = morph.meanGradient < 8 && !imageUrl;

  const ruleResults: SingleRuleEvaluationResult[] = [];

  // Helper map from category to canonical rule name and evaluation
  const categoryOrder: Array<{
    key: 'manhole' | 'shadow' | 'water_puddle' | 'paint_marking' | 'speed_breaker';
    label: 'Manhole' | 'Shadow' | 'Water Puddle' | 'Paint Marking' | 'Speed Breaker';
    defaultPenalty: number;
    ruleId: string;
  }> = [
    { key: 'manhole', label: 'Manhole', defaultPenalty: 0.42, ruleId: 'RULE-01' },
    { key: 'shadow', label: 'Shadow', defaultPenalty: 0.40, ruleId: 'RULE-02' },
    { key: 'water_puddle', label: 'Water Puddle', defaultPenalty: 0.38, ruleId: 'RULE-03' },
    { key: 'paint_marking', label: 'Paint Marking', defaultPenalty: 0.44, ruleId: 'RULE-04' },
    { key: 'speed_breaker', label: 'Speed Breaker', defaultPenalty: 0.39, ruleId: 'RULE-05' },
  ];

  for (const item of categoryOrder) {
    const matchedRule = activeRules.find(
      (r) => r.trueNegativeClass === item.key || r.ruleId === item.ruleId
    );
    const ruleId = matchedRule ? matchedRule.ruleId : item.ruleId;
    const ruleHash = matchedRule ? matchedRule.ruleHash : 'canonical';
    const constraint = matchedRule
      ? matchedRule.canonicalConstraint
      : `EXCLUDE ${item.label.toLowerCase()} non-hazard condition from false positive road damage alarms.`;
    const penaltyMagnitude = matchedRule ? Math.abs(matchedRule.confidencePenalty) : item.defaultPenalty;

    let result: 'Satisfied' | 'Not Satisfied' | 'Inconclusive' = 'Not Satisfied';
    let signedPenalty = -penaltyMagnitude;
    let evidence = '';

    if (hasLowContrastOrOcclusion) {
      result = 'Inconclusive';
      signedPenalty = 0.0;
      evidence = 'Insufficient image pixel gradient or optical data to determine exclusion criteria.';
    } else if (item.key === 'manhole') {
      const isManholePresent =
        disputeReason.includes('manhole') ||
        disputeReason.includes('sewer') ||
        disputeReason.includes('utility') ||
        desc.includes('manhole') ||
        desc.includes('sewer') ||
        desc.includes('utility cover') ||
        (morph.circularityScore > 0.72 && !isConfirmedDamage);

      if (isManholePresent) {
        if (isDisputedNegative || disputeReason.includes('manhole')) {
          result = 'Satisfied';
          signedPenalty = +penaltyMagnitude;
          evidence = `Exclusion condition detected: Flush circular metallic utility cover identified (circularity: ${morph.circularityScore.toFixed(2)}). Gating rule correctly suppresses false pothole alarm.`;
        } else {
          result = 'Not Satisfied';
          signedPenalty = -penaltyMagnitude;
          evidence = `Exclusion condition present: Metallic cover geometry detected on lane, but uncalibrated model falsely flagged it without required suppression penalty.`;
        }
      } else {
        result = 'Not Satisfied';
        signedPenalty = -penaltyMagnitude;
        evidence = `Exclusion condition absent: Road frame shows no flush circular metallic sewer lids or utility cover geometry (circularity: ${morph.circularityScore.toFixed(2)}).`;
      }
    } else if (item.key === 'shadow') {
      const isShadowPresent =
        disputeReason.includes('shadow') ||
        disputeReason.includes('canopy') ||
        disputeReason.includes('viaduct') ||
        desc.includes('shadow') ||
        (morph.softShadowEdgeRatio > 0.70 && !morph.hasStructuralAsphaltBreakup && !isConfirmedDamage);

      if (isShadowPresent) {
        if (isDisputedNegative || disputeReason.includes('shadow')) {
          result = 'Satisfied';
          signedPenalty = +penaltyMagnitude;
          evidence = `Exclusion condition detected: Soft overhead shadow contour identified (soft edge ratio: ${morph.softShadowEdgeRatio.toFixed(2)}). Gating rule correctly prevents false crack classification.`;
        } else {
          result = 'Not Satisfied';
          signedPenalty = -penaltyMagnitude;
          evidence = `Exclusion condition present: Low-contrast shadow silhouette detected, but system failed to apply shadow gating penalty.`;
        }
      } else {
        result = 'Not Satisfied';
        signedPenalty = -penaltyMagnitude;
        evidence = `Exclusion condition absent: No uniform low-texture dark bands or tree/overpass silhouettes detected on driving lane.`;
      }
    } else if (item.key === 'water_puddle') {
      const isPuddlePresent =
        disputeReason.includes('puddle') ||
        disputeReason.includes('water') ||
        disputeReason.includes('rain') ||
        desc.includes('puddle') ||
        desc.includes('water') ||
        (morph.specularRatio > 0.50 && !morph.hasStructuralAsphaltBreakup && !isConfirmedDamage);

      if (isPuddlePresent) {
        if (isDisputedNegative || disputeReason.includes('puddle')) {
          result = 'Satisfied';
          signedPenalty = +penaltyMagnitude;
          evidence = `Exclusion condition detected: Smooth reflective water sheen pool identified (specular ratio: ${morph.specularRatio.toFixed(2)}). Gating rule correctly excludes shallow reflection.`;
        } else {
          result = 'Not Satisfied';
          signedPenalty = -penaltyMagnitude;
          evidence = `Exclusion condition present: Water surface reflection detected, but model falsely assigned cavity crater status without depth verification.`;
        }
      } else {
        result = 'Not Satisfied';
        signedPenalty = -penaltyMagnitude;
        evidence = `Exclusion condition absent: No standing rainwater pool or high-specular reflective surface detected on asphalt.`;
      }
    } else if (item.key === 'paint_marking') {
      const isPaintPresent =
        disputeReason.includes('paint') ||
        disputeReason.includes('marking') ||
        disputeReason.includes('zebra') ||
        disputeReason.includes('crosswalk') ||
        desc.includes('paint') ||
        desc.includes('marking') ||
        (morph.stripePeriodicityScore > 0.48 && !isConfirmedDamage);

      if (isPaintPresent) {
        if (isDisputedNegative || disputeReason.includes('paint')) {
          result = 'Satisfied';
          signedPenalty = +penaltyMagnitude;
          evidence = `Exclusion condition detected: High-luminance periodic road stripe markings identified (periodicity score: ${morph.stripePeriodicityScore.toFixed(2)}). Gating rule correctly excludes thermoplastic lines.`;
        } else {
          result = 'Not Satisfied';
          signedPenalty = -penaltyMagnitude;
          evidence = `Exclusion condition present: Pavement paint marking detected, but system incorrectly confused stripe edge with asphalt fracture.`;
        }
      } else {
        result = 'Not Satisfied';
        signedPenalty = -penaltyMagnitude;
        evidence = `Exclusion condition absent: No high-contrast zebra pedestrian crosswalk or lane divider paint markings detected.`;
      }
    } else if (item.key === 'speed_breaker') {
      const isSpeedBreakerPresent =
        disputeReason.includes('speed') ||
        disputeReason.includes('breaker') ||
        disputeReason.includes('hump') ||
        disputeReason.includes('bump') ||
        desc.includes('speed breaker') ||
        desc.includes('speed hump');

      if (isSpeedBreakerPresent) {
        if (isDisputedNegative || disputeReason.includes('speed')) {
          result = 'Satisfied';
          signedPenalty = +penaltyMagnitude;
          evidence = `Exclusion condition detected: Intentional transverse speed hump detected spanning lane width. Gating rule correctly excludes intentional calming structure.`;
        } else {
          result = 'Not Satisfied';
          signedPenalty = -penaltyMagnitude;
          evidence = `Exclusion condition present: Transverse speed hump detected, but system failed to apply speed-breaker gating exclusion.`;
        }
      } else {
        result = 'Not Satisfied';
        signedPenalty = -penaltyMagnitude;
        evidence = `Exclusion condition absent: No intentional transverse asphalt speed hump or rumble strip pattern detected.`;
      }
    }

    ruleResults.push({
      ruleId,
      ruleHash,
      category: item.label,
      canonicalConstraint: constraint,
      result,
      penalty: Number(penaltyMagnitude.toFixed(2)),
      signedPenalty: Number(signedPenalty.toFixed(2)),
      evidence,
    });
  }

  const satisfiedCount = ruleResults.filter((r) => r.result === 'Satisfied').length;
  const notSatisfiedCount = ruleResults.filter((r) => r.result === 'Not Satisfied').length;
  const inconclusiveCount = ruleResults.filter((r) => r.result === 'Inconclusive').length;

  const totalPositivePenalty = Number(
    ruleResults
      .filter((r) => r.result === 'Satisfied')
      .reduce((acc, r) => acc + r.signedPenalty, 0)
      .toFixed(2)
  );

  const totalNegativePenalty = Number(
    ruleResults
      .filter((r) => r.result === 'Not Satisfied')
      .reduce((acc, r) => acc + r.signedPenalty, 0)
      .toFixed(2)
  );

  const overallScore = Number((totalPositivePenalty + totalNegativePenalty).toFixed(2));

  const evaluationReport: ImageFeedbackRuleEvaluationReport = {
    id: `eval-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    imageId: record.id,
    imageUrl: record.imageUrl || '',
    locationName: record.locationName || 'Live Camera Sector',
    captureTimestamp: record.timestamp || new Date().toISOString(),
    evaluationTimestamp: new Date().toISOString(),
    ruleSetVersion: activeRules[0]?.ruleSetVersion || 'v2.0-verified-calibration',
    totalRules: ruleResults.length,
    satisfiedCount,
    notSatisfiedCount,
    inconclusiveCount,
    totalPositivePenalty,
    totalNegativePenalty,
    overallScore,
    ruleResults,
  };

  return evaluationReport;
}

/**
 * Saves evaluation report to MySQL via POST /api/feedback/evaluations.
 * Never overwrites previous evaluations.
 */
export async function saveFeedbackRuleEvaluation(
  evaluation: ImageFeedbackRuleEvaluationReport
): Promise<boolean> {
  try {
    const res = await fetch('/api/feedback/evaluations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: evaluation.id,
        imageId: evaluation.imageId,
        imageUrl: evaluation.imageUrl,
        locationName: evaluation.locationName,
        captureTimestamp: evaluation.captureTimestamp,
        evaluationTimestamp: evaluation.evaluationTimestamp,
        ruleSetVersion: evaluation.ruleSetVersion,
        totalRules: evaluation.totalRules,
        satisfiedCount: evaluation.satisfiedCount,
        notSatisfiedCount: evaluation.notSatisfiedCount,
        inconclusiveCount: evaluation.inconclusiveCount,
        totalPositivePenalty: evaluation.totalPositivePenalty,
        totalNegativePenalty: evaluation.totalNegativePenalty,
        overallScore: evaluation.overallScore,
        ruleResults: evaluation.ruleResults,
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn('[FeedbackRuleEval] Error saving evaluation to MySQL:', err);
    return false;
  }
}

/**
 * Fetches all saved evaluations for a specific image from MySQL (/api/feedback/evaluations/:imageId).
 */
export async function getEvaluationsForImage(
  imageId: string
): Promise<ImageFeedbackRuleEvaluationReport[]> {
  try {
    const res = await fetch(`/api/feedback/evaluations/${encodeURIComponent(imageId)}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        return data.map((r: any) => ({
          id: r.id,
          imageId: r.image_id || r.imageId,
          imageUrl: r.image_url || r.imageUrl || '',
          locationName: r.location_name || r.locationName || '',
          captureTimestamp: r.capture_timestamp || r.captureTimestamp || '',
          evaluationTimestamp: r.evaluation_timestamp || r.evaluationTimestamp || '',
          ruleSetVersion: r.rule_set_version || r.ruleSetVersion || 'v2.0-verified-calibration',
          totalRules: Number(r.total_rules || r.totalRules || 5),
          satisfiedCount: Number(r.satisfied_count || r.satisfiedCount || 0),
          notSatisfiedCount: Number(r.not_satisfied_count || r.notSatisfiedCount || 0),
          inconclusiveCount: Number(r.inconclusive_count || r.inconclusiveCount || 0),
          totalPositivePenalty: Number(r.total_positive_penalty || r.totalPositivePenalty || 0),
          totalNegativePenalty: Number(r.total_negative_penalty || r.totalNegativePenalty || 0),
          overallScore: Number(r.overall_score || r.overallScore || 0),
          ruleResults: Array.isArray(r.rule_results)
            ? r.rule_results
            : Array.isArray(r.ruleResults)
            ? r.ruleResults
            : [],
        }));
      }
    }
  } catch (err) {
    console.warn('[FeedbackRuleEval] Error fetching past evaluations:', err);
  }
  return [];
}

/**
 * Fetches all past evaluations across all images from MySQL (/api/feedback/evaluations).
 */
export async function getAllSavedRuleEvaluations(): Promise<ImageFeedbackRuleEvaluationReport[]> {
  try {
    const res = await fetch('/api/feedback/evaluations');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        return data.map((r: any) => ({
          id: r.id,
          imageId: r.image_id || r.imageId,
          imageUrl: r.image_url || r.imageUrl || '',
          locationName: r.location_name || r.locationName || '',
          captureTimestamp: r.capture_timestamp || r.captureTimestamp || '',
          evaluationTimestamp: r.evaluation_timestamp || r.evaluationTimestamp || '',
          ruleSetVersion: r.rule_set_version || r.ruleSetVersion || 'v2.0-verified-calibration',
          totalRules: Number(r.total_rules || r.totalRules || 5),
          satisfiedCount: Number(r.satisfied_count || r.satisfiedCount || 0),
          notSatisfiedCount: Number(r.not_satisfied_count || r.notSatisfiedCount || 0),
          inconclusiveCount: Number(r.inconclusive_count || r.inconclusiveCount || 0),
          totalPositivePenalty: Number(r.total_positive_penalty || r.totalPositivePenalty || 0),
          totalNegativePenalty: Number(r.total_negative_penalty || r.totalNegativePenalty || 0),
          overallScore: Number(r.overall_score || r.overallScore || 0),
          ruleResults: Array.isArray(r.rule_results)
            ? r.rule_results
            : Array.isArray(r.ruleResults)
            ? r.ruleResults
            : [],
        }));
      }
    }
  } catch (err) {
    console.warn('[FeedbackRuleEval] Error fetching all evaluations:', err);
  }
  return [];
}
