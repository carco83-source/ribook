import { useEffect, useCallback } from 'react';
import { Platform } from 'react-native';

/**
 * Hook per gestire gli aggiornamenti dell'app PWA
 * Forza il refresh della cache quando c'è una nuova versione
 */
export function useAppUpdate() {
  const checkForUpdates = useCallback(async () => {
    if (Platform.OS !== 'web') return;
    
    try {
      // Verifica se c'è un Service Worker registrato
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        
        if (registration) {
          // Forza il controllo degli aggiornamenti
          await registration.update();
          
          // Se c'è un nuovo worker in attesa, attivalo
          if (registration.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
        }
      }
    } catch (error) {
      console.log('Service worker update check failed:', error);
    }
  }, []);

  const clearCacheAndReload = useCallback(async () => {
    if (Platform.OS !== 'web') return;
    
    try {
      // Cancella tutte le cache
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
      }
      
      // Rimuovi il Service Worker se presente
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations.map(registration => registration.unregister())
        );
      }
      
      // Ricarica la pagina senza cache
      window.location.reload();
    } catch (error) {
      console.log('Cache clear failed:', error);
      window.location.reload();
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    // Controlla aggiornamenti all'avvio
    checkForUpdates();

    // Controlla aggiornamenti quando l'app torna in primo piano
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdates();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Ascolta messaggi dal Service Worker per aggiornamenti
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // Nuovo Service Worker attivo, ricarica
        window.location.reload();
      });
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkForUpdates]);

  return { checkForUpdates, clearCacheAndReload };
}
