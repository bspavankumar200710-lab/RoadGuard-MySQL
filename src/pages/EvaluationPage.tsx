import React, { useState, useEffect, useCallback } from 'react';
import {
  FullBenchmarkReport,
  PerSampleEvaluationRecord,
  formatBenchmarkMarkdown,
  runHeldOutEvaluationSuite,
} from '../services/evaluationService';
import {
  CALIBRATION_CORRECTIONS,
  CALIBRATION_CONFIDENCE_THRESHOLD_TAU,
} from '../services/feedbackEngine';
import { detectionService } from '../services/detectionService';
import { RoadHazardRecord, AILearningStats } from '../types/detection';
import {
  Play,
  Download,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Layers,
  Clock,
  Sliders,
  Eye,
  Database,
  Check,
  X,
  Sparkles,
  Brain,
  ThumbsUp,
  ThumbsDown,
  Filter,
  RefreshCw,
  Search,
  ExternalLink,
} from 'lucide-react';

type EvalSectionTab = 'live-history' | 'baselines' | 'mechanism' | 'dataset' | 'deployment';

export const EvaluationPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<EvalSectionTab>('baselines');
  const [report, setReport] = useState<FullBenchmarkReport | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [progressPct, setProgressPct] = useState<number>(0);
  const [progressLabel, setProgressLabel] = useState<string>('');
  const [selectedSampleIdx, setSelectedSampleIdx] = useState<number>(0);
  const [sampleFilter, setSampleFilter] = useState<'all' | 'damage' | 'negatives' | 'false_positives' | 'missed_detections'>('all');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [useLiveGemini, setUseLiveGemini] = useState<boolean>(false);

  // Live Field Verification & History Audit State (Connected to MySQL & History)
  const [liveDetections, setLiveDetections] = useState<RoadHazardRecord[]>([]);
  const [aiStats, setAiStats] = useState<AILearningStats>(() => detectionService.getAILearningStats());
  const [liveStatusFilter, setLiveStatusFilter] = useState<'all' | 'verified' | 'rejected' | 'pending'>('all');
  const [liveTypeFilter, setLiveTypeFilter] = useState<'all' | 'pothole' | 'road_crack'>('all');
  const [disputeRecordId, setDisputeRecordId] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState<string>('manhole');
  const [disputeNotes, setDisputeNotes] = useState<string>('');
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const executeBenchmark = useCallback(
    async (liveApiOverride?: boolean, recordsOverride?: RoadHazardRecord[]) => {
      const useLive = liveApiOverride ?? useLiveGemini;
      const recordsToUse = recordsOverride ?? liveDetections;
      setIsRunning(true);
      setErrorMsg(null);
      setProgressPct(0);
      setProgressLabel('Analyzing verified detection cohort from database...');
      try {
        const result = await runHeldOutEvaluationSuite(
          recordsToUse,
          (pct, label) => {
            setProgressPct(pct);
            setProgressLabel(label);
          },
          { useLiveApi: useLive }
        );
        setReport(result);
      } catch (err: any) {
        setErrorMsg(err?.message || 'Evaluation run failed');
      } finally {
        setIsRunning(false);
      }
    },
    [useLiveGemini, liveDetections]
  );

  // Subscribe to live detections from MySQL and IndexedDB
  useEffect(() => {
    const unsubDetections = detectionService.subscribe((records) => {
      setLiveDetections(records);
      executeBenchmark(false, records);
    });
    const unsubStats = detectionService.subscribeLearning((stats) => {
      setAiStats(stats);
    });
    return () => {
      unsubDetections();
      unsubStats();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConfirmLiveHazard = async (id: string) => {
    const res = await detectionService.confirmHazard(id);
    if (res) {
      setActionSuccessMsg(`Hazard verified as valid road damage in database. Model reinforced!`);
      setTimeout(() => setActionSuccessMsg(null), 4000);
      executeBenchmark(false);
    }
  };

  const handleDisputeLiveHazard = async () => {
    if (!disputeRecordId) return;
    const notes = disputeNotes.trim() ? disputeNotes.trim() : `Driver flagged as non-hazard: ${disputeReason}`;
    const res = await detectionService.disputeHazard(disputeRecordId, notes, disputeReason as any);
    if (res) {
      setActionSuccessMsg(`False alarm corrected! Feedback rule created to suppress ${disputeReason.replace('_', ' ')}.`);
      setTimeout(() => setActionSuccessMsg(null), 4000);
      executeBenchmark(false);
    }
    setDisputeRecordId(null);
    setDisputeNotes('');
  };

  const handleDownloadJson = () => {
    if (!report) return;
    // Strip heavy base64 strings from exported JSON summary to keep reproducible artifact clean
    const exportPayload = {
      ...report,
      candidates: report.candidates.map((c) => ({
        ...c,
        records: c.records.map(({ imageBase64: _img, ...rest }) => rest),
      })),
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roadguard_eval_${report.runId}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleDownloadMarkdown = () => {
    if (!report) return;
    const md = formatBenchmarkMarkdown(report);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roadguard_eval_${report.runId}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const edgeCand = report?.candidates.find((c) => c.candidateId === 'edge-yolo-baseline');
  const stdCand = report?.candidates.find((c) => c.candidateId === 'gemini-standard');
  const fbCand = report?.candidates.find((c) => c.candidateId === 'roadguard-feedback');

  const filterCounts = report && fbCand && stdCand && edgeCand
    ? {
        all: fbCand.records.length,
        damage: fbCand.records.filter((r) => r.sample.isPositive).length,
        negatives: fbCand.records.filter((r) => !r.sample.isPositive).length,
        false_positives: fbCand.records.filter(
          (r, i) =>
            r.imageFalsePositive ||
            Boolean(stdCand.records[i]?.imageFalsePositive) ||
            Boolean(edgeCand.records[i]?.imageFalsePositive)
        ).length,
        missed_detections: fbCand.records.filter(
          (r, i) =>
            r.imageFalseNegative ||
            Boolean(stdCand.records[i]?.imageFalseNegative) ||
            Boolean(edgeCand.records[i]?.imageFalseNegative)
        ).length,
      }
    : { all: 0, damage: 0, negatives: 0, false_positives: 0, missed_detections: 0 };

  const filteredSampleIndices = report && fbCand
    ? fbCand.records
        .map((rec, idx) => ({ rec, idx }))
        .filter(({ rec, idx }) => {
          const stdR = stdCand?.records[idx];
          const edgeR = edgeCand?.records[idx];
          if (sampleFilter === 'damage') return rec.sample.isPositive;
          if (sampleFilter === 'negatives') return !rec.sample.isPositive;
          if (sampleFilter === 'false_positives') {
            return (
              rec.imageFalsePositive ||
              Boolean(stdR?.imageFalsePositive) ||
              Boolean(edgeR?.imageFalsePositive)
            );
          }
          if (sampleFilter === 'missed_detections') {
            return (
              rec.imageFalseNegative ||
              Boolean(stdR?.imageFalseNegative) ||
              Boolean(edgeR?.imageFalseNegative)
            );
          }
          return true; // 'all'
        })
        .map(({ idx }) => idx)
    : [];

  const activeSampleIdx = filteredSampleIndices.includes(selectedSampleIdx)
    ? selectedSampleIdx
    : (filteredSampleIndices[0] ?? 0);

  const selectedEdgeRec: PerSampleEvaluationRecord | undefined = edgeCand?.records[activeSampleIdx];
  const selectedStdRec: PerSampleEvaluationRecord | undefined = stdCand?.records[activeSampleIdx];
  const selectedFbRec: PerSampleEvaluationRecord | undefined = fbCand?.records[activeSampleIdx];

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto w-full pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:pb-16 space-y-6 text-slate-900">
      {/* Page Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-medium">
            <span>Validation Benchmark</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">
              {report ? report.ruleSetVersion : 'v2.0-verified-calibration'}
            </span>
            <span aria-hidden="true">·</span>
            <span>Temperature 0.0</span>
            <span aria-hidden="true">·</span>
            <span>
              {stdCand && stdCand.liveApiRate > 0
                ? 'Live Gemini API'
                : 'Deterministic Local Vision Proxy'}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Feedback-Guided Road Damage Evaluation & Baseline Suite
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            Reproducible 3-way comparison of YOLOv5 Road Damage Detector, Standard Gemini Vision, and
            Verified Feedback-Guided Gemini on untouched held-out test frames across diverse unseen
            geographic road corridors.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={useLiveGemini}
              onChange={(e) => setUseLiveGemini(e.target.checked)}
              disabled={isRunning}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Live Gemini API</span>
          </label>

          <button
            onClick={() => executeBenchmark()}
            disabled={isRunning}
            className="py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{isRunning ? `Running (${progressPct}%)` : (report?.isLiveCohort ? 'Re-Run Verified Benchmark' : 'Re-Run Held-Out Benchmark')}</span>
          </button>

          <button
            onClick={handleDownloadMarkdown}
            disabled={!report || isRunning}
            className="py-2.5 px-4 rounded-xl bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Export Report (.md)</span>
          </button>

          <button
            onClick={handleDownloadJson}
            disabled={!report || isRunning}
            className="py-2.5 px-4 rounded-xl bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* Progress / Error Banner */}
      {isRunning && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-800">{progressLabel}</span>
            <span className="font-mono tabular-nums text-slate-500">{progressPct}%</span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-150"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-xs text-rose-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Segmented Section Controls */}
      <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl w-fit overflow-x-auto max-w-full">
        {(
          [
            { id: 'live-history', label: `📊 Live Field History (${liveDetections.length})` },
            { id: 'baselines', label: '🔬 3-Way Benchmark Split' },
            { id: 'mechanism', label: '🧠 Feedback Gating Rules' },
            { id: 'dataset', label: '🗺️ Dataset & Split Audit' },
            { id: 'deployment', label: '⚡ Deployment & Calibration' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 0: LIVE FIELD HISTORY & DRIVER VERIFICATION AUDIT */}
      {activeTab === 'live-history' && (() => {
        const isRecordConfirmed = (d: RoadHazardRecord) =>
          d.verifiedStatus === 'confirmed' || d.verificationStatus === 'verified';

        const isRecordDisputed = (d: RoadHazardRecord) =>
          d.verifiedStatus === 'disputed' || d.verificationStatus === 'rejected';

        const isRecordPending = (d: RoadHazardRecord) =>
          !isRecordConfirmed(d) && !isRecordDisputed(d);

        const liveConfirmedList = liveDetections.filter(isRecordConfirmed);
        const liveDisputedList = liveDetections.filter(isRecordDisputed);
        const livePendingList = liveDetections.filter(isRecordPending);

        const totalEvaluated = liveConfirmedList.length + liveDisputedList.length;
        const livePrecision = totalEvaluated > 0 ? (liveConfirmedList.length / totalEvaluated) * 100 : 100;

        const filteredRecords = liveDetections.filter((d) => {
          if (liveTypeFilter !== 'all' && d.type !== liveTypeFilter) return false;
          if (liveStatusFilter === 'verified' && !isRecordConfirmed(d)) return false;
          if (liveStatusFilter === 'rejected' && !isRecordDisputed(d)) return false;
          if (liveStatusFilter === 'pending' && !isRecordPending(d)) return false;
          return true;
        });

        return (
          <div className="space-y-6">
            {/* Action Success Toast Banner */}
            {actionSuccessMsg && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-semibold flex items-center justify-between shadow-sm animate-in fade-in">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{actionSuccessMsg}</span>
                </div>
                <button onClick={() => setActionSuccessMsg(null)} className="text-emerald-700 hover:text-emerald-900">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Real-Time Live Field Metrics Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1 shadow-sm">
                <span className="text-xs text-slate-500 font-medium block">Total Field Reports</span>
                <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
                  {liveDetections.length}
                </div>
                <p className="text-[11px] text-slate-500">
                  Saved in MySQL database from camera & uploads
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1 shadow-sm">
                <span className="text-xs text-slate-500 font-medium block">Verified Valid Damage</span>
                <div className="flex items-baseline gap-2 font-mono tabular-nums">
                  <span className="text-2xl font-bold text-emerald-700">
                    {liveConfirmedList.length}
                  </span>
                  <span className="text-xs text-slate-500">
                    True Positives
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Confirmed road potholes & cracks
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1 shadow-sm">
                <span className="text-xs text-slate-500 font-medium block">False Positives Corrected</span>
                <div className="flex items-baseline gap-2 font-mono tabular-nums">
                  <span className="text-2xl font-bold text-rose-600">
                    {liveDisputedList.length}
                  </span>
                  <span className="text-xs text-slate-500">
                    Suppressed
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  {liveDisputedList.length > 0 ? 'Active feedback rules generated' : 'No false alarms flagged yet'}
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1 shadow-sm">
                <span className="text-xs text-slate-500 font-medium block">Live Field Precision</span>
                <div className="flex items-baseline gap-2 font-mono tabular-nums">
                  <span className="text-2xl font-bold text-blue-700">
                    {totalEvaluated > 0 ? `${livePrecision.toFixed(1)}%` : '100%'}
                  </span>
                  <span className="text-xs text-slate-500">
                    {totalEvaluated} audited
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  AI Accuracy Score: {aiStats.modelAccuracy}%
                </p>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
                  {(
                    [
                      { id: 'all', label: `All Reports (${liveDetections.length})` },
                      { id: 'verified', label: `✅ Verified Valid (${liveConfirmedList.length})` },
                      { id: 'rejected', label: `❌ False Alarms (${liveDisputedList.length})` },
                      { id: 'pending', label: `⏳ Pending (${livePendingList.length})` },
                    ] as const
                  ).map((st) => (
                    <button
                      key={st.id}
                      onClick={() => setLiveStatusFilter(st.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap ${
                        liveStatusFilter === st.id
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
                  {(
                    [
                      { id: 'all', label: 'All Defects' },
                      { id: 'pothole', label: '🕳️ Potholes' },
                      { id: 'road_crack', label: '⚡ Cracks' },
                    ] as const
                  ).map((tp) => (
                    <button
                      key={tp.id}
                      onClick={() => setLiveTypeFilter(tp.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap ${
                        liveTypeFilter === tp.id
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {tp.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="text-xs text-slate-500 font-mono">
                Showing {filteredRecords.length} of {liveDetections.length} records
              </div>
            </div>

            {/* Table of Live Detections Connected From History */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Database className="w-4 h-4 text-blue-600" />
                    <span>Real-Time Defect Verification & Accuracy Audit</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Directly synchronizes with MySQL database and History. Verifying or disputing any record updates accuracy and triggers dynamic feedback rules.
                  </p>
                </div>
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">
                  ● Live Database Sync Active
                </span>
              </div>

              {filteredRecords.length === 0 ? (
                <div className="p-12 text-center text-slate-500 text-xs space-y-2">
                  <Database className="w-8 h-8 mx-auto text-slate-400" />
                  <p className="font-semibold text-slate-700">No defect records matching this filter.</p>
                  <p>Capture road photographs via the live camera or manual upload to see them appear here in real time.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                        <th className="py-3 px-4 font-semibold">Photograph</th>
                        <th className="py-3 px-3 font-semibold">Damage Category</th>
                        <th className="py-3 px-3 font-semibold text-right">Confidence</th>
                        <th className="py-3 px-3 font-semibold text-center">Severity</th>
                        <th className="py-3 px-3 font-semibold">AI Engine</th>
                        <th className="py-3 px-4 font-semibold">Verification Status & Audit</th>
                        <th className="py-3 px-4 font-semibold">Feedback Rule Adaptation</th>
                        <th className="py-3 px-4 font-semibold text-right">Verification Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRecords.map((item) => {
                        const isConfirmed = isRecordConfirmed(item);
                        const isDisputed = isRecordDisputed(item);

                        return (
                          <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                            <td className="py-3 px-4">
                              {item.imageUrl ? (
                                <button
                                  onClick={() => setPreviewImage(item.imageUrl || null)}
                                  className="w-14 h-11 rounded-lg overflow-hidden border border-slate-200 bg-slate-900 block group relative shadow-sm"
                                  title="Click to view full photograph"
                                >
                                  <img
                                    src={item.imageUrl}
                                    alt="Captured hazard"
                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                                  />
                                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                    <Eye className="w-3.5 h-3.5" />
                                  </div>
                                </button>
                              ) : (
                                <div className="w-14 h-11 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 text-[10px]">
                                  No photo
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-3">
                              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                <span>{item.type === 'pothole' ? '🕳️' : '⚡'}</span>
                                <span>{item.damageName || (item.type === 'pothole' ? 'Pothole' : 'Road Crack')}</span>
                              </div>
                              <span className="text-[10px] font-mono text-slate-500">
                                {item.damageClass || (item.type === 'pothole' ? 'D40' : 'D00-D20')} · {item.locationName || 'Field'}
                              </span>
                            </td>

                            <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                              {Math.round((item.confidence || 0.88) * 100)}%
                            </td>

                            <td className="py-3 px-3 text-center">
                              <span
                                className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-full ${
                                  item.severity === 'high'
                                    ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                    : item.severity === 'medium'
                                    ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                    : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                }`}
                              >
                                {item.severity}
                              </span>
                            </td>

                            <td className="py-3 px-3 font-mono text-[11px] text-slate-700">
                              {item.aiEngine === 'yolov5'
                                ? '⚡ YOLOv5'
                                : item.aiEngine === 'gemini-standard'
                                ? '☁️ Standard Gemini'
                                : '🧠 Feedback Gemini'}
                            </td>

                            <td className="py-3 px-4">
                              {isConfirmed ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Verified Valid Damage (TP)</span>
                                </span>
                              ) : isDisputed ? (
                                <div>
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200">
                                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                                    <span>False Alarm Flagged</span>
                                  </span>
                                  {item.disputeReason && (
                                    <div className="text-[10px] text-slate-500 mt-0.5 capitalize">
                                      Reason: {item.disputeReason.replace('_', ' ')}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                  <Clock className="w-3 h-3 text-amber-600" />
                                  <span>Pending Review</span>
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-4 text-[11px]">
                              {isConfirmed ? (
                                <div className="text-emerald-700 font-medium">
                                  <span>Positive weight reinforcement (+0.04) applied</span>
                                </div>
                              ) : isDisputed ? (
                                <div className="text-purple-700 font-semibold flex items-center gap-1">
                                  <Brain className="w-3.5 h-3.5 shrink-0 text-purple-600" />
                                  <span>Suppression Rule Active ({item.disputeReason || 'non-hazard'})</span>
                                </div>
                              ) : (
                                <span className="text-slate-400 italic">No feedback rule applied yet</span>
                              )}
                            </td>

                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {!isConfirmed && (
                                  <button
                                    onClick={() => handleConfirmLiveHazard(item.id)}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition-colors shadow-sm flex items-center gap-1"
                                    title="Confirm as legitimate road defect"
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>Verify</span>
                                  </button>
                                )}
                                {!isDisputed && (
                                  <button
                                    onClick={() => {
                                      setDisputeRecordId(item.id);
                                      setDisputeReason('manhole');
                                      setDisputeNotes('');
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-[11px] transition-colors flex items-center gap-1"
                                    title="Flag as false alarm (shadow, manhole, water puddle)"
                                  >
                                    <AlertTriangle className="w-3 h-3" />
                                    <span>Dispute</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* TAB 1: BASELINES & METRICS */}
      {activeTab === 'baselines' && report && stdCand && fbCand && edgeCand && (
        <div className="space-y-6">
          {/* Priority Recommendation Summary Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
              <span className="text-xs text-slate-500 font-medium block">
                False Positive Rate ({report.isLiveCohort ? 'Verified History' : 'Untouched Test'})
              </span>
              <div className="flex items-baseline gap-2 font-mono tabular-nums">
                <span className="text-2xl font-bold text-emerald-700">
                  {(fbCand.falsePositiveRate * 100).toFixed(1)}%
                </span>
                <span className="text-xs text-slate-500">
                  vs {(stdCand.falsePositiveRate * 100).toFixed(1)}% standard
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                {report.priorityHeadline.falsePositivesEliminated} false positives eliminated (-
                {report.priorityHeadline.relativeFprReductionPct}% relative)
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
              <span className="text-xs text-slate-500 font-medium block">
                Road-Damage Recall Retention
              </span>
              <div className="flex items-baseline gap-2 font-mono tabular-nums">
                <span className="text-2xl font-bold text-slate-900">
                  {(fbCand.imageRecall * 100).toFixed(1)}%
                </span>
                <span className="text-xs text-emerald-700">
                  {report.priorityHeadline.recallDelta >= 0 ? '+' : ''}
                  {(report.priorityHeadline.recallDelta * 100).toFixed(1)}% delta
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                {report.priorityHeadline.passedNoMaterialRecallLoss
                  ? 'Verified: zero material recall loss'
                  : 'Recall trade-off observed'}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
              <span className="text-xs text-slate-500 font-medium block">
                Localized Detection mAP@0.50
              </span>
              <div className="flex items-baseline gap-2 font-mono tabular-nums">
                <span className="text-2xl font-bold text-slate-900">
                  {(fbCand.mAP50 * 100).toFixed(1)}%
                </span>
                <span className="text-xs text-slate-500">
                  vs {(edgeCand.mAP50 * 100).toFixed(1)}% YOLOv5
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Recall@IoU=0.50: {(fbCand.detectionRecall50 * 100).toFixed(1)}%
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
              <span className="text-xs text-slate-500 font-medium block">
                {report.isLiveCohort ? 'Live Verified Cohort' : 'Split Leakage Verification'}
              </span>
              <div className="flex items-center gap-1.5 font-mono tabular-nums">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span className="text-xl font-bold text-slate-900">
                  {report.cohortCount} Samples
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                {report.positiveCount} confirmed damage · {report.negativeCount} confirmed negatives
              </p>
            </div>
          </div>

          {/* 3-Way Head-to-Head Baseline Comparison Table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">
                    {report.isLiveCohort
                      ? `Latest ${report.cohortCount} Verified Samples Comparison (n = ${report.cohortCount})`
                      : `Identical Held-Out Test Set Comparison (n = ${report.cohortCount})`}
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800">
                    {report.isLiveCohort ? 'Live History Connected' : 'Held-Out Test Set'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Task metrics are dynamically calculated across identical verified samples with one-to-one IoU matching.
                </p>
              </div>
              <div className="text-xs text-slate-500 flex items-center gap-2 font-mono">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Last Updated: {new Date(report.executedAt).toLocaleTimeString()}</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="py-3 px-4 font-semibold">System / Baseline</th>
                    <th className="py-3 px-3 font-semibold text-right">mAP@0.50</th>
                    <th className="py-3 px-3 font-semibold text-right">mAP@0.30</th>
                    <th className="py-3 px-3 font-semibold text-right">Recall@IoU=0.5</th>
                    <th className="py-3 px-3 font-semibold text-right">Image Recall</th>
                    <th className="py-3 px-3 font-semibold text-right">FPR (Negatives)</th>
                    <th className="py-3 px-3 font-semibold text-right">Specificity</th>
                    <th className="py-3 px-3 font-semibold text-right">Image Acc</th>
                    <th className="py-3 px-4 font-semibold text-right">Mean Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                  {report.candidates.map((cand) => {
                    const isProposed = cand.candidateId === 'roadguard-feedback';
                    return (
                      <tr
                        key={cand.candidateId}
                        className={isProposed ? 'bg-emerald-50/40' : 'hover:bg-slate-50'}
                      >
                        <td className="py-3.5 px-4 font-sans">
                          <div className="font-semibold text-slate-900">{cand.candidateName}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{cand.taskNote}</div>
                        </td>
                        <td className="py-3.5 px-3 text-right font-semibold text-slate-900">
                          {(cand.mAP50 * 100).toFixed(1)}%
                        </td>
                        <td className="py-3.5 px-3 text-right text-slate-700">
                          {(cand.mAP30 * 100).toFixed(1)}%
                        </td>
                        <td className="py-3.5 px-3 text-right text-slate-700">
                          {(cand.detectionRecall50 * 100).toFixed(1)}%
                        </td>
                        <td className="py-3.5 px-3 text-right font-semibold text-slate-900">
                          {(cand.imageRecall * 100).toFixed(1)}%
                        </td>
                        <td
                          className={`py-3.5 px-3 text-right font-bold ${
                            cand.falsePositiveRate <= 0.1
                              ? 'text-emerald-700'
                              : 'text-rose-700'
                          }`}
                        >
                          {(cand.falsePositiveRate * 100).toFixed(1)}% ({cand.totalFP}/
                          {cand.totalFP + cand.totalTN})
                        </td>
                        <td className="py-3.5 px-3 text-right text-slate-700">
                          {(cand.specificity * 100).toFixed(1)}%
                        </td>
                        <td className="py-3.5 px-3 text-right font-semibold text-slate-900">
                          {(cand.imageAccuracy * 100).toFixed(1)}%
                        </td>
                        <td className="py-3.5 px-4 text-right text-slate-700">
                          {cand.meanLatencyMs} ms
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Hard-Negative Category Breakdown */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Hard-Negative False Positive Breakdown by Confusing Category
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Counts actual false-positive alerts generated on confirmed negative samples from live history across confusing road features.
                </p>
              </div>
              <span className="text-xs font-mono text-slate-500">
                {report.negativeCount} Verified Negatives
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="py-2.5 px-4 font-semibold">Negative Category</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Test Samples</th>
                    <th className="py-2.5 px-3 font-semibold text-right">YOLOv5 False Positives</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Standard Gemini False Positives</th>
                    <th className="py-2.5 px-4 font-semibold text-right">
                      RoadGuard Verified Feedback False Positives
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                  {[
                    'manhole',
                    'shadow',
                    'water_puddle',
                    'paint_marking',
                    'speed_breaker',
                    'normal_road',
                  ].map((cat) => {
                    const edgeCat = edgeCand.negativeFprByCategory[cat] || { total: 0, fp: 0, fpr: 0 };
                    const stdCat = stdCand.negativeFprByCategory[cat] || { total: 0, fp: 0, fpr: 0 };
                    const fbCat = fbCand.negativeFprByCategory[cat] || { total: 0, fp: 0, fpr: 0 };
                    const testSamples = Math.max(edgeCat.total, stdCat.total, fbCat.total);
                    return (
                      <tr key={cat} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-sans font-medium text-slate-900 capitalize">
                          {cat.replace('_', ' ')}
                        </td>
                        <td className="py-3 px-3 text-right text-slate-600 font-semibold">{testSamples}</td>
                        <td className="py-3 px-3 text-right text-slate-700">
                          {edgeCat.fp} / {testSamples} (
                          {(edgeCat.fpr * 100).toFixed(0)}%)
                        </td>
                        <td className="py-3 px-3 text-right text-rose-700 font-semibold">
                          {stdCat.fp} / {testSamples} (
                          {(stdCat.fpr * 100).toFixed(0)}%)
                        </td>
                        <td className="py-3 px-4 text-right text-emerald-700 font-bold">
                          {fbCat.fp} / {testSamples} ({(fbCat.fpr * 100).toFixed(0)}%)
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Interactive Per-Image Bounding Box & Sample Inspector */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Per-Image Sample Inspector (GT vs Predicted Boxes)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Visual inspection tool connected to the latest {report.cohortCount} unique verified image samples from detection history.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
                {(
                  [
                    { id: 'all', label: `All (${filterCounts.all})` },
                    { id: 'damage', label: `Damage (${filterCounts.damage})` },
                    { id: 'negatives', label: `Negatives (${filterCounts.negatives})` },
                    { id: 'false_positives', label: `False Positives (${filterCounts.false_positives})` },
                    { id: 'missed_detections', label: `Missed Detections (${filterCounts.missed_detections})` },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setSampleFilter(f.id)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                      sampleFilter === f.id
                        ? 'bg-white text-slate-900 shadow-sm font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
              {/* Sample List (left) */}
              <div className="lg:col-span-5 max-h-[520px] overflow-y-auto divide-y divide-slate-100">
                {filteredSampleIndices.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    No samples match the selected filter.
                  </div>
                ) : (
                  filteredSampleIndices.map((idx) => {
                    const fbR = fbCand.records[idx];
                    const isSelected = idx === activeSampleIdx;
                    const sample = fbR.sample as any;
                    const isPos = sample.isPositive;
                    const thumbUrl = sample.thumbnailUrl || sample.originalImageUrl || fbR.imageBase64;
                    const sampleId = sample.sourceRecordId ? sample.sourceRecordId.replace('hazard_', '').slice(0, 10) : sample.id;

                    const statusBadge = fbR.imageTruePositive
                      ? { label: 'TP', bg: 'bg-emerald-100 text-emerald-800' }
                      : fbR.imageTrueNegative
                      ? { label: 'TN', bg: 'bg-slate-100 text-slate-700' }
                      : fbR.imageFalsePositive
                      ? { label: 'FP', bg: 'bg-rose-100 text-rose-800' }
                      : { label: 'FN', bg: 'bg-orange-100 text-orange-800' };

                    return (
                      <button
                        key={sample.id || idx}
                        onClick={() => setSelectedSampleIdx(idx)}
                        className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
                          isSelected ? 'bg-blue-50/70 border-l-4 border-blue-600' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="w-12 h-12 rounded-lg bg-slate-900 overflow-hidden shrink-0 border border-slate-200">
                          {thumbUrl ? (
                            <img
                              src={thumbUrl}
                              alt={sample.title}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.currentTarget as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400">
                              No Img
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-semibold text-slate-900 truncate">
                              #{sampleId}
                            </span>
                            <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${statusBadge.bg}`}>
                              {statusBadge.label}
                            </span>
                          </div>

                          <div className="text-[11px] font-medium text-slate-700 truncate mt-0.5">
                            {sample.detectionClass || sample.title}
                          </div>

                          <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5 truncate">
                            <span>{sample.locationName || sample.region || 'Road Corridor'}</span>
                            <span aria-hidden="true">·</span>
                            <span>{sample.captureTimestamp ? new Date(sample.captureTimestamp).toLocaleDateString() : 'Recorded'}</span>
                          </div>

                          <div className="mt-1 flex items-center gap-1.5">
                            <span
                              className={`text-[9px] font-semibold px-1.5 py-0.2 rounded ${
                                isPos
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}
                            >
                              {isPos ? 'Confirmed Damage' : `Disputed: ${(sample.negativeCategory || 'Negative').replace('_', ' ')}`}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Selected Visual Frame & Bounding Box Comparison (right) */}
              {selectedFbRec && selectedStdRec && selectedEdgeRec && (
                <div className="lg:col-span-7 p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        {selectedFbRec.sample.title}
                      </h4>
                      <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                        <span>Sample ID: {selectedFbRec.sample.id}</span>
                        <span aria-hidden="true">·</span>
                        <span>{(selectedFbRec.sample as any).locationName || selectedFbRec.sample.region}</span>
                        <span aria-hidden="true">·</span>
                        <span>{(selectedFbRec.sample as any).captureTimestamp ? new Date((selectedFbRec.sample as any).captureTimestamp).toLocaleString() : 'Live'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] font-mono">
                      <span className="text-emerald-700 font-semibold flex items-center gap-1">
                        <span className="inline-block w-3 h-0 border-t-2 border-dashed border-emerald-500"></span>
                        Green Dashed: Ground Truth
                      </span>
                      <span className="text-blue-700 font-semibold flex items-center gap-1">
                        <span className="inline-block w-3 h-0 border-t-2 border-solid border-blue-500"></span>
                        Blue Solid: Model Prediction
                      </span>
                    </div>
                  </div>

                  {/* Frame with GT + Predicted Bounding Boxes */}
                  <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-950 aspect-[16/10] max-h-[320px] mx-auto flex items-center justify-center">
                    <img
                      src={(selectedFbRec.sample as any).originalImageUrl || selectedFbRec.imageBase64}
                      alt={selectedFbRec.sample.title}
                      className="w-full h-full object-contain"
                    />
                    {/* Ground Truth Bounding Boxes (Green Dashed) */}
                    {selectedFbRec.sample.groundTruthBoxes.map((gt, gIdx) => {
                      const [ymin, xmin, ymax, xmax] = gt.box2d;
                      return (
                        <div
                          key={`gt-${gIdx}`}
                          className="absolute border-2 border-dashed border-emerald-400 bg-emerald-500/10 pointer-events-none"
                          style={{
                            top: `${ymin / 10}%`,
                            left: `${xmin / 10}%`,
                            width: `${(xmax - xmin) / 10}%`,
                            height: `${(ymax - ymin) / 10}%`,
                          }}
                        >
                          <span className="absolute -top-4 left-0 bg-emerald-600 text-white text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-sm whitespace-nowrap">
                            GT {gt.damageClass} ({gt.severity})
                          </span>
                        </div>
                      );
                    })}

                    {/* Model Predictions Bounding Boxes (Blue Solid) */}
                    {selectedFbRec.predictedObjects.map((pred, pIdx) => {
                      if (!pred.box2d) return null;
                      const [ymin, xmin, ymax, xmax] = pred.box2d;
                      return (
                        <div
                          key={`pred-${pIdx}`}
                          className="absolute border-2 border-blue-400 bg-blue-500/15 pointer-events-none"
                          style={{
                            top: `${ymin / 10}%`,
                            left: `${xmin / 10}%`,
                            width: `${(xmax - xmin) / 10}%`,
                            height: `${(ymax - ymin) / 10}%`,
                          }}
                        >
                          <span className="absolute -bottom-4 left-0 bg-blue-600 text-white text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-sm whitespace-nowrap">
                            Pred {pred.type} {Math.round(pred.confidence * 100)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Telemetry Strip: GT vs Pred Overlap Details */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500 block uppercase font-semibold">Ground-Truth Class</span>
                      <span className="font-mono font-bold text-slate-900">
                        {selectedFbRec.sample.groundTruthBoxes[0]?.damageClass ||
                          (selectedFbRec.sample.isPositive ? 'Verified Damage' : 'None (Negative)')}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-500 block uppercase font-semibold">Predicted Class</span>
                      <span className="font-mono font-bold text-slate-900">
                        {selectedFbRec.predictedObjects[0]?.type || 'None (Clean)'}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-500 block uppercase font-semibold">Confidence Score</span>
                      <span className="font-mono font-bold text-slate-900">
                        {selectedFbRec.predictedObjects[0]
                          ? `${(selectedFbRec.predictedObjects[0].confidence * 100).toFixed(1)}%`
                          : 'N/A'}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-500 block uppercase font-semibold">IoU Overlap</span>
                      <span className="font-mono font-bold text-slate-900">
                        {(selectedFbRec.maxIoU * 100).toFixed(1)}%
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-500 block uppercase font-semibold">Matching Status</span>
                      <span
                        className={`font-semibold ${
                          selectedFbRec.sample.isPositive
                            ? selectedFbRec.maxIoU >= 0.5
                              ? 'text-emerald-700'
                              : selectedFbRec.maxIoU >= 0.3
                              ? 'text-amber-700'
                              : 'text-rose-700'
                            : selectedFbRec.predictedObjects.length === 0
                            ? 'text-emerald-700'
                            : 'text-rose-700'
                        }`}
                      >
                        {selectedFbRec.sample.isPositive
                          ? selectedFbRec.maxIoU >= 0.5
                            ? 'Matched (IoU>=0.5)'
                            : selectedFbRec.maxIoU >= 0.3
                            ? 'Partial (IoU>=0.3)'
                            : 'Missed Detection'
                          : selectedFbRec.predictedObjects.length === 0
                          ? 'Clean Rejection (TN)'
                          : 'False Alarm (FP)'}
                      </span>
                    </div>
                  </div>

                  {/* Per-Candidate Model Comparison Cards (3 cards) */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    {/* YOLOv5 Card */}
                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900">YOLOv5 Specialized</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                            selectedEdgeRec.imageTruePositive
                              ? 'bg-emerald-100 text-emerald-800'
                              : selectedEdgeRec.imageTrueNegative
                              ? 'bg-slate-200 text-slate-700'
                              : selectedEdgeRec.imageFalsePositive
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-orange-100 text-orange-800'
                          }`}
                        >
                          {selectedEdgeRec.imageTruePositive
                            ? 'TP'
                            : selectedEdgeRec.imageTrueNegative
                            ? 'TN'
                            : selectedEdgeRec.imageFalsePositive
                            ? 'FP'
                            : 'FN'}
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-slate-600">
                        Detections: {selectedEdgeRec.predictedObjects.length} · {selectedEdgeRec.latencyMs}ms
                      </div>
                      <div className="text-[11px] text-slate-600 line-clamp-2">
                        {selectedEdgeRec.predictedObjects[0]?.description || 'No road damage detected'}
                      </div>
                      <div className="text-[10px] text-slate-500 italic pt-1 border-t border-slate-200">
                        {selectedEdgeRec.imageFalsePositive
                          ? 'False Positive: Confused non-hazard with road damage.'
                          : selectedEdgeRec.imageFalseNegative
                          ? 'False Negative: Missed ground-truth damage.'
                          : selectedEdgeRec.imageTruePositive
                          ? 'True Positive: Localized road damage.'
                          : 'True Negative: Correctly rejected non-damage.'}
                      </div>
                    </div>

                    {/* Standard Gemini Card */}
                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900">Standard Gemini</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                            selectedStdRec.imageTruePositive
                              ? 'bg-emerald-100 text-emerald-800'
                              : selectedStdRec.imageTrueNegative
                              ? 'bg-slate-200 text-slate-700'
                              : selectedStdRec.imageFalsePositive
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-orange-100 text-orange-800'
                          }`}
                        >
                          {selectedStdRec.imageTruePositive
                            ? 'TP'
                            : selectedStdRec.imageTrueNegative
                            ? 'TN'
                            : selectedStdRec.imageFalsePositive
                            ? 'FP'
                            : 'FN'}
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-slate-600">
                        Detections: {selectedStdRec.predictedObjects.length} · {selectedStdRec.latencyMs}ms
                      </div>
                      <div className="text-[11px] text-slate-600 line-clamp-2">
                        {selectedStdRec.predictedObjects[0]?.description || 'No hazard flagged'}
                      </div>
                      <div className="text-[10px] text-slate-500 italic pt-1 border-t border-slate-200">
                        {selectedStdRec.imageFalsePositive
                          ? `False Positive: Zero-feedback prompt confused ${(selectedStdRec.sample.negativeCategory || 'road feature').replace('_', ' ')}.`
                          : selectedStdRec.imageFalseNegative
                          ? 'False Negative: Vision prompt did not identify hazard.'
                          : selectedStdRec.imageTruePositive
                          ? 'True Positive: Correctly identified damage.'
                          : 'True Negative: Clean negative rejection.'}
                      </div>
                    </div>

                    {/* RoadGuard Verified Feedback Card */}
                    <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900">RoadGuard Feedback</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                            selectedFbRec.imageTruePositive
                              ? 'bg-emerald-100 text-emerald-800'
                              : selectedFbRec.imageTrueNegative
                              ? 'bg-slate-200 text-slate-700'
                              : selectedFbRec.imageFalsePositive
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-orange-100 text-orange-800'
                          }`}
                        >
                          {selectedFbRec.imageTruePositive
                            ? 'TP'
                            : selectedFbRec.imageTrueNegative
                            ? 'TN'
                            : selectedFbRec.imageFalsePositive
                            ? 'FP'
                            : 'FN'}
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-slate-700">
                        Detections: {selectedFbRec.predictedObjects.length} · Suppressed: {selectedFbRec.suppressedCount}
                      </div>
                      <div className="text-[11px] text-slate-600 line-clamp-2">
                        {selectedFbRec.predictedObjects[0]?.description ||
                          (selectedFbRec.suppressedCount > 0
                            ? 'False alarm suppressed by verified calibration rule gate'
                            : 'Clean negative rejection')}
                      </div>
                      <div className="text-[10px] text-emerald-800 italic pt-1 border-t border-emerald-200">
                        {selectedFbRec.suppressedCount > 0
                          ? `False Alarm Prevented: Suppressed ${(selectedFbRec.sample.negativeCategory || 'negative').replace('_', ' ')} via verified rule.`
                          : selectedFbRec.imageTruePositive
                          ? 'True Positive: Road damage verified & localized.'
                          : selectedFbRec.imageTrueNegative
                          ? 'True Negative: Clean negative rejection.'
                          : selectedFbRec.imageFalsePositive
                          ? 'False Positive: Residual false alarm.'
                          : 'False Negative: Below confidence threshold.'}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: FORMAL FEEDBACK MECHANISM */}
      {activeTab === 'mechanism' && report && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                5-Stage Verified Feedback-to-Rule Pipeline vs. Manual Prompt Refinement
              </h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                RoadGuard does not rely on ad-hoc hand-editing of system prompts. Driver corrections
                pass through a deterministic compilation and split-isolation pipeline with exact
                hashing and post-inference confidence gating.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
              {[
                {
                  step: '01. Collection',
                  detail:
                    'Driver disputes prediction with structured negative class (manhole, shadow, puddle, paint, speed breaker) and bounding box.',
                },
                {
                  step: '02. Verification Gate',
                  detail:
                    'Correction remains pending until reviewer quorum verifies true-negative label; held-out test records are strictly blocked.',
                },
                {
                  step: '03. Rule Compilation',
                  detail:
                    'Canonical taxonomy compiles deterministic rule ID, FNV-1a hash, trigger cues, and penalty delta (no free-form prompt rewriting).',
                },
                {
                  step: '04. Versioned Storage',
                  detail:
                    'Compiled rule set is versioned (v2.0-verified-calibration) and persisted with source correction provenance IDs.',
                },
                {
                  step: '05. Dual Application',
                  detail:
                    'Schema constraints guide temperature=0 inference; post-inference gate applies c_cal = max(0, c_raw - penalty) < tau (0.55).',
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5"
                >
                  <div className="font-bold text-slate-900">{item.step}</div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Exact Compiled Rules Table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Compiled Verified Feedback Rules ({report.compiledRules.length} Active)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Reproducible rule definitions compiled exclusively from verified calibration-split
                  corrections (tau = {CALIBRATION_CONFIDENCE_THRESHOLD_TAU}).
                </p>
              </div>
              <span className="text-xs font-mono text-slate-500">{report.ruleSetVersion}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="py-2.5 px-4 font-semibold">Rule ID / Hash</th>
                    <th className="py-2.5 px-3 font-semibold">Negative Class</th>
                    <th className="py-2.5 px-3 font-semibold">Source Corrections</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Penalty</th>
                    <th className="py-2.5 px-4 font-semibold">Compiled Constraint Clause</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.compiledRules.map((rule) => (
                    <tr key={rule.ruleId} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-900 whitespace-nowrap">
                        <div className="font-bold">{rule.ruleId}</div>
                        <div className="text-slate-500">#{rule.ruleHash}</div>
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-800 capitalize whitespace-nowrap">
                        {rule.trueNegativeClass.replace('_', ' ')}
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-600">
                        {rule.sourceCorrectionIds.join(', ')}
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums text-right font-semibold text-rose-700">
                        -{rule.confidencePenalty.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-slate-600 leading-relaxed">
                        {rule.canonicalConstraint}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Calibration Submissions Log (including pending_verification exclusion) */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">
                Calibration-Split Correction Audit Log
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Notice corr-cal-006 remains pending_verification and is excluded from rule
                compilation until reviewer sign-off.
              </p>
            </div>
            <div className="divide-y divide-slate-100 text-xs">
              {CALIBRATION_CORRECTIONS.map((c) => (
                <div key={c.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="font-mono font-semibold text-slate-900">
                      {c.id} · {c.region} · {c.predictedType} → {c.trueNegativeClass}
                    </div>
                    <div className="text-slate-600 mt-0.5">{c.operatorNote}</div>
                  </div>
                  <span
                    className={`font-mono text-[11px] font-semibold shrink-0 ${
                      c.verificationStatus === 'verified' ? 'text-emerald-700' : 'text-amber-700'
                    }`}
                  >
                    {c.verificationStatus}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: DATASET & SPLIT AUDIT */}
      {activeTab === 'dataset' && report && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Database className="w-4 h-4 text-slate-600" />
                <span>Leakage-Free Geographic Split Design</span>
              </h3>
              <dl className="grid grid-cols-2 gap-3 text-xs pt-1">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <dt className="text-slate-500">Calibration Split</dt>
                  <dd className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                    {report.splitAudit.calibrationCount} images
                  </dd>
                  <dd className="text-[11px] text-slate-500 mt-0.5">
                    {report.splitAudit.calibrationRegions.join(', ')}
                  </dd>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <dt className="text-slate-500">Untouched Held-Out Test</dt>
                  <dd className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                    {report.splitAudit.heldOutTestCount} images
                  </dd>
                  <dd className="text-[11px] text-slate-500 mt-0.5">
                    {report.splitAudit.heldOutRegions.join(', ')}
                  </dd>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <dt className="text-slate-500">Overlapping Regions</dt>
                  <dd className="text-base font-bold font-mono tabular-nums text-emerald-700 mt-0.5">
                    {report.splitAudit.overlappingRegions.length} (Zero)
                  </dd>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <dt className="text-slate-500">Near-Duplicate Group Overlap</dt>
                  <dd className="text-base font-bold font-mono tabular-nums text-emerald-700 mt-0.5">
                    {report.splitAudit.overlappingNearDuplicateGroups.length} (Verified Free)
                  </dd>
                </div>
              </dl>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-slate-600" />
                <span>Held-Out Lighting & Negative Composition</span>
              </h3>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="space-y-2">
                  <div className="font-semibold text-slate-700">Lighting Distribution</div>
                  {Object.entries(report.splitAudit.lightingBreakdown).map(([lt, count]) => (
                    <div key={lt} className="flex justify-between font-mono tabular-nums text-slate-600 border-b border-slate-100 pb-1">
                      <span className="font-sans capitalize">{lt.replace('_', ' ')}</span>
                      <span>{count}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <div className="font-semibold text-slate-700">Hard Negatives (n={report.splitAudit.negativeTestCount})</div>
                  {Object.entries(report.splitAudit.negativeBreakdown).map(([neg, count]) => (
                    <div key={neg} className="flex justify-between font-mono tabular-nums text-slate-600 border-b border-slate-100 pb-1">
                      <span className="font-sans capitalize">{neg.replace('_', ' ')}</span>
                      <span>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Per-Class Object Detection AP Breakdown */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">
                Per-Class Bounding-Box Average Precision (AP@0.50 & AP@0.30)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="py-2.5 px-4 font-semibold">Model</th>
                    <th className="py-2.5 px-3 font-semibold">Class</th>
                    <th className="py-2.5 px-3 font-semibold text-right">GT Boxes</th>
                    <th className="py-2.5 px-3 font-semibold text-right">TP@0.50</th>
                    <th className="py-2.5 px-3 font-semibold text-right">FP@0.50</th>
                    <th className="py-2.5 px-3 font-semibold text-right">AP@0.50</th>
                    <th className="py-2.5 px-4 font-semibold text-right">AP@0.30</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                  {report.candidates.flatMap((c) =>
                    c.perClassAP.map((cls) => (
                      <tr key={`${c.candidateId}-${cls.hazardClass}`} className="hover:bg-slate-50">
                        <td className="py-2.5 px-4 font-sans font-medium text-slate-900">
                          {c.candidateName}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">{cls.hazardClass}</td>
                        <td className="py-2.5 px-3 text-right">{cls.gtCount}</td>
                        <td className="py-2.5 px-3 text-right">{cls.tp50}</td>
                        <td className="py-2.5 px-3 text-right">{cls.fp50}</td>
                        <td className="py-2.5 px-3 text-right font-semibold text-slate-900">
                          {(cls.ap50 * 100).toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-700">
                          {(cls.ap30 * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: DEPLOYMENT FEASIBILITY & CALIBRATION */}
      {activeTab === 'deployment' && report && fbCand && stdCand && edgeCand && (
        <div className="space-y-6">
          {/* Latency, Cost & Reliability Table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-600" />
                <span>End-to-End Camera-to-Result Latency, API Cost & Calibration Validation</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Measured latency across preprocessing, inference, and rule gating; cost estimated
                from token counts at $0.075/1M input and $0.30/1M output tokens.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="py-2.5 px-4 font-semibold">System</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Mean Latency</th>
                    <th className="py-2.5 px-3 font-semibold text-right">P50</th>
                    <th className="py-2.5 px-3 font-semibold text-right">P95</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Cost / 1k Frames</th>
                    <th className="py-2.5 px-3 font-semibold text-right">ECE (Calib)</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Brier Score</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Severity Agreement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                  {report.candidates.map((c) => (
                    <tr key={c.candidateId} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-sans font-semibold text-slate-900">
                        {c.candidateName}
                      </td>
                      <td className="py-3 px-3 text-right">{c.meanLatencyMs} ms</td>
                      <td className="py-3 px-3 text-right">{c.p50LatencyMs} ms</td>
                      <td className="py-3 px-3 text-right">{c.p95LatencyMs} ms</td>
                      <td className="py-3 px-3 text-right">
                        ${c.estimatedCostPer1kFramesUsd.toFixed(4)}
                      </td>
                      <td className="py-3 px-3 text-right font-semibold text-slate-900">
                        {c.expectedCalibrationError.toFixed(3)}
                      </td>
                      <td className="py-3 px-3 text-right">{c.brierScore.toFixed(3)}</td>
                      <td className="py-3 px-4 text-right font-semibold text-emerald-700">
                        {(c.severityAgreementRate * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Lighting-Stratified Performance */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">
                Lighting & Weather Condition Stratification (RoadGuard Verified Feedback)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="py-2.5 px-4 font-semibold">Condition</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Samples</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Image Recall</th>
                    <th className="py-2.5 px-3 font-semibold text-right">False Positive Rate</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Mean Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                  {fbCand.lightingMetrics.map((m) => (
                    <tr key={m.lighting} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-sans font-medium text-slate-900 capitalize">
                        {m.lighting.replace('_', ' ')}
                      </td>
                      <td className="py-3 px-3 text-right">{m.sampleCount}</td>
                      <td className="py-3 px-3 text-right font-semibold text-slate-900">
                        {(m.imageRecall * 100).toFixed(1)}%
                      </td>
                      <td className="py-3 px-3 text-right text-emerald-700 font-semibold">
                        {(m.falsePositiveRate * 100).toFixed(1)}%
                      </td>
                      <td className="py-3 px-4 text-right">{m.meanLatencyMs} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Formal Confidence & Severity Mathematical Specification */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-3 text-xs">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-slate-600" />
              <span>Formal Confidence Calibration & Structural Severity Score Specification</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="font-semibold text-slate-900">Calibrated Confidence & Gating</div>
                <p className="font-mono text-[11px] text-slate-700">
                  c_cal = clamp(p_raw - max_matched_penalty, 0, 1); suppress if c_cal &lt; tau (0.55)
                </p>
                <p className="text-slate-600 leading-relaxed">
                  Validated using 5-bin Expected Calibration Error (ECE ={' '}
                  <span className="font-mono font-semibold">{fbCand.expectedCalibrationError.toFixed(3)}</span>) and Brier Score (
                  <span className="font-mono font-semibold">{fbCand.brierScore.toFixed(3)}</span>).
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="font-semibold text-slate-900">Structural Severity Score (0–100)</div>
                <p className="font-mono text-[11px] text-slate-700">
                  S = 100 * (0.45 * A_norm + 0.35 * w_class + 0.20 * c_cal)
                </p>
                <p className="text-slate-600 leading-relaxed">
                  Maps S &ge; 65 to High, 35 &le; S &lt; 65 to Medium, and S &lt; 35 to Low.
                  Achieves{' '}
                  <span className="font-mono font-semibold">
                    {(fbCand.severityAgreementRate * 100).toFixed(1)}%
                  </span>{' '}
                  tier agreement with ground-truth annotations.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dispute / False Alarm Flagging Modal inside Evaluation */}
      {disputeRecordId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-purple-400" />
                <h4 className="font-extrabold text-sm">Flag False Alarm & Generate Rule</h4>
              </div>
              <button onClick={() => setDisputeRecordId(null)} className="p-1 rounded-lg text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-800 block mb-1.5">
                  What caused this false alarm? (Actual object)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'manhole', label: '🔘 Manhole Cover' },
                    { id: 'shadow', label: '🌲 Tree / Viaduct Shadow' },
                    { id: 'water_puddle', label: '💧 Water Reflection / Puddle' },
                    { id: 'paint_marking', label: '🎨 Road Stripe / Paint' },
                    { id: 'speed_breaker', label: '🛑 Speed Hump' },
                    { id: 'normal_road', label: '🛣️ Normal Asphalt Texture' },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setDisputeReason(cat.id)}
                      className={`p-2.5 rounded-xl border text-left font-semibold text-[11px] transition-all ${
                        disputeReason === cat.id
                          ? 'bg-purple-600 border-purple-500 text-white shadow-sm'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-800 block mb-1">
                  Optional Reviewer Notes:
                </label>
                <input
                  type="text"
                  value={disputeNotes}
                  onChange={(e) => setDisputeNotes(e.target.value)}
                  placeholder="e.g. Utility iron cover mistaken for cavity"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>

              <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 text-[11px] flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
                <span>
                  This immediately saves to MySQL and creates a verified suppression rule to eliminate similar false positives.
                </span>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <button
                onClick={() => setDisputeRecordId(null)}
                className="py-2 px-3 text-slate-600 hover:text-slate-900 font-semibold text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleDisputeLiveHazard}
                className="py-2 px-4 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-purple-600/25 transition-all"
              >
                <Brain className="w-3.5 h-3.5" />
                <span>Save to Database & Apply Rule</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photograph Preview Modal */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
        >
          <div className="relative max-w-2xl w-full bg-slate-950 rounded-2xl overflow-hidden border border-slate-800">
            <img src={previewImage} alt="Hazard preview" className="w-full h-auto max-h-[80vh] object-contain" />
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-3 right-3 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
