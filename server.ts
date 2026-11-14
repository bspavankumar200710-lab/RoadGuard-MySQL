

import express from 'express';
import { createServer as createViteServer } from 'vite';
import pool from './db';
import { GoogleGenAI, Type } from '@google/genai';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';

dotenv.config({ override: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Allow up to 25MB for captured high-resolution camera frames
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(cookieParser());

// Serve public static assets (including ONNX models and WASM binaries)
app.use(express.static(path.resolve(__dirname, 'public')));

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

const JWT_SECRET = process.env.JWT_SECRET;
const AUTH_COOKIE = 'roadguard_token';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is missing from .env');
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
// GEMINI DETECTION AI ENDPOINT
// ============================================================

app.post('/api/detect', async (req, res) => {
  const startTime = Date.now();

  const {
    imageBase64,
    mimeType = 'image/jpeg',
    mode = 'both',
    learnedDirectives = ''
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

  // Gemini API unavailable — do not generate fake detections.
  if (!ai) {
    console.error('[Gemini] GEMINI_API_KEY is not configured.');

    return res.status(503).json({
      error: 'Gemini API is unavailable. Please configure GEMINI_API_KEY.',
      detected: false,
      objects: [],
      modelUsed: 'gemini-unavailable',
    });
  }

  try {
    let modeInstruction = '';

    if (mode === 'potholes') {
      modeInstruction = `TARGET MODE: POTHOLES & ROAD INTEGRITY ONLY.
Carefully examine the road surface, driving lanes, shoulders, and asphalt.
Detect:
1. Potholes: cavities, asphalt depressions, deep crater holes, missing road surface.
2. Road cracks: longitudinal, transversal, alligator cracks, or surface fractures.
3. Broken or damaged road signs: tilted, dented, knocked down, bent, or obstructed warning/speed/direction signs.
Do NOT report moving vehicles if mode is potholes.`;

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
1. ROAD HAZARDS: Potholes, road cavities, asphalt fractures/cracks, broken road signs.
2. MOVING VEHICLES: Cars, scooters, motorcycles, autos traveling on the roadway with estimated speed in km/h.
Provide high precision bounding boxes and descriptive details for both.`;
    }

    const prompt = `You are a high-precision real-time road perception AI mounted on a vehicle camera.
${modeInstruction}

CRITICAL ACCURACY RULES:
- For potholes: tightly identify boundary coordinates [ymin, xmin, ymax, xmax] 0-1000. Specify lane position (center lane, right shoulder, wheel track).
- For vehicles / scooters: identify vehicleType ('car', 'scooter', 'motorcycle', 'auto', 'truck', 'bus'), estimate speed in km/h, and determine if exceeding road speed limits.
- Return structured JSON. If the roadway has no hazards or no moving vehicles as requested, return detected: false and objects: [].
${learnedDirectives ? `\n${learnedDirectives}` : ''}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash-lite',
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
        ? parsed.objects.map((obj: any) => ({
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

            description: obj.description || 'Road observation recorded',

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
          }))
        : [],

      latencyMs,
      modelUsed: 'gemini-3.5-flash-lite'
    };

    return res.json(result);

  } catch (err: any) {
    console.error('Gemini vision API error:', err);

    return res.status(500).json({
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
          : row.box2d
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
