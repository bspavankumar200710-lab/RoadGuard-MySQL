/**
 * High-fidelity demo road sample images (Data URLs encoded for instant testing)
 * and realistic presets for testing the AI Vision detector, Vehicle Speed Radar, and GPS tagging.
 */

// Generate realistic road texture canvases converted to Data URLs
export function createSampleRoadCanvas(type: 'pothole' | 'crack' | 'broken_sign' | 'car_speed' | 'scooter_speed' | 'clean'): string {
  if (typeof document === 'undefined') return '';

  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // 1. Draw Asphalt Road Surface & Horizon Perspective
  const skyGrad = ctx.createLinearGradient(0, 0, 0, 180);
  skyGrad.addColorStop(0, '#5c768d');
  skyGrad.addColorStop(1, '#8ea3b5');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, 640, 180);

  // Distant horizon trees/buildings
  ctx.fillStyle = '#3a4a3b';
  ctx.beginPath();
  ctx.moveTo(0, 180);
  for (let x = 0; x <= 640; x += 40) {
    ctx.lineTo(x, 170 - (x % 30));
  }
  ctx.lineTo(640, 180);
  ctx.fill();

  // Road asphalt perspective
  const roadGrad = ctx.createLinearGradient(0, 180, 0, 480);
  roadGrad.addColorStop(0, '#33383e');
  roadGrad.addColorStop(1, '#1e2226');
  ctx.fillStyle = roadGrad;
  ctx.beginPath();
  ctx.moveTo(220, 180);
  ctx.lineTo(420, 180);
  ctx.lineTo(620, 480);
  ctx.lineTo(20, 480);
  ctx.closePath();
  ctx.fill();

  // Road shoulders
  ctx.fillStyle = '#685d4e';
  ctx.beginPath();
  ctx.moveTo(0, 180);
  ctx.lineTo(220, 180);
  ctx.lineTo(20, 480);
  ctx.lineTo(0, 480);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(420, 180);
  ctx.lineTo(640, 180);
  ctx.lineTo(640, 480);
  ctx.lineTo(620, 480);
  ctx.fill();

  // White lane markings
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 4;
  ctx.setLineDash([20, 25]);
  ctx.beginPath();
  ctx.moveTo(320, 180);
  ctx.lineTo(320, 480);
  ctx.stroke();
  ctx.setLineDash([]);

  // Road edge solid lines
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(220, 180);
  ctx.lineTo(20, 480);
  ctx.moveTo(420, 180);
  ctx.lineTo(620, 480);
  ctx.stroke();

  // 2. Specific hazard or moving vehicle elements
  if (type === 'pothole') {
    // High-contrast, photorealistic cavity
    const cx = 350;
    const cy = 350;

    // Dark crater cavity shadow
    const craterGrad = ctx.createRadialGradient(cx - 10, cy - 8, 5, cx, cy, 75);
    craterGrad.addColorStop(0, '#0a0a0b');
    craterGrad.addColorStop(0.65, '#17171a');
    craterGrad.addColorStop(0.9, '#303035');
    craterGrad.addColorStop(1, '#1e2226');
    ctx.fillStyle = craterGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 70, 42, 0.08, 0, Math.PI * 2);
    ctx.fill();

    // Jagged edge rim
    ctx.strokeStyle = '#4b5563';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 72, 44, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Gravel debris around rim
    ctx.fillStyle = '#78716c';
    for (let g = 0; g < 40; g++) {
      ctx.fillRect(cx - 80 + Math.random() * 160, cy - 50 + Math.random() * 100, 3, 2);
    }
  } else if (type === 'car_speed') {
    // Moving car ahead in right lane
    ctx.save();
    ctx.translate(430, 280);

    // Car shadow
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.ellipse(0, 50, 75, 20, 0, 0, Math.PI * 2);
    ctx.fill();

    // Car Body (Red Sedan)
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.roundRect(-60, -10, 120, 55, 12);
    ctx.fill();

    // Cabin roof
    ctx.fillStyle = '#991b1b';
    ctx.beginPath();
    ctx.roundRect(-42, -45, 84, 40, 8);
    ctx.fill();

    // Rear Windshield
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.roundRect(-36, -40, 72, 28, 6);
    ctx.fill();

    // Taillights
    ctx.fillStyle = '#ef4444';
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 10;
    ctx.fillRect(-52, 10, 20, 10);
    ctx.fillRect(32, 10, 20, 10);
    ctx.shadowBlur = 0;

    // License Plate
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-18, 22, 36, 12);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 8px monospace';
    ctx.fillText('KA 01', -14, 31);

    // Wheels
    ctx.fillStyle = '#09090b';
    ctx.fillRect(-62, 35, 16, 20);
    ctx.fillRect(46, 35, 16, 20);

    ctx.restore();
  } else if (type === 'scooter_speed') {
    // Moving Scooter / Two-Wheeler on center lane
    ctx.save();
    ctx.translate(330, 290);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(0, 55, 30, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Scooter Body (Blue Honda Activa style)
    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.roundRect(-18, 10, 36, 40, 8);
    ctx.fill();

    // Rider Torso & Helmet
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.ellipse(0, -10, 18, 24, 0, 0, Math.PI * 2);
    ctx.fill();

    // Helmet
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(0, -42, 15, 0, Math.PI * 2);
    ctx.fill();

    // Scooter Taillight
    ctx.fillStyle = '#ef4444';
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 8;
    ctx.fillRect(-10, 22, 20, 8);
    ctx.shadowBlur = 0;

    // Tire
    ctx.fillStyle = '#09090b';
    ctx.fillRect(-8, 48, 16, 16);

    ctx.restore();
  } else if (type === 'crack') {
    // Severe road crack spreading across asphalt
    ctx.strokeStyle = '#090a0b';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(270, 440);
    ctx.lineTo(290, 390);
    ctx.lineTo(330, 350);
    ctx.lineTo(315, 310);
    ctx.lineTo(350, 270);
    ctx.lineTo(340, 230);
    ctx.stroke();
  } else if (type === 'broken_sign') {
    ctx.save();
    ctx.translate(470, 250);
    ctx.rotate(0.28);
    ctx.fillStyle = '#64748b';
    ctx.fillRect(-4, 0, 8, 140);
    ctx.fillStyle = '#e2e8f0';
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(-28, -60, 56, 60, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('45', 0, -20);
    ctx.restore();
  }

  return canvas.toDataURL('image/jpeg', 0.88);
}

export interface DemoSample {
  id: string;
  name: string;
  category: 'pothole' | 'crack' | 'broken_sign' | 'car_speed' | 'scooter_speed' | 'clean';
  badge: string;
  expectedHazard: string;
  severity: 'high' | 'medium' | 'low' | 'none';
  generateImage: () => string;
}

export const DEMO_SAMPLES: DemoSample[] = [
  {
    id: 'sample-pothole',
    name: 'Asphalt Deep Pothole',
    category: 'pothole',
    badge: 'Pothole',
    expectedHazard: 'Deep asphalt cavity in driving line',
    severity: 'high',
    generateImage: () => createSampleRoadCanvas('pothole'),
  },
  {
    id: 'sample-car-speed',
    name: 'Moving Car Speed Radar',
    category: 'car_speed',
    badge: 'Car Speed (68 km/h)',
    expectedHazard: 'Moving Sedan car cruising at 68 km/h',
    severity: 'high',
    generateImage: () => createSampleRoadCanvas('car_speed'),
  },
  {
    id: 'sample-scooter-speed',
    name: 'Moving Scooter Speed Radar',
    category: 'scooter_speed',
    badge: 'Scooter Speed (48 km/h)',
    expectedHazard: 'Scooter / Two-wheeler traveling at 48 km/h',
    severity: 'low',
    generateImage: () => createSampleRoadCanvas('scooter_speed'),
  },
  {
    id: 'sample-crack',
    name: 'Fatigue Surface Crack',
    category: 'crack',
    badge: 'Road Crack',
    expectedHazard: 'Longitudinal road cracking',
    severity: 'medium',
    generateImage: () => createSampleRoadCanvas('crack'),
  },
  {
    id: 'sample-sign',
    name: 'Bent & Damaged Road Sign',
    category: 'broken_sign',
    badge: 'Broken Sign',
    expectedHazard: 'Dented/tilted roadside warning sign',
    severity: 'medium',
    generateImage: () => createSampleRoadCanvas('broken_sign'),
  },
  {
    id: 'sample-clean',
    name: 'Smooth Asphalt Highway',
    category: 'clean',
    badge: 'Clear Road',
    expectedHazard: 'No hazard (negative control test)',
    severity: 'none',
    generateImage: () => createSampleRoadCanvas('clean'),
  },
];
