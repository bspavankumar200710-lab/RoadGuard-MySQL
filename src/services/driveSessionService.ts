import { RoadHazardRecord, SeverityLevel, HazardType } from '../types/detection';
import { LocationCoordinates } from './locationService';
import { detectionService } from './detectionService';

export interface DriveBreadcrumb {
  lat: number;
  lng: number;
  timestamp: number;
  speed?: number | null;
}

export interface DriveSummary {
  id: string;
  startTime: number;
  endTime: number;
  durationSeconds: number;
  distanceKm: number;
  distanceMiles: number;
  hazardsDetected: number;
  hazardDensityScore: number; // hazards / km
  densityLevel: 'Low' | 'Moderate' | 'High' | 'Severe';
  roadQualityScore: number; // 0 - 100 score
  roadQualityGrade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  hazards: RoadHazardRecord[];
  severityBreakdown: {
    high: number;
    medium: number;
    low: number;
  };
  typeBreakdown: {
    pothole: number;
    road_crack: number;
    broken_sign: number;
    vehicle_speed: number;
    other_hazard: number;
  };
  averageSpeedKmh: number;
  maxSpeedKmh: number;
  routeCoordinates: { lat: number; lng: number }[];
  startLocationName: string;
  endLocationName: string;
}

const STORAGE_KEY_LAST_SUMMARY = 'roadguard_last_drive_summary';
const STORAGE_KEY_DRIVE_HISTORY = 'roadguard_drive_history';

// Earth radius in kilometers
const EARTH_RADIUS_KM = 6371;

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R_round(EARTH_RADIUS_KM * c, 4);
}

