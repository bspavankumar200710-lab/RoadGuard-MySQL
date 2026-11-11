
import {
  RoadHazardRecord,
  MonitoringStats,
  AILearningStats,
  HazardType,
  VerificationStatusType,
} from '../types/detection';
import { indexedDBService } from './indexedDBService';
import { agentLearningService } from './agentLearningService';
import { imageStorageService } from './imageStorageService';

const STORAGE_KEY = 'roadguard_detection_records';
const AI_STATS_KEY = 'roadguard_ai_learning_stats';

type DetectionListener = (records: RoadHazardRecord[]) => void;
type AILearningListener = (stats: AILearningStats) => void;

class DetectionService {
  private cache: RoadHazardRecord[] = [];
  private listeners: Set<DetectionListener> = new Set();
  private learningListeners: Set<AILearningListener> = new Set();
  private isInitialized = false;

  private aiStats: AILearningStats = {
    totalFeedbackCount: 0,
    confirmedCount: 0,
    disputedCount: 0,
    modelAccuracy: 95.2,
    modelIteration: 'Gemini-3.8-Flash-RLHF-v2.6',
    lastFeedbackTime: null,
    typeWeights: {
      pothole: 1.0,
      road_crack: 0.95,
      broken_sign: 0.92,
      vehicle_speed: 0.98,
      other_hazard: 0.88,
    },
  };

  constructor() {
    this.loadAiStats();
    this.init();
    this.setupNetworkListeners();
  }

