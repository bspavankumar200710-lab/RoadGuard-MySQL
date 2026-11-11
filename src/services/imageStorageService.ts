import { DetectedObject, HazardType } from '../types/detection';

export interface UploadResult {
  originalUrl: string;
  annotatedUrl?: string;
  storageStatus: 'uploaded' | 'fallback';
  storagePathOriginal?: string;
  storagePathAnnotated?: string;
  fileSizeBytes: number;
}

interface RecentDetectionItem {
  type: string;
  damageClass: string;
  lat: number | null;
  lng: number | null;
  boxCenter?: [number, number];
  timestamp: number;
}

export class ImageStorageService {
  private recentDetections: RecentDetectionItem[] = [];

  private readonly duplicateWindowMs = 15000;
  private readonly duplicateDistanceMeters = 30;

  /**
   * Checks whether an incoming detection is a duplicate
   * of a recently saved road hazard.
   */
  public isDuplicateDetection(
    type: HazardType | string,
    damageClass: string,
    lat: number | null,
    lng: number | null,
    box2d?: [number, number, number, number]
  ): boolean {
    const now = Date.now();

    this.recentDetections = this.recentDetections.filter(
      (item) => now - item.timestamp < this.duplicateWindowMs
    );

    const boxCenter = box2d
      ? ([
          (box2d[0] + box2d[2]) / 2,
          (box2d[1] + box2d[3]) / 2,
        ] as [number, number])
      : undefined;

    for (const recent of this.recentDetections) {
      const isSameType =
        recent.type === type || recent.damageClass === damageClass;

      if (!isSameType) continue;

      // Check GPS proximity.
      if (
        lat !== null &&
        lng !== null &&
        recent.lat !== null &&
        recent.lng !== null
      ) {
        const distance = this.calculateDistanceMeters(
          lat,
          lng,
          recent.lat,
          recent.lng
        );

        if (distance <= this.duplicateDistanceMeters) {
          return true;
        }
      }

      // Check bounding-box proximity.
      if (boxCenter && recent.boxCenter) {
        const dy = Math.abs(boxCenter[0] - recent.boxCenter[0]);
        const dx = Math.abs(boxCenter[1] - recent.boxCenter[1]);

        if (dy < 120 && dx < 120) {
          return true;
        }
      }

      // Check whether the same class appeared within 4 seconds.
      if (now - recent.timestamp < 4000) {
        return true;
      }
    }

    return false;
  }

  /**
   * Registers a newly saved detection in the duplicate cache.
   */
  public recordDetectionOccurrence(
    type: HazardType | string,
    damageClass: string,
    lat: number | null,
    lng: number | null,
    box2d?: [number, number, number, number]
  ): void {
    const boxCenter = box2d
      ? ([
          (box2d[0] + box2d[2]) / 2,
          (box2d[1] + box2d[3]) / 2,
        ] as [number, number])
      : undefined;

    this.recentDetections.push({
      type,
      damageClass,
      lat,
      lng,
      boxCenter,
      timestamp: Date.now(),
    });
  }

