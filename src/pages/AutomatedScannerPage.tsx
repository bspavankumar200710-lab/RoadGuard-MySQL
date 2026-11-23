import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { loadGoogleMaps } from '../services/googleMapsService';
import { RoadViewpoint, RoadSectionCoverage, ExplorationResult } from '../services/roadImageryService';
import { multiModelFusionService } from '../services/multiModelFusionService';
import { imageStorageService } from '../services/imageStorageService';
import { detectionService } from '../services/detectionService';
import { DetectedObject, SeverityLevel } from '../types/detection';
import {
  Search,
  MapPin,
  Compass,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  Camera,
  Layers,
  ChevronRight,
  Database,
  ExternalLink,
  ShieldCheck,
  Zap,
  Info,
  Calendar,
  Eye,
  RotateCcw,
  Navigation,
  ArrowRight,
  ChevronLeft,
  Maximize2,
  X,
  Crosshair,
  Loader2,
  Map as MapIcon,
  HelpCircle,
  Filter,
  SlidersHorizontal,
  ChevronDown,
  Car,
  AlertCircle,
  FileCheck,
} from 'lucide-react';
import { buttonPressProps } from '../utils/motion';

export interface AutomatedScannerPageProps {
  onNavigateToMap?: (hazardId?: string) => void;
  onNavigateToHistory?: () => void;
}

export type ScannerStage =
  | 'idle'
  | 'searching'
  | 'discovering_imagery'
  | 'selecting_viewpoints'
  | 'analysing_yolo'
  | 'running_gemini'
  | 'feedback_gating'
  | 'saving_mysql'
  | 'completed'
  | 'error'
  | 'no_imagery';

export type RoadStatus =
  | 'not_inspected'
  | 'imagery_available'
  | 'in_progress'
  | 'inspected_clean'
  | 'potholes_detected'
  | 'imagery_unavailable';

export interface BengaluruRoad {
  id: string;
  name: string;
  locality: string;
  category: 'major_arterial' | 'main_road' | 'residential_street' | 'service_road' | 'internal_road';
  centerLat: number;
  centerLng: number;
  coordinatesPath: Array<{ lat: number; lng: number }>;
  lengthMeters: number;
  status: RoadStatus;
  availableViewpointsCount: number;
  inspectedViewpointsCount: number;
  confirmedPotholesCount: number;
  imageryProvider: string;
  lastScannedAt: string | null;
}

export interface PlaceSuggestion {
  placeId: string;
  name: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  type?: string;
  isCoordinate?: boolean;
}

export interface ScannedViewpointResult {
  viewpoint: RoadViewpoint;
  objects: DetectedObject[];
  annotatedImageUrl?: string;
  potholesCount: number;
  cracksCount: number;
  maxSeverity: SeverityLevel;
  latencyMs: number;
  confirmedPotholes: DetectedObject[];
  uncertainCandidates: DetectedObject[];
  rejectedFalsePositives: DetectedObject[];
}

export interface ScanSummary {
  scanId: string;
  searchLocation: string;
  roadId?: string;
  latitude: number;
  longitude: number;
  searchRadiusMeters?: number;
  scanTimestamp: string;
  imageryProvider: string;
  imageryCaptureDate?: string;
  imageryAgeCategory: string;
  coveragePercentage: number;
  imagesAnalyzed: number;
  potholesCount: number;
  cracksCount: number;
  totalHazards: number;
  highSeverityCount: number;
  mediumSeverityCount: number;
  lowSeverityCount: number;
  averageConfidence: number;
  detectionStatus: 'completed_hazards_detected' | 'completed_no_potholes' | 'no_imagery' | 'failed';
  statusMessage: string;
  processingDurationMs: number;
  viewpointResults: ScannedViewpointResult[];
  roadSections?: RoadSectionCoverage[];
}

/**
 * Returns official hex color code for Bengaluru Road Coverage statuses.
 * - Grey: Not inspected
 * - Blue: Authorized imagery available
 * - Yellow: Inspection in progress
 * - Green: Inspected; no confirmed potholes detected
 * - Red: Confirmed potholes detected
 * - Orange: Authorized imagery unavailable
 */
export function getRoadStatusColor(status: RoadStatus): string {
  switch (status) {
    case 'not_inspected':
      return '#64748b'; // Slate Grey
    case 'imagery_available':
      return '#2563eb'; // Royal Blue
    case 'in_progress':
      return '#eab308'; // Amber Yellow
    case 'inspected_clean':
      return '#10b981'; // Emerald Green
    case 'potholes_detected':
      return '#ef4444'; // Crimson Red
    case 'imagery_unavailable':
      return '#f97316'; // Deep Orange
    default:
      return '#64748b';
  }
}

export function getRoadStatusLabel(status: RoadStatus): string {
  switch (status) {
    case 'not_inspected':
      return 'Not Inspected';
    case 'imagery_available':
      return 'Imagery Available';
    case 'in_progress':
      return 'Scanning in Progress';
    case 'inspected_clean':
      return 'Inspected (0 Potholes)';
    case 'potholes_detected':
      return 'Potholes Detected';
    case 'imagery_unavailable':
      return 'Imagery Unavailable';
    default:
      return 'Unmapped';
  }
}

