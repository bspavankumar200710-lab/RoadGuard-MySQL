import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard,
  Camera,
  MapPin,
  History,
  Calendar,
  Smartphone,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Zap,
  Database,
  Radio,
} from 'lucide-react';
import { NavigationTab } from './Navigation';
import { springs, buttonPressProps, sidebarTransition, sidebarLabelVariants } from '../utils/motion';

interface CollapsibleDesktopSidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  currentTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
  isMonitoring: boolean;
  unreadCount?: number;
  onOpenAiAssistant: () => void;
  onOpenDemo: () => void;
  onOpenDatabase: () => void;
}

export const CollapsibleDesktopSidebar: React.FC<CollapsibleDesktopSidebarProps> = ({
  isCollapsed,
  onToggleCollapse,
  currentTab,
  onTabChange,
  isMonitoring,
  unreadCount = 0,
  onOpenAiAssistant,
  onOpenDemo,
  onOpenDatabase,
}) => {
  const navItems = [
    { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'monitor' as const, label: 'Camera Monitor', icon: Camera, live: isMonitoring },
    { id: 'map' as const, label: 'Hazard & Heatmap', icon: MapPin },
    { id: 'history' as const, label: 'Detection History', icon: History, count: unreadCount },
    { id: 'schedule' as const, label: 'Patrols & Tasks', icon: Calendar },
    { id: 'download' as const, label: 'Download App', icon: Smartphone },
  ];

  return (
    <motion.aside
      initial={false}
      animate={{ width: isCollapsed ? 76 : 252 }}
      transition={sidebarTransition}
      className="hidden lg:flex flex-col h-[100dvh] bg-[#090f24] border-r border-slate-800/80 select-none z-30 shrink-0 sticky top-0"
    >
      {/* Brand Header */}
      <div className="p-4 border-b border-slate-800/80 flex items-center justify-between h-16 shrink-0">
        <div
          onClick={() => onTabChange('dashboard')}
          className="flex items-center gap-3 cursor-pointer overflow-hidden"
        >
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-rose-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 shrink-0">
            <span className="text-lg">🛡️</span>
          </div>

          <AnimatePresence initial={false}>
            {!isCollapsed && (
              <motion.div
                variants={sidebarLabelVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="overflow-hidden whitespace-nowrap"
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-black text-sm tracking-tight text-white">ROADGUARD</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-blue-500/20 text-cyan-300 border border-blue-400/30">
                    AI
                  </span>
                </div>
                <p className="text-[10px] text-slate-400">Road Safety Vision</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Nav Items List */}
      <div className="flex-1 p-2.5 space-y-1.5 overflow-y-auto scrollbar-none">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;

          return (
            <motion.button
              key={item.id}
              whileHover={{ x: 2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onTabChange(item.id)}
              className={`w-full h-11 px-3 rounded-xl font-bold text-xs flex items-center gap-3 transition-colors relative z-10 ${
                isActive ? 'text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
              title={isCollapsed ? item.label : undefined}
            >
              {/* Active Sliding Spring Pill Indicator */}
              {isActive && (
                <motion.div
                  layoutId="activeDesktopSidebarIndicator"
                  transition={springs.snappy}
                  className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl -z-10 shadow-lg shadow-blue-600/30"
                />
              )}

              {/* Stable Icon */}
              <div className="w-5 h-5 flex items-center justify-center shrink-0">
                <Icon className={`w-4 h-4 ${isActive ? 'stroke-[2.5]' : ''}`} />
              </div>

              {/* Animated Label */}
              <AnimatePresence initial={false}>
                {!isCollapsed && (
                  <motion.div
                    variants={sidebarLabelVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="flex-1 flex items-center justify-between overflow-hidden whitespace-nowrap text-left"
                  >
                    <span>{item.label}</span>

                    {item.live && (
                      <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded font-mono animate-pulse">
                        LIVE
                      </span>
                    )}

                    {item.count && item.count > 0 ? (
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                          isActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-cyan-300'
                        }`}
                      >
                        {item.count}
                      </span>
                    ) : null}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </div>

      {/* Utilities & AI Assistant Section */}
      <div className="p-2.5 border-t border-slate-800/80 space-y-1.5 shrink-0 bg-[#070c1d]">
        {/* AI Assistant Button */}
        <motion.button
          {...buttonPressProps}
          onClick={onOpenAiAssistant}
          className={`w-full h-10 px-3 rounded-xl bg-indigo-950/60 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-900/60 font-bold text-xs flex items-center gap-3 transition-colors ${
            isCollapsed ? 'justify-center' : ''
          }`}
          title="Open RoadGuard AI Dispatcher Copilot"
        >
          <div className="w-5 h-5 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" />
          </div>

          <AnimatePresence initial={false}>
            {!isCollapsed && (
              <motion.span
                variants={sidebarLabelVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="overflow-hidden whitespace-nowrap text-left font-semibold"
              >
                AI Dispatcher
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>

        {/* AI Lab Button */}
        <motion.button
          {...buttonPressProps}
          onClick={onOpenDemo}
          className={`w-full h-9 px-3 rounded-xl bg-slate-900 border border-slate-800 text-amber-300 hover:bg-slate-800 font-semibold text-xs flex items-center gap-3 transition-colors ${
            isCollapsed ? 'justify-center' : ''
          }`}
          title="AI Test Lab"
        >
          <div className="w-5 h-5 flex items-center justify-center shrink-0">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
          </div>

          <AnimatePresence initial={false}>
            {!isCollapsed && (
              <motion.span
                variants={sidebarLabelVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="overflow-hidden whitespace-nowrap text-left text-[11px]"
              >
                AI Test Lab
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>

        {/* Backend Database Button */}
        <motion.button
          {...buttonPressProps}
          onClick={onOpenDatabase}
          className={`w-full h-9 px-3 rounded-xl bg-slate-900 border border-slate-800 text-blue-300 hover:bg-slate-800 font-semibold text-xs flex items-center gap-3 transition-colors ${
            isCollapsed ? 'justify-center' : ''
          }`}
          title="Backend Database"
        >
          <div className="w-5 h-5 flex items-center justify-center shrink-0">
            <Database className="w-3.5 h-3.5 text-blue-400" />
          </div>

          <AnimatePresence initial={false}>
            {!isCollapsed && (
              <motion.span
                variants={sidebarLabelVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="overflow-hidden whitespace-nowrap text-left text-[11px]"
              >
                Cloud Database
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>

        {/* Expand / Collapse Toggle Button */}
        <button
          onClick={onToggleCollapse}
          className="w-full h-8 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 flex items-center justify-center transition-colors text-xs font-bold gap-2 mt-1"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <div className="flex items-center gap-1.5 text-[11px]">
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Collapse</span>
            </div>
          )}
        </button>
      </div>
    </motion.aside>
  );
};
