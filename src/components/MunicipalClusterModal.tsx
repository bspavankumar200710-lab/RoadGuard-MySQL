import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MunicipalCluster } from '../services/municipalClusterService';
import { modalOverlayVariants, modalDialogVariants, buttonPressProps } from '../utils/motion';
import {
  AlertTriangle,
  Flame,
  CheckCircle2,
  X,
  ExternalLink,
  MapPin,
  FileText,
  Wrench,
  Download,
  Crosshair,
  ShieldAlert,
} from 'lucide-react';

interface MunicipalClusterModalProps {
  cluster: MunicipalCluster | null;
  onClose: () => void;
  onFocusOnMap: (lat: number, lng: number) => void;
}

export const MunicipalClusterModal: React.FC<MunicipalClusterModalProps> = ({
  cluster,
  onClose,
  onFocusOnMap,
}) => {
  const handleExportWorkOrder = () => {
    if (!cluster) return;
    const workOrder = {
      workOrderId: `MUNI-WO-${cluster.id}-${Date.now().toString(36).toUpperCase()}`,
      generatedAt: new Date().toISOString(),
      corridorName: cluster.name,
      locationCoordinates: {
        centerLatitude: cluster.centerLat,
        centerLongitude: cluster.centerLng,
      },
      priorityClassification: cluster.priority,
      municipalActionRequired: cluster.recommendedAction,
      estimatedAsphaltSquareMeters: cluster.estimatedRepairSqMeters,
      totalReportedDefects: cluster.totalHazards,
      defectBreakdown: {
        criticalHazards: cluster.criticalCount,
        mediumHazards: cluster.mediumCount,
        lowHazards: cluster.lowCount,
        potholes: cluster.potholesCount,
        roadCracks: cluster.cracksCount,
      },
      defectList: cluster.hazards.map((h) => ({
        id: h.id,
        type: h.type,
        severity: h.severity,
        coordinates: { lat: h.latitude, lng: h.longitude },
        timestamp: h.timestamp,
        description: h.description,
      })),
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(workOrder, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `municipal_work_order_${cluster.name.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const isCritical = cluster?.priority === 'P1_CRITICAL';
  const isElevated = cluster?.priority === 'P2_ELEVATED';

  return (
    <AnimatePresence>
      {cluster && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            variants={modalOverlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm"
          />

          <motion.div
            variants={modalDialogVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="relative z-10 bg-slate-900 border border-slate-700/90 rounded-3xl max-w-xl w-full overflow-hidden shadow-2xl text-white flex flex-col max-h-[90vh]"
          >
            {/* Header */}
        <div
          className={`p-4 sm:p-5 border-b flex items-start justify-between ${
            isCritical
              ? 'bg-rose-950/70 border-rose-900/60'
              : isElevated
              ? 'bg-amber-950/70 border-amber-900/60'
              : 'bg-emerald-950/70 border-emerald-900/60'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl shrink-0 border ${
                isCritical
                  ? 'bg-rose-600/30 text-rose-300 border-rose-500/50'
                  : isElevated
                  ? 'bg-amber-600/30 text-amber-300 border-amber-500/50'
                  : 'bg-emerald-600/30 text-emerald-300 border-emerald-500/50'
              }`}
            >
              {isCritical ? <Flame className="w-6 h-6 animate-pulse" /> : <AlertTriangle className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                    isCritical
                      ? 'bg-rose-600 text-white border-rose-400'
                      : isElevated
                      ? 'bg-amber-600 text-white border-amber-400'
                      : 'bg-emerald-600 text-white border-emerald-400'
                  }`}
                >
                  {cluster.priority.replace('_', ' ')}
                </span>
                <span className="text-xs text-slate-300 font-mono">
                  Density Index: {cluster.densityScore}/100
                </span>
              </div>
              <h3 className="font-extrabold text-base text-white mt-0.5 leading-snug">
                {cluster.name}
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs scrollbar-thin">
          {/* Action Recommendation Banner */}
          <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700/80 space-y-1.5">
            <div className="flex items-center gap-2 text-indigo-300 font-bold text-xs uppercase tracking-wide">
              <Wrench className="w-4 h-4 text-indigo-400" />
              <span>Recommended Municipal Maintenance Action:</span>
            </div>
            <p className="text-slate-200 leading-relaxed text-xs">
              {cluster.recommendedAction}
            </p>
            <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-700/60 font-mono">
              <span>Estimated Surface Area:</span>
              <span className="font-bold text-emerald-400">~{cluster.estimatedRepairSqMeters} m² Bitumen Overlay</span>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60">
              <span className="text-[10px] text-slate-400 font-bold block uppercase">Total Hazards</span>
              <span className="text-lg font-black text-white font-mono">{cluster.totalHazards}</span>
            </div>
            <div className="bg-rose-950/30 p-2.5 rounded-xl border border-rose-900/40">
              <span className="text-[10px] text-rose-300 font-bold block uppercase">Critical</span>
              <span className="text-lg font-black text-rose-400 font-mono">{cluster.criticalCount}</span>
            </div>
            <div className="bg-amber-950/30 p-2.5 rounded-xl border border-amber-900/40">
              <span className="text-[10px] text-amber-300 font-bold block uppercase">Medium</span>
              <span className="text-lg font-black text-amber-400 font-mono">{cluster.mediumCount}</span>
            </div>
            <div className="bg-emerald-950/30 p-2.5 rounded-xl border border-emerald-900/40">
              <span className="text-[10px] text-emerald-300 font-bold block uppercase">Low Risk</span>
              <span className="text-lg font-black text-emerald-400 font-mono">{cluster.lowCount}</span>
            </div>
          </div>

          {/* Individual Hazards in this Cluster */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-300 text-xs">
                Defects in Cluster ({cluster.hazards.length})
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                Centroid: {cluster.centerLat.toFixed(4)}°, {cluster.centerLng.toFixed(4)}°
              </span>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
              {cluster.hazards.map((h) => (
                <div
                  key={h.id}
                  className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700 flex items-center justify-between gap-2.5"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-lg shrink-0">
                      {h.type === 'pothole'
                        ? '🕳️'
                        : h.type === 'road_crack'
                        ? '⚡'
                        : h.type === 'broken_sign'
                        ? '🛑'
                        : '⚠️'}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-white text-xs truncate">
                          {h.type.replace('_', ' ').toUpperCase()}
                        </span>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full uppercase ${
                            h.severity === 'high'
                              ? 'bg-rose-500/20 text-rose-300'
                              : h.severity === 'medium'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-emerald-500/20 text-emerald-300'
                          }`}
                        >
                          {h.severity}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate max-w-xs">{h.description}</p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-[10px] font-mono text-slate-400 block">
                      {h.latitude?.toFixed(3)}, {h.longitude?.toFixed(3)}
                    </span>
                    <span className="text-[10px] font-semibold text-blue-400 block">
                      {Math.round(h.confidence * 100)}% Conf
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
          <button
            onClick={() => {
              onFocusOnMap(cluster.centerLat, cluster.centerLng);
              onClose();
            }}
            className="py-2 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-blue-600/30"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>Focus on Map</span>
          </button>

          <button
            onClick={handleExportWorkOrder}
            className="py-2 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs flex items-center gap-1.5 border border-slate-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Work Order (JSON)</span>
          </button>
        </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
