import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { RoadHazardRecord, MonitoringStats, AILearningStats } from '../types/detection';
import { detectionService } from '../services/detectionService';
import { DriveSummary } from '../services/driveSessionService';
import { AnimatedCounter } from '../components/AnimatedCounter';
import {
  pageVariants,
  cardHoverProps,
  buttonPressProps,
  staggerContainerVariants,
  staggerItemVariants,
  progressBarTransition,
} from '../utils/motion';
import {
  AlertTriangle,
  Camera,
  MapPin,
  TrendingUp,
  Activity,
  Flame,
  Clock,
  ArrowRight,
  ShieldCheck,
  Zap,
  Gauge,
  Layers,
  Car,
  Brain,
  CheckCircle2,
  Navigation,
  FileText,
  ChevronRight,
  Calendar,
  Upload,
  Filter,
  CheckCircle,
  XCircle,
  Cpu,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { HazardTrendLineChart } from '../components/HazardTrendLineChart';
import { WebsiteFeatureSection } from '../components/WebsiteFeatureSection';
import { ManualUploadModal } from '../components/ManualUploadModal';
import { ReportInspectionModal } from '../components/ReportInspectionModal';
import { imageStorageService } from '../services/imageStorageService';

interface DashboardPageProps {
  stats: MonitoringStats;
  recentDetections: RoadHazardRecord[];
  isMonitoring: boolean;
  onStartMonitoring: () => void;
  onNavigateToHistory: () => void;
  onNavigateToSchedule?: () => void;
  onOpenDemo: () => void;
  lastDriveSummary?: DriveSummary | null;
  onOpenDriveSummary?: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  stats,
  recentDetections,
  isMonitoring,
  onStartMonitoring,
  onNavigateToHistory,
  onNavigateToSchedule,
  onOpenDemo,
  lastDriveSummary,
  onOpenDriveSummary,
}) => {
  const { userProfile, updatePreferredMode } = useAuth();
  const [aiStats, setAiStats] = useState<AILearningStats>(() => detectionService.getAILearningStats());
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [inspectedRecord, setInspectedRecord] = useState<RoadHazardRecord | null>(null);
  const [filterVerification, setFilterVerification] = useState<'all' | 'pending' | 'verified' | 'rejected'>('all');
  const [filterSource, setFilterSource] = useState<'all' | 'live_camera' | 'manual_upload'>('all');

  useEffect(() => {
    const unsub = detectionService.subscribeLearning((newStats) => {
      setAiStats(newStats);
    });
    return unsub;
  }, []);

  const potholePercent = stats.total > 0 ? Math.round((stats.potholes / stats.total) * 100) : 0;
  const speedPercent = stats.total > 0 ? Math.round((stats.speedDetections / stats.total) * 100) : 0;
  const crackPercent = stats.total > 0 ? Math.round((stats.roadCracks / stats.total) * 100) : 0;
  const signPercent = stats.total > 0 ? Math.round((stats.brokenSigns / stats.total) * 100) : 0;

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'medium':
        return 'bg-amber-100 text-amber-700 border-amber-200';
      default:
        return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'pothole':
        return { emoji: '🕳️', label: 'Pothole' };
      case 'vehicle_speed':
        return { emoji: '🏎️', label: 'Vehicle Speed' };
      case 'road_crack':
        return { emoji: '⚡', label: 'Road Crack' };
      case 'broken_sign':
        return { emoji: '🛑', label: 'Broken Sign' };
      default:
        return { emoji: '⚠️', label: 'Observation' };
    }
  };

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-7"
    >
      {/* Hero Welcome Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 rounded-3xl p-5 sm:p-7 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-1.5 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/30 border border-blue-400/40 text-blue-200">
                AI Vision & Radar System
              </span>
              <span className="text-xs text-blue-200">• Road Safety Platform</span>
            </div>
            <h2 className="text-xl sm:text-3xl font-extrabold tracking-tight">
              Real-Time Road Hazard & Speed Radar Monitor
            </h2>
            <p className="text-xs sm:text-sm text-blue-100/90 leading-relaxed">
              Detect potholes, asphalt fissures, degraded road signs, and vehicle velocity using smartphone camera & on-device AI.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <motion.button
              {...buttonPressProps}
              onClick={onStartMonitoring}
              className="py-3 px-5 rounded-2xl bg-white text-blue-700 hover:bg-blue-50 font-bold text-xs sm:text-sm shadow-lg shadow-black/10 flex items-center gap-2 transition-transform"
            >
              <Camera className="w-4 h-4 text-blue-600" />
              <span>{isMonitoring ? 'Open Live Camera' : 'Start Camera Monitor'}</span>
            </motion.button>

            <motion.button
              {...buttonPressProps}
              onClick={() => setIsUploadModalOpen(true)}
              className="py-3 px-4 rounded-2xl bg-emerald-600/90 hover:bg-emerald-600 text-white font-semibold text-xs sm:text-sm border border-emerald-400/40 transition-colors flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
            >
              <Upload className="w-4 h-4 text-emerald-200" />
              <span>Upload Road Photo</span>
            </motion.button>

            <motion.button
              {...buttonPressProps}
              onClick={onOpenDemo}
              className="py-3 px-4 rounded-2xl bg-blue-800/80 hover:bg-blue-800 text-white font-semibold text-xs sm:text-sm border border-blue-500/40 transition-colors"
            >
              <Zap className="w-4 h-4 text-amber-300 inline mr-1.5" />
              Test Lab
            </motion.button>

            {onNavigateToSchedule && (
              <motion.button
                {...buttonPressProps}
                onClick={onNavigateToSchedule}
                className="py-3 px-4 rounded-2xl bg-indigo-800/80 hover:bg-indigo-800 text-white font-semibold text-xs sm:text-sm border border-indigo-500/40 transition-colors flex items-center gap-1.5"
              >
                <Calendar className="w-4 h-4 text-indigo-300" />
                <span>Work Orders & Patrols</span>
              </motion.button>
            )}
          </div>
        </div>
      </div>

      {/* Latest Completed Drive Summary Card with Spring Hover */}
      {lastDriveSummary && (
        <motion.div
          {...cardHoverProps}
          className="bg-slate-900 border border-slate-700/90 text-white rounded-3xl p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-400/40 flex items-center justify-center text-blue-400 shrink-0">
              <Navigation className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 text-cyan-300 border border-blue-400/30">
                  Latest Drive Summary
                </span>
                <span className="text-xs text-slate-400">
                  {new Date(lastDriveSummary.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <h3 className="font-extrabold text-sm sm:text-base text-white mt-0.5">
                {lastDriveSummary.distanceKm} km Monitored • {lastDriveSummary.hazardsDetected} Hazards Detected
              </h3>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {/* Density Metric */}
            <div className="bg-slate-800/80 px-3.5 py-2 rounded-xl border border-slate-700/80 text-center">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Hazard Density</span>
              <span className="text-sm font-black text-amber-300 font-mono">
                {lastDriveSummary.hazardDensityScore} <span className="text-[10px] font-normal text-slate-400">/ km</span>
              </span>
            </div>

            {/* Quality Score */}
            <div className="bg-slate-800/80 px-3.5 py-2 rounded-xl border border-slate-700/80 text-center">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Road Quality</span>
              <span className="text-sm font-black text-emerald-400 font-mono">
                {lastDriveSummary.roadQualityScore}/100 ({lastDriveSummary.roadQualityGrade})
              </span>
            </div>

            {onOpenDriveSummary && (
              <motion.button
                {...buttonPressProps}
                onClick={onOpenDriveSummary}
                className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-600/30 transition-all flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>View Full Summary</span>
              </motion.button>
            )}
          </div>
        </motion.div>
      )}

      {/* AI Learning Loop & Continuous Improvement Banner Card */}
      <motion.div
        {...cardHoverProps}
        className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-5 sm:p-6 border border-indigo-900/60 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-5"
      >
        <div className="flex items-start sm:items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/30 border border-indigo-400/50 flex items-center justify-center text-indigo-300 shrink-0 shadow-lg">
            <Brain className="w-6 h-6 animate-pulse" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-extrabold text-base text-white">AI Learning Loop Active</h3>
              <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full flex items-center gap-1 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Adaptive Model RLHF
              </span>
            </div>
            <p className="text-xs text-slate-300 max-w-xl">
              Model accuracy continuously improves as drivers confirm or dispute detected hazards. Feedback adjusts model classification weights in real-time.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="bg-slate-800/80 px-4 py-2.5 rounded-2xl border border-slate-700/80 text-center">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Model Accuracy</span>
            <span className="text-lg font-black text-emerald-400 font-mono">
              <AnimatedCounter value={aiStats.modelAccuracy} decimals={1} suffix="%" />
            </span>
          </div>

          <div className="bg-slate-800/80 px-4 py-2.5 rounded-2xl border border-slate-700/80 text-center">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Reinforcements</span>
            <span className="text-lg font-black text-indigo-300 font-mono">
              <AnimatedCounter value={aiStats.confirmedCount} suffix=" Verified" />
            </span>
          </div>

          <motion.button
            {...buttonPressProps}
            onClick={onNavigateToHistory}
            className="py-2.5 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-1.5 active:scale-95"
          >
            <span>Review & Train</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </motion.button>
        </div>
      </motion.div>

      {/* Primary KPI Metrics Grid with Stagger & Spring Hover */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
        {/* Total Road Observations */}
        <motion.div
          {...cardHoverProps}
          className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-200/90 transition-shadow"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Hazards</span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600 text-lg leading-none">
              📊
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900">
            <AnimatedCounter value={stats.total} />
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1 font-mono">
            <Clock className="w-3 h-3 text-slate-400" />
            <span>
              <AnimatedCounter value={stats.today} /> logged today
            </span>
          </div>
        </motion.div>

        {/* Potholes Detected */}
        <motion.div
          {...cardHoverProps}
          className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-200/90 transition-shadow"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-600">Potholes</span>
            <div className="p-2 rounded-xl bg-rose-50 text-rose-600 text-lg leading-none">
              🕳️
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900">
            <AnimatedCounter value={stats.potholes} />
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {potholePercent}% of road issues
          </div>
        </motion.div>

        {/* Vehicle Speeds */}
        <motion.div
          {...cardHoverProps}
          className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-200/90 transition-shadow"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-sky-600">Speed Radar</span>
            <div className="p-2 rounded-xl bg-sky-50 text-sky-600 text-lg leading-none">
              🏎️
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900">
            <AnimatedCounter value={stats.speedDetections} />
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {speedPercent}% cars/scooters
          </div>
        </motion.div>

        {/* Road Cracks */}
        <motion.div
          {...cardHoverProps}
          className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-200/90 transition-shadow"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-600">Road Cracks</span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600 text-lg leading-none">
              ⚡
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900">
            <AnimatedCounter value={stats.roadCracks} />
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {crackPercent}% surface fractures
          </div>
        </motion.div>
      </div>

      {/* Two Column Section on Desktop / Stack on Mobile: Trend Chart & Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 7-Day Trend Chart */}
        <motion.div {...cardHoverProps} className="lg:col-span-2">
          <HazardTrendLineChart detections={recentDetections} />
        </motion.div>

        {/* Breakdown Progress Bars with Smooth Width Transitions */}
        <motion.div
          {...cardHoverProps}
          className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/90 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                Detection Ratio
              </h3>
              <span className="text-xs font-medium text-red-600 bg-red-50 border border-red-100 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <Flame className="w-3 h-3" /> {stats.highSeverity} High Severity
              </span>
            </div>

            <div className="space-y-4 pt-1">
              {/* Potholes Bar */}
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-semibold text-slate-700 flex items-center gap-1">
                    🕳️ Potholes
                  </span>
                  <span className="font-mono text-slate-500">{stats.potholes} ({potholePercent}%)</span>
                </div>
                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(stats.potholes > 0 ? 5 : 0, potholePercent)}%` }}
                    transition={progressBarTransition}
                    className="bg-rose-500 h-full rounded-full"
                  />
                </div>
              </div>

              {/* Vehicle Speeds Bar */}
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-semibold text-slate-700 flex items-center gap-1">
                    🏎️ Vehicle Speeds
                  </span>
                  <span className="font-mono text-slate-500">{stats.speedDetections} ({speedPercent}%)</span>
                </div>
                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(stats.speedDetections > 0 ? 5 : 0, speedPercent)}%` }}
                    transition={progressBarTransition}
                    className="bg-sky-500 h-full rounded-full"
                  />
                </div>
              </div>

              {/* Cracks Bar */}
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-semibold text-slate-700 flex items-center gap-1">
                    ⚡ Road Cracks
                  </span>
                  <span className="font-mono text-slate-500">{stats.roadCracks} ({crackPercent}%)</span>
                </div>
                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(stats.roadCracks > 0 ? 5 : 0, crackPercent)}%` }}
                    transition={progressBarTransition}
                    className="bg-amber-500 h-full rounded-full"
                  />
                </div>
              </div>

              {/* Signs Bar */}
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-semibold text-slate-700 flex items-center gap-1">
                    🛑 Broken Signs
                  </span>
                  <span className="font-mono text-slate-500">{stats.brokenSigns} ({signPercent}%)</span>
                </div>
                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(stats.brokenSigns > 0 ? 5 : 0, signPercent)}%` }}
                    transition={progressBarTransition}
                    className="bg-purple-500 h-full rounded-full"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Real-time safety coverage</span>
            <button
              onClick={onNavigateToHistory}
              className="text-blue-600 font-semibold hover:underline"
            >
              Inspect all
            </button>
          </div>
        </motion.div>
      </div>

      {/* Recent Detections Grid */}
      <div>
        <div className="flex items-center justify-between mb-3.5">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              Recent Road Hazards & Speed Radar Detections
            </h3>
            <p className="text-xs text-slate-500">
              Live captures saved with high-res camera snapshots and GPS coordinates
            </p>
          </div>
          {recentDetections.length > 0 && (
            <button
              onClick={onNavigateToHistory}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 py-1.5 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 transition-colors"
            >
              <span>View All History</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter controls row */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3.5 bg-slate-50 p-2 rounded-2xl border border-slate-200">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1 pl-1">
              <Filter className="w-3 h-3 text-slate-400" />
              Status:
            </span>
            {(['all', 'pending', 'verified', 'rejected'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilterVerification(status)}
                className={`py-1 px-2.5 rounded-xl text-[11px] font-bold transition-all capitalize ${
                  filterVerification === status
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                {status === 'all' ? 'All Status' : status}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold text-slate-500 pl-1">Source:</span>
            {(['all', 'live_camera', 'manual_upload'] as const).map((source) => (
              <button
                key={source}
                onClick={() => setFilterSource(source)}
                className={`py-1 px-2.5 rounded-xl text-[11px] font-bold transition-all capitalize ${
                  filterSource === source
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                {source === 'all' ? 'All Sources' : source.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {(() => {
          const filtered = recentDetections.filter((item) => {
            const itemStatus = item.verificationStatus || (
              item.verifiedStatus === 'confirmed' ? 'verified' : item.verifiedStatus === 'disputed' ? 'rejected' : 'pending'
            );
            if (filterVerification !== 'all' && itemStatus !== filterVerification) return false;

            const itemSource = item.imageSource || 'live_camera';
            if (filterSource !== 'all' && itemSource !== filterSource) return false;

            return true;
          });

          if (filtered.length === 0) {
            return (
              <div className="bg-white rounded-3xl p-8 text-center border border-slate-200/90 shadow-sm max-w-lg mx-auto">
                <span className="text-4xl block mb-2">📸</span>
                <h4 className="font-bold text-slate-800 text-base mb-1">
                  {recentDetections.length === 0 ? 'No Road Hazards Logged Yet' : 'No Reports Match Filter'}
                </h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
                  {recentDetections.length === 0
                    ? 'Mount your phone on the dashboard or upload road photos to save road hazards and images in the MySQL database.'
                    : 'Try selecting "All Status" or "All Sources" to see all logged road hazard records.'}
                </p>
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => setIsUploadModalOpen(true)}
                    className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-500/20 transition-all flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Road Photo</span>
                  </button>
                  <button
                    onClick={onStartMonitoring}
                    className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all"
                  >
                    Start Camera Detection
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filtered.slice(0, 8).map((item) => {
                const iconInfo = getTypeIcon(item.type);
                const dateObj = new Date(item.timestamp);
                const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const dateStr = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });

                const damageClass =
                  item.damageClass ||
                  imageStorageService.extractDamageClass({
                    type: item.type,
                    confidence: item.confidence,
                    severity: item.severity,
                    description: item.description,
                    box2d: item.box2d,
                  });

                const damageName =
                  item.damageName || imageStorageService.resolveDamageName(damageClass, item.type);

                const status = item.verificationStatus || (
                  item.verifiedStatus === 'confirmed' ? 'verified' : item.verifiedStatus === 'disputed' ? 'rejected' : 'pending'
                );

                return (
                  <div
                    key={item.id}
                    onClick={() => setInspectedRecord(item)}
                    className="bg-white rounded-2xl p-3.5 shadow-sm border border-slate-200/90 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer flex items-center justify-between gap-3 group relative"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="text-2xl p-2.5 rounded-xl bg-slate-50 border border-slate-100 shrink-0">
                        {iconInfo.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-mono font-black px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                            {damageClass}
                          </span>
                          <span className="font-bold text-sm text-slate-900 group-hover:text-blue-600 transition-colors truncate">
                            {damageName}
                          </span>
                          <span
                            className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-full border ${getSeverityBadge(
                              item.severity
                            )}`}
                          >
                            {item.severity}
                          </span>
                        </div>

                        <p className="text-xs text-slate-500 truncate mt-0.5">{item.description}</p>

                        <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-1 flex-wrap">
                          <span className="font-mono flex items-center gap-1 truncate">
                            <MapPin className="w-3 text-rose-500 shrink-0" />
                            {item.locationName || `${item.latitude?.toFixed(3)}°, ${item.longitude?.toFixed(3)}°`}
                          </span>
                          <span>•</span>
                          <span className="shrink-0">{dateStr}, {timeStr}</span>
                          <span>•</span>
                          <span className="font-mono text-slate-600 font-bold">
                            {Math.round(item.confidence * 100)}% conf
                          </span>
                        </div>

                        {/* Status & Engine tags */}
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <span
                            className={`text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                              status === 'verified'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : status === 'rejected'
                                ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}
                          >
                            {status === 'verified' ? (
                              <CheckCircle2 className="w-2.5 h-2.5" />
                            ) : status === 'rejected' ? (
                              <XCircle className="w-2.5 h-2.5" />
                            ) : (
                              <Clock className="w-2.5 h-2.5" />
                            )}
                            <span className="capitalize">{status}</span>
                          </span>

                          <span className="text-[9px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            {item.aiEngine === 'yolov8-nano' ? '⚡ YOLOv8' : '☁️ Gemini'}
                          </span>

                          {item.imageSource === 'manual_upload' && (
                            <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">
                              Manual Upload
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {(item.annotatedImageUrl || item.imageUrl) && (
                        <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200 bg-slate-900 shrink-0">
                          <img
                            src={item.annotatedImageUrl || item.imageUrl}
                            alt="Hazard thumbnail"
                            className="w-full h-full object-cover"
                          />
                          {item.annotatedImageUrl && (
                            <span className="absolute bottom-0 inset-x-0 bg-blue-900/90 text-white text-[8px] font-mono text-center py-0.5 font-bold">
                              ANNOTATED
                            </span>
                          )}
                        </div>
                      )}
                      <span className="p-2 rounded-xl bg-slate-50 group-hover:bg-blue-50 text-slate-400 group-hover:text-blue-600 transition-colors">
                        <ArrowRight className="w-4 h-4" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Website Feature Showcase Section */}
      <WebsiteFeatureSection
        onStartMonitoring={onStartMonitoring}
        onNavigateToHistory={onNavigateToHistory}
        onOpenDemo={onOpenDemo}
      />

      {/* Manual Upload Road Report Modal */}
      <ManualUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onReportSaved={(reportId) => {
          setIsUploadModalOpen(false);
          const saved = recentDetections.find((r) => r.id === reportId);
          if (saved) {
            setInspectedRecord(saved);
          }
        }}
      />

      {/* Report Inspection & Administrator Verification Modal */}
      <ReportInspectionModal
        record={inspectedRecord}
        isOpen={Boolean(inspectedRecord)}
        onClose={() => setInspectedRecord(null)}
        onStatusUpdated={(updated) => {
          setInspectedRecord(updated);
        }}
      />
    </motion.div>
  );
};
