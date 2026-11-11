import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Smartphone,
  Download,
  Copy,
  Check,
  Share2,
  Sparkles,
  Camera,
  Navigation,
  Database,
  Volume2,
  ShieldCheck,
  ExternalLink,
  Info,
  Layers,
  ArrowRight,
} from 'lucide-react';

interface DownloadPageProps {
  onOpenDemo?: () => void;
  onNavigateToMonitor?: () => void;
}

export const DownloadPage: React.FC<DownloadPageProps> = ({
  onOpenDemo,
  onNavigateToMonitor,
}) => {
  const [appUrl, setAppUrl] = useState<string>('');
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [activeOsTab, setActiveOsTab] = useState<'android' | 'ios'>('android');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState<boolean>(false);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);

  // Compute live phone URL
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      // If running inside Google AI Studio preview iframe, use public shared URL or origin
      const currentUrl =
        origin.includes('localhost') || origin.includes('ais-dev') || origin.includes('ais-pre')
          ? origin
          : 'https://ais-pre-gaj4sedxcijs3bsdvank5y-734230041764.asia-east1.run.app';
      setAppUrl(currentUrl);

      // Check if already in standalone display mode
      if (
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true
      ) {
        setIsInstalled(true);
      }
    }

    // Capture PWA install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(appUrl);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    } catch (err) {
      console.warn('Clipboard copy error:', err);
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'RoadGuard – Real-Time Traffic & Pothole Monitor',
          text: 'Download RoadGuard on your phone for real-time AI road hazard detection and speed monitoring!',
          url: appUrl,
        });
      } catch (e) {
        // User cancelled share
      }
    } else {
      handleCopyUrl();
    }
  };

  const handleTriggerInstall = async () => {
    if (!deferredPrompt) {
      alert('To install, tap the browser menu (⋮ or Share) and select "Add to Home Screen" or "Install App".');
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
    setIsInstallable(false);
  };

  return (
    <div className="flex-1 overflow-y-auto px-3.5 sm:px-6 lg:px-8 py-5 sm:py-8 max-w-6xl mx-auto w-full pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:pb-16 space-y-6">
      {/* Header Banner */}
      <div className="text-center max-w-2xl mx-auto space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-blue-600 animate-spin" />
          <span>Install Anywhere • Native PWA & Offline Support</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
          Download RoadGuard on Your Phone
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
          Scan the QR code with your smartphone camera to launch RoadGuard. Mount your phone on your vehicle dashboard for hands-free AI road hazard detection.
        </p>
      </div>

      {/* Main Grid: QR Code & Mobile Installation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: QR Code Display Card (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-200/90 flex flex-col items-center text-center space-y-5">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
            <Smartphone className="w-4 h-4 text-blue-600" />
            <span>Scan With Phone Camera</span>
          </div>

          {/* High-Resolution QR Code Container */}
          <div className="p-4 bg-white rounded-2xl border-2 border-slate-200 shadow-inner relative group">
            <div className="p-2 bg-white rounded-xl">
              {appUrl ? (
                <QRCodeSVG
                  value={appUrl}
                  size={220}
                  level="H"
                  includeMargin={true}
                  className="w-full h-auto max-w-[220px]"
                />
              ) : (
                <div className="w-[220px] h-[220px] flex items-center justify-center bg-slate-100 rounded-xl animate-pulse">
                  <span className="text-xs text-slate-400">Generating QR...</span>
                </div>
              )}
            </div>

            {/* Shield Center Overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-10 h-10 rounded-full bg-blue-600 border-2 border-white shadow-lg flex items-center justify-center text-base">
                🛡️
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-800">
              Point your iOS or Android camera at the QR code
            </p>
            <p className="text-[11px] text-slate-500">
              Opens directly in your mobile browser with zero app-store download required.
            </p>
          </div>

          {/* Action Buttons: Copy Link & Share */}
          <div className="w-full space-y-2 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={appUrl}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-700 truncate"
              />
              <button
                onClick={handleCopyUrl}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                  isCopied
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{isCopied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleNativeShare}
                className="flex-1 py-2.5 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border border-blue-200"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share Link</span>
              </button>

              {isInstallable && (
                <button
                  onClick={handleTriggerInstall}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/20 transition-all active:scale-95"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Install PWA</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Mobile Installation Instructions & Features (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* OS Installation Guide Tabs */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/90 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <Download className="w-4 h-4 text-blue-600" />
                <span>How to Install on Phone</span>
              </h3>

              {/* OS Selector Tabs */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold">
                <button
                  onClick={() => setActiveOsTab('android')}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    activeOsTab === 'android'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Android
                </button>
                <button
                  onClick={() => setActiveOsTab('ios')}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    activeOsTab === 'ios'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  iPhone / iOS
                </button>
              </div>
            </div>

            {/* Android Guide */}
            {activeOsTab === 'android' && (
              <div className="space-y-3.5 text-xs text-slate-600 animate-in fade-in">
                <div className="flex items-start gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                    1
                  </div>
                  <div>
                    <strong className="text-slate-900 block font-bold mb-0.5">
                      Scan the QR Code with your Camera or Chrome
                    </strong>
                    <span>
                      Open your phone camera, scan the code above, and tap the link to open RoadGuard in Google Chrome.
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                    2
                  </div>
                  <div>
                    <strong className="text-slate-900 block font-bold mb-0.5">
                      Tap "Add to Home screen" or "Install App"
                    </strong>
                    <span>
                      In Chrome, tap the menu (⋮) in the top-right corner, then tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                    3
                  </div>
                  <div>
                    <strong className="text-slate-900 block font-bold mb-0.5">
                      Launch Standalone Driving HUD
                    </strong>
                    <span>
                      RoadGuard will appear on your phone home screen just like a Play Store app. It runs fullscreen with full camera & GPS access!
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* iOS Guide */}
            {activeOsTab === 'ios' && (
              <div className="space-y-3.5 text-xs text-slate-600 animate-in fade-in">
                <div className="flex items-start gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                    1
                  </div>
                  <div>
                    <strong className="text-slate-900 block font-bold mb-0.5">
                      Scan QR Code to open in Safari
                    </strong>
                    <span>
                      Open your iPhone Camera app, aim at the QR code, and tap the Safari notification banner.
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                    2
                  </div>
                  <div>
                    <strong className="text-slate-900 block font-bold mb-0.5">
                      Tap the Share button (⎙)
                    </strong>
                    <span>
                      In Safari, tap the Share icon at the bottom of the screen (square with an arrow pointing up).
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                    3
                  </div>
                  <div>
                    <strong className="text-slate-900 block font-bold mb-0.5">
                      Select "Add to Home Screen"
                    </strong>
                    <span>
                      Scroll down the share sheet and tap <strong>"Add to Home Screen"</strong>, then tap <strong>"Add"</strong> in the top-right corner.
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Smartphone Dashboard Capabilities Card */}
          <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span>Vehicle Dashcam Hardware Capabilities</span>
              </h3>
              <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Mobile Ready
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60 space-y-1">
                <div className="flex items-center gap-1.5 text-blue-400 font-bold">
                  <Camera className="w-3.5 h-3.5" />
                  <span>Ultra-HD Camera</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Analyzes road frames in real-time using Gemini multimodal vision.
                </p>
              </div>

              <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60 space-y-1">
                <div className="flex items-center gap-1.5 text-cyan-400 font-bold">
                  <Navigation className="w-3.5 h-3.5" />
                  <span>GPS Geotagging</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Logs exact latitude, longitude, and speed for every detected hazard.
                </p>
              </div>

              <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60 space-y-1">
                <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                  <Database className="w-3.5 h-3.5" />
                  <span>Offline Storage</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Stores road defects in phone IndexedDB even in remote areas without signal.
                </p>
              </div>

              <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60 space-y-1">
                <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Spoken Voice HUD</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Hands-free text-to-speech announces high-severity hazards ahead.
                </p>
              </div>

              <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60 space-y-1">
                <div className="flex items-center gap-1.5 text-purple-400 font-bold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Cloud Database</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Auto-syncs road records to Cloud MySQL for fleet management.
                </p>
              </div>

              <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60 space-y-1">
                <div className="flex items-center gap-1.5 text-rose-400 font-bold">
                  <Layers className="w-3.5 h-3.5" />
                  <span>Google Maps</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Live traffic and hazard mapping directly on your phone screen.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
