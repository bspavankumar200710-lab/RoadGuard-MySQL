import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { RoadHazardRecord, HazardType, SeverityLevel } from '../types/detection';
import { loadGoogleMaps, onGoogleMapsAuthFailure } from '../services/googleMapsService';
import {
  Layers,
  Search,
  Crosshair,
  Maximize2,
  ZoomIn,
  ZoomOut,
  AlertTriangle,
  RotateCcw,
  Navigation as NavIcon,
  ChevronDown,
  ChevronUp,
  Clock,
  Flame,
  Activity,
  CheckCircle2,
  X,
  ShieldAlert,
  Eye,
  EyeOff,
  Filter,
  Check,
  Sparkles,
  MapPin,
  Sliders,
  Settings,
  Wrench,
} from 'lucide-react';
import {
  D3HazardHeatmapOverlay,
  HeatmapConfig,
  DEFAULT_HEATMAP_CONFIG,
} from '../services/d3HeatmapOverlay';
import {
  analyzeMunicipalHazardClusters,
  MunicipalCluster,
} from '../services/municipalClusterService';
import { MunicipalClusterModal } from '../components/MunicipalClusterModal';

export interface MapPageProps {
  detections: RoadHazardRecord[];
  userCoords?: { latitude: number; longitude: number } | null;
  selectedDetectionId?: string | null;
  onOpenDemo?: () => void;
}

// Fixed Bengaluru vehicle coordinate as specified
const VEHICLE_LOCATION = { lat: 12.9693, lng: 77.5195 };

// Monitored navigation route points through Bengaluru
const VEHICLE_ROUTE_COORDS = [
  { lat: 12.9693, lng: 77.5195 }, // Vehicle start
  { lat: 12.9550, lng: 77.5450 },
  { lat: 12.9352, lng: 77.6245 }, // Koramangala
  { lat: 12.9257, lng: 77.6761 }, // Bellandur
  { lat: 12.9784, lng: 77.6408 }, // Indiranagar
  { lat: 13.0035, lng: 77.5709 }, // Malleswaram
  { lat: 13.0196, lng: 77.5968 }, // RT Nagar
  { lat: 13.0358, lng: 77.5970 }, // Hebbal
  { lat: 13.0450, lng: 77.6200 }, // Manyata Tech Park
];

// Bengaluru search presets for rapid navigation
const BENGALURU_SEARCH_PRESETS = [
  { name: 'Koramangala, Bengaluru', lat: 12.9352, lng: 77.6245 },
  { name: 'Indiranagar, Bengaluru', lat: 12.9784, lng: 77.6408 },
  { name: 'Jayanagar, Bengaluru', lat: 12.9250, lng: 77.5938 },
  { name: 'RT Nagar, Bengaluru', lat: 13.0196, lng: 77.5968 },
  { name: 'Bellandur, Bengaluru', lat: 12.9257, lng: 77.6761 },
  { name: 'Hebbal, Bengaluru', lat: 13.0358, lng: 77.5970 },
  { name: 'Malleswaram, Bengaluru', lat: 13.0035, lng: 77.5709 },
  { name: 'Manyata Tech Park, Bengaluru', lat: 13.0450, lng: 77.6200 },
  { name: 'MG Road, Bengaluru', lat: 12.9756, lng: 77.6066 },
  { name: 'Whitefield, Bengaluru', lat: 12.9698, lng: 77.7499 },
];

