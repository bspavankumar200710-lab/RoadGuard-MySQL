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
} from 'lucide-react';

type EvalSectionTab = 'baselines' | 'mechanism' | 'dataset' | 'deployment';

export const EvaluationPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<EvalSectionTab>('baselines');
  const [report, setReport] = useState<FullBenchmarkReport | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [progressPct, setProgressPct] = useState<number>(0);
  const [progressLabel, setProgressLabel] = useState<string>('');
  const [selectedSampleIdx, setSelectedSampleIdx] = useState<number>(0);
  const [sampleFilter, setSampleFilter] = useState<'all' | 'positive' | 'negative'>('all');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [useLiveGemini, setUseLiveGemini] = useState<boolean>(false);

  const executeBenchmark = useCallback(async (liveApiOverride?: boolean) => {
    const useLive = liveApiOverride ?? useLiveGemini;
    setIsRunning(true);
    setErrorMsg(null);
    setProgressPct(0);
    setProgressLabel('Initializing split isolation audit & calibration rules...');
    try {
      const result = await runHeldOutEvaluationSuite(
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
  }, [useLiveGemini]);

  useEffect(() => {
    executeBenchmark(false);
    // Run deterministic benchmark once on mount without burning live API quota
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const filteredSampleIndices = report
    ? fbCand!.records
        .map((rec, idx) => ({ rec, idx }))
        .filter(({ rec }) => {
          if (sampleFilter === 'positive') return rec.sample.isPositive;
          if (sampleFilter === 'negative') return !rec.sample.isPositive;
          return true;
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
            Reproducible 3-way comparison of YOLOv8/Edge Sobel, Standard Gemini Prompting, and
            Verified Feedback-Guided RoadGuard on 24 untouched held-out test frames across 4 unseen
            geographic corridors.
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
            <span>{isRunning ? `Running (${progressPct}%)` : 'Re-Run Held-Out Benchmark'}</span>
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
            { id: 'baselines', label: 'Baselines & Metrics' },
            { id: 'mechanism', label: 'Feedback Mechanism' },
            { id: 'dataset', label: 'Dataset & Split Audit' },
            { id: 'deployment', label: 'Deployment & Calibration' },
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

      {/* TAB 1: BASELINES & METRICS */}
      {activeTab === 'baselines' && report && stdCand && fbCand && edgeCand && (
        <div className="space-y-6">
          {/* Priority Recommendation Summary Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
              <span className="text-xs text-slate-500 font-medium block">
                False Positive Rate (Untouched Test)
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
                  vs {(edgeCand.mAP50 * 100).toFixed(1)}% edge
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Recall@IoU=0.50: {(fbCand.detectionRecall50 * 100).toFixed(1)}%
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
              <span className="text-xs text-slate-500 font-medium block">
                Split Leakage Verification
              </span>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span className="text-xl font-bold text-slate-900 font-mono tabular-nums">
                  {report.splitAudit.overlappingNearDuplicateGroups.length} Overlap
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                {report.splitAudit.heldOutRegions.length} unseen test regions ·{' '}
                {report.splitAudit.negativeTestCount} hard negatives
              </p>
            </div>
          </div>

          {/* 3-Way Head-to-Head Baseline Comparison Table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Identical Held-Out Test Set Comparison (n = {report.splitAudit.heldOutTestCount})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Task metrics are separated strictly into Localized Bounding-Box Detection
                  (IoU-matched) and Image-Level Screening / Negative-Case Rejection.
                </p>
              </div>
              <span className="text-xs font-mono text-slate-500">
                Run {report.runId}
              </span>
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
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">
                Hard-Negative False Positive Breakdown by Confusing Category
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Counts false hazard alerts triggered on unseen manhole covers, shadows, rainwater
                puddles, paint markings, and speed breakers.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="py-2.5 px-4 font-semibold">Negative Category</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Test Samples</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Edge Baseline FP</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Standard Gemini FP</th>
                    <th className="py-2.5 px-4 font-semibold text-right">
                      RoadGuard Verified Feedback FP
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                  {Object.keys(fbCand.negativeFprByCategory).map((cat) => {
                    const edgeCat = edgeCand.negativeFprByCategory[cat];
                    const stdCat = stdCand.negativeFprByCategory[cat];
                    const fbCat = fbCand.negativeFprByCategory[cat];
                    return (
                      <tr key={cat} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-sans font-medium text-slate-900 capitalize">
                          {cat.replace('_', ' ')}
                        </td>
                        <td className="py-3 px-3 text-right text-slate-600">{fbCat.total}</td>
                        <td className="py-3 px-3 text-right text-slate-700">
                          {edgeCat?.fp ?? 0} / {edgeCat?.total ?? 0} (
                          {((edgeCat?.fpr ?? 0) * 100).toFixed(0)}%)
                        </td>
                        <td className="py-3 px-3 text-right text-rose-700 font-semibold">
                          {stdCat?.fp ?? 0} / {stdCat?.total ?? 0} (
                          {((stdCat?.fpr ?? 0) * 100).toFixed(0)}%)
                        </td>
                        <td className="py-3 px-4 text-right text-emerald-700 font-bold">
                          {fbCat.fp} / {fbCat.total} ({(fbCat.fpr * 100).toFixed(0)}%)
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Interactive Per-Image Bounding Box & Rule-Gating Inspector */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Per-Image Held-Out Sample Inspector (GT vs Predicted Boxes)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Inspect localized bounding boxes, IoU overlap, and verified rule suppression on any
                  held-out sample.
                </p>
              </div>
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                {(['all', 'positive', 'negative'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setSampleFilter(f)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize whitespace-nowrap ${
                      sampleFilter === f
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {f === 'all' ? 'All (24)' : f === 'positive' ? 'Damage (12)' : 'Negatives (12)'}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
              {/* Sample List */}
              <div className="lg:col-span-5 max-h-[420px] overflow-y-auto divide-y divide-slate-100">
                {filteredSampleIndices.map((idx) => {
                  const stdR = stdCand.records[idx];
                  const fbR = fbCand.records[idx];
                  const isSelected = idx === activeSampleIdx;
                  const fpSuppressed = stdR.imageFalsePositive && fbR.imageTrueNegative;
                  return (
                    <button
                      key={fbR.sample.id}
                      onClick={() => setSelectedSampleIdx(idx)}
                      className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 transition-colors ${
                        isSelected ? 'bg-slate-100' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 truncate">
                          {fbR.sample.title}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <span>{fbR.sample.region}</span>
                          <span aria-hidden="true">·</span>
                          <span>{fbR.sample.lighting}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {fbR.sample.isPositive ? `IoU ${(fbR.maxIoU * 100).toFixed(0)}%` : 'Negative'}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`text-[11px] font-mono font-semibold shrink-0 ${
                          fpSuppressed
                            ? 'text-emerald-700'
                            : fbR.imageFalseNegative || fbR.imageFalsePositive
                            ? 'text-rose-700'
                            : 'text-slate-600'
                        }`}
                      >
                        {fpSuppressed
                          ? 'FP Suppressed'
                          : fbR.imageTruePositive
                          ? 'TP'
                          : fbR.imageTrueNegative
                          ? 'TN'
                          : fbR.imageFalsePositive
                          ? 'FP'
                          : 'FN'}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Selected Visual Frame & Bounding Box Comparison */}
              {selectedFbRec && selectedStdRec && selectedEdgeRec && (
                <div className="lg:col-span-7 p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        {selectedFbRec.sample.title}
                      </h4>
                      <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                        <span>{selectedFbRec.sample.region}</span>
                        <span aria-hidden="true">·</span>
                        <span>Group: {selectedFbRec.sample.nearDuplicateGroupId}</span>
                        <span aria-hidden="true">·</span>
                        <span>Surface: {selectedFbRec.sample.roadSurface}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] font-mono">
                      <span className="text-emerald-700 font-semibold">Dashed: Ground Truth</span>
                      <span className="text-blue-700 font-semibold">Solid: RoadGuard Pred</span>
                    </div>
                  </div>

                  {/* Frame with GT + Predicted Bounding Boxes */}
                  <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-950 aspect-[4/3] max-h-[280px] mx-auto">
                    <img
                      src={selectedFbRec.imageBase64}
                      alt={selectedFbRec.sample.title}
                      className="w-full h-full object-contain"
                    />
                    {selectedFbRec.sample.groundTruthBoxes.map((gt, gIdx) => {
                      const [ymin, xmin, ymax, xmax] = gt.box2d;
                      return (
                        <div
                          key={`gt-${gIdx}`}
                          className="absolute border-2 border-dashed border-emerald-400 pointer-events-none"
                          style={{
                            top: `${ymin / 10}%`,
                            left: `${xmin / 10}%`,
                            width: `${(xmax - xmin) / 10}%`,
                            height: `${(ymax - ymin) / 10}%`,
                          }}
                        >
                          <span className="absolute -top-4 left-0 bg-emerald-500 text-slate-950 text-[9px] font-mono font-bold px-1">
                            GT {gt.damageClass} ({gt.severity})
                          </span>
                        </div>
                      );
                    })}
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
                          <span className="absolute -bottom-4 left-0 bg-blue-600 text-white text-[9px] font-mono font-bold px-1">
                            Pred {Math.round(pred.confidence * 100)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Per-Candidate Prediction Comparison */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                      <div className="font-semibold text-slate-800">Edge Baseline</div>
                      <div className="font-mono text-[11px] text-slate-600">
                        Detections: {selectedEdgeRec.predictedObjects.length} ·{' '}
                        {selectedEdgeRec.latencyMs}ms
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {selectedEdgeRec.predictedObjects[0]?.description || 'No hazard flagged'}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                      <div className="font-semibold text-slate-800">Standard Gemini</div>
                      <div className="font-mono text-[11px] text-slate-600">
                        Detections: {selectedStdRec.predictedObjects.length} ·{' '}
                        {selectedStdRec.latencyMs}ms
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {selectedStdRec.predictedObjects[0]?.description || 'No hazard flagged'}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl border border-slate-200 bg-emerald-50/40 space-y-1">
                      <div className="font-semibold text-slate-900">RoadGuard Feedback</div>
                      <div className="font-mono text-[11px] text-slate-700">
                        Detections: {selectedFbRec.predictedObjects.length} · Suppressed:{' '}
                        {selectedFbRec.suppressedCount}
                      </div>
                      <div className="text-[11px] text-slate-600">
                        {selectedFbRec.predictedObjects[0]?.description ||
                          (selectedFbRec.suppressedCount > 0
                            ? 'False positive suppressed by verified rule gate'
                            : 'Clean negative rejection')}
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
    </div>
  );
};
