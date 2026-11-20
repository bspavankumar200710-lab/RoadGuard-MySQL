import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { RoadHazardRecord, HazardType, SeverityLevel } from '../types/detection';
import { loadGoogleMaps, onGoogleMapsAuthFailure } from '../services/googleMapsService';
import {
  MapPin,
  Layers,
  Crosshair,
  Maximize2,
  ZoomIn,
  ZoomOut,
  X,
  ExternalLink,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Filter,
  Eye,
  Camera,
  Cpu,
} from 'lucide-react';

export interface MapPageProps {
  detections: RoadHazardRecord[];
  userCoords?: { latitude: number; longitude: number } | null;
  selectedDetectionId?: string | null;
  onOpenDemo?: () => void;
}

export const MapPage: React.FC<MapPageProps> = ({
  detections,
  userCoords,
  selectedDetectionId: initialSelectedId = null,
  onOpenDemo,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  // Fallback Leaflet DOM & instance references
  const leafletMapRef = useRef<any>(null);
  const leafletMarkersRef = useRef<Map<string, any>>(new Map());

  // State
  const [useGoogleMaps, setUseGoogleMaps] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedHazard, setSelectedHazard] = useState<RoadHazardRecord | null>(null);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<'all' | HazardType>('all');
  const [activeSeverityFilter, setActiveSeverityFilter] = useState<'all' | SeverityLevel>('all');
  const [activeMapType, setActiveMapType] = useState<'roadmap' | 'satellite'>('roadmap');
  const [isTrafficActive, setIsTrafficActive] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const trafficLayerRef = useRef<google.maps.TrafficLayer | null>(null);

  // Severity color definitions
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

  const getTypeLabel = (type: HazardType) => {
    switch (type) {
      case 'pothole':
        return 'Pothole';
      case 'road_crack':
        return 'Road Crack';
      case 'broken_sign':
        return 'Broken Sign';
      case 'other_hazard':
        return 'Other Road Defect';
      default:
        return 'Road Hazard';
    }
  };

  // Filter hazards based on category & severity
  const filteredHazards = useMemo(() => {
    return detections.filter((h) => {
      if (h.latitude == null || h.longitude == null) return false;
      if (activeCategoryFilter !== 'all' && h.type !== activeCategoryFilter) return false;
      if (activeSeverityFilter !== 'all' && h.severity !== activeSeverityFilter) return false;
      return true;
    });
  }, [detections, activeCategoryFilter, activeSeverityFilter]);

  // Statistics
  const stats = useMemo(() => {
    const potholes = detections.filter((d) => d.type === 'pothole').length;
    const cracks = detections.filter((d) => d.type === 'road_crack').length;
    const high = detections.filter((d) => d.severity === 'high').length;
    return { potholes, cracks, high, total: detections.length };
  }, [detections]);

  // SVG Marker Generator
  const createMarkerSvgIcon = (type: HazardType, severity: SeverityLevel) => {
    const color = getSeverityColor(severity);
    const symbol = getTypeSymbol(type);
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 38 46">
        <defs>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.4" />
          </filter>
        </defs>
        <path d="M19 0 C8.5 0 0 8.5 0 19 C0 31 19 46 19 46 C19 46 38 31 38 19 C38 8.5 29.5 0 19 0 Z" fill="${color}" stroke="#ffffff" stroke-width="2.5" filter="url(#shadow)" />
        <circle cx="19" cy="18" r="12" fill="#ffffff" />
        <text x="19" y="23" font-size="12" text-anchor="middle" font-family="sans-serif">${symbol}</text>
      </svg>
    `;
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new google.maps.Size(36, 44),
      anchor: new google.maps.Point(18, 44),
    };
  };

  // Google Maps Auth failure handler
  useEffect(() => {
    onGoogleMapsAuthFailure(() => {
      console.warn('[MapPage] Google Maps auth failure; falling back to OpenStreetMap.');
      setUseGoogleMaps(false);
    });
  }, []);

  // Initialize Map
  useEffect(() => {
    let isCancelled = false;

    async function initMap() {
      if (!mapContainerRef.current) return;
      setIsLoading(true);
      setLoadError(null);

      // Default center: user coordinates or first detection or default center
      const defaultCenter = userCoords
        ? { lat: userCoords.latitude, lng: userCoords.longitude }
        : detections.length > 0 && detections[0].latitude && detections[0].longitude
        ? { lat: detections[0].latitude, lng: detections[0].longitude }
        : { lat: 12.9716, lng: 77.5946 };

      if (useGoogleMaps) {
        try {
          await loadGoogleMaps();
          if (isCancelled || !mapContainerRef.current) return;

          const map = new google.maps.Map(mapContainerRef.current, {
            center: defaultCenter,
            zoom: 13,
            mapTypeId: activeMapType,
            disableDefaultUI: true,
            gestureHandling: 'greedy',
          });
          mapRef.current = map;

          map.addListener('click', () => {
            if (infoWindowRef.current) infoWindowRef.current.close();
          });

          setIsLoading(false);
        } catch (err: any) {
          console.warn('[MapPage] Google Maps loader failed, switching to Leaflet fallback:', err);
          if (!isCancelled) {
            setUseGoogleMaps(false);
          }
        }
      } else {
        // Leaflet OpenStreetMap Fallback
        try {
          const L = await import('leaflet');
          if (isCancelled || !mapContainerRef.current) return;

          // Clear previous leaflet instance if any
          if (leafletMapRef.current) {
            leafletMapRef.current.remove();
          }

          const lmap = L.map(mapContainerRef.current, {
            center: [defaultCenter.lat, defaultCenter.lng],
            zoom: 13,
            zoomControl: false,
          });

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19,
          }).addTo(lmap);

          leafletMapRef.current = lmap;
          setIsLoading(false);
        } catch (lErr: any) {
          setLoadError(lErr?.message || 'Failed to initialize map.');
          setIsLoading(false);
        }
      }
    }

    initMap();

    return () => {
      isCancelled = true;
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, [useGoogleMaps]);

  // Update Google Maps markers when filtered hazards change
  useEffect(() => {
    if (!useGoogleMaps || !mapRef.current) return;
    const map = mapRef.current;

    // Clear old markers
    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current.clear();

    filteredHazards.forEach((hazard) => {
      if (hazard.latitude == null || hazard.longitude == null) return;

      const marker = new google.maps.Marker({
        position: { lat: hazard.latitude, lng: hazard.longitude },
        map,
        title: `${getTypeLabel(hazard.type)} (${hazard.damageClass || hazard.severity})`,
        icon: createMarkerSvgIcon(hazard.type, hazard.severity),
      });

      marker.addListener('click', () => {
        setSelectedHazard(hazard);
      });

      markersRef.current.set(hazard.id, marker);
    });
  }, [filteredHazards, useGoogleMaps]);

  // Update Leaflet markers if fallback is active
  useEffect(() => {
    if (useGoogleMaps || !leafletMapRef.current) return;
    const lmap = leafletMapRef.current;

    import('leaflet').then((L) => {
      leafletMarkersRef.current.forEach((marker) => marker.remove());
      leafletMarkersRef.current.clear();

      filteredHazards.forEach((hazard) => {
        if (hazard.latitude == null || hazard.longitude == null) return;

        const color = getSeverityColor(hazard.severity);
        const symbol = getTypeSymbol(hazard.type);

        const iconHtml = `
          <div style="background-color: ${color}; width: 34px; height: 34px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; font-size: 14px;">
            ${symbol}
          </div>
        `;

        const customIcon = L.divIcon({
          html: iconHtml,
          className: 'custom-hazard-marker',
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });

        const marker = L.marker([hazard.latitude, hazard.longitude], { icon: customIcon }).addTo(lmap);
        marker.on('click', () => {
          setSelectedHazard(hazard);
        });

        leafletMarkersRef.current.set(hazard.id, marker);
      });
    });
  }, [filteredHazards, useGoogleMaps]);

  // User Current Location marker
  useEffect(() => {
    if (!userCoords) return;

    if (useGoogleMaps && mapRef.current) {
      if (!userMarkerRef.current) {
        userMarkerRef.current = new google.maps.Marker({
          position: { lat: userCoords.latitude, lng: userCoords.longitude },
          map: mapRef.current,
          title: 'Your Location',
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 7,
            fillColor: '#2563eb',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 3,
          },
        });
      } else {
        userMarkerRef.current.setPosition({ lat: userCoords.latitude, lng: userCoords.longitude });
      }
    }
  }, [userCoords, useGoogleMaps]);

  // Focus selected detection if passed via prop
  useEffect(() => {
    if (!initialSelectedId) return;
    const target = detections.find((d) => d.id === initialSelectedId);
    if (target && target.latitude && target.longitude) {
      setSelectedHazard(target);
      if (useGoogleMaps && mapRef.current) {
        mapRef.current.panTo({ lat: target.latitude, lng: target.longitude });
        mapRef.current.setZoom(16);
      } else if (leafletMapRef.current) {
        leafletMapRef.current.setView([target.latitude, target.longitude], 16);
      }
    }
  }, [initialSelectedId, detections, useGoogleMaps]);

  // Pan to user location
  const handleCenterOnUser = () => {
    if (!userCoords) return;
    if (useGoogleMaps && mapRef.current) {
      mapRef.current.panTo({ lat: userCoords.latitude, lng: userCoords.longitude });
      mapRef.current.setZoom(15);
    } else if (leafletMapRef.current) {
      leafletMapRef.current.setView([userCoords.latitude, userCoords.longitude], 15);
    }
  };

  // Fit all hazards
  const handleFitAllHazards = () => {
    if (filteredHazards.length === 0) return;

    if (useGoogleMaps && mapRef.current) {
      const bounds = new google.maps.LatLngBounds();
      filteredHazards.forEach((h) => {
        if (h.latitude && h.longitude) bounds.extend({ lat: h.latitude, lng: h.longitude });
      });
      mapRef.current.fitBounds(bounds);
    } else if (leafletMapRef.current) {
      const latlngs = filteredHazards
        .filter((h) => h.latitude && h.longitude)
        .map((h) => [h.latitude!, h.longitude!]);
      if (latlngs.length > 0) {
        leafletMapRef.current.fitBounds(latlngs, { padding: [40, 40] });
      }
    }
  };

  // Toggle map type
  const handleToggleMapType = () => {
    const next = activeMapType === 'roadmap' ? 'satellite' : 'roadmap';
    setActiveMapType(next);
    if (useGoogleMaps && mapRef.current) {
      mapRef.current.setMapTypeId(next);
    }
  };

  // Toggle traffic
  const handleToggleTraffic = () => {
    if (!useGoogleMaps || !mapRef.current) return;
    if (!trafficLayerRef.current) {
      trafficLayerRef.current = new google.maps.TrafficLayer();
    }
    if (isTrafficActive) {
      trafficLayerRef.current.setMap(null);
      setIsTrafficActive(false);
    } else {
      trafficLayerRef.current.setMap(mapRef.current);
      setIsTrafficActive(true);
    }
  };

  return (
    <div className="relative w-full h-[100dvh] flex flex-col overflow-hidden bg-slate-950 text-white select-none">
      {/* Top Filter & Command Bar */}
      <div className="bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-3.5 sm:px-6 py-2.5 z-20 flex flex-wrap items-center justify-between gap-3 shadow-md">
        {/* Left: Title & Quick Stats */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-400">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-black text-sm tracking-tight text-white uppercase">Hazard Map</h2>
                <span className="text-[10px] font-mono font-bold bg-blue-500/20 text-cyan-300 border border-blue-500/30 px-2 py-0.5 rounded-full">
                  {filteredHazards.length} Mapped
                </span>
              </div>
              <p className="text-[10px] text-slate-400">Geotagged road damages from live camera</p>
            </div>
          </div>
        </div>

        {/* Center: Category Filters */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs overflow-x-auto">
          {[
            { id: 'all' as const, label: 'All Road Damage' },
            { id: 'pothole' as const, label: '🕳️ Potholes (D40)' },
            { id: 'road_crack' as const, label: '⚡ Road Cracks (D00-D20)' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategoryFilter(cat.id)}
              className={`px-3 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors ${
                activeCategoryFilter === cat.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleCenterOnUser}
            disabled={!userCoords}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 transition-colors"
            title="Center on My Location"
          >
            <Crosshair className="w-4 h-4 text-cyan-400" />
          </button>

          <button
            onClick={handleFitAllHazards}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            title="Fit All Hazards on Screen"
          >
            <Maximize2 className="w-4 h-4 text-slate-300" />
          </button>

          {useGoogleMaps && (
            <>
              <button
                onClick={handleToggleMapType}
                className="py-1.5 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-slate-300 transition-colors capitalize"
                title="Toggle Satellite / Roadmap View"
              >
                {activeMapType}
              </button>

              <button
                onClick={handleToggleTraffic}
                className={`py-1.5 px-2.5 rounded-xl text-[11px] font-bold border transition-colors ${
                  isTrafficActive
                    ? 'bg-emerald-600/30 text-emerald-300 border-emerald-500/50'
                    : 'bg-slate-800 text-slate-400 border-transparent hover:text-white'
                }`}
                title="Toggle Live Traffic Layer"
              >
                Traffic
              </button>
            </>
          )}

          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="py-1.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold shadow-md transition-colors"
          >
            {isSidebarOpen ? 'Hide List' : `List (${filteredHazards.length})`}
          </button>
        </div>
      </div>

      {/* Main Map & Side Feed Split */}
      <div className="relative flex-1 w-full h-full flex overflow-hidden">
        {/* Interactive Map Container */}
        <div className="relative flex-1 h-full w-full bg-slate-950">
          <div ref={mapContainerRef} className="w-full h-full" />

          {/* Loading Indicator */}
          {isLoading && (
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-30">
              <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-semibold text-slate-300">Loading Geotagged Hazard Map...</p>
            </div>
          )}

          {/* Error Banner */}
          {loadError && (
            <div className="absolute top-4 left-4 right-4 max-w-lg mx-auto bg-rose-950/95 border border-rose-500/50 p-3.5 rounded-2xl text-xs text-rose-200 z-30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{loadError}</span>
              </div>
              <button
                onClick={() => setUseGoogleMaps(false)}
                className="px-2.5 py-1 bg-rose-600 rounded-lg text-white font-bold text-[10px]"
              >
                Use OSM
              </button>
            </div>
          )}

          {/* Severity Filter Floating Overlay (Bottom Left) */}
          <div className="absolute bottom-5 left-4 z-10 bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-2xl p-2 shadow-xl flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2">Severity:</span>
            {[
              { id: 'all' as const, label: 'All', color: 'text-slate-200' },
              { id: 'high' as const, label: '🔴 High', color: 'text-rose-400' },
              { id: 'medium' as const, label: '🟠 Medium', color: 'text-amber-400' },
              { id: 'low' as const, label: '🟢 Low', color: 'text-emerald-400' },
            ].map((sev) => (
              <button
                key={sev.id}
                onClick={() => setActiveSeverityFilter(sev.id)}
                className={`px-2.5 py-1 rounded-xl text-[10px] font-bold transition-all ${
                  activeSeverityFilter === sev.id
                    ? 'bg-white/20 text-white shadow-sm'
                    : `${sev.color} hover:bg-slate-800`
                }`}
              >
                {sev.label}
              </button>
            ))}
          </div>
        </div>

        {/* Collapsible Detected Hazards Side List */}
        {isSidebarOpen && (
          <aside className="w-80 sm:w-96 bg-slate-900 border-l border-slate-800 flex flex-col h-full z-20 shrink-0 shadow-2xl">
            <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div>
                <h3 className="font-bold text-xs text-white uppercase tracking-wider">Detected Road Defects</h3>
                <p className="text-[10px] text-slate-400">{filteredHazards.length} hazards recorded in database</p>
              </div>
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 p-2 space-y-1">
              {filteredHazards.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  <Camera className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="font-semibold text-slate-400">No hazards match current filters</p>
                  <p className="text-[11px] mt-1 text-slate-500">Capture damage using the Live Camera to geotag defects.</p>
                </div>
              ) : (
                filteredHazards.map((hazard) => {
                  const isSelected = selectedHazard?.id === hazard.id;
                  const dateStr = new Date(hazard.timestamp).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                  });
                  const timeStr = new Date(hazard.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div
                      key={hazard.id}
                      onClick={() => {
                        setSelectedHazard(hazard);
                        if (useGoogleMaps && mapRef.current && hazard.latitude && hazard.longitude) {
                          mapRef.current.panTo({ lat: hazard.latitude, lng: hazard.longitude });
                          mapRef.current.setZoom(16);
                        } else if (leafletMapRef.current && hazard.latitude && hazard.longitude) {
                          leafletMapRef.current.setView([hazard.latitude, hazard.longitude], 16);
                        }
                      }}
                      className={`p-3 rounded-xl cursor-pointer transition-all flex items-start gap-3 ${
                        isSelected
                          ? 'bg-blue-600/20 border border-blue-500/50 text-white'
                          : 'hover:bg-slate-800/60 text-slate-300 border border-transparent'
                      }`}
                    >
                      {/* Photo Thumbnail */}
                      <div className="w-14 h-14 rounded-lg bg-black overflow-hidden shrink-0 border border-slate-700/80 flex items-center justify-center">
                        {hazard.imageUrl ? (
                          <img src={hazard.imageUrl} alt="Hazard Thumbnail" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xl">{getTypeSymbol(hazard.type)}</span>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <h4 className="font-extrabold text-xs text-white truncate flex items-center gap-1.5">
                            <span>{getTypeSymbol(hazard.type)}</span>
                            <span>{hazard.damageName || getTypeLabel(hazard.type)}</span>
                          </h4>
                          <span
                            className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded font-mono ${
                              hazard.severity === 'high'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : hazard.severity === 'medium'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            }`}
                          >
                            {hazard.severity}
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                          {hazard.latitude?.toFixed(4)}°, {hazard.longitude?.toFixed(4)}°
                        </div>

                        <div className="flex items-center justify-between mt-1 text-[10px] text-slate-400">
                          <span>Conf: {Math.round(hazard.confidence * 100)}%</span>
                          <span>{dateStr} {timeStr}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Simplified Hazard Information Modal (Requirement 2) */}
      {selectedHazard && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-blue-600/20 border border-blue-400/40 flex items-center justify-center text-xl">
                  {getTypeSymbol(selectedHazard.type)}
                </div>
                <div>
                  <h3 className="font-black text-sm sm:text-base text-white tracking-tight">
                    {selectedHazard.damageName || getTypeLabel(selectedHazard.type)}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    Class: {selectedHazard.damageClass || 'D40'} • ID: {selectedHazard.id.slice(0, 16)}...
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedHazard(null)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Captured Photograph */}
              {selectedHazard.imageUrl ? (
                <div className="rounded-2xl overflow-hidden border border-slate-800 bg-black aspect-video max-h-60 relative group">
                  <img
                    src={selectedHazard.imageUrl}
                    alt="Captured Road Hazard"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2 right-2 bg-slate-950/80 border border-slate-800 px-2 py-0.5 rounded-full text-[10px] font-mono text-cyan-300">
                    Live Camera Capture
                  </div>
                </div>
              ) : (
                <div className="p-8 rounded-2xl border border-dashed border-slate-800 text-center text-slate-500 text-xs">
                  No photographic snapshot attached to this defect
                </div>
              )}

              {/* Information Grid: Damage, Confidence, Severity, Lat/Lng */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                {/* Damage Category */}
                <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-0.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Damage Category
                  </span>
                  <div className="font-extrabold text-sm text-white flex items-center gap-1.5">
                    <span>{getTypeSymbol(selectedHazard.type)}</span>
                    <span className="capitalize">{selectedHazard.type.replace('_', ' ')}</span>
                  </div>
                </div>

                {/* Severity */}
                <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-0.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Hazard Severity
                  </span>
                  <div
                    className={`font-black text-sm uppercase ${
                      selectedHazard.severity === 'high'
                        ? 'text-rose-400'
                        : selectedHazard.severity === 'medium'
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {selectedHazard.severity}
                  </div>
                </div>

                {/* AI Confidence */}
                <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-0.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    AI Confidence
                  </span>
                  <div className="font-mono font-black text-sm text-cyan-300">
                    {Math.round(selectedHazard.confidence * 100)}%
                  </div>
                </div>

                {/* AI Engine */}
                <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-0.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    AI Engine
                  </span>
                  <div className="font-bold text-xs text-slate-200 truncate">
                    {selectedHazard.aiEngine === 'yolov5'
                      ? '⚡ YOLOv5 Detector'
                      : selectedHazard.aiEngine === 'gemini-standard'
                      ? '☁️ Standard Gemini'
                      : '🧠 Feedback Gemini'}
                  </div>
                </div>

                {/* Latitude */}
                <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-0.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    GPS Latitude
                  </span>
                  <div className="font-mono font-bold text-slate-200">
                    {selectedHazard.latitude?.toFixed(6) ?? 'N/A'}
                  </div>
                </div>

                {/* Longitude */}
                <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-0.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    GPS Longitude
                  </span>
                  <div className="font-mono font-bold text-slate-200">
                    {selectedHazard.longitude?.toFixed(6) ?? 'N/A'}
                  </div>
                </div>
              </div>

              {/* Timestamp & Location Note */}
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-1 text-xs">
                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-blue-400" />
                    Detection Timestamp:
                  </span>
                  <span className="font-mono text-slate-200">
                    {new Date(selectedHazard.timestamp).toLocaleString()}
                  </span>
                </div>
                {selectedHazard.description && (
                  <p className="text-slate-300 text-[11px] pt-1 border-t border-slate-800/80 leading-relaxed">
                    {selectedHazard.description}
                  </p>
                )}
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between gap-3">
              {selectedHazard.latitude && selectedHazard.longitude ? (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${selectedHazard.latitude},${selectedHazard.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <span>Google Maps</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              ) : <div />}

              <button
                onClick={() => setSelectedHazard(null)}
                className="py-2.5 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-colors"
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
