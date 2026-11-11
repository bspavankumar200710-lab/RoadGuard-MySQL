import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DriveSummary } from '../services/driveSessionService';
import { RoadHazardRecord } from '../types/detection';
import { modalOverlayVariants, modalDialogVariants, buttonPressProps } from '../utils/motion';
import {
  Navigation,
  AlertTriangle,
  Flame,
  CheckCircle2,
  Clock,
  Gauge,
  MapPin,
  TrendingDown,
  ShieldCheck,
  ShieldAlert,
  Download,
  Share2,
  X,
  ExternalLink,
  ChevronRight,
  Eye,
  Car,
  Activity,
  Layers,
  Sparkles,
} from 'lucide-react';

interface PostDriveSummaryModalProps {
  summary: DriveSummary | null;
  isOpen: boolean;
  onClose: () => void;
  onNavigateToMap: (hazardId?: string) => void;
  onNavigateToHistory: () => void;
  onStartNewDrive?: () => void;
}

export const PostDriveSummaryModal: React.FC<PostDriveSummaryModalProps> = ({
  summary,
  isOpen,
  onClose,
  onNavigateToMap,
  onNavigateToHistory,
  onStartNewDrive,
}) => {
  const [selectedHazard, setSelectedHazard] = useState<RoadHazardRecord | null>(null);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  // Format duration in minutes and seconds
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  // Format time of day
  const formatTimestamp = (ts: number) => {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  // Export summary as JSON report
  const handleExportReport = () => {
    if (!summary) return;
    const reportData = {
      reportType: 'RoadGuard Post-Drive Inspection Report',
      driveId: summary.id,
      date: new Date(summary.startTime).toISOString(),
      duration: `${summary.durationSeconds} seconds`,
      metrics: {
        distanceKm: summary.distanceKm,
        distanceMiles: summary.distanceMiles,
        totalHazardsDetected: summary.hazardsDetected,
        averageHazardDensityScore: `${summary.hazardDensityScore} hazards/km`,
        densityClassification: summary.densityLevel,
        roadQualityScore: `${summary.roadQualityScore}/100`,
        roadQualityGrade: summary.roadQualityGrade,
        averageSpeedKmh: summary.averageSpeedKmh,
        maxSpeedKmh: summary.maxSpeedKmh,
      },
      severityBreakdown: summary.severityBreakdown,
      typeBreakdown: summary.typeBreakdown,
      detectedHazards: summary.hazards.map((h) => ({
        id: h.id,
        type: h.type,
        severity: h.severity,
        confidence: `${Math.round(h.confidence * 100)}%`,
        description: h.description,
        locationCoordinates: { latitude: h.latitude, longitude: h.longitude },
        locationName: h.locationName,
        timestamp: h.timestamp,
      })),
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(reportData, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `drive_summary_${summary.id}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // Copy brief text summary to clipboard
  const handleShareSummary = () => {
    if (!summary) return;
    const text = `🛡️ RoadGuard Post-Drive Summary:\n• Distance: ${summary.distanceKm} km\n• Hazards Detected: ${summary.hazardsDetected}\n• Hazard Density: ${summary.hazardDensityScore} / km (${summary.densityLevel})\n• Road Quality: ${summary.roadQualityScore}/100 (Grade ${summary.roadQualityGrade})\nRecorded with RoadGuard AI Vision.`;
    navigator.clipboard.writeText(text).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    });
  };

  // Color schemes based on road quality
  const getQualityBadgeColor = () => {
    if (!summary) {
      return {
        bg: 'bg-blue-950/70 border-blue-500/50 text-blue-300',
        bar: 'bg-blue-500',
        ring: 'border-blue-500',
        text: 'text-blue-400',
      };
    }
    if (summary.roadQualityScore >= 80) {
      return {
        bg: 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300',
        bar: 'bg-emerald-500',
        ring: 'border-emerald-500',
        text: 'text-emerald-400',
      };
    }
    if (summary.roadQualityScore >= 60) {
      return {
        bg: 'bg-blue-950/70 border-blue-500/50 text-blue-300',
        bar: 'bg-blue-500',
        ring: 'border-blue-500',
        text: 'text-blue-400',
      };
    }
    if (summary.roadQualityScore >= 40) {
      return {
        bg: 'bg-amber-950/70 border-amber-500/50 text-amber-300',
        bar: 'bg-amber-500',
        ring: 'border-amber-500',
        text: 'text-amber-400',
      };
    }
    return {
      bg: 'bg-rose-950/70 border-rose-500/50 text-rose-300',
      bar: 'bg-rose-500',
      ring: 'border-rose-500',
      text: 'text-rose-400',
    };
  };

  const colors = getQualityBadgeColor();

  return (
    <AnimatePresence>
      {isOpen && summary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
          <motion.div
            variants={modalOverlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-md"
          />

          <motion.div
            variants={modalDialogVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="relative z-10 bg-slate-900 border border-slate-700/80 rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl text-white flex flex-col max-h-[92vh]"
          >
            {/* Header Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-gradient-to-r from-slate-900 via-[#0d1633] to-slate-900 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-600/30 text-white shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black tracking-tight text-white">
                  Post-Drive Summary
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-cyan-300 border border-blue-400/30">
                  Drive Completed
                </span>
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                <span>{formatTimestamp(summary.startTime)} – {formatTimestamp(summary.endTime)}</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-400" />
                  {formatDuration(summary.durationSeconds)}
                </span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800/80 hover:bg-slate-800 transition-colors"
            title="Close summary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 scrollbar-thin">
          {/* Top 3 Core Metrics Requested by User */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* 1. Distance Covered */}
            <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between relative overflow-hidden group hover:border-slate-700 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Distance Covered
                </span>
                <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
                  <Navigation className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-black text-white tracking-tight">
                    {summary.distanceKm}
                  </span>
                  <span className="text-sm font-bold text-slate-400">km</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  ≈ {summary.distanceMiles} miles
                </div>
              </div>
            </div>

            {/* 2. Number of Hazards Detected */}
            <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between relative overflow-hidden group hover:border-slate-700 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Hazards Detected
                </span>
                <div className="w-7 h-7 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center">
                  <AlertTriangle className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-black text-white tracking-tight">
                    {summary.hazardsDetected}
                  </span>
                  <span className="text-sm font-bold text-slate-400">defects</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                  <span className="text-rose-400 font-bold">{summary.severityBreakdown.high} Crit</span>
                  <span>•</span>
                  <span className="text-amber-400 font-bold">{summary.severityBreakdown.medium} Med</span>
                  <span>•</span>
                  <span className="text-emerald-400 font-bold">{summary.severityBreakdown.low} Low</span>
                </div>
              </div>
            </div>

            {/* 3. Average Hazard Density Score */}
            <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between relative overflow-hidden group hover:border-slate-700 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Hazard Density
                </span>
                <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Activity className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-black text-amber-300 tracking-tight">
                    {summary.hazardDensityScore}
                  </span>
                  <span className="text-xs font-bold text-slate-400">/ km</span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      summary.densityLevel === 'Low'
                        ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/40'
                        : summary.densityLevel === 'Moderate'
                        ? 'bg-blue-950/70 text-blue-300 border-blue-500/40'
                        : summary.densityLevel === 'High'
                        ? 'bg-amber-950/70 text-amber-300 border-amber-500/40'
                        : 'bg-rose-950/70 text-rose-300 border-rose-500/40'
                    }`}
                  >
                    {summary.densityLevel} Density
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Road Quality Index & Speed Telemetry Banner */}
          <div className={`p-4 rounded-2xl border ${colors.bg} flex flex-col sm:flex-row items-center justify-between gap-4`}>
            <div className="flex items-center gap-3.5 w-full sm:w-auto">
              <div className={`w-14 h-14 rounded-2xl border-2 ${colors.ring} flex flex-col items-center justify-center font-black shrink-0 shadow-lg`}>
                <span className="text-lg leading-none">{summary.roadQualityGrade}</span>
                <span className="text-[9px] uppercase tracking-wider opacity-80 mt-0.5">Grade</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-extrabold text-sm sm:text-base text-white">
                    Overall Road Quality Score
                  </h4>
                  <span className={`font-mono font-bold text-sm ${colors.text}`}>
                    {summary.roadQualityScore}/100
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5 max-w-sm">
                  {summary.roadQualityScore >= 80
                    ? 'Pavement in excellent state. Minimal road anomalies and stable surface.'
                    : summary.roadQualityScore >= 60
                    ? 'Fair driving surface with scattered road imperfections requiring caution.'
                    : 'Degraded surface corridor. Significant potholes or cracks reported.'}
                </p>
              </div>
            </div>

            {/* Speed Stats */}
            <div className="flex items-center gap-4 bg-slate-900/60 p-2.5 px-4 rounded-xl border border-slate-700/60 text-xs shrink-0 self-stretch sm:self-auto justify-around">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Avg Speed</span>
                <span className="text-sm font-bold font-mono text-white">{summary.averageSpeedKmh} km/h</span>
              </div>
              <div className="w-[1px] h-6 bg-slate-700" />
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Max Speed</span>
                <span className="text-sm font-bold font-mono text-cyan-300">{summary.maxSpeedKmh} km/h</span>
              </div>
            </div>
          </div>

          {/* Defect Categories Breakdown */}
          {summary.hazardsDetected > 0 && (
            <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5 flex items-center justify-between">
                <span>Defects by Category</span>
                <span className="text-[11px] text-slate-500 lowercase font-normal">
                  {summary.hazardsDetected} total items
                </span>
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-2">
                  <span className="text-base">🕳️</span>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">Potholes</span>
                    <span className="font-mono font-bold text-white">{summary.typeBreakdown.pothole}</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-2">
                  <span className="text-base">⚡</span>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">Road Cracks</span>
                    <span className="font-mono font-bold text-white">{summary.typeBreakdown.road_crack}</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-2">
                  <span className="text-base">🛑</span>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">Broken Signs</span>
                    <span className="font-mono font-bold text-white">{summary.typeBreakdown.broken_sign}</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-2">
                  <span className="text-base">🏎️</span>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">Speed Violations</span>
                    <span className="font-mono font-bold text-white">{summary.typeBreakdown.vehicle_speed}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* List of Hazards Detected During Drive */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-blue-400" />
                <span>Hazards Recorded in this Drive ({summary.hazardsDetected})</span>
              </h4>
              {summary.hazardsDetected > 0 && (
                <button
                  onClick={() => {
                    onClose();
                    onNavigateToMap();
                  }}
                  className="text-xs text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1 transition-colors"
                >
                  <span>View All on Map</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {summary.hazardsDetected === 0 ? (
              <div className="p-6 rounded-2xl bg-slate-950/40 border border-slate-800 text-center flex flex-col items-center justify-center">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-2">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <h5 className="font-bold text-sm text-slate-200">No Road Defects Encountered</h5>
                <p className="text-xs text-slate-400 max-w-xs mt-1">
                  The monitored road segment maintained clear driving conditions throughout this session.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
                {summary.hazards.map((hazard) => {
                  const isHigh = hazard.severity === 'high';
                  const isMed = hazard.severity === 'medium';
                  const symbol = hazard.type === 'pothole' ? '🕳️' : hazard.type === 'road_crack' ? '⚡' : hazard.type === 'broken_sign' ? '🛑' : '⚠️';

                  return (
                    <div
                      key={hazard.id}
                      className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 hover:border-slate-700 flex items-center justify-between gap-3 transition-colors group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {hazard.imageUrl ? (
                          <img
                            src={hazard.imageUrl}
                            alt={hazard.type}
                            className="w-12 h-12 rounded-lg object-cover border border-slate-700 shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center text-lg shrink-0">
                            {symbol}
                          </div>
                        )}

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-white capitalize truncate">
                              {hazard.type.replace('_', ' ')}
                            </span>
                            <span
                              className={`text-[9px] font-black uppercase px-2 py-0.2 rounded-full border ${
                                isHigh
                                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                  : isMed
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              }`}
                            >
                              {hazard.severity}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            {hazard.description || hazard.locationName}
                          </p>
                          <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1 mt-0.5">
                            <MapPin className="w-2.5 h-2.5 text-slate-400" />
                            <span>
                              {hazard.latitude && hazard.longitude
                                ? `${hazard.latitude.toFixed(4)}°, ${hazard.longitude.toFixed(4)}°`
                                : 'Coordinates stored'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          onClose();
                          onNavigateToMap(hazard.id);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-blue-600 text-slate-300 hover:text-white text-xs font-bold transition-all shrink-0 flex items-center gap-1"
                        title="Locate hazard on map"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Pin</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer with Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportReport}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors flex items-center gap-1.5 border border-slate-700"
              title="Download drive summary JSON"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span>Export JSON</span>
            </button>

            <button
              onClick={handleShareSummary}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors flex items-center gap-1.5 border border-slate-700"
              title="Copy drive metrics to clipboard"
            >
              <Share2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isCopied ? 'Copied!' : 'Copy Summary'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onClose();
                onNavigateToMap();
              }}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-md shadow-blue-600/30 flex items-center gap-1.5"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>Explore on Map</span>
            </button>

            {onStartNewDrive && (
              <button
                onClick={() => {
                  onClose();
                  onStartNewDrive();
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold transition-all border border-slate-700"
              >
                <span>Start New Drive</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold transition-all"
            >
              Done
            </button>
          </div>
        </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
