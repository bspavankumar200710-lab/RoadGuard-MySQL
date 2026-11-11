import React from 'react';
import { ShieldCheck, Camera, Sparkles, Heart } from 'lucide-react';

interface WebsiteFooterProps {
  onNavigate: (tab: 'dashboard' | 'monitor' | 'map' | 'history' | 'download') => void;
  onOpenDemo: () => void;
}

export const WebsiteFooter: React.FC<WebsiteFooterProps> = ({ onNavigate, onOpenDemo }) => {
  return (
    <footer className="w-full bg-slate-900 border-t border-slate-800 text-slate-400 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand Column */}
          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
                <span className="text-base leading-none">🛡️</span>
              </div>
              <span className="font-black text-base tracking-tight text-white">
                ROADGUARD
              </span>
              <span className="text-[10px] font-semibold text-blue-400 bg-blue-950/80 px-2 py-0.5 rounded border border-blue-800/60">
                v2.4 Pro
              </span>
            </div>
            <p className="text-slate-400 text-xs max-w-sm leading-relaxed">
              Real-time autonomous edge AI platform detecting road hazards, asphalt potholes, and moving vehicle velocities using on-device computer vision and Cloud MySQL sync.
            </p>
            <div className="flex items-center gap-3 pt-1 text-slate-500 text-[11px]">
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Edge Processing Ready
              </span>
              <span>·</span>
              <span>IndexedDB Offline Safe</span>
              <span>·</span>
              <span>MySQL Authentication</span>
            </div>
          </div>

          {/* Quick Navigation Links */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Platform Modules
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={() => onNavigate('dashboard')}
                  className="hover:text-white transition-colors flex items-center gap-1.5"
                >
                  Dashboard Analytics & Trends
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('monitor')}
                  className="hover:text-white transition-colors flex items-center gap-1.5"
                >
                  Live Camera Scanner
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('map')}
                  className="hover:text-white transition-colors flex items-center gap-1.5"
                >
                  Interactive Geotagged Map
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('history')}
                  className="hover:text-white transition-colors flex items-center gap-1.5"
                >
                  Detection Logs & Photos
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('download')}
                  className="hover:text-white transition-colors flex items-center gap-1.5 font-semibold text-emerald-400"
                >
                  📱 Download App (Phone QR Code)
                </button>
              </li>
            </ul>
          </div>

          {/* Capabilities & Tools */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Detection Technology
            </h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li className="flex items-center gap-1.5">
                <span>🕳️</span> Asphalt Potholes & Depressions
              </li>
              <li className="flex items-center gap-1.5">
                <span>⚡</span> Longitudinal & Alligator Cracks
              </li>
              <li className="flex items-center gap-1.5">
                <span>🏎️</span> Moving Car & Scooter Radar Speed
              </li>
              <li className="flex items-center gap-1.5">
                <span>🛑</span> Damaged Signs & Obstacles
              </li>
              <li className="pt-1">
                <button
                  onClick={onOpenDemo}
                  className="text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" /> Launch AI Simulation Lab
                </button>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-6 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-500">
          <p>© {new Date().getFullYear()} RoadGuard AI. Intelligent Transportation & Road Surface Safety Systems.</p>
          <div className="flex items-center gap-4">
            <span className="hover:text-slate-400 cursor-pointer">Privacy & Telemetry Policy</span>
            <span>·</span>
            <span className="hover:text-slate-400 cursor-pointer">Terms of Service</span>
            <span>·</span>
            <span className="hover:text-slate-400 cursor-pointer">API Docs</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
