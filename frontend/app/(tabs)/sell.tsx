import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Image,
  Modal,
  TextInput,
  ScrollView,
  Pressable,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import Slider from '@react-native-community/slider';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Listing {
  id: string;
  book_titolo: string;
  book_autore?: string;
  book_autori?: string;
  book_materia?: string;
  book_disciplina?: string;
  condizione: string;
  prezzo_vendita: number;
  prezzo_ministeriale?: number;
  prezzo_copertina?: number;
  stato: string;
  foto_base64?: string;
  created_at: string;
}

interface Book {
  id: string;
  isbn: string;
  titolo: string;
  autori?: string;
  disciplina?: string;
  prezzo_copertina?: number;
  prezzo_suggerito?: number;
  editore?: string;
}

interface ChildProfile {
  id: string;
  nome_figlio: string;
  scuola: string;
  codice_scuola: string;
  classe: string;
  tipo_scuola: string;
}

// Condition options with traffic light colors
const CONDITION_OPTIONS = [
  { value: 'nuovo', label: 'Nuovo', color: '#2196F3', icon: 'sparkles' },
  { value: 'perfetto', label: 'Perfetto', color: '#4CAF50', icon: 'checkmark-circle' },
  { value: 'buono', label: 'Buono', color: '#FF9800', icon: 'alert-circle' },
  { value: 'molto_usato', label: 'Molto Usato', color: '#f44336', icon: 'close-circle' },
];