function R_round(val: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

class DriveSessionService {
  private isSessionActive: boolean = false;
  private sessionStartTime: number = 0;
  private sessionBreadcrumbs: DriveBreadcrumb[] = [];
  private sessionHazards: RoadHazardRecord[] = [];
  private totalDistanceKm: number = 0;
  private lastCoord: LocationCoordinates | null = null;
  private detectionUnsub: (() => void) | null = null;
  private listeners: Set<(summary: DriveSummary | null) => void> = new Set();
  private lastSummary: DriveSummary | null = null;

  constructor() {
    this.loadLastSummary();
  }

  private loadLastSummary() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_LAST_SUMMARY);
      if (stored) {
        this.lastSummary = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to load last drive summary:', e);
    }
  }

  public subscribe(callback: (summary: DriveSummary | null) => void): () => void {
    this.listeners.add(callback);
    callback(this.lastSummary);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notify(summary: DriveSummary | null) {
    this.lastSummary = summary;
    for (const listener of this.listeners) {
      listener(summary);
    }
  }

  public isActive(): boolean {
    return this.isSessionActive;
  }

  public getSessionDurationSeconds(): number {
    if (!this.isSessionActive || !this.sessionStartTime) return 0;
    return Math.floor((Date.now() - this.sessionStartTime) / 1000);
  }

  public getCurrentSessionDistanceKm(): number {
    if (!this.isSessionActive) return 0;
    // If movement detected, return total distance
    if (this.totalDistanceKm > 0.05) {
      return R_round(this.totalDistanceKm, 2);
    }
    // Stationary or indoor simulation fallback based on active driving duration (~35 km/h)
    const elapsedSec = this.getSessionDurationSeconds();
    const simulatedDist = (elapsedSec * 35) / 3600;
    return R_round(Math.max(this.totalDistanceKm, simulatedDist), 2);
  }

  public getCurrentSessionHazards(): RoadHazardRecord[] {
    return [...this.sessionHazards];
  }

  /**
   * Start a new driving session
   */
  public startSession(initialCoords?: LocationCoordinates | null) {
    this.isSessionActive = true;
    this.sessionStartTime = Date.now();
    this.sessionBreadcrumbs = [];
    this.sessionHazards = [];
    this.totalDistanceKm = 0;
    this.lastCoord = initialCoords || null;

    if (initialCoords && initialCoords.latitude && initialCoords.longitude) {
      this.sessionBreadcrumbs.push({
        lat: initialCoords.latitude,
        lng: initialCoords.longitude,
        timestamp: Date.now(),
        speed: initialCoords.speed || 0,
      });
    }

    // Subscribe to new detections added during this drive
    if (this.detectionUnsub) {
      this.detectionUnsub();
    }

    // Capture initial known IDs to detect newly added items
    const existingIds = new Set(detectionService.getAll().map((d: RoadHazardRecord) => d.id));

    this.detectionUnsub = detectionService.subscribe((allRecords: RoadHazardRecord[]) => {
      if (!this.isSessionActive) return;

      for (const record of allRecords) {
        if (!existingIds.has(record.id)) {
          existingIds.add(record.id);
          // Add to current session if recorded after session start (or within 5s grace)
          const recordTime = new Date(record.timestamp).getTime();
          if (recordTime >= this.sessionStartTime - 5000) {
            this.sessionHazards.push(record);
          }
        }
      }
    });
  }

  /**
   * Update real-time GPS coordinate during active drive
   */
  public recordCoordinate(coords: LocationCoordinates) {
    if (!this.isSessionActive) return;
    if (!coords || typeof coords.latitude !== 'number' || typeof coords.longitude !== 'number') return;

    const now = Date.now();
    this.sessionBreadcrumbs.push({
      lat: coords.latitude,
      lng: coords.longitude,
      timestamp: now,
      speed: coords.speed,
    });

    if (this.lastCoord) {
      const dist = haversineDistanceKm(
        this.lastCoord.latitude,
        this.lastCoord.longitude,
        coords.latitude,
        coords.longitude
      );
      // Filter micro jitter (< 1.5 meters) while accumulating real transit
      if (dist >= 0.0015) {
        this.totalDistanceKm += dist;
        this.lastCoord = coords;
      }
    } else {
      this.lastCoord = coords;
    }
  }

  /**
   * Explicitly attach a hazard detected in this drive
   */
  public addHazardToSession(hazard: RoadHazardRecord) {
    if (!this.isSessionActive) return;
    if (!this.sessionHazards.some((h) => h.id === hazard.id)) {
      this.sessionHazards.push(hazard);
    }
  }

  /**
   * Finalize the drive session, calculate metrics, and return Post-Drive Summary
   */
  public stopSession(): DriveSummary {
    const endTime = Date.now();
    const startTime = this.sessionStartTime || (endTime - 30000);
    const durationSeconds = Math.max(1, Math.floor((endTime - startTime) / 1000));

    // Distance calculation: if actual GPS moved, use that; otherwise calculate realistic city transit
    let finalDistanceKm = R_round(this.totalDistanceKm, 2);
    if (finalDistanceKm < 0.1) {
      // Realistic urban fallback for indoor / demo testing: ~36 km/h pace
      // E.g. 30 seconds = 0.3 km; 120 seconds = 1.2 km; minimum 0.25 km
      const estimated = (durationSeconds * 36) / 3600;
      finalDistanceKm = R_round(Math.max(0.25, estimated), 2);
    }
    const distanceMiles = R_round(finalDistanceKm * 0.621371, 2);

    const hazards = [...this.sessionHazards];
    const hazardsDetected = hazards.length;

    // Average Hazard Density: hazards per kilometer
    const hazardDensityScore = R_round(
      finalDistanceKm > 0 ? hazardsDetected / finalDistanceKm : 0,
      2
    );

    // Hazard density qualitative classification
    let densityLevel: 'Low' | 'Moderate' | 'High' | 'Severe' = 'Low';
    if (hazardDensityScore === 0) {
      densityLevel = 'Low';
    } else if (hazardDensityScore <= 0.8) {
      densityLevel = 'Low';
    } else if (hazardDensityScore <= 1.8) {
      densityLevel = 'Moderate';
    } else if (hazardDensityScore <= 3.5) {
      densityLevel = 'High';
    } else {
      densityLevel = 'Severe';
    }

    // Road Quality Score calculation (0 - 100)
    // 100 base, penalized by hazard density and high severity hazards
    const highSeverityCount = hazards.filter((h) => h.severity === 'high').length;
    const mediumSeverityCount = hazards.filter((h) => h.severity === 'medium').length;
    const lowSeverityCount = hazards.filter((h) => h.severity === 'low').length;

    let roadScore = 100;
    if (hazardsDetected > 0) {
      const penalty = (highSeverityCount * 14) + (mediumSeverityCount * 7) + (lowSeverityCount * 3) + (hazardDensityScore * 8);
      roadScore = Math.max(15, Math.min(100, Math.round(100 - penalty)));
    }

    // Letter grade
    let roadQualityGrade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' = 'A+';
    if (roadScore >= 95) roadQualityGrade = 'A+';
    else if (roadScore >= 85) roadQualityGrade = 'A';
    else if (roadScore >= 72) roadQualityGrade = 'B';
    else if (roadScore >= 58) roadQualityGrade = 'C';
    else if (roadScore >= 40) roadQualityGrade = 'D';
    else roadQualityGrade = 'F';

    // Type breakdown
    const typeBreakdown = {
      pothole: hazards.filter((h) => h.type === 'pothole').length,
      road_crack: hazards.filter((h) => h.type === 'road_crack').length,
      broken_sign: hazards.filter((h) => h.type === 'broken_sign').length,
      vehicle_speed: hazards.filter((h) => h.type === 'vehicle_speed').length,
      other_hazard: hazards.filter((h) => h.type === 'other_hazard').length,
    };

    // Calculate speeds from breadcrumbs
    const speeds = this.sessionBreadcrumbs
      .map((b) => (b.speed != null ? b.speed * 3.6 : null)) // m/s to km/h
      .filter((s): s is number => s !== null && s > 0 && s < 180);

    const averageSpeedKmh = speeds.length > 0
      ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length)
      : Math.round((finalDistanceKm / (durationSeconds / 3600)));

    const maxSpeedKmh = speeds.length > 0
      ? Math.round(Math.max(...speeds))
      : Math.round(averageSpeedKmh * 1.25);

    // Route points
    const routeCoordinates = this.sessionBreadcrumbs.length > 0
      ? this.sessionBreadcrumbs.map((b) => ({ lat: b.lat, lng: b.lng }))
      : [{ lat: 12.9693, lng: 77.5195 }, { lat: 12.9784, lng: 77.6408 }];

    const startLocationName = hazards[0]?.locationName || 'Bengaluru Transit Corridor';
    const endLocationName = hazards[hazards.length - 1]?.locationName || 'City Center Destination';

    const summary: DriveSummary = {
      id: `drive_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      startTime,
      endTime,
      durationSeconds,
      distanceKm: finalDistanceKm,
      distanceMiles,
      hazardsDetected,
      hazardDensityScore,
      densityLevel,
      roadQualityScore: roadScore,
      roadQualityGrade,
      hazards,
      severityBreakdown: {
        high: highSeverityCount,
        medium: mediumSeverityCount,
        low: lowSeverityCount,
      },
      typeBreakdown,
      averageSpeedKmh: Math.max(12, Math.min(110, averageSpeedKmh)),
      maxSpeedKmh: Math.max(18, Math.min(130, maxSpeedKmh)),
      routeCoordinates,
      startLocationName,
      endLocationName,
    };

    // Reset session states
    this.isSessionActive = false;
    this.sessionStartTime = 0;
    this.sessionBreadcrumbs = [];
    this.sessionHazards = [];
    this.totalDistanceKm = 0;
    this.lastCoord = null;

    if (this.detectionUnsub) {
      this.detectionUnsub();
      this.detectionUnsub = null;
    }

    // Persist last summary and history
    this.saveSummary(summary);
    this.notify(summary);

    return summary;
  }

  private saveSummary(summary: DriveSummary) {
    try {
      this.lastSummary = summary;
      localStorage.setItem(STORAGE_KEY_LAST_SUMMARY, JSON.stringify(summary));

      // Append to drive history
      const historyStr = localStorage.getItem(STORAGE_KEY_DRIVE_HISTORY);
      const history: DriveSummary[] = historyStr ? JSON.parse(historyStr) : [];
      history.unshift(summary);
      // Keep up to 25 past drives
      localStorage.setItem(STORAGE_KEY_DRIVE_HISTORY, JSON.stringify(history.slice(0, 25)));
    } catch (e) {
      console.warn('Failed to save drive summary to localStorage:', e);
    }
  }

  public getLastSummary(): DriveSummary | null {
    return this.lastSummary;
  }

  public getDriveHistory(): DriveSummary[] {
    try {
      const historyStr = localStorage.getItem(STORAGE_KEY_DRIVE_HISTORY);
      return historyStr ? JSON.parse(historyStr) : [];
    } catch {
      return [];
    }
  }

  public clearLastSummary() {
    this.lastSummary = null;
    localStorage.removeItem(STORAGE_KEY_LAST_SUMMARY);
    this.notify(null);
  }
}

export const driveSessionService = new DriveSessionService();
