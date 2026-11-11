/**
 * PWA Service Worker Registration Utility
 * Uses dynamic import of 'virtual:pwa-register' only in production so the Vite development server
 * never fails when resolving virtual PWA modules or handling dev-time hot updates.
 */
export async function registerAppServiceWorker() {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator && import.meta.env.PROD) {
    try {
      const { registerSW } = await import('virtual:pwa-register');
      const updateSW = registerSW({
        immediate: true,
        onNeedRefresh() {
          console.log('RoadGuard: New version available');
        },
        onOfflineReady() {
          console.log('RoadGuard: Application cached for offline driving');
        },
        onRegisterError(error: any) {
          console.warn('RoadGuard ServiceWorker registration notice (preview environment):', error);
        },
      });
      return updateSW;
    } catch (err) {
      console.warn('SW registration skipped:', err);
    }
  }
  return undefined;
}