export const AutomatedScannerPage: React.FC<AutomatedScannerPageProps> = ({
  onNavigateToMap,
  onNavigateToHistory,
}) => {
  // -------------------------------------------------------------
  // STATE: Location Search & Navigation
  // -------------------------------------------------------------
  const [searchQuery, setSearchQuery] = useState<string>('Mahatma Gandhi (MG) Road, Bengaluru');
  const [latitude, setLatitude] = useState<number>(12.9755264);
  const [longitude, setLongitude] = useState<number>(77.6067902);
  const [radiusMeters, setRadiusMeters] = useState<number>(500);

  // Autocomplete Suggestions
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState<boolean>(false);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Bengaluru Road Network
  const [bengaluruRoads, setBengaluruRoads] = useState<BengaluruRoad[]>([]);
  const [roadSearchFilter, setRoadSearchFilter] = useState<string>('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [selectedRoadStatusFilter, setSelectedRoadStatusFilter] = useState<string>('all');
  const [selectedRoad, setSelectedRoad] = useState<BengaluruRoad | null>(null);

  // Scanner State Machine (8 Stages)
  const [currentStage, setCurrentStage] = useState<ScannerStage>('idle');
  const [stageProgress, setStageProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>(
    'Bengaluru city map loaded. Select any road or search to begin automated inspection.'
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Exploration & Viewpoint Traversal
  const [exploration, setExploration] = useState<ExplorationResult | null>(null);
  const [activeScanSummary, setActiveScanSummary] = useState<ScanSummary | null>(null);
  const [selectedViewpointIdx, setSelectedViewpointIdx] = useState<number>(0);
  const [activeImageView, setActiveImageView] = useState<'annotated' | 'original'>('annotated');
  const [activeTabMobile, setActiveTabMobile] = useState<'search' | 'map' | 'viewer'>('map');
  const [centerPanelView, setCenterPanelView] = useState<'map' | 'sections'>('map');
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<string>('all');
  const [isCustomRadius, setIsCustomRadius] = useState<boolean>(false);
  const [customRadiusValue, setCustomRadiusValue] = useState<string>('500');

  // MySQL Scan History
  const [scanHistory, setScanHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  // Google Maps References
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const centerMarkerRef = useRef<google.maps.Marker | null>(null);
  const radiusCircleRef = useRef<google.maps.Circle | null>(null);
  const viewpointMarkersRef = useRef<google.maps.Marker[]>([]);
  const hazardMarkersRef = useRef<google.maps.Marker[]>([]);
  const roadPolylinesRef = useRef<google.maps.Polyline[]>([]);
  const [mapLoaded, setMapLoaded] = useState<boolean>(false);

  // -------------------------------------------------------------
  // INITIALIZATION: Load Roads & Google Maps
  // -------------------------------------------------------------

  useEffect(() => {
    fetchBengaluruRoads();
    fetchScanHistory();
  }, []);

  const fetchBengaluruRoads = async () => {
    try {
      const res = await fetch('/api/bengaluru/roads');
      if (res.ok) {
        const data = await res.json();
        setBengaluruRoads(data);
        if (data.length > 0 && !selectedRoad) {
          const defaultRoad = data.find((r: BengaluruRoad) => r.id === 'blr_central_mg_road') || data[0];
          setSelectedRoad(defaultRoad);
        }
      }
    } catch (err) {
      console.warn('Failed to load Bengaluru roads inventory:', err);
    }
  };

  const fetchScanHistory = async () => {
    try {
      setIsLoadingHistory(true);
      const res = await fetch('/api/scanner/history');
      if (res.ok) {
        const data = await res.json();
        setScanHistory(data);
      }
    } catch (err) {
      console.warn('Failed to fetch scanner history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Initialize Google Maps Centered on Bengaluru City (12.9716, 77.5946)
  useEffect(() => {
    let isMounted = true;

    async function initMap() {
      try {
        const google = await loadGoogleMaps();
        if (!isMounted || !mapContainerRef.current) return;

        const mapInstance = new google.maps.Map(mapContainerRef.current, {
          center: { lat: 12.9755264, lng: 77.6067902 },
          zoom: 14,
          mapTypeId: google.maps.MapTypeId.ROADMAP,
          streetViewControl: false,
          mapTypeControl: true,
          fullscreenControl: false,
          styles: [
            {
              featureType: 'road',
              elementType: 'geometry',
              stylers: [{ visibility: 'on' }, { color: '#ffffff' }],
            },
            {
              featureType: 'road.arterial',
              elementType: 'geometry.fill',
              stylers: [{ color: '#fef3c7' }],
            },
            {
              featureType: 'road.highway',
              elementType: 'geometry.fill',
              stylers: [{ color: '#fed7aa' }],
            },
            {
              featureType: 'poi',
              stylers: [{ visibility: 'simplified' }],
            },
          ],
        });

        // Center Location Target Marker
        centerMarkerRef.current = new google.maps.Marker({
          position: { lat: latitude, lng: longitude },
          map: mapInstance,
          title: 'Selected Road Inspection Center',
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 9,
            fillColor: '#dc2626',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 3,
          },
        });

        // Visual Surrounding Road Scanning Radius Circle
        radiusCircleRef.current = new google.maps.Circle({
          map: mapInstance,
          center: { lat: latitude, lng: longitude },
          radius: radiusMeters,
          fillColor: '#3b82f6',
          fillOpacity: 0.1,
          strokeColor: '#2563eb',
          strokeOpacity: 0.8,
          strokeWeight: 2,
        });

        // Click on map to select arbitrary road location in Bengaluru
        mapInstance.addListener('click', async (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          const clickedLat = Number(e.latLng.lat().toFixed(7));
          const clickedLng = Number(e.latLng.lng().toFixed(7));

          // Validate Bengaluru city boundaries (12.70 to 13.25 Lat, 77.35 to 77.85 Lng)
          if (clickedLat < 12.70 || clickedLat > 13.25 || clickedLng < 77.35 || clickedLng > 77.85) {
            setErrorMessage(
              'Selected location is outside Bengaluru city boundaries. The Automated Location Scanner operates exclusively within Bengaluru city.'
            );
            return;
          }

          setErrorMessage(null);
          setLatitude(clickedLat);
          setLongitude(clickedLng);
          setSearchQuery(`Bengaluru Point (${clickedLat}, ${clickedLng})`);

          if (centerMarkerRef.current) {
            centerMarkerRef.current.setPosition({ lat: clickedLat, lng: clickedLng });
          }
          if (radiusCircleRef.current) {
            radiusCircleRef.current.setCenter({ lat: clickedLat, lng: clickedLng });
          }

          // Dynamic reverse-geocode to resolve actual street name for clicked coordinate
          try {
            const revRes = await fetch(`/api/places/reverse?lat=${clickedLat}&lng=${clickedLng}`);
            if (revRes.ok) {
              const revData = await revRes.json();
              if (revData && revData.displayName) {
                setSearchQuery(revData.displayName);
              }
            }
          } catch {
            // keep coordinate label fallback
          }
        });

        mapRef.current = mapInstance;
        setMapLoaded(true);
      } catch (err) {
        console.warn('[AutomatedScanner] Google Maps initialization skipped or failed:', err);
      }
    }

    initMap();
    return () => {
      isMounted = false;
    };
  }, []);

  // Render Bengaluru Road Network Polylines on Google Map
  useEffect(() => {
    if (!mapRef.current || !mapLoaded || !(window as any).google?.maps) return;
    const google = (window as any).google;

    // Clear previous polylines
    roadPolylinesRef.current.forEach((p) => p.setMap(null));
    roadPolylinesRef.current = [];

    bengaluruRoads.forEach((road) => {
      const isSelected = selectedRoad?.id === road.id;
      const color = getRoadStatusColor(road.status);

      const polyline = new google.maps.Polyline({
        path: road.coordinatesPath,
        geodesic: true,
        strokeColor: isSelected ? '#2563eb' : color,
        strokeOpacity: isSelected ? 1.0 : 0.8,
        strokeWeight: isSelected ? 6 : 4,
        map: mapRef.current,
        zIndex: isSelected ? 10 : 2,
      });

      polyline.addListener('click', () => {
        handleSelectRoad(road);
      });

      roadPolylinesRef.current.push(polyline);
    });
  }, [bengaluruRoads, selectedRoad, mapLoaded]);

  // Update Center Marker & Scanning Circle
  useEffect(() => {
    if (mapRef.current && centerMarkerRef.current) {
      const pos = { lat: latitude, lng: longitude };
      centerMarkerRef.current.setPosition(pos);

      if (radiusCircleRef.current) {
        radiusCircleRef.current.setCenter(pos);
        radiusCircleRef.current.setRadius(radiusMeters);
      }
    }
  }, [latitude, longitude, radiusMeters]);

  // Click outside to close autocomplete dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // -------------------------------------------------------------
  // LOCATION SEARCH & AUTOCOMPLETE
  // -------------------------------------------------------------

  const handleSearchInputChange = (val: string) => {
    setSearchQuery(val);
    setShowSuggestions(true);
    setErrorMessage(null);

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    if (val.trim().length < 2) {
      setSuggestions([]);
      setIsSearchingPlaces(false);
      return;
    }

    setIsSearchingPlaces(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const trimmed = val.trim();

        // 1. Manual GPS Coordinates parsing
        const coordMatch = trimmed.match(
          /^[-+]?([1-8]?\d(\.\d+)?|90(\.0+)?),\s*[-+]?(180(\.0+)?|((1[0-7]\d)|([1-9]?\d))(\.\d+)?)$/
        );
        if (coordMatch) {
          const parts = trimmed.split(',').map((s) => parseFloat(s.trim()));
          setSuggestions([
            {
              placeId: `coord_${parts[0].toFixed(5)}_${parts[1].toFixed(5)}`,
              name: `GPS Coordinates (${parts[0].toFixed(5)}, ${parts[1].toFixed(5)})`,
              formattedAddress: `Manual GPS Location: Latitude ${parts[0].toFixed(6)}, Longitude ${parts[1].toFixed(6)}`,
              latitude: parts[0],
              longitude: parts[1],
              isCoordinate: true,
              type: 'coordinate',
            },
          ]);
          setIsSearchingPlaces(false);
          return;
        }

        // 2. Query places autocomplete backend with Bengaluru bias
        const res = await fetch(`/api/places/autocomplete?input=${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data || []);
        }
      } catch (err) {
        console.warn('Autocomplete fetch error:', err);
      } finally {
        setIsSearchingPlaces(false);
      }
    }, 250);
  };

  const handleSelectSuggestion = (s: PlaceSuggestion) => {
    // Validate Bengaluru boundaries (12.70 to 13.25 Lat, 77.35 to 77.85 Lng)
    if (s.latitude < 12.70 || s.latitude > 13.25 || s.longitude < 77.35 || s.longitude > 77.85) {
      setErrorMessage(
        'The selected location is outside Bengaluru city boundaries. The Automated Location Scanner operates exclusively within Bengaluru city.'
      );
      return;
    }

    setErrorMessage(null);
    setSearchQuery(s.formattedAddress || s.name);
    setLatitude(s.latitude);
    setLongitude(s.longitude);
    setShowSuggestions(false);
    setSuggestions([]);

    // Check if matching a road in inventory
    const matched = bengaluruRoads.find(
      (r) =>
        s.name.toLowerCase().includes(r.name.toLowerCase()) ||
        r.name.toLowerCase().includes(s.name.toLowerCase())
    );
    setSelectedRoad(matched || null);

    if (mapRef.current) {
      mapRef.current.panTo({ lat: s.latitude, lng: s.longitude });
      mapRef.current.setZoom(16);
    }
  };

  const handleSelectRoad = (road: BengaluruRoad) => {
    setSelectedRoad(road);
    setSearchQuery(`${road.name}, ${road.locality}`);
    setLatitude(road.centerLat);
    setLongitude(road.centerLng);

    if (mapRef.current) {
      mapRef.current.panTo({ lat: road.centerLat, lng: road.centerLng });
      mapRef.current.setZoom(16);
    }
  };

  const handleUseCurrentLocation = () => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = Number(pos.coords.latitude.toFixed(7));
          const lng = Number(pos.coords.longitude.toFixed(7));
          setLatitude(lat);
          setLongitude(lng);
          setSearchQuery(`Bengaluru GPS Position (${lat}, ${lng})`);
          if (mapRef.current) {
            mapRef.current.panTo({ lat, lng });
            mapRef.current.setZoom(16);
          }
        },
        (err) => {
          setErrorMessage('Could not retrieve browser geolocation: ' + err.message);
        },
        { enableHighAccuracy: true, timeout: 6000 }
      );
    } else {
      setErrorMessage('Geolocation is not supported in this browser environment.');
    }
  };

  // Convert image URL to Base64 with proxy & raw fallback
  const imageToBase64 = async (url: string, rawCdnUrl?: string): Promise<string> => {
    let response: Response | null = null;
    try {
      response = await fetch(url);
      if (!response.ok && rawCdnUrl) {
        response = await fetch(rawCdnUrl);
      }
    } catch {
      if (rawCdnUrl) {
        response = await fetch(rawCdnUrl).catch(() => null);
      }
    }

    if (!response || !response.ok) {
      throw new Error(`Failed to load image from ${url} (HTTP ${response?.status || 'network error'})`);
    }

    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // -------------------------------------------------------------
  // AUTOMATED ROAD SCANNING EXECUTION
  // -------------------------------------------------------------

  const handleStartSurroundingRoadScan = async () => {
    try {
      setShowSuggestions(false);
      setErrorMessage(null);
      setActiveScanSummary(null);
      setSelectedViewpointIdx(0);
      const scanStartTime = Date.now();
      const scanId = `scan_blr_${Date.now()}`;

      // Clear existing viewpoint and hazard markers
      viewpointMarkersRef.current.forEach((m) => m.setMap(null));
      viewpointMarkersRef.current = [];
      hazardMarkersRef.current.forEach((m) => m.setMap(null));
      hazardMarkersRef.current = [];

      // Update selected road status to in_progress
      if (selectedRoad) {
        setBengaluruRoads((prev) =>
          prev.map((r) => (r.id === selectedRoad.id ? { ...r, status: 'in_progress' } : r))
        );
      }

      // STAGE 1: Location Selected
      setCurrentStage('searching');
      setStageProgress(12);
      setStatusMessage(`Target established: Centering map on ${searchQuery} (${radiusMeters}m perimeter)...`);
      await new Promise((r) => setTimeout(r, 350));

      if (mapRef.current) {
        mapRef.current.panTo({ lat: latitude, lng: longitude });
        mapRef.current.setZoom(radiusMeters <= 250 ? 17 : radiusMeters <= 500 ? 16 : 15);
      }

      // STAGE 2: Searching for Road Imagery via KartaView 2.0 API
      setCurrentStage('discovering_imagery');
      setStageProgress(25);
      setStatusMessage(`Querying KartaView 2.0 for authorized street photographs within ${radiusMeters}m...`);

      const exploreRes = await fetch('/api/scanner/explore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude,
          longitude,
          locationName: searchQuery,
          radiusMeters,
          maxViewpoints: 8,
          roadId: selectedRoad?.id,
        }),
      });

      if (!exploreRes.ok) {
        throw new Error(`Imagery discovery service returned HTTP ${exploreRes.status}`);
      }

      const explorationData: ExplorationResult = await exploreRes.json();
      setExploration(explorationData);

      // Handle Zero Imagery Case (Honest reporting: never pretend or invent images)
      if (!explorationData.selectedViewpoints || explorationData.selectedViewpoints.length === 0) {
        setCurrentStage('no_imagery');
        setStageProgress(100);
        setStatusMessage('No authorized road-level imagery is available for this selected area.');

        if (selectedRoad) {
          setBengaluruRoads((prev) =>
            prev.map((r) => (r.id === selectedRoad.id ? { ...r, status: 'imagery_unavailable' } : r))
          );
        }
        return;
      }

      // STAGE 3: Selecting Road Viewpoints
      setCurrentStage('selecting_viewpoints');
      setStageProgress(38);
      const vpCount = explorationData.selectedViewpoints.length;
      setStatusMessage(
        `Selected ${vpCount} diverse road viewpoints (spatial separation >= 15m, heading >= 30°).`
      );
      await new Promise((r) => setTimeout(r, 400));

      // Plot viewpoint markers on Google Map
      if (mapRef.current && (window as any).google?.maps) {
        const google = (window as any).google;
        const bounds = new google.maps.LatLngBounds();
        bounds.extend({ lat: latitude, lng: longitude });

        explorationData.selectedViewpoints.forEach((vp, idx) => {
          const vpPos = { lat: vp.latitude, lng: vp.longitude };
          bounds.extend(vpPos);

          const marker = new google.maps.Marker({
            position: vpPos,
            map: mapRef.current,
            title: `Viewpoint #${idx + 1}: ${vp.sectionName}`,
            icon: {
              path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
              scale: 5.5,
              rotation: vp.heading,
              fillColor: '#2563eb',
              fillOpacity: 0.95,
              strokeColor: '#ffffff',
              strokeWeight: 2,
            },
          });

          marker.addListener('click', () => {
            setSelectedViewpointIdx(idx);
            setActiveTabMobile('viewer');
          });

          viewpointMarkersRef.current.push(marker);
        });

        mapRef.current.fitBounds(bounds, 50);
      }

      // STAGE 4-6: AI Detection & Feedback Gating Verification
      const viewpointResults: ScannedViewpointResult[] = [];
      let totalPotholes = 0;
      let totalCracks = 0;
      let highCount = 0;
      let medCount = 0;
      let lowCount = 0;
      const confidenceScores: number[] = [];
      const allDetectionsToPersist: any[] = [];

      for (let i = 0; i < explorationData.selectedViewpoints.length; i++) {
        const vp = explorationData.selectedViewpoints[i];

        // Highlight current viewpoint marker on map
        viewpointMarkersRef.current.forEach((m, mIdx) => {
          if (mIdx === i && (window as any).google?.maps) {
            const google = (window as any).google;
            m.setIcon({
              path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
              scale: 7.5,
              rotation: vp.heading,
              fillColor: '#06b6d4', // Bright Cyan for Active
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2.5,
            });
          }
        });

        // Stage 4: Running YOLO Detection
        setCurrentStage('analysing_yolo');
        setStageProgress(45 + Math.round((i / vpCount) * 15));
        setStatusMessage(`Running YOLO detection on Viewpoint #${i + 1}/${vpCount}...`);

        const base64DataUrl = await imageToBase64(vp.imageUrl, vp.rawCdnUrl);

        // Stage 5: Running Gemini Vision Verification
        setCurrentStage('running_gemini');
        setStageProgress(60 + Math.round((i / vpCount) * 15));
        setStatusMessage(`Running Gemini verification on Viewpoint #${i + 1}/${vpCount}...`);

        const aiResult = await multiModelFusionService.detectRoadProblems(
          base64DataUrl,
          'image/jpeg',
          'potholes'
        );

        // Stage 6: Applying Feedback Gating (Strict Manhole, Shadow, Vehicle, Reflection Exclusion)
        setCurrentStage('feedback_gating');
        setStageProgress(75 + Math.round((i / vpCount) * 10));
        setStatusMessage(`Applying Feedback Gating & False Alarm Suppression on Viewpoint #${i + 1}/${vpCount}...`);

        let annotatedUrl = '';
        if (aiResult.objects && aiResult.objects.length > 0 && aiResult.objects.some((o) => o.box2d)) {
          try {
            const ann = await imageStorageService.generateAnnotatedImage(base64DataUrl, aiResult.objects, 1280);
            annotatedUrl = ann.dataUrl;
          } catch (e) {
            console.warn('Annotation generation skipped:', e);
          }
        }

        const confirmedPotholes = (aiResult.objects || []).filter(
          (o) => o.type === 'pothole' && o.decisionCategory !== 'rejected_false_positive' && (o.confidence >= 0.65 || !o.decisionCategory)
        );

        const uncertainCandidates = (aiResult.objects || []).filter(
          (o) => o.decisionCategory === 'uncertain_candidate'
        );

        const rejectedFalsePositives = (aiResult.objects || []).filter(
          (o) => o.decisionCategory === 'rejected_false_positive'
        );

        let vpPotholes = confirmedPotholes.length;
        let vpCracks = (aiResult.objects || []).filter((o) => o.type === 'road_crack').length;
        let maxSev: SeverityLevel = 'low';

        confirmedPotholes.forEach((obj) => {
          totalPotholes++;
          if (obj.severity === 'high') {
            highCount++;
            maxSev = 'high';
          } else if (obj.severity === 'medium') {
            medCount++;
            if (maxSev !== 'high') maxSev = 'medium';
          } else {
            lowCount++;
          }
          confidenceScores.push(obj.confidence);

          allDetectionsToPersist.push({
            reportId: `report_${scanId}_${i}`,
            type: obj.type,
            damageClass: obj.damageClass || 'D40',
            damageName: obj.description,
            confidence: obj.confidence,
            severity: obj.severity,
            description: `[Automated Scan] ${obj.description} at ${vp.sectionName}`,
            latitude: vp.latitude,
            longitude: vp.longitude,
            locationName: `${searchQuery} (${vp.sectionName})`,
            imageUrl: vp.imageUrl,
            annotatedImageUrl: annotatedUrl || undefined,
            imageSource: 'automated_location_scan',
            aiEngine: 'roadguard-fusion',
            verificationStatus: 'verified',
            box2d: obj.box2d,
          });

          // Plot hazard marker on map
          if (mapRef.current && (window as any).google?.maps) {
            const google = (window as any).google;
            const hMarker = new google.maps.Marker({
              position: { lat: vp.latitude, lng: vp.longitude },
              map: mapRef.current,
              title: `Confirmed Pothole: ${Math.round(obj.confidence * 100)}% Confidence (${obj.severity.toUpperCase()})`,
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 7,
                fillColor: obj.severity === 'high' ? '#ef4444' : '#f59e0b',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 2,
              },
            });
            hazardMarkersRef.current.push(hMarker);
          }
        });

        viewpointResults.push({
          viewpoint: vp,
          objects: aiResult.objects || [],
          annotatedImageUrl: annotatedUrl || undefined,
          potholesCount: vpPotholes,
          cracksCount: vpCracks,
          maxSeverity: maxSev,
          latencyMs: aiResult.latencyMs || 0,
          confirmedPotholes,
          uncertainCandidates,
          rejectedFalsePositives,
        });

        // Update corresponding section-level coverage record
        if (explorationData.roadSections) {
          const sec = explorationData.roadSections.find(
            (s) => s.sectionId === vp.sectionId || s.roadName === vp.roadName
          );
          if (sec) {
            sec.inspectedImagesCount = (sec.inspectedImagesCount || 0) + 1;
            sec.confirmedPotholesCount = (sec.confirmedPotholesCount || 0) + confirmedPotholes.length;
            sec.uncertainCandidatesCount = (sec.uncertainCandidatesCount || 0) + uncertainCandidates.length;
            sec.rejectedFalsePositivesCount = (sec.rejectedFalsePositivesCount || 0) + rejectedFalsePositives.length;
            sec.inspectionStatus = sec.confirmedPotholesCount > 0 ? 'potholes_detected' : 'inspected_clean';
          }
        }
      }

      // STAGE 7: Saving to MySQL Database & Updating Coverage
      setCurrentStage('saving_mysql');
      setStageProgress(90);
      setStatusMessage('Saving results to MySQL database and updating Bengaluru road network coverage...');

      const totalHazards = totalPotholes + totalCracks;
      const avgConfidence =
        confidenceScores.length > 0
          ? Number((confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length).toFixed(4))
          : 0.92;

      const detectionStatus:
        | 'completed_hazards_detected'
        | 'completed_no_potholes'
        | 'no_imagery'
        | 'failed' =
        totalPotholes > 0 ? 'completed_hazards_detected' : 'completed_no_potholes';

      const scanDurationMs = Date.now() - scanStartTime;
      const finalStatusMessage =
        totalPotholes > 0
          ? `Inspection completed: ${totalPotholes} confirmed pothole(s) detected across ${vpCount} road viewpoints.`
          : 'Inspection completed: No confirmed potholes detected in available inspected images.';

      const summaryObj: ScanSummary = {
        scanId,
        searchLocation: searchQuery,
        roadId: selectedRoad?.id,
        latitude,
        longitude,
        searchRadiusMeters: radiusMeters,
        scanTimestamp: new Date().toISOString(),
        imageryProvider: explorationData.providerUsed,
        imageryCaptureDate: explorationData.selectedViewpoints[0]?.captureDate,
        imageryAgeCategory: explorationData.selectedViewpoints[0]?.ageCategory || 'standard',
        coveragePercentage: explorationData.coveragePercentage,
        imagesAnalyzed: vpCount,
        potholesCount: totalPotholes,
        cracksCount: totalCracks,
        totalHazards,
        highSeverityCount: highCount,
        mediumSeverityCount: medCount,
        lowSeverityCount: lowCount,
        averageConfidence: avgConfidence,
        detectionStatus,
        statusMessage: finalStatusMessage,
        processingDurationMs: scanDurationMs,
        viewpointResults,
        roadSections: explorationData.roadSections,
      };

      setActiveScanSummary(summaryObj);

      // Persist to backend API & MySQL
      await fetch('/api/scanner/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...summaryObj,
          roadId: selectedRoad?.id,
          roadSections: explorationData.roadSections,
          images: viewpointResults.map((vr) => ({
            viewpointId: vr.viewpoint.id,
            sectionName: vr.viewpoint.sectionName,
            latitude: vr.viewpoint.latitude,
            longitude: vr.viewpoint.longitude,
            heading: vr.viewpoint.heading,
            captureDate: vr.viewpoint.captureDate,
            imageUrl: vr.viewpoint.imageUrl,
            annotatedImageUrl: vr.annotatedImageUrl,
            potholesCount: vr.potholesCount,
            maxSeverity: vr.maxSeverity,
          })),
          detections: allDetectionsToPersist,
        }),
      });

      // Synchronize client detection service for Hazard Map and Live History
      for (const d of allDetectionsToPersist) {
        await detectionService.addDetection({
          reportId: d.reportId,
          type: d.type,
          damageClass: d.damageClass,
          damageName: d.damageName,
          confidence: d.confidence,
          severity: d.severity,
          description: d.description,
          latitude: d.latitude,
          longitude: d.longitude,
          locationName: d.locationName,
          imageUrl: d.imageUrl,
          annotatedImageUrl: d.annotatedImageUrl,
          imageSource: 'automated_location_scan',
          aiEngine: 'roadguard-fusion',
          verificationStatus: 'verified',
          box2d: d.box2d,
        });
      }

      // Update Bengaluru Road status in local state
      const finalRoadStatus: RoadStatus = totalPotholes > 0 ? 'potholes_detected' : 'inspected_clean';
      if (selectedRoad) {
        setBengaluruRoads((prev) =>
          prev.map((r) =>
            r.id === selectedRoad.id
              ? {
                  ...r,
                  status: finalRoadStatus,
                  inspectedViewpointsCount: (r.inspectedViewpointsCount || 0) + vpCount,
                  confirmedPotholesCount: (r.confirmedPotholesCount || 0) + totalPotholes,
                  lastScannedAt: new Date().toISOString(),
                }
              : r
          )
        );
      }

      // STAGE 8: Completed
      setCurrentStage('completed');
      setStageProgress(100);
      setStatusMessage(finalStatusMessage);
      fetchScanHistory();
      fetchBengaluruRoads();
    } catch (err: any) {
      console.error('Scan execution error:', err);
      setCurrentStage('error');
      setErrorMessage(err?.message || 'Automated road scan failed.');
      setStatusMessage('Scan interrupted due to an error.');
    }
  };

  // -------------------------------------------------------------
  // VIEWPOINT NAVIGATION (Prev/Next Viewpoint)
  // -------------------------------------------------------------

  const allViewpoints =
    activeScanSummary?.viewpointResults.map((vr) => vr.viewpoint) ||
    exploration?.selectedViewpoints ||
    [];

  const currentViewpoints =
    selectedSectionFilter === 'all'
      ? allViewpoints
      : allViewpoints.filter((vp) => vp.sectionId === selectedSectionFilter);

  const activeViewpoint = currentViewpoints[selectedViewpointIdx];
  const currentVr = activeScanSummary?.viewpointResults.find(
    (vr) => vr.viewpoint.id === activeViewpoint?.id
  );

  const handlePrevViewpoint = () => {
    if (selectedViewpointIdx > 0) {
      const newIdx = selectedViewpointIdx - 1;
      setSelectedViewpointIdx(newIdx);
      updateMapActiveViewpoint(newIdx);
    }
  };

  const handleNextViewpoint = () => {
    if (selectedViewpointIdx < currentViewpoints.length - 1) {
      const newIdx = selectedViewpointIdx + 1;
      setSelectedViewpointIdx(newIdx);
      updateMapActiveViewpoint(newIdx);
    }
  };

  const handleSelectViewpoint = (idx: number) => {
    setSelectedViewpointIdx(idx);
    updateMapActiveViewpoint(idx);
  };

  const updateMapActiveViewpoint = (idx: number) => {
    if (currentViewpoints[idx] && mapRef.current && (window as any).google?.maps) {
      const google = (window as any).google;
      const vp = currentViewpoints[idx];
      mapRef.current.panTo({ lat: vp.latitude, lng: vp.longitude });

      viewpointMarkersRef.current.forEach((m, mIdx) => {
        const isCurrent = mIdx === idx;
        m.setIcon({
          path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: isCurrent ? 7.5 : 5.5,
          rotation: currentViewpoints[mIdx]?.heading || 0,
          fillColor: isCurrent ? '#06b6d4' : '#2563eb',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: isCurrent ? 2.5 : 2,
        });
      });
    }
  };

  // Filter Bengaluru Roads by search text and status
  const filteredRoads = bengaluruRoads.filter((r) => {
    const matchesSearch =
      !roadSearchFilter ||
      r.name.toLowerCase().includes(roadSearchFilter.toLowerCase()) ||
      r.locality.toLowerCase().includes(roadSearchFilter.toLowerCase());

    const matchesCategory =
      selectedCategoryFilter === 'all' || r.category === selectedCategoryFilter;

    const matchesStatus =
      selectedRoadStatusFilter === 'all' || r.status === selectedRoadStatusFilter;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  // -------------------------------------------------------------
  // RENDER: Three-Panel Layout
  // -------------------------------------------------------------

  return (
    <div className="space-y-4 max-w-[1700px] mx-auto pb-12">
      {/* Top Banner: Bengaluru City Scope & Real-time Coverage Metrics */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-4 sm:p-5 shadow-lg border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-blue-600/30 text-blue-400 font-black text-[10px] tracking-wider uppercase border border-blue-500/40">
                Bengaluru City Exclusive
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-600/30 text-emerald-400 font-bold text-[10px] border border-emerald-500/40 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>KartaView 2.0 Live API</span>
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2.5">
              <span>Automated Location Scanner</span>
              <span className="text-xs font-medium text-slate-400 px-2 py-0.5 rounded-lg bg-slate-800/80">
                Phase 2
              </span>
            </h1>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Explore any road in Bengaluru, navigate through street-level road photographs, and automatically inspect for structural potholes using Multi-Model AI (YOLO + Gemini + Feedback Gating).
            </p>
          </div>

          {/* Quick Metrics & Road Counters (Requirement #4: Mapped, Imagery, Retrieved, Inspected, Clean, Potholes, Insufficient, Pending) */}
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 overflow-x-auto pb-1 md:pb-0 shrink-0">
            <div className="px-2.5 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/80 text-center min-w-[62px]">
              <span className="text-[9px] text-slate-400 block font-bold uppercase">Mapped</span>
              <span className="text-xs sm:text-sm font-black text-white">{bengaluruRoads.length}</span>
            </div>
            <div className="px-2.5 py-1.5 rounded-xl bg-blue-950/60 border border-blue-800/60 text-center min-w-[62px]">
              <span className="text-[9px] text-blue-400 block font-bold uppercase">Imagery</span>
              <span className="text-xs sm:text-sm font-black text-blue-300">
                {bengaluruRoads.filter((r) => r.status === 'imagery_available' || r.availableViewpointsCount > 0).length}
              </span>
            </div>
            <div className="px-2.5 py-1.5 rounded-xl bg-indigo-950/60 border border-indigo-800/60 text-center min-w-[62px]">
              <span className="text-[9px] text-indigo-400 block font-bold uppercase">Retrieved</span>
              <span className="text-xs sm:text-sm font-black text-indigo-300">
                {bengaluruRoads.reduce((sum, r) => sum + (r.availableViewpointsCount || 0), 0)}
              </span>
            </div>
            <div className="px-2.5 py-1.5 rounded-xl bg-cyan-950/60 border border-cyan-800/60 text-center min-w-[62px]">
              <span className="text-[9px] text-cyan-400 block font-bold uppercase">Inspected</span>
              <span className="text-xs sm:text-sm font-black text-cyan-300">
                {bengaluruRoads.reduce((sum, r) => sum + (r.inspectedViewpointsCount || 0), 0)}
              </span>
            </div>
            <div className="px-2.5 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-800/60 text-center min-w-[62px]">
              <span className="text-[9px] text-emerald-400 block font-bold uppercase">Clean</span>
              <span className="text-xs sm:text-sm font-black text-emerald-300">
                {bengaluruRoads.filter((r) => r.status === 'inspected_clean').length}
              </span>
            </div>
            <div className="px-2.5 py-1.5 rounded-xl bg-rose-950/60 border border-rose-800/60 text-center min-w-[62px]">
              <span className="text-[9px] text-rose-400 block font-bold uppercase">Potholes</span>
              <span className="text-xs sm:text-sm font-black text-rose-300">
                {bengaluruRoads.reduce((sum, r) => sum + (r.confirmedPotholesCount || 0), 0)}
              </span>
            </div>
            <div className="px-2.5 py-1.5 rounded-xl bg-orange-950/60 border border-orange-800/60 text-center min-w-[62px]">
              <span className="text-[9px] text-orange-400 block font-bold uppercase">Sparse / None</span>
              <span className="text-xs sm:text-sm font-black text-orange-300">
                {bengaluruRoads.filter((r) => r.status === 'imagery_unavailable' || r.availableViewpointsCount <= 1).length}
              </span>
            </div>
            <div className="px-2.5 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/80 text-center min-w-[62px]">
              <span className="text-[9px] text-slate-400 block font-bold uppercase">Pending</span>
              <span className="text-xs sm:text-sm font-black text-slate-300">
                {bengaluruRoads.filter((r) => r.status === 'not_inspected').length}
              </span>
            </div>
          </div>
        </div>

        {/* Stepped Progress Tracker (when scanning) */}
        {currentStage !== 'idle' && (
          <div className="mt-4 pt-4 border-t border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-300">
              <span className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    currentStage === 'completed'
                      ? 'bg-emerald-400'
                      : currentStage === 'error'
                      ? 'bg-rose-500'
                      : currentStage === 'no_imagery'
                      ? 'bg-amber-400'
                      : 'bg-cyan-400 animate-pulse'
                  }`}
                />
                <span className="uppercase text-white font-black">
                  {currentStage === 'searching' && 'Stage 1/8: Location Centered'}
                  {currentStage === 'discovering_imagery' && 'Stage 2/8: Querying KartaView 2.0 API'}
                  {currentStage === 'selecting_viewpoints' && 'Stage 3/8: Selecting Distinct Viewpoints'}
                  {currentStage === 'analysing_yolo' && 'Stage 4/8: High-Resolution YOLO Inference'}
                  {currentStage === 'running_gemini' && 'Stage 5/8: Gemini Vision Verification'}
                  {currentStage === 'feedback_gating' && 'Stage 6/8: Applying Feedback Gating'}
                  {currentStage === 'saving_mysql' && 'Stage 7/8: Persisting Records to MySQL'}
                  {currentStage === 'completed' && 'Stage 8/8: Automated Scan Complete'}
                  {currentStage === 'no_imagery' && 'Coverage Notice: No Imagery in Radius'}
                  {currentStage === 'error' && 'Scan Error'}
                </span>
                <span className="text-slate-400 font-medium hidden sm:inline">— {statusMessage}</span>
              </span>
              <span className="font-mono text-cyan-400 font-bold">{stageProgress}%</span>
            </div>

            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <motion.div
                className={`h-full ${
                  currentStage === 'error'
                    ? 'bg-rose-500'
                    : currentStage === 'no_imagery'
                    ? 'bg-amber-500'
                    : 'bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400'
                }`}
                initial={{ width: 0 }}
                animate={{ width: `${stageProgress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Mobile Tab Selector */}
      <div className="flex lg:hidden bg-slate-100 p-1 rounded-2xl border border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTabMobile('search')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTabMobile === 'search' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600'
          }`}
        >
          Search & Roads
        </button>
        <button
          type="button"
          onClick={() => setActiveTabMobile('map')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTabMobile === 'map' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600'
          }`}
        >
          Interactive Map
        </button>
        <button
          type="button"
          onClick={() => setActiveTabMobile('viewer')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTabMobile === 'viewer' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600'
          }`}
        >
          Photo & AI Results ({currentViewpoints.length})
        </button>
      </div>

      {/* ========================================================= */}
      {/* THREE-PANEL DESKTOP LAYOUT                                */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* ======================================================= */}
        {/* LEFT PANEL: Search, Filters & Bengaluru Road Selection  */}
        {/* ======================================================= */}
        <div
          className={`lg:col-span-3 space-y-4 ${
            activeTabMobile !== 'search' ? 'hidden lg:block' : 'block'
          }`}
        >
          {/* Location Search Bar & Controls */}
          <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-800">
              <span className="flex items-center gap-1.5">
                <Search className="w-4 h-4 text-blue-600" />
                <span>Search Location or Coordinates</span>
              </span>
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                title="Use current GPS position"
                className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-1 font-bold"
              >
                <Crosshair className="w-3.5 h-3.5" />
                <span>My GPS</span>
              </button>
            </div>

            {/* Input with Dropdown Autocomplete */}
            <div ref={searchContainerRef} className="relative">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchInputChange(e.target.value)}
                  onFocus={() => setShowSuggestions(suggestions.length > 0)}
                  placeholder="e.g. MG Road, Peenya 2nd Main, Hebbal, 560001..."
                  className="w-full pl-9 pr-9 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-xs"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                {isSearchingPlaces ? (
                  <Loader2 className="w-4 h-4 text-blue-500 animate-spin absolute right-3 top-3" />
                ) : (
                  searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )
                )}
              </div>

              {/* Suggestions Dropdown */}
              <AnimatePresence>
                {showSuggestions && suggestions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="absolute z-50 left-0 right-0 top-full mt-1.5 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden max-h-56 overflow-y-auto"
                  >
                    {suggestions.map((s) => (
                      <button
                        key={s.placeId}
                        type="button"
                        onClick={() => handleSelectSuggestion(s)}
                        className="w-full text-left px-3.5 py-2 hover:bg-blue-50 transition-colors flex items-start gap-2.5 group"
                      >
                        <MapPin className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-slate-800 group-hover:text-blue-700 truncate">
                            {s.name}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">{s.formattedAddress}</div>
                        </div>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Manual Lat / Lng Coordinates Bar */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">Latitude</span>
                <input
                  type="number"
                  step="0.0000001"
                  value={latitude}
                  onChange={(e) => setLatitude(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-mono text-[11px] font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">Longitude</span>
                <input
                  type="number"
                  step="0.0000001"
                  value={longitude}
                  onChange={(e) => setLongitude(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-mono text-[11px] font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Scan Radius Selector (250m, 500m, 1km, 2km, 5km, Custom) */}
            <div className="pt-1">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">
                  Scan Radius Perimeter
                </span>
                <span className="text-[10px] font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                  {radiusMeters >= 1000 ? `${(radiusMeters / 1000).toFixed(1)} km` : `${radiusMeters} m`}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5 mb-2">
                {[
                  { label: '250 m', val: 250 },
                  { label: '500 m', val: 500 },
                  { label: '1 km', val: 1000 },
                  { label: '2 km', val: 2000 },
                  { label: '5 km', val: 5000 },
                  { label: 'Custom', val: -1 },
                ].map((r) => {
                  const isSelected = r.val === -1 ? isCustomRadius : (!isCustomRadius && radiusMeters === r.val);
                  return (
                    <button
                      key={r.label}
                      type="button"
                      onClick={() => {
                        if (r.val === -1) {
                          setIsCustomRadius(true);
                        } else {
                          setIsCustomRadius(false);
                          setRadiusMeters(r.val);
                        }
                      }}
                      disabled={
                        currentStage !== 'idle' &&
                        currentStage !== 'completed' &&
                        currentStage !== 'error' &&
                        currentStage !== 'no_imagery'
                      }
                      className={`py-1.5 px-2 rounded-xl text-xs font-bold transition-all text-center ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/80'
                      }`}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>

              {/* Custom Radius Input */}
              {isCustomRadius && (
                <div className="flex items-center gap-2 p-2 rounded-xl bg-blue-50/70 border border-blue-200 mb-1">
                  <span className="text-[11px] font-bold text-blue-900 shrink-0">Radius (m):</span>
                  <input
                    type="number"
                    min="50"
                    max="10000"
                    step="50"
                    value={customRadiusValue}
                    onChange={(e) => {
                      setCustomRadiusValue(e.target.value);
                      const parsed = parseInt(e.target.value, 10);
                      if (!isNaN(parsed) && parsed >= 50 && parsed <= 15000) {
                        setRadiusMeters(parsed);
                      }
                    }}
                    placeholder="e.g. 750, 1500, 3000"
                    className="w-full px-2.5 py-1 rounded-lg bg-white border border-blue-300 text-blue-950 font-mono text-xs font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <span className="text-[10px] text-blue-700 font-bold shrink-0">meters</span>
                </div>
              )}
            </div>

            {/* Action Button: Start Automated Road Scan */}
            <motion.button
              {...buttonPressProps}
              onClick={handleStartSurroundingRoadScan}
              disabled={
                currentStage !== 'idle' &&
                currentStage !== 'completed' &&
                currentStage !== 'error' &&
                currentStage !== 'no_imagery'
              }
              className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-800 text-white font-black text-xs shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Compass
                className={`w-4 h-4 ${
                  currentStage !== 'idle' &&
                  currentStage !== 'completed' &&
                  currentStage !== 'error' &&
                  currentStage !== 'no_imagery'
                    ? 'animate-spin'
                    : ''
                }`}
              />
              <span>START AUTOMATED ROAD SCAN</span>
            </motion.button>
          </div>

          {/* Bengaluru Road Coverage Inventory List */}
          <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                <MapIcon className="w-3.5 h-3.5 text-blue-600" />
                <span>Bengaluru Roads ({filteredRoads.length})</span>
              </span>
              <span className="text-[10px] text-slate-400 font-bold">OSM Network</span>
            </div>

            {/* Filter Search Input */}
            <div className="relative">
              <input
                type="text"
                value={roadSearchFilter}
                onChange={(e) => setRoadSearchFilter(e.target.value)}
                placeholder="Filter roads or localities..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
            </div>

            {/* Status Filter Pills */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[10px]">
              {[
                { id: 'all', label: 'All' },
                { id: 'imagery_available', label: 'With Imagery' },
                { id: 'inspected_clean', label: 'Clean' },
                { id: 'potholes_detected', label: 'Potholes' },
                { id: 'not_inspected', label: 'Uninspected' },
              ].map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setSelectedRoadStatusFilter(pill.id)}
                  className={`px-2 py-0.5 rounded-lg whitespace-nowrap font-bold transition-all ${
                    selectedRoadStatusFilter === pill.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            {/* Road Items Scrollable List */}
            <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
              {filteredRoads.map((road) => {
                const isSelected = selectedRoad?.id === road.id;
                const statusColor = getRoadStatusColor(road.status);

                return (
                  <button
                    key={road.id}
                    type="button"
                    onClick={() => handleSelectRoad(road)}
                    className={`w-full text-left p-2.5 rounded-2xl border transition-all text-xs ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/70 shadow-xs ring-1 ring-blue-500/20'
                        : 'border-slate-200/80 bg-slate-50/60 hover:bg-slate-100/80 text-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <span className="font-extrabold text-slate-900 truncate block">
                        {road.name}
                      </span>
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 mt-1"
                        style={{ backgroundColor: statusColor }}
                        title={getRoadStatusLabel(road.status)}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1">
                      <span className="truncate">{road.locality}</span>
                      <span className="font-mono text-slate-400 shrink-0">
                        {road.lengthMeters}m
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-1.5 text-[9px] font-bold">
                      <span
                        className="px-1.5 py-0.2 rounded-md"
                        style={{
                          backgroundColor: `${statusColor}18`,
                          color: statusColor,
                        }}
                      >
                        {getRoadStatusLabel(road.status)}
                      </span>
                      {road.availableViewpointsCount > 0 && (
                        <span className="text-slate-400 font-mono">
                          {road.availableViewpointsCount} Photos
                        </span>
                      )}
                      {road.confirmedPotholesCount > 0 && (
                        <span className="text-rose-600 font-bold">
                          {road.confirmedPotholesCount} Potholes
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ======================================================= */}
        {/* CENTER PANEL: Interactive Google Map & Road Network     */}
        {/* ======================================================= */}
        <div
          className={`lg:col-span-5 space-y-3 ${
            activeTabMobile !== 'map' ? 'hidden lg:block' : 'block'
          }`}
        >
          {(() => {
            const discoveredSections: RoadSectionCoverage[] =
              activeScanSummary?.roadSections || exploration?.roadSections || [];

            return (
              <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-200/80 space-y-3">
                {/* Center Panel Header with Map / Section Coverage Toggle */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs font-bold text-slate-800 gap-2 border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <MapIcon className="w-4 h-4 text-blue-600" />
                    <span>Bengaluru Interactive Road Map</span>
                    {selectedRoad && (
                      <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 truncate max-w-[160px]">
                        {selectedRoad.name}
                      </span>
                    )}
                  </div>

                  {/* Toggle: Map View vs Section Coverage Table */}
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0">
                    <button
                      type="button"
                      onClick={() => setCenterPanelView('map')}
                      className={`py-1 px-2.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all ${
                        centerPanelView === 'map'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <MapIcon className="w-3.5 h-3.5" />
                      <span>Road Map</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCenterPanelView('sections')}
                      className={`py-1 px-2.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all ${
                        centerPanelView === 'sections'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Section Coverage ({discoveredSections.length})</span>
                    </button>
                  </div>
                </div>

                {/* VIEW 1: MAP VIEW */}
                {centerPanelView === 'map' ? (
                  <>
                    {/* Google Maps Container */}
                    <div className="w-full h-[500px] rounded-2xl overflow-hidden border border-slate-200 relative bg-slate-100">
                      <div ref={mapContainerRef} className="w-full h-full" />

                      {!mapLoaded && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-xs text-white text-xs gap-2">
                          <Compass className="w-6 h-6 animate-spin text-cyan-400" />
                          <span>Loading Bengaluru Road Map...</span>
                        </div>
                      )}

                      {/* In-Map Viewpoint Navigator Overlay (if viewpoints discovered) */}
                      {currentViewpoints.length > 0 && (
                        <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-slate-200 shadow-md flex items-center gap-2 text-xs font-bold text-slate-800">
                          <Camera className="w-3.5 h-3.5 text-blue-600" />
                          <span>
                            Viewpoint {selectedViewpointIdx + 1} of {currentViewpoints.length}
                          </span>
                          <div className="flex items-center gap-1 ml-2">
                            <button
                              type="button"
                              onClick={handlePrevViewpoint}
                              disabled={selectedViewpointIdx === 0}
                              className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={handleNextViewpoint}
                              disabled={selectedViewpointIdx === currentViewpoints.length - 1}
                              className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Quick Discovered Sections Bar (if sections found in radius) */}
                    {discoveredSections.length > 0 && (
                      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-extrabold text-slate-800 flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5 text-blue-600" />
                            <span>Discovered Road Sections in {radiusMeters >= 1000 ? `${(radiusMeters/1000).toFixed(1)} km` : `${radiusMeters} m`} Perimeter ({discoveredSections.length})</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setCenterPanelView('sections')}
                            className="text-blue-600 hover:text-blue-800 font-bold text-[11px] flex items-center gap-1"
                          >
                            <span>View Full Table</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {discoveredSections.map((sec) => (
                            <div
                              key={sec.sectionId}
                              className="p-2.5 rounded-xl bg-white border border-slate-200/80 text-xs shadow-2xs space-y-1 hover:border-blue-300 transition-all cursor-pointer"
                              onClick={() => {
                                setSelectedSectionFilter(sec.sectionId);
                                setSelectedViewpointIdx(0);
                                if (mapRef.current) {
                                  mapRef.current.panTo({
                                    lat: sec.centerCoordinates.latitude,
                                    lng: sec.centerCoordinates.longitude,
                                  });
                                }
                              }}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-extrabold text-slate-900 truncate max-w-[190px]">
                                  {sec.roadName}
                                </span>
                                <span
                                  className="px-1.5 py-0.5 rounded-md text-[9px] font-bold"
                                  style={{
                                    backgroundColor: `${getRoadStatusColor(sec.inspectionStatus as any)}18`,
                                    color: getRoadStatusColor(sec.inspectionStatus as any),
                                  }}
                                >
                                  {getRoadStatusLabel(sec.inspectionStatus as any)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-slate-500">
                                <span>{sec.availableImagesCount} Photos Available</span>
                                <span className="font-bold text-blue-600">
                                  {sec.inspectedImagesCount} Viewpoints Inspected
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Coverage Colors Legend Bar (Requirement #8) */}
                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80 text-[11px] space-y-1.5">
                      <span className="font-extrabold text-slate-800 text-[10px] uppercase block">
                        Road Network Coverage Legend
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <span className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-md bg-slate-500 shrink-0" />
                          <span className="text-slate-600">Grey: Not Inspected</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-md bg-blue-600 shrink-0" />
                          <span className="text-slate-600">Blue: Imagery Available</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-md bg-yellow-500 shrink-0" />
                          <span className="text-slate-600">Yellow: In Progress</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-md bg-emerald-500 shrink-0" />
                          <span className="text-slate-600">Green: Clean (0 Defects)</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-md bg-rose-500 shrink-0" />
                          <span className="text-slate-600">Red: Potholes Detected</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-md bg-orange-500 shrink-0" />
                          <span className="text-slate-600">Orange: No Imagery</span>
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  /* VIEW 2: ROAD SECTION COVERAGE SUMMARY TABLE / CARDS */
                  <div className="space-y-4">
                    {/* Header & Metrics Summary */}
                    <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200 text-xs space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider block">
                            Spatial Perimeter Coverage Analysis
                          </span>
                          <h4 className="text-sm font-black text-blue-950">
                            Road Sections in {radiusMeters >= 1000 ? `${(radiusMeters/1000).toFixed(1)} km` : `${radiusMeters} m`} Radius
                          </h4>
                        </div>
                        <span className="px-2.5 py-1 rounded-full bg-blue-600 text-white font-black text-[11px] self-start sm:self-auto">
                          {discoveredSections.length} Road Section{discoveredSections.length !== 1 ? 's' : ''} Identified
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-1">
                        <div className="p-2 rounded-xl bg-white border border-blue-100">
                          <span className="text-[10px] text-slate-500 font-bold block uppercase">Sections</span>
                          <span className="text-base font-black text-slate-800">{discoveredSections.length}</span>
                        </div>
                        <div className="p-2 rounded-xl bg-white border border-blue-100">
                          <span className="text-[10px] text-slate-500 font-bold block uppercase">Photos Found</span>
                          <span className="text-base font-black text-blue-600">
                            {discoveredSections.reduce((acc, s) => acc + s.availableImagesCount, 0)}
                          </span>
                        </div>
                        <div className="p-2 rounded-xl bg-white border border-blue-100">
                          <span className="text-[10px] text-slate-500 font-bold block uppercase">Viewpoints Inspected</span>
                          <span className="text-base font-black text-indigo-600">
                            {discoveredSections.reduce((acc, s) => acc + s.inspectedImagesCount, 0)}
                          </span>
                        </div>
                        <div className="p-2 rounded-xl bg-white border border-blue-100">
                          <span className="text-[10px] text-slate-500 font-bold block uppercase">Confirmed Potholes</span>
                          <span className="text-base font-black text-rose-600">
                            {discoveredSections.reduce((acc, s) => acc + (s.confirmedPotholesCount || 0), 0)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Section Filter Pills */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                      <span className="text-[11px] font-bold text-slate-500 shrink-0">Filter:</span>
                      <button
                        type="button"
                        onClick={() => setSelectedSectionFilter('all')}
                        className={`py-1 px-2.5 rounded-xl font-bold text-[11px] shrink-0 transition-all ${
                          selectedSectionFilter === 'all'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        All Sections ({discoveredSections.length})
                      </button>
                      {discoveredSections.map((sec) => (
                        <button
                          key={sec.sectionId}
                          type="button"
                          onClick={() => setSelectedSectionFilter(sec.sectionId)}
                          className={`py-1 px-2.5 rounded-xl font-bold text-[11px] shrink-0 transition-all ${
                            selectedSectionFilter === sec.sectionId
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {sec.roadName.split(',')[0]}
                        </button>
                      ))}
                    </div>

                    {/* Discovered Road Section Detailed Cards */}
                    <div className="space-y-3">
                      {discoveredSections
                        .filter(
                          (sec) => selectedSectionFilter === 'all' || sec.sectionId === selectedSectionFilter
                        )
                        .map((sec, sIdx) => {
                          const statusColor = getRoadStatusColor(sec.inspectionStatus as any);
                          return (
                            <div
                              key={sec.sectionId}
                              className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-2.5 hover:border-blue-300 transition-all"
                            >
                              {/* Section Title & Status Badge */}
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-slate-100 pb-2">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-black text-[11px] flex items-center justify-center">
                                      {sIdx + 1}
                                    </span>
                                    <h4 className="text-xs sm:text-sm font-black text-slate-900">
                                      {sec.roadName}
                                    </h4>
                                  </div>
                                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400 font-mono">
                                    <span>Section ID: {sec.sectionId}</span>
                                    <span>•</span>
                                    <span>{sec.distanceMetersFromCenter}m from search center</span>
                                    {sec.locality && (
                                      <>
                                        <span>•</span>
                                        <span>{sec.locality}</span>
                                      </>
                                    )}
                                  </div>
                                </div>

                                <span
                                  className="px-2 py-0.5 rounded-md text-[10px] font-bold self-start sm:self-auto"
                                  style={{
                                    backgroundColor: `${statusColor}18`,
                                    color: statusColor,
                                  }}
                                >
                                  {getRoadStatusLabel(sec.inspectionStatus as any)}
                                </span>
                              </div>

                              {/* Section Metrics Grid */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                                <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                                  <span className="text-[9px] text-slate-400 font-bold block uppercase">
                                    Available Images
                                  </span>
                                  <span className="text-sm font-black text-slate-800">
                                    {sec.availableImagesCount} Photos
                                  </span>
                                </div>
                                <div className="p-2 rounded-xl bg-indigo-50/70 border border-indigo-100">
                                  <span className="text-[9px] text-indigo-500 font-bold block uppercase">
                                    Inspected Viewpoints
                                  </span>
                                  <span className="text-sm font-black text-indigo-700">
                                    {sec.inspectedImagesCount} Viewpoints
                                  </span>
                                </div>
                                <div className="p-2 rounded-xl bg-rose-50/70 border border-rose-100">
                                  <span className="text-[9px] text-rose-500 font-bold block uppercase">
                                    Confirmed Potholes
                                  </span>
                                  <span className="text-sm font-black text-rose-700">
                                    {sec.confirmedPotholesCount || 0}
                                  </span>
                                </div>
                                <div className="p-2 rounded-xl bg-amber-50/70 border border-amber-100">
                                  <span className="text-[9px] text-amber-500 font-bold block uppercase">
                                    Uncertain / Excluded
                                  </span>
                                  <span className="text-sm font-black text-amber-700">
                                    {sec.uncertainCandidatesCount || 0} / {sec.rejectedFalsePositivesCount || 0}
                                  </span>
                                </div>
                              </div>

                              {/* Capture Dates & Age Information */}
                              <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500 pt-1">
                                <div className="flex items-center gap-1.5">
                                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                  <span>
                                    {sec.captureDates && sec.captureDates.length > 0
                                      ? `Capture Range: ${sec.earliestCaptureDate || sec.captureDates[0]} to ${sec.latestCaptureDate || sec.captureDates[sec.captureDates.length - 1]}`
                                      : 'No date metadata available'}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2">
                                  <span className="px-2 py-0.5 rounded-full bg-slate-100 font-bold text-slate-600">
                                    {sec.ageDescription || sec.ageCategory}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedSectionFilter(sec.sectionId);
                                      setSelectedViewpointIdx(0);
                                      setActiveTabMobile('viewer');
                                    }}
                                    className="py-1 px-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] flex items-center gap-1 transition-all"
                                  >
                                    <Eye className="w-3 h-3" />
                                    <span>Inspect Photos ({sec.inspectedImagesCount})</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* ======================================================= */}
        {/* RIGHT PANEL: Road Photograph Viewer & AI Inspection     */}
        {/* ======================================================= */}
        <div
          className={`lg:col-span-4 space-y-4 ${
            activeTabMobile !== 'viewer' ? 'hidden lg:block' : 'block'
          }`}
        >
          <div className="bg-white rounded-3xl p-4 sm:p-5 shadow-sm border border-slate-200/80 space-y-4">
            {/* Header with Viewpoint Navigation & Mode Toggle */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Street Viewpoint Inspection
                  </span>
                  {selectedSectionFilter !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setSelectedSectionFilter('all')}
                      className="px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-700 text-[9px] font-bold flex items-center gap-0.5 hover:bg-blue-200 transition-all"
                    >
                      <span>Filtered Section</span>
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
                <h3 className="text-sm sm:text-base font-black text-slate-900 truncate max-w-[280px]">
                  {activeViewpoint ? activeViewpoint.sectionName : 'No Viewpoint Selected'}
                </h3>
              </div>

              {/* AI Annotated vs Original Image Toggle */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveImageView('annotated')}
                  className={`py-1 px-2.5 rounded-lg text-[11px] font-bold transition-all ${
                    activeImageView === 'annotated'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  AI Annotated
                </button>
                <button
                  type="button"
                  onClick={() => setActiveImageView('original')}
                  className={`py-1 px-2.5 rounded-lg text-[11px] font-bold transition-all ${
                    activeImageView === 'original'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Original Photo
                </button>
              </div>
            </div>

            {/* Large Image Viewer Container */}
            {activeViewpoint ? (
              <div className="space-y-3">
                <div className="relative aspect-video max-h-[380px] w-full rounded-2xl overflow-hidden border-2 border-slate-200 bg-slate-950 flex items-center justify-center">
                  <img
                    src={
                      activeImageView === 'annotated' && currentVr?.annotatedImageUrl
                        ? currentVr.annotatedImageUrl
                        : activeViewpoint.imageUrl
                    }
                    alt={activeViewpoint.sectionName}
                    className="w-full h-full object-contain"
                  />

                  {/* Top-left Indicator */}
                  <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md text-[10px] font-mono text-white flex items-center gap-1.5">
                    <Eye className="w-3 h-3 text-cyan-400" />
                    <span>
                      {activeImageView === 'annotated' && currentVr?.annotatedImageUrl
                        ? 'AI Bounding Boxes'
                        : 'Original Camera Feed'}
                    </span>
                  </div>

                  {/* Bottom-right Metadata */}
                  <div className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md text-[10px] font-mono text-white">
                    {activeViewpoint.heading}° {activeViewpoint.heading ? 'Compass' : ''} • Captured {activeViewpoint.captureDate}
                  </div>
                </div>

                {/* Viewpoint Navigation Buttons (Prev / Next) */}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handlePrevViewpoint}
                    disabled={selectedViewpointIdx === 0}
                    className="flex-1 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Previous Viewpoint</span>
                  </button>

                  <span className="text-xs font-mono font-bold text-slate-500 shrink-0 px-2">
                    {selectedViewpointIdx + 1} / {currentViewpoints.length}
                  </span>

                  <button
                    type="button"
                    onClick={handleNextViewpoint}
                    disabled={selectedViewpointIdx === currentViewpoints.length - 1}
                    className="flex-1 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-40"
                  >
                    <span>Next Viewpoint</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Viewpoint Metadata Badges */}
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80 text-xs space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                    <span className="font-extrabold text-slate-800">
                      Photo ID: {activeViewpoint.id}
                    </span>
                    <span className="font-mono text-slate-500">
                      {activeViewpoint.latitude.toFixed(6)}°, {activeViewpoint.longitude.toFixed(6)}°
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[10px]">
                    {activeViewpoint.sequenceId && (
                      <span className="px-2 py-0.5 rounded-md bg-slate-200 font-bold text-slate-700">
                        Track Seq #{activeViewpoint.sequenceId}
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 font-bold">
                      {activeViewpoint.providerAttribution}
                    </span>
                    <span className="text-slate-500">{activeViewpoint.ageDescription}</span>
                  </div>
                </div>

                {/* Detection Results Breakdown (Requirement #6: Confirmed vs Uncertain vs Excluded) */}
                {currentVr ? (
                  <div className="space-y-2.5 pt-1">
                    {/* Metrics Bar */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 rounded-xl bg-rose-50 border border-rose-200">
                        <span className="text-[10px] text-rose-600 font-bold block uppercase">
                          Confirmed
                        </span>
                        <span className="text-base font-black text-rose-700">
                          {currentVr.confirmedPotholes.length}
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-amber-50 border border-amber-200">
                        <span className="text-[10px] text-amber-600 font-bold block uppercase">
                          Uncertain
                        </span>
                        <span className="text-base font-black text-amber-700">
                          {currentVr.uncertainCandidates.length}
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-100 border border-slate-200">
                        <span className="text-[10px] text-slate-600 font-bold block uppercase">
                          Excluded
                        </span>
                        <span className="text-base font-black text-slate-700">
                          {currentVr.rejectedFalsePositives.length}
                        </span>
                      </div>
                    </div>

                    {/* Confirmed Potholes List */}
                    {currentVr.confirmedPotholes.length > 0 ? (
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-black uppercase text-rose-700 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Confirmed Potholes Detected</span>
                        </span>
                        {currentVr.confirmedPotholes.map((obj, oIdx) => (
                          <div
                            key={oIdx}
                            className="p-2.5 rounded-xl bg-white border border-rose-200 text-xs shadow-2xs space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-extrabold text-rose-800 uppercase text-[11px]">
                                {obj.damageClass || 'D40'}: Pothole
                              </span>
                              <span className="font-mono text-emerald-600 font-bold text-[11px]">
                                {Math.round(obj.confidence * 100)}% Conf
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600">{obj.description}</p>
                            <span className="inline-block px-1.5 py-0.2 rounded-md bg-rose-100 text-rose-800 text-[10px] font-bold uppercase">
                              Severity: {obj.severity}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      /* Empty State: Clean Road */
                      <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs space-y-1">
                        <div className="flex items-center gap-1.5 font-extrabold text-emerald-800">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>No confirmed potholes detected in this inspected image.</span>
                        </div>
                        <p className="text-[11px] text-emerald-700">
                          The road surface in this viewpoint exhibits intact asphalt aggregate without structural depression or broken rims.
                        </p>
                      </div>
                    )}

                    {/* Uncertain Candidates (Requirement #6 & #7) */}
                    {currentVr.uncertainCandidates.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-black uppercase text-amber-700 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>Uncertain Candidates (Requires Review)</span>
                        </span>
                        {currentVr.uncertainCandidates.map((cand, cIdx) => (
                          <div
                            key={cIdx}
                            className="p-2 rounded-xl bg-amber-50/70 border border-amber-200 text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-amber-900">
                                Candidate #{cIdx + 1}
                              </span>
                              <span className="text-amber-700 font-mono text-[11px]">
                                {Math.round(cand.confidence * 100)}% Conf
                              </span>
                            </div>
                            <p className="text-[11px] text-amber-800">{cand.description}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Excluded False Positives (Requirement #6) */}
                    {currentVr.rejectedFalsePositives.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase text-slate-500">
                          Excluded False Positives (Feedback Gating)
                        </span>
                        {currentVr.rejectedFalsePositives.map((rej, rIdx) => (
                          <div
                            key={rIdx}
                            className="p-2 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-0.5"
                          >
                            <span className="font-bold text-slate-700 block">
                              {rej.exclusionRuleMatched || 'Rule Gated'}: {rej.exclusionReason}
                            </span>
                            <span className="text-[10px] text-slate-400 block truncate">
                              Candidate description: {rej.description}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 text-xs text-center">
                    <p className="font-bold">Ready for Automated AI Inspection</p>
                    <p className="text-[11px] text-blue-700 mt-0.5">
                      Click "Start Automated Road Scan" in the left panel to execute YOLO + Gemini detection on this street photograph.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              /* No Viewpoint Selected State */
              <div className="p-8 rounded-2xl bg-slate-50 border border-dashed border-slate-300 text-center text-slate-400 space-y-2">
                <Camera className="w-8 h-8 mx-auto text-slate-300" />
                <p className="text-xs font-bold text-slate-600">No Road Viewpoint Selected</p>
                <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                  Select a road from the left panel or click any viewpoint marker on the Bengaluru map to inspect street photographs.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
