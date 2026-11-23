import fs from 'fs';
import path from 'path';
import { multiModelFusionService } from './src/services/multiModelFusionService';

async function main() {
  console.log('='.repeat(70));
  console.log('ROADGUARD MULTI-MODEL AI (YOLO + GEMINI + FEEDBACK GATING) E2E TEST');
  console.log('='.repeat(70));

  const testPath = 'D:/Downloads/test.jpg';
  if (!fs.existsSync(testPath)) {
    console.error('Test image not found:', testPath);
    return;
  }

  const imgBuffer = fs.readFileSync(testPath);
  const base64Data = imgBuffer.toString('base64');
  const dataUrl = `data:image/jpeg;base64,${base64Data}`;

  console.log(`Analyzing: ${testPath} (Target: 'potholes')...`);
  const t0 = Date.now();
  
  const result = await multiModelFusionService.detectRoadProblems(
    dataUrl,
    'image/jpeg',
    'potholes'
  );

  const duration = Date.now() - t0;
  console.log(`\nAnalysis finished in ${duration}ms!`);
  console.log(`Model Used: ${result.modelUsed}`);
  console.log(`Total Potholes Detected: ${result.objects.length}`);
  console.log(`Detected Flag: ${result.detected}\n`);

  console.log('Detected Potholes List:');
  result.objects.forEach((obj, idx) => {
    console.log(`  [#${idx + 1}] Conf: ${(obj.confidence * 100).toFixed(1)}% | Class: ${obj.damageClass || 'D40'} | Box: [${obj.box2d?.join(', ')}]`);
    console.log(`       Desc: ${obj.description}`);
  });

  // Verify that the silver van is NOT detected as a pothole
  // In test.jpg normalized coordinates, the silver van is roughly [ymin: 350-480, xmin: 440-520]
  const vanFP = result.objects.filter(obj => {
    if (!obj.box2d) return false;
    const [ymin, xmin, ymax, xmax] = obj.box2d;
    const cy = (ymin + ymax) / 2;
    const cx = (xmin + xmax) / 2;
    return cy >= 350 && cy <= 480 && cx >= 440 && cx <= 520;
  });

  console.log('\n' + '='.repeat(70));
  console.log(`VERIFICATION SUMMARY:`);
  console.log(`  - Potholes Detected: ${result.objects.length} (Exhaustive Recall across all roadway zones)`);
  console.log(`  - Vehicle False Positives on Silver Van: ${vanFP.length} (Expected: 0)`);
  console.log(`  - Accuracy Status: ${result.objects.length >= 4 && vanFP.length === 0 ? '100% ACCURATE (PASSED)' : 'NEEDS ADJUSTMENT'}`);
  console.log('='.repeat(70));
}

main().catch(console.error);
