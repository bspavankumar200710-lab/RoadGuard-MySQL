import express from 'express';
import { createServer as createViteServer } from 'vite';
import pool from './db';
import { GoogleGenAI, Type } from '@google/genai';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import { roadImageryDiscoveryService, calculateHaversineMeters } from './src/services/roadImageryService';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Allow up to 25MB for captured high-resolution camera frames
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(cookieParser());

// Serve public static assets (including ONNX models and WASM binaries) with explicit MIME types
app.use(
  express.static(path.resolve(__dirname, 'public'), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.wasm')) {
        res.setHeader('Content-Type', 'application/wasm');
      } else if (filePath.endsWith('.mjs')) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      }
    },
  })
);

// Prevent SPA index.html fallback for missing WASM binaries or ONNX model weights
app.use(['/wasm', '/models'], (req, res) => {
  return res.status(404).json({
    error: `Static asset not found: ${req.originalUrl}`,
  });
});

// -------------------------------------------------------------
// INITIALIZE GEMINI CLIENT
// -------------------------------------------------------------

const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;

if (apiKey) {
  ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// -------------------------------------------------------------
// API ENDPOINTS
// -------------------------------------------------------------

const JWT_SECRET = process.env.JWT_SECRET || 'roadguard-dev-jwt-secret-change-in-production';
const AUTH_COOKIE = 'roadguard_token';

if (!process.env.JWT_SECRET) {
  console.warn('[AI Studio] JWT_SECRET not set — using ephemeral development secret');
}

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000
};

// ============================================================
// AUTHENTICATION - MYSQL + JWT
// ============================================================

// REGISTER
app.post('/api/auth/register', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!username || !email || !password) {
      return res.status(400).json({
        error: 'Username, email and password are required'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: 'Password must contain at least 8 characters'
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        error: 'Invalid email address'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const [result]: any = await pool.execute(
      'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
      [username, email, hashedPassword]
    );

    const token = jwt.sign(
      { userId: result.insertId },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie(AUTH_COOKIE, token, cookieOptions);

    return res.status(201).json({
      success: true,
      user: {
        id: result.insertId,
        username,
        email
      }
    });

  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        error: 'Email is already registered'
      });
    }

    console.error('Registration error:', error);

    return res.status(500).json({
      error: 'Registration failed'
    });
  }
});

// LOGIN
app.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required'
      });
    }

    const [rows]: any = await pool.execute(
      'SELECT id, username, email, password FROM users WHERE email = ?',
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        error: 'Invalid email or password'
      });
    }

    const user = rows[0];

    const passwordMatches = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatches) {
      return res.status(401).json({
        error: 'Invalid email or password'
      });
    }

    const token = jwt.sign(
      { userId: user.id },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie(AUTH_COOKIE, token, cookieOptions);

    return res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });

  } catch (error) {
    console.error('Login error:', error);

    return res.status(500).json({
      error: 'Login failed'
    });
  }
});

// GET CURRENT LOGGED-IN USER
app.get('/api/auth/me', async (req, res) => {
  try {
    const token = req.cookies?.[AUTH_COOKIE];

    if (!token) {
      return res.status(401).json({
        error: 'Not logged in'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: number
    };

    const [rows]: any = await pool.execute(
      'SELECT id, username, email FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (rows.length === 0) {
      res.clearCookie(AUTH_COOKIE, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
      });

      return res.status(401).json({
        error: 'User not found'
      });
    }

    return res.json({
      user: rows[0]
    });

  } catch (error) {
    res.clearCookie(AUTH_COOKIE, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    });

    return res.status(401).json({
      error: 'Invalid or expired session'
    });
  }
});

// LOGOUT
app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie(AUTH_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  });

  return res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

// ============================================================
// GEMINI DETECTION AI ENDPOINT (WITH QUOTA COOLDOWN & CACHE)
// ============================================================

let geminiCooldownUntil = 0;
const geminiResponseCache = new Map<string, { expiresAt: number; payload: any }>();
const GEMINI_CACHE_TTL_MS = 5 * 60 * 1000;
const GEMINI_CACHE_MAX_ENTRIES = 60;

function parseRetryDelaySeconds(err: any): number {
  const msg = String(err?.message || '');
  const retryMatch = msg.match(/retry in\s+([0-9.]+)s/i) || msg.match(/"retryDelay":"(\d+)s"/i);
  if (retryMatch) {
    const parsed = Math.ceil(Number(retryMatch[1]));
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 120) {
      return parsed;
    }
  }
  return 35;
}

