import React, { useState, useMemo, useEffect } from 'react';
import { RoadHazardRecord, HazardType, SeverityLevel, AILearningStats, VerificationStatusType } from '../types/detection';
import { detectionService } from '../services/detectionService';
import { agentLearningService, LearnedCorrection } from '../services/agentLearningService';
import { imageStorageService } from '../services/imageStorageService';
import { ManualUploadModal } from '../components/ManualUploadModal';
import { ReportInspectionModal } from '../components/ReportInspectionModal';
import {
  Clock,
  ArrowUpDown,
  MapPin,
  Trash2,
  Download,
  Gauge,
  Car,
  Maximize2,
  X,
  Search,
  ExternalLink,
  ShieldCheck,
  Brain,
  Sparkles,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  ThumbsDown,
  Info,
  Check,
  TrendingUp,
  Upload,
  Camera,
  Cpu,
  Eye,
  Filter,
} from 'lucide-react';

interface HistoryPageProps {
  detections: RoadHazardRecord[];
  onOpenDemo: () => void;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({
  detections,
  onOpenDemo,
}) => {
  const [filterType, setFilterType] = useState<'all' | HazardType>('all');
  const [filterVerification, setFilterVerification] = useState<'all' | 'pending' | 'verified' | 'rejected'>('all');
  const [filterSource, setFilterSource] = useState<'all' | 'live_camera' | 'manual_upload'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'severity'>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedImage, setExpandedImage] = useState<{ url: string; title: string } | null>(null);
  const [inspectedRecord, setInspectedRecord] = useState<RoadHazardRecord | null>(null);
  const [isManualUploadOpen, setIsManualUploadOpen] = useState(false);

  // Custom in-app Confirmation Modals (NO window.confirm which is blocked in iFrames)
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [deleteSuccessMsg, setDeleteSuccessMsg] = useState<string | null>(null);

  // Single item delete confirmation
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  // AI Learning Loop State
  const [aiStats, setAiStats] = useState<AILearningStats>(() => detectionService.getAILearningStats());
  const [disputeTarget, setDisputeTarget] = useState<RoadHazardRecord | null>(null);
  const [disputeReasonCategory, setDisputeReasonCategory] = useState<'shadow' | 'manhole' | 'water_puddle' | 'paint_marking' | 'speed_breaker' | 'normal_road'>('manhole');
  const [disputeCustomNotes, setDisputeCustomNotes] = useState('');
  const [aiFeedbackToast, setAiFeedbackToast] = useState<{ title: string; message: string; type: 'confirm' | 'dispute' } | null>(null);

  // Visual Agent Self-Improvement state
  const [learningCorrections, setLearningCorrections] = useState<LearnedCorrection[]>([]);
  const [isLearningLabOpen, setIsLearningLabOpen] = useState(false);
  const [trainItem, setTrainItem] = useState<RoadHazardRecord | null>(null);
  const [selectedActualCategory, setSelectedActualCategory] = useState<LearnedCorrection['actualCategory']>('manhole');
  const [customFeedbackNotes, setCustomFeedbackNotes] = useState('');

  // Subscribe to AI learning stats
  useEffect(() => {
    const unsubLearning = detectionService.subscribeLearning((stats) => {
      setAiStats(stats);
    });
    return unsubLearning;
  }, []);

  // Subscribe to agent learnings
  useEffect(() => {
    setLearningCorrections(agentLearningService.getAll());
    const unsub = agentLearningService.subscribe(() => {
      setLearningCorrections(agentLearningService.getAll());
    });
    return unsub;
  }, []);

  const agentStats = useMemo(() => {
    return agentLearningService.getStats();
  }, [learningCorrections]);

