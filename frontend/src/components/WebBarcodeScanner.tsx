import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface WebBarcodeScannerProps {
  onScan: (isbn: string) => void;
  onClose: () => void;
  scannerMode: 'vendi' | 'cerca';
}

export default function WebBarcodeScanner({ onScan, onClose, scannerMode }: WebBarcodeScannerProps) {
  const html5QrCodeRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasScannedRef = useRef(false); // Usa ref invece di state per evitare re-render
  const onScanRef = useRef(onScan); // Ref per callback

  // Aggiorna ref quando cambia onScan
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    // Solo su web
    if (Platform.OS !== 'web') {
      setError('Scanner web disponibile solo su browser');
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const initScanner = async () => {
      try {
        // Import dinamico per evitare errori su native
        const { Html5Qrcode } = await import('html5-qrcode');
        
        if (!isMounted) return;

        // Crea elemento div per lo scanner
        const scannerId = 'web-barcode-scanner';
        
        // Verifica che l'elemento esista
        const element = document.getElementById(scannerId);
        if (!element) {
          console.error('Scanner element not found');
          setError('Errore inizializzazione scanner');
          setIsLoading(false);
          return;
        }

        const html5QrCode = new Html5Qrcode(scannerId);
        html5QrCodeRef.current = html5QrCode;

        // Configurazione ottimizzata per mobile
        const config = {
          fps: 10,
          qrbox: { width: 280, height: 150 }, // Rettangolo per barcode
          aspectRatio: 1.0,
          disableFlip: false,
          // Formati barcode comuni per ISBN
          formatsToSupport: [
            0,  // QR_CODE
            4,  // EAN_13
            5,  // EAN_8
            11, // UPC_A
            12, // UPC_E
            6,  // CODE_128
            7,  // CODE_39
          ]
        };

        // Avvia scanner con fotocamera posteriore
        await html5QrCode.start(
          { facingMode: 'environment' }, // Fotocamera posteriore
          config,
          (decodedText: string) => {
            if (hasScannedRef.current || !isMounted) return;
            
            console.log('Web Scanner - Barcode detected:', decodedText);
            
            // Pulisci ISBN
            const cleanIsbn = decodedText.replace(/[^0-9X]/gi, '');
            
            // Valida lunghezza
            if (cleanIsbn.length === 10 || cleanIsbn.length === 13) {
              hasScannedRef.current = true;
              
              // Ferma scanner prima di notificare
              html5QrCode.stop().then(() => {
                console.log('Scanner stopped after successful scan');
              }).catch((err: any) => {
                console.log('Error stopping scanner:', err);
              });
              
              // Notifica il parent usando ref
              onScanRef.current(cleanIsbn);
            }
          },
          (errorMessage: string) => {
            // Ignora errori di scansione continui (normale quando non c'è barcode)
            // console.log('Scan error:', errorMessage);
          }
        );

        if (isMounted) {
          setIsLoading(false);
          setError(null);
        }

      } catch (err: any) {
        console.error('Error initializing web scanner:', err);
        if (isMounted) {
          if (err.name === 'NotAllowedError') {
            setError('Permesso fotocamera negato. Consenti l\'accesso alla fotocamera nelle impostazioni del browser.');
          } else if (err.name === 'NotFoundError') {
            setError('Nessuna fotocamera trovata sul dispositivo.');
          } else {
            setError('Errore avvio scanner: ' + (err.message || 'Errore sconosciuto'));
          }
          setIsLoading(false);
        }
      }
    };

    // Piccolo delay per assicurarsi che il DOM sia pronto
    const timer = setTimeout(initScanner, 100);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      
      // Cleanup scanner
      if (html5QrCodeRef.current) {
        html5QrCodeRef.current.stop().then(() => {
          console.log('Scanner cleanup completed');
        }).catch((err: any) => {
          console.log('Scanner cleanup error:', err);
        });
      }
    };
  }, []);

  const handleClose = () => {
    if (html5QrCodeRef.current) {
      html5QrCodeRef.current.stop().catch((err: any) => {
        console.log('Error stopping scanner on close:', err);
      });
    }
    onClose();
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {scannerMode === 'cerca' ? 'Cerca libro' : 'Scansiona per vendere'}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Scanner Area */}
      <View style={styles.scannerWrapper}>
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.loadingText}>Avvio fotocamera...</Text>
          </View>
        )}
        
        {error && (
          <View style={styles.errorOverlay}>
            <Ionicons name="alert-circle" size={48} color="#f44336" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={handleClose}>
              <Text style={styles.retryButtonText}>Chiudi</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Div per html5-qrcode */}
        <div 
          id="web-barcode-scanner" 
          style={{ 
            width: '100%', 
            height: '100%',
            display: error ? 'none' : 'block'
          }} 
        />
      </View>

      {/* Instructions */}
      <View style={styles.instructions}>
        <Ionicons name="barcode-outline" size={24} color="#fff" />
        <Text style={styles.instructionsText}>
          Inquadra il codice a barre del libro
        </Text>
      </View>

      {/* Manual Entry Button */}
      <TouchableOpacity style={styles.manualButton} onPress={handleClose}>
        <Ionicons name="keypad-outline" size={20} color="#fff" />
        <Text style={styles.manualButtonText}>Inserisci ISBN manualmente</Text>
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
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  closeButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  scannerWrapper: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    color: '#fff',
    marginTop: 16,
    fontSize: 16,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 10,
  },
  errorText: {
    color: '#fff',
    marginTop: 16,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    marginTop: 24,
    backgroundColor: '#f44336',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  instructions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 20,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  instructionsText: {
    color: '#fff',
    fontSize: 16,
  },
  manualButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1a472a',
    paddingVertical: 16,
    marginHorizontal: 16,
    marginBottom: 32,
    borderRadius: 12,
  },
  manualButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