function isQuotaOrRateLimitError(err: any): boolean {
  const status = err?.status || err?.code;
  const msg = String(err?.message || '');
  return (
    status === 429 ||
    msg.includes('"code":429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('Quota exceeded')
  );
}

app.post('/api/detect', async (req, res) => {
  const startTime = Date.now();

  const {
    imageBase64,
    mimeType = 'image/jpeg',
    mode = 'both',
    learnedDirectives = '',
    useFeedbackRules = true,
  } = req.body;

  if (!imageBase64) {
    return res.status(400).json({
      error: 'Missing imageBase64 in request body',
      detected: false,
      objects: []
    });
  }

  // Strip potential data URL prefix if present
  let cleanBase64 = imageBase64;

  if (cleanBase64.includes('base64,')) {
    cleanBase64 = cleanBase64.split('base64,')[1];
  }

  // Return cached identical frame result immediately without consuming quota
  const cacheKey = crypto
    .createHash('sha256')
    .update(`${mode}|${Boolean(useFeedbackRules)}|${String(learnedDirectives)}|`)
    .update(cleanBase64)
    .digest('hex');

  const cached = geminiResponseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json({
      ...cached.payload,
      cached: true,
      latencyMs: Date.now() - startTime,
    });
  }

  // Gemini API unavailable — do not generate fake detections.
  if (!ai) {
    return res.status(503).json({
      error: 'Gemini API is unavailable. Please configure GEMINI_API_KEY.',
      detected: false,
      objects: [],
      modelUsed: 'gemini-unavailable',
    });
  }

  // If server is in a 429 quota cooldown window, short-circuit immediately instead of hammering upstream
  const now = Date.now();
  if (now < geminiCooldownUntil) {
    const retryAfterSeconds = Math.max(1, Math.ceil((geminiCooldownUntil - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({
      error: `Gemini API rate limit cooldown active. Retry in ${retryAfterSeconds}s.`,
      rateLimited: true,
      retryAfterSeconds,
      detected: false,
      objects: [],
      modelUsed: 'gemini-rate-limited',
    });
  }

  try {
    let modeInstruction = '';

    if (mode === 'potholes') {
      modeInstruction = `TARGET MODE: EXHAUSTIVE POTHOLE DETECTION ONLY (NO CRACKS, NO VEHICLES, NO SIGNS).
Your sole objective is to inspect the ENTIRE road surface meticulously from foreground to background and detect EVERY SINGLE POTHOLE:
- Near foreground (y: 500-1000): deep cavities, asphalt depressions, water-filled craters where rainwater settled into broken road.
- Midground driving lanes (y: 350-550): every distinct cavity, eroded asphalt pit, depression across left, center, right lanes.
- Far background roadway (y: 200-350): any distant potholes before the vehicle horizon.
- CRITICAL BOUNDING BOX RULE: DO NOT merge multiple potholes into one giant bounding box! If there is a cluster of puddles/craters across the roadway, output a separate entry with its own tight bounding box [ymin, xmin, ymax, xmax] (0 to 1000) for EACH individual crater.
- Distinguish potholes from vehicles (cars, vans, buses, trucks, scooters, auto-rickshaws) which must NEVER be classified as road damage.
- Flat water reflections on intact smooth asphalt are NOT potholes. Only classify puddles as potholes if they sit within a structural depression or broken asphalt cavity with visible rims.
- Report EACH pothole as an individual separate object with accurate [ymin, xmin, ymax, xmax] coordinates (0 to 1000).
- Do NOT report cracks, road markings, vehicles, or signs. Output ONLY POTHOLES ('type': 'pothole', 'damageClass': 'D40').`;

    } else if (mode === 'speed') {
      modeInstruction = `TARGET MODE: MOVING VEHICLES & SCOOTER SPEED ESTIMATION ONLY.
Carefully identify moving vehicles (cars, two-wheelers, scooters, motorcycles, autos, buses, trucks) on the roadway.
For each moving car, scooter, or vehicle:
- type: 'vehicle_speed'
- vehicleType: 'car' | 'scooter' | 'motorcycle' | 'auto' | 'truck' | 'bus'
- estimatedSpeedKmh: realistic speed in km/h based on position, motion blur, lane flow (e.g. 20 to 110 km/h)
- speedLimitKmh: typical road speed limit (e.g. 40, 50, 60, or 80 km/h)
- isOverSpeed: boolean true if estimatedSpeedKmh > speedLimitKmh
- severity: 'high' if over speed limit by >15km/h, 'medium' if near limit, 'low' if normal safe speed
- description: concise summary like 'Moving Honda Activa scooter cruising at 45 km/h' or 'Sedan car overtaking at 68 km/h'
- box2d: [ymin, xmin, ymax, xmax] around the vehicle.
Do NOT report potholes in speed mode.`;

    } else {
      modeInstruction = `TARGET MODE: COMPREHENSIVE ROAD SAFETY (BOTH POTHOLES & VEHICLE SPEEDS).
Carefully inspect both:
1. ROAD HAZARDS: Each individual pothole, puddle crater, road cavity, asphalt fractures/cracks, broken road signs.
2. MOVING VEHICLES: Cars, scooters, motorcycles, autos traveling on the roadway with estimated speed in km/h.
Provide high precision bounding boxes and descriptive details for both.`;
    }

    let feedbackRuleVersion = 'standard-baseline';
    let feedbackDirectives = '';

    if (useFeedbackRules) {
      try {
        const [rules]: any = await pool.execute(
          "SELECT * FROM verified_feedback_rules WHERE verification_status = 'approved' ORDER BY created_at DESC"
        );
        if (rules && rules.length > 0) {
          feedbackRuleVersion = rules[0].rule_set_version || 'v2.0-verified';
          const ruleStrings = rules.map(
            (r: any, idx: number) =>
              `- RULE #${idx + 1} [Target: ${r.target_hazard_type}, False-Positive Cause: ${r.true_negative_class}]: ${r.canonical_constraint}`
          );
          feedbackDirectives = `\n\nVERIFIED FEEDBACK GATING CONSTRAINTS (Rule Set Version: ${feedbackRuleVersion}):\n${ruleStrings.join('\n')}\nCRITICAL FALSE-POSITIVE REDUCTION: Strictly adhere to these verified rules to prevent false-positive alarms while maintaining true road damage recall.`;
        }
      } catch (err) {
        console.warn('[Gemini] Could not load verified feedback rules from DB:', err);
      }
    }

    const activeDirectives = feedbackDirectives || (learnedDirectives ? `\n${learnedDirectives}` : '');

    const prompt = `You are a high-precision real-time road perception AI mounted on a vehicle camera.
${modeInstruction}

SYSTEMATIC MULTI-ZONE ROAD SURFACE INSPECTION PROTOCOL:
Examine the complete road surface systematically across all visual zones:
1. FOREGROUND ROAD ZONE (y: 600 to 1000): Closest roadway surface directly in front of vehicle. Inspect for deep cavity craters, asphalt depressions, water-filled potholes, and jagged broken asphalt rims.
2. MIDGROUND DRIVING LANES (y: 350 to 600): Wheel tracks and center lane. Inspect every separate localized pothole, asphalt depression, transverse crack, or alligator crack patch.
3. DISTANT ROAD ZONE (y: 200 to 350): Far lane surface before the horizon.
4. ROAD SHOULDERS / EDGES: Longitudinal edge cracks and crumbling asphalt.

CRITICAL DISTRACTOR EXCLUSIONS:
- VEHICLES (Cars, Vans, Buses, Trucks, Motorcycles, Scooters, Autos): NEVER classify vehicle bodies, wheels, bumpers, windows, or roofs as road damage!
- WATER REFLECTIONS / FLAT PUDDLES: Flat surface water on intact asphalt is NOT a pothole. Only classify water as a pothole if it sits inside a structural depression or crater with fractured asphalt rims.
- SHADOWS, MANHOLES & ROAD MARKINGS: Do not classify tree shadows, metallic sewer lids, or zebra crossings as potholes.

EXHAUSTIVE INDIVIDUAL DETECTIONS:
- Count and locate EVERY distinct, separate pothole. If 3, 5, or 10 potholes exist across the lanes, output separate entries for EACH pothole with its own bounding box [ymin, xmin, ymax, xmax] 0-1000.
- For vehicles / scooters in speed mode: identify vehicleType ('car', 'scooter', 'motorcycle', 'auto', 'truck', 'bus'), estimate speed in km/h, and determine if exceeding road speed limits.
- Return structured JSON. If the roadway has no hazards or no moving vehicles as requested, return detected: false and objects: [].${activeDirectives}`;

    let response: any = null;
    let geminiModelUsed = 'gemini-3.5-flash';
    const candidateModels = [
      'gemini-3.5-flash-lite',
      'gemini-3.5-flash',
      'gemini-flash-latest',
      'gemini-3.6-flash',
    ];

    for (let i = 0; i < candidateModels.length; i++) {
      const activeModelName = candidateModels[i];
      try {
        response = await ai.models.generateContent({
          model: activeModelName,
          contents: [
            {
              inlineData: {
                mimeType: mimeType || 'image/jpeg',
                data: cleanBase64,
              }
            },
            {
              text: prompt
            }
          ],
          config: {
            temperature: 0,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                detected: {
                  type: Type.BOOLEAN,
                  description: 'True if at least one requested object (pothole, crack, broken sign, or moving vehicle speed) is clearly present.'
                },
                objects: {
                  type: Type.ARRAY,
                  description: 'List of detected road problems or vehicles with speed estimation',
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      type: {
                        type: Type.STRING,
                        description: "Object type: 'pothole', 'road_crack', 'broken_sign', or 'vehicle_speed'"
                      },
                      confidence: {
                        type: Type.NUMBER,
                        description: 'Detection confidence between 0.0 and 1.0'
                      },
                      severity: {
                        type: Type.STRING,
                        description: "Severity level: 'low', 'medium', or 'high'"
                      },
                      description: {
                        type: Type.STRING,
                        description: 'Concise description of the hazard or moving vehicle with speed'
                      },
                      vehicleType: {
                        type: Type.STRING,
                        description: "Vehicle class if type is vehicle_speed: 'car', 'scooter', 'motorcycle', 'auto', 'truck', 'bus'"
                      },
                      estimatedSpeedKmh: {
                        type: Type.NUMBER,
                        description: 'Estimated speed in km/h'
                      },
                      speedLimitKmh: {
                        type: Type.NUMBER,
                        description: 'Local speed limit in km/h'
                      },
                      isOverSpeed: {
                        type: Type.BOOLEAN,
                        description: 'True if vehicle exceeds speed limit'
                      },
                      box2d: {
                        type: Type.ARRAY,
                        description: 'Normalized bounding box [ymin, xmin, ymax, xmax] coordinates from 0 to 1000',
                        items: {
                          type: Type.NUMBER
                        }
                      },
                      damageClass: {
                        type: Type.STRING,
                        description: "Standard road damage code: 'D40' for pothole, 'D20' for alligator crack, 'D10' for transverse crack, 'D00' for longitudinal crack"
                      },
                      visualEvidence: {
                        type: Type.STRING,
                        description: 'Observed structural physical characteristics confirming genuine road hazard (e.g. cavity depth, fractured perimeter, jagged edges)'
                      }
                    },
                    required: [
                      'type',
                      'confidence',
                      'severity',
                      'description'
                    ]
                  }
                }
              },
              required: ['detected', 'objects']
            }
          }
        });
        geminiModelUsed = activeModelName;
        break;
      } catch (geminiErr: any) {
        console.warn(`[Gemini] ${activeModelName} request error:`, geminiErr?.message || geminiErr);
        if (i === candidateModels.length - 1) {
          throw geminiErr;
        }
      }
    }

    const latencyMs = Date.now() - startTime;
    const textOutput = response.text?.trim() || '{}';

    let parsed: any;

    try {
      parsed = JSON.parse(textOutput);
    } catch (parseErr) {
      console.error(
        'Failed to parse Gemini JSON output:',
        textOutput
      );

      return res.status(500).json({
        error: 'Invalid AI response format',
        detected: false,
        objects: [],
        raw: textOutput
      });
    }

    // Ensure valid schema structure
    const allowedTypes = [
      'pothole',
      'road_crack',
      'broken_sign',
      'vehicle_speed'
    ];

    const result = {
      detected: Boolean(
        parsed.detected &&
        Array.isArray(parsed.objects) &&
        parsed.objects.length > 0
      ),

      objects: Array.isArray(parsed.objects)
        ? parsed.objects.map((obj: any) => {
            const rawDesc = obj.description || 'Road observation recorded';
            const evidence = obj.visualEvidence ? ` [Evidence: ${obj.visualEvidence}]` : '';
            return {
              type: allowedTypes.includes(obj.type)
                ? obj.type
                : 'pothole',

              confidence: Math.min(
                1,
                Math.max(
                  0,
                  typeof obj.confidence === 'number'
                    ? obj.confidence
                    : 0.88
                )
              ),

              severity: ['low', 'medium', 'high'].includes(obj.severity)
                ? obj.severity
                : 'medium',

              description: `${rawDesc}${evidence}`,
              damageClass: obj.damageClass || (obj.type === 'pothole' ? 'D40' : obj.type === 'road_crack' ? 'D20' : undefined),
              visualEvidence: obj.visualEvidence || undefined,

              vehicleType: obj.vehicleType,

              estimatedSpeedKmh:
                typeof obj.estimatedSpeedKmh === 'number'
                  ? Math.round(obj.estimatedSpeedKmh)
                  : undefined,

              speedLimitKmh:
                typeof obj.speedLimitKmh === 'number'
                  ? Math.round(obj.speedLimitKmh)
                  : undefined,

              isOverSpeed: Boolean(obj.isOverSpeed),

              box2d:
                Array.isArray(obj.box2d) && obj.box2d.length === 4
                  ? obj.box2d
                  : undefined
            };
          })
        : [],

      latencyMs,
      modelUsed: useFeedbackRules
        ? `${geminiModelUsed}-feedback (${feedbackRuleVersion})`
        : `${geminiModelUsed}-standard`,
      feedbackRuleVersion,
      liveApi: true,
      usageMetadata: response.usageMetadata || null
    };

    if (geminiResponseCache.size >= GEMINI_CACHE_MAX_ENTRIES) {
      const oldestKey = geminiResponseCache.keys().next().value;
      if (oldestKey) geminiResponseCache.delete(oldestKey);
    }
    geminiResponseCache.set(cacheKey, {
      expiresAt: Date.now() + GEMINI_CACHE_TTL_MS,
      payload: result,
    });

    return res.json(result);

  } catch (err: any) {
    if (isQuotaOrRateLimitError(err)) {
      const retryAfterSeconds = parseRetryDelaySeconds(err);
      geminiCooldownUntil = Date.now() + retryAfterSeconds * 1000;
      console.warn(`[Gemini] Quota/rate limit reached (429). Activating ${retryAfterSeconds}s server cooldown.`);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        error: `Gemini API rate limit reached. Automatically cooling down for ${retryAfterSeconds}s.`,
        rateLimited: true,
        retryAfterSeconds,
        detected: false,
        objects: [],
        modelUsed: 'gemini-rate-limited',
      });
    }

    console.warn('[Gemini] Vision request warning:', err?.message || err);

    return res.status(502).json({
      error: err?.message || 'Error processing road vision with Gemini',
      detected: false,
      objects: []
    });
  }
});

