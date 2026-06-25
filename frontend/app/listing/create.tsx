import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Condition questions with icons and labels
const CONDITION_QUESTIONS = [
  {
    key: 'sottolineature',
    question: 'Il libro ha scritte o evidenziature?',
    icon: 'pencil',
    options: [
      { value: 0, label: 'Nessuna', emoji: '✨' },
      { value: 1, label: 'Poche', emoji: '✏️' },
      { value: 2, label: 'Molte', emoji: '🖊️' },
    ],
  },
  {
    key: 'copertina',
    question: 'La copertina è rovinata?',
    icon: 'book',
    options: [
      { value: 0, label: 'No', emoji: '✨' },
      { value: 1, label: 'Un po\'', emoji: '⚠️' },
      { value: 2, label: 'Molto', emoji: '📉' },
    ],
  },
  {
    key: 'pagine',
    question: 'Le pagine hanno pieghe o orecchie?',
    icon: 'document-text',
    options: [
      { value: 0, label: 'Nessuna', emoji: '✨' },
      { value: 1, label: 'Qualcuna', emoji: '📄' },
      { value: 2, label: 'Molte', emoji: '📚' },
    ],
  },
  {
    key: 'esercizi',
    question: 'Gli esercizi sono già compilati?',
    icon: 'create',
    options: [
      { value: 0, label: 'No', emoji: '✨' },
      { value: 1, label: 'Qualcuno', emoji: '📝' },
      { value: 2, label: 'Molti', emoji: '📋' },
    ],
  },
];

// Calculate condition from answers
const calculateCondition = (answers: Record<string, number>) => {
  const total = Object.values(answers).reduce((sum, val) => sum + val, 0);
  if (total <= 2) return { key: 'perfetto', label: '🟢 Perfetto', percentage: 70 };
  if (total <= 5) return { key: 'buono', label: '🟡 Buono', percentage: 50 };
  return { key: 'molto_usato', label: '🔴 Molto usato', percentage: 30 };
};

interface Book {
  id: string;
  titolo: string;
  autore?: string;
  autori?: string;
  isbn: string;
  materia?: string;
  disciplina?: string;
  prezzo_ministeriale?: number;
  prezzo_copertina?: number;
  classe?: string;
  // MIUR additional fields
  sottotitolo?: string;
  volume?: string;
  is_volume_unico?: boolean;
  tipi_scuola?: string[];
  anni_corso?: number[];
  perc_usato_disponibile?: number;
  motivo_usato?: string;
  editore?: string;
}

// Helper to get price from book (handles both formats)
const getBookPrice = (book: Book): number => {
  return book.prezzo_ministeriale || book.prezzo_copertina || 0;
};

// Helper to get author from book (handles both formats)
const getBookAuthor = (book: Book): string => {
  return book.autore || book.autori || 'Autore non specificato';
};

// Helper to get subject from book (handles both formats)
const getBookSubject = (book: Book): string => {
  return book.materia || book.disciplina || 'Materia non specificata';
};

interface Bookstore {
  id: string;
  nome: string;
  indirizzo: string;
}