  // Filtering and sorting logic
  const filteredAndSortedRecords = useMemo(() => {
    let result = detections.filter((item) => {
      if (filterType !== 'all' && item.type !== filterType) return false;
      if (filterVerification !== 'all') {
        const itemStatus = item.verificationStatus || (
          item.verifiedStatus === 'confirmed' ? 'verified' : item.verifiedStatus === 'disputed' ? 'rejected' : 'pending'
        );
        if (itemStatus !== filterVerification) return false;
      }
      if (filterSource !== 'all') {
        const itemSource = item.imageSource || 'live_camera';
        if (itemSource !== filterSource) return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const descMatch = item.description?.toLowerCase().includes(query);
        const locMatch = item.locationName?.toLowerCase().includes(query);
        const typeMatch = item.type.toLowerCase().includes(query);
        const vehicleMatch = item.vehicleType?.toLowerCase().includes(query);
        const damageClassMatch = item.damageClass?.toLowerCase().includes(query);
        const damageNameMatch = item.damageName?.toLowerCase().includes(query);
        if (!descMatch && !locMatch && !typeMatch && !vehicleMatch && !damageClassMatch && !damageNameMatch) return false;
      }
      return true;
    });

    result.sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      } else if (sortBy === 'oldest') {
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      } else if (sortBy === 'severity') {
        const order: Record<SeverityLevel, number> = { high: 3, medium: 2, low: 1 };
        return order[b.severity] - order[a.severity];
      }
      return 0;
    });

    return result;
  }, [detections, filterType, filterVerification, filterSource, sortBy, searchQuery]);

  // Execute Delete All History In One Go
  const handleConfirmDeleteAll = async () => {
    setIsDeletingAll(true);
    try {
      await detectionService.clearAll();
      setIsDeleteAllModalOpen(false);
      setDeleteSuccessMsg(`Successfully deleted all detection records in one go.`);
      setTimeout(() => setDeleteSuccessMsg(null), 4000);
    } catch (err: any) {
      console.error('Delete all error:', err);
    } finally {
      setIsDeletingAll(false);
    }
  };

  // Single record deletion
  const handleConfirmDeleteItem = async () => {
    if (!itemToDelete) return;
    await detectionService.deleteDetection(itemToDelete);
    setItemToDelete(null);
  };

  // AI Learning Loop: Confirm Hazard
  const handleConfirmHazard = async (id: string) => {
    const updated = await detectionService.confirmHazard(id);
    if (updated) {
      const stats = detectionService.getAILearningStats();
      setAiFeedbackToast({
        title: '🧠 AI Learning Loop Reinforced!',
        message: `Hazard confirmed. Model positive reinforcement gradient applied. Model accuracy improved to ${stats.modelAccuracy}%.`,
        type: 'confirm',
      });
      setTimeout(() => setAiFeedbackToast(null), 5000);
    }
  };

  // AI Learning Loop: Submit Dispute
  const handleSubmitDispute = async () => {
    if (!disputeTarget) return;

    const reasonText = disputeCustomNotes.trim()
      ? disputeCustomNotes.trim()
      : `Driver flagged as ${disputeReasonCategory.replace('_', ' ')}`;

    await detectionService.disputeHazard(disputeTarget.id, reasonText, disputeReasonCategory);

    const stats = detectionService.getAILearningStats();
    setAiFeedbackToast({
      title: '🧠 AI Learning Loop Adapted!',
      message: `False positive recorded. Suppression penalty applied to '${disputeTarget.type.replace('_', ' ')}'. Model weights recalibrated.`,
      type: 'dispute',
    });
    setTimeout(() => setAiFeedbackToast(null), 5000);

    setDisputeTarget(null);
    setDisputeCustomNotes('');
  };

  // Submit Mistake to Teach Visual Agent (Legacy helper)
  const handleSubmitAgentTraining = async () => {
    if (!trainItem) return;

    const notes =
      customFeedbackNotes.trim() ||
      `Driver flagged ${trainItem.type} as actually being a ${selectedActualCategory.replace('_', ' ')}. Suppress this false positive in similar frames.`;

    await agentLearningService.teachMistake(trainItem.type, selectedActualCategory, notes);
    await detectionService.disputeHazard(trainItem.id, notes, selectedActualCategory);

    setTrainItem(null);
    setCustomFeedbackNotes('');
    setAiFeedbackToast({
      title: '🧠 Visual Agent Prompt Updated',
      message: `Visual Agent learned to suppress "${selectedActualCategory.replace('_', ' ')}" in future video frames.`,
      type: 'dispute',
    });
    setTimeout(() => setAiFeedbackToast(null), 5000);
  };

  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(detections, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `roadguard_records_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const getSeverityBadge = (severity: SeverityLevel) => {
    switch (severity) {
      case 'high':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'medium':
        return 'bg-amber-100 text-amber-700 border-amber-200';
      default:
        return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    }
  };

  const getTypeDetails = (type: HazardType) => {
    switch (type) {
      case 'pothole':
        return { emoji: '🕳️', label: 'Pothole', color: 'text-rose-600' };
      case 'road_crack':
        return { emoji: '⚡', label: 'Road Crack', color: 'text-amber-600' };
      case 'broken_sign':
        return { emoji: '🛑', label: 'Broken Sign', color: 'text-purple-600' };
      case 'other_hazard':
        return { emoji: '⚠️', label: 'Other Hazard', color: 'text-indigo-600' };
      case 'vehicle_speed':
        return { emoji: '🏎️', label: 'Vehicle Speed', color: 'text-blue-600' };
      default:
        return { emoji: '📍', label: 'Road Hazard', color: 'text-slate-600' };
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-3.5 sm:px-6 lg:px-8 py-3.5 sm:py-5 max-w-7xl mx-auto w-full pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:pb-16 space-y-3.5 sm:space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Detection History & AI Learning</h2>
            <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-600" /> Cloud Database & IndexedDB
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {detections.length} road hazards and vehicle speeds recorded with high-resolution photos & GPS
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Upload Photo Button */}
          <button
            onClick={() => setIsManualUploadOpen(true)}
            className="py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
            title="Upload road photo for AI detection"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Photo</span>
          </button>

          {/* AI Learning Loop Hub Toggle */}
          <button
            onClick={() => setIsLearningLabOpen(!isLearningLabOpen)}
            className="py-2 px-3 rounded-xl bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
          >
            <Brain className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
            <span>AI Learning Loop ({aiStats.modelAccuracy}%)</span>
          </button>

          {detections.length > 0 && (
            <>
              <button
                onClick={handleExportJSON}
                className="py-2 px-3 rounded-xl text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 shadow-sm text-xs font-semibold flex items-center gap-1.5"
                title="Export JSON"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Export</span>
              </button>

              {/* Prominent "Delete All History in One Go" Button */}
              <button
                onClick={() => setIsDeleteAllModalOpen(true)}
                className="py-2 px-3.5 rounded-xl text-white bg-rose-600 hover:bg-rose-700 border border-rose-700 shadow-md shadow-rose-600/25 text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all"
                title="Delete all history records in one go"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete All ({detections.length})</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Real-time AI Learning Feedback Banner Toast */}
      {aiFeedbackToast && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-semibold flex items-start gap-3 shadow-lg animate-in slide-in-from-top-2 fade-in duration-200 ${
            aiFeedbackToast.type === 'confirm'
              ? 'bg-emerald-950 text-emerald-100 border-emerald-700'
              : 'bg-indigo-950 text-indigo-100 border-indigo-700'
          }`}
        >
          <div
            className={`p-1.5 rounded-xl shrink-0 ${
              aiFeedbackToast.type === 'confirm' ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white'
            }`}
          >
            <Brain className="w-4 h-4 animate-spin" />
          </div>
          <div className="flex-1">
            <h4 className="font-extrabold text-xs mb-0.5 text-white">{aiFeedbackToast.title}</h4>
            <p className="text-[11px] opacity-90 leading-relaxed">{aiFeedbackToast.message}</p>
          </div>
          <button onClick={() => setAiFeedbackToast(null)} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Success Notice Banners */}
      {deleteSuccessMsg && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{deleteSuccessMsg}</span>
        </div>
      )}

      {/* Interactive AI Learning Loop & Model Evolution Card */}
      {isLearningLabOpen && (
        <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-blue-950 text-white rounded-3xl p-5 sm:p-6 border border-indigo-800/80 shadow-2xl space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600/40 border border-indigo-400 flex items-center justify-center shadow-lg">
                <Brain className="w-5 h-5 text-indigo-300" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-white flex items-center gap-2">
                  <span>AI Learning Loop & Reinforcement Engine</span>
                  <span className="text-[10px] bg-emerald-500/30 text-emerald-300 px-2.5 py-0.5 rounded-full border border-emerald-400/40 font-mono">
                    Model Accuracy: {aiStats.modelAccuracy}%
                  </span>
                </h3>
                <p className="text-xs text-slate-300">
                  When you confirm or dispute a hazard, real-time telemetry updates model weights and suppresses false positives.
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsLearningLabOpen(false)}
              className="text-slate-400 hover:text-white text-xs font-bold"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs pt-1">
            <div className="bg-slate-800/60 p-3 rounded-2xl border border-slate-700/60">
              <span className="text-slate-400 text-[10px] uppercase font-bold block">Model Iteration</span>
              <span className="font-bold text-xs text-indigo-300 font-mono truncate block">
                {aiStats.modelIteration}
              </span>
            </div>
            <div className="bg-slate-800/60 p-3 rounded-2xl border border-slate-700/60">
              <span className="text-slate-400 text-[10px] uppercase font-bold block">Reinforced Confirms</span>
              <span className="font-bold text-sm text-emerald-400 font-mono">
                {aiStats.confirmedCount} Verified
              </span>
            </div>
            <div className="bg-slate-800/60 p-3 rounded-2xl border border-slate-700/60">
              <span className="text-slate-400 text-[10px] uppercase font-bold block">Penalized Disputes</span>
              <span className="font-bold text-sm text-rose-400 font-mono">
                {aiStats.disputedCount} Corrected
              </span>
            </div>
            <div className="bg-slate-800/60 p-3 rounded-2xl border border-slate-700/60">
              <span className="text-slate-400 text-[10px] uppercase font-bold block">Telemetry Status</span>
              <span className="font-semibold text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Active Learning Loop
              </span>
            </div>
          </div>

          {/* Active Model Hazard Weights */}
          <div className="bg-slate-900/60 p-3 rounded-2xl border border-slate-800 text-[11px] space-y-2">
            <span className="font-bold text-slate-300 block text-xs">Dynamic Hazard Weights:</span>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono">
              {Object.entries(aiStats.typeWeights).map(([type, weight]) => (
                <div key={type} className="bg-slate-800/80 p-2 rounded-xl flex items-center justify-between">
                  <span className="text-slate-400 capitalize">{type.replace('_', ' ')}:</span>
                  <span className="font-bold text-indigo-300">{weight.toFixed(2)}x</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar Card */}
      <div className="bg-white rounded-2xl p-3.5 shadow-sm border border-slate-200/90 space-y-2.5 sticky top-0 z-10">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search potholes, scooter speeds, cracks, GPS coordinates..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Type Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setFilterType('all')}
            className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              filterType === 'all'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All ({detections.length})
          </button>
          <button
            onClick={() => setFilterType('pothole')}
            className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              filterType === 'pothole'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>🕳️</span>
            <span>Potholes</span>
          </button>
          <button
            onClick={() => setFilterType('road_crack')}
            className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              filterType === 'road_crack'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>⚡</span>
            <span>Cracks</span>
          </button>
          <button
            onClick={() => setFilterType('broken_sign')}
            className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              filterType === 'broken_sign'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>🛑</span>
            <span>Signs</span>
          </button>
          <button
            onClick={() => setFilterType('other_hazard')}
            className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              filterType === 'other_hazard'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>⚠️</span>
            <span>Other</span>
          </button>
          <button
            onClick={() => setFilterType('vehicle_speed')}
            className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              filterType === 'vehicle_speed'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>🏎️</span>
            <span>Vehicles</span>
          </button>
        </div>

        {/* Secondary Filter Row: Verification Status & Capture Source */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
          {/* Verification Status Filter */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-slate-400 font-semibold mr-1 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-slate-500" /> Status:
            </span>
            {(['all', 'pending', 'verified', 'rejected'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilterVerification(status)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold capitalize transition-all ${
                  filterVerification === status
                    ? status === 'verified'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : status === 'rejected'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : status === 'pending'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'bg-slate-800 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          {/* Capture Source Filter */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-slate-400 font-semibold mr-1 flex items-center gap-1">
              <Camera className="w-3 h-3 text-slate-500" /> Source:
            </span>
            {(['all', 'live_camera', 'manual_upload'] as const).map((source) => (
              <button
                key={source}
                onClick={() => setFilterSource(source)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                  filterSource === source
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {source === 'all' ? 'All' : source === 'live_camera' ? 'Live Cam' : 'Manual Upload'}
              </button>
            ))}
          </div>
        </div>

        {/* Sort and View Details Bar */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
          <span>Showing {filteredAndSortedRecords.length} records</span>
          <div className="flex items-center gap-2">
            <span className="text-slate-400 flex items-center gap-1">
              <ArrowUpDown className="w-3 h-3" /> Sort:
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 focus:outline-none"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="severity">Highest Severity</option>
            </select>
          </div>
        </div>
      </div>

      {/* Record Cards Grid */}
      {filteredAndSortedRecords.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200/90 shadow-sm space-y-4">
          <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mx-auto text-2xl border border-slate-100">
            🔍
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-base">No Records Found</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              {detections.length === 0
                ? 'All detection history records have been cleared. Launch the Live Camera Scanner or Test Lab to log new road hazards.'
                : 'No detections match your current filter criteria.'}
            </p>
          </div>
          {detections.length === 0 && (
            <button
              onClick={onOpenDemo}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md"
            >
              Launch AI Test Lab
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredAndSortedRecords.map((item) => {
            const typeInfo = getTypeDetails(item.type);
            const dateObj = new Date(item.timestamp);
            const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const dateStr = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

            const damageClassInfo = item.damageClass ? {
              D00: { label: 'D00 • Longitudinal Crack', bg: 'bg-sky-50 text-sky-700 border-sky-200' },
              D10: { label: 'D10 • Transverse Crack', bg: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
              D20: { label: 'D20 • Alligator Crack', bg: 'bg-amber-50 text-amber-700 border-amber-200' },
              D40: { label: 'D40 • Pothole', bg: 'bg-rose-50 text-rose-700 border-rose-200' },
            }[item.damageClass as 'D00' | 'D10' | 'D20' | 'D40'] : null;

            const effectiveStatus: VerificationStatusType = item.verificationStatus || (
              item.verifiedStatus === 'confirmed' ? 'verified' : item.verifiedStatus === 'disputed' ? 'rejected' : 'pending'
            );

            const hasPhoto = Boolean(item.imageUrl || item.annotatedImageUrl);
            const thumbUrl = item.annotatedImageUrl || item.imageUrl;

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/90 hover:shadow-md transition-all flex flex-col gap-3 group relative overflow-hidden"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {/* Thumbnail or Category Emoji */}
                    {hasPhoto && thumbUrl ? (
                      <div
                        onClick={() => setInspectedRecord(item)}
                        className="relative w-14 h-14 rounded-xl overflow-hidden bg-slate-900 border border-slate-200 shrink-0 cursor-pointer group/thumb shadow-sm hover:ring-2 hover:ring-blue-500 transition-all"
                        title="Click to inspect original and YOLOv8 annotated photos"
                      >
                        <img
                          src={thumbUrl}
                          alt="Road detection"
                          className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform"
                        />
                        {item.annotatedImageUrl && (
                          <span className="absolute bottom-0 inset-x-0 bg-blue-600/90 text-[8px] font-bold text-white text-center py-0.5 tracking-wider uppercase">
                            YOLO
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-2xl p-2.5 rounded-xl bg-slate-50 border border-slate-100 shrink-0">
                        {typeInfo.emoji}
                      </span>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h4 className="font-bold text-slate-900 text-sm truncate">
                          {item.damageName || typeInfo.label}
                        </h4>
                        {damageClassInfo && (
                          <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border ${damageClassInfo.bg}`}>
                            {damageClassInfo.label}
                          </span>
                        )}
                        <span
                          className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-full border ${getSeverityBadge(
                            item.severity
                          )}`}
                        >
                          {item.severity}
                        </span>
                        {item.type === 'vehicle_speed' && item.estimatedSpeedKmh && (
                          <span
                            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                              item.isOverSpeed
                                ? 'bg-red-50 text-red-700 border-red-200'
                                : 'bg-blue-50 text-blue-700 border-blue-200'
                            }`}
                          >
                            {item.estimatedSpeedKmh} km/h
                          </span>
                        )}
                      </div>

                      {/* Source & AI Engine Subtitle */}
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-500">
                        <span className="font-semibold text-blue-600">
                          {Math.round(item.confidence * 100)}% Confidence
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-[10px] text-slate-500">
                          {item.imageSource === 'manual_upload' ? (
                            <span className="flex items-center gap-0.5 text-indigo-600 font-semibold">
                              <Upload className="w-2.5 h-2.5" /> Manual
                            </span>
                          ) : (
                            <span className="flex items-center gap-0.5 text-emerald-600 font-semibold">
                              <Camera className="w-2.5 h-2.5" /> Live Cam
                            </span>
                          )}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1 font-mono text-[10px] text-slate-400">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {dateStr} at {timeStr}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Top Right Action Icons */}
                  <div className="flex items-center gap-1 shrink-0">
                    {item.latitude && item.longitude && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${item.latitude},${item.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold flex items-center gap-1 transition-colors"
                        title="View GPS location in Google Maps"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button
                      onClick={() => setItemToDelete(item.id)}
                      className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      title="Delete record"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Description */}
                <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  {item.description}
                </p>

                {/* Verification Status Banner & Admin Controls */}
                <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50/90 p-2.5 rounded-xl border border-slate-100 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] text-slate-500 font-medium shrink-0">Admin Status:</span>
                    {effectiveStatus === 'verified' ? (
                      <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Verified
                      </span>
                    ) : effectiveStatus === 'rejected' ? (
                      <span className="text-[10px] font-bold bg-rose-100 text-rose-800 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-rose-600" /> Rejected
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                        <Clock className="w-3 h-3 text-amber-600" /> Pending Review
                      </span>
                    )}

                    {item.aiEngine && (
                      <span className="text-[9px] font-mono px-2 py-0.5 bg-slate-200/80 text-slate-700 rounded-md">
                        {item.aiEngine}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setInspectedRecord(item)}
                      className="py-1 px-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold shadow-sm flex items-center gap-1 transition-all active:scale-95"
                      title="Inspect original & annotated photo, storage URL, and verify"
                    >
                      <Eye className="w-3 h-3" />
                      <span>Inspect & Verify</span>
                    </button>
                  </div>
                </div>

                {/* Location and Info Row */}
                <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
                  <span className="flex items-center gap-1 font-mono text-[11px] text-slate-600 truncate max-w-[220px]">
                    <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    {item.locationName || (item.latitude && item.longitude
                      ? `${item.latitude.toFixed(4)}°, ${item.longitude.toFixed(4)}°`
                      : 'Location saved')}
                  </span>

                  {hasPhoto && (
                    <button
                      onClick={() => setInspectedRecord(item)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View Storage Photo</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 1. In-App Modal: DELETE ALL HISTORY IN ONE GO */}
      {isDeleteAllModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-150">
            <div className="p-5 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
                <Trash2 className="w-7 h-7" />
              </div>

              <h3 className="font-extrabold text-base text-slate-900">
                Delete All History in One Go?
              </h3>

              <p className="text-xs text-slate-600 leading-relaxed">
                This will permanently delete all <strong>{detections.length} recorded hazards and vehicle speed records</strong> from Cloud MySQL, IndexedDB, and the Map.
              </p>

              <p className="text-[11px] text-rose-600 font-semibold">
                This action cannot be undone.
              </p>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setIsDeleteAllModalOpen(false)}
                disabled={isDeletingAll}
                className="py-2.5 px-4 rounded-xl text-slate-600 hover:bg-slate-200 font-semibold text-xs transition-colors"
              >
                Cancel
              </button>

              <button
                onClick={handleConfirmDeleteAll}
                disabled={isDeletingAll}
                className="py-2.5 px-5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-rose-600/30 transition-all active:scale-95 disabled:opacity-50"
              >
                {isDeletingAll ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Deleting All...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirm Delete All</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. In-App Modal: Single Item Deletion */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-3">
            <h3 className="font-bold text-sm text-slate-900">Delete this record?</h3>
            <p className="text-xs text-slate-600">
              This detection will be removed from your cloud history and map.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setItemToDelete(null)}
                className="py-2 px-3 text-xs text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteItem}
                className="py-2 px-4 text-xs text-white bg-rose-600 hover:bg-rose-700 rounded-lg font-bold shadow-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. In-App Modal: AI LEARNING LOOP - DISPUTE HAZARD */}
      {disputeTarget && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl text-white animate-in fade-in zoom-in duration-150">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-rose-400 animate-pulse" />
                <div>
                  <h3 className="font-extrabold text-sm text-white">Dispute Hazard • AI Learning Loop</h3>
                  <span className="text-[11px] text-slate-400">Penalize False Positive & Train Model Weights</span>
                </div>
              </div>
              <button
                onClick={() => setDisputeTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700 space-y-1">
                <span className="text-slate-400 font-bold block text-[10px] uppercase">Detected As</span>
                <div className="font-bold text-sm text-amber-300 flex items-center gap-1.5">
                  <span>{getTypeDetails(disputeTarget.type).emoji}</span>
                  <span>{getTypeDetails(disputeTarget.type).label}</span>
                </div>
                <p className="text-slate-300 italic text-[11px]">{disputeTarget.description}</p>
              </div>

              <div className="space-y-2">
                <label className="font-bold text-slate-300 block">
                  Why is this a mistake? (Select true road feature)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'manhole', label: '🔘 Manhole Lid / Sewer' },
                    { id: 'shadow', label: '🌲 Tree / Pole Shadow' },
                    { id: 'water_puddle', label: '💧 Water Puddle' },
                    { id: 'speed_breaker', label: '🛑 Speed Hump / Bump' },
                    { id: 'paint_marking', label: '🎨 Road Paint / Marking' },
                    { id: 'normal_road', label: '🛣️ Normal Clean Asphalt' },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setDisputeReasonCategory(cat.id as any)}
                      className={`p-2.5 rounded-xl border text-left font-semibold text-xs transition-all ${
                        disputeReasonCategory === cat.id
                          ? 'bg-rose-600 border-rose-400 text-white shadow-md'
                          : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-700/60'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-300 block">
                  Additional Driver Notes (Optional):
                </label>
                <input
                  type="text"
                  value={disputeCustomNotes}
                  onChange={(e) => setDisputeCustomNotes(e.target.value)}
                  placeholder="e.g. Circular sewer lid on center lane, no cavity"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="bg-rose-950/60 p-3 rounded-xl border border-rose-800/60 text-[11px] text-rose-200 flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>
                  The AI model will record this negative gradient, lower confidence bias for '{disputeTarget.type.replace('_', ' ')}', and inject this feedback into future perception cycles.
                </span>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
              <button
                onClick={() => setDisputeTarget(null)}
                className="py-2 px-3 text-slate-400 hover:text-white font-semibold text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitDispute}
                className="py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-rose-600/30 flex items-center gap-1.5"
              >
                <Brain className="w-3.5 h-3.5" />
                <span>Apply Dispute & Train Model</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Fullscreen Photo Modal */}
      {expandedImage && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-3xl w-full bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-800 animate-in fade-in">
            <div className="p-3 border-b border-slate-800 flex items-center justify-between text-white">
              <span className="font-bold text-xs">{expandedImage.title}</span>
              <button
                onClick={() => setExpandedImage(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex items-center justify-center bg-black max-h-[75vh]">
              <img
                src={expandedImage.url}
                alt={expandedImage.title}
                className="max-h-[70vh] object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}

      {/* 5. Report Inspection & Verification Modal */}
      <ReportInspectionModal
        record={inspectedRecord}
        isOpen={Boolean(inspectedRecord)}
        onClose={() => setInspectedRecord(null)}
      />

      {/* 6. Manual Road Image Upload Modal */}
      <ManualUploadModal
        isOpen={isManualUploadOpen}
        onClose={() => setIsManualUploadOpen(false)}
      />
    </div>
  );
};
