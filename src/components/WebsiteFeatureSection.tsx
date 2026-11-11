import React from 'react';
import { Camera, MapPin, Gauge, Shield, Cpu, Cloud, Smartphone, ChevronRight } from 'lucide-react';

interface WebsiteFeatureSectionProps {
  onStartMonitoring: () => void;
  onNavigateToHistory: () => void;
  onOpenDemo: () => void;
}

export const WebsiteFeatureSection: React.FC<WebsiteFeatureSectionProps> = ({
  onStartMonitoring,
  onNavigateToHistory,
  onOpenDemo,
}) => {
  return (
    <section className="space-y-6 pt-4">
      {/* Section Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 block">
            Enterprise Architecture & Capabilities
          </span>
          <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            How RoadGuard AI Operates
          </h3>
        </div>
        <p className="text-xs text-slate-500 max-w-md">
          A full-stack, edge-accelerated computer vision platform designed for municipal road inspection, driver assistance, and automated fleet safety.
        </p>
      </div>

      {/* 3 Core Capability Cards */}
      <div className="flex sm:grid sm:grid-cols-3 gap-3.5 sm:gap-5 overflow-x-auto pb-2 -mx-1 px-1 sm:mx-0 sm:px-0 scrollbar-none">
        {/* Card 1: Pothole & Cavity Edge Vision */}
        <div className="min-w-[260px] sm:min-w-0 flex-1 bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-sm hover:border-slate-300 transition-all flex flex-col justify-between">
          <div>
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center text-lg sm:text-xl mb-2.5 sm:mb-3 border border-rose-100">
              🕳️
            </div>
            <h4 className="font-bold text-slate-900 text-sm sm:text-base mb-1">
              Deep Neural Pothole Detection
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed mb-2.5">
              Captures high-resolution frame coordinates of asphalt degradation, deep cavities, and surface fractures in real-time as you drive.
            </p>
            <div className="space-y-1 text-[11px] text-slate-500">
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-500">✓</span> Instant polygon bounding box calculation
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-500">✓</span> Severity categorization (Low, Med, High)
              </div>
            </div>
          </div>
          <button
            onClick={onStartMonitoring}
            className="mt-3 pt-2.5 border-t border-slate-100 text-xs font-bold text-rose-600 hover:text-rose-700 flex items-center justify-between group"
          >
            <span>Launch Vision Scanner</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

        {/* Card 2: Moving Vehicle Velocity & Radar */}
        <div className="min-w-[260px] sm:min-w-0 flex-1 bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-sm hover:border-slate-300 transition-all flex flex-col justify-between">
          <div>
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center text-lg sm:text-xl mb-2.5 sm:mb-3 border border-sky-100">
              🏎️
            </div>
            <h4 className="font-bold text-slate-900 text-sm sm:text-base mb-1">
              Vehicle & Scooter Speed Radar
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed mb-2.5">
              Tracks surrounding cars, two-wheelers, and commercial vehicles, estimating real-time approach velocity in km/h relative to speed limits.
            </p>
            <div className="space-y-1 text-[11px] text-slate-500">
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-500">✓</span> Optical frame displacement velocity
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-500">✓</span> Excessive speed & audio warnings
              </div>
            </div>
          </div>
          <button
            onClick={onOpenDemo}
            className="mt-3 pt-2.5 border-t border-slate-100 text-xs font-bold text-sky-600 hover:text-sky-700 flex items-center justify-between group"
          >
            <span>Simulate Radar in Lab</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

        {/* Card 3: Geotagged GIS & Cloud Persistence */}
        <div className="min-w-[260px] sm:min-w-0 flex-1 bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-sm hover:border-slate-300 transition-all flex flex-col justify-between">
          <div>
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-lg sm:text-xl mb-2.5 sm:mb-3 border border-indigo-100">
              🛡️
            </div>
            <h4 className="font-bold text-slate-900 text-sm sm:text-base mb-1">
              Cloud Geospatial Database
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed mb-2.5">
              Every detection is stamped with precise GPS coordinates, reverse geocoded, and synchronized with Cloud MySQL database.
            </p>
            <div className="space-y-1 text-[11px] text-slate-500">
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-500">✓</span> Cloud Account profile synchronization
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-500">✓</span> Offline resilience with IndexedDB
              </div>
            </div>
          </div>
          <button
            onClick={onNavigateToHistory}
            className="mt-3 pt-2.5 border-t border-slate-100 text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center justify-between group"
          >
            <span>View All Records in History</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>

      {/* Website Banner: Quick Tech Specs Grid */}
      <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-6 shadow-md border border-slate-800">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center sm:divide-x divide-slate-800/80">
          <div className="px-1 sm:px-2">
            <span className="text-[11px] text-slate-400 block font-medium">Inference Latency</span>
            <span className="text-base sm:text-xl font-mono font-bold text-cyan-400 mt-0.5 block">~32 ms</span>
            <span className="text-[9px] sm:text-[10px] text-slate-500">Edge on-device</span>
          </div>
          <div className="px-1 sm:px-2">
            <span className="text-[11px] text-slate-400 block font-medium">Camera Pipeline</span>
            <span className="text-base sm:text-xl font-mono font-bold text-emerald-400 mt-0.5 block">60 FPS</span>
            <span className="text-[9px] sm:text-[10px] text-slate-500">HTML5 Stream</span>
          </div>
          <div className="px-1 sm:px-2">
            <span className="text-[11px] text-slate-400 block font-medium">Data Sync</span>
            <span className="text-base sm:text-xl font-mono font-bold text-blue-400 mt-0.5 block">MySQL</span>
            <span className="text-[9px] sm:text-[10px] text-slate-500">Real-time cache</span>
          </div>
          <div className="px-1 sm:px-2">
            <span className="text-[11px] text-slate-400 block font-medium">AI Vision Model</span>
            <span className="text-base sm:text-xl font-mono font-bold text-amber-400 mt-0.5 block">Gemini 3.8</span>
            <span className="text-[9px] sm:text-[10px] text-slate-500">Flash Multimodal</span>
          </div>
        </div>
      </div>
    </section>
  );
};