export default function SellScreen() {
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  
  // Child profiles
  const [childProfiles, setChildProfiles] = useState<ChildProfile[]>([]);
  const [selectedChild, setSelectedChild] = useState<ChildProfile | null>(null);
  const [showChildPicker, setShowChildPicker] = useState(false);
  
  // Books to sell
  const [booksToSell, setBooksToSell] = useState<Book[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(false);
  const [showBookPicker, setShowBookPicker] = useState(false);
  const [targetClasse, setTargetClasse] = useState<number | null>(null);
  
  // Selected book for listing
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [showListingForm, setShowListingForm] = useState(false);
  
  // Form fields
  const [listingPhotos, setListingPhotos] = useState<string[]>([]);
  const [hasWritings, setHasWritings] = useState(0); // Slider 0-100
  const [hasHighlights, setHasHighlights] = useState(0); // Slider 0-100
  const [hasFolds, setHasFolds] = useState(0); // Slider 0-100
  // coverCondition rimosso - ora abbiamo solo 3 slider
  const [selectedBookshop, setSelectedBookshop] = useState('');
  const [notes, setNotes] = useState('');
  const [creatingListing, setCreatingListing] = useState(false);
  const [loadingPhoto, setLoadingPhoto] = useState(false); // Loading durante elaborazione foto
  
  // Copertina automatica da IBS.it
  const [autoCoverUrl, setAutoCoverUrl] = useState<string | null>(null);
  const [loadingCover, setLoadingCover] = useState(false);

  // Libro Nuovo flag
  const [isNewBook, setIsNewBook] = useState(false);
  
  // Prezzo selezionato dalla forbice
  const [selectedPriceOption, setSelectedPriceOption] = useState<number | null>(null);

  // Multi-select bookshops
  const [selectedBookshops, setSelectedBookshops] = useState<string[]>([]);
  
  // ISBN Manual Search - "Vendi altro libro"
  const [showISBNSearch, setShowISBNSearch] = useState(false);
  const [isbnInput, setIsbnInput] = useState('');
  const [searchingISBN, setSearchingISBN] = useState(false);
  const [isbnError, setIsbnError] = useState('');
  
  // Barcode Scanner
  const [showScanner, setShowScanner] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [webScannerReady, setWebScannerReady] = useState(false);
  const webScannerRef = useRef<any>(null);

  // Bookshops data with addresses for Google Maps
  const bookshopsData = [
    { 
      id: 'lapostrofo', 
      name: "Cartolibreria L'Apostrofo", 
      address: 'Via Genova 24, Viale Crotone 138, 88100 Catanzaro',
      phone: '0961 34375',
      coordinates: { lat: 38.9055, lng: 16.5942 }
    },
    { 
      id: 'palaia', 
      name: 'Cartolibreria Palaia Luigi', 
      address: 'Via Santa Maria 1, 88100 Catanzaro',
      phone: '0961 63173',
      coordinates: { lat: 38.9047, lng: 16.5876 }
    },
    { 
      id: 'aemme77', 
      name: 'AEMME 77 di Ruoppolo Francesco', 
      address: 'Viale Tommaso Campanella 68, 88100 Catanzaro',
      phone: '0961 770643',
      coordinates: { lat: 38.9015, lng: 16.5963 }
    },
    { 
      id: 'nica', 
      name: 'Cartolibreria NiCa', 
      address: 'Viale Magna Grecia 179, 88100 Catanzaro',
      phone: '0961 191 3149',
      coordinates: { lat: 38.8892, lng: 16.5834 }
    },
  ];

  // Calcolo automatico condizione basato su slider (media pesata)
  // NOTA: Rimosso slider copertina - ora ci sono solo 3 slider
  const calculateCondition = (): { condition: string; score: number } => {
    // Se il libro è NUOVO, restituisci direttamente 'nuovo'
    if (isNewBook) {
      return { condition: 'nuovo', score: 0 };
    }
    
    // Media pesata dei difetti (0 = perfetto, 100 = molto rovinato)
    // Solo 3 slider: Scritte, Evidenziature, Pieghe - totale 100%
    const avgDefects = (
      hasWritings * 0.40 +      // Scritte peso 40%
      hasHighlights * 0.35 +    // Evidenziature peso 35%
      hasFolds * 0.25           // Pieghe peso 25%
    );
    
    // Determina condizione finale:
    // Ottimo: 0-30%, Buono: 30-70%, Accettabile: 70-90%, Scarso: 90-100%
    if (avgDefects <= 30) return { condition: 'ottimo', score: avgDefects };
    if (avgDefects <= 70) return { condition: 'buono', score: avgDefects };
    if (avgDefects <= 90) return { condition: 'accettabile', score: avgDefects };
    return { condition: 'scarso', score: avgDefects };
  };

  // Funzione per calcolare il colore gradiente verde → giallo → rosso
  const getGradientColor = (value: number): string => {
    // value: 0-100, dove 0 = verde (buono), 100 = rosso (difettoso)
    if (value <= 50) {
      // Verde → Giallo (0-50)
      const ratio = value / 50;
      const r = Math.round(76 + (255 - 76) * ratio);  // 76 → 255
      const g = Math.round(175 + (193 - 175) * ratio); // 175 → 193
      const b = Math.round(80 - 80 * ratio);           // 80 → 0
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      // Giallo → Rosso (50-100)
      const ratio = (value - 50) / 50;
      const r = 255;
      const g = Math.round(193 - 193 * ratio);  // 193 → 0
      const b = 0;
      return `rgb(${r}, ${g}, ${b})`;
    }
  };

  // ============================================================
  // FORMULA CALCOLO PREZZO LIBRO USATO (V2 - PREZZI PIÙ BASSI)
  // ============================================================
  // REGOLE:
  // - Usato PERFETTO (0 difetti): max 70% del prezzo ministeriale
  // - Nuovo: 85% del ministeriale (15% in meno), poi commissioni
  // - Scritte e evidenziature pesano di più
  // - Commissioni: 17% (12% piattaforma + 5% transazione)
  // ============================================================
  
  const calcolaPrezzoLibro = () => {
    const prezzoNuovo = selectedBook?.prezzo_copertina || 0;
    
    if (prezzoNuovo === 0) {
      return {
        usura: 0,
        prezzoConsigliato: 0,
        prezzoVeloce: 0,
        prezzoAlto: 0,
        guadagnoUtente: 0,
        condition: 'buono'
      };
    }
    
    // ========== LIBRO NUOVO ==========
    // 7% in meno del prezzo ministeriale (93%), poi commissioni
    if (isNewBook) {
      const prezzoAcquirente = prezzoNuovo * 0.93; // 93% del prezzo copertina
      // Commissioni totali: 17% piattaforma + Stripe (1.5% + 0.25€)
      const commissionePiattaforma = 0.17;
      const stripePercent = 0.015;
      const stripeFisso = 0.25;
      
      // Calcola guadagno venditore: prezzo acquirente - commissioni
      const guadagnoVenditore = prezzoAcquirente * (1 - commissionePiattaforma) - stripeFisso;
      
      return {
        usura: 0,
        prezzoAcquirente: Math.round(prezzoAcquirente * 100) / 100,
        guadagnoUtente: Math.round(guadagnoVenditore * 100) / 100,
        condition: 'nuovo'
      };
    }
    
    // ========== LIBRO USATO ==========
    // Pesi difetti
    const pesi = {
      scritte: 0.40,
      evidenziature: 0.35,
      pieghe: 0.25
    };
    
    // Calcolo usura (0 → 1)
    let usura = (
      hasWritings * pesi.scritte +
      hasHighlights * pesi.evidenziature +
      hasFolds * pesi.pieghe
    ) / 100;
    
    // PREZZO BASE USATO: max 80% del ministeriale (usato perfetto)
    const maxUsato = prezzoNuovo * 0.80;
    
    // Curva non lineare per l'usura
    let prezzoUsato = maxUsato * (1 - Math.pow(usura, 1.2));
    
    // Hard cap: mai sopra l'80% del nuovo
    prezzoUsato = Math.min(prezzoUsato, maxUsato);
    
    // Minimo 20% del nuovo per libri molto usurati
    prezzoUsato = Math.max(prezzoUsato, prezzoNuovo * 0.20);
    
    // Commissioni (17% piattaforma + Stripe)
    const commissionePiattaforma = 0.17;
    const stripeFisso = 0.25;
    
    // Varianti UX - 3 opzioni prezzo (quello che paga l'acquirente)
    const prezzoAlto = Math.min(prezzoUsato * 1.10, prezzoNuovo * 0.85);
    const prezzoMedio = prezzoUsato;
    const prezzoBasso = prezzoUsato * 0.90;
    
    // Determina condizione basata su usura
    // Ottimo: 0-30%, Buono: 30-70%, Accettabile: 70-90%, Scarso: 90-100%
    let condition = 'buono';
    const usuraPercentuale = usura * 100;
    if (usuraPercentuale <= 30) condition = 'ottimo';
    else if (usuraPercentuale <= 70) condition = 'buono';
    else if (usuraPercentuale <= 90) condition = 'accettabile';
    else condition = 'scarso';
    
    return {
      usura: Math.round(usuraPercentuale * 10) / 10,
      prezzoAlto: Math.round(prezzoAlto * 100) / 100,
      prezzoMedio: Math.round(prezzoMedio * 100) / 100,
      prezzoBasso: Math.round(prezzoBasso * 100) / 100,
      guadagnoAlto: Math.round((prezzoAlto * (1 - commissionePiattaforma) - stripeFisso) * 100) / 100,
      guadagnoMedio: Math.round((prezzoMedio * (1 - commissionePiattaforma) - stripeFisso) * 100) / 100,
      guadagnoBasso: Math.round((prezzoBasso * (1 - commissionePiattaforma) - stripeFisso) * 100) / 100,
      condition
    };
  };

  // Calcola forbice di prezzi basata sulla nuova formula
  const calculatePriceRange = () => {
    const prezzoCalcolato = calcolaPrezzoLibro();
    
    // Se libro nuovo, una sola opzione
    if (isNewBook) {
      return {
        condition: prezzoCalcolato.condition,
        usura: 0,
        isNew: true,
        prezzoAcquirente: prezzoCalcolato.prezzoAcquirente,
        guadagnoUtente: prezzoCalcolato.guadagnoUtente,
        prices: [
          { 
            label: 'Libro Nuovo', 
            prezzoAcquirente: prezzoCalcolato.prezzoAcquirente,
            guadagnoVenditore: prezzoCalcolato.guadagnoUtente
          }
        ]
      };
    }
    
    // Libro usato - 3 opzioni
    return {
      condition: prezzoCalcolato.condition,
      usura: prezzoCalcolato.usura,
      isNew: false,
      prices: [
        { 
          label: 'Prezzo alto', 
          prezzoAcquirente: prezzoCalcolato.prezzoAlto,
          guadagnoVenditore: prezzoCalcolato.guadagnoAlto
        },
        { 
          label: 'Prezzo consigliato', 
          prezzoAcquirente: prezzoCalcolato.prezzoMedio,
          guadagnoVenditore: prezzoCalcolato.guadagnoMedio
        },
        { 
          label: 'Vendita rapida', 
          prezzoAcquirente: prezzoCalcolato.prezzoBasso,
          guadagnoVenditore: prezzoCalcolato.guadagnoBasso
        },
      ]
    };
  };

  const conditionResult = calculateCondition();
  const priceRange = calculatePriceRange();
  const calculatedPrice = selectedPriceOption !== null 
    ? selectedPriceOption.toFixed(2)
    : (priceRange.prices[0]?.prezzoAcquirente || 0).toFixed(2);

  // Auto-seleziona il prezzo consigliato quando il form è aperto
  useEffect(() => {
    if (showListingForm && selectedBook && selectedPriceOption === null) {
      // Seleziona automaticamente il prezzo consigliato (indice 1 per usati, indice 0 per nuovi)
      const defaultPriceIndex = isNewBook ? 0 : 1;
      const defaultPrice = priceRange.prices[defaultPriceIndex]?.prezzoAcquirente || priceRange.prices[0]?.prezzoAcquirente;
      if (defaultPrice) {
        setSelectedPriceOption(defaultPrice);
      }
    }
  }, [showListingForm, selectedBook, isNewBook, priceRange.prices]);

  // Bookshop options
  const toggleBookshop = (shopId: string) => {
    setSelectedBookshops(prev => {
      if (prev.includes(shopId)) {
        return prev.filter(id => id !== shopId);
      } else {
        return [...prev, shopId];
      }
    });
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      if (!storedUserId) {
        router.replace('/');
        return;
      }
      setUserId(storedUserId);

      // Load user listings
      const response = await axios.get(
        `${API_URL}/api/listings/user/${storedUserId}`
      );
      setListings(response.data);

      // Load child profiles
      const userResponse = await axios.get(`${API_URL}/api/users/${storedUserId}`);
      setChildProfiles(userResponse.data.profili_figli || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const selectChildForSelling = async (child: ChildProfile) => {
    setSelectedChild(child);
    setShowChildPicker(false);
    setLoadingBooks(true);

    try {
      // Use the new endpoint with compatibility logic
      const response = await axios.get(
        `${API_URL}/api/profiles/${userId}/children/${child.id}/books-to-sell`
      );
      
      if (response.data.books && response.data.books.length > 0) {
        setBooksToSell(response.data.books);
        setTargetClasse(response.data.classe_destinazione);
        setShowBookPicker(true);
      } else {
        Alert.alert(
          'Nessun libro vendibile',
          response.data.message || `${child.nome_figlio} non ha libri compatibili da vendere.`
        );
        setBooksToSell([]);
      }
    } catch (error) {
      console.error('Error loading books:', error);
      Alert.alert('Errore', 'Impossibile caricare i libri');
    } finally {
      setLoadingBooks(false);
    }
  };

  const selectBookToSell = (book: Book) => {
    setSelectedBook(book);
    setShowBookPicker(false);
    setShowISBNSearch(false);
    
    // Reset form - condizione e prezzo saranno calcolati automaticamente
    setListingPhotos([]);
    setHasWritings(0);
    setHasHighlights(0);
    setHasFolds(0);
    // coverCondition rimosso - non più usato
    setSelectedBookshops([]);
    setIsNewBook(false);
    setNotes('');
    setSelectedPriceOption(null);
    setAutoCoverUrl(null); // Reset copertina
    
    // Recupera automaticamente la copertina da IBS.it
    if (book.isbn) {
      fetchBookCover(book.isbn);
    }
    
    setShowListingForm(true);
  };

  // Search book by ISBN for "Vendi altro libro"
  const searchBookByISBN = async () => {
    if (!isbnInput.trim()) {
      setIsbnError('Inserisci un ISBN');
      return;
    }
    
    const cleanISBN = isbnInput.replace(/[-\s]/g, '').trim();
    if (cleanISBN.length !== 10 && cleanISBN.length !== 13) {
      setIsbnError('ISBN non valido (deve essere 10 o 13 cifre)');
      return;
    }
    
    setSearchingISBN(true);
    setIsbnError('');
    
    try {
      const response = await axios.get(`${API_URL}/api/books/search/${cleanISBN}`);
      const book = response.data;
      
      // Book found - proceed to sell form
      const bookToSell: Book = {
        id: book.id || cleanISBN,
        isbn: book.isbn || cleanISBN,
        titolo: book.titolo,
        autori: book.autori,
        disciplina: book.disciplina,
        prezzo_copertina: book.prezzo_copertina || book.prezzo_ministeriale,
        editore: book.editore,
      };
      
      selectBookToSell(bookToSell);
      setIsbnInput('');
    } catch (error: any) {
      if (error.response?.status === 404) {
        setIsbnError('Libro non presente nelle scuole di Catanzaro');
      } else {
        setIsbnError('Errore nella ricerca. Riprova.');
      }
    } finally {
      setSearchingISBN(false);
    }
  };

  // Open barcode scanner
  const openScanner = async () => {
    // Reset tutti gli stati
    setScanned(false);
    setWebScannerReady(false);
    
    // Su web, usa html5-qrcode
    if (Platform.OS === 'web') {
      // Prima pulisci completamente eventuali scanner precedenti
      await stopWebScanner();
      
      // Mostra il modal
      setShowScanner(true);
      
      // Aspetta che il DOM sia pronto, poi inizializza
      setTimeout(async () => {
        try {
          // Importa dinamicamente
          const { Html5Qrcode } = await import('html5-qrcode');
          
          // Verifica che l'elemento DOM esista
          const element = document.getElementById('web-barcode-reader');
          if (!element) {
            console.error('DOM element not found');
            Alert.alert('Errore', 'Elemento scanner non trovato. Riprova.');
            return;
          }
          
          // Pulisci eventuali contenuti residui nell'elemento
          element.innerHTML = '';
          
          // Crea nuova istanza
          const html5QrCode = new Html5Qrcode("web-barcode-reader", {
            verbose: false,
            experimentalFeatures: {
              useBarCodeDetectorIfSupported: true // Usa API nativa del browser (MOLTO più veloce)
            }
          });
          webScannerRef.current = html5QrCode;
          
          // Configura e avvia - IMPOSTAZIONI ULTRA REATTIVE
          await html5QrCode.start(
            { facingMode: "environment" },
            {
              fps: 30, // 30 FPS per massima reattività
              qrbox: { width: 320, height: 90 }, // Area stretta ottimizzata per barcode
              aspectRatio: 1.777, // 16:9
              disableFlip: false, // Permetti barcode invertiti
            },
            (decodedText: string) => {
              console.log('=== BARCODE DETECTED ===', decodedText);
              handleWebBarcodeScanned(decodedText);
            },
            (errorMessage: string) => {
              // Ignora errori continui
            }
          );
          
          setWebScannerReady(true);
          console.log('Scanner avviato - 30 FPS Ultra Reattivo');
          
        } catch (err: any) {
          console.error('Errore avvio scanner:', err);
          
          if (err.toString().includes('NotAllowedError') || err.toString().includes('Permission')) {
            Alert.alert('Permesso Camera', 'Devi autorizzare l\'accesso alla camera per usare lo scanner.');
          } else if (err.toString().includes('NotFoundError')) {
            Alert.alert('Camera non trovata', 'Nessuna camera disponibile su questo dispositivo.');
          } else if (!err.toString().includes('already scanning')) {
            Alert.alert('Errore Scanner', 'Impossibile avviare lo scanner. Chiudi e riprova.');
          }
          
          setShowScanner(false);
        }
      }, 500); // Delay ridotto per avvio più rapido
      
      return;
    }
    
    // Su mobile, usa expo-camera
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert(
          'Permesso negato',
          'Per scansionare il codice a barre serve il permesso della fotocamera'
        );
        return;
      }
    }
    
    setCameraReady(false);
    setShowScanner(true);
  };

  // Handle web barcode scanned
  const handleWebBarcodeScanned = async (decodedText: string) => {
    if (scanned) return;
    
    console.log('Barcode scanned:', decodedText);
    setScanned(true);
    const cleanISBN = decodedText.replace(/[-\s]/g, '').trim();
    
    // Prima ferma lo scanner completamente
    await stopWebScanner();
    
    // Poi chiudi il modal
    setShowScanner(false);
    setIsbnInput(cleanISBN);
    
    // Auto-search the book
    searchBookByISBNValue(cleanISBN);
  };

  // Stop and cleanup web scanner completely
  const stopWebScanner = async () => {
    if (webScannerRef.current) {
      try {
        const scanner = webScannerRef.current;
        // Prima stop, poi clear per rimuovere elementi DOM
        if (scanner.isScanning) {
          await scanner.stop();
        }
        await scanner.clear();
        console.log('Web scanner stopped and cleared');
      } catch (err: any) {
        console.log('Scanner cleanup error (ignorable):', err.message);
      }
      webScannerRef.current = null;
    }
    setWebScannerReady(false);
    setScanned(false);
  };

  // Close web scanner (alias for backward compatibility)
  const closeWebScanner = () => {
    stopWebScanner();
  };

  // Handle barcode scanned (mobile)
  const handleBarCodeScanned = (result: BarcodeScanningResult) => {
    // Prevent multiple scans
    if (scanned) {
      console.log('Scan already in progress, ignoring...');
      return;
    }
    
    console.log('=== BARCODE DETECTED ===');
    console.log('Type:', result.type);
    console.log('Data:', result.data);
    console.log('========================');
    
    setScanned(true);
    
    // Clean the ISBN
    const cleanISBN = result.data.replace(/[-\s]/g, '').trim();
    
    // Close scanner and set ISBN
    setShowScanner(false);
    setIsbnInput(cleanISBN);
    
    // Auto-search the book
    searchBookByISBNValue(cleanISBN);
  };

  // Search book by ISBN value (for scanner)
  const searchBookByISBNValue = async (isbn: string) => {
    if (!isbn.trim()) return;
    
    setSearchingISBN(true);
    setIsbnError('');
    
    try {
      const response = await axios.get(`${API_URL}/api/books/search/${isbn}`);
      const book = response.data;
      
      const bookToSell: Book = {
        id: book.id || isbn,
        isbn: book.isbn || isbn,
        titolo: book.titolo,
        autori: book.autori,
        disciplina: book.disciplina,
        prezzo_copertina: book.prezzo_copertina || book.prezzo_ministeriale,
        editore: book.editore,
      };
      
      selectBookToSell(bookToSell);
      setIsbnInput('');
    } catch (error: any) {
      if (error.response?.status === 404) {
        setIsbnError(`Libro con ISBN ${isbn} non presente negli elenchi delle scuole di Catanzaro`);
      } else {
        setIsbnError('Errore nella ricerca. Riprova.');
      }
    } finally {
      setSearchingISBN(false);
    }
  };

  // Funzione per comprimere immagine (max 1MB, formato JPEG ottimizzato)
  const compressImage = async (uri: string): Promise<string | null> => {
    try {
      // Ridimensiona a max 1280px di larghezza mantenendo aspect ratio
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1280 } }],
        { 
          compress: 0.6, // 60% qualità JPEG (buon compromesso qualità/dimensione)
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true 
        }
      );
      
      // Verifica dimensione (base64 è ~33% più grande del binario)
      if (manipulated.base64) {
        const sizeKB = (manipulated.base64.length * 0.75) / 1024;
        console.log(`Foto compressa: ${sizeKB.toFixed(0)} KB`);
        
        // Se ancora troppo grande, comprimi di più
        if (sizeKB > 1024) {
          const extraCompressed = await ImageManipulator.manipulateAsync(
            uri,
            [{ resize: { width: 800 } }],
            { compress: 0.4, format: ImageManipulator.SaveFormat.JPEG, base64: true }
          );
          return extraCompressed.base64 || null;
        }
        return manipulated.base64;
      }
      return null;
    } catch (error) {
      console.error('Errore compressione:', error);
      return null;
    }
  };

  // Funzione per recuperare copertina automatica da IBS.it
  const fetchBookCover = async (isbn: string) => {
    if (!isbn) return;
    
    setLoadingCover(true);
    try {
      const response = await axios.get(`${API_URL}/api/books/cover/${isbn}`);
      if (response.data && response.data.cover_url) {
        setAutoCoverUrl(response.data.cover_url);
        console.log('Copertina recuperata da:', response.data.source);
      }
    } catch (error) {
      console.error('Errore recupero copertina:', error);
      setAutoCoverUrl(null);
    } finally {
      setLoadingCover(false);
    }
  };

  const pickImage = async () => {
    if (listingPhotos.length >= 3) {
      Alert.alert('Limite raggiunto', 'Puoi caricare massimo 3 foto');
      return;
    }

    setLoadingPhoto(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9], // Formato orizzontale (landscape)
        quality: 0.7, // Qualità iniziale alta, poi comprimiamo
        exif: false, // Rimuove metadati
      });

      if (!result.canceled && result.assets[0].uri) {
        // Comprimi l'immagine
        const compressedBase64 = await compressImage(result.assets[0].uri);
        if (compressedBase64) {
          setListingPhotos([...listingPhotos, compressedBase64]);
        } else {
          Alert.alert('Errore', 'Impossibile elaborare la foto');
        }
      }
    } finally {
      setLoadingPhoto(false);
    }
  };

  // Funzione per scattare foto in posizione specifica (indipendente)
  const takePhotoAtIndex = async (index: number) => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permesso negato', 'Serve il permesso per usare la fotocamera');
      return;
    }

    setLoadingPhoto(true);
    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false, // Disabilita editing per preservare orientamento
        quality: 0.7,
        exif: true, // Mantieni EXIF per orientamento
      });

      if (!result.canceled && result.assets[0].uri) {
        // Comprimi e ruota automaticamente l'immagine
        const compressedBase64 = await compressAndRotateImage(result.assets[0].uri);
        if (compressedBase64) {
          // Inserisci la foto nella posizione specifica
          const newPhotos = [...listingPhotos];
          // Se l'indice è oltre la lunghezza, riempi con null
          while (newPhotos.length < index) {
            newPhotos.push('');
          }
          if (newPhotos.length === index) {
            newPhotos.push(compressedBase64);
          } else {
            newPhotos[index] = compressedBase64;
          }
          // Filtra eventuali stringhe vuote
          setListingPhotos(newPhotos.filter(p => p !== ''));
        } else {
          Alert.alert('Errore', 'Impossibile elaborare la foto');
        }
      }
    } finally {
      setLoadingPhoto(false);
    }
  };

  // Comprimi e ruota automaticamente foto in landscape
  const compressAndRotateImage = async (uri: string): Promise<string | null> => {
    try {
      // Prima ridimensiona e ruota se necessario (formato 16:9 orizzontale)
      const manipResult = await ImageManipulator.manipulateAsync(
        uri,
        [
          { resize: { width: 1280 } }, // Max 1280px larghezza
        ],
        { 
          compress: 0.6, 
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );
      
      // Converti in base64
      const response = await fetch(manipResult.uri);
      const blob = await response.blob();
      
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          // Verifica dimensione (max 1MB)
          if (base64.length > 1400000) {
            // Ricomprimi con qualità più bassa
            ImageManipulator.manipulateAsync(
              uri,
              [{ resize: { width: 800 } }],
              { compress: 0.4, format: ImageManipulator.SaveFormat.JPEG }
            ).then(async (recompressed) => {
              const resp2 = await fetch(recompressed.uri);
              const blob2 = await resp2.blob();
              const reader2 = new FileReader();
              reader2.onloadend = () => {
                resolve((reader2.result as string).split(',')[1]);
              };
              reader2.readAsDataURL(blob2);
            });
          } else {
            resolve(base64);
          }
        };
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('Error compressing image:', error);
      return null;
    }
  };

  const takePhoto = async () => {
    if (listingPhotos.length >= 3) {
      Alert.alert('Limite raggiunto', 'Puoi caricare massimo 3 foto');
      return;
    }

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permesso negato', 'Serve il permesso per usare la fotocamera');
      return;
    }

    setLoadingPhoto(true);
    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.7,
        exif: true,
      });

      if (!result.canceled && result.assets[0].uri) {
        // Comprimi e ruota automaticamente
        const compressedBase64 = await compressAndRotateImage(result.assets[0].uri);
        if (compressedBase64) {
          setListingPhotos([...listingPhotos, compressedBase64]);
        } else {
          Alert.alert('Errore', 'Impossibile elaborare la foto');
        }
      }
    } finally {
      setLoadingPhoto(false);
    }
  };

  const removePhoto = (index: number) => {
    setListingPhotos(listingPhotos.filter((_, i) => i !== index));
  };

  const createListing = async () => {
    if (!selectedBook || !userId) {
      console.log('Missing selectedBook or userId');
      return;
    }

    // Validate price selected
    if (selectedPriceOption === null) {
      Alert.alert('Prezzo richiesto', 'Seleziona un prezzo dalla forbice di prezzi');
      return;
    }

    if (selectedBookshops.length === 0) {
      Alert.alert('Punto di scambio richiesto', 'Seleziona almeno una cartolibreria');
      return;
    }

    setCreatingListing(true);
    try {
      // Get selected bookshop details
      const selectedShopsDetails = bookshopsData.filter(b => selectedBookshops.includes(b.id));
      
      // Prepare condition details (copertina rimossa)
      const conditionDetails = {
        scritte: hasWritings,
        evidenziature: hasHighlights,
        pieghe: hasFolds,
      };
      
      // Usa priceRange per la condizione (nuova formula)
      const currentPriceRange = calculatePriceRange();
      
      // Trova il guadagno corrispondente al prezzo selezionato
      const selectedPriceInfo = currentPriceRange.prices.find(
        p => p.prezzoAcquirente === selectedPriceOption
      );
      const guadagnoUtente = selectedPriceInfo?.guadagnoVenditore || 
        (currentPriceRange.guadagnoUtente) || 
        (selectedPriceOption * 0.83 - 0.25);
      
      console.log('Creating listing with:', {
        isbn: selectedBook.isbn,
        prezzo: selectedPriceOption,
        condizione: currentPriceRange.condition,
        guadagno: guadagnoUtente
      });
      
      await axios.post(`${API_URL}/api/listings?user_id=${userId}`, {
        book_id: selectedBook.isbn || selectedBook.id,
        book_isbn: selectedBook.isbn,
        book_titolo: selectedBook.titolo,
        book_autori: selectedBook.autori,
        book_disciplina: selectedBook.disciplina,
        prezzo_copertina: selectedBook.prezzo_copertina,
        condizione: currentPriceRange.condition, // Usa la nuova formula
        prezzo_vendita: selectedPriceOption, // Prezzo selezionato dalla forbice
        foto_base64: listingPhotos.length > 0 ? listingPhotos[0] : null, // Main photo (opzionale)
        foto_aggiuntive: listingPhotos.slice(1), // Additional photos
        cover_url: autoCoverUrl, // Copertina automatica da IBS.it
        condition_details: conditionDetails, // Dettagli slider
        bookstore_ids: selectedBookshops,
        bookstore_names: selectedShopsDetails.map(s => s.name),
        bookstore_addresses: selectedShopsDetails.map(s => s.address),
        notes: notes,
        child_profile_id: selectedChild?.id,
        child_name: selectedChild?.nome_figlio,
        is_new_book: isNewBook,
        usura: currentPriceRange.usura || 0, // Salva anche l'usura calcolata
        guadagno_utente: guadagnoUtente, // Guadagno venditore
      });

      Alert.alert('Successo!', 'Annuncio creato con successo');
      setShowListingForm(false);
      setSelectedBook(null);
      setShowBookPicker(true); // Torna alla lista libri
      loadData();
    } catch (error: any) {
      Alert.alert('Errore', error.response?.data?.detail || 'Impossibile creare annuncio');
    } finally {
      setCreatingListing(false);
    }
  };

  const handleDeleteListing = async (listingId: string) => {
    Alert.alert(
      'Elimina annuncio',
      'Sei sicuro di voler eliminare questo annuncio?',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(
                `${API_URL}/api/listings/${listingId}?user_id=${userId}`
              );
              setListings(listings.filter((l) => l.id !== listingId));
            } catch (error: any) {
              Alert.alert('Errore', error.response?.data?.detail || 'Impossibile eliminare');
            }
          },
        },
      ]
    );
  };

  const getConditionConfig = (condition: string) => {
    return CONDITION_OPTIONS.find(c => c.value === condition) || CONDITION_OPTIONS[1];
  };

  const getStatoConfig = (stato: string) => {
    switch (stato) {
      case 'disponibile':
        return { color: '#4CAF50', label: 'In vendita', icon: 'pricetag' };
      case 'venduto':
        return { color: '#FF9800', label: 'Da consegnare', icon: 'time' };
      case 'consegnato':
        return { color: '#2196F3', label: 'Consegnato', icon: 'checkmark-circle' };
      default:
        return { color: '#666', label: stato, icon: 'ellipse' };
    }
  };

  const renderListing = ({ item }: { item: Listing }) => {
    const statoConfig = getStatoConfig(item.stato);
    const condConfig = getConditionConfig(item.condizione);
    
    return (
      <View style={styles.listingCard}>
        {item.foto_base64 && (
          <Image
            source={{ uri: `data:image/jpeg;base64,${item.foto_base64}` }}
            style={styles.listingImage}
          />
        )}
        
        <View style={styles.listingContent}>
          <View style={styles.listingHeader}>
            <View style={[styles.statoBadge, { backgroundColor: statoConfig.color }]}>
              <Ionicons name={statoConfig.icon as any} size={12} color="#fff" />
              <Text style={styles.statoText}>{statoConfig.label}</Text>
            </View>
            <Text style={styles.listingPrice}>€{item.prezzo_vendita.toFixed(2)}</Text>
          </View>

          <Text style={styles.listingTitle}>{item.book_titolo}</Text>
          <Text style={styles.isbnText}>ISBN: {item.book_isbn}</Text>

          <View style={styles.listingMeta}>
            <View style={[styles.conditionBadge, { borderColor: condConfig.color }]}>
              <Ionicons name={condConfig.icon as any} size={14} color={condConfig.color} />
              <Text style={[styles.conditionText, { color: condConfig.color }]}>
                {condConfig.label}
              </Text>
            </View>
          </View>

          {item.stato === 'disponibile' && (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDeleteListing(item.id)}
            >
              <Ionicons name="trash-outline" size={16} color="#ff4444" />
              <Text style={styles.deleteButtonText}>Elimina</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a472a" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>I tuoi annunci</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowChildPicker(true)}
        >
          <Ionicons name="add-circle" size={24} color="#fff" />
          <Text style={styles.addButtonText}>Vendi Libro</Text>
        </TouchableOpacity>
      </View>

      {/* Listings */}
      {listings.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="pricetags-outline" size={64} color="#ccc" />
          <Text style={styles.emptyText}>Nessun annuncio</Text>
          <Text style={styles.emptySubtext}>
            Tocca "Vendi Libro" per mettere in vendita i libri usati
          </Text>
        </View>
      ) : (
        <FlatList
          data={listings}
          renderItem={renderListing}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}

      {/* Child Picker Modal */}
      <Modal
        visible={showChildPicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowChildPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowChildPicker(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Vendi Libro</Text>
              <TouchableOpacity onPress={() => setShowChildPicker(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Per quale figlio vuoi vendere i libri?
            </Text>

            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={true}>
              {childProfiles.length === 0 ? (
                <View style={styles.noChildrenContainer}>
                  <Ionicons name="person-add-outline" size={48} color="#ccc" />
                  <Text style={styles.noChildrenText}>Nessun profilo figlio</Text>
                  <TouchableOpacity
                    style={styles.goToProfileButton}
                    onPress={() => {
                      setShowChildPicker(false);
                      router.push('/(tabs)/profile');
                    }}
                  >
                    <Text style={styles.goToProfileButtonText}>Vai al Profilo</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                childProfiles.map((child) => {
                  const isMedia = child.tipo_scuola === 'primo_grado';
                  const childClasse = parseInt(child.classe);
                  // Solo 1° media e 1° superiore NON possono vendere
                  // Tutti gli altri (2° media, 3° media, 2°-5° superiore) possono vendere
                  const canSell = childClasse > 1;

                  return (
                    <TouchableOpacity
                      key={child.id}
                      style={[styles.childOption, !canSell && styles.childOptionDisabled]}
                      onPress={() => canSell && selectChildForSelling(child)}
                      disabled={!canSell}
                    >
                      <View style={[styles.childOptionIcon, { backgroundColor: canSell ? '#e8f5e9' : '#f0f0f0' }]}>
                        <Ionicons name="person" size={24} color={canSell ? "#1a472a" : "#999"} />
                      </View>
                      <View style={styles.childOptionInfo}>
                        <Text style={[styles.childOptionName, !canSell && styles.childOptionNameDisabled]}>
                          {child.nome_figlio}
                        </Text>
                        <Text style={styles.childOptionSchool}>
                          {child.classe}ª {isMedia ? 'Media' : 'Superiore'}
                        </Text>
                        {canSell ? (
                          <Text style={styles.childOptionHint}>
                            → Vendi libri alle classi precedenti
                          </Text>
                        ) : (
                          <Text style={[styles.childOptionHint, { color: '#f44336' }]}>
                            Primo anno - niente da vendere
                          </Text>
                        )}
                      </View>
                      {canSell && <Ionicons name="chevron-forward" size={20} color="#666" />}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            {/* Divider and "Vendi altro libro" button */}
            <View style={styles.dividerContainer}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>oppure</Text>
              <View style={styles.divider} />
            </View>

            <TouchableOpacity
              style={styles.otherBookButton}
              onPress={() => {
                setShowChildPicker(false);
                setShowISBNSearch(true);
                setIsbnInput('');
                setIsbnError('');
              }}
            >
              <View style={[styles.childOptionIcon, { backgroundColor: '#fff3e0' }]}>
                <Ionicons name="barcode-outline" size={24} color="#FF9800" />
              </View>
              <View style={styles.childOptionInfo}>
                <Text style={styles.childOptionName}>Vendi altro libro</Text>
                <Text style={styles.childOptionSchool}>
                  Inserisci ISBN manualmente
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#666" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ISBN Search Modal - "Vendi altro libro" */}
      <Modal
        visible={showISBNSearch}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowISBNSearch(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable 
            style={styles.modalOverlayPress}
            onPress={() => setShowISBNSearch(false)}
          />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Vendi altro libro</Text>
              <TouchableOpacity onPress={() => setShowISBNSearch(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Inserisci il codice ISBN o scansiona il codice a barre
            </Text>

            {/* Scan Button */}
            <TouchableOpacity
              style={styles.scanBarcodeButton}
              onPress={openScanner}
            >
              <View style={styles.scanBarcodeIcon}>
                <Ionicons name="camera" size={28} color="#fff" />
              </View>
              <View style={styles.scanBarcodeInfo}>
                <Text style={styles.scanBarcodeTitle}>Scansiona codice a barre</Text>
                <Text style={styles.scanBarcodeSubtitle}>Usa la fotocamera per leggere l'ISBN</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#1a472a" />
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.dividerContainer}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>oppure inserisci manualmente</Text>
              <View style={styles.divider} />
            </View>

            <View style={styles.isbnInputContainer}>
              <Ionicons name="barcode" size={24} color="#666" style={{ marginRight: 12 }} />
              <TextInput
                style={styles.isbnInput}
                placeholder="Es: 9788808520234"
                placeholderTextColor="#b0b0b0"
                value={isbnInput}
                onChangeText={(text) => {
                  setIsbnInput(text);
                  setIsbnError('');
                }}
                keyboardType="numeric"
                maxLength={17}
              />
            </View>

            {isbnError ? (
              <View style={styles.isbnErrorContainer}>
                <Ionicons name="alert-circle" size={20} color="#f44336" />
                <Text style={styles.isbnErrorText}>{isbnError}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.searchISBNButton, searchingISBN && styles.searchISBNButtonDisabled]}
              onPress={searchBookByISBN}
              disabled={searchingISBN}
            >
              {searchingISBN ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="search" size={20} color="#fff" />
                  <Text style={styles.searchISBNButtonText}>Cerca libro</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Barcode Scanner Modal */}
      <Modal
        visible={showScanner}
        animationType="slide"
        onRequestClose={() => {
          if (Platform.OS === 'web') {
            closeWebScanner();
          }
          setShowScanner(false);
        }}
      >
        <View style={styles.scannerContainer}>
          <View style={styles.scannerHeader}>
            <TouchableOpacity 
              style={styles.scannerCloseButton}
              onPress={() => {
                if (Platform.OS === 'web') {
                  closeWebScanner();
                }
                setShowScanner(false);
              }}
            >
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.scannerTitle}>Inquadra il codice a barre</Text>
          </View>
          
          {Platform.OS === 'web' ? (
            /* Web Scanner usando html5-qrcode */
            <View style={{ flex: 1, backgroundColor: '#000' }}>
              <View 
                id="web-barcode-reader" 
                style={{ 
                  width: '100%', 
                  height: '100%',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              />
              {!webScannerReady && (
                <View style={styles.scannerLoadingOverlay}>
                  <ActivityIndicator size="large" color="#fff" />
                  <Text style={{ color: '#fff', marginTop: 12 }}>Avvio scanner...</Text>
                </View>
              )}
            </View>
          ) : (
            /* Mobile Scanner usando expo-camera */
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerEnabled={true}
              onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
              barcodeScannerSettings={{
                barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'itf14'],
                interval: 300,
              }}
              onCameraReady={() => {
                console.log('Camera ready for barcode scanning');
                setCameraReady(true);
              }}
            />
          )}
          
          {Platform.OS !== 'web' && (
            <View style={styles.scannerOverlay} pointerEvents="none">
              <View style={styles.scannerFrame} />
            </View>
          )}
          
          <View style={styles.scannerFooter}>
            <Text style={styles.scannerHint}>
              {Platform.OS === 'web' 
                ? (webScannerReady ? 'Inquadra il codice a barre ISBN del libro' : 'Avvio camera...')
                : (cameraReady ? 'Posiziona il codice a barre all\'interno del riquadro' : 'Inizializzazione camera...')}
            </Text>
            {scanned && (
              <TouchableOpacity 
                style={styles.scanAgainButton}
                onPress={() => {
                  setScanned(false);
                  if (Platform.OS === 'web') {
                    // Riavvia web scanner
                    closeWebScanner();
                    openScanner();
                  }
                }}
              >
                <Text style={styles.scanAgainText}>Tocca per scansionare di nuovo</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* Book Picker Modal */}
      <Modal
        visible={showBookPicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowBookPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '80%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Seleziona Libro</Text>
              <TouchableOpacity onPress={() => setShowBookPicker(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            {selectedChild && targetClasse && (
              <Text style={styles.modalSubtitle}>
                Libri di {selectedChild.nome_figlio} vendibili alla {targetClasse}ª
              </Text>
            )}

            {loadingBooks ? (
              <ActivityIndicator size="large" color="#1a472a" style={{ marginTop: 40 }} />
            ) : (
              <FlatList
                data={booksToSell}
                keyExtractor={(item) => item.isbn || item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.bookOption}
                    onPress={() => selectBookToSell(item)}
                  >
                    <View style={styles.bookOptionInfo}>
                      <Text style={styles.bookOptionTitle}>
                        {item.titolo}
                      </Text>
                      <Text style={styles.bookOptionAuthor}>
                        {item.disciplina}
                      </Text>
                      <Text style={styles.isbnText}>
                        ISBN: {item.isbn}
                      </Text>
                      <Text style={styles.bookOptionPrice}>
                        Prezzo suggerito: €{item.prezzo_suggerito?.toFixed(2) || ((item.prezzo_copertina || 0) * 0.5).toFixed(2)}
                      </Text>
                    </View>
                    <Ionicons name="add-circle" size={28} color="#1a472a" />
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={styles.emptyBooks}>
                    <Ionicons name="book-outline" size={48} color="#ccc" />
                    <Text style={styles.emptyBooksText}>Nessun libro consigliato</Text>
                    <Text style={styles.emptyBooksSubtext}>
                      Non ci sono libri con domanda diretta nel flusso naturale.
                    </Text>
                    <Text style={[styles.emptyBooksSubtext, { marginTop: 8, color: '#1a472a' }]}>
                      Puoi comunque vendere altri libri usando l'opzione sotto.
                    </Text>
                    <TouchableOpacity
                      style={[styles.otherBookButton, { marginTop: 16, backgroundColor: '#fff3e0', borderRadius: 12, padding: 16 }]}
                      onPress={() => {
                        setShowBookPicker(false);
                        setShowISBNSearch(true);
                        setIsbnInput('');
                        setIsbnError('');
                      }}
                    >
                      <View style={[styles.childOptionIcon, { backgroundColor: '#FF9800' }]}>
                        <Ionicons name="barcode-outline" size={24} color="#fff" />
                      </View>
                      <View style={styles.childOptionInfo}>
                        <Text style={[styles.childOptionName, { color: '#FF9800' }]}>Vendi altro libro</Text>
                        <Text style={styles.childOptionSchool}>
                          Inserisci ISBN manualmente
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color="#FF9800" />
                    </TouchableOpacity>
                  </View>
                }
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Detailed Listing Form Modal */}
      <Modal
        visible={showListingForm}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowListingForm(false);
          setShowBookPicker(true); // Torna alla lista libri
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '95%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Dettagli Annuncio</Text>
              <TouchableOpacity onPress={() => {
                setShowListingForm(false);
                setShowBookPicker(true); // Torna alla lista libri
              }}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Book Info */}
              {selectedBook && (
                <View style={styles.selectedBookInfo}>
                  <View style={styles.selectedBookHeader}>
                    <Text style={styles.selectedBookTitle}>{selectedBook.titolo}</Text>
                    <Text style={styles.selectedBookPrice}>€{selectedBook.prezzo_copertina?.toFixed(2) || '0.00'}</Text>
                  </View>
                  <Text style={styles.selectedBookAuthor}>
                    {selectedBook.disciplina} • ISBN: {selectedBook.isbn}
                  </Text>
                </View>
              )}

              {/* ========== COPERTINA AUTOMATICA + FOTO OPZIONALI ========== */}
              
              {/* Copertina automatica da IBS.it */}
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.formLabel}>Copertina del libro</Text>
                {loadingCover ? (
                  <View style={{ alignItems: 'center', padding: 20 }}>
                    <ActivityIndicator size="small" color="#1a472a" />
                    <Text style={{ color: '#666', marginTop: 8 }}>Carico copertina...</Text>
                  </View>
                ) : autoCoverUrl ? (
                  <View style={{ alignItems: 'center' }}>
                    <Image
                      source={{ uri: autoCoverUrl }}
                      style={{ width: 120, height: 180, borderRadius: 8, backgroundColor: '#f0f0f0' }}
                      resizeMode="contain"
                    />
                  </View>
                ) : (
                  <View style={{ alignItems: 'center', padding: 20, backgroundColor: '#f9f9f9', borderRadius: 8 }}>
                    <Ionicons name="image-outline" size={40} color="#ccc" />
                    <Text style={{ color: '#999', marginTop: 8 }}>Copertina non disponibile</Text>
                  </View>
                )}
              </View>

              {/* Foto aggiuntive OPZIONALI - OGNI ICONA È INDIPENDENTE */}
              <Text style={styles.formLabel}>Foto del libro (opzionali - max 3)</Text>
              <View style={styles.photoRequirements}>
                {/* Foto 1 - Copertina libro aperto */}
                <TouchableOpacity 
                  style={[styles.photoReqItem, styles.photoReqItemClickable, listingPhotos[0] && styles.photoReqItemDone]}
                  onPress={() => !listingPhotos[0] && takePhotoAtIndex(0)}
                  disabled={!!listingPhotos[0]}
                >
                  <Ionicons 
                    name="camera" 
                    size={22} 
                    color={listingPhotos[0] ? "#4CAF50" : "#1a472a"} 
                  />
                  <Text style={[styles.photoReqText, { color: listingPhotos[0] ? '#4CAF50' : '#333', marginLeft: 10, flex: 1 }]}>
                    1. Foto copertina - libro aperto
                  </Text>
                  {listingPhotos[0] ? (
                    <TouchableOpacity onPress={() => removePhoto(0)}>
                      <Ionicons name="close-circle" size={20} color="#ff4444" />
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.photoScattaInline}>Scatta</Text>
                  )}
                </TouchableOpacity>

                {/* Foto 2 - Fascicoli */}
                <TouchableOpacity 
                  style={[styles.photoReqItem, styles.photoReqItemClickable, listingPhotos[1] && styles.photoReqItemDone]}
                  onPress={() => !listingPhotos[1] && takePhotoAtIndex(1)}
                  disabled={!!listingPhotos[1]}
                >
                  <Ionicons 
                    name="camera" 
                    size={22} 
                    color={listingPhotos[1] ? "#4CAF50" : "#1a472a"} 
                  />
                  <Text style={[styles.photoReqText, { color: listingPhotos[1] ? '#4CAF50' : '#333', marginLeft: 10, flex: 1 }]}>
                    2. Fascicoli (se previsti)
                  </Text>
                  {listingPhotos[1] ? (
                    <TouchableOpacity onPress={() => removePhoto(1)}>
                      <Ionicons name="close-circle" size={20} color="#ff4444" />
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.photoScattaInline}>Scatta</Text>
                  )}
                </TouchableOpacity>

                {/* Foto 3 - Pagine peggiori */}
                <TouchableOpacity 
                  style={[styles.photoReqItem, styles.photoReqItemClickable, listingPhotos[2] && styles.photoReqItemDone]}
                  onPress={() => !listingPhotos[2] && takePhotoAtIndex(2)}
                  disabled={!!listingPhotos[2]}
                >
                  <Ionicons 
                    name="camera" 
                    size={22} 
                    color={listingPhotos[2] ? "#4CAF50" : "#1a472a"} 
                  />
                  <Text style={[styles.photoReqText, { color: listingPhotos[2] ? '#4CAF50' : '#333', marginLeft: 10, flex: 1 }]}>
                    3. Foto delle pagine peggiori
                  </Text>
                  {listingPhotos[2] ? (
                    <TouchableOpacity onPress={() => removePhoto(2)}>
                      <Ionicons name="close-circle" size={20} color="#ff4444" />
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.photoScattaInline}>Scatta</Text>
                  )}
                </TouchableOpacity>
              </View>
              
              {/* Miniature foto scattate */}
              {listingPhotos.length > 0 && (
                <View style={styles.photosGrid}>
                  {listingPhotos.map((photo, index) => (
                    <View key={index} style={styles.photoItem}>
                      <Image
                        source={{ uri: `data:image/jpeg;base64,${photo}` }}
                        style={styles.photoThumbnail}
                      />
                      <View style={styles.photoLabel}>
                        <Text style={styles.photoLabelText}>
                          Foto {index + 1}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
              
              {/* Loading durante elaborazione foto */}
              {loadingPhoto && (
                <View style={{ alignItems: 'center', padding: 16 }}>
                  <ActivityIndicator size="small" color="#1a472a" />
                  <Text style={{ color: '#666', marginTop: 8, fontSize: 12 }}>Elaborazione foto...</Text>
                </View>
              )}
              
              {/* Pulsante Galleria */}
              {listingPhotos.length < 3 && !loadingPhoto && (
                <TouchableOpacity style={styles.galleryBtn} onPress={pickImage}>
                  <Ionicons name="images" size={20} color="#1a472a" />
                  <Text style={styles.galleryBtnText}>Scegli dalla Galleria</Text>
                </TouchableOpacity>
              )}
              
              {/* Info compressione */}
              <Text style={{ fontSize: 11, color: '#999', textAlign: 'center', marginTop: 8, marginBottom: 12 }}>
                Foto compresse e ruotate automaticamente
              </Text>

              {/* ========== SEZIONE STATO LIBRO ========== */}
              <View style={styles.conditionSectionHeader}>
                <Ionicons name="clipboard" size={20} color="#1a472a" />
                <Text style={styles.conditionSectionTitle}>Stato del Libro</Text>
              </View>
              <Text style={styles.conditionSectionSubtitle}>
                Indica le condizioni del libro per calcolare automaticamente il prezzo
              </Text>

              {/* NEW BOOK CHECKBOX */}
              <TouchableOpacity
                style={[
                  styles.newBookCard,
                  isNewBook && styles.newBookCardActive
                ]}
                onPress={() => setIsNewBook(!isNewBook)}
              >
                <View style={styles.newBookHeader}>
                  <Ionicons 
                    name={isNewBook ? "checkbox" : "square-outline"} 
                    size={26} 
                    color={isNewBook ? "#2196F3" : "#666"} 
                  />
                  <View style={styles.newBookInfo}>
                    <Text style={[styles.newBookTitle, isNewBook && styles.newBookTitleActive]}>
                      Libro Nuovo
                    </Text>
                    <Text style={styles.newBookSubtitle}>
                      Mai usato
                    </Text>
                  </View>
                </View>
                {isNewBook && (
                  <View style={styles.newBookBadge}>
                    <Text style={styles.newBookBadgeText}>93% del prezzo di copertina</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Disabled overlay message when book is new */}
              {isNewBook && (
                <View style={styles.disabledOverlayMessage}>
                  <Ionicons name="information-circle" size={20} color="#2196F3" />
                  <Text style={styles.disabledOverlayText}>
                    Il libro è nuovo, non è necessario indicare le condizioni
                  </Text>
                </View>
              )}

              {/* Detailed Conditions - disabled if new */}
              <View style={[isNewBook && styles.disabledSection]}>
                <Text style={[styles.formLabel, isNewBook && styles.disabledText]}>Condizioni del libro</Text>
                <Text style={styles.sliderHint}>Trascina gli slider: 0% = Perfetto, 100% = Molto rovinato</Text>
                
                {/* Slider Scritte */}
                <View style={styles.sliderContainer}>
                  <View style={styles.sliderHeader}>
                    <Ionicons name="pencil" size={18} color={isNewBook ? "#ccc" : "#666"} />
                    <Text style={[styles.sliderLabel, isNewBook && styles.disabledText]}>Scritte (penna/matita)</Text>
                    <Text style={[styles.sliderValue, { color: getGradientColor(hasWritings) }]}>
                      {hasWritings}%
                    </Text>
                  </View>
                  {/* Custom Gradient Track */}
                  <View style={styles.gradientSliderWrapper}>
                    <View style={styles.gradientTrackBackground} />
                    <View style={[styles.gradientTrackFill, { width: `${hasWritings}%`, backgroundColor: getGradientColor(hasWritings) }]} />
                    <Slider
                      style={styles.gradientSlider}
                      minimumValue={0}
                      maximumValue={100}
                      step={5}
                      value={hasWritings}
                      onValueChange={(val) => !isNewBook && setHasWritings(val)}
                      minimumTrackTintColor="transparent"
                      maximumTrackTintColor="transparent"
                      thumbTintColor={isNewBook ? "#ccc" : getGradientColor(hasWritings)}
                      disabled={isNewBook}
                    />
                  </View>
                </View>

                {/* Slider Evidenziature */}
                <View style={styles.sliderContainer}>
                  <View style={styles.sliderHeader}>
                    <Ionicons name="color-fill" size={18} color={isNewBook ? "#ccc" : "#666"} />
                    <Text style={[styles.sliderLabel, isNewBook && styles.disabledText]}>Evidenziature</Text>
                    <Text style={[styles.sliderValue, { color: getGradientColor(hasHighlights) }]}>
                      {hasHighlights}%
                    </Text>
                  </View>
                  {/* Custom Gradient Track */}
                  <View style={styles.gradientSliderWrapper}>
                    <View style={styles.gradientTrackBackground} />
                    <View style={[styles.gradientTrackFill, { width: `${hasHighlights}%`, backgroundColor: getGradientColor(hasHighlights) }]} />
                    <Slider
                      style={styles.gradientSlider}
                      minimumValue={0}
                      maximumValue={100}
                      step={5}
                      value={hasHighlights}
                      onValueChange={(val) => !isNewBook && setHasHighlights(val)}
                      minimumTrackTintColor="transparent"
                      maximumTrackTintColor="transparent"
                      thumbTintColor={isNewBook ? "#ccc" : getGradientColor(hasHighlights)}
                      disabled={isNewBook}
                    />
                  </View>
                </View>

                {/* Slider Pieghe/Orecchie */}
                <View style={styles.sliderContainer}>
                  <View style={styles.sliderHeader}>
                    <Ionicons name="document" size={18} color={isNewBook ? "#ccc" : "#666"} />
                    <Text style={[styles.sliderLabel, isNewBook && styles.disabledText]}>Orecchie/Pieghe</Text>
                    <Text style={[styles.sliderValue, { color: getGradientColor(hasFolds) }]}>
                      {hasFolds}%
                    </Text>
                  </View>
                  {/* Custom Gradient Track */}
                  <View style={styles.gradientSliderWrapper}>
                    <View style={styles.gradientTrackBackground} />
                    <View style={[styles.gradientTrackFill, { width: `${hasFolds}%`, backgroundColor: getGradientColor(hasFolds) }]} />
                    <Slider
                      style={styles.gradientSlider}
                      minimumValue={0}
                      maximumValue={100}
                      step={5}
                      value={hasFolds}
                      onValueChange={(val) => !isNewBook && setHasFolds(val)}
                      minimumTrackTintColor="transparent"
                      maximumTrackTintColor="transparent"
                      thumbTintColor={isNewBook ? "#ccc" : getGradientColor(hasFolds)}
                      disabled={isNewBook}
                    />
                  </View>
                </View>
              </View>

              {/* Notes - spostato dopo le condizioni */}
              <Text style={styles.formLabel}>Note/Descrizione (opzionale)</Text>
              <TextInput
                style={styles.notesInput}
                value={notes}
                onChangeText={setNotes}
                placeholder="Es: Alcune pagine sottolineate a matita..."
                placeholderTextColor="#b0b0b0"
                multiline
                numberOfLines={3}
              />

              {/* Condizione Calcolata Automaticamente */}
              <Text style={styles.formLabel}>Stato complessivo del libro</Text>
              <View style={styles.calculatedConditionContainer}>
                {(() => {
                  const { condition, score } = conditionResult;
                  const condConfig = {
                    'nuovo': { label: 'Nuovo', color: '#2196F3', icon: 'star' },
                    'ottimo': { label: 'Ottimo', color: '#4CAF50', icon: 'checkmark-circle' },
                    'buono': { label: 'Buono', color: '#FF9800', icon: 'thumbs-up' },
                    'accettabile': { label: 'Accettabile', color: '#FF5722', icon: 'alert-circle' },
                    'scarso': { label: 'Scarso', color: '#f44336', icon: 'warning' },
                  }[condition] || { label: 'Buono', color: '#FF9800', icon: 'thumbs-up' };
                  
                  return (
                    <View style={[styles.calculatedConditionBox, { borderColor: condConfig.color }]}>
                      <View style={[styles.trafficLight, { backgroundColor: condConfig.color }]}>
                        <Ionicons name={condConfig.icon as any} size={32} color="#fff" />
                      </View>
                      <View style={styles.calculatedConditionInfo}>
                        <Text style={[styles.calculatedConditionLabel, { color: condConfig.color }]}>
                          {condConfig.label}
                        </Text>
                        <Text style={styles.calculatedConditionHint}>
                          {isNewBook ? 'Libro nuovo' : `Usura del libro: ${Math.round(score)}%`}
                        </Text>
                      </View>
                    </View>
                  );
                })()}
              </View>

              {/* Price - Forbice di prezzi selezionabili */}
              <Text style={styles.formLabel}>Scegli il tuo prezzo</Text>
              <View style={styles.priceRangeContainer}>
                <View style={styles.priceOptionsContainer}>
                  {priceRange.prices.map((priceOpt, index) => {
                    return (
                      <TouchableOpacity
                        key={index}
                        style={[
                          styles.priceOptionButton,
                          selectedPriceOption === priceOpt.prezzoAcquirente && styles.priceOptionButtonSelected,
                          !isNewBook && index === 2 && styles.priceOptionButtonFast
                        ]}
                        onPress={() => setSelectedPriceOption(priceOpt.prezzoAcquirente)}
                      >
                        <View style={styles.priceOptionLeft}>
                          <Text style={[
                            styles.priceOptionLabel,
                            selectedPriceOption === priceOpt.prezzoAcquirente && styles.priceOptionLabelSelected
                          ]}>
                            {priceOpt.label}
                          </Text>
                          {!isNewBook && index === 2 && (
                            <View style={styles.fastSaleBadge}>
                              <Ionicons name="flash" size={10} color="#fff" />
                              <Text style={styles.fastSaleBadgeText}>Rapido</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.priceOptionRight}>
                          <Text style={[
                            styles.priceOptionValue,
                            selectedPriceOption === priceOpt.prezzoAcquirente && styles.priceOptionValueSelected
                          ]}>
                            Tu ricevi: €{priceOpt.guadagnoVenditore?.toFixed(2)}
                          </Text>
                          <Text style={styles.priceOptionBuyerCost}>
                            L'acquirente paga: €{priceOpt.prezzoAcquirente?.toFixed(2)}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              
              {selectedBook && selectedBook.prezzo_copertina && (
                <Text style={styles.originalPriceHint}>
                  Prezzo copertina: €{selectedBook.prezzo_copertina.toFixed(2)}
                </Text>
              )}

              {/* Bookshop Selection - Multi-select */}
              <Text style={styles.formLabel}>Punti di ritiro *</Text>
              <Text style={styles.bookshopHint}>Seleziona una o più cartolibrerie dove consegnerai il libro</Text>
              <View style={styles.bookshopOptions}>
                {bookshopsData.map((shop) => {
                  const isSelected = selectedBookshops.includes(shop.id);
                  return (
                    <TouchableOpacity
                      key={shop.id}
                      style={[
                        styles.bookshopCard,
                        isSelected && styles.bookshopCardActive
                      ]}
                      onPress={() => toggleBookshop(shop.id)}
                    >
                      <View style={styles.bookshopHeader}>
                        <Ionicons 
                          name={isSelected ? "checkbox" : "square-outline"} 
                          size={24} 
                          color={isSelected ? "#1a472a" : "#666"} 
                        />
                        <Text style={[
                          styles.bookshopName,
                          isSelected && styles.bookshopNameActive
                        ]}>
                          {shop.name}
                        </Text>
                      </View>
                      <View style={styles.bookshopDetails}>
                        <View style={styles.bookshopDetailRow}>
                          <Ionicons name="location-outline" size={14} color="#666" />
                          <Text style={styles.bookshopAddress}>{shop.address}</Text>
                        </View>
                        <View style={styles.bookshopDetailRow}>
                          <Ionicons name="call-outline" size={14} color="#666" />
                          <Text style={styles.bookshopPhone}>{shop.phone}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {selectedBookshops.length > 0 && (
                <Text style={styles.selectedBookshopsCount}>
                  {selectedBookshops.length} cartolibreri{selectedBookshops.length === 1 ? 'a' : 'e'} selezionat{selectedBookshops.length === 1 ? 'a' : 'e'}
                </Text>
              )}

              {/* Submit */}
              <TouchableOpacity
                style={[
                  styles.submitButton, 
                  creatingListing && styles.submitButtonDisabled
                ]}
                onPress={createListing}
                disabled={creatingListing}
              >
                {creatingListing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="pricetag" size={20} color="#fff" />
                    <Text style={styles.submitButtonText}>Pubblica Annuncio</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a472a',
    padding: 16,
    paddingTop: 60,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
  },
  listingCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  listingImage: {
    width: '100%',
    height: 150,
    backgroundColor: '#f0f0f0',
  },
  listingContent: {
    padding: 16,
  },
  listingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statoText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  listingPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  listingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  isbnText: {
    fontSize: 11,
    color: '#888',
    marginBottom: 8,
    fontFamily: 'monospace',
  },
  listingMeta: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  conditionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  conditionText: {
    fontSize: 12,
    fontWeight: '500',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  deleteButtonText: {
    color: '#ff4444',
    fontSize: 13,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  childOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    marginBottom: 12,
  },
  childOptionDisabled: {
    opacity: 0.5,
  },
  childOptionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  childOptionInfo: {
    flex: 1,
    marginLeft: 12,
  },
  childOptionName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  childOptionNameDisabled: {
    color: '#999',
  },
  childOptionSchool: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  childOptionHint: {
    fontSize: 11,
    color: '#2196F3',
    marginTop: 4,
    fontWeight: '500',
  },
  noChildrenContainer: {
    alignItems: 'center',
    padding: 24,
  },
  noChildrenText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginTop: 12,
  },
  goToProfileButton: {
    marginTop: 16,
    backgroundColor: '#1a472a',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  goToProfileButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  // Book picker
  bookOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    marginBottom: 12,
  },
  bookOptionInfo: {
    flex: 1,
  },
  bookOptionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  bookOptionAuthor: {
    fontSize: 12,
    color: '#666',
  },
  bookOptionPrice: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '500',
    marginTop: 4,
  },
  emptyBooks: {
    alignItems: 'center',
    padding: 40,
  },
  emptyBooksText: {
    fontSize: 16,
    color: '#666',
    marginTop: 12,
  },
  emptyBooksSubtext: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  // Form styles
  selectedBookInfo: {
    backgroundColor: '#e8f5e9',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  selectedBookHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  selectedBookTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a472a',
    flex: 1,
    marginRight: 10,
  },
  selectedBookPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2196F3',
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  selectedBookAuthor: {
    fontSize: 13,
    color: '#666',
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
    marginTop: 16,
  },
  // Photos
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  photoItem: {
    position: 'relative',
  },
  photoThumbnail: {
    width: 120,
    height: 68, // Aspect ratio 16:9 orizzontale
    borderRadius: 8,
  },
  removePhotoBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
  },
  addPhotoButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  addPhotoBtn: {
    width: 120,
    height: 68, // Aspect ratio 16:9 orizzontale
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ddd',
    borderStyle: 'dashed',
  },
  addPhotoBtnText: {
    fontSize: 10,
    color: '#1a472a',
    marginTop: 4,
  },
  photoHint: {
    fontSize: 11,
    color: '#999',
    marginTop: 6,
  },
  // Photo requirements
  photoRequirements: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  photoReqItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  photoReqItemDone: {
    opacity: 0.7,
  },
  photoReqItemOptional: {
    opacity: 0.8,
    borderLeftWidth: 2,
    borderLeftColor: '#2196F3',
    paddingLeft: 8,
    marginLeft: 8,
  },
  photoReqText: {
    fontSize: 13,
    color: '#333',
  },
  photoLabel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 2,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  photoLabelText: {
    fontSize: 9,
    color: '#fff',
    textAlign: 'center',
    fontWeight: '600',
  },
  photoWarning: {
    fontSize: 12,
    color: '#f44336',
    fontWeight: '500',
    marginTop: 8,
    textAlign: 'center',
  },
  // Traffic light
  trafficLightContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  trafficLightOption: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f8f9fa',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  trafficLight: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  trafficLightLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  // Calculated condition styles
  calculatedConditionContainer: {
    marginBottom: 8,
  },
  calculatedConditionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderWidth: 3,
  },
  calculatedConditionInfo: {
    marginLeft: 16,
    flex: 1,
  },
  calculatedConditionLabel: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  calculatedConditionHint: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  // Calculated price styles
  calculatedPriceContainer: {
    marginBottom: 8,
  },
  calculatedPriceBox: {
    backgroundColor: '#e8f5e9',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1a472a',
  },
  calculatedPriceLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  calculatedPriceValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  calculatedPricePercentage: {
    fontSize: 13,
    color: '#4CAF50',
    marginTop: 4,
    fontWeight: '500',
  },
  originalPriceHint: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  // Slider styles
  sliderHint: {
    fontSize: 12,
    color: '#888',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  sliderContainer: {
    marginBottom: 16,
    backgroundColor: '#f8f9fa',
    padding: 14,
    borderRadius: 10,
  },
  sliderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  sliderLabel: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  sliderValue: {
    fontSize: 14,
    fontWeight: 'bold',
    minWidth: 40,
    textAlign: 'right',
  },
  slider: {
    width: '100%',
    height: 50,
  },
  // Gradient Slider styles - PIÙ GRANDI
  gradientSliderWrapper: {
    position: 'relative',
    height: 50,
    justifyContent: 'center',
  },
  gradientTrackBackground: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 18,
    backgroundColor: '#e0e0e0',
    borderRadius: 9,
  },
  gradientTrackFill: {
    position: 'absolute',
    left: 0,
    height: 18,
    borderRadius: 9,
    minWidth: 18,
  },
  gradientSlider: {
    position: 'absolute',
    width: '100%',
    height: 50,
    zIndex: 10,
  },
  // Pulsante Scatta inline
  photoScattaBtn: {
    backgroundColor: '#1a472a',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
  },
  photoScattaBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  // Foto indipendenti - clickable row
  photoReqItemClickable: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  photoScattaInline: {
    color: '#1a472a',
    fontSize: 13,
    fontWeight: '600',
  },
  // Pulsante Galleria grande
  galleryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f4f0',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1a472a',
    borderStyle: 'dashed',
    gap: 8,
  },
  galleryBtnText: {
    color: '#1a472a',
    fontSize: 14,
    fontWeight: '600',
  },
  // Price Range styles
  priceRangeContainer: {
    backgroundColor: '#f8f9fa',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  priceRangeTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a472a',
    textAlign: 'center',
    marginBottom: 4,
  },
  priceRangeSubtitle: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  priceOptionsContainer: {
    gap: 10,
  },
  priceOptionButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceOptionButtonSelected: {
    borderColor: '#4CAF50',
    backgroundColor: '#e8f5e9',
  },
  priceOptionButtonFast: {
    borderColor: '#FF9800',
  },
  priceOptionLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  priceOptionRight: {
    alignItems: 'flex-end',
  },
  priceOptionLabel: {
    fontSize: 13,
    color: '#666',
  },
  priceOptionLabelSelected: {
    color: '#1a472a',
    fontWeight: '600',
  },
  priceOptionValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  priceOptionValueSelected: {
    color: '#4CAF50',
  },
  priceOptionBuyerCost: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
  priceOptionPercentage: {
    fontSize: 12,
    color: '#999',
  },
  priceOptionPercentageSelected: {
    color: '#4CAF50',
  },
  fastSaleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF9800',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 3,
  },
  fastSaleBadgeText: {
    fontSize: 9,
    color: '#fff',
    fontWeight: '600',
  },
  selectedPriceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    padding: 10,
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    justifyContent: 'center',
  },
  selectedPriceText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
  },
  // Commission breakdown summary
  selectedPriceSummary: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
  },
  commissionBreakdown: {
    gap: 8,
  },
  commissionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  commissionLabel: {
    fontSize: 13,
    color: '#666',
  },
  commissionValue: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  commissionTotal: {
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    paddingTop: 10,
    marginTop: 6,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
  },
  totalValueGreen: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4CAF50',
  },
  totalValueBlue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2196F3',
  },
  // Simplified summary
  summaryFinal: {
    gap: 8,
  },
  summaryFinalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryFinalLabel: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  summaryFinalGreen: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4CAF50',
  },
  summaryFinalBlue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2196F3',
  },
  // Condition section header
  conditionSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 24,
    marginBottom: 4,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  conditionSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  conditionSectionSubtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 16,
  },
  // New Book Card
  newBookCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  newBookCardActive: {
    backgroundColor: '#e3f2fd',
    borderColor: '#2196F3',
  },
  newBookHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  newBookInfo: {
    flex: 1,
  },
  newBookTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  newBookTitleActive: {
    color: '#2196F3',
  },
  newBookSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  newBookBadge: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: 'flex-start',
    marginTop: 12,
    marginLeft: 38,
  },
  newBookBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  // Disabled overlay for used book conditions
  disabledOverlayMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  disabledOverlayText: {
    fontSize: 13,
    color: '#2196F3',
    flex: 1,
  },
  disabledSection: {
    opacity: 0.5,
  },
  disabledText: {
    color: '#999',
  },
  optionChipDisabled: {
    backgroundColor: '#f0f0f0',
    borderColor: '#ddd',
  },
  // Details
  detailsContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  detailInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  detailLabel: {
    fontSize: 14,
    color: '#333',
  },
  // Options
  optionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  optionChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  optionChipActive: {
    backgroundColor: '#e8f5e9',
    borderWidth: 1,
    borderColor: '#1a472a',
  },
  optionChipText: {
    fontSize: 13,
    color: '#666',
  },
  optionChipTextActive: {
    color: '#1a472a',
    fontWeight: '600',
  },
  // Bookshop - Multi-select cards
  bookshopOptions: {
    gap: 12,
    marginBottom: 8,
  },
  bookshopCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 14,
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  bookshopCardActive: {
    backgroundColor: '#e8f5e9',
    borderColor: '#1a472a',
  },
  bookshopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  bookshopName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  bookshopNameActive: {
    color: '#1a472a',
  },
  bookshopDetails: {
    marginLeft: 34,
    gap: 4,
  },
  bookshopDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bookshopAddress: {
    fontSize: 12,
    color: '#666',
    flex: 1,
  },
  bookshopPhone: {
    fontSize: 12,
    color: '#666',
  },
  bookshopHint: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
  },
  selectedBookshopsCount: {
    fontSize: 13,
    color: '#1a472a',
    fontWeight: '500',
    marginTop: 4,
    marginBottom: 8,
  },
  bookshopOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    gap: 10,
  },
  bookshopOptionActive: {
    backgroundColor: '#e8f5e9',
  },
  bookshopOptionText: {
    fontSize: 14,
    color: '#666',
  },
  bookshopOptionTextActive: {
    color: '#1a472a',
    fontWeight: '500',
  },
  // Price
  priceInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  euroSign: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  priceInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    padding: 16,
  },
  priceSuggestion: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
  },
  // Notes
  notesInput: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  // Submit
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a472a',
    padding: 16,
    borderRadius: 12,
    marginTop: 24,
    marginBottom: 24,
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Divider for "oppure"
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    marginTop: 24,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#e0e0e0',
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 13,
    color: '#999',
  },
  // "Vendi altro libro" button
  otherBookButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FF9800',
    borderStyle: 'dashed',
  },
  // ISBN Search Modal styles
  isbnInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  isbnInput: {
    flex: 1,
    fontSize: 18,
    color: '#333',
    paddingVertical: 14,
    letterSpacing: 1,
  },
  isbnErrorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    gap: 8,
  },
  isbnErrorText: {
    flex: 1,
    fontSize: 14,
    color: '#f44336',
    fontWeight: '500',
  },
  isbnHint: {
    fontSize: 13,
    color: '#999',
    marginTop: 12,
    textAlign: 'center',
  },
  searchISBNButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a472a',
    padding: 16,
    borderRadius: 12,
    marginTop: 24,
    gap: 8,
  },
  searchISBNButtonDisabled: {
    opacity: 0.7,
  },
  searchISBNButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Modal overlay with pressable background
  modalOverlayPress: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  // Scan barcode button styles
  scanBarcodeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  scanBarcodeIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#1a472a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanBarcodeInfo: {
    flex: 1,
    marginLeft: 12,
  },
  scanBarcodeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a472a',
  },
  scanBarcodeSubtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  // Barcode Scanner Modal styles
  scannerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  scannerHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 10,
  },
  scannerCloseButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    marginRight: 44,
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerFrame: {
    width: 280,
    height: 150,
    borderWidth: 3,
    borderColor: '#4CAF50',
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  scannerFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 60,
    paddingTop: 20,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
  },
  scannerHint: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
  },
  scanAgainButton: {
    marginTop: 16,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  scanAgainText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Web Scanner Loading Overlay
  scannerLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