export default function CreateListingScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [conditionAnswers, setConditionAnswers] = useState<Record<string, number>>({
    sottolineature: 0,
    copertina: 0,
    pagine: 0,
    esercizi: 0,
  });
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  
  // Scanner ISBN state - NUOVO API expo-camera
  const [showScanner, setShowScanner] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  
  // Fascicoli state
  const [hasFascicoli, setHasFascicoli] = useState(false);
  const [fascicoliTotali, setFascicoliTotali] = useState(0);
  const [fascicoliPresenti, setFascicoliPresenti] = useState(0);
  
  // Bookstores - MULTIPLE selection
  const [bookstores, setBookstores] = useState<Bookstore[]>([]);
  const [selectedBookstores, setSelectedBookstores] = useState<string[]>([]);
  
  // Custom price option
  const [useCustomPrice, setUseCustomPrice] = useState(false);
  const [customPrice, setCustomPrice] = useState('');
  
  // IBAN validation modal
  const [showIbanModal, setShowIbanModal] = useState(false);
  const [ibanInput, setIbanInput] = useState('');
  const [userHasIban, setUserHasIban] = useState(false);

  // Funzione per validare IBAN italiano
  const validateIBAN = (iban: string): boolean => {
    if (!iban) return false;
    const cleanIban = iban.replace(/\s/g, '').toUpperCase();
    // IBAN italiano: IT + 2 cifre controllo + 1 lettera + 5 cifre ABI + 5 cifre CAB + 12 caratteri conto
    const ibanRegex = /^IT\d{2}[A-Z]\d{5}\d{5}[A-Z0-9]{12}$/;
    return ibanRegex.test(cleanIban);
  };

  const formatIBAN = (value: string): string => {
    const clean = value.replace(/\s/g, '').toUpperCase();
    // Aggiungi spazi ogni 4 caratteri per leggibilità
    return clean.match(/.{1,4}/g)?.join(' ') || clean;
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      setUserId(storedUserId);
      
      // Load bookstores
      const res = await axios.get(`${API_URL}/api/bookstores`);
      setBookstores(res.data);
      
      // Check if user has IBAN
      if (storedUserId) {
        try {
          const userRes = await axios.get(`${API_URL}/api/users/${storedUserId}`);
          const userIban = userRes.data?.iban;
          console.log('User IBAN check:', userIban ? 'has IBAN' : 'no IBAN');
          const hasValidIban = !!userIban && userIban.length > 0 && validateIBAN(userIban);
          setUserHasIban(hasValidIban);
          console.log('userHasIban set to:', hasValidIban);
        } catch (userErr) {
          console.error('Error fetching user IBAN:', userErr);
          setUserHasIban(false);
        }
      } else {
        setUserHasIban(false);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      setUserHasIban(false);
    }
  };

  // Check if query looks like an ISBN
  const isISBNQuery = (query: string): boolean => {
    const cleanQuery = query.replace(/[^0-9]/g, '');
    // ISBN-13 starts with 978 or 979 and has 13 digits
    // ISBN-10 has 10 digits
    return (cleanQuery.length === 13 && (cleanQuery.startsWith('978') || cleanQuery.startsWith('979'))) ||
           (cleanQuery.length === 10);
  };

  // Search books by query (title or ISBN)
  const searchBooks = async (query: string) => {
    if (query.length < 3) {
      setSearchResults([]);
      return;
    }
    
    // Se sembra un ISBN, usa la ricerca specifica per ISBN
    if (isISBNQuery(query)) {
      const cleanISBN = query.replace(/[^0-9]/g, '');
      console.log('Detected ISBN query:', cleanISBN);
      await searchBookByISBN(cleanISBN);
      return;
    }
    
    try {
      // Get user info for class filtering (solo per ricerca per titolo)
      const userInfo = await AsyncStorage.getItem('user_info');
      const user = userInfo ? JSON.parse(userInfo) : null;
      
      // Search with class filter
      const params: any = { search: query, limit: 10 };
      if (user) {
        params.classe = user.classe;
        params.tipo_scuola = user.tipo_scuola;
      }
      
      const response = await axios.get(`${API_URL}/api/books`, { params });
      setSearchResults(response.data);
    } catch (error) {
      console.error('Error searching books:', error);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      searchBooks(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Funzione per aprire lo scanner
  const openScanner = async () => {
    if (Platform.OS === 'web') {
      window.alert('La scansione barcode non è disponibile su web. Inserisci il codice ISBN manualmente nel campo di ricerca.');
      return;
    }
    
    // Richiedi permesso se non già concesso
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Permesso negato', 'Serve il permesso per usare la fotocamera');
        return;
      }
    }
    
    setScanned(false);
    setShowScanner(true);
  };

  // Funzione separata per ricerca ISBN
  const searchBookByISBN = async (isbn: string) => {
    try {
      console.log('Searching for ISBN:', isbn);
      
      // Usa lookup che non lancia 404 e cerca anche nelle adozioni
      const lookupRes = await axios.get(`${API_URL}/api/books/lookup/${isbn}`);
      console.log('Lookup response:', lookupRes.data);
      
      if (lookupRes.data && lookupRes.data.titolo && lookupRes.data.source !== 'not_found') {
        // Libro trovato nel database o nelle adozioni
        setSelectedBook(lookupRes.data);
        setSearchResults([]);
        // Feedback all'utente
        if (Platform.OS === 'web') {
          window.alert(`Libro trovato!\n\n${lookupRes.data.titolo}`);
        } else {
          Alert.alert('Libro trovato!', lookupRes.data.titolo);
        }
        return;
      }
      
      // Se lookup ritorna not_found, prova ricerca generica
      const searchRes = await axios.get(`${API_URL}/api/books`, { 
        params: { search: isbn, limit: 10 } 
      });
      
      if (searchRes.data && searchRes.data.length > 0) {
        setSearchResults(searchRes.data);
        if (Platform.OS === 'web') {
          window.alert(`Trovati ${searchRes.data.length} libri. Seleziona quello corretto dalla lista.`);
        } else {
          Alert.alert('Risultati', `Trovati ${searchRes.data.length} libri. Seleziona quello corretto.`);
        }
      } else {
        // ISBN non trovato - mostra messaggio chiaro
        if (Platform.OS === 'web') {
          window.alert(`ISBN: ${isbn}\n\nQuesto libro non è nel database delle adozioni scolastiche.\n\nProva a cercarlo per TITOLO nel campo di ricerca.`);
        } else {
          Alert.alert(
            'Libro non nel database', 
            `ISBN: ${isbn}\n\nQuesto libro non è presente nelle adozioni scolastiche della tua zona.\n\nProva a cercarlo per TITOLO.`,
            [{ text: 'OK' }]
          );
        }
      }
    } catch (error) {
      console.error('Error searching ISBN:', error);
      // Anche in caso di errore, prova ricerca generica
      try {
        const searchRes = await axios.get(`${API_URL}/api/books`, { 
          params: { search: isbn, limit: 10 } 
        });
        if (searchRes.data && searchRes.data.length > 0) {
          setSearchResults(searchRes.data);
        }
      } catch (_e) {
        // Ignora errore secondario
      }
      
      if (Platform.OS === 'web') {
        window.alert(`ISBN ${isbn} non trovato.\n\nProva a cercare per titolo.`);
      } else {
        Alert.alert(
          'Ricerca completata', 
          `ISBN: ${isbn}\n\nProva a cercare per TITOLO se non trovi risultati.`
        );
      }
    }
  };

  const pickImage = async () => {
    if (photos.length >= 3) {
      if (Platform.OS === 'web') {
        window.alert('Massimo 3 foto consentite');
      } else {
        Alert.alert('Limite raggiunto', 'Puoi caricare massimo 3 foto');
      }
      return;
    }
    
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      if (Platform.OS === 'web') {
        window.alert('Serve il permesso per accedere alla galleria');
      } else {
        Alert.alert('Permesso negato', 'Serve il permesso per accedere alla galleria');
      }
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setPhotos([...photos, result.assets[0].base64]);
    }
  };

  const takePhoto = async () => {
    if (photos.length >= 3) {
      if (Platform.OS === 'web') {
        window.alert('Massimo 3 foto consentite');
      } else {
        Alert.alert('Limite raggiunto', 'Puoi caricare massimo 3 foto');
      }
      return;
    }
    
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      if (Platform.OS === 'web') {
        window.alert('Serve il permesso per usare la fotocamera');
      } else {
        Alert.alert('Permesso negato', 'Serve il permesso per usare la fotocamera');
      }
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setPhotos([...photos, result.assets[0].base64]);
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index));
  };

  const calculatePrice = () => {
    if (!selectedBook) return 0;
    if (useCustomPrice && customPrice) {
      return parseFloat(customPrice) || 0;
    }
    const condition = calculateCondition(conditionAnswers);
    return (getBookPrice(selectedBook) * condition.percentage) / 100;
  };

  const getFinalPrice = () => {
    if (useCustomPrice && customPrice) {
      return parseFloat(customPrice) || 0;
    }
    return calculatePrice();
  };

  const handleSubmit = async () => {
    if (!selectedBook) {
      if (Platform.OS === 'web') {
        window.alert('Seleziona un libro');
      } else {
        Alert.alert('Errore', 'Seleziona un libro');
      }
      return;
    }

    // Verifica IBAN in tempo reale prima di pubblicare
    try {
      if (userId) {
        const userRes = await axios.get(`${API_URL}/api/users/${userId}`);
        const userIban = userRes.data?.iban;
        const hasValidIban = !!userIban && userIban.length > 0 && validateIBAN(userIban);
        
        if (!hasValidIban) {
          console.log('IBAN mancante o non valido, mostrando modal');
          setShowIbanModal(true);
          return;
        }
      } else {
        // Nessun userId, mostra modal
        setShowIbanModal(true);
        return;
      }
    } catch (error) {
      console.error('Error checking IBAN:', error);
      // In caso di errore, mostra comunque il modal per sicurezza
      setShowIbanModal(true);
      return;
    }

    await publishListing();
  };

  // Salva IBAN e pubblica
  const handleSaveIbanAndPublish = async () => {
    const cleanIban = ibanInput.replace(/\s/g, '').toUpperCase();
    
    if (!validateIBAN(cleanIban)) {
      if (Platform.OS === 'web') {
        window.alert('IBAN non valido. Formato: IT + 25 caratteri alfanumerici');
      } else {
        Alert.alert('Errore', 'IBAN non valido. Formato: IT + 25 caratteri alfanumerici');
      }
      return;
    }

    try {
      // Salva IBAN nel profilo utente
      await axios.put(`${API_URL}/api/users/${userId}`, { iban: cleanIban });
      setUserHasIban(true);
      setShowIbanModal(false);
      
      // Procedi con la pubblicazione
      await publishListing();
    } catch (error: any) {
      console.error('Error saving IBAN:', error);
      if (Platform.OS === 'web') {
        window.alert('Errore nel salvataggio IBAN');
      } else {
        Alert.alert('Errore', 'Impossibile salvare l\'IBAN');
      }
    }
  };

  const publishListing = async () => {
    setLoading(true);
    try {
      const finalPrice = getFinalPrice();
      await axios.post(`${API_URL}/api/listings?user_id=${userId}`, {
        book_id: selectedBook!.id,
        condition_answers: useCustomPrice ? null : conditionAnswers,
        prezzo_vendita: useCustomPrice ? finalPrice : null,
        ha_fascicoli: hasFascicoli,
        fascicoli_totali: fascicoliTotali,
        fascicoli_presenti: fascicoliPresenti,
        bookstore_ids: selectedBookstores,
        note: note || null,
        foto_base64: photos.length > 0 ? photos[0] : null,
        photos: photos.length > 1 ? photos.slice(1) : [],
      });

      if (Platform.OS === 'web') {
        window.alert(`Annuncio creato! Il tuo libro è ora in vendita a €${finalPrice.toFixed(2)}`);
        router.back();
      } else {
        Alert.alert(
          'Annuncio creato!',
          `Il tuo libro è ora in vendita a €${finalPrice.toFixed(2)}`,
          [{ text: 'OK', onPress: () => router.back() }]
        );
      }
    } catch (error: any) {
      console.error('Error creating listing:', error);
      const message = error.response?.data?.detail || 'Impossibile creare l\'annuncio';
      if (Platform.OS === 'web') {
        window.alert('Errore: ' + message);
      } else {
        Alert.alert('Errore', message);
      }
    } finally {
      setLoading(false);
    }
  };

  const currentCondition = calculateCondition(conditionAnswers);

  // Handler per scansione barcode - FUORI dal Modal per evitare problemi di stato
  const handleBarcodeScan = (result: { data: string; type: string }) => {
    console.log('=== BARCODE SCANNED ===');
    console.log('Type:', result.type);
    console.log('Data:', result.data);
    console.log('Scanned state:', scanned);
    
    // Se già scansionato, ignora
    if (scanned) {
      console.log('Already scanned, ignoring');
      return;
    }
    
    const cleanData = result.data.replace(/[^0-9]/g, '');
    console.log('Clean data:', cleanData, 'Length:', cleanData.length);
    
    // Verifica che sia un codice valido (ISBN-10 o ISBN-13)
    if (cleanData.length >= 10 && cleanData.length <= 13) {
      console.log('Valid ISBN detected!');
      
      // BLOCCA IMMEDIATAMENTE altre scansioni
      setScanned(true);
      
      // Haptic feedback
      if (Platform.OS !== 'web') {
        try {
          const Haptics = require('expo-haptics');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (_e) {
          console.log('Haptics not available');
        }
      }
      
      // Chiudi scanner SUBITO
      setShowScanner(false);
      
      // Imposta query nel campo di ricerca
      setSearchQuery(cleanData);
      
      // CERCA IMMEDIATAMENTE senza aspettare click utente
      console.log('Searching ISBN immediately:', cleanData);
      searchBookByISBN(cleanData);
    } else {
      console.log('Code too short or invalid, length:', cleanData.length);
    }
  };

  // Scanner Modal Component - USA CameraView (nuovo API expo-camera)
  const ScannerModal = () => {
    return (
      <Modal
        visible={showScanner}
        animationType="slide"
        onRequestClose={() => {
          setShowScanner(false);
          setScanned(false);
        }}
      >
        <View style={styles.scannerContainer}>
          <View style={styles.scannerHeader}>
            <Text style={styles.scannerTitle}>Scansiona ISBN</Text>
            <TouchableOpacity 
              onPress={() => {
                setShowScanner(false);
                setScanned(false);
              }}
              style={{ padding: 10 }}
            >
              <Ionicons name="close-circle" size={32} color="#333" />
            </TouchableOpacity>
          </View>
          
          {permission?.granted ? (
            <View style={{ flex: 1 }}>
              <CameraView
                style={{ flex: 1 }}
                facing="back"
                onBarcodeScanned={scanned ? undefined : handleBarcodeScan}
                barcodeScannerSettings={{
                  barcodeTypes: ['ean13', 'ean8', 'qr', 'code128', 'code39'],
                }}
              />
              <View style={styles.scanOverlay}>
                <View style={styles.scanFrameNew} />
                <Text style={styles.scanHintNew}>
                  Inquadra il codice a barre ISBN
                </Text>
                {scanned && (
                  <TouchableOpacity 
                    style={styles.rescanButton}
                    onPress={() => setScanned(false)}
                  >
                    <Text style={styles.rescanButtonText}>Scansiona di nuovo</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.permissionContainer}>
              <Ionicons name="camera-outline" size={64} color="#ccc" />
              <Text style={styles.permissionText}>
                Permesso fotocamera necessario
              </Text>
              <TouchableOpacity 
                style={styles.permissionButton}
                onPress={requestPermission}
              >
                <Text style={styles.permissionButtonText}>Richiedi permesso</Text>
              </TouchableOpacity>
            </View>
          )}
          
          {/* Input manuale sempre visibile */}
          <View style={styles.manualInputContainer}>
            <Text style={styles.manualInputLabel}>Inserisci manualmente ISBN:</Text>
            <TextInput
              style={styles.manualInput}
              placeholder="978..."
              keyboardType="number-pad"
              maxLength={13}
              onSubmitEditing={(e) => {
                const text = e.nativeEvent.text.replace(/[^0-9]/g, '');
                if (text.length >= 10) {
                  setScanned(true);
                  setShowScanner(false);
                  setSearchQuery(text);
                  searchBookByISBN(text);
                }
              }}
              returnKeyType="search"
            />
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      {/* Scanner Modal */}
      <ScannerModal />
      
      <Stack.Screen 
        options={{ 
          title: 'Vendi un libro',
          headerStyle: { backgroundColor: '#1a472a' },
          headerTintColor: '#fff',
          headerLeft: () => (
            <TouchableOpacity 
              onPress={() => router.canGoBack() ? router.back() : router.push('/(tabs)/search')} 
              style={{ marginLeft: 16, padding: 8 }}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
          ),
        }} 
      />
      
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Step 1: Book Selection */}
        <Text style={styles.sectionTitle}>1. Seleziona il libro</Text>
        
        {selectedBook ? (
          <View style={styles.selectedBookCard}>
            <View style={styles.selectedBookInfo}>
              <Text style={styles.selectedBookTitle}>{selectedBook.titolo}</Text>
              <Text style={styles.selectedBookAuthor}>{getBookAuthor(selectedBook)}</Text>
              <Text style={styles.selectedBookISBN}>ISBN: {selectedBook.isbn}</Text>
              <Text style={styles.selectedBookPrice}>
                Prezzo listino: €{getBookPrice(selectedBook).toFixed(2)}
              </Text>
              {selectedBook.perc_usato_disponibile !== undefined && (
                <Text style={[
                  styles.selectedBookUsato,
                  { color: selectedBook.perc_usato_disponibile >= 50 ? '#4CAF50' : 
                           selectedBook.perc_usato_disponibile >= 30 ? '#FF9800' : '#f44336' }
                ]}>
                  Disponibilità usato: {selectedBook.perc_usato_disponibile}%
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.changeBookButton}
              onPress={() => {
                setSelectedBook(null);
                setSearchQuery('');
              }}
            >
              <Ionicons name="close-circle" size={24} color="#ff4444" />
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color="#666" />
              <TextInput
                style={styles.searchInput}
                placeholder="Cerca per titolo o ISBN..."
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {/* Pulsante scanner barcode - solo su mobile */}
              {Platform.OS !== 'web' && (
                <TouchableOpacity 
                  style={styles.scanButton}
                  onPress={openScanner}
                >
                  <Ionicons name="barcode-outline" size={24} color="#1a472a" />
                </TouchableOpacity>
              )}
            </View>

            {searchResults.length > 0 && (
              <View style={styles.searchResults}>
                {searchResults.map((book) => (
                  <TouchableOpacity
                    key={book.id || book.isbn}
                    style={styles.searchResultItem}
                    onPress={() => {
                      setSelectedBook(book);
                      setSearchQuery('');
                      setSearchResults([]);
                    }}
                  >
                    <Text style={styles.searchResultTitle}>{book.titolo}</Text>
                    <Text style={styles.searchResultAuthor}>{getBookAuthor(book)}</Text>
                    <Text style={styles.searchResultISBN}>ISBN: {book.isbn}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Step 2: Condition Questions */}
        {selectedBook && (
          <>
            <Text style={styles.sectionTitle}>2. Prezzo di vendita</Text>
            
            {/* Toggle prezzo automatico/personalizzato */}
            <View style={styles.priceToggleContainer}>
              <TouchableOpacity
                style={[
                  styles.priceToggleOption,
                  !useCustomPrice && styles.priceToggleOptionSelected
                ]}
                onPress={() => setUseCustomPrice(false)}
              >
                <Ionicons 
                  name={!useCustomPrice ? "radio-button-on" : "radio-button-off"} 
                  size={20} 
                  color={!useCustomPrice ? "#1a472a" : "#999"} 
                />
                <Text style={[
                  styles.priceToggleText,
                  !useCustomPrice && styles.priceToggleTextSelected
                ]}>
                  Prezzo automatico
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.priceToggleOption,
                  useCustomPrice && styles.priceToggleOptionSelected
                ]}
                onPress={() => setUseCustomPrice(true)}
              >
                <Ionicons 
                  name={useCustomPrice ? "radio-button-on" : "radio-button-off"} 
                  size={20} 
                  color={useCustomPrice ? "#1a472a" : "#999"} 
                />
                <Text style={[
                  styles.priceToggleText,
                  useCustomPrice && styles.priceToggleTextSelected
                ]}>
                  Prezzo personalizzato
                </Text>
              </TouchableOpacity>
            </View>

            {/* Prezzo personalizzato */}
            {useCustomPrice ? (
              <View style={styles.customPriceCard}>
                <Text style={styles.customPriceLabel}>Inserisci il prezzo desiderato:</Text>
                <View style={styles.customPriceInputContainer}>
                  <Text style={styles.currencySymbol}>€</Text>
                  <TextInput
                    style={styles.customPriceInput}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    value={customPrice}
                    onChangeText={setCustomPrice}
                  />
                </View>
                <Text style={styles.customPriceHint}>
                  Prezzo di copertina: €{getBookPrice(selectedBook).toFixed(2)}
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.sectionSubtitle}>
                  Rispondi a queste 4 domande - il prezzo viene calcolato automaticamente
                </Text>
                
                {CONDITION_QUESTIONS.map((q) => (
                  <View key={q.key} style={styles.questionCard}>
                    <View style={styles.questionHeader}>
                      <Ionicons name={q.icon as any} size={20} color="#1a472a" />
                      <Text style={styles.questionText}>{q.question}</Text>
                    </View>
                    <View style={styles.optionsRow}>
                      {q.options.map((opt) => (
                        <TouchableOpacity
                          key={opt.value}
                          style={[
                            styles.optionButton,
                            conditionAnswers[q.key] === opt.value && styles.optionButtonSelected,
                          ]}
                          onPress={() =>
                            setConditionAnswers({ ...conditionAnswers, [q.key]: opt.value })
                          }
                        >
                          <Text style={styles.optionEmoji}>{opt.emoji}</Text>
                          <Text
                            style={[
                              styles.optionLabel,
                              conditionAnswers[q.key] === opt.value && styles.optionLabelSelected,
                            ]}
                          >
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ))}

                {/* Condition Result */}
                <View style={styles.conditionResult}>
                  <Text style={styles.conditionResultLabel}>Condizione calcolata:</Text>
                  <Text style={styles.conditionResultValue}>{currentCondition.label}</Text>
                  <Text style={styles.conditionResultPrice}>
                    Prezzo: €{calculatePrice().toFixed(2)}
                  </Text>
                </View>
              </>
            )}
          </>
        )}

        {/* Step 3: Fascicoli */}
        {selectedBook && (
          <>
            <Text style={styles.sectionTitle}>3. Fascicoli allegati</Text>
            <View style={styles.fascicoliCard}>
              <TouchableOpacity
                style={styles.fascicoliToggle}
                onPress={() => setHasFascicoli(!hasFascicoli)}
              >
                <Ionicons
                  name={hasFascicoli ? 'checkbox' : 'square-outline'}
                  size={24}
                  color="#1a472a"
                />
                <Text style={styles.fascicoliToggleText}>
                  Questo libro ha fascicoli/allegati
                </Text>
              </TouchableOpacity>

              {hasFascicoli && (
                <View style={styles.fascicoliInputs}>
                  <View style={styles.fascicoliInputRow}>
                    <Text style={styles.fascicoliInputLabel}>Fascicoli totali previsti:</Text>
                    <View style={styles.counterContainer}>
                      <TouchableOpacity
                        style={styles.counterButton}
                        onPress={() => setFascicoliTotali(Math.max(0, fascicoliTotali - 1))}
                      >
                        <Ionicons name="remove" size={20} color="#1a472a" />
                      </TouchableOpacity>
                      <Text style={styles.counterValue}>{fascicoliTotali}</Text>
                      <TouchableOpacity
                        style={styles.counterButton}
                        onPress={() => setFascicoliTotali(fascicoliTotali + 1)}
                      >
                        <Ionicons name="add" size={20} color="#1a472a" />
                      </TouchableOpacity>
                    </View>
                  </View>
                  
                  <View style={styles.fascicoliInputRow}>
                    <Text style={styles.fascicoliInputLabel}>Fascicoli che hai:</Text>
                    <View style={styles.counterContainer}>
                      <TouchableOpacity
                        style={styles.counterButton}
                        onPress={() => setFascicoliPresenti(Math.max(0, fascicoliPresenti - 1))}
                      >
                        <Ionicons name="remove" size={20} color="#1a472a" />
                      </TouchableOpacity>
                      <Text style={styles.counterValue}>{fascicoliPresenti}</Text>
                      <TouchableOpacity
                        style={styles.counterButton}
                        onPress={() => setFascicoliPresenti(Math.min(fascicoliTotali, fascicoliPresenti + 1))}
                      >
                        <Ionicons name="add" size={20} color="#1a472a" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {fascicoliTotali > 0 && fascicoliPresenti < fascicoliTotali && (
                    <View style={styles.fascicoliWarning}>
                      <Ionicons name="warning" size={16} color="#e65100" />
                      <Text style={styles.fascicoliWarningText}>
                        Fascicoli mancanti: la condizione sarà Molto usato
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          </>
        )}

        {/* Step 4: Bookstore Selection */}
        {selectedBook && (
          <>
            <Text style={styles.sectionTitle}>4. Punto di ritiro</Text>
            <Text style={styles.sectionSubtitle}>
              Seleziona dove consegnerai il libro
            </Text>
            
            {bookstores.length > 0 ? (
              <View style={styles.bookstoreList}>
                {bookstores.map((store) => {
                  const isSelected = selectedBookstores.includes(store.id);
                  return (
                    <TouchableOpacity
                      key={store.id}
                      style={[
                        styles.bookstoreItem,
                        isSelected && styles.bookstoreItemSelected,
                      ]}
                      onPress={() => {
                        if (isSelected) {
                          setSelectedBookstores(selectedBookstores.filter(id => id !== store.id));
                        } else {
                          setSelectedBookstores([...selectedBookstores, store.id]);
                        }
                      }}
                    >
                      <Ionicons
                        name={isSelected ? 'checkbox' : 'square-outline'}
                        size={24}
                        color="#1a472a"
                      />
                      <View style={styles.bookstoreInfo}>
                        <Text style={styles.bookstoreName}>{store.nome}</Text>
                        <Text style={styles.bookstoreAddress}>{store.indirizzo}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
                {selectedBookstores.length > 0 && (
                  <View style={styles.selectedBookstoresInfo}>
                    <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                    <Text style={styles.selectedBookstoresText}>
                      {selectedBookstores.length} cartolibreri{selectedBookstores.length === 1 ? 'a' : 'e'} selezionat{selectedBookstores.length === 1 ? 'a' : 'e'}
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              <Text style={styles.noBookstoresText}>
                Nessuna cartolibreria disponibile al momento
              </Text>
            )}
          </>
        )}

        {/* Step 5: Photo */}
        {selectedBook && (
          <>
            <Text style={styles.sectionTitle}>5. Foto del libro (max 3)</Text>
            <Text style={styles.sectionSubtitle}>
              📸 Aggiungi fino a 5 foto del libro
            </Text>
            
            <View style={styles.photoSection}>
              {/* Griglia foto esistenti */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosScrollView}>
                {photos.map((photo, index) => (
                  <View key={index} style={styles.photoThumbnailContainer}>
                    <TouchableOpacity onPress={() => { setSelectedPhotoIndex(index); setShowPhotoModal(true); }}>
                      <Image
                        source={{ uri: `data:image/jpeg;base64,${photo}` }}
                        style={styles.photoThumbnail}
                        resizeMode="cover"
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.removePhotoButton}
                      onPress={() => removePhoto(index)}
                    >
                      <Ionicons name="close-circle" size={24} color="#ff4444" />
                    </TouchableOpacity>
                    {index === 0 && (
                      <View style={styles.mainPhotoBadge}>
                        <Text style={styles.mainPhotoBadgeText}>Principale</Text>
                      </View>
                    )}
                  </View>
                ))}
                
                {/* Bottone aggiungi foto */}
                {photos.length < 3 && (
                  <View style={styles.addPhotoContainer}>
                    <TouchableOpacity style={styles.addPhotoButton} onPress={takePhoto}>
                      <Ionicons name="camera" size={28} color="#1a472a" />
                      <Text style={styles.addPhotoText}>Scatta</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.addPhotoButton} onPress={pickImage}>
                      <Ionicons name="images" size={28} color="#1a472a" />
                      <Text style={styles.addPhotoText}>Galleria</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
              
              <Text style={styles.photoCountText}>
                {photos.length}/3 foto caricate
              </Text>
            </View>
            
            {/* Modal per visualizzare foto a schermo intero */}
            <Modal
              visible={showPhotoModal}
              transparent={true}
              animationType="fade"
              onRequestClose={() => setShowPhotoModal(false)}
            >
              <View style={styles.photoModalOverlay}>
                <TouchableOpacity 
                  style={styles.photoModalClose}
                  onPress={() => setShowPhotoModal(false)}
                >
                  <Ionicons name="close-circle" size={40} color="#fff" />
                </TouchableOpacity>
                {photos[selectedPhotoIndex] && (
                  <Image
                    source={{ uri: `data:image/jpeg;base64,${photos[selectedPhotoIndex]}` }}
                    style={styles.photoModalImage}
                    resizeMode="contain"
                  />
                )}
              </View>
            </Modal>
          </>
        )}

        {/* Step 6: Notes */}
        {selectedBook && (
          <>
            <Text style={styles.sectionTitle}>6. Note (opzionale)</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="Aggiungi note sullo stato del libro..."
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={3}
            />
          </>
        )}

        {/* Summary */}
        {selectedBook && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Riepilogo</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Libro:</Text>
              <Text style={styles.summaryValue}>{selectedBook.titolo}</Text>
            </View>
            {!useCustomPrice && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Condizione:</Text>
                <Text style={styles.summaryValue}>{currentCondition.label}</Text>
              </View>
            )}
            {useCustomPrice && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Tipo prezzo:</Text>
                <Text style={styles.summaryValue}>Personalizzato</Text>
              </View>
            )}
            {hasFascicoli && fascicoliTotali > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Fascicoli:</Text>
                <Text style={styles.summaryValue}>
                  {fascicoliPresenti}/{fascicoliTotali}
                </Text>
              </View>
            )}
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Prezzo di vendita:</Text>
              <Text style={styles.summaryPrice}>€{getFinalPrice().toFixed(2)}</Text>
            </View>
          </View>
        )}

        {/* Submit */}
        {selectedBook && (
          <TouchableOpacity
            style={styles.submitButton}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>Pubblica Annuncio</Text>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
      
      {/* IBAN Modal */}
      <Modal
        visible={showIbanModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowIbanModal(false)}
      >
        <View style={styles.ibanModalOverlay}>
          <View style={styles.ibanModalContent}>
            <View style={styles.ibanModalHeader}>
              <Text style={styles.ibanModalTitle}>IBAN richiesto</Text>
              <TouchableOpacity onPress={() => setShowIbanModal(false)}>
                <Ionicons name="close" size={28} color="#666" />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.ibanModalDescription}>
              Per ricevere i pagamenti delle tue vendite, inserisci il tuo IBAN italiano.
            </Text>
            
            <Text style={styles.ibanInputLabel}>IBAN</Text>
            <TextInput
              style={styles.ibanInput}
              placeholder="IT00 A000 0000 0000 0000 0000 000"
              placeholderTextColor="#999"
              value={ibanInput}
              onChangeText={(text) => setIbanInput(formatIBAN(text))}
              autoCapitalize="characters"
              maxLength={31}
            />
            
            <Text style={styles.ibanHint}>
              L'IBAN italiano inizia con "IT" seguito da 25 caratteri
            </Text>
            
            <TouchableOpacity
              style={styles.ibanSaveButton}
              onPress={handleSaveIbanAndPublish}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.ibanSaveButtonText}>Salva e Pubblica</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a472a',
    marginTop: 20,
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  searchResults: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    overflow: 'hidden',
  },
  searchResultItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  searchResultTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  searchResultAuthor: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  searchResultISBN: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  selectedBookCard: {
    flexDirection: 'row',
    backgroundColor: '#e8f5e9',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1a472a',
  },
  selectedBookInfo: {
    flex: 1,
  },
  selectedBookTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a472a',
  },
  selectedBookAuthor: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  selectedBookISBN: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  selectedBookPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a472a',
    marginTop: 8,
  },
  selectedBookUsato: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
  },
  changeBookButton: {
    justifyContent: 'center',
  },
  questionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  questionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    flex: 1,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  optionButton: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    backgroundColor: '#fafafa',
  },
  optionButtonSelected: {
    borderColor: '#1a472a',
    backgroundColor: '#e8f5e9',
  },
  optionEmoji: {
    fontSize: 20,
    marginBottom: 4,
  },
  optionLabel: {
    fontSize: 12,
    color: '#666',
  },
  optionLabelSelected: {
    color: '#1a472a',
    fontWeight: '600',
  },
  conditionResult: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1a472a',
  },
  conditionResultLabel: {
    fontSize: 12,
    color: '#666',
  },
  conditionResultValue: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 4,
  },
  conditionResultPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a472a',
    marginTop: 8,
  },
  fascicoliCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  fascicoliToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fascicoliToggleText: {
    fontSize: 14,
    color: '#333',
  },
  fascicoliInputs: {
    marginTop: 16,
    gap: 12,
  },
  fascicoliInputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fascicoliInputLabel: {
    fontSize: 14,
    color: '#666',
  },
  counterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  counterButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e8f5e9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  counterValue: {
    fontSize: 18,
    fontWeight: '600',
    minWidth: 24,
    textAlign: 'center',
  },
  fascicoliWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff3e0',
    padding: 12,
    borderRadius: 8,
  },
  fascicoliWarningText: {
    fontSize: 12,
    color: '#e65100',
    flex: 1,
  },
  bookstoreList: {
    gap: 8,
  },
  bookstoreItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  bookstoreItemSelected: {
    backgroundColor: '#e8f5e9',
    borderWidth: 1,
    borderColor: '#1a472a',
  },
  bookstoreInfo: {
    flex: 1,
  },
  bookstoreName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  bookstoreAddress: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  noBookstoresText: {
    textAlign: 'center',
    color: '#999',
    padding: 20,
  },
  photoSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  photoPlaceholder: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
    aspectRatio: 3/4,
    maxHeight: 320,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    width: '60%',
  },
  photoPlaceholderText: {
    marginTop: 16,
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
  },
  photoButtons: {
    flexDirection: 'row',
    gap: 16,
  },
  photoButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
  },
  photoButtonText: {
    marginTop: 8,
    color: '#1a472a',
    fontWeight: '500',
  },
  photoPreview: {
    position: 'relative',
    alignSelf: 'center',
    width: '50%',
    maxWidth: 180,
    aspectRatio: 3/5,  // Proporzione libro aperto 30x50
  },
  photoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  photoZoomHint: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
    padding: 6,
    gap: 6,
  },
  photoZoomHintText: {
    color: '#fff',
    fontSize: 11,
  },
  removePhotoButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#fff',
    borderRadius: 14,
  },
  photoModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoModalClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
  },
  photoModalImage: {
    width: '90%',
    height: '80%',
  },
  // Stili foto multiple
  photosScrollView: {
    marginVertical: 8,
  },
  photoThumbnailContainer: {
    marginRight: 12,
    position: 'relative',
  },
  photoThumbnail: {
    width: 100,
    height: 133,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  mainPhotoBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: '#1a472a',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  mainPhotoBadgeText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
  },
  addPhotoContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  addPhotoButton: {
    width: 80,
    height: 133,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ddd',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoText: {
    fontSize: 12,
    color: '#1a472a',
    marginTop: 4,
  },
  photoCountText: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    marginTop: 8,
  },
  noteInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#666',
  },
  summaryValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
    marginLeft: 8,
  },
  summaryPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  submitButton: {
    backgroundColor: '#1a472a',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  selectedBookstoresInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
  },
  selectedBookstoresText: {
    fontSize: 13,
    color: '#2e7d32',
    fontWeight: '500',
  },
  priceToggleContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  priceToggleOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  priceToggleOptionSelected: {
    borderColor: '#1a472a',
    backgroundColor: '#e8f5e9',
  },
  priceToggleText: {
    fontSize: 14,
    color: '#666',
  },
  priceToggleTextSelected: {
    color: '#1a472a',
    fontWeight: '600',
  },
  customPriceCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    borderWidth: 2,
    borderColor: '#1a472a',
  },
  customPriceLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  customPriceInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  currencySymbol: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a472a',
    marginRight: 8,
  },
  customPriceInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a472a',
    paddingVertical: 16,
  },
  customPriceHint: {
    fontSize: 12,
    color: '#888',
    marginTop: 12,
    textAlign: 'center',
  },
  // Scanner styles
  scanButton: {
    padding: 8,
    marginLeft: 8,
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 50,
    backgroundColor: '#f5f5f5',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  scannerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  scanFrame: {
    width: 280,
    height: 150,
    borderWidth: 3,
    borderColor: '#1a472a',
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  scanHint: {
    marginTop: 24,
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  scanFrameNew: {
    width: 280,
    height: 120,
    borderWidth: 3,
    borderColor: '#00ff00',
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  scanHintNew: {
    marginTop: 20,
    fontSize: 18,
    color: '#fff',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  rescanButton: {
    marginTop: 20,
    backgroundColor: '#1a472a',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  rescanButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  permissionText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
    textAlign: 'center',
  },
  permissionButton: {
    marginTop: 24,
    backgroundColor: '#1a472a',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  manualInputContainer: {
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  manualInputLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  manualInputRow: {
    flexDirection: 'row',
  },
  manualInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  // IBAN Modal styles
  ibanModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  ibanModalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  ibanModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  ibanModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
  },
  ibanModalDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    lineHeight: 20,
  },
  ibanInputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  ibanInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 1,
  },
  ibanHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
    marginBottom: 24,
  },
  ibanSaveButton: {
    backgroundColor: '#1a472a',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ibanSaveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
