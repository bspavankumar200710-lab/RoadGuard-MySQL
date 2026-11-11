import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Navigation, NavigationTab, MobileSidebarDrawer } from './components/Navigation';
import { CollapsibleDesktopSidebar } from './components/CollapsibleDesktopSidebar';
import { AiAssistantDrawer } from './components/AiAssistantDrawer';
import { DashboardPage } from './pages/DashboardPage';
import { MonitorPage } from './pages/MonitorPage';
import { MapPage } from './pages/MapPage';
import { HistoryPage } from './pages/HistoryPage';
import { SchedulePage } from './pages/SchedulePage';
import { DownloadPage } from './pages/DownloadPage';
import { DemoModeModal } from './components/DemoModeModal';
import { UserAuthButton } from './components/UserAuthButton';
import { AuthGateModal } from './components/AuthGateModal';
import { DatabaseExplorerModal } from './components/DatabaseExplorerModal';
import { PostDriveSummaryModal } from './components/PostDriveSummaryModal';
import { AuthProvider } from './contexts/AuthContext';
import { detectionService } from './services/detectionService';
import { locationService, LocationCoordinates } from './services/locationService';
import { driveSessionService, DriveSummary } from './services/driveSessionService';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import { RoadHazardRecord, MonitoringStats } from './types/detection';
import { WebsiteFooter } from './components/WebsiteFooter';
import { pageVariants, buttonPressProps } from './utils/motion';
import {
  Zap,
  WifiOff,
  Database,
  Camera,
  MapPin,
  History,
  Calendar,
  Smartphone,
  Sparkles,
  Menu,
} from 'lucide-react';

