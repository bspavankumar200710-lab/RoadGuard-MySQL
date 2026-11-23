
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

interface VerifiedFeedbackRuleRow {
  id: string;
  rule_hash: string;
  rule_set_version: string;
  source_correction_id: string;
  target_hazard_type: string;
  true_negative_class: string;
  canonical_constraint: string;
  confidence_penalty: number;
  suppression_threshold: number;
  verification_status: string;
  verified_by: string;
  verified_at: string;
  created_at: string;
}

export interface RuleEvaluationRow {
  id: string;
  image_id: string;
  image_url: string;
  location_name: string;
  capture_timestamp: string;
  evaluation_timestamp: string;
  rule_set_version: string;
  total_rules: number;
  satisfied_count: number;
  not_satisfied_count: number;
  inconclusive_count: number;
  total_positive_penalty: number;
  total_negative_penalty: number;
  overall_score: number;
  rule_results: any;
  created_at: string;
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

const verifiedRulesStore: VerifiedFeedbackRuleRow[] = [
  {
    id: 'RULE-01',
    rule_hash: '8f3e4d5c',
    rule_set_version: 'v2.0-verified-calibration',
    source_correction_id: 'corr-cal-001',
    target_hazard_type: 'pothole',
    true_negative_class: 'manhole',
    canonical_constraint: 'EXCLUDE circular/square flush metallic utility lids, sewer grates, or manhole rims lacking broken asphalt spalling.',
    confidence_penalty: 0.420,
    suppression_threshold: 0.550,
    verification_status: 'approved',
    verified_by: 'Faculty Reviewer Admin',
    verified_at: nowIso,
    created_at: nowIso,
  },
  {
    id: 'RULE-02',
    rule_hash: '7a9b1c2d',
    rule_set_version: 'v2.0-verified-calibration',
    source_correction_id: 'corr-cal-002',
    target_hazard_type: 'road_crack',
    true_negative_class: 'shadow',
    canonical_constraint: 'EXCLUDE uniform low-texture dark bands or dappled tree/pole/overpass shadows that preserve intact asphalt aggregate.',
    confidence_penalty: 0.400,
    suppression_threshold: 0.550,
    verification_status: 'approved',
    verified_by: 'Faculty Reviewer Admin',
    verified_at: nowIso,
    created_at: nowIso,
  },
  {
    id: 'RULE-03',
    rule_hash: '9a1b2c3d',
    rule_set_version: 'v2.0-verified-calibration',
    source_correction_id: 'corr-cal-003',
    target_hazard_type: 'pothole',
    true_negative_class: 'water_puddle',
    canonical_constraint: 'EXCLUDE shallow reflective rainwater pools or wet glare patches unless jagged vertical cavity walls are visible.',
    confidence_penalty: 0.380,
    suppression_threshold: 0.550,
    verification_status: 'approved',
    verified_by: 'Faculty Reviewer Admin',
    verified_at: nowIso,
    created_at: nowIso,
  },
  {
    id: 'RULE-04',
    rule_hash: '3e5f7a1b',
    rule_set_version: 'v2.0-verified-calibration',
    source_correction_id: 'corr-cal-004',
    target_hazard_type: 'road_crack',
    true_negative_class: 'paint_marking',
    canonical_constraint: 'EXCLUDE high-luminance white/yellow lane striping, crosswalk bars, and directional thermoplastic pavement markings.',
    confidence_penalty: 0.440,
    suppression_threshold: 0.550,
    verification_status: 'approved',
    verified_by: 'Faculty Reviewer Admin',
    verified_at: nowIso,
    created_at: nowIso,
  },
  {
    id: 'RULE-05',
    rule_hash: '4c6d8e2f',
    rule_set_version: 'v2.0-verified-calibration',
    source_correction_id: 'corr-cal-005',
    target_hazard_type: 'pothole',
    true_negative_class: 'speed_breaker',
    canonical_constraint: 'EXCLUDE intentional painted or molded transverse speed humps / rumble strips spanning full lane width.',
    confidence_penalty: 0.390,
    suppression_threshold: 0.550,
    verification_status: 'approved',
    verified_by: 'Faculty Reviewer Admin',
    verified_at: nowIso,
    created_at: nowIso,
  },
];

const ruleEvaluationsStore: RuleEvaluationRow[] = [];
const automatedScansStore: any[] = [];

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

  // VERIFIED FEEDBACK RULES
  if (upper.includes('FROM VERIFIED_FEEDBACK_RULES')) {
    const sorted = [...verifiedRulesStore].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return [sorted.map((r) => ({ ...r })), []];
  }