  /**
   * Compresses an image into JPEG format.
   * Returns a Base64 data URL suitable for saving in MySQL.
   */
  public async compressImage(
    source: string | File | Blob,
    maxWidth = 1280,
    quality = 0.82
  ): Promise<{
    blob: Blob;
    dataUrl: string;
    width: number;
    height: number;
  }> {
    const img = await this.loadImageElement(source);

    let targetWidth = img.naturalWidth || img.width;
    let targetHeight = img.naturalHeight || img.height;

    if (targetWidth > maxWidth || targetHeight > maxWidth) {
      const scale = Math.min(
        maxWidth / targetWidth,
        maxWidth / targetHeight
      );

      targetWidth = Math.round(targetWidth * scale);
      targetHeight = Math.round(targetHeight * scale);
    }

    const canvas = document.createElement('canvas');

    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Canvas 2D context unavailable for image compression');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const dataUrl = canvas.toDataURL('image/jpeg', quality);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) {
            resolve(result);
          } else {
            reject(new Error('Failed to encode image to JPEG blob'));
          }
        },
        'image/jpeg',
        quality
      );
    });

    return {
      blob,
      dataUrl,
      width: targetWidth,
      height: targetHeight,
    };
  }

  /**
   * Generates an annotated JPEG image with YOLOv8 bounding boxes,
   * damage codes and confidence scores.
   */
  public async generateAnnotatedImage(
    source: string | File | Blob,
    objects: DetectedObject[],
    maxWidth = 1280
  ): Promise<{ blob: Blob; dataUrl: string }> {
    const img = await this.loadImageElement(source);

    let targetWidth = img.naturalWidth || img.width;
    let targetHeight = img.naturalHeight || img.height;

    if (targetWidth > maxWidth || targetHeight > maxWidth) {
      const scale = Math.min(
        maxWidth / targetWidth,
        maxWidth / targetHeight
      );

      targetWidth = Math.round(targetWidth * scale);
      targetHeight = Math.round(targetHeight * scale);
    }

    const canvas = document.createElement('canvas');

    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Canvas 2D context unavailable for image annotation');
    }

    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    for (const obj of objects) {
      if (!obj.box2d || obj.box2d.length !== 4) continue;

      const [ymin, xmin, ymax, xmax] = obj.box2d;

      const x = Math.max(
        0,
        Math.min(targetWidth, (xmin / 1000) * targetWidth)
      );

      const y = Math.max(
        0,
        Math.min(targetHeight, (ymin / 1000) * targetHeight)
      );

      const w = Math.max(
        10,
        Math.min(
          targetWidth - x,
          ((xmax - xmin) / 1000) * targetWidth
        )
      );

      const h = Math.max(
        10,
        Math.min(
          targetHeight - y,
          ((ymax - ymin) / 1000) * targetHeight
        )
      );

      const isHigh = obj.severity === 'high';
      const isSpeed = obj.type === 'vehicle_speed';

      const strokeColor = isSpeed
        ? '#06b6d4'
        : isHigh
          ? '#ef4444'
          : '#f59e0b';

      const fillColor = isSpeed
        ? 'rgba(6, 182, 212, 0.15)'
        : isHigh
          ? 'rgba(239, 68, 68, 0.16)'
          : 'rgba(245, 158, 11, 0.16)';

      // Bounding box fill and outline.
      ctx.fillStyle = fillColor;
      ctx.fillRect(x, y, w, h);

      ctx.lineWidth = 3;
      ctx.strokeStyle = strokeColor;
      ctx.strokeRect(x, y, w, h);

      // Corner accents.
      const cornerLen = Math.min(18, Math.min(w, h) / 3);

      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';

      ctx.beginPath();
      ctx.moveTo(x, y + cornerLen);
      ctx.lineTo(x, y);
      ctx.lineTo(x + cornerLen, y);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x + w - cornerLen, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + cornerLen);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x, y + h - cornerLen);
      ctx.lineTo(x, y + h);
      ctx.lineTo(x + cornerLen, y + h);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x + w - cornerLen, y + h);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x + w, y + h - cornerLen);
      ctx.stroke();

      // Detection label.
      const classCode = this.extractDamageClass(obj);

      const confPercent = Math.round(obj.confidence * 100);

      const labelText =
        `${classCode}: ${obj.type.toUpperCase().replace('_', ' ')} (${confPercent}%)`;

      ctx.font = 'bold 12px Inter, system-ui, sans-serif';

      const textMetrics = ctx.measureText(labelText);

      const badgeWidth = textMetrics.width + 14;
      const badgeHeight = 22;

      const badgeY = Math.max(0, y - badgeHeight);

      ctx.fillStyle = strokeColor;
      ctx.fillRect(x, badgeY, badgeWidth, badgeHeight);

      ctx.fillStyle = isSpeed ? '#020617' : '#ffffff';

      ctx.fillText(labelText, x + 7, badgeY + 15);
    }

    // RoadGuard watermark.
    ctx.font = 'bold 11px Inter, system-ui, sans-serif';

    ctx.fillStyle = 'rgba(2, 6, 23, 0.75)';

    ctx.fillRect(
      targetWidth - 170,
      targetHeight - 24,
      162,
      20
    );

    ctx.fillStyle = '#38bdf8';

    ctx.fillText(
      'ROADGUARD AI VERIFIED',
      targetWidth - 162,
      targetHeight - 10
    );

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) {
            resolve(result);
          } else {
            reject(new Error('Failed to encode annotated image to JPEG blob'));
          }
        },
        'image/jpeg',
        0.85
      );
    });

    return { blob, dataUrl };
  }

  /**
   * Maps a detection to its road damage class code.
   */
  public extractDamageClass(obj: DetectedObject): string {
    const desc = obj.description || '';

    if (desc.includes('D00')) return 'D00';
    if (desc.includes('D10')) return 'D10';
    if (desc.includes('D20')) return 'D20';
    if (desc.includes('D40')) return 'D40';

    if (obj.type === 'pothole') return 'D40';
    if (obj.type === 'road_crack') return 'D20';
    if (obj.type === 'vehicle_speed') return 'SPEED';
    if (obj.type === 'broken_sign') return 'SIGN';

    return 'OTHER';
  }

  /**
   * Resolves a damage class into a display name.
   */
  public resolveDamageName(
    damageClass?: string,
    type?: string
  ): string {
    if (damageClass === 'D00') return 'Longitudinal Crack';
    if (damageClass === 'D10') return 'Transverse Crack';
    if (damageClass === 'D20') return 'Alligator Crack';
    if (damageClass === 'D40') return 'Pothole';

    if (damageClass === 'SPEED' || type === 'vehicle_speed') {
      return 'Vehicle Speed Radar';
    }

    if (damageClass === 'SIGN' || type === 'broken_sign') {
      return 'Damaged Traffic Sign';
    }

    if (type === 'road_crack') return 'Asphalt Surface Crack';
    if (type === 'pothole') return 'Pothole Defect';

    return 'Road Surface Hazard';
  }

  /**
   * Prepares original and annotated images for MySQL storage.
   *
   * Storage has been removed.
   * Images are returned as Base64 data URLs.
   * The caller must save these URLs through the MySQL detection API.
   */
  public async uploadReportImages(params: {
    reportId: string;
    originalImage: string | File | Blob;
    objects?: DetectedObject[];
    userId?: string;
  }): Promise<UploadResult> {
    const { originalImage, objects } = params;

    // Compress the original image.
    const compressed = await this.compressImage(
      originalImage,
      1280,
      0.82
    );

    let annotatedDataUrl: string | undefined;

    // Generate annotated image when bounding boxes are available.
    if (
      objects &&
      objects.length > 0 &&
      objects.some((obj) => obj.box2d)
    ) {
      try {
        const annotated = await this.generateAnnotatedImage(
          originalImage,
          objects,
          1280
        );

        annotatedDataUrl = annotated.dataUrl;
      } catch (error) {
        console.warn(
          '[ImageStorage] Annotation generation skipped:',
          error
        );
      }
    }

    const annotatedSize = annotatedDataUrl
      ? Math.ceil((annotatedDataUrl.length * 3) / 4)
      : 0;

    return {
      originalUrl: compressed.dataUrl,
      annotatedUrl: annotatedDataUrl,
      storageStatus: 'fallback',
      fileSizeBytes: compressed.blob.size + annotatedSize,
    };
  }

  /**
   * Loads an image from a URL, Base64 data URL, File or Blob.
   */
  private loadImageElement(
    source: string | File | Blob
  ): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();

      let objectUrl: string | undefined;

      const cleanup = () => {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
      };

      img.onload = () => {
        cleanup();
        resolve(img);
      };

      img.onerror = () => {
        cleanup();
        reject(new Error('Failed to decode image'));
      };

      if (typeof source === 'string') {
        if (
          source.startsWith('data:') ||
          source.startsWith('http://') ||
          source.startsWith('https://') ||
          source.startsWith('blob:')
        ) {
          img.src = source;
        } else {
          img.src = `data:image/jpeg;base64,${source}`;
        }
      } else {
        objectUrl = URL.createObjectURL(source);
        img.src = objectUrl;
      }
    });
  }

  /**
   * Calculates the distance between two GPS coordinates in meters.
   */
  private calculateDistanceMeters(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371e3;

    const toRad = (deg: number) => (deg * Math.PI) / 180;

    const phi1 = toRad(lat1);
    const phi2 = toRad(lat2);

    const deltaPhi = toRad(lat2 - lat1);
    const deltaLambda = toRad(lon2 - lon1);

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) *
        Math.cos(phi2) *
        Math.sin(deltaLambda / 2) *
        Math.sin(deltaLambda / 2);

    const c =
      2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }
}

export const imageStorageService = new ImageStorageService();