export default function App() {
  const [currentTab, setCurrentTab] = useState<NavigationTab>('dashboard');
  const [isMonitoring, setIsMonitoring] = useState<boolean>(false);
  const [detections, setDetections] = useState<RoadHazardRecord[]>([]);
  const [stats, setStats] = useState<MonitoringStats>({
    total: 0,
    potholes: 0,
    roadCracks: 0,
    brokenSigns: 0,
    speedDetections: 0,
    highSeverity: 0,
    today: 0,
  });
  const [userCoords, setUserCoords] = useState<LocationCoordinates | null>(null);
  const [selectedMapHazardId, setSelectedMapHazardId] = useState<string | null>(null);
  const [isDemoModalOpen, setIsDemoModalOpen] = useState<boolean>(false);
  const [isDatabaseModalOpen, setIsDatabaseModalOpen] = useState<boolean>(false);
  const [driveSummary, setDriveSummary] = useState<DriveSummary | null>(() => driveSessionService.getLastSummary());
  const [isDriveSummaryOpen, setIsDriveSummaryOpen] = useState<boolean>(false);
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState<boolean>(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState<boolean>(false);
  const isOnline = useNetworkStatus();

  
  useEffect(() => {
    const unsub = detectionService.subscribe((records) => {
      setDetections(records);
      setStats(detectionService.getStats());
    });
    return unsub;
  }, []);

  // Subscribe to GPS coordinates and auto-initiate tracking
  useEffect(() => {
    const unsub = locationService.subscribe((coords) => {
      setUserCoords(coords);
      if (coords && driveSessionService.isActive()) {
        driveSessionService.recordCoordinate(coords);
      }
    });
    locationService.startTracking().catch(() => {});
    return unsub;
  }, []);

  const handleStartMonitoring = () => {
    driveSessionService.startSession(userCoords);
    setIsMonitoring(true);
    setCurrentTab('monitor');
  };

  const handleToggleMonitoring = (start: boolean) => {
    if (start) {
      driveSessionService.startSession(userCoords);
      setIsMonitoring(true);
    } else {
      setIsMonitoring(false);
      // Stopping monitoring generates and displays the Post-Drive Summary modal!
      const summary = driveSessionService.stopSession();
      setDriveSummary(summary);
      setIsDriveSummaryOpen(true);
    }
  };

  const handleNavigateToMap = (hazardId?: string) => {
    if (hazardId) {
      setSelectedMapHazardId(hazardId);
    }
    setCurrentTab('map');
  };

  const handleNavigateToHistory = () => {
    setCurrentTab('history');
  };

  const getPageTitle = (tab: NavigationTab) => {
    switch (tab) {
      case 'dashboard':
        return 'Operations Dashboard';
      case 'monitor':
        return 'AI Camera Scanner';
      case 'map':
        return 'Hazard GIS & Heatmap';
      case 'history':
        return 'Defect Records & Review';
      case 'schedule':
        return 'Municipal Work Orders & Patrols';
      case 'download':
        return 'Mobile App & PWA';
      default:
        return 'RoadGuard AI';
    }
  };

  return (
    <AuthProvider>
      <div className="min-h-[100dvh] bg-[#070d1e] text-slate-900 flex antialiased selection:bg-blue-500 selection:text-white overflow-hidden">
        {/* Desktop Collapsible Sidebar (Hidden on mobile/tablet, visible on lg:) */}
        <CollapsibleDesktopSidebar
          isCollapsed={isDesktopSidebarCollapsed}
          onToggleCollapse={() => setIsDesktopSidebarCollapsed(!isDesktopSidebarCollapsed)}
          currentTab={currentTab}
          onTabChange={(tab) => {
            setCurrentTab(tab);
            if (tab !== 'map') setSelectedMapHazardId(null);
          }}
          isMonitoring={isMonitoring}
          unreadCount={detections.length}
          onOpenAiAssistant={() => setIsAiDrawerOpen(true)}
          onOpenDemo={() => setIsDemoModalOpen(true)}
          onOpenDatabase={() => setIsDatabaseModalOpen(true)}
        />

        {/* Main Content Viewport */}
        <div
          className={`flex-1 flex flex-col min-w-0 ${
            currentTab === 'map' || currentTab === 'monitor'
              ? 'h-[100dvh] overflow-hidden'
              : 'min-h-[100dvh] overflow-y-auto bg-slate-50'
          }`}
        >
          {/* Offline / Poor Cellular Connectivity Status Banner */}
          {!isOnline && (
            <div className="bg-amber-600 text-white px-4 py-1.5 text-xs font-semibold flex items-center justify-between z-50 sticky top-0 shadow-md">
              <div className="flex items-center gap-2">
                <WifiOff className="w-4 h-4 animate-pulse" />
                <span>Offline Mode: Poor cellular connectivity</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] bg-amber-700/60 px-2 py-0.5 rounded-full font-mono">
                <Database className="w-3 h-3" />
                <span>IndexedDB Cache</span>
              </div>
            </div>
          )}

          {/* Unified Global Navigation Header */}
          <header
            className={`px-3.5 sm:px-6 py-2.5 border-b sticky top-0 z-40 transition-all ${
              currentTab === 'monitor'
                ? 'hidden'
                : currentTab === 'map'
                ? 'bg-[#0b132b] border-slate-800 text-white shadow-md'
                : 'bg-white/95 backdrop-blur-md border-slate-200/90 text-slate-900 shadow-sm'
            }`}
          >
            <div className="w-full flex items-center justify-between gap-3">
              {/* Left Side: Mobile Hamburger & Page Context */}
              <div className="flex items-center gap-2.5">
                {/* Mobile Sidebar Hamburger Trigger */}
                <button
                  onClick={() => setIsMobileSidebarOpen(true)}
                  className="lg:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                  aria-label="Open navigation menu"
                >
                  <Menu className="w-5 h-5" />
                </button>

                {/* Mobile Brand Logo */}
                <div
                  onClick={() => setCurrentTab('dashboard')}
                  className="flex items-center gap-2 cursor-pointer group select-none lg:hidden"
                >
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-rose-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
                    <span className="text-base leading-none">🛡️</span>
                  </div>
                  <span
                    className={`font-black text-sm tracking-tight ${
                      currentTab === 'map' ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    ROADGUARD
                  </span>
                </div>

                {/* Desktop Page Breadcrumb / Title Indicator */}
                <div className="hidden lg:flex items-center gap-2">
                  <h1
                    className={`font-black text-sm tracking-tight ${
                      currentTab === 'map' ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    {getPageTitle(currentTab)}
                  </h1>
                  {isMonitoring && (
                    <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-600 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                      LIVE CAMERA ACTIVE
                    </span>
                  )}
                </div>
              </div>

              {/* Right Side Header Quick Actions: AI Dispatcher, Lab, DB, User Auth */}
              <div className="flex items-center gap-1.5 sm:gap-2.5">
                {/* AI Dispatcher Copilot Button */}
                <motion.button
                  {...buttonPressProps}
                  onClick={() => setIsAiDrawerOpen(true)}
                  className={`py-1.5 px-3 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm shrink-0 border ${
                    currentTab === 'map'
                      ? 'bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 border-indigo-500/40'
                      : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
                  }`}
                  title="Open RoadGuard AI Dispatcher Copilot"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500 animate-pulse" />
                  <span className="hidden sm:inline">AI </span>
                  <span>Dispatcher</span>
                </motion.button>

                {/* Backend Database Explorer Button */}
                <motion.button
                  {...buttonPressProps}
                  onClick={() => setIsDatabaseModalOpen(true)}
                  className={`py-1.5 px-3 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm shrink-0 ${
                    currentTab === 'map'
                      ? 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/40'
                      : 'bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200'
                  }`}
                  title="View Backend Cloud Database"
                >
                  <Database className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span className="hidden md:inline">Backend </span>
                  <span>Database</span>
                </motion.button>

                {/* AI Test Lab Button */}
                <motion.button
                  {...buttonPressProps}
                  onClick={() => setIsDemoModalOpen(true)}
                  className={`py-1.5 px-3 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm shrink-0 ${
                    currentTab === 'map'
                      ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300'
                  }`}
                  title="Open AI Detection Test Lab"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
                  <span className="hidden md:inline">AI Test </span>
                  <span>Lab</span>
                </motion.button>

                {/* Google Account Authentication Button */}
                <UserAuthButton />
              </div>
            </div>
          </header>

          {/* Animated Page Transitions Container (200-350ms smooth fade + slight vertical slide) */}
          <main className="flex-1 flex flex-col w-full relative bg-slate-900 min-h-0">
            <AnimatePresence mode="wait">
              {currentTab === 'dashboard' && (
                <motion.div
                  key="dashboard"
                  variants={pageVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="w-full flex-1 flex flex-col bg-slate-50"
                >
                  <DashboardPage
                    stats={stats}
                    recentDetections={detections}
                    isMonitoring={isMonitoring}
                    onStartMonitoring={handleStartMonitoring}
                    onNavigateToHistory={handleNavigateToHistory}
                    onNavigateToSchedule={() => setCurrentTab('schedule')}
                    onOpenDemo={() => setIsDemoModalOpen(true)}
                    lastDriveSummary={driveSummary}
                    onOpenDriveSummary={() => setIsDriveSummaryOpen(true)}
                  />
                </motion.div>
              )}

              {currentTab === 'monitor' && (
                <motion.div
                  key="monitor"
                  variants={pageVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="w-full h-[100dvh] max-w-5xl mx-auto flex flex-col flex-1"
                >
                  <MonitorPage
                    isMonitoring={isMonitoring}
                    onToggleMonitoring={handleToggleMonitoring}
                    onOpenDemo={() => setIsDemoModalOpen(true)}
                    onViewSummary={() => setIsDriveSummaryOpen(true)}
                    lastSummary={driveSummary}
                  />
                </motion.div>
              )}

              {currentTab === 'map' && (
                <motion.div
                  key="map"
                  variants={pageVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="w-full flex-1 flex flex-col min-h-0 h-full"
                >
                  <MapPage
                    detections={detections}
                    userCoords={userCoords}
                    selectedDetectionId={selectedMapHazardId}
                    onOpenDemo={() => setIsDemoModalOpen(true)}
                  />
                </motion.div>
              )}

              {currentTab === 'history' && (
                <motion.div
                  key="history"
                  variants={pageVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="w-full flex-1 flex flex-col bg-slate-50"
                >
                  <HistoryPage
                    detections={detections}
                    onOpenDemo={() => setIsDemoModalOpen(true)}
                  />
                </motion.div>
              )}

              {currentTab === 'schedule' && (
                <motion.div
                  key="schedule"
                  variants={pageVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="w-full flex-1 flex flex-col bg-slate-50"
                >
                  <SchedulePage
                    detections={detections}
                    onNavigateToMap={handleNavigateToMap}
                  />
                </motion.div>
              )}

              {currentTab === 'download' && (
                <motion.div
                  key="download"
                  variants={pageVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="w-full flex-1 flex flex-col bg-slate-50"
                >
                  <DownloadPage
                    onOpenDemo={() => setIsDemoModalOpen(true)}
                    onNavigateToMonitor={() => {
                      setIsMonitoring(true);
                      setCurrentTab('monitor');
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </main>

          {/* Global Website Footer (Shown on Desktop md: screens, hidden on monitor & full-screen map) */}
          {currentTab !== 'monitor' && currentTab !== 'map' && (
            <div className="hidden md:block">
              <WebsiteFooter
                onNavigate={(tab) => {
                  setCurrentTab(tab);
                  if (tab !== 'map') setSelectedMapHazardId(null);
                }}
                onOpenDemo={() => setIsDemoModalOpen(true)}
              />
            </div>
          )}

          {/* Mobile Bottom Navigation (Hidden on lg: screens where desktop sidebar takes over) */}
          <div className="lg:hidden">
            <Navigation
              currentTab={currentTab}
              onTabChange={(tab) => {
                setCurrentTab(tab);
                if (tab !== 'map') {
                  setSelectedMapHazardId(null);
                }
              }}
              isMonitoring={isMonitoring}
              unreadCount={detections.length}
            />
          </div>
        </div>

        {/* Slide-out Mobile Sidebar Drawer with Backdrop Fade */}
        <MobileSidebarDrawer
          isOpen={isMobileSidebarOpen}
          onClose={() => setIsMobileSidebarOpen(false)}
          currentTab={currentTab}
          onTabChange={(tab) => {
            setCurrentTab(tab);
            if (tab !== 'map') setSelectedMapHazardId(null);
          }}
          isMonitoring={isMonitoring}
          unreadCount={detections.length}
          onOpenDemo={() => setIsDemoModalOpen(true)}
          onOpenDatabase={() => setIsDatabaseModalOpen(true)}
          onOpenAiAssistant={() => setIsAiDrawerOpen(true)}
        />

        {/* AI Dispatcher Copilot Drawer (Slides in from the right) */}
        <AiAssistantDrawer
          isOpen={isAiDrawerOpen}
          onClose={() => setIsAiDrawerOpen(false)}
          detections={detections}
          onNavigateToMap={handleNavigateToMap}
        />

        {/* Development Demo Mode Modal */}
        <DemoModeModal
          isOpen={isDemoModalOpen}
          onClose={() => setIsDemoModalOpen(false)}
          onDetectionAdded={(hazardId) => {
            setSelectedMapHazardId(hazardId);
          }}
        />

        {/* Authentication Gate: Asks for Login or Sign Up on entry */}
        <AuthGateModal />

        {/* Cloud  Backend Database Explorer */}
        <DatabaseExplorerModal
          isOpen={isDatabaseModalOpen}
          onClose={() => setIsDatabaseModalOpen(false)}
        />

        {/* Post-Drive Summary Modal: Automatically appears upon stopping monitoring */}
        <PostDriveSummaryModal
          isOpen={isDriveSummaryOpen}
          summary={driveSummary}
          onClose={() => setIsDriveSummaryOpen(false)}
          onNavigateToMap={handleNavigateToMap}
          onNavigateToHistory={handleNavigateToHistory}
          onStartNewDrive={() => {
            setIsDriveSummaryOpen(false);
            handleStartMonitoring();
          }}
        />
      </div>
    </AuthProvider>
  );
}
