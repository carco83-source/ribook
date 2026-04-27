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
import { CameraView, useCameraPermissions } from 'expo-camera';

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
  const [permission, requestPermission] = useCameraPermissions();
  
  // Cerca states
  const [cercaIsbn, setCercaIsbn] = useState('');
  const [cercaLoading, setCercaLoading] = useState(false);
  const [cercaResults, setCercaResults] = useState<SearchResult[]>([]);
  const [cercaBook, setCercaBook] = useState<Book | null>(null);

  useEffect(() => {
    loadUserId();
  }, []);

  const loadUserId = async () => {
    const id = await AsyncStorage.getItem('user_id');
    setUserId(id);
  };

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
      const response = await axios.get(`${API_URL}/api/books/search?isbn=${vendiIsbn}`);
      if (response.data && response.data.length > 0) {
        setVendiBook(response.data[0]);
      } else {
        // Prova a cercare con l'API IBS
        setVendiBook({
          id: `manual-${vendiIsbn}`,
          isbn: vendiIsbn,
          titolo: 'Libro trovato',
          prezzo_copertina: 0,
        });
      }
    } catch (error) {
      console.error('Error searching book:', error);
      showAlert('Errore', 'Impossibile cercare il libro');
    } finally {
      setVendiLoading(false);
    }
  };

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    setShowScanner(false);
    // Clean the ISBN
    const cleanIsbn = data.replace(/[^0-9X]/gi, '');
    setVendiIsbn(cleanIsbn);
    // Auto search
    setTimeout(() => {
      handleVendiSearchWithIsbn(cleanIsbn);
    }, 500);
  };

  const handleVendiSearchWithIsbn = async (isbn: string) => {
    if (!isbn || isbn.length < 10) return;
    
    setVendiLoading(true);
    setVendiBook(null);
    
    try {
      const response = await axios.get(`${API_URL}/api/books/search?isbn=${isbn}`);
      if (response.data && response.data.length > 0) {
        setVendiBook(response.data[0]);
      } else {
        setVendiBook({
          id: `manual-${isbn}`,
          isbn: isbn,
          titolo: 'Libro trovato',
          prezzo_copertina: 0,
        });
      }
    } catch (error) {
      console.error('Error searching book:', error);
    } finally {
      setVendiLoading(false);
    }
  };

  const goToSellBook = () => {
    if (vendiBook) {
      router.push(`/(tabs)/sell?isbn=${vendiBook.isbn}&titolo=${encodeURIComponent(vendiBook.titolo || '')}&prezzo=${vendiBook.prezzo_copertina || 0}`);
    }
  };

  const openScanner = async () => {
    if (Platform.OS === 'web') {
      showAlert('Scanner', 'La scansione barcode è disponibile solo sull\'app mobile');
      return;
    }
    
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        showAlert('Permesso negato', 'Serve il permesso della fotocamera per scansionare');
        return;
      }
    }
    setShowScanner(true);
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
      // Cerca il libro
      const bookResponse = await axios.get(`${API_URL}/api/books/search?isbn=${cercaIsbn}`);
      if (bookResponse.data && bookResponse.data.length > 0) {
        setCercaBook(bookResponse.data[0]);
      }
      
      // Cerca le copie disponibili
      const listingsResponse = await axios.get(`${API_URL}/api/listings/isbn/${cercaIsbn}`);
      if (listingsResponse.data && listingsResponse.data.length > 0) {
        const copie = listingsResponse.data.length;
        const prezzoMinimo = Math.min(...listingsResponse.data.map((l: any) => l.prezzo_vendita || l.price || 999));
        setCercaResults([{
          book: bookResponse.data?.[0] || { id: cercaIsbn, isbn: cercaIsbn, titolo: 'Libro' },
          copie_disponibili: copie,
          prezzo_minimo: prezzoMinimo,
        }]);
      } else {
        setCercaResults([]);
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
          style={styles.scanner}
          barcodeScannerSettings={{
            barcodeTypes: ['ean13', 'ean8'],
          }}
          onBarcodeScanned={handleBarCodeScanned}
        />
        <View style={styles.scannerOverlay}>
          <View style={styles.scannerFrame} />
          <Text style={styles.scannerText}>Inquadra il codice a barre del libro</Text>
        </View>
        <TouchableOpacity 
          style={styles.scannerCloseBtn}
          onPress={() => setShowScanner(false)}
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
    width: 280,
    height: 150,
    borderWidth: 2,
    borderColor: '#4CAF50',
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  scannerText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 20,
    textAlign: 'center',
  },
  scannerCloseBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 25,
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