  if (upper.startsWith('INSERT INTO VERIFIED_FEEDBACK_RULES')) {
    const [
      id,
      rule_hash,
      rule_set_version,
      source_correction_id,
      target_hazard_type,
      true_negative_class,
      canonical_constraint,
      confidence_penalty,
      suppression_threshold,
      verification_status,
      verified_by,
      verified_at,
    ] = params;

    verifiedRulesStore.unshift({
      id,
      rule_hash,
      rule_set_version: rule_set_version || 'v2.0-verified',
      source_correction_id: source_correction_id || '',
      target_hazard_type,
      true_negative_class,
      canonical_constraint,
      confidence_penalty: Number(confidence_penalty || 0.15),
      suppression_threshold: Number(suppression_threshold || 0.55),
      verification_status: verification_status || 'approved',
      verified_by: verified_by || 'Faculty Reviewer Admin',
      verified_at: verified_at instanceof Date ? verified_at.toISOString() : String(verified_at || new Date().toISOString()),
      created_at: new Date().toISOString(),
    });
    return [{ affectedRows: 1 }, []];
  }

  if (upper.startsWith('DELETE FROM VERIFIED_FEEDBACK_RULES WHERE ID =')) {
    const [id] = params;
    const before = verifiedRulesStore.length;
    const remaining = verifiedRulesStore.filter((r) => r.id !== id);
    verifiedRulesStore.length = 0;
    verifiedRulesStore.push(...remaining);
    return [{ affectedRows: before - verifiedRulesStore.length }, []];
  }

  // FEEDBACK RULE EVALUATIONS
  if (upper.includes('FROM FEEDBACK_RULE_EVALUATIONS')) {
    if (upper.includes('WHERE IMAGE_ID =')) {
      const [imgId] = params;
      const filtered = ruleEvaluationsStore
        .filter((r) => r.image_id === imgId)
        .sort((a, b) => new Date(b.evaluation_timestamp).getTime() - new Date(a.evaluation_timestamp).getTime());
      return [filtered.map((r) => ({ ...r })), []];
    }
    const sorted = [...ruleEvaluationsStore].sort(
      (a, b) => new Date(b.evaluation_timestamp).getTime() - new Date(a.evaluation_timestamp).getTime()
    );
    return [sorted.map((r) => ({ ...r })), []];
  }

  if (upper.startsWith('INSERT INTO FEEDBACK_RULE_EVALUATIONS')) {
    const [
      id,
      image_id,
      image_url,
      location_name,
      capture_timestamp,
      evaluation_timestamp,
      rule_set_version,
      total_rules,
      satisfied_count,
      not_satisfied_count,
      inconclusive_count,
      total_positive_penalty,
      total_negative_penalty,
      overall_score,
      rule_results,
    ] = params;

    ruleEvaluationsStore.unshift({
      id,
      image_id,
      image_url,
      location_name: location_name || '',
      capture_timestamp: capture_timestamp || '',
      evaluation_timestamp: evaluation_timestamp || new Date().toISOString(),
      rule_set_version: rule_set_version || 'v2.0-verified-calibration',
      total_rules: Number(total_rules || 5),
      satisfied_count: Number(satisfied_count || 0),
      not_satisfied_count: Number(not_satisfied_count || 0),
      inconclusive_count: Number(inconclusive_count || 0),
      total_positive_penalty: Number(total_positive_penalty || 0),
      total_negative_penalty: Number(total_negative_penalty || 0),
      overall_score: Number(overall_score || 0),
      rule_results: typeof rule_results === 'string' ? JSON.parse(rule_results) : rule_results,
      created_at: new Date().toISOString(),
    });
    return [{ affectedRows: 1 }, []];
  }

  // AUTOMATED LOCATION SCANS
  if (upper.includes('FROM AUTOMATED_LOCATION_SCANS')) {
    return [automatedScansStore, []];
  }

  if (upper.startsWith('INSERT INTO AUTOMATED_LOCATION_SCANS')) {
    const scanRecord: any = {
      id: params[0],
      scan_id: params[0],
      search_location: params[1],
      latitude: params[2],
      longitude: params[3],
      scan_timestamp: params[4] || new Date().toISOString(),
      imagery_provider: params[5],
      imagery_capture_date: params[6],
      imagery_age_category: params[7],
      coverage_percentage: params[8],
      images_analyzed: params[9],
      potholes_count: params[10],
      cracks_count: params[11],
      total_hazards: params[12],
      high_severity_count: params[13],
      medium_severity_count: params[14],
      low_severity_count: params[15],
      average_confidence: params[16],
      detection_status: params[17],
      status_message: params[18],
      processing_duration_ms: params[19],
      images_json: params[20],
      detections_json: params[21],
      created_at: new Date().toISOString(),
    };
    automatedScansStore.unshift(scanRecord);
    return [{ affectedRows: 1 }, []];
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

