
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  modalOverlayVariants,
  modalDialogVariants,
} from '../utils/motion';
import { getActiveDetector } from '../services/detectorRegistry';
import { SupportedDetectorModel } from '../services/aiDetectionService';
import { yoloV8DetectionService } from '../services/yoloV8DetectionService';
import { locationService } from '../services/locationService';
import { detectionService } from '../services/detectionService';
import { imageStorageService } from '../services/imageStorageService';
import { DetectionResult } from '../types/detection';
import {
  Upload,
  X,
  Play,
  CheckCircle2,
  AlertTriangle,
  Eye,
  MapPin,
  Sparkles,
  Cpu,
  Image as ImageIcon,
  Check,
  ShieldCheck,
} from 'lucide-react';

interface ManualUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReportSaved?: (reportId: string) => void;
}

export const ManualUploadModal: React.FC<ManualUploadModalProps> = ({
  isOpen,
  onClose,
  onReportSaved,
}) => {
  const [previewDataUrl, setPreviewDataUrl] = useState<string>('');
  const [annotatedPreviewUrl, setAnnotatedPreviewUrl] = useState<string>('');
  const [selectedDetector, setSelectedDetector] =
    useState<SupportedDetectorModel>('yolov8-nano');

  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const [analysisResult, setAnalysisResult] =
    useState<DetectionResult | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successReportId, setSuccessReportId] = useState<string | null>(null);

  const [activeViewTab, setActiveViewTab] =
    useState<'annotated' | 'original'>('annotated');

  const [locationName, setLocationName] = useState<string>('');

  // Handle image selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please select a valid image file (JPEG, PNG, WebP).');
      return;
    }

    setErrorMsg(null);
    setAnalysisResult(null);
    setAnnotatedPreviewUrl('');
    setSuccessReportId(null);

    const reader = new FileReader();

    reader.onload = (event) => {
      setPreviewDataUrl(event.target?.result as string);
    };

    reader.readAsDataURL(file);
  };

  // Run AI detection
  const handleRunDetection = async () => {
    if (!previewDataUrl) {
      setErrorMsg('Please choose an image file first.');
      return;
    }

    try {
      setIsAnalyzing(true);
      setErrorMsg(null);
      setAnalysisResult(null);
      setAnnotatedPreviewUrl('');
      setSuccessReportId(null);

      const detector = getActiveDetector(selectedDetector);

      const result = await detector.detectRoadProblems(
        previewDataUrl,
        'image/jpeg',
        'both'
      );

      setAnalysisResult(result);

      // Generate annotated image preview
      if (
        result.objects &&
        result.objects.length > 0 &&
        result.objects.some((o) => o.box2d)
      ) {
        try {
          const ann = await imageStorageService.generateAnnotatedImage(
            previewDataUrl,
            result.objects,
            1280
          );

          setAnnotatedPreviewUrl(ann.dataUrl);
          setActiveViewTab('annotated');
        } catch (annErr) {
          console.warn(
            'Annotated preview generation skipped:',
            annErr
          );
        }
      } else {
        setActiveViewTab('original');
      }
    } catch (err: any) {
      console.error('Manual detection error:', err);

      setErrorMsg(
        err?.message || 'Detection failed on uploaded image.'
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Save road report to MySQL backend
  const handleSaveToMySQL = async () => {
    if (!previewDataUrl || !analysisResult) return;

    try {
      setIsSaving(true);
      setErrorMsg(null);

      let coords = locationService.getCurrentCoordinates();

      if (!coords) {
        coords = {
          latitude: 12.9716 + (Math.random() - 0.5) * 0.04,
          longitude: 77.5946 + (Math.random() - 0.5) * 0.04,
        };
      }

      const locHint = locationName.trim()
        ? locationName.trim()
        : `${coords.latitude.toFixed(4)}°, ${coords.longitude.toFixed(4)}°`;

      const primaryObj = analysisResult.objects[0] || {
        type: 'other_hazard' as const,
        confidence: 0.85,
        severity: 'medium' as const,
        description: 'Manual road observation',
      };

      const damageClass =
        imageStorageService.extractDamageClass(primaryObj);

      const damageName =
        imageStorageService.resolveDamageName(
          damageClass,
          primaryObj.type
        );

      // Send report to the MySQL-backed detection API
      const record = await detectionService.addDetection({
        type: primaryObj.type,
        damageClass,
        damageName,
        confidence: primaryObj.confidence,
        severity: primaryObj.severity,
        description: primaryObj.description,
        latitude: coords.latitude,
        longitude: coords.longitude,
        locationName: locHint,
        imageUrl: previewDataUrl,
        annotatedImageUrl: annotatedPreviewUrl || undefined,
        imageSource: 'manual_upload',
        aiEngine: selectedDetector,
        verificationStatus: 'pending',
        box2d: primaryObj.box2d,
      });

      setSuccessReportId(record.id);

      if (onReportSaved) {
        onReportSaved(record.id);
      }
    } catch (err: any) {
      console.error(
        'Failed to save manual road report to MySQL:',
        err
      );

      setErrorMsg(
        err?.message || 'Failed to save road report to MySQL.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Reset modal
  const handleReset = () => {
    setPreviewDataUrl('');
    setAnnotatedPreviewUrl('');
    setAnalysisResult(null);
    setErrorMsg(null);
    setSuccessReportId(null);
    setLocationName('');
    setActiveViewTab('annotated');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">

          {/* Background Overlay */}
          <motion.div
            variants={modalOverlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
          />

          {/* Main Modal */}
          <motion.div
            variants={modalDialogVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="relative z-10 bg-white rounded-3xl max-w-xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200"
          >

            {/* Modal Header */}
            <div className="p-4 bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-white/20">
                  <Upload className="w-5 h-5 text-white" />
                </span>

                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-base tracking-tight">
                      MANUAL ROAD REPORT
                    </h3>

                    <span className="text-[10px] font-bold bg-white text-blue-800 px-2 py-0.5 rounded-full uppercase">
                      MySQL Database
                    </span>
                  </div>

                  <p className="text-[11px] text-blue-100">
                    Upload road photos, detect damage with AI, and save reports to MySQL
                  </p>
                </div>
              </div>

              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 overflow-y-auto space-y-4 flex-1">

              {/* Step 1: AI Engine Selection */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-blue-600" />
                  <span>Choose AI Detection Engine:</span>
                </label>

                <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1.5 rounded-2xl">
                  <button
                    onClick={() => setSelectedDetector('yolov8-nano')}
                    className={`py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
                      selectedDetector === 'yolov8-nano'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        yoloV8DetectionService.isReady
                          ? 'bg-emerald-400'
                          : 'bg-amber-300 animate-pulse'
                      }`}
                    />
                    <span>YOLOv8 Nano (ONNX Edge)</span>
                  </button>

                  <button
                    onClick={() => setSelectedDetector('gemini-vision')}
                    className={`py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
                      selectedDetector === 'gemini-vision'
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-purple-200" />
                    <span>Gemini 3.8 Flash Vision</span>
                  </button>
                </div>

                {selectedDetector === 'yolov8-nano' && (
                  <p className="text-[10px] text-slate-500 mt-1 pl-1">
                    Trained on 4 Road Damage classes: D00 (Longitudinal), D10 (Transverse), D20 (Alligator), D40 (Pothole).
                  </p>
                )}
              </div>

              {/* Step 2: File Picker */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Select Road Photograph:
                </label>

                {!previewDataUrl ? (
                  <label className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer bg-slate-50 hover:bg-blue-50/50 transition-all group">
                    <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                      <ImageIcon className="w-6 h-6" />
                    </div>

                    <span className="text-xs font-bold text-slate-800">
                      Click to choose image or drag & drop
                    </span>

                    <span className="text-[10px] text-slate-400 mt-0.5">
                      JPEG, PNG, or WebP up to 15MB
                    </span>

                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                ) : (
                  <div className="space-y-2">

                    {/* Image View Toggle */}
                    <div className="flex items-center justify-between text-xs">
                      {annotatedPreviewUrl ? (
                        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg">
                          <button
                            onClick={() => setActiveViewTab('annotated')}
                            className={`py-1 px-2.5 rounded-md text-[11px] font-bold transition-all ${
                              activeViewTab === 'annotated'
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Annotated with YOLOv8 Bounding Boxes
                          </button>

                          <button
                            onClick={() => setActiveViewTab('original')}
                            className={`py-1 px-2.5 rounded-md text-[11px] font-bold transition-all ${
                              activeViewTab === 'original'
                                ? 'bg-white text-slate-800 shadow-sm'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Original Photograph
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-500">
                          Original Photograph
                        </span>
                      )}

                      <button
                        onClick={handleReset}
                        className="text-[11px] text-rose-600 font-semibold hover:underline"
                      >
                        Change Photo
                      </button>
                    </div>

                    {/* Image Preview */}
                    <div className="relative rounded-2xl overflow-hidden border-2 border-slate-200 bg-slate-900 aspect-video flex items-center justify-center">
                      <img
                        src={
                          activeViewTab === 'annotated' && annotatedPreviewUrl
                            ? annotatedPreviewUrl
                            : previewDataUrl
                        }
                        alt="Road report snapshot"
                        className="w-full h-full object-contain"
                      />

                      <div className="absolute top-2 left-2 px-2.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[10px] font-mono text-white flex items-center gap-1 z-10">
                        <Eye className="w-3 h-3 text-cyan-400" />

                        <span>
                          {activeViewTab === 'annotated' && annotatedPreviewUrl
                            ? 'YOLOv8 Annotated View'
                            : 'Original Photo'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Optional Location Notes */}
              {previewDataUrl && (
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Road Location / Landmark (Optional):
                  </label>

                  <div className="relative">
                    <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />

                    <input
                      type="text"
                      value={locationName}
                      onChange={(e) => setLocationName(e.target.value)}
                      placeholder="e.g. MG Road Junction near Outer Ring Road"
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              {/* Detection Results */}
              {analysisResult && (
                <div
                  className={`p-3.5 rounded-2xl border text-xs space-y-2 animate-in fade-in duration-200 ${
                    analysisResult.detected
                      ? 'bg-rose-50/80 border-rose-200 text-rose-950'
                      : 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold flex items-center gap-1.5 text-sm">
                      {analysisResult.detected ? (
                        <>
                          <AlertTriangle className="w-4 h-4 text-rose-600" />
                          Detected Hazards ({analysisResult.objects.length})
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          Clean Road Surface
                        </>
                      )}
                    </span>

                    <span className="font-mono text-[10px] text-slate-500">
                      {analysisResult.latencyMs}ms • {analysisResult.modelUsed}
                    </span>
                  </div>

                  {analysisResult.objects.map((obj, i) => {
                    const damageClass =
                      imageStorageService.extractDamageClass(obj);

                    const damageName =
                      imageStorageService.resolveDamageName(
                        damageClass,
                        obj.type
                      );

                    return (
                      <div
                        key={i}
                        className="p-2.5 rounded-xl bg-white/90 border border-slate-200 text-slate-800 space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                              {damageClass}
                            </span>

                            <span className="font-bold text-xs uppercase text-slate-900">
                              {damageName}
                            </span>
                          </div>

                          <span className="text-[10px] font-mono font-bold text-slate-600">
                            {Math.round(obj.confidence * 100)}% confidence
                          </span>
                        </div>

                        <p className="text-xs text-slate-600">
                          {obj.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Success Notification */}
              {successReportId && (
                <div className="p-3 rounded-2xl bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs space-y-1 animate-in zoom-in-95">
                  <div className="flex items-center gap-1.5 font-bold">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />

                    <span>
                      Road Report Successfully Saved to MySQL!
                    </span>
                  </div>

                  <p className="text-[11px] text-emerald-800 font-mono">
                    Report ID: {successReportId}
                  </p>
                </div>
              )}

              {/* Error Notification */}
              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                  {errorMsg}
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
              <button
                onClick={onClose}
                className="py-2.5 px-4 rounded-xl text-slate-600 hover:bg-slate-200 font-semibold text-xs transition-colors"
              >
                Close
              </button>

              <div className="flex items-center gap-2">
                {!analysisResult ? (
                  <button
                    onClick={handleRunDetection}
                    disabled={isAnalyzing || !previewDataUrl}
                    className="py-2.5 px-5 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-blue-500/25 active:scale-95 transition-all"
                  >
                    {isAnalyzing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />

                        <span>
                          Running {selectedDetector === 'yolov8-nano' ? 'YOLOv8...' : 'Gemini...'}
                        </span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-current" />
                        <span>Run AI Detection</span>
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={handleSaveToMySQL}
                    disabled={isSaving || successReportId !== null}
                    className="py-2.5 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/25 active:scale-95 transition-all"
                  >
                    {isSaving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Saving to MySQL...</span>
                      </>
                    ) : successReportId ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Report Saved</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        <span>Save Report to MySQL</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
