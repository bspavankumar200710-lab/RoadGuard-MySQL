
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory MySQL-compatible store used when no live MySQL server is reachable
interface UserRow {
  id: number;
  username: string;
  email: string;
  password: string;
}

interface DetectionRow {
  id: string;
  [key: string]: any;
}

interface AiFeedbackRow {
  id: number;
  detectionId: string;
  action: string;
  hazardType: string;
  notes: string;
  feedback_timestamp: string;
  simulatedGradientAdjustment: string;
}

interface AgentLearningRow {
  id: string;
  timestamp: string;
  originalType: string;
  actualCategory: string;
  userNotes: string;
  confidencePenalty: number;
}

function loadJsonSeed<T>(relativePath: string, fallback: T[]): T[] {
  try {
    const fullPath = path.resolve(__dirname, relativePath);
    if (fs.existsSync(fullPath)) {
      const raw = fs.readFileSync(fullPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn(`[AI Studio] Could not load seed ${relativePath}:`, err);
  }
  return fallback;
}

const usersStore: UserRow[] = [];
let nextUserId = 1;

const detectionsStore: DetectionRow[] = loadJsonSeed<DetectionRow>('data/detections.json', []);

const rawFeedback = loadJsonSeed<any>('data/ai-feedback-loop.json', []);
const aiFeedbackStore: AiFeedbackRow[] = rawFeedback.map((item, idx) => ({
  id: idx + 1,
  detectionId: item.detectionId ?? '',
  action: item.action ?? 'confirm',
  hazardType: item.hazardType ?? 'pothole',
  notes: item.notes ?? '',
  feedback_timestamp: item.timestamp || new Date().toISOString(),
  simulatedGradientAdjustment: item.simulatedGradientAdjustment ?? '+0.04_positive_reinforce',
}));
let nextFeedbackId = aiFeedbackStore.length + 1;

const nowIso = new Date().toISOString();
const agentLearningsStore: AgentLearningRow[] = [
  {
    id: 'rule-baseline-1',
    timestamp: nowIso,
    originalType: 'pothole',
    actualCategory: 'manhole',
    userNotes: 'Metallic circular sewer and manhole lids on driving lanes are utility covers, NOT potholes.',
    confidencePenalty: 0.15,
  },
  {
    id: 'rule-baseline-2',
    timestamp: nowIso,
    originalType: 'road_crack',
    actualCategory: 'shadow',
    userNotes: 'Overhead tree branches and bridge silhouettes cast sharp shadows on asphalt. Do not flag as surface cracks.',
    confidencePenalty: 0.12,
  },
  {
    id: 'rule-baseline-3',
    timestamp: nowIso,
    originalType: 'pothole',
    actualCategory: 'water_puddle',
    userNotes: 'Reflective shallow rainwater pools without broken asphalt borders must not be labeled as structural craters.',
    confidencePenalty: 0.10,
  },
];

async function executeMockQuery(sql: string, params: any[] = []): Promise<[any, any[]]> {
  const normalized = sql.replace(/\s+/g, ' ').trim();
  const upper = normalized.toUpperCase();

  if (upper.startsWith('SELECT DATABASE()')) {
    return [[{ db: process.env.DB_NAME || 'roadguard_db' }], []];
  }

  // USERS
  if (upper.startsWith('INSERT INTO USERS')) {
    const [username, email, password] = params;
    if (usersStore.some((u) => u.email === email)) {
      const err: any = new Error(`Duplicate entry '${email}' for key 'email'`);
      err.code = 'ER_DUP_ENTRY';
      throw err;
    }
    const id = nextUserId++;
    usersStore.push({ id, username, email, password });
    return [{ insertId: id, affectedRows: 1 }, []];
  }

  if (upper.includes('FROM USERS WHERE EMAIL =')) {
    const [email] = params;
    const rows = usersStore.filter((u) => u.email === email).map((u) => ({ ...u }));
    return [rows, []];
  }

  if (upper.includes('FROM USERS WHERE ID =')) {
    const [id] = params;
    const rows = usersStore
      .filter((u) => u.id === Number(id))
      .map((u) => ({ id: u.id, username: u.username, email: u.email }));
    return [rows, []];
  }

  // DETECTIONS
  if (upper.startsWith('SELECT * FROM DETECTIONS')) {
    const sorted = [...detectionsStore].sort(
      (a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
    );
    return [sorted.map((r) => ({ ...r })), []];
  }

  if (upper.startsWith('SELECT ID FROM DETECTIONS WHERE ID =')) {
    const [id] = params;
    const match = detectionsStore.find((d) => d.id === id);
    return [match ? [{ id: match.id }] : [], []];
  }

  if (upper.startsWith('INSERT INTO DETECTIONS')) {
    const [
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
      aiLearningFeedbackSent,
    ] = params;

    const record: DetectionRow = {
      id,
      type,
      confidence,
      severity,
      description,
      latitude,
      longitude,
      locationName,
      timestamp: timestamp instanceof Date ? timestamp.toISOString() : timestamp,
      box2d: typeof box2d === 'string' ? JSON.parse(box2d) : box2d,
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
      verifiedAt: verifiedAt instanceof Date ? verifiedAt.toISOString() : verifiedAt,
      verifiedBy,
      disputeReason,
      learnedAccuracyScore,
      aiLearningFeedbackSent: Boolean(aiLearningFeedbackSent),
    };

    const existingIdx = detectionsStore.findIndex((d) => d.id === id);
    if (existingIdx >= 0) {
      detectionsStore[existingIdx] = record;
    } else {
      detectionsStore.unshift(record);
    }
    return [{ affectedRows: 1, insertId: 0 }, []];
  }

  if (upper.startsWith('UPDATE DETECTIONS SET')) {
    const [
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
      aiLearningFeedbackSent,
      id,
    ] = params;

    const idx = detectionsStore.findIndex((d) => d.id === id);
    if (idx === -1) {
      return [{ affectedRows: 0 }, []];
    }

    detectionsStore[idx] = {
      ...detectionsStore[idx],
      reportId,
      userId,
      damageClass,
      damageName,
      annotatedImageUrl,
      imageSource,
      aiEngine,
      verificationStatus,
      verifiedStatus,
      verifiedAt: verifiedAt instanceof Date ? verifiedAt.toISOString() : verifiedAt,
      verifiedBy,
      disputeReason,
      learnedAccuracyScore,
      aiLearningFeedbackSent: Boolean(aiLearningFeedbackSent),
    };
    return [{ affectedRows: 1 }, []];
  }

  if (upper.startsWith('DELETE FROM DETECTIONS WHERE ID =')) {
    const [id] = params;
    const before = detectionsStore.length;
    const remaining = detectionsStore.filter((d) => d.id !== id);
    detectionsStore.length = 0;
    detectionsStore.push(...remaining);
    return [{ affectedRows: before - detectionsStore.length }, []];
  }

  if (upper === 'DELETE FROM DETECTIONS') {
    const count = detectionsStore.length;
    detectionsStore.length = 0;
    return [{ affectedRows: count }, []];
  }

  // AI FEEDBACK
  if (upper.startsWith('INSERT INTO AI_FEEDBACK')) {
    const [
      detectionId,
      action,
      hazardType,
      notes,
      feedback_timestamp,
      simulatedGradientAdjustment,
    ] = params;
    const id = nextFeedbackId++;
    aiFeedbackStore.unshift({
      id,
      detectionId,
      action,
      hazardType,
      notes,
      feedback_timestamp:
        feedback_timestamp instanceof Date
          ? feedback_timestamp.toISOString()
          : String(feedback_timestamp || new Date().toISOString()),
      simulatedGradientAdjustment,
    });
    return [{ insertId: id, affectedRows: 1 }, []];
  }

  if (upper.startsWith('SELECT COUNT(*) AS TOTAL FROM AI_FEEDBACK')) {
    return [[{ total: aiFeedbackStore.length }], []];
  }

  if (upper.includes('FROM AI_FEEDBACK')) {
    const sorted = [...aiFeedbackStore].sort((a, b) => {
      const diff =
        new Date(b.feedback_timestamp).getTime() - new Date(a.feedback_timestamp).getTime();
      return diff !== 0 ? diff : b.id - a.id;
    });
    return [
      sorted.map((r) => ({
        id: r.id,
        detectionId: r.detectionId,
        action: r.action,
        hazardType: r.hazardType,
        notes: r.notes,
        timestamp: r.feedback_timestamp,
        simulatedGradientAdjustment: r.simulatedGradientAdjustment,
      })),
      [],
    ];
  }

  // AGENT LEARNINGS
  if (upper.includes('FROM AGENT_LEARNINGS')) {
    const sorted = [...agentLearningsStore].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    return [sorted.map((r) => ({ ...r })), []];
  }

  if (upper.startsWith('INSERT INTO AGENT_LEARNINGS')) {
    const [id, timestamp, originalType, actualCategory, userNotes, confidencePenalty] = params;
    agentLearningsStore.unshift({
      id,
      timestamp: timestamp instanceof Date ? timestamp.toISOString() : String(timestamp),
      originalType,
      actualCategory,
      userNotes,
      confidencePenalty,
    });
    return [{ affectedRows: 1 }, []];
  }

  if (upper.startsWith('DELETE FROM AGENT_LEARNINGS WHERE ID =')) {
    const [id] = params;
    const before = agentLearningsStore.length;
    const remaining = agentLearningsStore.filter((r) => r.id !== id);
    agentLearningsStore.length = 0;
    agentLearningsStore.push(...remaining);
    return [{ affectedRows: before - agentLearningsStore.length }, []];
  }

  if (upper === 'DELETE FROM AGENT_LEARNINGS') {
    const count = agentLearningsStore.length;
    agentLearningsStore.length = 0;
    return [{ affectedRows: count }, []];
  }

  return [[], []];
}

const mockPool = {
  query: (sql: string, params?: any[]) => executeMockQuery(sql, params),
  execute: (sql: string, params?: any[]) => executeMockQuery(sql, params),
  getConnection: async () => ({
    query: (sql: string, params?: any[]) => executeMockQuery(sql, params),
    execute: (sql: string, params?: any[]) => executeMockQuery(sql, params),
    release: () => {},
  }),
  end: async () => {},
};

let pool: any;

if (process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME) {
  try {
    const realPool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      connectTimeout: 3000,
    });

    // Wrap realPool so connection failures fall back cleanly to the in-memory mock
    pool = {
      query: async (sql: string, params?: any[]) => {
        try {
          return await realPool.query(sql, params);
        } catch (err: any) {
          if (err?.code === 'ECONNREFUSED' || err?.code === 'ETIMEDOUT' || err?.code === 'ENOTFOUND') {
            console.warn('[AI Studio] MySQL unreachable — falling back to in-memory mock');
            return executeMockQuery(sql, params);
          }
          throw err;
        }
      },
      execute: async (sql: string, params?: any[]) => {
        try {
          return await realPool.execute(sql, params);
        } catch (err: any) {
          if (err?.code === 'ECONNREFUSED' || err?.code === 'ETIMEDOUT' || err?.code === 'ENOTFOUND') {
            console.warn('[AI Studio] MySQL unreachable — falling back to in-memory mock');
            return executeMockQuery(sql, params);
          }
          throw err;
        }
      },
      getConnection: async () => {
        try {
          return await realPool.getConnection();
        } catch {
          return mockPool.getConnection();
        }
      },
      end: async () => {
        await realPool.end();
      },
    };
  } catch {
    console.warn('[AI Studio] MySQL pool creation failed — using in-memory mock');
    pool = mockPool;
  }
} else {
  console.warn('[AI Studio] MySQL not configured — using in-memory store seeded from /data/*.json');
  pool = mockPool;
}

export default pool;

