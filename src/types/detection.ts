export type DetectionMode = 'both' | 'potholes' | 'speed';

export type HazardType = 'pothole' | 'road_crack' | 'broken_sign' | 'other_hazard' | 'vehicle_speed';
export type SeverityLevel = 'low' | 'medium' | 'high';
export type VehicleType = 'car' | 'scooter' | 'motorcycle' | 'auto' | 'truck' | 'bus';

export interface DetectedObject {
  type: HazardType;
  confidence: number;
  severity: SeverityLevel;
  description: string;
  box2d?: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0-1000
  damageClass?: string;
  visualEvidence?: string;
  // Decision Category (Requirement #6: Confirmed pothole, Uncertain candidate, Rejected false positive)
  decisionCategory?: 'confirmed_pothole' | 'uncertain_candidate' | 'rejected_false_positive';
  exclusionRuleMatched?: string;
  exclusionReason?: string;
  // Vehicle / Scooter speed estimation properties
  vehicleType?: VehicleType;
  estimatedSpeedKmh?: number;
  speedLimitKmh?: number;
  isOverSpeed?: boolean;
}

export interface DetectionResult {
  detected: boolean;
  objects: DetectedObject[];
  latencyMs?: number;
  modelUsed?: string;
  rawResponse?: string;
}

export type HazardVerificationStatus = 'unverified' | 'confirmed' | 'disputed';
export type VerificationStatusType = 'pending' | 'verified' | 'rejected';
export type ImageSourceType = 'live_camera' | 'manual_upload' | 'video_upload' | 'automated_location_scan';
export type AIEngineType =
  | 'roadguard-fusion'
  | 'yolov5'
  | 'gemini-feedback'
  | 'gemini-standard'
  | 'yolov8-nano'
  | 'gemini-vision';
export type DamageClassCode = 'D00' | 'D10' | 'D20' | 'D40' | 'VEHICLE_SPEED' | 'BROKEN_SIGN' | 'OTHER';

export interface GroundTruthBox {
  type: HazardType;
  damageClass: string;
  severity: SeverityLevel;
  box2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0-1000
}

export interface RoadHazardRecord {
  id: string;
  reportId?: string; // Report identifier in road-reports/{userId}/{reportId}
  userId?: string;
  type: HazardType;
  damageClass?: string; // D00, D10, D20, D40, etc.
  damageName?: string; // Longitudinal Crack, Pothole, etc.
  confidence: number;
  severity: SeverityLevel;
  description: string;
  latitude: number | null;
  longitude: number | null;
  locationName?: string;
  timestamp: string;
  imageUrl?: string; // Base64 data URL for original image, stored in MySQL
  annotatedImageUrl?: string; // Base64 data URL or MySQL storage URL for YOLOv5 / Gemini annotated image
  imageSource?: ImageSourceType; // 'live_camera' | 'manual_upload'
  aiEngine?: AIEngineType;
  feedbackRuleVersion?: string; // Version of verified feedback rule applied (e.g. v2.0-verified)
  verificationStatus?: VerificationStatusType; // 'pending' | 'verified' | 'rejected'
  box2d?: [number, number, number, number];
  groundTruthBoxes?: GroundTruthBox[];
  // Vehicle / Scooter speed estimation
  vehicleType?: VehicleType;
  estimatedSpeedKmh?: number;
  speedLimitKmh?: number;
  isOverSpeed?: boolean;

  // AI Learning Loop Metadata
  verifiedStatus?: HazardVerificationStatus;
  verifiedAt?: string;
  verifiedBy?: string;
  disputeReason?: string;
  learnedAccuracyScore?: number;
  aiLearningFeedbackSent?: boolean;
}

export type GPSStatus = 'prompt' | 'requesting' | 'connected' | 'denied' | 'unavailable' | 'demo';
export type CameraStatus = 'idle' | 'requesting' | 'active' | 'denied' | 'error' | 'demo';

export interface MonitoringStats {
  total: number;
  potholes: number;
  roadCracks: number;
  brokenSigns: number;
  speedDetections: number;
  highSeverity: number;
  today: number;
}

export interface AILearningStats {
  totalFeedbackCount: number;
  confirmedCount: number;
  disputedCount: number;
  modelAccuracy: number; // e.g. 96.4%
  modelIteration: string; // e.g. "Gemini-3.8-Flash-RLHF-v2.6"
  lastFeedbackTime: string | null;
  typeWeights: Record<HazardType, number>;
}
