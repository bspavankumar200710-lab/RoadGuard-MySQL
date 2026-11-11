import { RoadHazardRecord, SeverityLevel } from '../types/detection';

export interface MunicipalCluster {
  id: string;
  name: string;
  centerLat: number;
  centerLng: number;
  totalHazards: number;
  criticalCount: number;
  mediumCount: number;
  lowCount: number;
  potholesCount: number;
  cracksCount: number;
  densityScore: number; // 0 - 100
  priority: 'P1_CRITICAL' | 'P2_ELEVATED' | 'P3_MODERATE';
  recommendedAction: string;
  estimatedRepairSqMeters: number;
  hazards: RoadHazardRecord[];
}

/**
 * Calculates distance in meters between two lat/lng points using Haversine formula
 */
function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Clusters hazards within a specific spatial radius (default ~650m) to identify
 * high-density problem areas for municipal road maintenance authorities.
 */
export function analyzeMunicipalHazardClusters(
  hazards: RoadHazardRecord[],
  clusterRadiusMeters: number = 750
): MunicipalCluster[] {
  const validHazards = hazards.filter(
    (h) => h.latitude != null && h.longitude != null && !isNaN(h.latitude) && !isNaN(h.longitude)
  );

  if (validHazards.length === 0) return [];

  const visited = new Set<string>();
  const clusters: MunicipalCluster[] = [];

  for (const hazard of validHazards) {
    if (visited.has(hazard.id)) continue;

    // Start a new cluster
    const clusterHazards: RoadHazardRecord[] = [hazard];
    visited.add(hazard.id);

    for (const other of validHazards) {
      if (visited.has(other.id)) continue;

      const dist = getDistanceMeters(
        hazard.latitude!,
        hazard.longitude!,
        other.latitude!,
        other.longitude!
      );

      if (dist <= clusterRadiusMeters) {
        clusterHazards.push(other);
        visited.add(other.id);
      }
    }

    // Compute cluster centroid
    const totalLat = clusterHazards.reduce((acc, cur) => acc + cur.latitude!, 0);
    const totalLng = clusterHazards.reduce((acc, cur) => acc + cur.longitude!, 0);
    const centerLat = totalLat / clusterHazards.length;
    const centerLng = totalLng / clusterHazards.length;

    const criticalCount = clusterHazards.filter((h) => h.severity === 'high').length;
    const mediumCount = clusterHazards.filter((h) => h.severity === 'medium').length;
    const lowCount = clusterHazards.filter((h) => h.severity === 'low').length;
    const potholesCount = clusterHazards.filter((h) => h.type === 'pothole').length;
    const cracksCount = clusterHazards.filter((h) => h.type === 'road_crack').length;

    // Density Score calculation: Weighted severity per hazard count
    const rawScore = criticalCount * 4.5 + mediumCount * 2.2 + lowCount * 1.0;
    const densityScore = Math.min(100, Math.round(rawScore * 8.5));

    // Priority Classification
    let priority: MunicipalCluster['priority'] = 'P3_MODERATE';
    if (criticalCount >= 2 || densityScore >= 50) {
      priority = 'P1_CRITICAL';
    } else if (criticalCount >= 1 || mediumCount >= 2 || densityScore >= 25) {
      priority = 'P2_ELEVATED';
    }

    // Recommended Municipal Civic Action
    let recommendedAction = 'Surface inspection and routine seal-coating scheduled.';
    if (priority === 'P1_CRITICAL') {
      if (potholesCount >= 2) {
        recommendedAction = 'Urgent Pothole Cold-Patching & Heavy Asphalt Compaction required within 24h.';
      } else {
        recommendedAction = 'Full Road Segment Milling & Bitumen Resurfacing needed to prevent structural collapse.';
      }
    } else if (priority === 'P2_ELEVATED') {
      recommendedAction = 'Crack sealing & localized mastic repair to prevent water seepage into road base.';
    }

    // Name based on locationName or coordinate
    const dominantLocation = clusterHazards.find((h) => h.locationName)?.locationName;
    const name = dominantLocation
      ? `${dominantLocation.split(',')[0]} Corridor`
      : `Corridor Sector ${centerLat.toFixed(3)}, ${centerLng.toFixed(3)}`;

    // Estimated asphalt square meters
    const estimatedRepairSqMeters = Math.max(12, Math.round(potholesCount * 4.2 + cracksCount * 2.5));

    clusters.push({
      id: `cluster_${hazard.id}`,
      name,
      centerLat,
      centerLng,
      totalHazards: clusterHazards.length,
      criticalCount,
      mediumCount,
      lowCount,
      potholesCount,
      cracksCount,
      densityScore,
      priority,
      recommendedAction,
      estimatedRepairSqMeters,
      hazards: clusterHazards,
    });
  }

  // Sort clusters by density score descending (worst problem areas first)
  return clusters.sort((a, b) => b.densityScore - a.densityScore);
}
