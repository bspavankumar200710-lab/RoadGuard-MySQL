import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard,
  Camera,
  MapPin,
  History,
  Calendar,
  Smartphone,
  X,
  ShieldCheck,
  Sparkles,
  Database,
  Zap,
} from 'lucide-react';
import { springs, modalOverlayVariants, buttonPressProps, leftDrawerVariants } from '../utils/motion';

export type NavigationTab = 'dashboard' | 'monitor' | 'map' | 'history' | 'schedule' | 'download';

interface NavigationProps {
  currentTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
  isMonitoring: boolean;
  unreadCount?: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentTab,
  onTabChange,
  isMonitoring,
  unreadCount = 0,
}) => {
  return (
    <>
      {/* Mobile Bottom Navigation Bar with Spring Active Highlight */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-xl border-t border-slate-200/90 shadow-2xl px-2 pt-1 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
        <div className="flex items-center justify-around max-w-lg mx-auto relative">
          {/* Dashboard Tab */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => onTabChange('dashboard')}
            className={`flex-1 py-1 flex flex-col items-center gap-0.5 rounded-xl transition-colors relative z-10 ${
              currentTab === 'dashboard' ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <div className="relative">
              <LayoutDashboard className={`w-4 h-4 ${currentTab === 'dashboard' ? 'stroke-[2.5]' : ''}`} />
            </div>
            <span className="text-[10px] leading-tight">Dashboard</span>
            {currentTab === 'dashboard' && (
              <motion.div
                layoutId="activeMobileTabIndicator"
                transition={springs.snappy}
                className="absolute inset-0 bg-blue-50/80 rounded-xl -z-10"
              />
            )}
          </motion.button>

          {/* Monitor Tab */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => onTabChange('monitor')}
            className={`flex-1 py-1 flex flex-col items-center gap-0.5 rounded-xl transition-colors relative z-10 ${
              currentTab === 'monitor' ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <div className="relative">
              <div
                className={`p-1 rounded-full transition-all ${
                  isMonitoring
                    ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30 animate-pulse'
                    : currentTab === 'monitor'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
              </div>
              {isMonitoring && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-500 border border-white rounded-full"></span>
              )}
            </div>
            <span className="text-[10px] leading-tight">Monitor</span>
            {currentTab === 'monitor' && (
              <motion.div
                layoutId="activeMobileTabIndicator"
                transition={springs.snappy}
                className="absolute inset-0 bg-blue-50/80 rounded-xl -z-10"
              />
            )}
          </motion.button>

          {/* Map Tab */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => onTabChange('map')}
            className={`flex-1 py-1 flex flex-col items-center gap-0.5 rounded-xl transition-colors relative z-10 ${
              currentTab === 'map' ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <div className="relative">
              <MapPin className={`w-4 h-4 ${currentTab === 'map' ? 'stroke-[2.5]' : ''}`} />
            </div>
            <span className="text-[10px] leading-tight">Map</span>
            {currentTab === 'map' && (
              <motion.div
                layoutId="activeMobileTabIndicator"
                transition={springs.snappy}
                className="absolute inset-0 bg-blue-50/80 rounded-xl -z-10"
              />
            )}
          </motion.button>

          {/* History Tab */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => onTabChange('history')}
            className={`flex-1 py-1 flex flex-col items-center gap-0.5 rounded-xl transition-colors relative z-10 ${
              currentTab === 'history' ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <div className="relative">
              <History className={`w-4 h-4 ${currentTab === 'history' ? 'stroke-[2.5]' : ''}`} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-2 px-1 py-0.2 bg-blue-600 text-white rounded-full text-[8px] font-bold">
                  {unreadCount}
                </span>
              )}
            </div>
            <span className="text-[10px] leading-tight">History</span>
            {currentTab === 'history' && (
              <motion.div
                layoutId="activeMobileTabIndicator"
                transition={springs.snappy}
                className="absolute inset-0 bg-blue-50/80 rounded-xl -z-10"
              />
            )}
          </motion.button>

          {/* Schedule / Work Orders Tab */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => onTabChange('schedule')}
            className={`flex-1 py-1 flex flex-col items-center gap-0.5 rounded-xl transition-colors relative z-10 ${
              currentTab === 'schedule' ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <div className="relative">
              <Calendar className={`w-4 h-4 ${currentTab === 'schedule' ? 'stroke-[2.5]' : ''}`} />
            </div>
            <span className="text-[10px] leading-tight">Schedule</span>
            {currentTab === 'schedule' && (
              <motion.div
                layoutId="activeMobileTabIndicator"
                transition={springs.snappy}
                className="absolute inset-0 bg-blue-50/80 rounded-xl -z-10"
              />
            )}
          </motion.button>

          {/* Download Tab */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => onTabChange('download')}
            className={`flex-1 py-1 flex flex-col items-center gap-0.5 rounded-xl transition-colors relative z-10 ${
              currentTab === 'download' ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <div className="relative">
              <Smartphone className={`w-4 h-4 ${currentTab === 'download' ? 'stroke-[2.5]' : ''}`} />
            </div>
            <span className="text-[10px] leading-tight">App</span>
            {currentTab === 'download' && (
              <motion.div
                layoutId="activeMobileTabIndicator"
                transition={springs.snappy}
                className="absolute inset-0 bg-blue-50/80 rounded-xl -z-10"
              />
            )}
          </motion.button>
        </div>
      </nav>
    </>
  );
};

/**
 * Mobile Sidebar Drawer (Slides in from the left with backdrop fade)
 */
export interface MobileSidebarDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
  isMonitoring: boolean;
  unreadCount?: number;
  onOpenDemo?: () => void;
  onOpenDatabase?: () => void;
  onOpenAiAssistant?: () => void;
}

export const MobileSidebarDrawer: React.FC<MobileSidebarDrawerProps> = ({
  isOpen,
  onClose,
  currentTab,
  onTabChange,
  isMonitoring,
  unreadCount = 0,
  onOpenDemo,
  onOpenDatabase,
  onOpenAiAssistant,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <motion.div
            variants={modalOverlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Slide-out Drawer from Left */}
          <motion.div
            variants={leftDrawerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="relative z-10 w-72 max-w-[85vw] bg-slate-900 border-r border-slate-800 shadow-2xl flex flex-col h-full text-white"
          >
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-rose-600 flex items-center justify-center text-white shadow-md">
                  <span>🛡️</span>
                </div>
                <div>
                  <h3 className="font-black text-sm tracking-tight text-white">ROADGUARD</h3>
                  <p className="text-[10px] text-slate-400">AI Vision & Speed Radar</p>
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation Links */}
            <div className="flex-1 p-3 space-y-1 overflow-y-auto">
              {[
                { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
                { id: 'monitor' as const, label: 'Live Camera Monitor', icon: Camera, live: isMonitoring },
                { id: 'map' as const, label: 'Hazard & Heatmap', icon: MapPin },
                { id: 'history' as const, label: 'Detection History', icon: History, count: unreadCount },
                { id: 'schedule' as const, label: 'Patrols & Work Orders', icon: Calendar },
                { id: 'download' as const, label: 'Download PWA App', icon: Smartphone },
              ].map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;

                return (
                  <motion.button
                    key={item.id}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      onTabChange(item.id);
                      onClose();
                    }}
                    className={`w-full px-3.5 py-2.5 rounded-xl font-bold text-xs flex items-center justify-between transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                        : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </div>

                    {item.live && (
                      <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded font-mono animate-pulse">
                        LIVE
                      </span>
                    )}

                    {item.count && item.count > 0 ? (
                      <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded-full text-cyan-300 font-bold">
                        {item.count}
                      </span>
                    ) : null}
                  </motion.button>
                );
              })}
            </div>

            {/* Footer Actions */}
            <div className="p-3 border-t border-slate-800 space-y-2 bg-slate-950/60">
              {onOpenAiAssistant && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenAiAssistant();
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-600/40 font-bold text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI Copilot Dispatcher</span>
                </button>
              )}

              {onOpenDemo && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenDemo();
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>AI Test Lab</span>
                </button>
              )}

              {onOpenDatabase && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenDatabase();
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-blue-300 font-bold text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>Backend Database</span>
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
