import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface WebBarcodeScannerProps {
  onScan: (isbn: string) => void;
  onClose: () => void;
  scannerMode: 'vendi' | 'cerca';
}

export default function WebBarcodeScanner({ onScan, onClose, scannerMode }: WebBarcodeScannerProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const scannerRef = useRef<any>(null);
  const hasScannedRef = useRef(false);
  const isMountedRef = useRef(true);

  // Stable refs for callbacks
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  
  useEffect(() => {
    onScanRef.current = onScan;
    onCloseRef.current = onClose;
  }, [onScan, onClose]);

  // Stop and cleanup scanner
  const cleanup = useCallback(async () => {
    console.log('[WebScanner] Cleanup called');
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        console.log('[WebScanner] Scanner state:', state);
        if (state === 2) { // SCANNING
          await scannerRef.current.stop();
          console.log('[WebScanner] Scanner stopped');
        }
        scannerRef.current.clear();
        console.log('[WebScanner] Scanner cleared');
      } catch (e) {
        console.log('[WebScanner] Cleanup error (ignored):', e);
      }
      scannerRef.current = null;
    }
  }, []);

  // Handle close button
  const handleClose = useCallback(async () => {
    console.log('[WebScanner] handleClose called');
    await cleanup();
    // Use setTimeout to ensure state update happens after cleanup
    setTimeout(() => {
      onCloseRef.current();
    }, 100);
  }, [cleanup]);

  // Handle successful scan
  const handleSuccessfulScan = useCallback(async (isbn: string) => {
    if (hasScannedRef.current || !isMountedRef.current) return;
    hasScannedRef.current = true;
    console.log('[WebScanner] Successful scan:', isbn);
    
    await cleanup();
    
    setTimeout(() => {
      if (isMountedRef.current) {
        onScanRef.current(isbn);
      }
    }, 100);
  }, [cleanup]);

  useEffect(() => {
    isMountedRef.current = true;
    hasScannedRef.current = false;

    if (Platform.OS !== 'web') {
      setStatus('error');
      setErrorMsg('Scanner disponibile solo su browser');
      return;
    }

    let timeoutId: any;
    
    const init = async () => {
      try {
        console.log('[WebScanner] Initializing...');
        
        // Dynamic import
        const { Html5Qrcode } = await import('html5-qrcode');
        
        if (!isMountedRef.current) return;

        // Wait for DOM element
        await new Promise(r => setTimeout(r, 400));
        
        const el = document.getElementById('barcode-reader');
        if (!el) {
          throw new Error('Element not found');
        }

        const scanner = new Html5Qrcode('barcode-reader', { verbose: false });
        scannerRef.current = scanner;

        const width = Math.min(window.innerWidth - 40, 300);
        const height = Math.round(width * 0.5);

        console.log('[WebScanner] Starting camera...');
        
        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 15,
            qrbox: { width, height },
            aspectRatio: window.innerWidth / window.innerHeight,
          },
          (decodedText: string) => {
            if (!isMountedRef.current || hasScannedRef.current) return;
            
            // Clean ISBN - keep only digits and X
            const isbn = decodedText.replace(/[^0-9Xx]/g, '').toUpperCase();
            console.log('[WebScanner] Decoded:', decodedText, '-> ISBN:', isbn);
            
            // Validate ISBN length
            if (isbn.length === 10 || isbn.length === 13) {
              handleSuccessfulScan(isbn);
            }
          },
          () => {
            // Ignore - no code found in frame (this is normal)
          }
        );

        if (isMountedRef.current) {
          console.log('[WebScanner] Camera started successfully');
          setStatus('ready');
        }
      } catch (err: any) {
        console.error('[WebScanner] Init error:', err);
        
        if (!isMountedRef.current) return;
        
        let msg = 'Errore avvio fotocamera';
        
        if (err.name === 'NotAllowedError' || err.message?.includes('denied') || err.message?.includes('Permission')) {
          msg = 'Permesso fotocamera negato.\n\nPer usare lo scanner:\n1. Tocca l\'icona 🔒 nella barra indirizzi\n2. Consenti accesso alla fotocamera\n3. Ricarica la pagina';
        } else if (err.name === 'NotFoundError' || err.message?.includes('Requested device not found')) {
          msg = 'Nessuna fotocamera trovata.\n\nAssicurati che il dispositivo abbia una fotocamera posteriore.';
        } else if (err.message?.includes('NotReadableError') || err.message?.includes('in use')) {
          msg = 'Fotocamera già in uso.\n\nChiudi altre app che usano la fotocamera e riprova.';
        }
        
        setStatus('error');
        setErrorMsg(msg);
      }
    };

    // Add timeout
    timeoutId = setTimeout(() => {
      if (isMountedRef.current && status === 'loading') {
        console.log('[WebScanner] Timeout reached');
        setStatus('error');
        setErrorMsg('Timeout avvio fotocamera.\n\nRiprova o inserisci l\'ISBN manualmente.');
      }
    }, 12000);

    init();

    return () => {
      console.log('[WebScanner] Unmounting...');
      isMountedRef.current = false;
      clearTimeout(timeoutId);
      cleanup();
    };
  }, [cleanup, handleSuccessfulScan]);

  if (Platform.OS !== 'web') return null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={handleClose} 
          style={styles.headerBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {scannerMode === 'cerca' ? 'Cerca Libro' : 'Scansiona ISBN'}
        </Text>
        <TouchableOpacity 
          onPress={handleClose}
          style={styles.headerBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Scanner Area */}
      <View style={styles.scannerArea}>
        {status === 'loading' && (
          <View style={styles.overlay}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.overlayText}>Avvio fotocamera...</Text>
            <Text style={styles.overlayHint}>Consenti l'accesso se richiesto</Text>
          </View>
        )}

        {status === 'error' && (
          <View style={styles.overlay}>
            <Ionicons name="warning-outline" size={60} color="#ff6b6b" />
            <Text style={styles.errorText}>{errorMsg}</Text>
            <TouchableOpacity style={styles.errorBtn} onPress={handleClose}>
              <Text style={styles.errorBtnText}>Chiudi Scanner</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* This div MUST exist for html5-qrcode */}
        <div 
          id="barcode-reader"
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: '#000',
            visibility: status === 'ready' ? 'visible' : 'hidden',
          }}
        />
      </View>

      {/* Instructions when ready */}
      {status === 'ready' && (
        <View style={styles.instructions}>
          <Ionicons name="barcode-outline" size={20} color="#4CAF50" />
          <Text style={styles.instructionText}>Inquadra il codice a barre ISBN del libro</Text>
        </View>
      )}

      {/* Manual input button */}
      <TouchableOpacity style={styles.manualBtn} onPress={handleClose}>
        <Ionicons name="keypad-outline" size={18} color="#fff" />
        <Text style={styles.manualBtnText}>Inserisci ISBN manualmente</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 14,
    paddingHorizontal: 16,
    backgroundColor: '#1a472a',
  },
  headerBtn: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  scannerArea: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#111',
    overflow: 'hidden',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    zIndex: 100,
  },
  overlayText: {
    color: '#fff',
    fontSize: 17,
    marginTop: 20,
    fontWeight: '500',
  },
  overlayHint: {
    color: '#888',
    fontSize: 13,
    marginTop: 8,
  },
  errorText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 22,
  },
  errorBtn: {
    marginTop: 30,
    backgroundColor: '#1a472a',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 10,
  },
  errorBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  instructions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: '#1a1a1a',
  },
  instructionText: {
    color: '#ccc',
    fontSize: 14,
  },
  manualBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1a472a',
    paddingVertical: 16,
    marginHorizontal: 16,
    marginBottom: 34,
    borderRadius: 10,
  },
  manualBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