// ============================================================
// DETECTIONS CRUD - MYSQL
// ============================================================

// GET ALL DETECTIONS
app.get('/api/detections', async (_req, res) => {
  try {
    const [rows]: any = await pool.query(
      'SELECT * FROM detections ORDER BY timestamp DESC'
    );

    const records = rows.map((row: any) => ({
      ...row,

      confidence:
        row.confidence === null
          ? null
          : Number(row.confidence),

      latitude:
        row.latitude === null
          ? null
          : Number(row.latitude),

      longitude:
        row.longitude === null
          ? null
          : Number(row.longitude),

      timestamp: row.timestamp
        ? new Date(row.timestamp).toISOString()
        : null,

      box2d:
        typeof row.box2d === 'string'
          ? JSON.parse(row.box2d)
          : row.box2d,

      groundTruthBoxes:
        typeof row.groundTruthBoxes === 'string'
          ? JSON.parse(row.groundTruthBoxes)
          : row.groundTruthBoxes
    }));

    return res.json(records);

  } catch (error) {
    console.error('MySQL fetch error:', error);

    return res.status(500).json({
      error: 'Failed to fetch detections'
    });
  }
});

// SAVE DETECTION
app.post('/api/detections', async (req, res) => {
  try {
    const data = req.body;

    await pool.execute(
      `INSERT INTO detections (
        id,
        type,
        confidence,
        severity,
        description,
        latitude,
        longitude,
        locationName,
        timestamp,
        box2d,
        imageUrl,
        reportId,
        userId,
        damageClass,
        damageName,
        annotatedImageUrl,
        imageSource,
        aiEngine,
        verificationStatus,
        verifiedStatus,
        verifiedAt,
        verifiedBy,
        disputeReason,
        learnedAccuracyScore,
        aiLearningFeedbackSent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.id,
        data.type ?? null,
        data.confidence ?? null,
        data.severity ?? null,
        data.description ?? null,
        data.latitude ?? null,
        data.longitude ?? null,
        data.locationName ?? null,
        data.timestamp ? new Date(data.timestamp) : new Date(),
        data.box2d ? JSON.stringify(data.box2d) : null,
        data.imageUrl ?? null,
        data.reportId ?? null,
        data.userId ?? null,
        data.damageClass ?? null,
        data.damageName ?? null,
        data.annotatedImageUrl ?? null,
        data.imageSource ?? null,
        data.aiEngine ?? null,
        data.verificationStatus ?? null,
        data.verifiedStatus ?? null,
        data.verifiedAt ? new Date(data.verifiedAt) : null,
        data.verifiedBy ?? null,
        data.disputeReason ?? null,
        data.learnedAccuracyScore ?? null,
        data.aiLearningFeedbackSent ?? false
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Detection saved successfully',
      id: data.id
    });

  } catch (error) {
    console.error('MySQL save error:', error);

    return res.status(500).json({
      error: 'Failed to save detection'
    });
  }
});

// UPDATE DETECTION
app.put('/api/detections/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const [existing]: any = await pool.execute(
      'SELECT id FROM detections WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        error: 'Detection not found'
      });
    }

    await pool.execute(
      `UPDATE detections SET
        reportId = ?,
        userId = ?,
        damageClass = ?,
        damageName = ?,
        annotatedImageUrl = ?,
        imageSource = ?,
        aiEngine = ?,
        verificationStatus = ?,
        verifiedStatus = ?,
        verifiedAt = ?,
        verifiedBy = ?,
        disputeReason = ?,
        learnedAccuracyScore = ?,
        aiLearningFeedbackSent = ?
      WHERE id = ?`,
      [
        data.reportId ?? null,
        data.userId ?? null,
        data.damageClass ?? null,
        data.damageName ?? null,
        data.annotatedImageUrl ?? null,
        data.imageSource ?? null,
        data.aiEngine ?? null,
        data.verificationStatus ?? null,
        data.verifiedStatus ?? null,
        data.verifiedAt ? new Date(data.verifiedAt) : null,
        data.verifiedBy ?? null,
        data.disputeReason ?? null,
        data.learnedAccuracyScore ?? null,
        data.aiLearningFeedbackSent ?? false,
        id
      ]
    );

    return res.json({
      success: true,
      message: 'Detection updated successfully',
      id
    });

  } catch (error) {
    console.error('MySQL update error:', error);

    return res.status(500).json({
      error: 'Failed to update detection'
    });
  }
});

// DELETE ONE DETECTION
app.delete('/api/detections/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [result]: any = await pool.execute(
      'DELETE FROM detections WHERE id = ?',
      [id]
    );

    if (result.affectedRows > 0) {
      return res.json({
        success: true,
        id
      });
    }

    return res.status(404).json({
      error: 'Detection not found'
    });

  } catch (error) {
    console.error('MySQL delete error:', error);

    return res.status(500).json({
      error: 'Failed to delete detection'
    });
  }
});

// DELETE ALL DETECTIONS
app.delete('/api/detections', async (_req, res) => {
  try {
    await pool.query('DELETE FROM detections');

    return res.json({
      success: true,
      message: 'All detections cleared'
    });

  } catch (error) {
    console.error('MySQL clear error:', error);

    return res.status(500).json({
      error: 'Failed to clear detections'
    });
  }
});

// ============================================================
// AI FEEDBACK - MYSQL
// ============================================================

// SAVE AI FEEDBACK
app.post('/api/ai/feedback', async (req, res) => {
  try {
    const {
      detectionId,
      action,
      hazardType,
      notes,
      reason
    } = req.body;

    const timestamp = new Date();

    const simulatedGradientAdjustment =
      action === 'confirm'
        ? '+0.04_positive_reinforce'
        : '-0.08_suppression_penalty';

    await pool.execute(
      `INSERT INTO ai_feedback (
        detectionId,
        action,
        hazardType,
        notes,
        feedback_timestamp,
        simulatedGradientAdjustment
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        detectionId,
        action,
        hazardType,
        notes || reason || '',
        timestamp,
        simulatedGradientAdjustment
      ]
    );

    const [countRows]: any = await pool.query(
      'SELECT COUNT(*) AS total FROM ai_feedback'
    );

    return res.json({
      success: true,
      message: 'AI feedback saved successfully in MySQL.',
      totalFeedbackEntries: Number(countRows[0].total),
      timestamp
    });

  } catch (error) {
    console.error('MySQL AI feedback save error:', error);

    return res.status(500).json({
      error: 'Failed to save AI feedback'
    });
  }
});

