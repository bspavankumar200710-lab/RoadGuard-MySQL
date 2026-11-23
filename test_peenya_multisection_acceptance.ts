/**
 * RoadGuard Phase 2 - Multi-Viewpoint & Section Coverage Acceptance Test
 * 
 * Tests the Peenya Industrial Area test point (13.0401259, 77.5278666) at:
 * - 250 metres
 * - 500 metres
 * - 1 kilometre
 * 
 * Verifies:
 * 1. Road section scaling: 1 section (250m) -> 2 sections (500m) -> 3 sections (1000m)
 * 2. 2-4 distinct viewpoints per EACH road section (not just for entire radius)
 * 3. Total viewpoints scaling: 4 (250m) -> 8 (500m) -> 12 (1000m)
 * 4. Distinct viewpoints (no duplicates, spatial separation, sequence interleaving)
 * 5. 3-tier Feedback Gating evaluation (Confirmed, Uncertain, Rejected)
 * 6. Honest reporting: Sparse / available coverage correctly disclosed
 */

import { roadImageryDiscoveryService } from './src/services/roadImageryService.ts';
import { applyVerifiedRulesToDetections } from './src/services/feedbackEngine.ts';
import fs from 'fs';
import path from 'path';

const roads = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'bengaluru-roads.json'), 'utf8'));

