import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LogIn, LogOut, User, CheckCircle, ShieldCheck, Sparkles, Loader2 } from 'lucide-react';

export const UserAuthButton: React.FC = () => {
  const { user, userProfile, isLoading, signInWithGoogle, logout } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [showDropdown, setShowDropdown] = useState<boolean>(false);

  const handleSignIn = async () => {
    try {
      setIsSigningIn(true);
      await signInWithGoogle();
    } catch (err: any) {
      console.warn('Sign-in error:', err);
    } finally {
      setIsSigningIn(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-8 w-20 rounded-full bg-slate-100 animate-pulse flex items-center justify-center">
        <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />
      </div>
    );
  }

  const activeProfile = userProfile || (user ? {
    displayName: user.displayName,
    email: user.email,
    photoURL: user.photoURL,
  } : null);

  if (activeProfile) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowDropdown((prev) => !prev)}
          className="flex items-center gap-1.5 p-1 pr-2.5 rounded-full bg-white hover:bg-slate-50 border border-slate-200/90 shadow-sm transition-all"
        >
          {activeProfile.photoURL ? (
            <img
              src={activeProfile.photoURL}
              alt={activeProfile.displayName || 'Driver'}
              className="w-6 h-6 rounded-full object-cover border border-slate-300"
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">
              {(activeProfile.displayName || activeProfile.email || 'D')[0].toUpperCase()}
            </div>
          )}
          <span className="text-[11px] font-bold text-slate-800 max-w-[80px] truncate">
            {activeProfile.displayName?.split(' ')[0] || 'Driver'}
          </span>
        </button>

        {showDropdown && (
          <div className="absolute right-0 mt-1.5 w-60 bg-white rounded-2xl shadow-xl border border-slate-200/90 p-3 z-50 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-100">
              {activeProfile.photoURL ? (
                <img
                  src={activeProfile.photoURL}
                  alt={activeProfile.displayName || 'Driver'}
                  className="w-9 h-9 rounded-full object-cover border border-slate-300"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">
                  {(activeProfile.displayName || 'D')[0].toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="font-bold text-xs text-slate-900 truncate">
                  {activeProfile.displayName || 'RoadGuard Driver'}
                </div>
                <div className="text-[10px] text-slate-500 truncate">{activeProfile.email}</div>
              </div>
            </div>

            <div className="py-2 text-[11px] text-slate-600 space-y-1">
              <div className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Driver Profile Active</span>
              </div>
              <p className="text-[10px] text-slate-400">
                Potholes, vehicle speeds, and road photos are automatically synced to Cloud MySQL database.
              </p>
            </div>

            <button
              onClick={() => {
                setShowDropdown(false);
                logout();
              }}
              className="w-full mt-1.5 py-1.5 px-3 rounded-xl bg-slate-50 hover:bg-rose-50 text-slate-700 hover:text-rose-600 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-200/70 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={handleSignIn}
      disabled={isSigningIn}
      className="py-1 px-2.5 sm:px-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm shadow-blue-500/20 active:scale-95 transition-all shrink-0"
      title="Sign in with Google Account to sync detections with Cloud Database"
    >
      {isSigningIn ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <svg className="w-3.5 h-3.5 fill-current shrink-0" viewBox="0 0 24 24">
          <path d="M12.24 10.285V13.4h6.887C18.2 16.14 15.645 18 12.24 18c-3.315 0-6-2.685-6-6s2.685-6 6-6c1.47 0 2.805.54 3.84 1.425l2.4-2.4C16.89 3.51 14.7 2.6 12.24 2.6 7.02 2.6 2.8 6.82 2.8 12s4.22 9.4 9.44 9.4c5.445 0 9.075-3.825 9.075-9.24 0-.675-.075-1.32-.195-1.875H12.24z" />
        </svg>
      )}
      <span className="hidden sm:inline">Google </span>
      <span>Sign In</span>
    </button>
  );
};
