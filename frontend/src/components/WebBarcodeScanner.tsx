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
  const mountedRef = useRef(true);

  // Callback stabile per onScan
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const stopScanner = useCallback(() => {
    if (scannerRef.current) {
      try {
        scannerRef.current.stop().catch(() => {});
      } catch (e) {
        // Ignore
      }
    }
  }, []);

  const handleClose = useCallback(() => {
    stopScanner();
    onClose();
  }, [onClose, stopScanner]);

  const handleSuccessfulScan = useCallback((isbn: string) => {
    if (hasScannedRef.current) return;
    hasScannedRef.current = true;
    stopScanner();
    onScanRef.current(isbn);
  }, [stopScanner]);

  useEffect(() => {
    mountedRef.current = true;
    
    // Check platform
    if (Platform.OS !== 'web') {
      setStatus('error');
      setErrorMsg('Scanner disponibile solo su browser');
      return;
    }

    // Timeout per il caricamento
    const loadTimeout = setTimeout(() => {
      if (mountedRef.current && status === 'loading') {
        setStatus('error');
        setErrorMsg('Timeout caricamento scanner. Riprova.');
      }
    }, 15000);

    const initScanner = async () => {
      try {
        // Import dinamico con retry
        let Html5Qrcode: any;
        try {
          const module = await import('html5-qrcode');
          Html5Qrcode = module.Html5Qrcode;
        } catch (importError) {
          console.error('Import error:', importError);
          if (mountedRef.current) {
            setStatus('error');
            setErrorMsg('Impossibile caricare lo scanner. Verifica la connessione.');
          }
          return;
        }

        if (!mountedRef.current) return;

        // Wait for DOM
        await new Promise(r => setTimeout(r, 500));

        const element = document.getElementById('qr-reader');
        if (!element) {
          throw new Error('Elemento scanner non trovato');
        }

        const scanner = new Html5Qrcode('qr-reader', { verbose: false });
        scannerRef.current = scanner;

        const windowWidth = window.innerWidth;
        const qrboxWidth = Math.min(windowWidth * 0.85, 320);
        const qrboxHeight = Math.round(qrboxWidth * 0.45);

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: qrboxWidth, height: qrboxHeight },
            aspectRatio: 1.0,
          },
          (text: string) => {
            if (!mountedRef.current || hasScannedRef.current) return;
            
            const isbn = text.replace(/[^0-9X]/gi, '');
            console.log('Scanned barcode:', isbn);
            
            if (isbn.length === 10 || isbn.length === 13) {
              handleSuccessfulScan(isbn);
            }
          },
          () => {
            // Ignore scan errors (no barcode in frame)
          }
        );

        if (mountedRef.current) {
          setStatus('ready');
          clearTimeout(loadTimeout);
        }
      } catch (err: any) {
        console.error('Scanner init error:', err);
        if (!mountedRef.current) return;

        clearTimeout(loadTimeout);
        
        let msg = 'Errore avvio scanner';
        if (err.name === 'NotAllowedError' || err.message?.includes('Permission')) {
          msg = 'Permesso fotocamera negato.\n\nConsenti l\'accesso alla fotocamera nelle impostazioni del browser.';
        } else if (err.name === 'NotFoundError' || err.message?.includes('NotFoundError')) {
          msg = 'Fotocamera non trovata.\n\nAssicurati che il dispositivo abbia una fotocamera.';
        } else if (err.message) {
          msg = err.message;
        }
        
        setStatus('error');
        setErrorMsg(msg);
      }
    };

    // Start after small delay
    const startTimer = setTimeout(initScanner, 200);

    return () => {
      mountedRef.current = false;
      clearTimeout(loadTimeout);
      clearTimeout(startTimer);
      stopScanner();
    };
  }, [handleSuccessfulScan, stopScanner]);

  // Non renderizzare su native
  if (Platform.OS !== 'web') {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleClose} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>
          {scannerMode === 'cerca' ? 'Cerca Libro' : 'Scansiona ISBN'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Scanner Area */}
      <View style={styles.scannerArea}>
        {/* Loading */}
        {status === 'loading' && (
          <View style={styles.statusOverlay}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.statusText}>Avvio fotocamera...</Text>
            <Text style={styles.statusHint}>Consenti l'accesso se richiesto</Text>
          </View>
        )}

        {/* Error */}
        {status === 'error' && (
          <View style={styles.statusOverlay}>
            <Ionicons name="alert-circle-outline" size={56} color="#ff6b6b" />
            <Text style={styles.errorText}>{errorMsg}</Text>
            <TouchableOpacity style={styles.closeErrorBtn} onPress={handleClose} activeOpacity={0.8}>
              <Text style={styles.closeErrorBtnText}>Chiudi</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Scanner container - always render for html5-qrcode */}
        <div 
          id="qr-reader" 
          style={{ 
            width: '100%', 
            height: '100%',
            display: status === 'ready' ? 'block' : 'none',
          }} 
        />
      </View>

      {/* Instructions */}
      {status === 'ready' && (
        <View style={styles.instructions}>
          <Ionicons name="scan-outline" size={20} color="#4CAF50" />
          <Text style={styles.instructionsText}>Inquadra il codice a barre ISBN</Text>
        </View>
      )}

      {/* Manual input button */}
      <TouchableOpacity style={styles.manualBtn} onPress={handleClose} activeOpacity={0.8}>
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
    paddingTop: 48,
    paddingBottom: 12,
    paddingHorizontal: 12,
    backgroundColor: '#1a472a',
  },
  backBtn: {
    padding: 8,
    borderRadius: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  scannerArea: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#111',
  },
  statusOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 10,
  },
  statusText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 16,
  },
  statusHint: {
    color: '#888',
    fontSize: 13,
    marginTop: 8,
  },
  errorText: {
    color: '#fff',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  closeErrorBtn: {
    marginTop: 28,
    backgroundColor: '#1a472a',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  closeErrorBtnText: {
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
  instructionsText: {
    color: '#ddd',
    fontSize: 14,
  },
  manualBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1a472a',
    paddingVertical: 15,
    marginHorizontal: 16,
    marginBottom: 30,
    borderRadius: 10,
  },
  manualBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
