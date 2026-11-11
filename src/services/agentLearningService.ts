
/**
 * RoadGuard Self-Improving Camera Visual Agent Service
 *
 * Stores driver corrections in MySQL through the Express API.
 * Keeps a LocalStorage backup for offline access.
 */

export interface LearnedCorrection {
  id: string;
  timestamp: string;
  originalType: string;
  actualCategory:
    | 'shadow'
    | 'manhole'
    | 'water_puddle'
    | 'paint_marking'
    | 'speed_breaker'
    | 'other_hazard'
    | 'normal_road';
  userNotes: string;
  confidencePenalty: number;
}

export interface AgentLearningStats {
  totalCorrections: number;
  accuracyRating: number;
  suppressedPatterns: string[];
  lastLearnedAt: string | null;
}

const STORAGE_KEY = 'roadguard_agent_learned_rules';
const API_URL = '/api/agent-learnings';

class AgentLearningService {
  private corrections: LearnedCorrection[] = [];
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.init();
  }

  // ============================================================
  // INITIALIZE
  // ============================================================

  private async init() {
    // 1. Load local backup first.
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);

        if (stored) {
          const parsed = JSON.parse(stored);

          if (Array.isArray(parsed)) {
            this.corrections = parsed;
          }
        }
      } catch (error) {
        console.warn(
          '[AgentLearning] Could not read local storage:',
          error
        );
      }
    }

    // 2. Add baseline rules if no rules exist.
    if (this.corrections.length === 0) {
      const now = new Date().toISOString();

      this.corrections = [
        {
          id: 'rule-baseline-1',
          timestamp: now,
          originalType: 'pothole',
          actualCategory: 'manhole',
          userNotes:
            'Metallic circular sewer and manhole lids on driving lanes are utility covers, NOT potholes.',
          confidencePenalty: 0.15,
        },
        {
          id: 'rule-baseline-2',
          timestamp: now,
          originalType: 'road_crack',
          actualCategory: 'shadow',
          userNotes:
            'Overhead tree branches and bridge silhouettes cast sharp shadows on asphalt. Do not flag as surface cracks.',
          confidencePenalty: 0.12,
        },
        {
          id: 'rule-baseline-3',
          timestamp: now,
          originalType: 'pothole',
          actualCategory: 'water_puddle',
          userNotes:
            'Reflective shallow rainwater pools without broken asphalt borders must not be labeled as structural craters.',
          confidencePenalty: 0.10,
        },
      ];

      this.save();
    }

    this.notify();

    // 3. Synchronize with MySQL.
    await this.fetchFromServer();
  }

  // ============================================================
  // MYSQL API
  // ============================================================

  private async fetchFromServer(): Promise<void> {
    if (
      typeof navigator !== 'undefined' &&
      !navigator.onLine
    ) {
      return;
    }

    try {
      const response = await fetch(API_URL);

      if (!response.ok) {
        throw new Error(
          `MySQL API returned ${response.status}`
        );
      }

      const remoteRules: LearnedCorrection[] =
        await response.json();

      if (Array.isArray(remoteRules)) {
        this.corrections = remoteRules;

        this.save();
        this.notify();
      }
    } catch (error) {
      console.warn(
        '[AgentLearning] Could not fetch MySQL learning rules. Using local backup:',
        error
      );
    }
  }

  // ============================================================
  // LOCAL STORAGE
  // ============================================================

  private save(): void {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(this.corrections)
        );
      } catch (error) {
        console.warn(
          '[AgentLearning] Local storage save failed:',
          error
        );
      }
    }
  }

  private notify(): void {
    this.listeners.forEach((callback) => callback());
  }

  // ============================================================
  // SUBSCRIBE
  // ============================================================

  public subscribe(cb: () => void): () => void {
    this.listeners.add(cb);

    return () => this.listeners.delete(cb);
  }

  // ============================================================
  // TEACH AGENT A MISTAKE
  // ============================================================

  public async teachMistake(
    originalType: string,
    actualCategory: LearnedCorrection['actualCategory'],
    userNotes: string
  ): Promise<LearnedCorrection> {
    const correction: LearnedCorrection = {
      id: `rule-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      originalType,
      actualCategory,
      userNotes,
      confidencePenalty: 0.15,
    };

    // Save locally immediately.
    this.corrections.unshift(correction);

    this.save();
    this.notify();

    // Save to MySQL.
    if (
      typeof navigator === 'undefined' ||
      navigator.onLine
    ) {
      try {
        const response = await fetch(API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(correction),
        });

        if (!response.ok) {
          throw new Error(
            `MySQL save failed: ${response.status}`
          );
        }

        console.log(
          '[AgentLearning] Learning rule saved to MySQL:',
          correction.id
        );
      } catch (error) {
        console.warn(
          '[AgentLearning] MySQL save failed. Rule remains in local backup:',
          error
        );
      }
    }

    return correction;
  }

  // ============================================================
  // DELETE CORRECTION
  // ============================================================

  public async deleteCorrection(id: string): Promise<void> {
    this.corrections = this.corrections.filter(
      (correction) => correction.id !== id
    );

    this.save();
    this.notify();

    if (
      typeof navigator !== 'undefined' &&
      !navigator.onLine
    ) {
      console.warn(
        '[AgentLearning] Offline: deletion is only saved locally.'
      );

      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok && response.status !== 404) {
        throw new Error(
          `MySQL deletion failed: ${response.status}`
        );
      }

      console.log(
        '[AgentLearning] Learning rule deleted:',
        id
      );
    } catch (error) {
      console.warn(
        '[AgentLearning] MySQL deletion failed:',
        error
      );
    }
  }

  // ============================================================
  // RESET LEARNINGS
  // ============================================================

  public async resetLearnings(): Promise<void> {
    this.corrections = [];

    this.save();
    this.notify();

    if (
      typeof navigator !== 'undefined' &&
      !navigator.onLine
    ) {
      console.warn(
        '[AgentLearning] Offline: MySQL reset was not performed.'
      );

      return;
    }

    try {
      const response = await fetch(API_URL, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(
          `MySQL reset failed: ${response.status}`
        );
      }

      console.log(
        '[AgentLearning] MySQL learning rules reset.'
      );
    } catch (error) {
      console.warn(
        '[AgentLearning] MySQL reset failed:',
        error
      );
    }
  }

  // ============================================================
  // GET ALL CORRECTIONS
  // ============================================================

  public getAll(): LearnedCorrection[] {
    return [...this.corrections];
  }

  // ============================================================
  // GET LEARNING STATISTICS
  // ============================================================

  public getStats(): AgentLearningStats {
    const totalCorrections = this.corrections.length;

    const accuracyRating = Math.min(
      98.8,
      92.0 + totalCorrections * 0.9
    );

    const suppressedPatterns = Array.from(
      new Set(
        this.corrections.map((correction) =>
          correction.actualCategory.replace('_', ' ')
        )
      )
    );

    return {
      totalCorrections,
      accuracyRating:
        Math.round(accuracyRating * 10) / 10,
      suppressedPatterns,
      lastLearnedAt:
        this.corrections[0]?.timestamp || null,
    };
  }

  // ============================================================
  // GENERATE GEMINI PROMPT DIRECTIVES
  // ============================================================

  public getLearnedPromptDirectives(): string {
    if (this.corrections.length === 0) {
      return '';
    }

    const lines = this.corrections
      .slice(0, 8)
      .map((correction, index) => {
        return (
          `${index + 1}. FALSE POSITIVE WARNING FOR ` +
          `'${correction.originalType.toUpperCase()}': ` +
          `Driver confirmed this was actually a ` +
          `'${correction.actualCategory.toUpperCase()}'. ` +
          `Instruction: ${correction.userNotes}`
        );
      });

    return `

AI AGENT SELF-IMPROVEMENT MEMORY (LEARNED FROM DRIVER FEEDBACK):
The driver has previously corrected mistakes in similar driving conditions. Strictly observe these learned suppression rules:
${lines.join('\n')}
Do NOT repeat these false detections.`;
  }

  // ============================================================
  // SUPPRESS FALSE POSITIVES
  // ============================================================

  public isSuppressed(
    type: string,
    description: string
  ): boolean {
    const descLower = description.toLowerCase();

    for (const rule of this.corrections) {
      if (rule.originalType !== type) {
        continue;
      }

      if (
        rule.actualCategory === 'manhole' &&
        descLower.includes('manhole')
      ) {
        return true;
      }

      if (
        rule.actualCategory === 'shadow' &&
        descLower.includes('shadow')
      ) {
        return true;
      }

      if (
        rule.actualCategory === 'water_puddle' &&
        descLower.includes('water')
      ) {
        return true;
      }
    }

    return false;
  }
}

export const agentLearningService =
  new AgentLearningService();