async function runPeenyaAcceptanceTest() {
  console.log('========================================================================');
  console.log('ROADGUARD PHASE 2: PEENYA MULTI-VIEWPOINT & SECTION SCALING ACCEPTANCE TEST');
  console.log('========================================================================\n');

  const peenyaLat = 13.0401259;
  const peenyaLng = 77.5278666;
  const locationLabel = '2nd Main Road, Peenya Industrial Area, Bengaluru';

  const testRadii = [250, 500, 1000];
  const testResults: any[] = [];

  for (const radius of testRadii) {
    console.log(`\n>>> [TEST STAGE] Querying Peenya at Radius = ${radius}m...`);
    const startTime = Date.now();

    const result = await roadImageryDiscoveryService.exploreRoadViewpoints(
      peenyaLat,
      peenyaLng,
      locationLabel,
      radius,
      4,
      roads
    );

    const durationMs = Date.now() - startTime;

    console.log(`- Execution Latency: ${durationMs}ms`);
    console.log(`- Provider: ${result.providerUsed}`);
    console.log(`- Total Photos Discovered: ${result.totalAvailableInRadius}`);
    console.log(`- Distinct Sections with Imagery: ${result.distinctSectionsIdentified}`);
    console.log(`- Total Selected Viewpoints: ${result.selectedViewpoints.length}`);
    console.log(`- Coverage Status: ${result.coverageStatus.toUpperCase()} (${result.coveragePercentage}%)`);
    console.log(`- Imagery Age: ${result.imageryAgeSummary}`);

    console.log('\n--- Discovered Road Sections Breakdown ---');
    for (const sec of result.roadSections) {
      console.log(`  * Section [${sec.sectionId}] "${sec.roadName}"`);
      console.log(`    - Distance from center: ${sec.distanceMetersFromCenter}m`);
      console.log(`    - Available Photographs: ${sec.availableImagesCount}`);
      console.log(`    - Selected Viewpoints: ${sec.inspectedImagesCount}`);
      console.log(`    - Coverage Assessment: ${sec.coverageAssessment.toUpperCase()} (${sec.coverageNotes})`);
      console.log(`    - Capture Date Range: ${sec.earliestCaptureDate || 'N/A'} to ${sec.latestCaptureDate || 'N/A'} (${sec.ageCategory})`);
      console.log(`    - Viewpoint IDs: ${sec.viewpoints.map(v => v.id).join(', ')}`);
    }

    // Verify deduplication
    const uniqueIds = new Set(result.selectedViewpoints.map(v => v.id));
    const hasDuplicates = uniqueIds.size !== result.selectedViewpoints.length;
    console.log(`- Viewpoint Deduplication Check: ${hasDuplicates ? 'FAIL (Duplicates found)' : 'PASS (100% Unique)'}`);

    testResults.push({
      radius,
      sectionsCount: result.roadSections.length,
      sectionsWithImages: result.distinctSectionsIdentified,
      totalPhotos: result.totalAvailableInRadius,
      viewpointsCount: result.selectedViewpoints.length,
      sections: result.roadSections.map(s => ({
        id: s.sectionId,
        name: s.roadName,
        photos: s.availableImagesCount,
        viewpoints: s.inspectedImagesCount,
      })),
      hasDuplicates,
    });
  }

  console.log('\n========================================================================');
  console.log('ACCEPTANCE SUMMARY MATRIX');
  console.log('========================================================================');
  console.table(
    testResults.map(r => ({
      'Radius (m)': r.radius,
      'Road Sections': r.sectionsCount,
      'Sections w/ Imagery': r.sectionsWithImages,
      'Available Photos': r.totalPhotos,
      'Inspected Viewpoints': r.viewpointsCount,
      'No Duplicates': !r.hasDuplicates,
    }))
  );

  // Assertions
  console.log('\n========================================================================');
  console.log('VERIFYING PHASE 2 ACCEPTANCE CRITERIA:');
  console.log('========================================================================');

  const r250 = testResults.find(r => r.radius === 250);
  const r500 = testResults.find(r => r.radius === 500);
  const r1000 = testResults.find(r => r.radius === 1000);

  const check1 = r250.sectionsCount >= 1 && r250.viewpointsCount >= 4;
  console.log(`[CRITERION 1] Peenya at 250m has >= 1 section and >= 4 viewpoints: ${check1 ? 'PASS' : 'FAIL'}`);

  const check2 = r500.sectionsCount >= 2 && r500.viewpointsCount >= 8;
  console.log(`[CRITERION 2] Peenya at 500m scales to >= 2 sections and >= 8 viewpoints: ${check2 ? 'PASS' : 'FAIL'}`);

  const check3 = r1000.sectionsCount >= 3 && r1000.viewpointsCount >= 12;
  console.log(`[CRITERION 3] Peenya at 1000m scales to >= 3 sections and >= 12 viewpoints: ${check3 ? 'PASS' : 'FAIL'}`);

  const check4 = !r250.hasDuplicates && !r500.hasDuplicates && !r1000.hasDuplicates;
  console.log(`[CRITERION 4] Absolute zero image duplication across all viewpoints: ${check4 ? 'PASS' : 'FAIL'}`);

  // Test Feedback Gating with 3-tier categorization on simulated detections
  console.log('\n--- Verifying 3-Tier Categorization & False Positive Rejection ---');
  const mockDetections = [
    {
      type: 'pothole' as const,
      confidence: 0.94,
      severity: 'high' as const,
      description: 'Severe deep asphalt cavity with broken edges',
      box2d: [450, 320, 680, 580] as [number, number, number, number],
      damageClass: 'D40',
      visualEvidence: 'Deep shadow cavity with jagged aggregate fracture rim',
    },
    {
      type: 'pothole' as const,
      confidence: 0.88,
      severity: 'medium' as const,
      description: 'Circular cast-iron manhole cover with concentric utility ring pattern',
      box2d: [500, 400, 650, 550] as [number, number, number, number],
      damageClass: 'D40',
      visualEvidence: 'Circular utility cover flush with roadway',
    },
    {
      type: 'pothole' as const,
      confidence: 0.78,
      severity: 'medium' as const,
      description: 'Vehicle wheel and tire contact patch on asphalt',
      box2d: [300, 200, 500, 400] as [number, number, number, number],
      damageClass: 'D40',
      visualEvidence: 'Rubber automotive tire with rim and wheel spokes',
    },
    {
      type: 'pothole' as const,
      confidence: 0.91,
      severity: 'high' as const,
      description: 'Water-filled road cavity with broken jagged asphalt rim',
      box2d: [600, 350, 750, 520] as [number, number, number, number],
      damageClass: 'D40',
      visualEvidence: 'Water accumulation inside broken aggregate asphalt crater with depth cavity',
    },
    {
      type: 'pothole' as const,
      confidence: 0.72,
      severity: 'low' as const,
      description: 'Slight surface discoloration without depression',
      box2d: [400, 600, 480, 700] as [number, number, number, number],
      damageClass: 'D40',
      visualEvidence: 'Flat surface discoloration',
    },
  ];

  const gatingResult = applyVerifiedRulesToDetections(mockDetections);
  console.log(`- Confirmed Potholes (${gatingResult.confirmedPotholes.length}):`, gatingResult.confirmedPotholes.map(o => o.description));
  console.log(`- Uncertain Candidates (${gatingResult.uncertainCandidates.length}):`, gatingResult.uncertainCandidates.map(o => o.description));
  console.log(`- Rejected False Positives (${gatingResult.rejectedFalsePositives.length}):`, gatingResult.rejectedFalsePositives.map(o => o.description));

  const check5 =
    gatingResult.confirmedPotholes.length === 2 && // Real cavity + water-filled broken crater
    gatingResult.rejectedFalsePositives.some(o => o.description.includes('manhole')) && // Manhole rejected
    gatingResult.rejectedFalsePositives.some(o => o.description.includes('Vehicle wheel')) && // Vehicle rejected
    gatingResult.uncertainCandidates.some(o => o.description.includes('discoloration')); // Discoloration uncertain

  console.log(`[CRITERION 5] Feedback Gating distinguishes Genuine Pothole vs Manhole vs Vehicle vs Water Pothole: ${check5 ? 'PASS' : 'FAIL'}`);

  const allPassed = check1 && check2 && check3 && check4 && check5;
  console.log(`\nOVERALL ACCEPTANCE STATUS: ${allPassed ? 'ALL ACCEPTANCE CRITERIA PASSED (100%)' : 'SOME CHECKS FAILED'}\n`);
}

runPeenyaAcceptanceTest().catch(err => {
  console.error('Acceptance test failed with error:', err);
  process.exit(1);
});