  private loadAiStats() {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(AI_STATS_KEY);

        if (stored) {
          this.aiStats = {
            ...this.aiStats,
            ...JSON.parse(stored),
          };
        }
      } catch (e) {
        console.warn('Could not read AI learning stats:', e);
      }
    }
  }

  private saveAiStats() {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(
          AI_STATS_KEY,
          JSON.stringify(this.aiStats)
        );
      } catch (e) {
        console.warn('Could not save AI learning stats:', e);
      }
    }

    this.notifyLearning();
  }

  private notifyLearning() {
    for (const listener of this.learningListeners) {
      listener({ ...this.aiStats });
    }
  }

  public subscribeLearning(
    listener: AILearningListener
  ): () => void {
    this.learningListeners.add(listener);
    listener({ ...this.aiStats });

    return () => this.learningListeners.delete(listener);
  }

  public getAILearningStats(): AILearningStats {
    return { ...this.aiStats };
  }

  private setupNetworkListeners() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        indexedDBService.flushSyncQueue();
        this.fetchFromServer();
      });
    }
  }

  private async init() {
    // 1. First priority: IndexedDB.
    try {
      const idbRecords = await indexedDBService.getAll();

      if (idbRecords && idbRecords.length > 0) {
        this.cache = idbRecords;
        this.notify();
      }
    } catch (e) {
      console.warn('Could not read IndexedDB on init:', e);
    }

    // 2. Second priority: LocalStorage.
    if (this.cache.length === 0 && typeof window !== 'undefined') {
      try {
        const localData = localStorage.getItem(STORAGE_KEY);

        if (localData) {
          const parsed = JSON.parse(localData);

          if (Array.isArray(parsed) && parsed.length > 0) {
            this.cache = parsed;
            this.notify();

            await indexedDBService.saveBulk(parsed);
          }
        }
      } catch (err) {
        console.warn('LocalStorage initialization warning:', err);
      }
    }

    // 3. Third priority: MySQL.
    await this.fetchFromServer();

    this.isInitialized = true;
  }

  public subscribe(listener: DetectionListener): () => void {
    this.listeners.add(listener);
    listener([...this.cache]);

    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) {
      listener([...this.cache]);
    }
  }

  private saveToLocalStorage() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(this.cache)
      );
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
  }

  // ============================================================
  // FETCH DETECTIONS FROM MYSQL
  // ============================================================

  public async fetchFromServer(): Promise<RoadHazardRecord[]> {
    if (
      typeof navigator !== 'undefined' &&
      !navigator.onLine
    ) {
      return this.cache;
    }

    try {
      const response = await fetch('/api/detections');

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const serverRecords: RoadHazardRecord[] =
        await response.json();

      if (Array.isArray(serverRecords)) {
        this.cache = serverRecords.sort(
          (a, b) =>
            new Date(b.timestamp).getTime() -
            new Date(a.timestamp).getTime()
        );

        await indexedDBService.saveBulk(this.cache);

        this.saveToLocalStorage();
        this.notify();
      }
    } catch (err) {
      console.warn('Could not fetch MySQL detections:', err);
    }

    return this.cache;
  }

  // ============================================================
  // ADD DETECTION
  // ============================================================

  public async addDetection(
    recordData: Omit<RoadHazardRecord, 'id' | 'timestamp'> & {
      id?: string;
      timestamp?: string;
      reportId?: string;
      damageClass?: string;
      damageName?: string;
      annotatedImageUrl?: string;
      imageSource?: 'live_camera' | 'manual_upload';
      aiEngine?: 'yolov8-nano' | 'gemini-vision';
      verificationStatus?: VerificationStatusType;
    }
  ): Promise<RoadHazardRecord> {
    const id =
      recordData.id ||
      `hazard_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 9)}`;

    const reportId = recordData.reportId || id;

    // Use the existing MySQL-authenticated user ID when available.
    const userId = recordData.userId || undefined;

    const damageClass =
      recordData.damageClass ||
      imageStorageService.extractDamageClass({
        type: recordData.type,
        confidence: recordData.confidence,
        severity: recordData.severity,
        description: recordData.description,
        box2d: recordData.box2d,
      });

    const damageName =
      recordData.damageName ||
      imageStorageService.resolveDamageName(
        damageClass,
        recordData.type
      );

    const imageSource =
      recordData.imageSource || 'live_camera';

    const aiEngine =
      recordData.aiEngine || 'yolov8-nano';

    const verificationStatus: VerificationStatusType =
      recordData.verificationStatus ||
      (recordData.verifiedStatus === 'confirmed'
        ? 'verified'
        : recordData.verifiedStatus === 'disputed'
          ? 'rejected'
          : 'pending');

    const verifiedStatus =
      recordData.verifiedStatus ||
      (verificationStatus === 'verified'
        ? 'confirmed'
        : verificationStatus === 'rejected'
          ? 'disputed'
          : 'unverified');

    // Register detection in duplicate prevention cache.
    imageStorageService.recordDetectionOccurrence(
      recordData.type,
      damageClass,
      recordData.latitude,
      recordData.longitude,
      recordData.box2d
    );

    let imageUrl = recordData.imageUrl;
    let annotatedImageUrl = recordData.annotatedImageUrl;

    // Prepare original and annotated images for MySQL.
    if (recordData.imageUrl) {
      try {
        const uploadResult =
          await imageStorageService.uploadReportImages({
            reportId,
            originalImage: recordData.imageUrl,
            objects: recordData.box2d
              ? [
                  {
                    type: recordData.type,
                    confidence: recordData.confidence,
                    severity: recordData.severity,
                    description: recordData.description,
                    box2d: recordData.box2d,
                  },
                ]
              : undefined,
            userId,
          });

        imageUrl = uploadResult.originalUrl;

        if (uploadResult.annotatedUrl) {
          annotatedImageUrl = uploadResult.annotatedUrl;
        }
      } catch (uploadError) {
        console.warn(
          '[DetectionService] Image preparation failed:',
          uploadError
        );
      }
    }

    const record: RoadHazardRecord = {
      id,
      reportId,
      userId,
      type: recordData.type,
      damageClass,
      damageName,
      confidence: recordData.confidence,
      severity: recordData.severity,
      description: recordData.description,
      latitude: recordData.latitude,
      longitude: recordData.longitude,
      locationName: recordData.locationName,
      timestamp:
        recordData.timestamp || new Date().toISOString(),
      imageUrl,
      annotatedImageUrl,
      imageSource,
      aiEngine,
      verificationStatus,
      box2d: recordData.box2d,
      vehicleType: recordData.vehicleType,
      estimatedSpeedKmh: recordData.estimatedSpeedKmh,
      speedLimitKmh: recordData.speedLimitKmh,
      isOverSpeed: recordData.isOverSpeed,
      verifiedStatus,
      learnedAccuracyScore:
        recordData.learnedAccuracyScore ||
        recordData.confidence,
    };

    // 1. Immediately update in-memory cache.
    this.cache.unshift(record);

    // 2. Save locally.
    await indexedDBService.save(record);

    this.saveToLocalStorage();
    this.notify();

    // 3. Save detection to MySQL.
    if (
      typeof navigator === 'undefined' ||
      navigator.onLine
    ) {
      try {
        const response = await fetch('/api/detections', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(record),
        });

        if (!response.ok) {
          throw new Error(
            `MySQL API returned ${response.status}`
          );
        }

        console.log(
          '[DetectionService] Detection saved to MySQL:',
          record.id
        );
      } catch (error) {
        console.warn(
          '[DetectionService] MySQL save failed. Queuing for sync:',
          error
        );

        await indexedDBService.queueSync('add', record);
      }
    } else {
      await indexedDBService.queueSync('add', record);
    }

    return record;
  }

  // ============================================================
  // VERIFY REPORT
  // ============================================================

  public async verifyReport(
    id: string,
    status: VerificationStatusType,
    reviewerNotes?: string
  ): Promise<RoadHazardRecord | null> {
    const record = this.cache.find((r) => r.id === id);

    if (!record) return null;

    const reviewer = 'Administrator';
    const now = new Date().toISOString();

    record.verificationStatus = status;

    record.verifiedStatus =
      status === 'verified'
        ? 'confirmed'
        : status === 'rejected'
          ? 'disputed'
          : 'unverified';

    record.verifiedAt = now;
    record.verifiedBy = reviewer;

    if (reviewerNotes) {
      record.disputeReason = reviewerNotes;
    }

    try {
      const response = await fetch(
        `/api/detections/${id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(record),
        }
      );

      if (!response.ok) {
        throw new Error(
          `MySQL update failed: ${response.status}`
        );
      }

      await indexedDBService.save(record);

      this.saveToLocalStorage();
      this.notify();

      console.log(
        '[DetectionService] Verification saved to MySQL:',
        id
      );
    } catch (error) {
      console.error(
        '[DetectionService] Verification update failed:',
        error
      );

      return null;
    }

    return { ...record };
  }

  // ============================================================
  // CONFIRM HAZARD
  // ============================================================

  public async confirmHazard(
    id: string,
    userNotes?: string
  ): Promise<RoadHazardRecord | null> {
    const record = this.cache.find((r) => r.id === id);

    if (!record) return null;

    const userIdentifier = 'Active Driver';
    const now = new Date().toISOString();

    record.verifiedStatus = 'confirmed';
    record.verifiedAt = now;
    record.verifiedBy = userIdentifier;

    record.learnedAccuracyScore = Math.min(
      0.998,
      Math.round(
        ((record.confidence || 0.90) + 0.05) * 1000
      ) / 1000
    );

    record.aiLearningFeedbackSent = true;

    // Update AI learning statistics.
    this.aiStats.confirmedCount += 1;
    this.aiStats.totalFeedbackCount += 1;
    this.aiStats.lastFeedbackTime = now;

    this.aiStats.modelAccuracy = Math.min(
      99.7,
      Math.round(
        (
          95.0 +
          this.aiStats.confirmedCount * 0.35 -
          this.aiStats.disputedCount * 0.45
        ) * 10
      ) / 10
    );

    const currentWeight =
      this.aiStats.typeWeights[record.type] || 1.0;

    this.aiStats.typeWeights[record.type] = Math.min(
      1.25,
      Math.round((currentWeight + 0.04) * 100) / 100
    );

    this.saveAiStats();

    // Save confirmation to MySQL.
    try {
      const response = await fetch(
        `/api/detections/${id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(record),
        }
      );

      if (!response.ok) {
        throw new Error(
          `MySQL update failed: ${response.status}`
        );
      }

      await indexedDBService.save(record);

      this.saveToLocalStorage();
      this.notify();

      console.log(
        '[DetectionService] Confirmation saved to MySQL:',
        id
      );
    } catch (error) {
      console.error(
        'MySQL confirmation update failed:',
        error
      );

      return null;
    }

    // Send feedback to MySQL AI feedback endpoint.
    try {
      await fetch('/api/ai/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          detectionId: record.id,
          action: 'confirm',
          hazardType: record.type,
          notes:
            userNotes ||
            'Driver verified hazard presence on road',
          timestamp: now,
          driver: userIdentifier,
        }),
      });
    } catch (error) {
      console.warn(
        'AI feedback telemetry failed:',
        error
      );
    }

    return { ...record };
  }

  // ============================================================
  // DISPUTE HAZARD
  // ============================================================

  public async disputeHazard(
    id: string,
    reason: string,
    actualCategory?:
      | 'shadow'
      | 'manhole'
      | 'water_puddle'
      | 'paint_marking'
      | 'speed_breaker'
      | 'normal_road'
      | 'other_hazard'
  ): Promise<RoadHazardRecord | null> {
    const record = this.cache.find((r) => r.id === id);

    if (!record) return null;

    const userIdentifier = 'Active Driver';
    const now = new Date().toISOString();

    record.verifiedStatus = 'disputed';
    record.verifiedAt = now;
    record.verifiedBy = userIdentifier;

    record.disputeReason =
      reason || actualCategory || 'False positive';

    record.learnedAccuracyScore = Math.max(
      0.12,
      Math.round(
        ((record.confidence || 0.90) - 0.45) * 1000
      ) / 1000
    );

    record.aiLearningFeedbackSent = true;

    // Update AI learning statistics.
    this.aiStats.disputedCount += 1;
    this.aiStats.totalFeedbackCount += 1;
    this.aiStats.lastFeedbackTime = now;

    this.aiStats.modelAccuracy = Math.max(
      88.5,
      Math.round(
        (
          95.0 +
          this.aiStats.confirmedCount * 0.35 -
          this.aiStats.disputedCount * 0.45
        ) * 10
      ) / 10
    );

    const currentWeight =
      this.aiStats.typeWeights[record.type] || 1.0;

    this.aiStats.typeWeights[record.type] = Math.max(
      0.60,
      Math.round((currentWeight - 0.08) * 100) / 100
    );

    this.saveAiStats();

    // Feed the agent learning service.
    if (actualCategory) {
      agentLearningService.teachMistake(
        record.type,
        actualCategory,
        `Disputed by driver: ${
          reason || actualCategory
        }. Adjusted model bias.`
      );
    }

    // Save dispute to MySQL.
    try {
      const response = await fetch(
        `/api/detections/${id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(record),
        }
      );

      if (!response.ok) {
        throw new Error(
          `MySQL update failed: ${response.status}`
        );
      }

      await indexedDBService.save(record);

      this.saveToLocalStorage();
      this.notify();

      console.log(
        '[DetectionService] Dispute saved to MySQL:',
        id
      );
    } catch (error) {
      console.error(
        'MySQL dispute update failed:',
        error
      );

      return null;
    }

    // Send AI feedback telemetry.
    try {
      await fetch('/api/ai/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          detectionId: record.id,
          action: 'dispute',
          hazardType: record.type,
          reason,
          actualCategory,
          timestamp: now,
          driver: userIdentifier,
        }),
      });
    } catch (error) {
      console.warn(
        'AI feedback telemetry failed:',
        error
      );
    }

    return { ...record };
  }

  // ============================================================
  // DELETE DETECTION
  // ============================================================

  public async deleteDetection(
    id: string
  ): Promise<boolean> {
    this.cache = this.cache.filter(
      (item) => item.id !== id
    );

    await indexedDBService.delete(id);

    this.saveToLocalStorage();
    this.notify();

    if (
      typeof navigator === 'undefined' ||
      navigator.onLine
    ) {
      try {
        const response = await fetch(
          `/api/detections/${id}`,
          {
            method: 'DELETE',
          }
        );

        if (!response.ok && response.status !== 404) {
          throw new Error(
            `MySQL delete failed: ${response.status}`
          );
        }
      } catch (error) {
        console.warn(
          'MySQL delete failed. Queuing sync:',
          error
        );

        await indexedDBService.queueSync(
          'delete',
          undefined,
          id
        );
      }
    } else {
      await indexedDBService.queueSync(
        'delete',
        undefined,
        id
      );
    }

    return true;
  }

  // ============================================================
  // CLEAR ALL DETECTIONS
  // ============================================================

  public async clearAll(): Promise<void> {
    const idsToDelete = this.cache.map(
      (item) => item.id
    );

    this.cache = [];

    await indexedDBService.clearAll();

    this.saveToLocalStorage();
    this.notify();

    if (
      typeof navigator === 'undefined' ||
      navigator.onLine
    ) {
      try {
        const response = await fetch(
          '/api/detections',
          {
            method: 'DELETE',
          }
        );

        if (!response.ok) {
          throw new Error(
            `MySQL clear failed: ${response.status}`
          );
        }
      } catch (error) {
        console.warn(
          'MySQL clear failed. Queuing individual deletions:',
          error
        );

        for (const id of idsToDelete) {
          await indexedDBService.queueSync(
            'delete',
            undefined,
            id
          );
        }
      }
    } else {
      for (const id of idsToDelete) {
        await indexedDBService.queueSync(
          'delete',
          undefined,
          id
        );
      }
    }
  }

  // ============================================================
  // GET ALL DETECTIONS
  // ============================================================

  public getAll(): RoadHazardRecord[] {
    return [...this.cache];
  }

  // ============================================================
  // DASHBOARD STATISTICS
  // ============================================================

  public getStats(): MonitoringStats {
    const total = this.cache.length;

    const potholes = this.cache.filter(
      (d) => d.type === 'pothole'
    ).length;

    const cracks = this.cache.filter(
      (d) => d.type === 'road_crack'
    ).length;

    const brokenSigns = this.cache.filter(
      (d) => d.type === 'broken_sign'
    ).length;

    const speedDetections = this.cache.filter(
      (d) => d.type === 'vehicle_speed'
    ).length;

    const highSeverity = this.cache.filter(
      (d) => d.severity === 'high'
    ).length;

    const today = this.cache.filter((d) => {
      const date = new Date(d.timestamp);
      const now = new Date();

      return (
        date.getDate() === now.getDate() &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear()
      );
    }).length;

    return {
      total,
      potholes,
      roadCracks: cracks,
      brokenSigns,
      speedDetections,
      highSeverity,
      today,
    };
  }
}

export const detectionService = new DetectionService();