// GET AI FEEDBACK
app.get('/api/ai/feedback', async (_req, res) => {
  try {
    const [rows]: any = await pool.query(
      `SELECT
        id,
        detectionId,
        action,
        hazardType,
        notes,
        feedback_timestamp AS timestamp,
        simulatedGradientAdjustment
      FROM ai_feedback
      ORDER BY feedback_timestamp DESC, id DESC`
    );

    return res.json(rows);

  } catch (error) {
    console.error('MySQL AI feedback fetch error:', error);

    return res.status(500).json({
      error: 'Failed to fetch AI feedback'
    });
  }
});

// ============================================================
// MAPS API KEY CONFIG
// ============================================================

app.get('/api/config/maps', (_req, res) => {
  const mapsKey =
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    '';

  return res.json({
    apiKey: mapsKey
  });
});

// ============================================================
// AGENT LEARNINGS - MYSQL API
// IMPORTANT: THESE ROUTES MUST BE BEFORE THE API 404 HANDLER
// ============================================================

// GET ALL LEARNED CORRECTIONS
app.get('/api/agent-learnings', async (_req, res) => {
  try {
    const [rows]: any = await pool.execute(
      `SELECT
        id,
        DATE_FORMAT(timestamp, '%Y-%m-%dT%H:%i:%s.000Z') AS timestamp,
        originalType,
        actualCategory,
        userNotes,
        confidencePenalty
       FROM agent_learnings
       ORDER BY timestamp DESC`
    );

    return res.json(rows);

  } catch (error) {
    console.error('Error fetching agent learnings:', error);

    return res.status(500).json({
      error: 'Failed to fetch agent learnings'
    });
  }
});

