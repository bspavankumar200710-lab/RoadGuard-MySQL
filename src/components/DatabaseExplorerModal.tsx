
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  modalOverlayVariants,
  modalDialogVariants,
} from '../utils/motion';
import {
  Database,
  Download,
  X,
  AlertTriangle,
  Brain,
  RefreshCw,
} from 'lucide-react';

interface DatabaseExplorerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DatabaseExplorerModal: React.FC<DatabaseExplorerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeCollection, setActiveCollection] = useState<
    'detections' | 'ai_feedback'
  >('detections');

  const [records, setRecords] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch records from MySQL through the backend API
  const fetchCollectionData = async (colName: string) => {
    setIsLoading(true);

    try {
      const endpoint =
        colName === 'detections'
          ? '/api/detections'
          : '/api/ai/feedback';

      const response = await fetch(endpoint);

      if (!response.ok) {
        throw new Error(`Failed to fetch ${colName}`);
      }

      const data = await response.json();

      setRecords(
        Array.isArray(data)
          ? data.map((record: any) => ({
              ...record,
              _id: record.id,
            }))
          : []
      );
    } catch (error) {
      console.error('MySQL database fetch error:', error);
      setRecords([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Load records when the modal opens or collection changes
  useEffect(() => {
    if (isOpen) {
      fetchCollectionData(activeCollection);
    }
  }, [isOpen, activeCollection]);

  // Export displayed records as JSON
  const handleExportFullJSON = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(records, null, 2));

    const a = document.createElement('a');

    a.setAttribute('href', dataStr);
    a.setAttribute(
      'download',
      `roadguard_${activeCollection}_dump.json`
    );

    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">

          {/* Background Overlay */}
          <motion.div
            variants={modalOverlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
            className="fixed inset-0 bg-black/75 backdrop-blur-md"
          />

          {/* Main Modal */}
          <motion.div
            variants={modalDialogVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="relative z-10 bg-slate-900 border border-slate-700 rounded-3xl max-w-4xl w-full overflow-hidden shadow-2xl text-white flex flex-col max-h-[90vh]"
          >

            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-600/30 border border-blue-500/50 flex items-center justify-center text-blue-400">
                  <Database className="w-5 h-5" />
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-base text-white">
                      RoadGuard MySQL Database
                    </h3>

                    <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                      Live Database
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    Database: roadguard_db
                  </p>
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Collection Selector Tabs */}
            <div className="px-4 sm:px-6 pt-3 flex items-center justify-between border-b border-slate-800 pb-3">

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveCollection('detections')}
                  className={`py-1.5 px-3 rounded-xl text-xs font-bold ${
                    activeCollection === 'detections'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800/60 text-slate-400 hover:text-white'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
                  Detections
                </button>

                <button
                  onClick={() => setActiveCollection('ai_feedback')}
                  className={`py-1.5 px-3 rounded-xl text-xs font-bold ${
                    activeCollection === 'ai_feedback'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800/60 text-slate-400 hover:text-white'
                  }`}
                >
                  <Brain className="w-3.5 h-3.5 inline mr-1" />
                  AI Feedback
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchCollectionData(activeCollection)}
                  disabled={isLoading}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                  title="Refresh"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
                      isLoading ? 'animate-spin' : ''
                    }`}
                  />
                </button>

                <button
                  onClick={handleExportFullJSON}
                  className="py-1 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold flex items-center gap-1 border border-slate-700"
                >
                  <Download className="w-3 h-3" />
                  Export JSON
                </button>
              </div>
            </div>

            {/* Live Records Viewer */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 font-mono text-xs space-y-3">

              {isLoading ? (
                <div className="text-center py-12 text-slate-400">
                  Loading MySQL records...
                </div>
              ) : records.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  No records found in{' '}
                  <strong>{activeCollection}</strong>.
                </div>
              ) : (
                records.map((doc, idx) => (
                  <div
                    key={doc._id || idx}
                    className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800"
                  >
                    <div className="flex items-center justify-between text-[11px] text-blue-400 border-b border-slate-900 pb-2 mb-2 font-bold">
                      <span>Record ID: {doc._id}</span>

                      <span className="text-slate-500 font-normal">
                        {doc.timestamp
                          ? new Date(doc.timestamp).toLocaleString()
                          : ''}
                      </span>
                    </div>

                    <pre className="text-[11px] text-slate-300 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-48">
                      {JSON.stringify(doc, null, 2)}
                    </pre>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between text-xs text-slate-400">
              <span>Connected to RoadGuard MySQL Database</span>

              <button
                onClick={onClose}
                className="py-1.5 px-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold"
              >
                Close Explorer
              </button>
            </div>

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
