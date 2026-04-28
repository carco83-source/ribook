import React, { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { CameraView } from 'expo-camera';
import { BarCodeScanner } from 'expo-barcode-scanner';
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

export default function SearchSellScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  
  // Vendi states
  const [vendiIsbn, setVendiIsbn] = useState('');
  const [vendiLoading, setVendiLoading] = useState(false);
  const [vendiBook, setVendiBook] = useState<Book | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraKey, setCameraKey] = useState(0);
  
  // Cerca states
  const [cercaIsbn, setCercaIsbn] = useState('');
  const [cercaLoading, setCercaLoading] = useState(false);
  const [cercaResults, setCercaResults] = useState<SearchResult[]>([]);
  const [cercaBook, setCercaBook] = useState<Book | null>(null);

  useEffect(() => {
    loadUserId();
    // Log platform info on mount for debugging
    console.log('Search screen mounted - Platform.OS:', Platform.OS);
  }, []);

  const loadUserId = async () => {
    const id = await AsyncStorage.getItem('user_id');
    setUserId(id);
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
      // Prima prova con l'endpoint specifico per ISBN
      let bookFound = false;
      try {
        const response = await axios.get(`${API_URL}/api/books/search/${vendiIsbn}`);
        if (response.data) {
          setVendiBook(response.data);
          bookFound = true;
        }
      } catch (e) {
        // L'endpoint specifico non ha trovato nulla, prova con la ricerca generica
      }
      
      if (!bookFound) {
        // Prova con la ricerca generica
        const genericResponse = await axios.get(`${API_URL}/api/books/search`, {
          params: { q: vendiIsbn }
        });
        if (genericResponse.data?.books && genericResponse.data.books.length > 0) {
          setVendiBook(genericResponse.data.books[0]);
          bookFound = true;
        }
      }
      
      if (!bookFound) {
        // Crea libro manuale con dati base
        setVendiBook({
          id: `manual-${vendiIsbn}`,
          isbn: vendiIsbn,
          titolo: 'Libro non trovato - Inserisci i dati',
          prezzo_copertina: 0,
        });
      }
    } catch (error) {
      console.error('Error searching book:', error);
      // Anche in caso di errore, permetti di procedere con dati manuali
      setVendiBook({
        id: `manual-${vendiIsbn}`,
        isbn: vendiIsbn,
        titolo: 'Libro non trovato - Inserisci i dati',
        prezzo_copertina: 0,
      });
    } finally {
      setVendiLoading(false);
    }
  };

  const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
    if (scanned) return; // Previene scansioni multiple
    
    setScanned(true);
    console.log('=== BARCODE SCANNED ===');
    console.log('Type:', type);
    console.log('Data:', data);
    
    // Clean the ISBN
    const cleanIsbn = data.replace(/[^0-9X]/gi, '');
    console.log('Clean ISBN:', cleanIsbn);
    
    // Vibration feedback
    if (Platform.OS !== 'web') {
      try {
        const { default: Haptics } = require('expo-haptics');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {
        // Haptics not available
      }
    }
    
    setVendiIsbn(cleanIsbn);
    setShowScanner(false);
    
    // Auto search after closing scanner
    setTimeout(() => {
      handleVendiSearchWithIsbn(cleanIsbn);
    }, 300);
  };

  const handleVendiSearchWithIsbn = async (isbn: string) => {
    if (!isbn || isbn.length < 10) return;
    
    setVendiLoading(true);
    setVendiBook(null);
    
    try {
      // Prima prova con l'endpoint specifico per ISBN
      let bookFound = false;
      try {
        const response = await axios.get(`${API_URL}/api/books/search/${isbn}`);
        if (response.data) {
          setVendiBook(response.data);
          bookFound = true;
        }
      } catch (e) {
        // L'endpoint specifico non ha trovato nulla
      }
      
      if (!bookFound) {
        // Prova con la ricerca generica
        const genericResponse = await axios.get(`${API_URL}/api/books/search`, {
          params: { q: isbn }
        });
        if (genericResponse.data?.books && genericResponse.data.books.length > 0) {
          setVendiBook(genericResponse.data.books[0]);
          bookFound = true;
        }
      }
      
      if (!bookFound) {
        setVendiBook({
          id: `manual-${isbn}`,
          isbn: isbn,
          titolo: 'Libro non trovato - Inserisci i dati',
          prezzo_copertina: 0,
        });
      }
    } catch (error) {
      console.error('Error searching book:', error);
      setVendiBook({
        id: `manual-${isbn}`,
        isbn: isbn,
        titolo: 'Libro non trovato - Inserisci i dati',
        prezzo_copertina: 0,
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
    // Debug: Log platform info
    console.log('=== SCANNER DEBUG ===');
    console.log('Platform.OS:', Platform.OS);
    console.log('Device.isDevice:', Device.isDevice);
    console.log('Device.modelName:', Device.modelName);
    
    // Use Device.isDevice to check if we're on a real device (not web)
    const isPhysicalDevice = Device.isDevice;
    
    if (!isPhysicalDevice) {
      showAlert('Scanner', 'La scansione barcode è disponibile solo sull\'app mobile.\n\nPuoi inserire l\'ISBN manualmente.');
      return;
    }
    
    // Request camera permission using BarCodeScanner's permission system
    try {
      console.log('Requesting BarCodeScanner permissions...');
      const { status } = await BarCodeScanner.requestPermissionsAsync();
      console.log('Permission status:', status);
      
      setHasPermission(status === 'granted');
      
      if (status !== 'granted') {
        showAlert('Permesso Fotocamera', 'Per scansionare i codici a barre, consenti l\'accesso alla fotocamera nelle Impostazioni del telefono.');
        return;
      }
      
      console.log('Opening scanner...');
      // Reset all scanner states
      setScanned(false);
      setIsCameraReady(false);
      setCameraKey(prev => prev + 1); // Force camera remount
      setShowScanner(true);
    } catch (error) {
      console.error('Error opening scanner:', error);
      showAlert('Errore Scanner', 'Impossibile aprire lo scanner. Prova a inserire l\'ISBN manualmente.');
    }
  };

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
        <BarCodeScanner
          key={cameraKey}
          style={StyleSheet.absoluteFillObject}
          type={BarCodeScanner.Constants.Type.back}
          barCodeTypes={[
            BarCodeScanner.Constants.BarCodeType.ean13,
            BarCodeScanner.Constants.BarCodeType.ean8,
          ]}
          onBarCodeScanned={scanned ? undefined : handleBarCodeScanned}
        />
        <View style={styles.scannerOverlay}>
          <View style={styles.scannerFrame} />
          <Text style={styles.scannerText}>Inquadra il codice a barre ISBN</Text>
          <Text style={styles.scannerHint}>Tieni fermo il libro a 15-20cm</Text>
        </View>
        <TouchableOpacity 
          style={styles.scannerCloseBtn}
          onPress={() => {
            setShowScanner(false);
            setScanned(false);
          }}
        >
          <Ionicons name="close" size={30} color="#fff" />
        </TouchableOpacity>
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
            <Image
              source={{ uri: `https://www.ibs.it/images/${vendiBook.isbn}_0_0_0_536_0.jpg` }}
              style={styles.bookCover}
              resizeMode="contain"
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
});