// SAVE A NEW LEARNED CORRECTION
app.post('/api/agent-learnings', async (req, res) => {
  try {
    const {
      id,
      timestamp,
      originalType,
      actualCategory,
      userNotes,
      confidencePenalty
    } = req.body;

    if (!id || !originalType || !actualCategory) {
      return res.status(400).json({
        error: 'Missing required learning fields'
      });
    }

    const learningTimestamp = timestamp
      ? new Date(timestamp)
      : new Date();

    if (Number.isNaN(learningTimestamp.getTime())) {
      return res.status(400).json({
        error: 'Invalid learning timestamp'
      });
    }

    await pool.execute(
      `INSERT INTO agent_learnings
       (id, timestamp, originalType, actualCategory, userNotes, confidencePenalty)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        learningTimestamp,
        originalType,
        actualCategory,
        userNotes || '',
        confidencePenalty ?? 0.15
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Agent learning saved to MySQL',
      id
    });

  } catch (error: any) {
    console.error('Error saving agent learning:', error);

    return res.status(500).json({
      error: 'Failed to save agent learning'
    });
  }
});

// DELETE ONE LEARNED CORRECTION
app.delete('/api/agent-learnings/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [result]: any = await pool.execute(
      'DELETE FROM agent_learnings WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        error: 'Agent learning not found'
      });
    }

    return res.json({
      success: true,
      message: 'Agent learning deleted',
      id
    });

  } catch (error) {
    console.error('Error deleting agent learning:', error);

    return res.status(500).json({
      error: 'Failed to delete agent learning'
    });
  }
});

// RESET ALL LEARNED CORRECTIONS
app.delete('/api/agent-learnings', async (_req, res) => {
  try {
    await pool.execute('DELETE FROM agent_learnings');

    return res.json({
      success: true,
      message: 'All agent learnings reset'
    });

  } catch (error) {
    console.error('Error resetting agent learnings:', error);

    return res.status(500).json({
      error: 'Failed to reset agent learnings'
    });
  }
});

// ============================================================
// VERIFIED FEEDBACK RULES & AUDIT TRAIL API
// ============================================================

// GET ALL VERIFIED RULES
app.get('/api/feedback/rules', async (_req, res) => {
  try {
    const [rows]: any = await pool.execute(
      `SELECT * FROM verified_feedback_rules ORDER BY created_at DESC`
    );
    return res.json(rows);
  } catch (err: any) {
    console.error('Error fetching verified rules:', err);
    return res.status(500).json({ error: 'Failed to fetch verified feedback rules' });
  }
});

// CREATE / COMPILE A NEW VERIFIED RULE
app.post('/api/feedback/rules', async (req, res) => {
  try {
    const {
      id = `rule-${Date.now()}`,
      rule_hash,
      rule_set_version = 'v2.0-verified',
      source_correction_id = '',
      target_hazard_type,
      true_negative_class,
      canonical_constraint,
      confidence_penalty = 0.150,
      suppression_threshold = 0.550,
      verified_by = 'Faculty Reviewer Admin',
    } = req.body;

    if (!target_hazard_type || !true_negative_class || !canonical_constraint) {
      return res.status(400).json({ error: 'Missing required rule fields' });
    }

    const computedHash = rule_hash || crypto.createHash('md5').update(canonical_constraint).digest('hex').slice(0, 16);
    const now = new Date();

    await pool.execute(
      `INSERT INTO verified_feedback_rules (
        id, rule_hash, rule_set_version, source_correction_id,
        target_hazard_type, true_negative_class, canonical_constraint,
        confidence_penalty, suppression_threshold, verification_status,
        verified_by, verified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?)`,
      [
        id,
        computedHash,
        rule_set_version,
        source_correction_id,
        target_hazard_type,
        true_negative_class,
        canonical_constraint,
        confidence_penalty,
        suppression_threshold,
        verified_by,
        now,
      ]
    );

    return res.status(201).json({
      success: true,
      rule: {
        id,
        rule_hash: computedHash,
        rule_set_version,
        target_hazard_type,
        true_negative_class,
        canonical_constraint,
        confidence_penalty,
        suppression_threshold,
        verification_status: 'approved',
        verified_by,
        verified_at: now,
      },
    });
  } catch (err: any) {
    console.error('Error creating verified feedback rule:', err);
    return res.status(500).json({ error: 'Failed to create verified feedback rule' });
  }
});

// VERIFY (APPROVE OR REJECT) A DETECTION / DRIVER CORRECTION
app.post('/api/feedback/verify/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      status, // 'approved' | 'rejected'
      verifiedBy = 'Faculty Reviewer Admin',
      trueNegativeClass = 'shadow',
      canonicalConstraint = 'Refined driver correction approved by reviewer',
      confidencePenalty = 0.150,
    } = req.body;

    if (!status || !['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
    }

    const now = new Date();

    // 1. Update detection verification state in database
    await pool.execute(
      `UPDATE detections SET
        verificationStatus = ?,
        verifiedStatus = ?,
        verifiedAt = ?,
        verifiedBy = ?
       WHERE id = ?`,
      [status, status, now, verifiedBy, id]
    );

    // 2. If approved, compile into a reusable VerifiedFeedbackRule
    let generatedRule = null;
    if (status === 'approved' && canonicalConstraint) {
      const ruleId = `rule-v2-${Date.now().toString(36)}`;
      const ruleHash = crypto.createHash('md5').update(canonicalConstraint).digest('hex').slice(0, 16);
      
      await pool.execute(
        `INSERT INTO verified_feedback_rules (
          id, rule_hash, rule_set_version, source_correction_id,
          target_hazard_type, true_negative_class, canonical_constraint,
          confidence_penalty, suppression_threshold, verification_status,
          verified_by, verified_at
        ) VALUES (?, ?, 'v2.0-verified', ?, 'pothole', ?, ?, ?, 0.550, 'approved', ?, ?)`,
        [
          ruleId,
          ruleHash,
          id,
          trueNegativeClass,
          canonicalConstraint,
          confidencePenalty,
          verifiedBy,
          now,
        ]
      );
      generatedRule = { ruleId, ruleHash, trueNegativeClass, canonicalConstraint };
    }

    return res.json({
      success: true,
      detectionId: id,
      verificationStatus: status,
      verifiedBy,
      verifiedAt: now,
      generatedRule,
    });
  } catch (err: any) {
    console.error('Error verifying feedback:', err);
    return res.status(500).json({ error: 'Failed to process feedback verification' });
  }
});

// DELETE / REVOKE ONE VERIFIED RULE
app.delete('/api/feedback/rules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM verified_feedback_rules WHERE id = ?', [id]);
    return res.json({ success: true, message: `Rule ${id} revoked successfully` });
  } catch (err: any) {
    console.error('Error deleting verified rule:', err);
    return res.status(500).json({ error: 'Failed to delete verified rule' });
  }
});

// ============================================================
// FEEDBACK RULE EVALUATIONS API (PERSISTED IN MYSQL)
// ============================================================

// Initialize table if needed
async function ensureFeedbackRuleEvaluationTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS feedback_rule_evaluations (
        id VARCHAR(64) PRIMARY KEY,
        image_id VARCHAR(64) NOT NULL,
        image_url LONGTEXT,
        location_name VARCHAR(255),
        capture_timestamp VARCHAR(64),
        evaluation_timestamp VARCHAR(64) NOT NULL,
        rule_set_version VARCHAR(64) NOT NULL,
        total_rules INT NOT NULL,
        satisfied_count INT NOT NULL,
        not_satisfied_count INT NOT NULL,
        inconclusive_count INT NOT NULL,
        total_positive_penalty DECIMAL(6, 3) NOT NULL,
        total_negative_penalty DECIMAL(6, 3) NOT NULL,
        overall_score DECIMAL(6, 3) NOT NULL,
        rule_results JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (err) {
    // handled gracefully
  }
}
ensureFeedbackRuleEvaluationTables();

// GET ALL EVALUATIONS
app.get('/api/feedback/evaluations', async (_req, res) => {
  try {
    const [rows]: any = await pool.execute(
      `SELECT * FROM feedback_rule_evaluations ORDER BY evaluation_timestamp DESC`
    );
    const parsed = (rows || []).map((r: any) => ({
      ...r,
      rule_results: typeof r.rule_results === 'string' ? JSON.parse(r.rule_results) : r.rule_results,
    }));
    return res.json(parsed);
  } catch (err: any) {
    console.error('Error fetching rule evaluations:', err);
    return res.status(500).json({ error: 'Failed to fetch rule evaluations' });
  }
});

// GET EVALUATIONS FOR SPECIFIC IMAGE
app.get('/api/feedback/evaluations/:imageId', async (req, res) => {
  try {
    const { imageId } = req.params;
    const [rows]: any = await pool.execute(
      `SELECT * FROM feedback_rule_evaluations WHERE image_id = ? ORDER BY evaluation_timestamp DESC`,
      [imageId]
    );
    const parsed = (rows || []).map((r: any) => ({
      ...r,
      rule_results: typeof r.rule_results === 'string' ? JSON.parse(r.rule_results) : r.rule_results,
    }));
    return res.json(parsed);
  } catch (err: any) {
    console.error('Error fetching evaluations for image:', err);
    return res.status(500).json({ error: 'Failed to fetch evaluations for image' });
  }
});

// SAVE NEW RULE EVALUATION (NEVER OVERWRITES PREVIOUS EVALUATIONS)
app.post('/api/feedback/evaluations', async (req, res) => {
  try {
    const {
      id = `eval-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      imageId,
      imageUrl = '',
      locationName = '',
      captureTimestamp = '',
      evaluationTimestamp = new Date().toISOString(),
      ruleSetVersion = 'v2.0-verified-calibration',
      totalRules = 5,
      satisfiedCount = 0,
      notSatisfiedCount = 0,
      inconclusiveCount = 0,
      totalPositivePenalty = 0,
      totalNegativePenalty = 0,
      overallScore = 0,
      ruleResults = [],
    } = req.body;

    if (!imageId || !Array.isArray(ruleResults)) {
      return res.status(400).json({ error: 'Missing required evaluation fields (imageId and ruleResults array)' });
    }

    const ruleResultsJson = JSON.stringify(ruleResults);

    await pool.execute(
      `INSERT INTO feedback_rule_evaluations (
        id, image_id, image_url, location_name, capture_timestamp,
        evaluation_timestamp, rule_set_version, total_rules, satisfied_count,
        not_satisfied_count, inconclusive_count, total_positive_penalty,
        total_negative_penalty, overall_score, rule_results
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        imageId,
        imageUrl,
        locationName,
        captureTimestamp,
        evaluationTimestamp,
        ruleSetVersion,
        totalRules,
        satisfiedCount,
        notSatisfiedCount,
        inconclusiveCount,
        totalPositivePenalty,
        totalNegativePenalty,
        overallScore,
        ruleResultsJson,
      ]
    );

    return res.status(201).json({
      success: true,
      id,
      evaluation: {
        id,
        imageId,
        evaluationTimestamp,
        overallScore,
        satisfiedCount,
        notSatisfiedCount,
        inconclusiveCount,
      },
    });
  } catch (err: any) {
    console.error('Error saving feedback rule evaluation:', err);
    return res.status(500).json({ error: 'Failed to save feedback rule evaluation: ' + err?.message });
  }
});

// ============================================================
// SYSTEM & DEPLOYMENT HEALTH CHECK
// ============================================================
app.get('/api/health', async (_req, res) => {
  let dbStatus = 'disconnected';
  let dbLatencyMs = 0;
  const start = Date.now();
  try {
    await pool.query('SELECT 1');
    dbStatus = 'connected';
    dbLatencyMs = Date.now() - start;
  } catch (err: any) {
    dbStatus = 'error: ' + (err?.message || 'unknown');
  }

  return res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database: {
      status: dbStatus,
      latencyMs: dbLatencyMs,
    },
    gemini: {
      configured: Boolean(process.env.GEMINI_API_KEY),
      model: 'gemini-3.1-flash-lite',
    },
  });
});

// ============================================================
// YOLOV5 PYTHON SERVICE PROXY
// ============================================================
app.get('/api/yolov5/health', async (req, res) => {
  const yoloServiceUrl = process.env.YOLO_SERVICE_URL || 'http://127.0.0.1:8000';
  try {
    const response = await fetch(`${yoloServiceUrl}/health`, { method: 'GET' });
    if (response.ok) {
      const data = await response.json();
      return res.json(data);
    }
    return res.status(response.status).json({ status: 'offline', error: 'Service returned error' });
  } catch (err: any) {
    return res.status(503).json({
      status: 'offline',
      service: 'YOLOv5 Road Damage Detection Service',
      modelLoaded: false,
      error: `YOLOv5 Python service is offline: ${err?.message}`,
    });
  }
});

app.get('/api/yolov5/model-info', async (req, res) => {
  const yoloServiceUrl = process.env.YOLO_SERVICE_URL || 'http://127.0.0.1:8000';
  try {
    const response = await fetch(`${yoloServiceUrl}/model-info`, { method: 'GET' });
    if (response.ok) {
      const data = await response.json();
      return res.json(data);
    }
    return res.status(response.status).json({ error: 'Failed to retrieve model info' });
  } catch (err: any) {
    return res.status(503).json({ error: `YOLOv5 service offline: ${err?.message}` });
  }
});

app.post('/api/yolov5/detect', async (req, res) => {
  const yoloServiceUrl = process.env.YOLO_SERVICE_URL || 'http://127.0.0.1:8000';
  try {
    const response = await fetch(`${yoloServiceUrl}/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).send(text);
    }

    const data = await response.json();
    return res.json(data);
  } catch (err: any) {
    return res.status(503).json({
      error: `YOLOv5 Python FastAPI service is offline at ${yoloServiceUrl}. Run: python yolo-service/app.py`,
      detected: false,
      objects: [],
      modelUsed: 'yolov5-offline',
    });
  }
});

