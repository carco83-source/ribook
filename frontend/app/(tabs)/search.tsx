import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
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

interface BookAdoption {
  codice_scuola: string;
  nome_scuola: string;
  tipo_scuola: string;
  citta: string;
  provincia: string;
  classi: Array<{ classe: string; sezione: string }>;
}

// Anno scolastico corrente
const CURRENT_SCHOOL_YEAR = '2025/2026';
// Prossimo anno (per future implementazioni)
const NEXT_SCHOOL_YEAR = '2026/2027';

export default function SearchSellScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Vendi states
  const [vendiIsbn, setVendiIsbn] = useState('');
  const [vendiLoading, setVendiLoading] = useState(false);
  const [vendiBook, setVendiBook] = useState<Book | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [cameraKey, setCameraKey] = useState(0);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [scannerMode, setScannerMode] = useState<'vendi' | 'cerca'>('vendi'); // Modalità scanner
  const lastScannedRef = useRef<string | null>(null); // Debounce ref
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Timeout ref
  
  // Cerca states
  const [cercaIsbn, setCercaIsbn] = useState('');
  const [cercaTitolo, setCercaTitolo] = useState('');
  const [cercaLoading, setCercaLoading] = useState(false);
  const [cercaResults, setCercaResults] = useState<SearchResult[]>([]);
  const [cercaBook, setCercaBook] = useState<Book | null>(null);
  const [titolResults, setTitoloResults] = useState<Book[]>([]);
  
  // Libri popolari states
  const [popularBooks, setPopularBooks] = useState<PopularBook[]>([]);
  const [popularLoading, setPopularLoading] = useState(false);
  
  // Adozioni (scuole che hanno adottato il libro cercato per ISBN)
  const [bookAdoptions, setBookAdoptions] = useState<BookAdoption[]>([]);
  const [showAdoptions, setShowAdoptions] = useState(false);

  useEffect(() => {
    loadUserId();
    loadPopularBooks();
    // Log platform info on mount for debugging
    console.log('Search screen mounted - Platform.OS:', Platform.OS);
  }, []);

  // Reset scanner state quando si torna alla schermata
  useFocusEffect(
    useCallback(() => {
      // Reset scanner states quando la schermata viene focalizzata
      setScanned(false);
      setShowScanner(false);
      setIsCameraReady(false);
      lastScannedRef.current = null;
      
      return () => {
        // Cleanup quando si lascia la schermata
        if (scanTimeoutRef.current) {
          clearTimeout(scanTimeoutRef.current);
        }
      };
    }, [])
  );

  const loadUserId = async () => {
    const id = await AsyncStorage.getItem('user_id');
    setUserId(id);
    setIsAnonymous(!id);
    setLoading(false);
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
    // Previeni scansioni multiple
    if (scanned || !isCameraReady) return;
    
    const { data } = scanResult;
    
    // Clean the ISBN
    const cleanIsbn = data.replace(/[^0-9X]/gi, '');
    
    // Ignora se stesso ISBN scansionato di recente (debounce)
    if (lastScannedRef.current === cleanIsbn) {
      return;
    }
    
    // Valida la lunghezza dell'ISBN
    if (cleanIsbn.length < 10 || cleanIsbn.length > 13) {
      return;
    }
    
    // Imposta il flag immediatamente per prevenire ulteriori scansioni
    setScanned(true);
    lastScannedRef.current = cleanIsbn;
    
    console.log('ISBN Scansionato:', cleanIsbn, '- Mode:', scannerMode);
    
    // Vibration feedback
    if (Platform.OS !== 'web') {
      try {
        const Haptics = require('expo-haptics');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {}
    }
    
    // Chiudi scanner immediatamente
    setShowScanner(false);
    setIsCameraReady(false);
    
    // Esegui ricerca dopo breve delay
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
    }
    
    scanTimeoutRef.current = setTimeout(() => {
      if (scannerMode === 'cerca') {
        setCercaTitolo(cleanIsbn);
        handleCercaTitolo(cleanIsbn);
      } else {
        setVendiIsbn(cleanIsbn);
        handleVendiSearchWithIsbn(cleanIsbn);
      }
      // Reset refs after processing
      lastScannedRef.current = null;
    }, 200);
  }, [scanned, isCameraReady, scannerMode]);

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
    setBookAdoptions([]);
    setShowAdoptions(false);
    
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
        const listings = listingsResponse.data?.listings || [];
        if (listings.length > 0) {
          const copie = listings.length;
          const prezzoMinimo = Math.min(...listings.map((l: any) => l.prezzo_vendita || l.price || 999));
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
      
      // Cerca scuole che hanno adottato questo libro
      try {
        console.log('[Search] Fetching adoptions for ISBN:', cercaIsbn);
        const adoptionsResponse = await axios.get(`${API_URL}/api/books/adoptions/${cercaIsbn}`);
        console.log('[Search] Adoptions response:', adoptionsResponse.data);
        if (adoptionsResponse.data?.adoptions && adoptionsResponse.data.adoptions.length > 0) {
          console.log('[Search] Setting', adoptionsResponse.data.adoptions.length, 'adoptions');
          setBookAdoptions(adoptionsResponse.data.adoptions);
          setShowAdoptions(true);
        } else {
          console.log('[Search] No adoptions in response');
        }
      } catch (adoptionError: any) {
        console.log('[Search] Adoptions error:', adoptionError?.message || adoptionError);
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

  // Cerca per titolo o ISBN
  const handleCercaTitolo = async (searchQuery?: string) => {
    const query = searchQuery || cercaTitolo;
    
    if (!query || query.length < 3) {
      showAlert('Errore', 'Inserisci almeno 3 caratteri per la ricerca');
      return;
    }
    
    Keyboard.dismiss();
    // Naviga alla pagina dei risultati
    router.push(`/search-results?q=${encodeURIComponent(query)}`);
  };

  const selectBookFromTitolo = (book: Book) => {
    setCercaTitolo('');
    setTitoloResults([]);
    setCercaIsbn(book.isbn);
    setCercaBook(book);
    // Cerca automaticamente le copie disponibili
    handleCercaSearchWithIsbn(book.isbn);
  };

  const handleCercaSearchWithIsbn = async (isbn: string) => {
    setCercaLoading(true);
    setCercaResults([]);
    setBookAdoptions([]);
    setShowAdoptions(false);
    
    // Cerca listings disponibili
    try {
      const listingsResponse = await axios.get(`${API_URL}/api/listings/isbn/${isbn}`);
      if (listingsResponse.data?.listings && listingsResponse.data.listings.length > 0) {
        const listings = listingsResponse.data.listings;
        const minPrice = Math.min(...listings.map((l: any) => l.prezzo_vendita));
        setCercaResults([{
          book: cercaBook || { id: '', isbn: isbn, titolo: '' },
          copie_disponibili: listings.length,
          prezzo_minimo: minPrice
        }]);
      }
    } catch (error) {
      console.log('No listings found for ISBN:', isbn);
    }
    
    // Cerca scuole che hanno adottato questo libro (chiamata separata)
    try {
      console.log('[Search] Fetching adoptions for ISBN:', isbn);
      const adoptionsResponse = await axios.get(`${API_URL}/api/books/adoptions/${isbn}`);
      console.log('[Search] Adoptions response:', adoptionsResponse.data);
      if (adoptionsResponse.data?.adoptions && adoptionsResponse.data.adoptions.length > 0) {
        setBookAdoptions(adoptionsResponse.data.adoptions);
        setShowAdoptions(true);
        console.log('[Search] Found', adoptionsResponse.data.adoptions.length, 'schools');
      }
    } catch (adoptionError) {
      console.log('No adoptions found for ISBN:', isbn, adoptionError);
    }
    
    setCercaLoading(false);
  };

  // ==================== RENDER ====================

  if (showScanner) {
    return (
      <View style={styles.scannerContainer}>
        <CameraView
          key={cameraKey}
          style={StyleSheet.absoluteFillObject}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ['ean13', 'ean8'],
            interval: 500,
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
        
        {/* Scanner overlay - simplified for performance */}
        <View style={styles.scannerOverlaySimple}>
          {/* Viewfinder frame */}
          <View style={styles.scannerFrameSimple}>
            <View style={[styles.cornerMarker, styles.cornerTopLeft]} />
            <View style={[styles.cornerMarker, styles.cornerTopRight]} />
            <View style={[styles.cornerMarker, styles.cornerBottomLeft]} />
            <View style={[styles.cornerMarker, styles.cornerBottomRight]} />
          </View>
          
          {/* Instructions */}
          <Text style={styles.scannerTextSimple}>
            {isCameraReady ? 'Inquadra il codice a barre' : 'Attendere...'}
          </Text>
        </View>
        
        {/* Close button */}
        <TouchableOpacity 
          style={styles.scannerCloseBtn}
          onPress={closeScanner}
        >
          <Ionicons name="close" size={30} color="#fff" />
        </TouchableOpacity>
        
        {/* Manual entry button */}
        <TouchableOpacity 
          style={styles.manualEntryBtnFixed}
          onPress={closeScanner}
        >
          <Ionicons name="keypad-outline" size={18} color="#fff" />
          <Text style={styles.manualEntryText}>Manuale</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Schermata per utenti non loggati (anonimi) - SOLO per sezione VENDI
  // Gli utenti anonimi possono comunque vedere i libri popolari e cercare
  const renderAnonymousVendiSection = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name="pricetag" size={24} color="#2196F3" />
        <Text style={styles.sectionTitle}>VENDI UN LIBRO</Text>
      </View>
      <View style={styles.anonymousVendiContainer}>
        <Ionicons name="lock-closed-outline" size={40} color="#ccc" />
        <Text style={styles.anonymousVendiText}>
          Per vendere i tuoi libri devi registrarti
        </Text>
        <TouchableOpacity
          style={styles.anonymousVendiButton}
          onPress={() => router.push('/(auth)/register')}
        >
          <Text style={styles.anonymousVendiButtonText}>Registrati</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      {/* ==================== SEZIONE VENDI ==================== */}
      {isAnonymous ? (
        renderAnonymousVendiSection()
      ) : (
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
                    Questo libro non fa parte delle adozioni scolastiche del comune di Catanzaro.
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
                    <Text style={styles.bookTitle} numberOfLines={2}>{vendiBook.titolo || ''}</Text>
                    {vendiBook.autori ? <Text style={styles.bookAuthor}>{vendiBook.autori}</Text> : null}
                    <Text style={styles.bookIsbn}>ISBN: {vendiBook.isbn || ''}</Text>
                    {vendiBook.prezzo_copertina && vendiBook.prezzo_copertina > 0 ? (
                      <View style={styles.bookPriceRow}>
                        <Text style={styles.bookPriceLabel}>Prezzo copertina: </Text>
                        <Text style={styles.bookPriceValue}>€{vendiBook.prezzo_copertina.toFixed(2)}</Text>
                      </View>
                    ) : null}
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
      )}

      {/* Divider */}
      <View style={styles.divider} />

      {/* ==================== SEZIONE CERCA ==================== */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="search" size={24} color="#4CAF50" />
          <Text style={[styles.sectionTitle, { color: '#4CAF50' }]}>CERCA UN LIBRO</Text>
        </View>
        
        {/* Ricerca unificata per Titolo o ISBN */}
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.isbnInput, { flex: 1 }]}
            placeholder="Cerca titolo o codice ISBN..."
            placeholderTextColor="#999"
            value={cercaTitolo}
            onChangeText={setCercaTitolo}
            autoCapitalize="sentences"
            returnKeyType="search"
            onSubmitEditing={handleCercaTitolo}
          />
          <TouchableOpacity 
            style={[styles.scanButton, { backgroundColor: '#4CAF50' }]} 
            onPress={() => {
              // Set scanner to search mode and open
              setScannerMode('cerca');
              setScanned(false);
              setScannerError(null);
              openScanner();
            }}
          >
            <Ionicons name="barcode-outline" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.searchButton, { backgroundColor: '#4CAF50' }]} 
            onPress={handleCercaTitolo}
            disabled={cercaTitolo.length < 3}
          >
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
  // ==================== ADOZIONI STYLES ====================
  adoptionsSection: {
    backgroundColor: '#f8f9fa',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  adoptionsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  adoptionsSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  adoptionsSectionSubtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
    marginLeft: 32,
  },
  adoptionSchoolCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  adoptionSchoolHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  adoptionSchoolInfo: {
    flex: 1,
    marginRight: 8,
  },
  adoptionSchoolName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  adoptionSchoolLocation: {
    fontSize: 12,
    color: '#666',
  },
  adoptionSchoolTypeBadge: {
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  adoptionSchoolType: {
    fontSize: 10,
    color: '#1a472a',
    fontWeight: '500',
  },
  adoptionClassesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  adoptionClassesLabel: {
    fontSize: 12,
    color: '#666',
    marginRight: 4,
  },
  adoptionClassesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  adoptionClassBadge: {
    backgroundColor: '#1a472a',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  adoptionClassText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '500',
  },
  adoptionsMoreText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 4,
  },
  // ==================== END ADOZIONI STYLES ====================
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
  bookPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  bookPriceLabel: {
    fontSize: 14,
    color: '#1a472a',
  },
  bookPriceValue: {
    fontSize: 16,
    color: '#1a472a',
    fontWeight: 'bold',
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
  // Ricerca per titolo
  titoloResultsContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  titoloResultsTitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 10,
  },
  titoloResultsScroll: {
    flexGrow: 0,
  },
  titoloResultCard: {
    width: 100,
    marginRight: 12,
    alignItems: 'center',
  },
  titoloResultCover: {
    width: 80,
    height: 110,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
    marginBottom: 6,
  },
  titoloResultTitle: {
    fontSize: 11,
    color: '#333',
    textAlign: 'center',
    lineHeight: 14,
  },
  titoloResultIsbn: {
    fontSize: 9,
    color: '#888',
    fontFamily: 'monospace',
    marginTop: 2,
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
  // Stili scanner semplificati per performance
  scannerOverlaySimple: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  scannerFrameSimple: {
    width: 280,
    height: 160,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  scannerTextSimple: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 20,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  manualEntryBtnFixed: {
    position: 'absolute',
    bottom: 80,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
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
  // Stili per utenti anonimi
  anonymousContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  anonymousTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
    marginBottom: 12,
  },
  anonymousSubtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
    maxWidth: 300,
  },
  anonymousButton: {
    backgroundColor: '#1a472a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 25,
    gap: 8,
  },
  anonymousButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  anonymousRegisterLink: {
    marginTop: 20,
  },
  anonymousRegisterText: {
    color: '#666',
    fontSize: 14,
  },
  anonymousRegisterBold: {
    color: '#1a472a',
    fontWeight: 'bold',
  },
  // Stili per sezione Vendi anonimi
  anonymousVendiContainer: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    marginTop: 12,
  },
  anonymousVendiText: {
    fontSize: 14,
    color: '#666',
    marginTop: 12,
    marginBottom: 16,
    textAlign: 'center',
  },
  anonymousVendiButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 20,
  },
  anonymousVendiButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
