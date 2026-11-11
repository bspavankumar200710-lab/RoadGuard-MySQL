import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { RoadHazardRecord } from '../types/detection';

interface RoadGuardDB extends DBSchema {
  detections: {
    key: string;
    value: RoadHazardRecord;
    indexes: {
      'by-timestamp': string;
      'by-type': string;
      'by-severity': string;
    };
  };
  syncQueue: {
    key: string;
    value: {
      id: string;
      action: 'add' | 'delete';
      record?: RoadHazardRecord;
      queuedAt: string;
    };
  };
}

const DB_NAME = 'roadguard_offline_db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<RoadGuardDB>> | null = null;

function getDB(): Promise<IDBPDatabase<RoadGuardDB>> {
  if (!dbPromise) {
    dbPromise = openDB<RoadGuardDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Main detections store
        if (!db.objectStoreNames.contains('detections')) {
          const store = db.createObjectStore('detections', { keyPath: 'id' });
          store.createIndex('by-timestamp', 'timestamp');
          store.createIndex('by-type', 'type');
          store.createIndex('by-severity', 'severity');
        }

        // Offline sync queue for changes made without internet
        if (!db.objectStoreNames.contains('syncQueue')) {
          db.createObjectStore('syncQueue', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

/**
 * High-performance offline IndexedDB storage for road hazard detections
 */
export const indexedDBService = {
  /**
   * Retrieve all records stored in IndexedDB (newest first)
   */
  async getAll(): Promise<RoadHazardRecord[]> {
    try {
      const db = await getDB();
      const records = await db.getAllFromIndex('detections', 'by-timestamp');
      return records.reverse(); // Newest first
    } catch (err) {
      console.warn('IndexedDB getAll failed, falling back:', err);
      return [];
    }
  },

  /**
   * Save or update a detection record in IndexedDB
   */
  async save(record: RoadHazardRecord): Promise<void> {
    try {
      const db = await getDB();
      await db.put('detections', record);
    } catch (err) {
      console.warn('IndexedDB save failed:', err);
    }
  },

  /**
   * Save multiple records in a single batch transaction
   */
  async saveBulk(records: RoadHazardRecord[]): Promise<void> {
    try {
      const db = await getDB();
      const tx = db.transaction('detections', 'readwrite');
      await Promise.all([
        ...records.map((r) => tx.store.put(r)),
        tx.done,
      ]);
    } catch (err) {
      console.warn('IndexedDB saveBulk failed:', err);
    }
  },

  /**
   * Delete a detection record by ID
   */
  async delete(id: string): Promise<void> {
    try {
      const db = await getDB();
      await db.delete('detections', id);
    } catch (err) {
      console.warn('IndexedDB delete failed:', err);
    }
  },

  /**
   * Clear all detections from IndexedDB
   */
  async clearAll(): Promise<void> {
    try {
      const db = await getDB();
      await db.clear('detections');
    } catch (err) {
      console.warn('IndexedDB clearAll failed:', err);
    }
  },

  /**
   * Queue action for background sync when connection recovers
   */
  async queueSync(action: 'add' | 'delete', record?: RoadHazardRecord, id?: string): Promise<void> {
    try {
      const db = await getDB();
      const syncId = id || record?.id || `sync-${Date.now()}`;
      await db.put('syncQueue', {
        id: syncId,
        action,
        record,
        queuedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('IndexedDB queueSync failed:', err);
    }
  },

  /**
   * Flush pending offline actions to the backend when back online
   */
  async flushSyncQueue(): Promise<void> {
    if (!navigator.onLine) return;
    try {
      const db = await getDB();
      const pending = await db.getAll('syncQueue');
      if (pending.length === 0) return;

      for (const item of pending) {
        try {
          if (item.action === 'add' && item.record) {
            await fetch('/api/detections', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(item.record),
            });
          } else if (item.action === 'delete') {
            await fetch(`/api/detections/${item.id}`, { method: 'DELETE' });
          }
          await db.delete('syncQueue', item.id);
        } catch (e) {
          // Keep item in queue to retry next time
        }
      }
    } catch (err) {
      console.warn('IndexedDB flushSyncQueue error:', err);
    }
  },
};