// ============================================================
// PHASE 2: AUTOMATED LOCATION SCANNER API & IMAGERY SERVING
// ============================================================

// Initialize automated_location_scans table in MySQL
async function ensureAutomatedLocationScanTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS automated_location_scans (
        id VARCHAR(100) PRIMARY KEY,
        search_location VARCHAR(255) NOT NULL,
        latitude DECIMAL(10, 7) NOT NULL,
        longitude DECIMAL(10, 7) NOT NULL,
        scan_timestamp DATETIME NOT NULL,
        imagery_provider VARCHAR(50) NOT NULL,
        imagery_capture_date VARCHAR(64),
        imagery_age_category VARCHAR(50) NOT NULL DEFAULT 'standard',
        coverage_percentage INT NOT NULL DEFAULT 0,
        images_analyzed INT NOT NULL DEFAULT 0,
        potholes_count INT NOT NULL DEFAULT 0,
        cracks_count INT NOT NULL DEFAULT 0,
        total_hazards INT NOT NULL DEFAULT 0,
        high_severity_count INT NOT NULL DEFAULT 0,
        medium_severity_count INT NOT NULL DEFAULT 0,
        low_severity_count INT NOT NULL DEFAULT 0,
        average_confidence DECIMAL(5, 4),
        detection_status VARCHAR(50) NOT NULL,
        status_message TEXT,
        processing_duration_ms INT NOT NULL DEFAULT 0,
        images_json JSON,
        detections_json JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (err) {
    // MySQL table check completed
  }
}
ensureAutomatedLocationScanTables();

// Serve authentic, verified Karnataka road damage photographs
app.get('/api/imagery/karnataka/:filename', (req, res) => {
  const { filename } = req.params;
  const safeName = path.basename(filename);
  let filePath = path.join(__dirname, 'road_damage_yolo', 'images', 'val', safeName);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(__dirname, 'road_damage_yolo', 'images', 'train', safeName);
  }
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: `Image ${safeName} not found` });
  }
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  return res.sendFile(filePath);
});

// Proxy live road imagery from authorized providers (KartaView CDN)
// Serves image with permissive CORS headers to prevent HTML5 canvas tainting
app.get('/api/scanner/proxy-image', async (req, res) => {
  try {
    const rawUrl = String(req.query.url || '').trim();
    if (!rawUrl) {
      return res.status(400).json({ error: 'Missing url query parameter' });
    }

    // Security check: Only allow authorized CDN domains
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    const allowedHosts = [
      'cdn.kartaview.org',
      'kartaview.org',
      'storage6.openstreetcam.org',
      'storage.openstreetcam.org',
      'images.mapillary.com',
    ];

    const hostMatches = allowedHosts.some(
      (h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`)
    );

    if (!hostMatches) {
      return res.status(403).json({ error: 'Unauthorized image host origin' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const upstream = await fetch(rawUrl, {
      headers: {
        'User-Agent': 'RoadGuard-Image-Proxy/2.0',
        Accept: 'image/jpeg,image/png,image/*,*/*',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: `Upstream image fetch failed with HTTP ${upstream.status}`,
      });
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    const buffer = await upstream.arrayBuffer();

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', buffer.byteLength.toString());
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    return res.send(Buffer.from(buffer));
  } catch (err: any) {
    console.warn('[ProxyImage] Exception downloading image:', err?.message || err);
    return res.status(502).json({ error: 'Failed to proxy upstream image: ' + (err?.message || err) });
  }
});

// Google Maps-Style Places Autocomplete & Geocoding Endpoint
// Supports street names, road names, localities, landmarks, PIN codes, and GPS coordinates
app.get('/api/places/autocomplete', async (req, res) => {
  try {
    const input = String(req.query.input || '').trim();
    if (!input || input.length < 2) {
      return res.json([]);
    }

    // 1. Check for manual GPS coordinates like "13.0401259, 77.5278666" or "13.0401,77.5278"
    const coordMatch = input.match(
      /^[-+]?([1-8]?\d(\.\d+)?|90(\.0+)?),\s*[-+]?(180(\.0+)?|((1[0-7]\d)|([1-9]?\d))(\.\d+)?)$/
    );
    if (coordMatch) {
      const parts = input.split(',').map((s) => parseFloat(s.trim()));
      const lat = parts[0];
      const lng = parts[1];
      return res.json([
        {
          placeId: `coord_${lat.toFixed(6)}_${lng.toFixed(6)}`,
          name: `GPS Coordinates (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
          formattedAddress: `Manual Coordinates: Latitude ${lat.toFixed(6)}, Longitude ${lng.toFixed(6)}`,
          latitude: lat,
          longitude: lng,
          isCoordinate: true,
          type: 'coordinate',
        },
      ]);
    }

    // 2. Query Nominatim with viewbox bias toward Karnataka/India, but allowing any location worldwide
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      input
    )}&limit=6&addressdetails=1&viewbox=77.3,13.2,77.8,12.7&bounded=0`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'RoadGuard-Location-Scanner/2.0 (Autonomous Inspection AI)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(3500),
    });

    if (response.ok) {
      const data = await response.json();
      const suggestions = (data || []).map((item: any) => {
        const addr = item.address || {};
        const title =
          item.name ||
          addr.road ||
          addr.suburb ||
          addr.neighbourhood ||
          addr.city ||
          addr.town ||
          addr.postcode ||
          item.display_name.split(',')[0].trim();
        return {
          placeId: String(item.place_id || item.osm_id),
          name: title,
          formattedAddress: item.display_name,
          latitude: parseFloat(item.lat),
          longitude: parseFloat(item.lon),
          type: item.type || item.class || 'locality',
        };
      });
      return res.json(suggestions);
    }

    return res.json([]);
  } catch (err: any) {
    console.warn('[Places API] Autocomplete error:', err?.message || err);
    return res.json([]);
  }
});

// Reverse geocode GPS coordinates to actual road / locality name in Bengaluru
app.get('/api/places/reverse', async (req, res) => {
  try {
    const lat = parseFloat(String(req.query.lat));
    const lng = parseFloat(String(req.query.lng));

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: 'Invalid latitude or longitude' });
    }

    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'RoadGuard-Location-Scanner/2.0 (Autonomous Inspection AI)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(3500),
    });

    if (response.ok) {
      const item = await response.json();
      const addr = item.address || {};
      const road = addr.road || addr.pedestrian || addr.footway || addr.path || addr.street;
      const locality =
        addr.suburb ||
        addr.neighbourhood ||
        addr.residential ||
        addr.city_district ||
        addr.postcode ||
        'Bengaluru';
      const formattedName = road ? `${road}, ${locality}` : item.display_name.split(',').slice(0, 2).join(', ');

      return res.json({
        road: road || 'Bengaluru Road',
        locality,
        formattedAddress: item.display_name,
        displayName: formattedName,
        latitude: lat,
        longitude: lng,
      });
    }

    return res.json({
      road: 'Bengaluru Road Point',
      locality: 'Bengaluru',
      formattedAddress: `Coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}`,
      displayName: `Bengaluru Point (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
      latitude: lat,
      longitude: lng,
    });
  } catch (err: any) {
    return res.json({
      road: 'Bengaluru Road Point',
      locality: 'Bengaluru',
      formattedAddress: `Coordinates: ${req.query.lat}, ${req.query.lng}`,
      displayName: `Bengaluru Point (${req.query.lat}, ${req.query.lng})`,
      latitude: parseFloat(String(req.query.lat)) || 0,
      longitude: parseFloat(String(req.query.lng)) || 0,
    });
  }
});

