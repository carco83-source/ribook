import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Keyboard,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import * as Device from 'expo-device';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';

interface Book {
  id: string;
  isbn: string;
  titolo: string;
  autori?: string;
  editore?: string;
  disciplina?: string;
  prezzo_copertina?: number;
}

interface SearchResult {
  book: Book;
  copie_disponibili: number;
  prezzo_minimo?: number;
}

interface PopularBook {
  isbn: string;
  titolo: string;
  count: number;
}

// Anno scolastico corrente
const CURRENT_SCHOOL_YEAR = '2025/2026';
// Prossimo anno (per future implementazioni)
const NEXT_SCHOOL_YEAR = '2026/2027';

export default function SearchSellScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  
  // Vendi states
  const [vendiIsbn, setVendiIsbn] = useState('');
  const [vendiLoading, setVendiLoading] = useState(false);
  const [vendiBook, setVendiBook] = useState<Book | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [cameraKey, setCameraKey] = useState(0);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  
  // Cerca states
  const [cercaIsbn, setCercaIsbn] = useState('');
  const [cercaLoading, setCercaLoading] = useState(false);
  const [cercaResults, setCercaResults] = useState<SearchResult[]>([]);
  const [cercaBook, setCercaBook] = useState<Book | null>(null);
  
  // Libri popolari states
  const [popularBooks, setPopularBooks] = useState<PopularBook[]>([]);
  const [popularLoading, setPopularLoading] = useState(false);

  useEffect(() => {
    loadUserId();
    loadPopularBooks();
    // Log platform info on mount for debugging
    console.log('Search screen mounted - Platform.OS:', Platform.OS);
  }, []);

  const loadUserId = async () => {
    const id = await AsyncStorage.getItem('user_id');
    setUserId(id);
  };

  const loadPopularBooks = async () => {
    setPopularLoading(true);
    try {
      // Fetch i libri più presenti nelle adozioni
      const response = await axios.get(`${API_URL}/api/books/popular`, {
        params: { anno_scolastico: CURRENT_SCHOOL_YEAR, limit: 12 }
      });
      if (response.data && response.data.length > 0) {
        setPopularBooks(response.data);
      }
    } catch (error) {
      console.log('Error loading popular books:', error);
      // In caso di errore, mostra alcuni libri di esempio
      // Questi verranno sostituiti dai dati reali dall'API
    } finally {
      setPopularLoading(false);
    }
  };

  // Check if we're running on native (not web)
  const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  // ==================== VENDI FUNCTIONS ====================
  
  const handleVendiSearch = async () => {
    if (!vendiIsbn || vendiIsbn.length < 10) {
      showAlert('Errore', 'Inserisci un ISBN valido (10 o 13 cifre)');
      return;
    }
    
    Keyboard.dismiss();
    setVendiLoading(true);
    setVendiBook(null);
    
    try {
      // Usa il nuovo endpoint lookup che cerca prima nel DB locale
      const response = await axios.get(`${API_URL}/api/books/lookup/${vendiIsbn}`);
      if (response.data) {
        const bookData = response.data;
        setVendiBook({
          id: bookData.id,
          isbn: bookData.isbn,
          titolo: bookData.titolo || '',
          autori: bookData.autori,
          editore: bookData.editore,
          prezzo_copertina: bookData.prezzo_copertina || 0,
          cover_url: bookData.cover_url,
          cover_fallback: bookData.cover_fallback,
          source: bookData.source,
        });
      }
    } catch (error) {
      console.error('Error searching book:', error);
      // In caso di errore, permetti di procedere con dati manuali
      const cleanIsbn = vendiIsbn.replace(/[^0-9X]/gi, '');
      setVendiBook({
        id: `manual-${cleanIsbn}`,
        isbn: cleanIsbn,
        titolo: '',
        prezzo_copertina: 0,
        cover_url: `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-M.jpg`,
        cover_fallback: `https://www.ibs.it/images/${cleanIsbn}_0_0_0_536_0.jpg`,
        source: 'not_found',
      });
    } finally {
      setVendiLoading(false);
    }
  };

  const handleBarCodeScanned = useCallback((scanResult: BarcodeScanningResult) => {
    if (scanned || !isCameraReady) return; // Previene scansioni multiple e premature
    
    const { type, data } = scanResult;
    setScanned(true);
    console.log('=== BARCODE SCANNED ===');
    console.log('Type:', type);
    console.log('Data:', data);
    
    // Clean the ISBN - rimuovi caratteri non numerici (eccetto X per ISBN-10)
    const cleanIsbn = data.replace(/[^0-9X]/gi, '');
    console.log('Clean ISBN:', cleanIsbn);
    
    // Valida la lunghezza dell'ISBN
    if (cleanIsbn.length < 10 || cleanIsbn.length > 13) {
      console.log('Invalid ISBN length, ignoring...');
      setScanned(false);
      return;
    }
    
    // Vibration feedback
    if (Platform.OS !== 'web') {
      try {
        const Haptics = require('expo-haptics');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {
        // Haptics not available
      }
    }
    
    setVendiIsbn(cleanIsbn);
    setShowScanner(false);
    setIsCameraReady(false);
    
    // Auto search after closing scanner
    setTimeout(() => {
      handleVendiSearchWithIsbn(cleanIsbn);
    }, 300);
  }, [scanned, isCameraReady]);

  const handleVendiSearchWithIsbn = async (isbn: string) => {
    if (!isbn || isbn.length < 10) return;
    
    setVendiLoading(true);
    setVendiBook(null);
    
    try {
      // Usa il nuovo endpoint lookup
      const response = await axios.get(`${API_URL}/api/books/lookup/${isbn}`);
      if (response.data) {
        const bookData = response.data;
        setVendiBook({
          id: bookData.id,
          isbn: bookData.isbn,
          titolo: bookData.titolo || '',
          autori: bookData.autori,
          editore: bookData.editore,
          prezzo_copertina: bookData.prezzo_copertina || 0,
          cover_url: bookData.cover_url,
          cover_fallback: bookData.cover_fallback,
          source: bookData.source,
        });
      }
    } catch (error) {
      console.error('Error searching book:', error);
      const cleanIsbn = isbn.replace(/[^0-9X]/gi, '');
      setVendiBook({
        id: `manual-${cleanIsbn}`,
        isbn: cleanIsbn,
        titolo: '',
        prezzo_copertina: 0,
        cover_url: `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-M.jpg`,
        cover_fallback: `https://www.ibs.it/images/${cleanIsbn}_0_0_0_536_0.jpg`,
        source: 'not_found',
      });
    } finally {
      setVendiLoading(false);
    }
  };

  const goToSellBook = () => {
    if (vendiBook) {
      router.push(`/sell-form?isbn=${vendiBook.isbn}&titolo=${encodeURIComponent(vendiBook.titolo || '')}&prezzo=${vendiBook.prezzo_copertina || 0}`);
    }
  };

  const openScanner = async () => {
    console.log('=== SCANNER DEBUG ===');
    console.log('Platform.OS:', Platform.OS);
    console.log('Device.isDevice:', Device.isDevice);
    
    const isPhysicalDevice = Device.isDevice;
    
    if (!isPhysicalDevice) {
      showAlert('Scanner', 'La scansione barcode è disponibile solo sull\'app mobile.\n\nPuoi inserire l\'ISBN manualmente.');
      return;
    }
    
    try {
      console.log('Requesting Camera permissions...');
      console.log('Current permission status:', permission?.status);
      
      if (!permission?.granted) {
        const result = await requestPermission();
        console.log('Permission result:', result);
        
        if (!result.granted) {
          showAlert('Permesso Fotocamera', 'Per scansionare i codici a barre, consenti l\'accesso alla fotocamera nelle Impostazioni del telefono.');
          return;
        }
      }
      
      console.log('Opening scanner...');
      setScannerError(null);
      setScanned(false);
      setIsCameraReady(false);
      setCameraKey(prev => prev + 1); // Force remount camera
      setShowScanner(true);
    } catch (error) {
      console.error('Error opening scanner:', error);
      setScannerError('Errore apertura fotocamera');
      showAlert('Errore Scanner', 'Impossibile aprire lo scanner. Prova a inserire l\'ISBN manualmente.');
    }
  };

  const handleCameraReady = useCallback(() => {
    console.log('Camera is ready!');
    setIsCameraReady(true);
    setScannerError(null);
  }, []);

  const closeScanner = useCallback(() => {
    console.log('Closing scanner...');
    setShowScanner(false);
    setScanned(false);
    setIsCameraReady(false);
    setScannerError(null);
  }, []);

  // ==================== CERCA FUNCTIONS ====================

  const handleCercaSearch = async () => {
    if (!cercaIsbn || cercaIsbn.length < 10) {
      showAlert('Errore', 'Inserisci un ISBN valido (10 o 13 cifre)');
      return;
    }
    
    Keyboard.dismiss();
    setCercaLoading(true);
    setCercaResults([]);
    setCercaBook(null);
    
    try {
      // Prima cerca il libro
      let bookData = null;
      
      // Prova endpoint specifico
      try {
        const bookResponse = await axios.get(`${API_URL}/api/books/search/${cercaIsbn}`);
        if (bookResponse.data) {
          bookData = bookResponse.data;
          setCercaBook(bookData);
        }
      } catch (e) {
        // Prova ricerca generica
        try {
          const genericResponse = await axios.get(`${API_URL}/api/books/search`, {
            params: { q: cercaIsbn }
          });
          if (genericResponse.data?.books && genericResponse.data.books.length > 0) {
            bookData = genericResponse.data.books[0];
            setCercaBook(bookData);
          }
        } catch (e2) {
          console.log('Book not found in database');
        }
      }
      
      // Cerca le copie disponibili
      try {
        const listingsResponse = await axios.get(`${API_URL}/api/listings/isbn/${cercaIsbn}`);
        if (listingsResponse.data && listingsResponse.data.length > 0) {
          const copie = listingsResponse.data.length;
          const prezzoMinimo = Math.min(...listingsResponse.data.map((l: any) => l.prezzo_vendita || l.price || 999));
          setCercaResults([{
            book: bookData || { id: cercaIsbn, isbn: cercaIsbn, titolo: 'Libro' },
            copie_disponibili: copie,
            prezzo_minimo: prezzoMinimo,
          }]);
        } else {
          // Nessuna copia disponibile ma mostra comunque il libro se trovato
          if (bookData) {
            setCercaResults([{
              book: bookData,
              copie_disponibili: 0,
              prezzo_minimo: undefined,
            }]);
          } else {
            setCercaResults([]);
          }
        }
      } catch (e) {
        // Anche se non ci sono listings, mostra il libro se trovato
        if (bookData) {
          setCercaResults([{
            book: bookData,
            copie_disponibili: 0,
            prezzo_minimo: undefined,
          }]);
        }
      }
    } catch (error) {
      console.error('Error searching:', error);
      showAlert('Errore', 'Impossibile cercare il libro');
    } finally {
      setCercaLoading(false);
    }
  };

  const goToBookSellers = () => {
    if (cercaIsbn) {
      router.push(`/book-sellers/${cercaIsbn}`);
    }
  };

  // ==================== RENDER ====================

  if (showScanner) {
    return (
      <View style={styles.scannerContainer}>
        <CameraView
          key={cameraKey}
          style={StyleSheet.absoluteFillObject}
          facing="back"
          autofocus="on"
          barcodeScannerSettings={{
            barcodeTypes: ['ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e'],
          }}
          onCameraReady={handleCameraReady}
          onBarcodeScanned={isCameraReady && !scanned ? handleBarCodeScanned : undefined}
        />
        
        {/* Loading overlay while camera initializes */}
        {!isCameraReady && (
          <View style={styles.cameraLoadingOverlay}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.cameraLoadingText}>Inizializzazione fotocamera...</Text>
          </View>
        )}
        
        {/* Scanner overlay with viewfinder */}
        <View style={styles.scannerOverlay}>
          {/* Top dark area */}
          <View style={styles.overlayDark} />
          
          {/* Middle row with viewfinder */}
          <View style={styles.overlayMiddle}>
            <View style={styles.overlayDarkSide} />
            <View style={styles.scannerFrameContainer}>
              <View style={styles.scannerFrame}>
                {/* Corner markers */}
                <View style={[styles.cornerMarker, styles.cornerTopLeft]} />
                <View style={[styles.cornerMarker, styles.cornerTopRight]} />
                <View style={[styles.cornerMarker, styles.cornerBottomLeft]} />
                <View style={[styles.cornerMarker, styles.cornerBottomRight]} />
                
                {/* Scan line animation indicator */}
                {isCameraReady && (
                  <View style={styles.scanLine} />
                )}
              </View>
            </View>
            <View style={styles.overlayDarkSide} />
          </View>
          
          {/* Bottom area with instructions */}
          <View style={styles.overlayBottom}>
            <Text style={styles.scannerText}>
              {isCameraReady ? 'Inquadra il codice a barre ISBN' : 'Attendere...'}
            </Text>
            <Text style={styles.scannerHint}>
              {isCameraReady ? 'Posiziona il codice nel riquadro verde' : 'Preparazione fotocamera'}
            </Text>
            
            {/* Manual entry button */}
            <TouchableOpacity 
              style={styles.manualEntryButton}
              onPress={() => {
                closeScanner();
              }}
            >
              <Ionicons name="keypad-outline" size={20} color="#fff" />
              <Text style={styles.manualEntryText}>Inserisci manualmente</Text>
            </TouchableOpacity>
          </View>
        </View>
        
        {/* Close button */}
        <TouchableOpacity 
          style={styles.scannerCloseBtn}
          onPress={closeScanner}
        >
          <Ionicons name="close" size={30} color="#fff" />
        </TouchableOpacity>
        
        {/* Camera ready indicator */}
        {isCameraReady && (
          <View style={styles.cameraReadyBadge}>
            <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
            <Text style={styles.cameraReadyText}>Pronto</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* ==================== SEZIONE VENDI ==================== */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="pricetag" size={24} color="#2196F3" />
          <Text style={styles.sectionTitle}>VENDI UN LIBRO</Text>
        </View>
        
        <View style={styles.inputRow}>
          <TextInput
            style={styles.isbnInput}
            placeholder="Inserisci ISBN o scansiona"
            placeholderTextColor="#999"
            value={vendiIsbn}
            onChangeText={setVendiIsbn}
            keyboardType="numeric"
            maxLength={13}
          />
          <TouchableOpacity style={styles.scanButton} onPress={openScanner}>
            <Ionicons name="barcode" size={24} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.searchButton} onPress={handleVendiSearch}>
            {vendiLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="search" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>

        {vendiBook && (
          <View style={styles.resultCard}>
            {vendiBook.source === 'not_found' ? (
              /* Libro NON scolastico - non vendibile */
              <View style={styles.notSchoolBookContainer}>
                <Ionicons name="alert-circle" size={48} color="#FF9800" />
                <Text style={styles.notSchoolBookTitle}>Libro non trovato</Text>
                <Text style={styles.notSchoolBookText}>
                  Questo libro non fa parte delle adozioni scolastiche delle 21 scuole di Catanzaro.
                </Text>
                <Text style={styles.notSchoolBookSubtext}>
                  Al momento è possibile vendere solo libri scolastici adottati.
                </Text>
              </View>
            ) : (
              /* Libro scolastico - vendibile */
              <>
                <Image
                  source={{ uri: vendiBook.cover_url || `https://covers.openlibrary.org/b/isbn/${vendiBook.isbn}-M.jpg` }}
                  style={styles.bookCover}
                  resizeMode="contain"
                  onError={() => {
                    // Se Open Library fallisce, usa IBS come fallback
                  }}
                />
                <View style={styles.bookInfo}>
                  <Text style={styles.bookTitle} numberOfLines={2}>{vendiBook.titolo}</Text>
                  {vendiBook.autori && <Text style={styles.bookAuthor}>{vendiBook.autori}</Text>}
                  <Text style={styles.bookIsbn}>ISBN: {vendiBook.isbn}</Text>
                  {vendiBook.prezzo_copertina && vendiBook.prezzo_copertina > 0 && (
                    <Text style={styles.bookPrice}>Prezzo copertina: €{vendiBook.prezzo_copertina.toFixed(2)}</Text>
                  )}
                </View>
                <TouchableOpacity style={styles.actionButton} onPress={goToSellBook}>
                  <Text style={styles.actionButtonText}>Vendi</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* ==================== SEZIONE CERCA ==================== */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="search" size={24} color="#4CAF50" />
          <Text style={[styles.sectionTitle, { color: '#4CAF50' }]}>CERCA UN LIBRO</Text>
        </View>
        
        <View style={styles.inputRow}>
          <TextInput
            style={styles.isbnInput}
            placeholder="Inserisci ISBN del libro"
            placeholderTextColor="#999"
            value={cercaIsbn}
            onChangeText={setCercaIsbn}
            keyboardType="numeric"
            maxLength={13}
          />
          <TouchableOpacity style={[styles.searchButton, { backgroundColor: '#4CAF50' }]} onPress={handleCercaSearch}>
            {cercaLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="search" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>

        {cercaBook && (
          <View style={styles.resultCard}>
            <Image
              source={{ uri: `https://www.ibs.it/images/${cercaBook.isbn}_0_0_0_536_0.jpg` }}
              style={styles.bookCover}
              resizeMode="contain"
            />
            <View style={styles.bookInfo}>
              <Text style={styles.bookTitle} numberOfLines={2}>{cercaBook.titolo}</Text>
              {cercaBook.autori && <Text style={styles.bookAuthor}>{cercaBook.autori}</Text>}
              <Text style={styles.bookIsbn}>ISBN: {cercaBook.isbn}</Text>
              
              {cercaResults.length > 0 ? (
                <View style={styles.availabilityBadge}>
                  <Text style={styles.availabilityText}>
                    {cercaResults[0].copie_disponibili} {cercaResults[0].copie_disponibili === 1 ? 'copia' : 'copie'} disponibili
                  </Text>
                  {cercaResults[0].prezzo_minimo && (
                    <Text style={styles.priceText}>da €{cercaResults[0].prezzo_minimo.toFixed(2)}</Text>
                  )}
                </View>
              ) : (
                <View style={[styles.availabilityBadge, { backgroundColor: '#ffebee' }]}>
                  <Text style={[styles.availabilityText, { color: '#F44336' }]}>
                    Nessuna copia disponibile
                  </Text>
                </View>
              )}
            </View>
            {cercaResults.length > 0 && (
              <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#4CAF50' }]} onPress={goToBookSellers}>
                <Text style={styles.actionButtonText}>Vedi</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Divider */}
      <View style={styles.dividerDark} />

      {/* ==================== GRIGLIA COPERTINE LIBRI POPOLARI ==================== */}
      <View style={styles.popularBooksSection}>
        {popularLoading ? (
          <ActivityIndicator size="large" color="#FF5722" style={{ marginVertical: 40 }} />
        ) : popularBooks.length > 0 ? (
          <View style={styles.booksGrid}>
            {popularBooks.slice(0, 12).map((book, index) => (
              <TouchableOpacity 
                key={book.isbn || index} 
                style={styles.bookGridItem}
                onPress={() => {
                  setCercaIsbn(book.isbn);
                }}
              >
                <Image
                  source={{ uri: `https://www.ibs.it/images/${book.isbn}_0_0_0_536_0.jpg` }}
                  style={styles.bookGridCover}
                  resizeMode="cover"
                />
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="book-outline" size={48} color="#ccc" />
            <Text style={styles.emptyStateText}>Nessun libro trovato</Text>
          </View>
        )}
      </View>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  section: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  isbnInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  scanButton: {
    backgroundColor: '#FF9800',
    borderRadius: 10,
    width: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchButton: {
    backgroundColor: '#2196F3',
    borderRadius: 10,
    width: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 8,
    backgroundColor: '#e0e0e0',
  },
  dividerDark: {
    height: 8,
    backgroundColor: '#9e9e9e',
  },
  popularBooksSection: {
    backgroundColor: '#fff',
    padding: 8,
  },
  booksGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  bookGridItem: {
    width: (Dimensions.get('window').width - 16 - 24) / 4, // 4 colonne
    aspectRatio: 0.65,
    margin: 3,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
    borderWidth: 2,
    borderColor: '#fff',
  },
  bookGridCover: {
    width: '100%',
    height: '100%',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    marginTop: 12,
    fontSize: 14,
    color: '#999',
  },
  resultCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  bookCover: {
    width: 60,
    height: 85,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
  },
  bookInfo: {
    flex: 1,
    marginLeft: 12,
  },
  bookTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  bookAuthor: {
    fontSize: 13,
    color: '#666',
    marginBottom: 2,
  },
  bookIsbn: {
    fontSize: 12,
    color: '#888',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  bookPrice: {
    fontSize: 13,
    color: '#1a472a',
    fontWeight: '600',
  },
  availabilityBadge: {
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 4,
  },
  availabilityText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4CAF50',
  },
  priceText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginTop: 2,
  },
  actionButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  // Scanner styles
  scannerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  scanner: {
    flex: 1,
  },
  scannerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerFrame: {
    width: 300,
    height: 180,
    borderWidth: 3,
    borderColor: '#4CAF50',
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  scannerText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 24,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  scannerHint: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  scannerCloseBtn: {
    position: 'absolute',
    top: 60,
    right: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 25,
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // New scanner styles
  cameraLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  cameraLoadingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 16,
  },
  overlayDark: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: '100%',
  },
  overlayMiddle: {
    flexDirection: 'row',
    height: 200,
  },
  overlayDarkSide: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  scannerFrameContainer: {
    width: 280,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayBottom: {
    flex: 1.5,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: '100%',
    alignItems: 'center',
    paddingTop: 20,
  },
  cornerMarker: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#4CAF50',
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 12,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 12,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 12,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 12,
  },
  scanLine: {
    position: 'absolute',
    left: 10,
    right: 10,
    height: 2,
    backgroundColor: '#4CAF50',
    top: '50%',
  },
  manualEntryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: 30,
    gap: 8,
  },
  manualEntryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  cameraReadyBadge: {
    position: 'absolute',
    top: 60,
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    gap: 4,
  },
  cameraReadyText: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '600',
  },
  // Stili per libro non scolastico
  notSchoolBookContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  notSchoolBookTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF9800',
    marginTop: 12,
    textAlign: 'center',
  },
  notSchoolBookText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  notSchoolBookSubtext: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
});
