import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { modalOverlayVariants, modalDialogVariants } from '../utils/motion';
import { RoadHazardRecord, VerificationStatusType } from '../types/detection';
import { detectionService } from '../services/detectionService';
import { imageStorageService } from '../services/imageStorageService';
import {
  X,
  MapPin,
  Clock,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ExternalLink,
  Eye,
  Cpu,
  Layers,
  Camera,
  Upload,
  Calendar,
  Check,
  RotateCcw,
} from 'lucide-react';

interface ReportInspectionModalProps {
  record: RoadHazardRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusUpdated?: (updated: RoadHazardRecord) => void;
}

export const ReportInspectionModal: React.FC<ReportInspectionModalProps> = ({
  record,
  isOpen,
  onClose,
  onStatusUpdated,
}) => {
  const [activePhotoTab, setActivePhotoTab] = useState<'annotated' | 'original'>('annotated');
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  if (!record) return null;

  const damageClass = record.damageClass || imageStorageService.extractDamageClass({
    type: record.type,
    confidence: record.confidence,
    severity: record.severity,
    description: record.description,
    box2d: record.box2d,
  });

  const damageName = record.damageName || imageStorageService.resolveDamageName(damageClass, record.type);
  const currentStatus: VerificationStatusType = record.verificationStatus || (
    record.verifiedStatus === 'confirmed' ? 'verified' : record.verifiedStatus === 'disputed' ? 'rejected' : 'pending'
  );

  const hasAnnotated = Boolean(record.annotatedImageUrl);
  const displayImage = activePhotoTab === 'annotated' && hasAnnotated ? record.annotatedImageUrl : (record.imageUrl || record.annotatedImageUrl);

  const dateObj = new Date(record.timestamp);
  const formattedDate = dateObj.toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const formattedTime = dateObj.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const handleUpdateStatus = async (newStatus: VerificationStatusType) => {
    try {
      setIsUpdating(true);
      setActionSuccess(null);
      const updated = await detectionService.verifyReport(record.id, newStatus);
      if (updated) {
        setActionSuccess(`Report status updated to "${newStatus.toUpperCase()}" in MySQL.`);
        if (onStatusUpdated) {
          onStatusUpdated(updated);
        }
      }
    } catch (err: any) {
      console.error('Failed to update verification status:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const getStatusBadge = (status: VerificationStatusType) => {
    switch (status) {
      case 'verified':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>VERIFIED BY ADMIN</span>
          </span>
        );
      case 'rejected':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            <span>REJECTED / DISPUTED</span>
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>PENDING VERIFICATION</span>
          </span>
        );
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
          <motion.div
            variants={modalOverlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
          />

          <motion.div
            variants={modalDialogVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="relative z-10 bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200"
          >
            {/* Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-blue-600/30 border border-blue-500/40 text-blue-400">
                  <ShieldCheck className="w-5 h-5" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-base tracking-tight text-white">
                      ROAD REPORT INSPECTION
                    </h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                      ID: {record.reportId || record.id.slice(0, 12)}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    MySQL database record details with administrator verification
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              {/* Image Viewer with Annotated / Original Tabs */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                    <button
                      onClick={() => setActivePhotoTab('annotated')}
                      disabled={!hasAnnotated}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        activePhotoTab === 'annotated' && hasAnnotated
                          ? 'bg-blue-600 text-white shadow-sm'
                          : !hasAnnotated
                          ? 'text-slate-400 opacity-50 cursor-not-allowed'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Annotated Photograph (YOLOv8)
                    </button>
                    <button
                      onClick={() => setActivePhotoTab('original')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        activePhotoTab === 'original' || !hasAnnotated
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Original High-Res Photograph
                    </button>
                  </div>

                  {displayImage && (
                    <a
                      href={displayImage}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-semibold"
                    >
                      <span>Open Full Res</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                {/* Photo Display Frame */}
                <div className="relative rounded-2xl overflow-hidden border-2 border-slate-200 bg-slate-950 aspect-video flex items-center justify-center">
                  {displayImage ? (
                    <img
                      src={displayImage}
                      alt="Road report photograph"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <span className="text-xs text-slate-400">No photograph attached</span>
                  )}

                  <div className="absolute top-2 left-2 px-2.5 py-0.5 rounded-full bg-black/70 backdrop-blur-md text-[10px] font-mono text-white flex items-center gap-1.5 z-10">
                    <Eye className="w-3 h-3 text-cyan-400" />
                    <span>
                      {activePhotoTab === 'annotated' && hasAnnotated
                        ? 'YOLOv8 Bounding Box View'
                        : 'Original Camera Capture'}
                    </span>
                  </div>

                  <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/70 backdrop-blur-md text-[9px] font-mono text-slate-300 z-10">
                    Storage: road-reports/{record.userId || 'anon'}/{record.reportId || record.id}/
                  </div>
                </div>
              </div>

              {/* Status & Damage Overview */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-black font-mono px-2.5 py-1 rounded-xl bg-blue-600 text-white shadow-sm">
                    {damageClass}
                  </span>
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-900">{damageName}</h4>
                    <span className="text-[11px] text-slate-500 capitalize">
                      {record.type.replace('_', ' ')} • {record.severity} severity
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block font-semibold uppercase">Confidence</span>
                    <span className="font-mono text-sm font-black text-slate-800">
                      {Math.round(record.confidence * 100)}%
                    </span>
                  </div>
                  <div>{getStatusBadge(currentStatus)}</div>
                </div>
              </div>

              {/* Technical Metadata Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                {/* Location & GPS */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-rose-500" />
                    GPS Coordinates & Location
                  </span>
                  <div className="font-mono font-bold text-slate-800">
                    {record.latitude !== null && record.longitude !== null
                      ? `${record.latitude.toFixed(5)}°, ${record.longitude.toFixed(5)}°`
                      : 'Coordinates not available'}
                  </div>
                  <p className="text-[11px] text-slate-500 truncate">{record.locationName || 'Road sector'}</p>
                  {record.latitude !== null && record.longitude !== null && (
                    <a
                      href={`https://www.google.com/maps?q=${record.latitude},${record.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5 pt-0.5"
                    >
                      <span>View in Google Maps</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>

                {/* Capture Timestamp */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <Clock className="w-3 h-3 text-blue-500" />
                    Detection Timestamp
                  </span>
                  <div className="font-bold text-slate-800">{formattedDate}</div>
                  <p className="text-[11px] font-mono text-slate-500">{formattedTime}</p>
                </div>

                {/* Source & AI Engine */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <Cpu className="w-3 h-3 text-cyan-600" />
                    AI Engine & Source
                  </span>
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    <span>{record.aiEngine === 'yolov8-nano' ? 'YOLOv8 Nano (Edge ONNX)' : 'Gemini 3.8 Flash'}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 flex items-center gap-1 capitalize">
                    {record.imageSource === 'manual_upload' ? (
                      <>
                        <Upload className="w-3 h-3 text-slate-400" /> Manual Upload
                      </>
                    ) : (
                      <>
                        <Camera className="w-3 h-3 text-slate-400" /> Live Camera Stream
                      </>
                    )}
                  </p>
                </div>

                {/* Description & Speed */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <Layers className="w-3 h-3 text-amber-500" />
                    Inspection Details
                  </span>
                  <p className="text-[11px] text-slate-700 line-clamp-2">{record.description}</p>
                  {record.estimatedSpeedKmh && (
                    <span className="text-[10px] font-mono font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">
                      Vehicle Speed: {record.estimatedSpeedKmh} km/h
                    </span>
                  )}
                </div>
              </div>

              {actionSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{actionSuccess}</span>
                </div>
              )}
            </div>

            {/* Footer with Administrator Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <ShieldCheck className="w-4 h-4 text-slate-400" />
                <span>Admin Actions:</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleUpdateStatus('pending')}
                  disabled={isUpdating}
                  className="py-2 px-3 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs transition-colors"
                >
                  Reset Pending
                </button>

                <button
                  onClick={() => handleUpdateStatus('rejected')}
                  disabled={isUpdating}
                  className="py-2 px-3.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Reject Report</span>
                </button>

                <button
                  onClick={() => handleUpdateStatus('verified')}
                  disabled={isUpdating}
                  className="py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Verify Damage</span>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