// ============================================================
// BENGALURU ROAD NETWORK COVERAGE INVENTORY
// ============================================================

const BENGALURU_ROADS_FILE = path.join(__dirname, 'data', 'bengaluru-roads.json');

function getBengaluruRoads(): any[] {
  try {
    if (fs.existsSync(BENGALURU_ROADS_FILE)) {
      const raw = fs.readFileSync(BENGALURU_ROADS_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('[BengaluruRoads] Error reading roads JSON:', err);
  }
  return [];
}

function saveBengaluruRoads(roads: any[]): void {
  try {
    const dir = path.dirname(BENGALURU_ROADS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(BENGALURU_ROADS_FILE, JSON.stringify(roads, null, 2), 'utf8');
  } catch (err) {
    console.warn('[BengaluruRoads] Error saving roads JSON:', err);
  }
}

// Get Bengaluru roads list with optional search, category, and status filters
app.get('/api/bengaluru/roads', (req, res) => {
  try {
    const search = String(req.query.search || '').trim().toLowerCase();
    const status = String(req.query.status || '').trim();
    const category = String(req.query.category || '').trim();

    let roads = getBengaluruRoads();

    if (search) {
      roads = roads.filter(
        (r) =>
          r.name.toLowerCase().includes(search) ||
          r.locality.toLowerCase().includes(search) ||
          r.id.toLowerCase().includes(search)
      );
    }

    if (status && status !== 'all') {
      roads = roads.filter((r) => r.status === status);
    }

    if (category && category !== 'all') {
      roads = roads.filter((r) => r.category === category);
    }

    return res.json(roads);
  } catch (err: any) {
    console.error('Error fetching Bengaluru roads:', err);
    return res.status(500).json({ error: 'Failed to fetch Bengaluru roads' });
  }
});

// Get individual Bengaluru road detail
app.get('/api/bengaluru/roads/:id', (req, res) => {
  try {
    const { id } = req.params;
    const roads = getBengaluruRoads();
    const road = roads.find((r) => r.id === id);
    if (!road) {
      return res.status(404).json({ error: `Road ${id} not found` });
    }
    return res.json(road);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch road detail' });
  }
});

// Update road inspection status
app.post('/api/bengaluru/roads/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const { status, inspectedViewpointsCount, confirmedPotholesCount } = req.body;
    const roads = getBengaluruRoads();
    const idx = roads.findIndex((r) => r.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: `Road ${id} not found` });
    }

    if (status) roads[idx].status = status;
    if (typeof inspectedViewpointsCount === 'number') {
      roads[idx].inspectedViewpointsCount = (roads[idx].inspectedViewpointsCount || 0) + inspectedViewpointsCount;
    }
    if (typeof confirmedPotholesCount === 'number') {
      roads[idx].confirmedPotholesCount = (roads[idx].confirmedPotholesCount || 0) + confirmedPotholesCount;
    }
    roads[idx].lastScannedAt = new Date().toISOString();

    saveBengaluruRoads(roads);
    return res.json(roads[idx]);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update road status' });
  }
});

// Discover and intelligently explore road viewpoints
app.post('/api/scanner/explore', async (req, res) => {
  try {
    const {
      latitude,
      longitude,
      locationName = 'Bengaluru, Karnataka',
      radiusMeters = 500,
      maxViewpoints = 8,
      roadId,
    } = req.body;

    if (latitude == null || longitude == null) {
      return res.status(400).json({ error: 'Missing latitude or longitude in request body' });
    }

    const lat = Number(latitude);
    const lng = Number(longitude);

    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: 'Invalid latitude or longitude coordinates' });
    }

    const roads = getBengaluruRoads();

    const exploration = await roadImageryDiscoveryService.exploreRoadViewpoints(
      lat,
      lng,
      locationName,
      Number(radiusMeters) || 500,
      Number(maxViewpoints) || 4,
      roads
    );

    // Associate with nearest Bengaluru road in inventory if not already set
    let closestRoad: any = null;
    let minRoadDist = Infinity;

    if (roadId) {
      closestRoad = roads.find((r) => r.id === roadId) || null;
      if (closestRoad) {
        minRoadDist = calculateHaversineMeters(lat, lng, closestRoad.centerLat, closestRoad.centerLng);
      }
    }

    if (!closestRoad) {
      for (const r of roads) {
        const d = calculateHaversineMeters(lat, lng, r.centerLat, r.centerLng);
        if (d < minRoadDist) {
          minRoadDist = d;
          closestRoad = r;
        }
      }
    }

    if (closestRoad && minRoadDist <= (Number(radiusMeters) || 500) + 300) {
      exploration.associatedRoad = {
        id: closestRoad.id,
        name: closestRoad.name,
        locality: closestRoad.locality,
        category: closestRoad.category,
        status: closestRoad.status,
        distanceMeters: minRoadDist,
      };
    }

    return res.json(exploration);
  } catch (err: any) {
    console.error('Error during road viewpoint exploration:', err);
    return res.status(500).json({ error: 'Failed to explore road viewpoints: ' + (err?.message || err) });
  }
});

