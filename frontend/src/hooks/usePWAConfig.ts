import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Configura i meta tag per PWA con cache minima
 * Questo aiuta a ricevere aggiornamenti più velocemente
 */
export function usePWAConfig() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    // Aggiungi meta tag per controllare la cache
    const addMetaTag = (name: string, content: string) => {
      let meta = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement;
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = name;
        document.head.appendChild(meta);
      }
      meta.content = content;
    };

    const addHttpEquiv = (httpEquiv: string, content: string) => {
      let meta = document.querySelector(`meta[http-equiv="${httpEquiv}"]`) as HTMLMetaElement;
      if (!meta) {
        meta = document.createElement('meta');
        meta.httpEquiv = httpEquiv;
        document.head.appendChild(meta);
      }
      meta.content = content;
    };

    // Meta tag per ridurre la cache
    addHttpEquiv('Cache-Control', 'no-cache, no-store, must-revalidate');
    addHttpEquiv('Pragma', 'no-cache');
    addHttpEquiv('Expires', '0');

    // Verifica API (fetch) con timestamp per forzare fresh data
    const originalFetch = window.fetch;
    window.fetch = function(input: RequestInfo | URL, init?: RequestInit) {
      // Aggiungi timestamp solo alle chiamate API
      if (typeof input === 'string' && input.includes('/api/')) {
        const url = new URL(input, window.location.origin);
        url.searchParams.set('_t', Date.now().toString());
        input = url.toString();
      }
      return originalFetch(input, init);
    };

  }, []);
}