export const MapPage: React.FC<MapPageProps> = ({
  detections,
  userCoords,
  selectedDetectionId: initialSelectedId = null,
  onOpenDemo,
}) => {
  // DOM & Google Maps references
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const trafficLayerRef = useRef<google.maps.TrafficLayer | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const vehicleMarkerRef = useRef<google.maps.Marker | null>(null);
  const vehicleCircleRef = useRef<google.maps.Circle | null>(null);
  const routePolylineRef = useRef<google.maps.Polyline | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const searchMarkerRef = useRef<google.maps.Marker | null>(null);
  const d3HeatmapOverlayRef = useRef<D3HazardHeatmapOverlay | null>(null);

  // Component state
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedHazardId, setSelectedHazardId] = useState<string | null>(initialSelectedId);
  // Severity visibility filter state: allows independent toggling of Critical (High), Medium, and Low severity hazards
  const [severityVisibility, setSeverityVisibility] = useState<Record<SeverityLevel, boolean>>({
    high: true,   // Critical / High
    medium: true, // Medium
    low: true,    // Low
  });
  const [activeTypeFilter, setActiveTypeFilter] = useState<'all' | HazardType>('all');
  const [activeMapType, setActiveMapType] = useState<'roadmap' | 'satellite' | 'terrain'>('roadmap');
  const [isTrafficActive, setIsTrafficActive] = useState<boolean>(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [inspectHazard, setInspectHazard] = useState<RoadHazardRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<typeof BENGALURU_SEARCH_PRESETS>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState<boolean>(false);

  // D3 Heatmap & Municipal Clusters Visualization State
  const [visualizationMode, setVisualizationMode] = useState<'markers' | 'heatmap' | 'hybrid'>('markers');
  const [heatmapConfig, setHeatmapConfig] = useState<HeatmapConfig>(DEFAULT_HEATMAP_CONFIG);
  const [selectedCluster, setSelectedCluster] = useState<MunicipalCluster | null>(null);
  const [sidebarTab, setSidebarTab] = useState<'hazards' | 'clusters'>('hazards');
  const [showHeatmapSettings, setShowHeatmapSettings] = useState<boolean>(false);

  // Toggle a single severity level visibility on or off
  const toggleSeverity = (level: SeverityLevel) => {
    setSeverityVisibility((prev) => ({
      ...prev,
      [level]: !prev[level],
    }));
  };

  // Show all severity levels
  const showAllSeverities = () => {
    setSeverityVisibility({ high: true, medium: true, low: true });
  };

  // Clutter reduction preset: Focus on Critical / High severity hazards only
  const showCriticalOnly = () => {
    setSeverityVisibility({ high: true, medium: false, low: false });
  };

  // Setup auth failure listener
  useEffect(() => {
    onGoogleMapsAuthFailure(() => {
      setLoadError(
        'Google Maps authorization error: Please check your API key, domain restrictions, or billing in Google Cloud Console.'
      );
    });
  }, []);

  // Filter hazards based on severity visibility toggles and optional type filter
  const filteredHazards = useMemo(() => {
    return detections.filter((h) => {
      if (!severityVisibility[h.severity]) return false;
      if (activeTypeFilter !== 'all' && h.type !== activeTypeFilter) return false;
      return true;
    });
  }, [detections, severityVisibility, activeTypeFilter]);

  // Analyze spatial clusters of road defects for municipal maintenance authorities
  const municipalClusters = useMemo(() => {
    return analyzeMunicipalHazardClusters(filteredHazards, 750);
  }, [filteredHazards]);

  // Live Summary statistics calculated from the hazard dataset
  const stats = useMemo(() => {
    const high = detections.filter((d) => d.severity === 'high').length;
    const medium = detections.filter((d) => d.severity === 'medium').length;
    const low = detections.filter((d) => d.severity === 'low').length;
    return { high, medium, low, total: detections.length };
  }, [detections]);

  // Clutter reduction metrics
  const hiddenCount = detections.length - filteredHazards.length;
  const isAllSeveritiesActive = severityVisibility.high && severityVisibility.medium && severityVisibility.low;
  const isCriticalOnlyActive = severityVisibility.high && !severityVisibility.medium && !severityVisibility.low;

  // Helper to format time
  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch {
      return '12:00';
    }
  };

  // Helper for color-coded severity
  const getSeverityColor = (severity: SeverityLevel) => {
    switch (severity) {
      case 'high':
        return '#ef4444'; // Red
      case 'medium':
        return '#f97316'; // Orange
      case 'low':
        return '#10b981'; // Green
      default:
        return '#3b82f6';
    }
  };

  // Helper for hazard type symbol
  const getTypeSymbol = (type: HazardType) => {
    switch (type) {
      case 'pothole':
        return '🕳️';
      case 'road_crack':
        return '⚡';
      case 'broken_sign':
        return '🛑';
      case 'other_hazard':
        return '⚠️';
      default:
        return '📍';
    }
  };

  // Helper for hazard type label
  const getTypeLabel = (type: HazardType) => {
    switch (type) {
      case 'pothole':
        return 'Pothole';
      case 'road_crack':
        return 'Road Crack';
      case 'broken_sign':
        return 'Broken Sign';
      case 'other_hazard':
        return 'Other Hazard';
      default:
        return 'Road Hazard';
    }
  };

  // SVG Marker Generator with color-coded severity
  const createMarkerSvgIcon = (type: HazardType, severity: SeverityLevel) => {
    const color = getSeverityColor(severity);
    const symbol = getTypeSymbol(type);

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="38" height="46" viewBox="0 0 38 46">
        <defs>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-color="#000" flood-opacity="0.45" />
          </filter>
        </defs>
        <path d="M19 0 C8.5 0 0 8.5 0 19 C0 31 19 46 19 46 C19 46 38 31 38 19 C38 8.5 29.5 0 19 0 Z" fill="${color}" stroke="#ffffff" stroke-width="2.5" filter="url(#shadow)" />
        <circle cx="19" cy="18" r="13" fill="#ffffff" />
        <text x="19" y="23" font-size="13" text-anchor="middle" font-family="sans-serif">${symbol}</text>
      </svg>
    `;

    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new google.maps.Size(38, 46),
      anchor: new google.maps.Point(19, 46),
    };
  };

  // Open InfoWindow for Hazard
  const openHazardInfoWindow = useCallback((hazard: RoadHazardRecord, marker: google.maps.Marker) => {
    if (!mapRef.current) return;

    const severityBadgeColor =
      hazard.severity === 'high'
        ? 'background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5;'
        : hazard.severity === 'medium'
        ? 'background: #ffedd5; color: #c2410c; border: 1px solid #fdba74;'
        : 'background: #d1fae5; color: #047857; border: 1px solid #6ee7b7;';

    const typeLabel = getTypeLabel(hazard.type).toUpperCase();
    const symbol = getTypeSymbol(hazard.type);
    const timeStr = formatTime(hazard.timestamp);
    const latStr = (hazard.latitude ?? 12.9693).toFixed(4);
    const lngStr = (hazard.longitude ?? 77.5195).toFixed(4);
    const location = hazard.locationName || 'Bengaluru Road Corridor';

    const content = `
      <div style="font-family: system-ui, -apple-system, sans-serif; padding: 12px; min-width: 230px; max-width: 280px; color: #0f172a;">
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 8px;">
          <div style="font-weight: 800; font-size: 13px; display: flex; align-items: center; gap: 6px; color: #1e293b;">
            <span>${symbol}</span>
            <span>${typeLabel}</span>
          </div>
          <span style="font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 9999px; ${severityBadgeColor}">
            ${hazard.severity.toUpperCase()}
          </span>
        </div>

        <div style="font-size: 11.5px; line-height: 1.6; color: #475569; margin-bottom: 10px;">
          <div><strong>Location:</strong> <span style="color: #0f172a;">${location}</span></div>
          <div><strong>Latitude:</strong> <span style="font-family: monospace; color: #334155;">${latStr}</span></div>
          <div><strong>Longitude:</strong> <span style="font-family: monospace; color: #334155;">${lngStr}</span></div>
          <div><strong>Detected:</strong> <span style="font-family: monospace; color: #334155;">${timeStr}</span></div>
          <div style="margin-top: 4px; color: #64748b; font-style: italic; font-size: 11px;">${hazard.description}</div>
        </div>

        <button id="view-details-btn-${hazard.id}" style="width: 100%; background: #2563eb; color: #ffffff; font-weight: 700; font-size: 11px; padding: 7px 12px; border-radius: 8px; border: none; cursor: pointer; text-align: center; box-shadow: 0 1px 3px rgba(37,99,235,0.3); transition: background 0.15s ease;">
          View Details
        </button>
      </div>
    `;

    if (!infoWindowRef.current) {
      infoWindowRef.current = new google.maps.InfoWindow();
    }

    infoWindowRef.current.setContent(content);
    infoWindowRef.current.open({
      anchor: marker,
      map: mapRef.current,
      shouldFocus: false,
    });

    google.maps.event.addListenerOnce(infoWindowRef.current, 'domready', () => {
      const btn = document.getElementById(`view-details-btn-${hazard.id}`);
      if (btn) {
        btn.onclick = () => {
          setSelectedHazardId(hazard.id);
          setInspectHazard(hazard);
        };
      }
    });
  }, []);

  // Initialize Real Google Maps upon component mount
  useEffect(() => {
    let isCancelled = false;

    async function initGoogleMap() {
      if (!mapContainerRef.current) return;
      setIsLoading(true);
      setLoadError(null);

      try {
        await loadGoogleMaps();
        if (isCancelled || !mapContainerRef.current) return;

        // 1. Full-screen responsive map initialization
        const map = new google.maps.Map(mapContainerRef.current, {
          center: VEHICLE_LOCATION,
          zoom: 12,
          mapTypeId: activeMapType,
          disableDefaultUI: true,
          zoomControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: 'greedy',
        });
        mapRef.current = map;

        // 2. Functional Traffic Layer
        const trafficLayer = new google.maps.TrafficLayer();
        trafficLayerRef.current = trafficLayer;
        if (isTrafficActive) {
          trafficLayer.setMap(map);
        }

        // 3. Vehicle Marker with Radar Accuracy Circle
        const vehicleSvg = `
          <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
            <circle cx="22" cy="22" r="20" fill="#2563eb" fill-opacity="0.2" />
            <circle cx="22" cy="22" r="14" fill="#1d4ed8" stroke="#ffffff" stroke-width="2.5" />
            <circle cx="22" cy="22" r="6" fill="#60a5fa" />
          </svg>
        `;

        const vehicleMarker = new google.maps.Marker({
          position: VEHICLE_LOCATION,
          map,
          title: 'RoadGuard Vehicle (12.9693, 77.5195)',
          icon: {
            url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(vehicleSvg)}`,
            scaledSize: new google.maps.Size(44, 44),
            anchor: new google.maps.Point(22, 22),
          },
          zIndex: 999,
        });
        vehicleMarkerRef.current = vehicleMarker;

        const vehicleCircle = new google.maps.Circle({
          center: VEHICLE_LOCATION,
          radius: 380,
          strokeColor: '#2563eb',
          strokeOpacity: 0.8,
          strokeWeight: 1.5,
          fillColor: '#3b82f6',
          fillOpacity: 0.18,
          map,
        });
        vehicleCircleRef.current = vehicleCircle;

        vehicleMarker.addListener('click', () => {
          if (!infoWindowRef.current) infoWindowRef.current = new google.maps.InfoWindow();
          infoWindowRef.current.setContent(`
            <div style="font-family: system-ui, -apple-system, sans-serif; padding: 10px; color: #0f172a; min-width: 190px;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                <span style="font-size: 16px;">🚗</span>
                <span style="font-weight: 800; font-size: 13px; color: #1d4ed8;">RoadGuard Vehicle</span>
              </div>
              <div style="font-size: 11px; line-height: 1.5; color: #475569;">
                <div>Status: <strong style="color: #059669;">Active Patrol</strong></div>
                <div>GPS: <span style="font-family: monospace; font-weight: 700; color: #1e293b;">12.9693, 77.5195</span></div>
                <div>Zone: <span style="font-weight: 600;">Bengaluru Central Corridor</span></div>
              </div>
            </div>
          `);
          infoWindowRef.current.open({
            anchor: vehicleMarker,
            map,
            shouldFocus: false,
          });
        });

        // 4. Polyline showing the vehicle's route
        const routePolyline = new google.maps.Polyline({
          path: VEHICLE_ROUTE_COORDS,
          geodesic: true,
          strokeColor: '#2563eb',
          strokeOpacity: 0.9,
          strokeWeight: 5,
          map,
          zIndex: 50,
        });
        routePolylineRef.current = routePolyline;

        // 5. Initialize D3 Hazard Heatmap Overlay
        const d3Overlay = new D3HazardHeatmapOverlay(
          filteredHazards,
          municipalClusters,
          heatmapConfig,
          (cluster) => {
            setSelectedCluster(cluster);
          }
        );
        d3HeatmapOverlayRef.current = d3Overlay;
        if (visualizationMode === 'heatmap' || visualizationMode === 'hybrid') {
          d3Overlay.setMap(map);
        }

        setIsLoading(false);

        // Ensure tiles render completely and smoothly
        setTimeout(() => {
          if (mapRef.current) {
            google.maps.event.trigger(mapRef.current, 'resize');
          }
        }, 250);
        setTimeout(() => {
          if (mapRef.current) {
            google.maps.event.trigger(mapRef.current, 'resize');
          }
        }, 600);
      } catch (err: any) {
        console.error('Google Maps initialization failed:', err);
        if (!isCancelled) {
          setIsLoading(false);
          setLoadError(
            err.message || 'Google Maps failed to load. Please verify your internet and API key.'
          );
        }
      }
    }

    initGoogleMap();

    return () => {
      isCancelled = true;
      if (d3HeatmapOverlayRef.current) {
        d3HeatmapOverlayRef.current.setMap(null);
        d3HeatmapOverlayRef.current = null;
      }
    };
  }, []);

  // Synchronize D3 Heatmap Overlay with map, filters, and visualization mode
  useEffect(() => {
    const overlay = d3HeatmapOverlayRef.current;
    const map = mapRef.current;
    if (!overlay || !map) return;

    if (visualizationMode === 'heatmap' || visualizationMode === 'hybrid') {
      if (!overlay.getMap()) {
        overlay.setMap(map);
      }
      overlay.updateConfig(heatmapConfig);
      overlay.updateData(filteredHazards, municipalClusters);
    } else {
      if (overlay.getMap()) {
        overlay.setMap(null);
      }
    }
  }, [visualizationMode, heatmapConfig, filteredHazards, municipalClusters]);

  // Update Map Type
  const handleMapTypeSelect = (type: 'roadmap' | 'satellite' | 'terrain') => {
    setActiveMapType(type);
    if (mapRef.current) {
      mapRef.current.setMapTypeId(type);
    }
  };

  // Toggle Traffic Layer
  const handleTrafficToggle = () => {
    const nextState = !isTrafficActive;
    setIsTrafficActive(nextState);
    if (trafficLayerRef.current && mapRef.current) {
      trafficLayerRef.current.setMap(nextState ? mapRef.current : null);
    }
  };

  // Render / Update dynamic hazard markers from props
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear existing markers
    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current.clear();

    const showMarkers = visualizationMode === 'markers' || visualizationMode === 'hybrid';

    // Render markers from detections props
    detections.forEach((hazard) => {
      if (hazard.latitude == null || hazard.longitude == null) return;

      const isSeverityMatch = severityVisibility[hazard.severity];
      const isTypeMatch = activeTypeFilter === 'all' || hazard.type === activeTypeFilter;
      const isVisible = showMarkers && isSeverityMatch && isTypeMatch;

      const marker = new google.maps.Marker({
        position: { lat: hazard.latitude, lng: hazard.longitude },
        map: isVisible ? map : null,
        title: `${getTypeLabel(hazard.type)}: ${hazard.locationName || 'Hazard'}`,
        icon: createMarkerSvgIcon(hazard.type, hazard.severity),
        animation: hazard.severity === 'high' ? google.maps.Animation.DROP : undefined,
        opacity: visualizationMode === 'hybrid' ? 0.78 : 1.0,
      });

      marker.addListener('click', () => {
        openHazardInfoWindow(hazard, marker);
        setSelectedHazardId(hazard.id);
        setInspectHazard(hazard);
      });

      markersRef.current.set(hazard.id, marker);
    });
  }, [detections, severityVisibility, activeTypeFilter, visualizationMode, openHazardInfoWindow]);

  // Handle selected hazard focus
  useEffect(() => {
    if (!selectedHazardId || !mapRef.current) return;

    const marker = markersRef.current.get(selectedHazardId);
    const hazard = detections.find((h) => h.id === selectedHazardId);

    if (marker && hazard && marker.getPosition()) {
      mapRef.current.panTo(marker.getPosition()!);
      mapRef.current.setZoom(15);
      openHazardInfoWindow(hazard, marker);
    }
  }, [selectedHazardId, detections, openHazardInfoWindow]);

  // Action: Locate Vehicle
  const handleLocateVehicle = () => {
    if (!mapRef.current || !vehicleMarkerRef.current) return;
    mapRef.current.panTo(VEHICLE_LOCATION);
    mapRef.current.setZoom(15);

    if (!infoWindowRef.current) infoWindowRef.current = new google.maps.InfoWindow();
    infoWindowRef.current.setContent(`
      <div style="font-family: system-ui, -apple-system, sans-serif; padding: 10px; color: #0f172a; min-width: 190px;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
          <span style="font-size: 16px;">🚗</span>
          <span style="font-weight: 800; font-size: 13px; color: #1d4ed8;">RoadGuard Vehicle</span>
        </div>
        <div style="font-size: 11px; line-height: 1.5; color: #475569;">
          <div>Status: <strong style="color: #059669;">Active Patrol</strong></div>
          <div>GPS: <span style="font-family: monospace; font-weight: 700; color: #1e293b;">12.9693, 77.5195</span></div>
          <div>Location: <span style="font-weight: 600;">Bengaluru Central</span></div>
        </div>
      </div>
    `);
    infoWindowRef.current.open({
      anchor: vehicleMarkerRef.current,
      map: mapRef.current,
      shouldFocus: false,
    });
  };

  // Action: Fit All Hazards
  const handleFitAllHazards = () => {
    if (!mapRef.current) return;
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(VEHICLE_LOCATION);

    let count = 0;
    markersRef.current.forEach((marker) => {
      if (marker.getMap()) {
        const pos = marker.getPosition();
        if (pos) {
          bounds.extend(pos);
          count++;
        }
      }
    });

    if (count > 0) {
      mapRef.current.fitBounds(bounds, 60);
    } else {
      mapRef.current.panTo(VEHICLE_LOCATION);
      mapRef.current.setZoom(12);
    }
  };

  // Zoom handlers
  const handleZoomIn = () => {
    if (mapRef.current) {
      mapRef.current.setZoom((mapRef.current.getZoom() || 12) + 1);
    }
  };

  const handleZoomOut = () => {
    if (mapRef.current) {
      mapRef.current.setZoom((mapRef.current.getZoom() || 12) - 1);
    }
  };

  // Search handlers
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (!val.trim()) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }

    const filtered = BENGALURU_SEARCH_PRESETS.filter((p) =>
      p.name.toLowerCase().includes(val.toLowerCase())
    );
    setSearchResults(filtered);
    setShowSearchDropdown(true);
  };

  const handleSelectSearchPreset = (preset: (typeof BENGALURU_SEARCH_PRESETS)[0]) => {
    setSearchQuery(preset.name);
    setShowSearchDropdown(false);

    if (!mapRef.current) return;
    mapRef.current.panTo({ lat: preset.lat, lng: preset.lng });
    mapRef.current.setZoom(14);

    if (searchMarkerRef.current) {
      searchMarkerRef.current.setMap(null);
    }

    const marker = new google.maps.Marker({
      position: { lat: preset.lat, lng: preset.lng },
      map: mapRef.current,
      title: preset.name,
      animation: google.maps.Animation.DROP,
    });
    searchMarkerRef.current = marker;

    if (!infoWindowRef.current) infoWindowRef.current = new google.maps.InfoWindow();
    infoWindowRef.current.setContent(`
      <div style="font-family: system-ui, -apple-system, sans-serif; padding: 8px 12px; color: #0f172a;">
        <div style="font-weight: 800; font-size: 13px; color: #1e293b;">📍 ${preset.name}</div>
        <div style="font-size: 11px; font-family: monospace; color: #64748b; margin-top: 2px;">
          ${preset.lat.toFixed(4)}, ${preset.lng.toFixed(4)}
        </div>
      </div>
    `);
    infoWindowRef.current.open({
      anchor: marker,
      map: mapRef.current,
      shouldFocus: false,
    });
  };

  return (
    <div className="flex-1 flex flex-col w-full h-full min-h-0 bg-[#070d1e] text-slate-100 select-none overflow-hidden">
      {/* 1. GPS Sub-Header & Quick Navigation Strip */}
      <div className="bg-[#0b132b] border-b border-slate-800/90 px-3 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2.5 z-20 shrink-0">
        {/* Left: GPS Indicator & Hazard Counter */}
        <div className="flex items-center gap-2.5 sm:gap-4 text-xs">
          <div className="flex items-center gap-2 bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-800">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
            <span className="text-slate-400 font-medium">GPS:</span>
            <span className="font-mono font-bold text-white">12.9693°, 77.5195°</span>
          </div>

          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="font-bold text-white bg-blue-600/30 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full text-[11px] font-mono">
              {filteredHazards.length} / {detections.length}
            </span>
            <span className="hidden sm:inline text-xs text-slate-400">Hazards Shown</span>
          </div>
        </div>

        {/* Center: Municipal D3 Heatmap & Visualization Mode Switcher */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-900/90 p-0.5 rounded-xl border border-slate-700/80 text-xs shadow-lg">
            <button
              onClick={() => setVisualizationMode('markers')}
              className={`px-3 py-1 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                visualizationMode === 'markers'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Standard Road Hazard Pins"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>Pins</span>
            </button>

            <button
              onClick={() => {
                setVisualizationMode('heatmap');
                setSidebarTab('clusters');
              }}
              className={`px-3 py-1 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                visualizationMode === 'heatmap'
                  ? 'bg-gradient-to-r from-rose-600 via-amber-600 to-orange-500 text-white shadow-md shadow-rose-600/30'
                  : 'text-amber-400 hover:text-amber-300'
              }`}
              title="D3.js 2D Density Heatmap for Municipal Problem Clusters"
            >
              <Flame className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
              <span>D3 Heatmap</span>
              {municipalClusters.length > 0 && (
                <span className="text-[10px] bg-black/40 px-1.5 py-0.2 rounded-full font-mono">
                  {municipalClusters.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setVisualizationMode('hybrid')}
              className={`px-3 py-1 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                visualizationMode === 'hybrid'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Hybrid: D3 Density Contours + Map Pins"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Hybrid</span>
            </button>
          </div>

          {(visualizationMode === 'heatmap' || visualizationMode === 'hybrid') && (
            <button
              onClick={() => setShowHeatmapSettings(!showHeatmapSettings)}
              className={`py-1 px-2.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 ${
                showHeatmapSettings
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                  : 'bg-slate-900/90 text-slate-300 border-slate-700 hover:text-white'
              }`}
              title="Adjust D3 Heatmap settings (bandwidth radius, color palette, contours)"
            >
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Settings</span>
            </button>
          )}
        </div>

        {/* Right: Quick Controls & Mobile Sidebar Toggle */}
        <div className="flex items-center gap-2">
          {/* Layer Pills */}
          <div className="hidden sm:flex items-center gap-1 bg-slate-900/80 p-0.5 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => handleMapTypeSelect('roadmap')}
              className={`px-2 py-0.5 rounded-md font-bold transition-all ${
                activeMapType === 'roadmap' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Road
            </button>
            <button
              onClick={() => handleMapTypeSelect('satellite')}
              className={`px-2 py-0.5 rounded-md font-bold transition-all ${
                activeMapType === 'satellite' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Satellite
            </button>
            <button
              onClick={() => handleMapTypeSelect('terrain')}
              className={`px-2 py-0.5 rounded-md font-bold transition-all ${
                activeMapType === 'terrain' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Terrain
            </button>
            <button
              onClick={handleTrafficToggle}
              className={`px-2 py-0.5 rounded-md font-bold transition-all flex items-center gap-1 ${
                isTrafficActive ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isTrafficActive ? 'bg-white' : 'bg-slate-500'}`} />
              <span>Traffic</span>
            </button>
          </div>

          {/* Mobile Panel Toggle */}
          <button
            onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
            className="md:hidden flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold border border-slate-700"
          >
            <span>Live Data</span>
            {isMobileSidebarOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* 2. Filter Bar with Severity Visibility Toggles & Clutter Reduction */}
      <div className="bg-[#0e1738] border-b border-slate-800/80 px-3 sm:px-6 py-2 flex items-center justify-between gap-3 overflow-x-auto scrollbar-none z-10 shrink-0">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 shrink-0 mr-1">
            <Filter className="w-3.5 h-3.5 text-blue-400" />
            <span>Severity:</span>
          </span>

          {/* Quick Presets */}
          <button
            onClick={showAllSeverities}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0 ${
              isAllSeveritiesActive
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
            }`}
            title="Display all road hazard severity levels"
          >
            All
          </button>

          <button
            onClick={showCriticalOnly}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1 border ${
              isCriticalOnlyActive
                ? 'bg-rose-600 text-white border-rose-400 shadow-md shadow-rose-600/30'
                : 'bg-rose-950/40 text-rose-300 border-rose-900/60 hover:bg-rose-900/40'
            }`}
            title="Show Critical hazards only to eliminate non-urgent map clutter"
          >
            <Sparkles className="w-3 h-3 text-amber-300" />
            <span>Critical Only</span>
          </button>

          <div className="w-[1px] h-4 bg-slate-700/80 mx-1 shrink-0" />

          {/* Independent Severity Toggles */}
          {/* 1. Critical (High) Toggle */}
          <button
            onClick={() => toggleSeverity('high')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 border ${
              severityVisibility.high
                ? 'bg-rose-600 text-white border-rose-400 shadow-md shadow-rose-600/30 ring-1 ring-rose-400/40'
                : 'bg-slate-900/70 text-slate-400 border-slate-800 hover:text-slate-300 opacity-60'
            }`}
            title={severityVisibility.high ? 'Click to hide Critical hazards' : 'Click to show Critical hazards'}
          >
            <span className={`w-2 h-2 rounded-full ${severityVisibility.high ? 'bg-white shadow-sm' : 'bg-rose-500'}`} />
            <span>Critical ({stats.high})</span>
            {severityVisibility.high ? (
              <Check className="w-3 h-3 text-white" />
            ) : (
              <EyeOff className="w-3 h-3 text-slate-500" />
            )}
          </button>

          {/* 2. Medium Toggle */}
          <button
            onClick={() => toggleSeverity('medium')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 border ${
              severityVisibility.medium
                ? 'bg-amber-600 text-white border-amber-400 shadow-md shadow-amber-600/30 ring-1 ring-amber-400/40'
                : 'bg-slate-900/70 text-slate-400 border-slate-800 hover:text-slate-300 opacity-60'
            }`}
            title={severityVisibility.medium ? 'Click to hide Medium hazards' : 'Click to show Medium hazards'}
          >
            <span className={`w-2 h-2 rounded-full ${severityVisibility.medium ? 'bg-white shadow-sm' : 'bg-amber-500'}`} />
            <span>Medium ({stats.medium})</span>
            {severityVisibility.medium ? (
              <Check className="w-3 h-3 text-white" />
            ) : (
              <EyeOff className="w-3 h-3 text-slate-500" />
            )}
          </button>

          {/* 3. Low Toggle */}
          <button
            onClick={() => toggleSeverity('low')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 border ${
              severityVisibility.low
                ? 'bg-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-600/30 ring-1 ring-emerald-400/40'
                : 'bg-slate-900/70 text-slate-400 border-slate-800 hover:text-slate-300 opacity-60'
            }`}
            title={severityVisibility.low ? 'Click to hide Low hazards' : 'Click to show Low hazards'}
          >
            <span className={`w-2 h-2 rounded-full ${severityVisibility.low ? 'bg-white shadow-sm' : 'bg-emerald-500'}`} />
            <span>Low ({stats.low})</span>
            {severityVisibility.low ? (
              <Check className="w-3 h-3 text-white" />
            ) : (
              <EyeOff className="w-3 h-3 text-slate-500" />
            )}
          </button>

          <div className="w-[1px] h-4 bg-slate-700/80 mx-1 shrink-0" />

          {/* Type Filters */}
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
            Type:
          </span>

          <button
            onClick={() => setActiveTypeFilter('all')}
            className={`px-2 py-1 rounded-lg text-xs font-bold transition-all shrink-0 ${
              activeTypeFilter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800/70 text-slate-300 hover:bg-slate-700'
            }`}
          >
            All
          </button>

          <button
            onClick={() => setActiveTypeFilter(activeTypeFilter === 'pothole' ? 'all' : 'pothole')}
            className={`px-2 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shrink-0 ${
              activeTypeFilter === 'pothole'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800/70 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <span>🕳️</span>
            <span>Pothole</span>
          </button>

          <button
            onClick={() => setActiveTypeFilter(activeTypeFilter === 'road_crack' ? 'all' : 'road_crack')}
            className={`px-2 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shrink-0 ${
              activeTypeFilter === 'road_crack'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800/70 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <span>⚡</span>
            <span>Crack</span>
          </button>

          <button
            onClick={() => setActiveTypeFilter(activeTypeFilter === 'broken_sign' ? 'all' : 'broken_sign')}
            className={`px-2 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shrink-0 ${
              activeTypeFilter === 'broken_sign'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800/70 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <span>🛑</span>
            <span>Sign</span>
          </button>

          <button
            onClick={() => setActiveTypeFilter(activeTypeFilter === 'other_hazard' ? 'all' : 'other_hazard')}
            className={`px-2 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shrink-0 ${
              activeTypeFilter === 'other_hazard'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800/70 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <span>⚠️</span>
            <span>Other</span>
          </button>
        </div>

        {/* Clutter Reduction Status Badge */}
        {hiddenCount > 0 && (
          <div className="shrink-0 flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] bg-indigo-950/80 text-indigo-300 border border-indigo-700/60 px-2.5 py-0.5 rounded-full font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span>{hiddenCount} hazards hidden to reduce clutter</span>
            </span>
            <button
              onClick={showAllSeverities}
              className="text-[11px] text-cyan-400 hover:text-cyan-300 underline font-semibold shrink-0"
            >
              Reset
            </button>
          </div>
        )}
      </div>

      {/* 3. Main Workspace: Map on Left, Sidebar on Right */}
      <div className="flex-1 flex flex-col md:flex-row w-full h-full min-h-0 relative overflow-hidden">
        {/* (1) Full-screen responsive map container */}
        <div className="flex-1 flex flex-col h-full min-h-[600px] w-full relative z-0 bg-slate-950 overflow-hidden">
          {/* Real Google Map Mount Container */}
          <div
            ref={mapContainerRef}
            id="roadguard-map-viewport"
            className="w-full h-full min-h-[600px] flex-1 z-0"
          />

          {/* Loading Indicator Overlay */}
          {isLoading && (
            <div className="absolute inset-0 z-20 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-white text-center">
              <div className="w-12 h-12 rounded-full border-3 border-blue-500 border-t-transparent animate-spin mb-4 shadow-lg shadow-blue-500/20" />
              <h3 className="font-bold text-base tracking-tight mb-1">Loading Google Maps...</h3>
              <p className="text-xs text-slate-400 max-w-xs">
                Initializing Google Maps JavaScript API with Bengaluru traffic and hazard markers.
              </p>
            </div>
          )}

          {/* Authorization or Load Error Overlay */}
          {loadError && (
            <div className="absolute inset-0 z-30 bg-slate-900/95 flex flex-col items-center justify-center p-6 text-white text-center">
              <div className="w-14 h-14 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mb-4 border border-rose-500/30">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <h3 className="font-bold text-lg text-white mb-2">Google Maps Initialization Notice</h3>
              <p className="text-xs text-rose-300 max-w-md mb-6 leading-relaxed bg-rose-950/60 p-3.5 rounded-xl border border-rose-800/60 font-mono">
                {loadError}
              </p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retry Map Loading</span>
              </button>
            </div>
          )}

          {/* (5) Search Box (Top Left) */}
          <div className="absolute top-3 left-3 sm:left-4 z-10 w-72 sm:w-80">
            <div className="relative">
              <div className="flex items-center bg-slate-900/90 backdrop-blur-md border border-slate-700/80 text-white rounded-xl shadow-xl px-3 py-2 text-xs focus-within:border-blue-500 transition-colors">
                <Search className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onFocus={() => {
                    if (searchQuery.trim()) setShowSearchDropdown(true);
                  }}
                  placeholder="Search Bengaluru location..."
                  className="bg-transparent text-white placeholder-slate-400 focus:outline-none w-full text-xs font-medium"
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setShowSearchDropdown(false);
                      if (searchMarkerRef.current) searchMarkerRef.current.setMap(null);
                    }}
                    className="text-slate-400 hover:text-white text-xs ml-1 font-bold"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Autocomplete Dropdown */}
              {showSearchDropdown && searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl overflow-hidden z-20 py-1 max-h-56 overflow-y-auto">
                  {searchResults.map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSelectSearchPreset(preset)}
                      className="w-full text-left px-3.5 py-2 text-xs text-slate-200 hover:bg-blue-600 hover:text-white transition-colors flex items-center justify-between border-b border-slate-800/50 last:border-0"
                    >
                      <span className="font-semibold truncate">{preset.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono shrink-0 ml-2">
                        {preset.lat.toFixed(2)}, {preset.lng.toFixed(2)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* On-Map Floating Severity Visibility Quick-Toggle Pill */}
          <div className="absolute top-14 left-3 sm:left-4 z-10 hidden sm:flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-slate-700/80 shadow-2xl text-xs select-none">
            <span className="text-[10px] uppercase font-black text-slate-400 flex items-center gap-1 mr-0.5">
              <Filter className="w-3 h-3 text-blue-400" />
              <span>Severity:</span>
            </span>

            {/* Critical Toggle */}
            <button
              onClick={() => toggleSeverity('high')}
              className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 border ${
                severityVisibility.high
                  ? 'bg-rose-600 text-white border-rose-400 shadow-sm'
                  : 'bg-slate-800/70 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
              title="Toggle Critical / High Severity Hazards"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${severityVisibility.high ? 'bg-white' : 'bg-rose-500'}`} />
              <span>Critical ({stats.high})</span>
              {severityVisibility.high ? <Check className="w-3 h-3 ml-0.5" /> : <EyeOff className="w-3 h-3 ml-0.5 text-slate-500" />}
            </button>

            {/* Medium Toggle */}
            <button
              onClick={() => toggleSeverity('medium')}
              className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 border ${
                severityVisibility.medium
                  ? 'bg-amber-600 text-white border-amber-400 shadow-sm'
                  : 'bg-slate-800/70 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
              title="Toggle Medium Severity Hazards"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${severityVisibility.medium ? 'bg-white' : 'bg-amber-500'}`} />
              <span>Medium ({stats.medium})</span>
              {severityVisibility.medium ? <Check className="w-3 h-3 ml-0.5" /> : <EyeOff className="w-3 h-3 ml-0.5 text-slate-500" />}
            </button>

            {/* Low Toggle */}
            <button
              onClick={() => toggleSeverity('low')}
              className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 border ${
                severityVisibility.low
                  ? 'bg-emerald-600 text-white border-emerald-400 shadow-sm'
                  : 'bg-slate-800/70 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
              title="Toggle Low Severity Hazards"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${severityVisibility.low ? 'bg-white' : 'bg-emerald-500'}`} />
              <span>Low ({stats.low})</span>
              {severityVisibility.low ? <Check className="w-3 h-3 ml-0.5" /> : <EyeOff className="w-3 h-3 ml-0.5 text-slate-500" />}
            </button>

            <div className="w-[1px] h-3.5 bg-slate-700 mx-0.5" />

            {/* Clutter Reduction: Critical Only */}
            <button
              onClick={showCriticalOnly}
              className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wide transition-all border ${
                isCriticalOnlyActive
                  ? 'bg-rose-500/30 text-rose-300 border-rose-400 shadow-sm'
                  : 'bg-slate-800/60 text-slate-400 border-slate-700/70 hover:text-white hover:bg-slate-800'
              }`}
              title="Reduce visual clutter: show Critical hazards only"
            >
              Critical Only
            </button>
          </div>

          {/* (4) Map Type Controls & (3) Functional Traffic Toggle (Top Right) */}
          <div className="absolute top-3 right-3 sm:right-4 z-10 flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md p-1 rounded-xl border border-slate-700/80 shadow-xl">
            <button
              onClick={() => handleMapTypeSelect('roadmap')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeMapType === 'roadmap'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
              title="Roadmap View"
            >
              Road
            </button>

            <button
              onClick={() => handleMapTypeSelect('satellite')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeMapType === 'satellite'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
              title="Satellite View"
            >
              Satellite
            </button>

            <button
              onClick={() => handleMapTypeSelect('terrain')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeMapType === 'terrain'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
              title="Terrain View"
            >
              Terrain
            </button>

            <div className="w-[1px] h-4 bg-slate-700 mx-0.5" />

            {/* (3) Functional Traffic Layer Toggle */}
            <button
              onClick={handleTrafficToggle}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                isTrafficActive
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
              title="Toggle Traffic Layer"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isTrafficActive ? 'bg-white animate-pulse' : 'bg-emerald-400'
                }`}
              />
              <span>Traffic</span>
            </button>
          </div>

          {/* Floating D3 Heatmap Settings Card for Municipal Maintenance */}
          {showHeatmapSettings && (
            <div className="absolute top-14 right-3 sm:right-4 z-30 w-80 bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-2xl shadow-2xl p-4 text-xs space-y-3.5 animate-in fade-in zoom-in-95 duration-150 text-white">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-1.5 font-extrabold text-white text-xs">
                  <Flame className="w-4 h-4 text-amber-400" />
                  <span>D3 Heatmap Configuration</span>
                </div>
                <button
                  onClick={() => setShowHeatmapSettings(false)}
                  className="text-slate-400 hover:text-white text-xs font-bold"
                >
                  ✕
                </button>
              </div>

              {/* Bandwidth / Cluster Radius */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-slate-300 font-semibold text-[11px]">
                  <span>Smoothing Radius / Bandwidth:</span>
                  <span className="font-mono text-amber-400 font-bold">{heatmapConfig.bandwidth}px</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { label: '30px', val: 30 },
                    { label: '45px', val: 45 },
                    { label: '60px', val: 60 },
                    { label: '80px', val: 80 },
                  ].map((item) => (
                    <button
                      key={item.val}
                      onClick={() => setHeatmapConfig({ ...heatmapConfig, bandwidth: item.val })}
                      className={`py-1 rounded-lg font-bold text-[11px] border transition-all ${
                        heatmapConfig.bandwidth === item.val
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                          : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color Scheme */}
              <div className="space-y-1.5">
                <span className="text-slate-300 font-semibold block text-[11px]">Thermal Color Palette:</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'inferno', label: 'Inferno' },
                    { id: 'turbo', label: 'Turbo' },
                    { id: 'flame', label: 'Flame' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setHeatmapConfig({ ...heatmapConfig, colorScheme: p.id as any })}
                      className={`py-1 rounded-lg font-bold text-[11px] border transition-all capitalize ${
                        heatmapConfig.colorScheme === p.id
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
                          : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-2 pt-1 border-t border-slate-800 text-[11px]">
                <label className="flex items-center justify-between cursor-pointer text-slate-300">
                  <span>D3 2D Density Contours</span>
                  <input
                    type="checkbox"
                    checked={heatmapConfig.showContours}
                    onChange={(e) => setHeatmapConfig({ ...heatmapConfig, showContours: e.target.checked })}
                    className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer text-slate-300">
                  <span>Municipal Problem Centroid Badges</span>
                  <input
                    type="checkbox"
                    checked={heatmapConfig.showCentroidBadges}
                    onChange={(e) => setHeatmapConfig({ ...heatmapConfig, showCentroidBadges: e.target.checked })}
                    className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer text-slate-300">
                  <span>Weight by Hazard Severity</span>
                  <input
                    type="checkbox"
                    checked={heatmapConfig.weightBySeverity}
                    onChange={(e) => setHeatmapConfig({ ...heatmapConfig, weightBySeverity: e.target.checked })}
                    className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0"
                  />
                </label>
              </div>
            </div>
          )}

          {/* (6) 'Locate Vehicle' button & Floating Controls (Bottom Right) */}
          <div className="absolute bottom-6 right-3 sm:right-4 z-10 flex flex-col gap-2">
            {/* Locate Vehicle Button */}
            <button
              onClick={handleLocateVehicle}
              className="bg-slate-900/90 hover:bg-slate-800 backdrop-blur-md text-white border border-slate-700/80 p-2.5 rounded-xl shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2 group"
              title="Locate RoadGuard Vehicle (12.9693, 77.5195)"
            >
              <Crosshair className="w-4 h-4 text-blue-400 group-hover:rotate-45 transition-transform" />
              <span className="hidden sm:inline text-xs font-bold">Locate Vehicle</span>
            </button>

            {/* Fit All Hazards */}
            <button
              onClick={handleFitAllHazards}
              className="bg-slate-900/90 hover:bg-slate-800 backdrop-blur-md text-white border border-slate-700/80 p-2.5 rounded-xl shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
              title="Fit All Hazards"
            >
              <Maximize2 className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline text-xs font-bold">Fit All</span>
            </button>

            {/* Zoom In / Zoom Out */}
            <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl shadow-xl flex flex-col overflow-hidden">
              <button
                onClick={handleZoomIn}
                className="p-2.5 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors border-b border-slate-800"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={handleZoomOut}
                className="p-2.5 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* (7) Polyline Route Status Pill (Bottom Left) */}
          <div className="absolute bottom-6 left-3 sm:left-4 z-10 hidden sm:flex items-center gap-2.5 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 text-white px-3.5 py-2 rounded-xl shadow-xl text-xs font-medium">
            <NavIcon className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
            <span className="text-slate-300">Vehicle Route:</span>
            <span className="font-bold text-white">Bengaluru Corridor (9 Points)</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping ml-1" />
          </div>
        </div>

        {/* Right Side: RoadGuard Live Information Sidebar */}
        <aside
          className={`
            w-full md:w-84 lg:w-96 bg-[#070d1e] border-t md:border-t-0 md:border-l border-slate-800/90
            flex flex-col shrink-0 overflow-y-auto transition-all duration-300 z-10
            ${isMobileSidebarOpen ? 'max-h-[60vh] p-4' : 'hidden md:flex p-4 lg:p-5'}
          `}
        >
          {/* Section 1: LIVE SUMMARY */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="font-extrabold text-xs tracking-wider uppercase text-slate-400 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-blue-400" />
                <span>Live Summary</span>
              </h3>
              <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active Feed
              </span>
            </div>

            {/* 4 Risk Cards Grid with Visibility Toggle Controls */}
            <div className="grid grid-cols-2 gap-2.5">
              {/* 1. Critical / High Risk Toggle Card */}
              <div
                onClick={() => toggleSeverity('high')}
                className={`border rounded-xl p-3 cursor-pointer transition-all hover:scale-[1.02] select-none ${
                  severityVisibility.high
                    ? 'bg-gradient-to-br from-rose-950/60 to-slate-900 border-rose-600 ring-1 ring-rose-500/40 shadow-lg shadow-rose-950/40'
                    : 'bg-slate-900/40 border-slate-800/80 opacity-55 grayscale-[30%] hover:opacity-75'
                }`}
                title={severityVisibility.high ? 'Click to hide Critical hazards' : 'Click to show Critical hazards'}
              >
                <div className="flex items-center justify-between text-rose-400 mb-1">
                  <span className="text-[11px] font-bold flex items-center gap-1">
                    <Flame className="w-3.5 h-3.5" />
                    <span>Critical</span>
                  </span>
                  {severityVisibility.high ? (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-0.5">
                      <Eye className="w-2.5 h-2.5" /> Visible
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-0.5">
                      <EyeOff className="w-2.5 h-2.5" /> Hidden
                    </span>
                  )}
                </div>
                <div className="text-2xl font-black font-mono text-rose-300">{stats.high}</div>
                <div className="text-[10px] text-slate-400 mt-0.5 flex items-center justify-between">
                  <span>Critical hazards</span>
                  <span className="text-[9px] text-rose-400/80 underline">Toggle</span>
                </div>
              </div>

              {/* 2. Medium Risk Toggle Card */}
              <div
                onClick={() => toggleSeverity('medium')}
                className={`border rounded-xl p-3 cursor-pointer transition-all hover:scale-[1.02] select-none ${
                  severityVisibility.medium
                    ? 'bg-gradient-to-br from-amber-950/60 to-slate-900 border-amber-600 ring-1 ring-amber-500/40 shadow-lg shadow-amber-950/40'
                    : 'bg-slate-900/40 border-slate-800/80 opacity-55 grayscale-[30%] hover:opacity-75'
                }`}
                title={severityVisibility.medium ? 'Click to hide Medium hazards' : 'Click to show Medium hazards'}
              >
                <div className="flex items-center justify-between text-amber-400 mb-1">
                  <span className="text-[11px] font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Medium</span>
                  </span>
                  {severityVisibility.medium ? (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-0.5">
                      <Eye className="w-2.5 h-2.5" /> Visible
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-0.5">
                      <EyeOff className="w-2.5 h-2.5" /> Hidden
                    </span>
                  )}
                </div>
                <div className="text-2xl font-black font-mono text-amber-300">{stats.medium}</div>
                <div className="text-[10px] text-slate-400 mt-0.5 flex items-center justify-between">
                  <span>Moderate risk</span>
                  <span className="text-[9px] text-amber-400/80 underline">Toggle</span>
                </div>
              </div>

              {/* 3. Low Risk Toggle Card */}
              <div
                onClick={() => toggleSeverity('low')}
                className={`border rounded-xl p-3 cursor-pointer transition-all hover:scale-[1.02] select-none ${
                  severityVisibility.low
                    ? 'bg-gradient-to-br from-emerald-950/60 to-slate-900 border-emerald-600 ring-1 ring-emerald-500/40 shadow-lg shadow-emerald-950/40'
                    : 'bg-slate-900/40 border-slate-800/80 opacity-55 grayscale-[30%] hover:opacity-75'
                }`}
                title={severityVisibility.low ? 'Click to hide Low hazards' : 'Click to show Low hazards'}
              >
                <div className="flex items-center justify-between text-emerald-400 mb-1">
                  <span className="text-[11px] font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Low Risk</span>
                  </span>
                  {severityVisibility.low ? (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-0.5">
                      <Eye className="w-2.5 h-2.5" /> Visible
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-0.5">
                      <EyeOff className="w-2.5 h-2.5" /> Hidden
                    </span>
                  )}
                </div>
                <div className="text-2xl font-black font-mono text-emerald-300">{stats.low}</div>
                <div className="text-[10px] text-slate-400 mt-0.5 flex items-center justify-between">
                  <span>Minor defects</span>
                  <span className="text-[9px] text-emerald-400/80 underline">Toggle</span>
                </div>
              </div>

              {/* 4. Total Hazards Card (Reset to Show All) */}
              <div
                onClick={() => {
                  showAllSeverities();
                  setActiveTypeFilter('all');
                }}
                className={`border rounded-xl p-3 cursor-pointer transition-all hover:scale-[1.02] select-none ${
                  isAllSeveritiesActive
                    ? 'bg-gradient-to-br from-blue-950/60 to-slate-900 border-blue-500 ring-1 ring-blue-500/30'
                    : 'bg-slate-900/80 border-slate-700 hover:border-blue-400'
                }`}
                title="Click to reset and show all severity levels"
              >
                <div className="flex items-center justify-between text-blue-400 mb-1">
                  <span className="text-[11px] font-bold flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>All Hazards</span>
                  </span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    {filteredHazards.length}/{stats.total}
                  </span>
                </div>
                <div className="text-2xl font-black font-mono text-blue-300">{stats.total}</div>
                <div className="text-[10px] text-slate-400 mt-0.5 flex items-center justify-between">
                  <span>Total recorded</span>
                  <span className="text-[9px] text-blue-400 underline">Show All</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: HAZARD LEGEND */}
          <div className="mb-5 bg-slate-900/70 border border-slate-800 rounded-xl p-3">
            <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
              <span>Hazard Legend</span>
              <span className="text-[10px] text-slate-400 font-normal">Map Pin Guide</span>
            </h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-sm">🕳️</span>
                <span className="text-slate-300 font-medium">Pothole</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm">⚡</span>
                <span className="text-slate-300 font-medium">Road Crack</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm">🛑</span>
                <span className="text-slate-300 font-medium">Broken Sign</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm">⚠️</span>
                <span className="text-slate-300 font-medium">Other Hazard</span>
              </div>
            </div>
            <div className="mt-2.5 pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500" /> High Severity
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-orange-500" /> Medium
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Low
              </span>
            </div>
          </div>

          {/* Section 3: RECENT HAZARDS LIST */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-400" />
                <span>Recent Hazards</span>
              </h4>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-slate-400">{filteredHazards.length} Items</span>
                {hiddenCount > 0 && (
                  <span className="text-[9px] font-bold text-amber-300 bg-amber-950/80 border border-amber-800/80 px-1.5 py-0.5 rounded-full">
                    {hiddenCount} Hidden
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2 overflow-y-auto pr-1 flex-1 max-h-[380px] scrollbar-thin">
              {filteredHazards.map((hazard) => {
                const isSelected = selectedHazardId === hazard.id;
                return (
                  <div
                    key={hazard.id}
                    onClick={() => {
                      setSelectedHazardId(hazard.id);
                      setInspectHazard(hazard);
                    }}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer flex gap-2.5 items-start ${
                      isSelected
                        ? 'bg-blue-950/60 border-blue-500 shadow-md shadow-blue-500/10'
                        : 'bg-slate-900/60 hover:bg-slate-800/80 border-slate-800/80'
                    }`}
                  >
                    {hazard.imageUrl ? (
                      <img
                        src={hazard.imageUrl}
                        alt="Hazard"
                        className="w-12 h-12 rounded-lg object-cover shrink-0 border border-slate-700"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center text-lg shrink-0 border border-slate-700">
                        {hazard.type === 'pothole'
                          ? '🕳️'
                          : hazard.type === 'road_crack'
                          ? '⚡'
                          : hazard.type === 'broken_sign'
                          ? '🛑'
                          : '⚠️'}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="font-bold text-xs text-white truncate">
                          {getTypeLabel(hazard.type)}
                        </span>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase shrink-0 ${
                            hazard.severity === 'high'
                              ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                              : hazard.severity === 'medium'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          }`}
                        >
                          {hazard.severity}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-300 truncate">
                        {hazard.locationName || 'Bengaluru Road'}
                      </p>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1 font-mono">
                        <span>
                          {hazard.latitude?.toFixed(3)}, {hazard.longitude?.toFixed(3)}
                        </span>
                        <span>{formatTime(hazard.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {filteredHazards.length === 0 && (
                <div className="text-center py-8 px-4 bg-slate-900/60 rounded-2xl border border-slate-800 text-slate-400 text-xs space-y-2.5">
                  <EyeOff className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="font-bold text-slate-300">All hazards hidden by filters</p>
                  <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                    Toggle Critical, Medium, or Low severity levels above to view hazard pins on the map.
                  </p>
                  <button
                    onClick={showAllSeverities}
                    className="py-1.5 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                  >
                    Show All Severities
                  </button>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* 4. Hazard Detail Modal */}
      {inspectHazard && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2">
                <span className="text-xl">{getTypeSymbol(inspectHazard.type)}</span>
                <div>
                  <h3 className="font-extrabold text-sm text-white uppercase tracking-tight">
                    {getTypeLabel(inspectHazard.type)} Detected
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">ID: {inspectHazard.id}</span>
                </div>
              </div>

              <button
                onClick={() => setInspectHazard(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {inspectHazard.imageUrl && (
                <div className="rounded-xl overflow-hidden border border-slate-800 max-h-52 bg-black">
                  <img
                    src={inspectHazard.imageUrl}
                    alt="Hazard View"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Severity</span>
                  <span
                    className={`font-black text-sm uppercase ${
                      inspectHazard.severity === 'high'
                        ? 'text-rose-400'
                        : inspectHazard.severity === 'medium'
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {inspectHazard.severity}
                  </span>
                </div>

                <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Confidence</span>
                  <span className="font-black text-sm font-mono text-cyan-400">
                    {Math.round(inspectHazard.confidence * 100)}%
                  </span>
                </div>

                <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Latitude</span>
                  <span className="font-mono text-slate-200">{inspectHazard.latitude?.toFixed(4)}</span>
                </div>

                <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Longitude</span>
                  <span className="font-mono text-slate-200">{inspectHazard.longitude?.toFixed(4)}</span>
                </div>
              </div>

              <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-700/40 text-xs">
                <div className="text-slate-400 font-bold mb-1">Location:</div>
                <div className="text-white font-medium mb-2">{inspectHazard.locationName}</div>
                <div className="text-slate-400 font-bold mb-1">Description:</div>
                <div className="text-slate-300 leading-relaxed">{inspectHazard.description}</div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
              <span className="text-[11px] text-slate-400 font-mono">
                Detected: {formatTime(inspectHazard.timestamp)}
              </span>
              <button
                onClick={() => setInspectHazard(null)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