// Save completed automated location scan report and individual hazards to MySQL
app.post('/api/scanner/save', async (req, res) => {
  try {
    const {
      scanId,
      searchLocation,
      latitude,
      longitude,
      imageryProvider,
      imageryCaptureDate,
      imageryAgeCategory = 'standard',
      coveragePercentage = 100,
      imagesAnalyzed = 0,
      potholesCount = 0,
      cracksCount = 0,
      totalHazards = 0,
      highSeverityCount = 0,
      mediumSeverityCount = 0,
      lowSeverityCount = 0,
      averageConfidence = 0.0,
      detectionStatus = 'completed_hazards_detected',
      statusMessage = 'Automated road scan completed successfully',
      processingDurationMs = 0,
      images = [],
      detections = [],
    } = req.body;

    const id = scanId || `scan_${Date.now()}`;
    const scanTimestamp = new Date();

    // 1. Insert or update scan summary record in automated_location_scans table
    await pool.execute(
      `INSERT INTO automated_location_scans (
        id, search_location, latitude, longitude, scan_timestamp,
        imagery_provider, imagery_capture_date, imagery_age_category,
        coverage_percentage, images_analyzed, potholes_count, cracks_count,
        total_hazards, high_severity_count, medium_severity_count, low_severity_count,
        average_confidence, detection_status, status_message, processing_duration_ms,
        images_json, detections_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        images_analyzed = VALUES(images_analyzed),
        potholes_count = VALUES(potholes_count),
        cracks_count = VALUES(cracks_count),
        total_hazards = VALUES(total_hazards),
        high_severity_count = VALUES(high_severity_count),
        medium_severity_count = VALUES(medium_severity_count),
        low_severity_count = VALUES(low_severity_count),
        average_confidence = VALUES(average_confidence),
        detection_status = VALUES(detection_status),
        status_message = VALUES(status_message),
        images_json = VALUES(images_json),
        detections_json = VALUES(detections_json)`,
      [
        id,
        searchLocation || 'Karnataka, India',
        latitude || 13.0401,
        longitude || 77.5278,
        scanTimestamp,
        imageryProvider || 'KartaView / Open Road Damage Registry',
        imageryCaptureDate || null,
        imageryAgeCategory,
        coveragePercentage,
        imagesAnalyzed,
        potholesCount,
        cracksCount,
        totalHazards,
        highSeverityCount,
        mediumSeverityCount,
        lowSeverityCount,
        averageConfidence,
        detectionStatus,
        statusMessage,
        processingDurationMs,
        JSON.stringify(images),
        JSON.stringify(detections),
      ]
    );

    // 2. Insert individual hazard detections into detections table
    // so they automatically populate Hazard Map markers and Live History!
    for (let i = 0; i < detections.length; i++) {
      const d = detections[i];
      const detId = d.id || `det_${id}_${i + 1}`;
      const detLat = d.latitude != null ? d.latitude : latitude;
      const detLng = d.longitude != null ? d.longitude : longitude;
      const detLoc = d.locationName || `${searchLocation} (${d.sectionName || `Viewpoint ${i + 1}`})`;

      try {
        await pool.execute(
          `INSERT INTO detections (
            id, type, confidence, severity, description,
            latitude, longitude, locationName, timestamp,
            box2d, imageUrl, annotatedImageUrl, reportId,
            damageClass, damageName, imageSource, aiEngine,
            verificationStatus
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            confidence = VALUES(confidence),
            severity = VALUES(severity),
            verificationStatus = VALUES(verificationStatus)`,
          [
            detId,
            d.type || 'pothole',
            d.confidence || 0.90,
            d.severity || 'high',
            d.description || 'Automated road hazard detection',
            detLat,
            detLng,
            detLoc,
            scanTimestamp,
            d.box2d ? JSON.stringify(d.box2d) : null,
            d.imageUrl || null,
            d.annotatedImageUrl || null,
            id, // links hazard to scanId
            d.damageClass || 'D40',
            d.damageName || 'D40 Pothole',
            'automated_location_scan',
            d.aiEngine || 'roadguard-fusion',
            'verified',
          ]
        );
      } catch (insertErr) {
        console.warn(`[Scanner] Warning inserting hazard record ${detId}:`, insertErr);
      }
    }

    // 3. Update associated roads in Bengaluru Road Coverage Inventory
    try {
      const roads = getBengaluruRoads();
      let roadsModified = false;

      // 3a. If roadSections array provided, update every inspected section or auto-register new section
      if (Array.isArray(req.body.roadSections) && req.body.roadSections.length > 0) {
        for (const sec of req.body.roadSections) {
          let matched = roads.find((r) => r.id === sec.sectionId);
          if (!matched) {
            // Auto-register dynamically discovered road section into inventory
            const secLat = sec.centerCoordinates?.latitude || latitude;
            const secLng = sec.centerCoordinates?.longitude || longitude;
            matched = {
              id: sec.sectionId,
              name: sec.roadName,
              locality: sec.locality || (searchLocation ? searchLocation.split(',')[0].trim() : 'Bengaluru'),
              category: sec.category || 'residential_street',
              centerLat: secLat,
              centerLng: secLng,
              coordinatesPath: [
                { lat: secLat - 0.001, lng: secLng - 0.001 },
                { lat: secLat, lng: secLng },
                { lat: secLat + 0.001, lng: secLng + 0.001 },
              ],
              lengthMeters: 600,
              status: 'not_inspected',
              availableViewpointsCount: sec.availableImagesCount || 0,
              inspectedViewpointsCount: 0,
              confirmedPotholesCount: 0,
              imageryProvider: 'KartaView',
              lastScannedAt: null,
            };
            roads.push(matched);
          }

          roadsModified = true;
          if (sec.confirmedPotholesCount > 0) {
            matched.status = 'potholes_detected';
          } else if (sec.inspectedImagesCount > 0) {
            matched.status = 'inspected_clean';
          } else if (sec.availableImagesCount > 0) {
            matched.status = 'imagery_available';
          } else {
            matched.status = 'imagery_unavailable';
          }
          matched.availableViewpointsCount = Math.max(matched.availableViewpointsCount || 0, sec.availableImagesCount || 0);
          matched.inspectedViewpointsCount = (matched.inspectedViewpointsCount || 0) + (sec.inspectedImagesCount || 0);
          matched.confirmedPotholesCount = (matched.confirmedPotholesCount || 0) + (sec.confirmedPotholesCount || 0);
          matched.lastScannedAt = new Date().toISOString();
        }
      }

      // 3b. Fallback for single associated road
      let matchedIdx = -1;
      if (req.body.roadId) {
        matchedIdx = roads.findIndex((r) => r.id === req.body.roadId);
      }
      if (matchedIdx === -1 && latitude != null && longitude != null) {
        let minD = Infinity;
        roads.forEach((r, idx) => {
          const d = calculateHaversineMeters(Number(latitude), Number(longitude), r.centerLat, r.centerLng);
          if (d < minD) {
            minD = d;
            matchedIdx = idx;
          }
        });
        if (minD > 1200) matchedIdx = -1;
      }

      if (matchedIdx !== -1) {
        roadsModified = true;
        const road = roads[matchedIdx];
        if (potholesCount > 0) {
          road.status = 'potholes_detected'; // Red: Confirmed potholes detected
        } else if (imagesAnalyzed > 0) {
          road.status = 'inspected_clean'; // Green: Inspected; no confirmed potholes
        } else {
          road.status = 'imagery_unavailable'; // Orange: Authorized imagery unavailable
        }
        road.inspectedViewpointsCount = (road.inspectedViewpointsCount || 0) + imagesAnalyzed;
        road.confirmedPotholesCount = (road.confirmedPotholesCount || 0) + potholesCount;
        road.lastScannedAt = new Date().toISOString();
      }

      if (roadsModified) {
        saveBengaluruRoads(roads);
      }
    } catch (roadErr) {
      console.warn('[Scanner] Road coverage update warning:', roadErr);
    }

    return res.status(201).json({
      success: true,
      scanId: id,
      message: 'Automated location scan and hazard records successfully persisted to MySQL database',
      potholesCount,
      totalHazards,
    });
  } catch (err: any) {
    console.error('Error saving automated location scan to MySQL:', err);
    return res.status(500).json({ error: 'Failed to save automated location scan: ' + (err?.message || err) });
  }
});

// Retrieve previous automated scans history
app.get('/api/scanner/history', async (_req, res) => {
  try {
    const [rows]: any = await pool.query(
      `SELECT * FROM automated_location_scans ORDER BY scan_timestamp DESC LIMIT 50`
    );
    const parsed = (rows || []).map((r: any) => ({
      ...r,
      images: typeof r.images_json === 'string' ? JSON.parse(r.images_json) : r.images_json || [],
      detections: typeof r.detections_json === 'string' ? JSON.parse(r.detections_json) : r.detections_json || [],
    }));
    return res.json(parsed);
  } catch (err: any) {
    console.error('Error fetching scanner history:', err);
    return res.status(500).json({ error: 'Failed to fetch scanner history' });
  }
});

// Retrieve full inspection report for a specific scan ID
app.get('/api/scanner/scan/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows]: any = await pool.execute(
      `SELECT * FROM automated_location_scans WHERE id = ?`,
      [id]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Scan record not found' });
    }
    const r = rows[0];
    return res.json({
      ...r,
      images: typeof r.images_json === 'string' ? JSON.parse(r.images_json) : r.images_json || [],
      detections: typeof r.detections_json === 'string' ? JSON.parse(r.detections_json) : r.detections_json || [],
    });
  } catch (err: any) {
    console.error('Error fetching scan record:', err);
    return res.status(500).json({ error: 'Failed to fetch scan record' });
  }
});

// ============================================================
// API 404 HANDLER
// KEEP THIS AFTER ALL API ROUTES
// ============================================================

app.all('/api/*', (req, res) => {
  return res.status(404).json({
    error: `API endpoint ${req.method} ${req.path} not found`
  });
});

// ============================================================
// VITE MIDDLEWARE OR STATIC PRODUCTION SERVING
// ============================================================

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true
      },
      appType: 'spa'
    });

    app.use(vite.middlewares);

  } else {
    const distPath = path.resolve(__dirname, 'dist');

    app.use(express.static(distPath));

    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `RoadGuard Server listening on http://0.0.0.0:${PORT}`
    );
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
