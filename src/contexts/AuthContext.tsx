
import React, { createContext, useContext, useEffect, useState } from 'react';

interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  preferredMode?: 'both' | 'potholes' | 'speed';
}

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  isLoading: boolean;
  isGuest: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, name: string) => Promise<void>;
  signInAsGuest: () => void;
  logout: () => Promise<void>;
  updatePreferredMode: (mode: 'both' | 'potholes' | 'speed') => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  isLoading: true,
  isGuest: false,
  signInWithGoogle: async () => {},
  signInWithEmail: async () => {},
  signUpWithEmail: async () => {},
  signInAsGuest: () => {},
  logout: async () => {},
  updatePreferredMode: async () => {},
});

const API_URL = '';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

  const saveAuthenticatedUser = (apiUser: {
    id: number;
    username: string;
    email: string;
  }) => {
    const newUser: User = {
      uid: String(apiUser.id),
      email: apiUser.email,
      displayName: apiUser.username,
      photoURL: '',
    };

    const profile: UserProfile = {
      ...newUser,
      preferredMode: 'both',
    };

    setUser(newUser);
    setUserProfile(profile);
    setIsGuest(false);

    localStorage.removeItem('roadguard_guest_session');
    localStorage.setItem(
      'roadguard_authenticated_profile',
      JSON.stringify(profile)
    );
  };

  // Restore the session using the HTTP-only JWT cookie.
  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch(`${API_URL}/api/auth/me`, {
          method: 'GET',
          credentials: 'include',
        });

        if (!response.ok) {
          setUser(null);
          setUserProfile(null);
          localStorage.removeItem('roadguard_authenticated_profile');
          return;
        }

        const data = await response.json();
        const apiUser = data.user;

        const stored = localStorage.getItem('roadguard_authenticated_profile');
        let preferredMode: 'both' | 'potholes' | 'speed' = 'both';

        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            preferredMode = parsed.preferredMode || 'both';
          } catch {}
        }

        const restoredUser: User = {
          uid: String(apiUser.id),
          email: apiUser.email,
          displayName: apiUser.username,
          photoURL: '',
        };

        const profile: UserProfile = {
          ...restoredUser,
          preferredMode,
        };

        setUser(restoredUser);
        setUserProfile(profile);
        setIsGuest(false);

        localStorage.removeItem('roadguard_guest_session');
        localStorage.setItem(
          'roadguard_authenticated_profile',
          JSON.stringify(profile)
        );
      } catch (error) {
        console.error('Session check failed:', error);
        setUser(null);
        setUserProfile(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();
  }, []);

  // Google login is not connected to MySQL yet.
  const signInWithGoogle = async () => {
    throw new Error(
      'Google login is temporarily unavailable. Please use email and password.'
    );
  };

  // MySQL email login.
  const signInWithEmail = async (email: string, pass: string) => {
    try {
      setIsLoading(true);

      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email: email.trim(),
          password: pass,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      saveAuthenticatedUser(data.user);
    } finally {
      setIsLoading(false);
    }
  };

  // MySQL registration.
  const signUpWithEmail = async (
    email: string,
    pass: string,
    name: string
  ) => {
    try {
      setIsLoading(true);

      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          username: name.trim(),
          email: email.trim(),
          password: pass,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      saveAuthenticatedUser(data.user);
    } finally {
      setIsLoading(false);
    }
  };

  // Guest login.
  const signInAsGuest = () => {
    setUser(null);
    setIsGuest(true);

    const guestProfile: UserProfile = {
      uid: 'guest-driver',
      email: 'guest@roadguard.local',
      displayName: 'Guest Driver',
      photoURL: '',
      preferredMode: 'both',
    };

    setUserProfile(guestProfile);

    localStorage.setItem('roadguard_guest_session', 'true');
    localStorage.removeItem('roadguard_authenticated_profile');
  };

  // MySQL logout.
  const logout = async () => {
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout request failed:', error);
    } finally {
      setUser(null);
      setUserProfile(null);
      setIsGuest(false);

      localStorage.removeItem('roadguard_guest_session');
      localStorage.removeItem('roadguard_authenticated_profile');
    }
  };

  // Store preferred detection mode locally for now.
  const updatePreferredMode = async (
    mode: 'both' | 'potholes' | 'speed'
  ) => {
    setUserProfile((previous) => {
      if (!previous) return null;

      const updatedProfile = {
        ...previous,
        preferredMode: mode,
      };

      localStorage.setItem(
        'roadguard_authenticated_profile',
        JSON.stringify(updatedProfile)
      );

      return updatedProfile;
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        isLoading,
        isGuest,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        signInAsGuest,
        logout,
        updatePreferredMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
