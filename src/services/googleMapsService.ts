import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

interface MapsConfig {
  apiKey: string;
}

let googleMapsPromise: Promise<typeof google> | null = null;
let cachedApiKey: string | null = null;
let authFailureCallback: (() => void) | null = null;
let isOptionsConfigured = false;

// Global auth failure listener for Google Maps
if (typeof window !== 'undefined') {
  (window as any).gm_authFailure = () => {
    console.error('Google Maps API authentication failed.');
    if (authFailureCallback) {
      authFailureCallback();
    }
  };
}

export function onGoogleMapsAuthFailure(callback: () => void) {
  authFailureCallback = callback;
}

/**
 * Retrieves the Google Maps API key from Vite environment variable or server config endpoint.
 */
export async function getGoogleMapsApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey;

  // 1. Check local storage override if set
  if (typeof window !== 'undefined') {
    const override = localStorage.getItem('roadguard_maps_override_key');
    if (override && override.trim()) {
      cachedApiKey = override.trim();
      return cachedApiKey;
    }
  }

  // 2. First priority: Server config endpoint (latest updated key from backend)
  try {
    const res = await fetch('/api/config/maps');
    if (res.ok) {
      const data: MapsConfig = await res.json();
      if (data.apiKey && data.apiKey !== 'undefined' && data.apiKey.trim()) {
        cachedApiKey = data.apiKey.trim();
        return cachedApiKey;
      }
    }
  } catch (err) {
    console.warn('Failed to fetch maps key from /api/config/maps:', err);
  }

  // 3. Fallback: Vite environment variable
  const envKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
  if (envKey && envKey !== 'MY_GOOGLE_MAPS_API_KEY' && envKey !== 'undefined') {
    cachedApiKey = envKey;
    return envKey;
  }

  return 'AIzaSyDaseyehUwVPgbRif-cGx6YgyrPrPFP0-A';
}

/**
 * Loads the Google Maps JavaScript API with mandatory tracking attribution.
 */
export async function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window !== 'undefined' && (window as any).google?.maps) {
    return (window as any).google;
  }

  if (googleMapsPromise) {
    return googleMapsPromise;
  }

  googleMapsPromise = (async () => {
    const apiKey = await getGoogleMapsApiKey();

    if (!apiKey) {
      throw new Error('Google Maps API key is not configured.');
    }

    if (!isOptionsConfigured) {
      setOptions({
        key: apiKey,
        v: 'weekly',
        solutionChannel: 'gmp_git_agentskills_v1',
      });
      isOptionsConfigured = true;
    }

    // Load essential libraries
    await importLibrary('maps');
    await importLibrary('marker');

    if (!(window as any).google?.maps) {
      throw new Error('Google Maps library failed to initialize on window object.');
    }

    return (window as any).google;
  })();

  return googleMapsPromise;
}
