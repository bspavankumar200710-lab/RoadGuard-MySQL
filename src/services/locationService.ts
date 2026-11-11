import { GPSStatus } from '../types/detection';

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
  heading?: number | null;
  speed?: number | null;
}

export type LocationCallback = (coords: LocationCoordinates | null, status: GPSStatus, errorMsg?: string) => void;

class LocationService {
  private watchId: number | null = null;
  private currentCoords: LocationCoordinates | null = null;
  private currentStatus: GPSStatus = 'prompt';
  private errorMessage: string | null = null;
  private listeners: Set<LocationCallback> = new Set();

  // Demo simulation mode state (centered in Bengaluru, Karnataka, India)
  private isSimulating: boolean = false;
  private simInterval: any = null;
  private simLat = 12.9693;
  private simLng = 77.5195;
  private simStep = 0;

  constructor() {
    // Check initial permission status if supported
    if (typeof navigator !== 'undefined' && 'permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' as PermissionName }).then((result) => {
        if (result.state === 'granted') {
          this.currentStatus = 'connected';
        } else if (result.state === 'denied') {
          this.currentStatus = 'denied';
          this.errorMessage = 'Location permission required to geotag detections.';
        }
        this.notify();
      }).catch(() => {
        // Permissions API query not supported for geolocation in some browsers
      });
    }
  }

  public subscribe(callback: LocationCallback): () => void {
    this.listeners.add(callback);
    // Immediately emit current state
    callback(this.currentCoords, this.currentStatus, this.errorMessage || undefined);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.currentCoords, this.currentStatus, this.errorMessage || undefined);
    }
  }

  public startTracking(): Promise<LocationCoordinates | null> {
    if (this.isSimulating) {
      return Promise.resolve(this.currentCoords);
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      this.currentStatus = 'unavailable';
      this.errorMessage = 'Geolocation is not supported by your browser.';
      this.notify();
      return Promise.resolve(null);
    }

    this.currentStatus = 'requesting';
    this.errorMessage = null;
    this.notify();

    return new Promise((resolve) => {
      // First get current position for immediate response
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.currentCoords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            heading: position.coords.heading,
            speed: position.coords.speed,
          };
          this.currentStatus = 'connected';
          this.errorMessage = null;
          this.notify();
          resolve(this.currentCoords);
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            this.currentStatus = 'denied';
            this.errorMessage = 'Location permission required to geotag detections.';
          } else {
            this.currentStatus = 'unavailable';
            this.errorMessage = 'GPS position unavailable. Check device settings.';
          }
          this.notify();
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 2000,
        }
      );

      // Also start continuous watching
      if (this.watchId !== null) {
        navigator.geolocation.clearWatch(this.watchId);
      }

      this.watchId = navigator.geolocation.watchPosition(
        (position) => {
          this.currentCoords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            heading: position.coords.heading,
            speed: position.coords.speed,
          };
          this.currentStatus = 'connected';
          this.errorMessage = null;
          this.notify();
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            this.currentStatus = 'denied';
            this.errorMessage = 'Location permission required to geotag detections.';
          } else {
            this.errorMessage = 'GPS signal lost or weak.';
          }
          this.notify();
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 1000,
        }
      );
    });
  }

  public stopTracking() {
    if (this.watchId !== null && typeof navigator !== 'undefined') {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (this.simInterval) {
      clearInterval(this.simInterval);
      this.simInterval = null;
    }
  }

  public getCurrentCoordinates(): LocationCoordinates | null {
    return this.currentCoords;
  }

  public getStatus(): GPSStatus {
    return this.currentStatus;
  }

  public getErrorMessage(): string | null {
    return this.errorMessage;
  }

  /**
   * Enables simulated driving trajectory for demo/desktop testing
   */
  public enableDemoCoordinates() {
    this.stopTracking();
    this.isSimulating = true;
    this.currentStatus = 'demo';
    this.errorMessage = null;

    // Simulate car moving along a city route
    const updateSim = () => {
      this.simStep += 1;
      // Gently drift northeast along a road
      const latOffset = Math.sin(this.simStep * 0.1) * 0.0005 + (this.simStep * 0.0002);
      const lngOffset = Math.cos(this.simStep * 0.1) * 0.0005 + (this.simStep * 0.0002);
      this.currentCoords = {
        latitude: +(this.simLat + latOffset).toFixed(6),
        longitude: +(this.simLng + lngOffset).toFixed(6),
        accuracy: 5,
        speed: 12.5, // ~45 km/h
        heading: 45,
      };
      this.notify();
    };

    updateSim();
    this.simInterval = setInterval(updateSim, 2000);
  }

  public disableDemoCoordinates() {
    if (this.isSimulating) {
      this.isSimulating = false;
      if (this.simInterval) {
        clearInterval(this.simInterval);
        this.simInterval = null;
      }
      this.currentStatus = 'prompt';
      this.currentCoords = null;
      this.notify();
    }
  }

  /**
   * Helper to format coordinates into human readable GPS string
   * e.g., 37.7749° N, 122.4194° W
   */
  public formatCoordinates(coords: LocationCoordinates | null): { latStr: string; lngStr: string; combined: string } {
    if (!coords) {
      return {
        latStr: '--.----°',
        lngStr: '--.----°',
        combined: 'Location unavailable',
      };
    }

    const latDir = coords.latitude >= 0 ? 'N' : 'S';
    const lngDir = coords.longitude >= 0 ? 'E' : 'W';
    const absLat = Math.abs(coords.latitude).toFixed(4);
    const absLng = Math.abs(coords.longitude).toFixed(4);

    return {
      latStr: `${absLat}° ${latDir}`,
      lngStr: `${absLng}° ${lngDir}`,
      combined: `${absLat}° ${latDir}, ${absLng}° ${lngDir}`,
    };
  }
}

export const locationService = new LocationService();
