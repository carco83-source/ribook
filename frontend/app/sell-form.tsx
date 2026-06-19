import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  TextInput,
  ScrollView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import Slider from '@react-native-community/slider';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';

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

// Bookshops data
const bookshopsData = [
  { 
    id: 'lapostrofo', 
    name: "Cartolibreria L'Apostrofo", 
    address: 'Via Genova 24, Viale Crotone 138, 88100 Catanzaro',
  },
  { 
    id: 'palaia', 
    name: 'Cartolibreria Palaia Luigi', 
    address: 'Via Santa Maria 1, 88100 Catanzaro',
  },
  { 
    id: 'aemme77', 
    name: 'AEMME 77 di Ruoppolo Francesco', 
    address: 'Viale Tommaso Campanella 68, 88100 Catanzaro',
  },
  { 
    id: 'nica', 
    name: 'Cartolibreria NiCa', 
    address: 'Viale Magna Grecia 179, 88100 Catanzaro',
  },
];

export default function SellFormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ isbn?: string; titolo?: string; prezzo?: string; listingId?: string }>();
  
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  
  // Modalità modifica
  const isEditMode = !!params.listingId;
  const [existingListingId, setExistingListingId] = useState<string | null>(params.listingId || null);
  
  // Form fields - Condizioni (0=Nessuna, 1=Poche, 2=Diverse, 3=Molte)
  const [scrittePenna, setScrittePenna] = useState(0);
  const [scritteMatita, setScritteMatita] = useState(0);
  const [pagineEvidenziate, setPagineEvidenziate] = useState(0);
  const [condGenerale, setCondGenerale] = useState(0);
  const [eserciziPenna, setEserciziPenna] = useState(false);
  const [eserciziMatita, setEserciziMatita] = useState(false);
  const [eserciziQuantita, setEserciziQuantita] = useState(0); // 0=Nessuno, 1=Pochi, 2=Diversi, 3=Molti
  const [isNewBook, setIsNewBook] = useState(false);
  
  // Colori pallini
  const CONDITION_COLORS = ['#4CAF50', '#FFC107', '#FF9800', '#f44336']; // Verde, Giallo, Arancio, Rosso
  const CONDITION_LABELS = ['Nessuna', 'Poche', 'Diverse', 'Molte'];
  const CONDITION_LABELS_MASC = ['Nessuno', 'Pochi', 'Diversi', 'Molti'];
  
  // Photos
  const [listingPhotos, setListingPhotos] = useState<string[]>([]);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [autoCoverUrl, setAutoCoverUrl] = useState<string | null>(null);
  const [loadingCover, setLoadingCover] = useState(false);
  
  // Bookshops & Price
  const [selectedBookshops, setSelectedBookshops] = useState<string[]>([]);
  const [selectedPriceOption, setSelectedPriceOption] = useState<number | null>(null);
  const [customPrice, setCustomPrice] = useState<string>(''); // Prezzo personalizzato
  const [useCustomPrice, setUseCustomPrice] = useState(false); // Flag per usare prezzo personalizzato
  const [notes, setNotes] = useState('');
  const [creatingListing, setCreatingListing] = useState(false);
  const [foderare, setFoderare] = useState(false);
  const [originalPrice, setOriginalPrice] = useState<number | null>(null); // Prezzo originale per modalità modifica

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      if (!storedUserId) {
        router.replace('/');
        return;
      }
      setUserId(storedUserId);

      // MODALITÀ MODIFICA: Carica i dati dell'annuncio esistente
      if (params.listingId) {
        try {
          const response = await axios.get(`${API_URL}/api/listings/${params.listingId}`);
          if (response.data) {
            const listing = response.data;
            
            // Imposta i dati del libro
            setSelectedBook({
              id: listing.book_isbn || listing.isbn,
              isbn: listing.book_isbn || listing.isbn,
              titolo: listing.book_titolo || listing.titolo,
              autori: listing.book_autori,
              disciplina: listing.book_disciplina,
              prezzo_copertina: listing.prezzo_copertina || listing.book_prezzo,
              editore: listing.book_editore,
            });
            setAutoCoverUrl(`https://www.ibs.it/images/${listing.book_isbn || listing.isbn}_0_0_0_536_0.jpg`);
            
            // Imposta le condizioni salvate da condition_details
            if (listing.condition_details) {
              // Converti le percentuali (0-100) in indici (0-3)
              const pennaPercent = listing.condition_details.penna || 0;
              const matitaPercent = listing.condition_details.matita || 0;
              const evidenziatorePercent = listing.condition_details.evidenziatore || 0;
              const usuraPercent = listing.condition_details.usura_libro || 0;
              
              // Mappa percentuali -> indici (0=0%, 1=33%, 2=66%, 3=100%)
              const percentToIndex = (p: number) => {
                if (p <= 10) return 0;
                if (p <= 40) return 1;
                if (p <= 70) return 2;
                return 3;
              };
              
              setScrittePenna(percentToIndex(pennaPercent));
              setScritteMatita(percentToIndex(matitaPercent));
              setPagineEvidenziate(percentToIndex(evidenziatorePercent));
              setCondGenerale(percentToIndex(usuraPercent));
            } else if (listing.condizioni) {
              // Fallback per vecchio formato
              setScrittePenna(listing.condizioni.scritte_penna || 0);
              setScritteMatita(listing.condizioni.scritte_matita || 0);
              setPagineEvidenziate(listing.condizioni.pagine_evidenziate || 0);
              setCondGenerale(listing.condizioni.usura_pagine || 0);
            }
            
            // Salva il prezzo originale per selezionare l'opzione corretta dopo il calcolo
            if (listing.prezzo_vendita) {
              setOriginalPrice(listing.prezzo_vendita);
            }
            
            // Imposta se è nuovo
            setIsNewBook(listing.is_new || false);
            
            // Imposta le foto
            if (listing.foto_base64) {
              setListingPhotos([listing.foto_base64]);
            }
            if (listing.foto_aggiuntive && Array.isArray(listing.foto_aggiuntive)) {
              setListingPhotos(prev => [...prev, ...listing.foto_aggiuntive]);
            }
            
            // Imposta i punti di scambio
            if (listing.punti_scambio && Array.isArray(listing.punti_scambio)) {
              setSelectedBookshops(listing.punti_scambio);
            }
            
            // Imposta il prezzo - cerca quale opzione è selezionata
            // Il selectedPriceOption sarà impostato quando calcoliamo i prezzi
            
            // Imposta le note
            if (listing.note) {
              setNotes(listing.note);
            }
            
            setExistingListingId(listing.id);
          }
        } catch (error) {
          console.error('Error loading listing for edit:', error);
          Alert.alert('Errore', 'Impossibile caricare i dati dell\'annuncio');
          router.back();
          return;
        }
      }
      // Se c'è un ISBN nei params, imposta subito il libro con i dati disponibili
      else if (params.isbn) {
        // Prima imposta il libro con i dati dai params (fallback sicuro)
        const fallbackBook = {
          id: params.isbn,
          isbn: params.isbn,
          titolo: params.titolo ? decodeURIComponent(params.titolo) : 'Libro',
          prezzo_copertina: parseFloat(params.prezzo || '0'),
        };
        setSelectedBook(fallbackBook);
        setAutoCoverUrl(`https://www.ibs.it/images/${params.isbn}_0_0_0_536_0.jpg`);
        
        // Poi prova a cercare più dettagli dal backend
        try {
          // Usa l'endpoint corretto /books/search/{isbn}
          const response = await axios.get(`${API_URL}/api/books/search/${params.isbn}`);
          if (response.data) {
            const book = response.data;
            setSelectedBook({
              id: book.id || params.isbn,
              isbn: book.isbn || params.isbn,
              titolo: book.titolo || fallbackBook.titolo,
              autori: book.autori,
              disciplina: book.disciplina,
              prezzo_copertina: book.prezzo_copertina || fallbackBook.prezzo_copertina,
              editore: book.editore,
            });
          }
        } catch (searchError) {
          // Se la ricerca fallisce, prova con l'endpoint generico
          try {
            const genericResponse = await axios.get(`${API_URL}/api/books/search`, {
              params: { q: params.isbn }
            });
            if (genericResponse.data?.books && genericResponse.data.books.length > 0) {
              const book = genericResponse.data.books[0];
              setSelectedBook({
                id: book.id || params.isbn,
                isbn: book.isbn || params.isbn,
                titolo: book.titolo || fallbackBook.titolo,
                autori: book.autori,
                disciplina: book.disciplina,
                prezzo_copertina: book.prezzo_copertina || fallbackBook.prezzo_copertina,
                editore: book.editore,
              });
            }
          } catch (e) {
            // Usiamo i dati dai params già impostati
            console.log('Book search failed, using params data');
          }
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
      // Se c'è un errore ma abbiamo i params, imposta comunque il libro
      if (params.isbn) {
        setSelectedBook({
          id: params.isbn,
          isbn: params.isbn,
          titolo: params.titolo ? decodeURIComponent(params.titolo) : 'Libro',
          prezzo_copertina: parseFloat(params.prezzo || '0'),
        });
        setAutoCoverUrl(`https://www.ibs.it/images/${params.isbn}_0_0_0_536_0.jpg`);
      }
    } finally {
      setLoading(false);
    }
  };

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  // Calcola colore gradiente
  const getGradientColor = (value: number): string => {
    if (value <= 50) {
      const ratio = value / 50;
      const r = Math.round(76 + (255 - 76) * ratio);
      const g = Math.round(175 + (193 - 175) * ratio);
      const b = Math.round(80 - 80 * ratio);
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      const ratio = (value - 50) / 50;
      const r = 255;
      const g = Math.round(193 - 193 * ratio);
      const b = 0;
      return `rgb(${r}, ${g}, ${b})`;
    }
  };

  // Calcolo prezzo - Range 30% - 70% del prezzo nuovo
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
    
    if (isNewBook) {
      const prezzoAcquirente = prezzoNuovo * 0.93;
      const commissionePiattaforma = 0.17;
      const stripeFisso = 0.25;
      const guadagnoVenditore = prezzoAcquirente * (1 - commissionePiattaforma) - stripeFisso;
      
      return {
        usura: 0,
        prezzoAcquirente: Math.round(prezzoAcquirente * 100) / 100,
        guadagnoUtente: Math.round(guadagnoVenditore * 100) / 100,
        condition: 'nuovo'
      };
    }
    
    // Pesi per ogni condizione:
    // - Scritte a penna: peso maggiore (0.40)
    // - Pagine evidenziate: peso medio (0.25)
    // - Scritte a matita: peso minore (0.15)
    // - Condizione generale: peso (0.20)
    // Ogni valore va da 0 a 3
    
    // Calcolo punteggio usura (0-100)
    // Il PRIMO salto (Nessuna → Poche) è il più grande
    // I salti successivi (Poche → Diverse → Molte) sono più piccoli
    // Ordine incidenza: Penna > Evidenziate > Matita > Usura
    
    let usuraScore = 0;
    
    // Scritte a penna: MASSIMA incidenza
    // Nessuna=0, Poche=25 (GRANDE salto!), Diverse=35, Molte=45
    const pesoPenna = [0, 25, 35, 45];
    usuraScore += pesoPenna[scrittePenna];
    
    // Pagine evidenziate: MEDIA incidenza  
    // Nessuna=0, Poche=15 (grande salto), Diverse=20, Molte=25
    const pesoEvidenziate = [0, 15, 20, 25];
    usuraScore += pesoEvidenziate[pagineEvidenziate];
    
    // Scritte a matita: LEGGERA incidenza
    // Nessuna=0, Poche=8 (salto), Diverse=11, Molte=14
    const pesoMatita = [0, 8, 11, 14];
    usuraScore += pesoMatita[scritteMatita];
    
    // Usura pagine: MINIMA incidenza
    // Nessuna=0, Poche=4 (salto), Diverse=6, Molte=8
    const pesoUsura = [0, 4, 6, 8];
    usuraScore += pesoUsura[condGenerale];
    
    // "Con esercizi svolti" come aggravante aggiuntiva
    if (eserciziPenna) {
      usuraScore += 6; // Esercizi a penna: incidenza maggiore
    }
    if (eserciziMatita) {
      usuraScore += 3; // Esercizi a matita: incidenza minore
    }
    
    // Cap a 100 (max teorico: 45+25+14+8+6+3 = 101)
    usuraScore = Math.min(100, usuraScore);
    
    // Range prezzo: 30% (usura 100) - 70% (usura 0) del nuovo
    // Formula: percentuale = 70% - (usura/100 * 40%)
    const percentualePrezzo = 0.70 - (usuraScore / 100) * 0.40;
    
    let prezzoUsato = prezzoNuovo * percentualePrezzo;
    
    // Assicura che sia nel range 30%-70%
    prezzoUsato = Math.max(prezzoUsato, prezzoNuovo * 0.30);
    prezzoUsato = Math.min(prezzoUsato, prezzoNuovo * 0.70);
    
    const commissionePiattaforma = 0.17;
    const stripeFisso = 0.25;
    
    const prezzoAlto = Math.min(prezzoUsato * 1.08, prezzoNuovo * 0.70);
    const prezzoMedio = prezzoUsato;
    const prezzoBasso = Math.max(prezzoUsato * 0.92, prezzoNuovo * 0.30);
    
    let condition = 'buono';
    if (usuraScore <= 15) condition = 'ottimo';
    else if (usuraScore <= 40) condition = 'buono';
    else if (usuraScore <= 70) condition = 'accettabile';
    else condition = 'scarso';
    
    return {
      usura: Math.round(usuraScore * 10) / 10,
      prezzoAlto: Math.round(prezzoAlto * 100) / 100,
      prezzoMedio: Math.round(prezzoMedio * 100) / 100,
      prezzoBasso: Math.round(prezzoBasso * 100) / 100,
      guadagnoAlto: Math.round((prezzoAlto * (1 - commissionePiattaforma) - stripeFisso) * 100) / 100,
      guadagnoMedio: Math.round((prezzoMedio * (1 - commissionePiattaforma) - stripeFisso) * 100) / 100,
      guadagnoBasso: Math.round((prezzoBasso * (1 - commissionePiattaforma) - stripeFisso) * 100) / 100,
      condition
    };
  };

  const calculatePriceRange = () => {
    const prezzoCalcolato = calcolaPrezzoLibro();
    
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
    
    // Assicura sempre 3 prezzi distinti
    let prezzoAlto = prezzoCalcolato.prezzoAlto;
    let prezzoMedio = prezzoCalcolato.prezzoMedio;
    let prezzoBasso = prezzoCalcolato.prezzoBasso;
    let guadagnoAlto = prezzoCalcolato.guadagnoAlto;
    let guadagnoMedio = prezzoCalcolato.guadagnoMedio;
    let guadagnoBasso = prezzoCalcolato.guadagnoBasso;
    
    // Se prezzoAlto e prezzoMedio sono troppo vicini (diff < 0.50€), crea la media
    const diffAltoMedio = prezzoAlto - prezzoMedio;
    const diffMedioBasso = prezzoMedio - prezzoBasso;
    
    // Se i prezzi sono troppo simili, redistribuisci per avere 3 prezzi distinti
    if (diffAltoMedio < 0.50 || diffMedioBasso < 0.50) {
      // Usa prezzoAlto e prezzoBasso come estremi, calcola la media
      const commissionePiattaforma = 0.17;
      const stripeFisso = 0.25;
      
      prezzoMedio = (prezzoAlto + prezzoBasso) / 2;
      prezzoMedio = Math.round(prezzoMedio * 100) / 100;
      guadagnoMedio = Math.round((prezzoMedio * (1 - commissionePiattaforma) - stripeFisso) * 100) / 100;
    }
    
    return {
      condition: prezzoCalcolato.condition,
      usura: prezzoCalcolato.usura,
      isNew: false,
      prices: [
        { 
          label: 'Prezzo alto', 
          prezzoAcquirente: prezzoAlto,
          guadagnoVenditore: guadagnoAlto
        },
        { 
          label: 'Prezzo consigliato', 
          prezzoAcquirente: prezzoMedio,
          guadagnoVenditore: guadagnoMedio
        },
        { 
          label: 'Vendita rapida', 
          prezzoAcquirente: prezzoBasso,
          guadagnoVenditore: guadagnoBasso
        },
      ]
    };
  };

  const priceRange = calculatePriceRange();

  // Auto-seleziona prezzo: in modalità modifica usa il prezzo originale, altrimenti prezzo consigliato
  useEffect(() => {
    if (selectedBook && selectedPriceOption === null) {
      // In modalità modifica, cerca il prezzo più vicino a quello originale
      if (isEditMode && originalPrice !== null) {
        // Trova l'opzione di prezzo più vicina al prezzo originale
        const prices = priceRange.prices.map(p => p.prezzoAcquirente);
        let closestPrice = prices[0];
        let minDiff = Math.abs(prices[0] - originalPrice);
        
        for (const price of prices) {
          const diff = Math.abs(price - originalPrice);
          if (diff < minDiff) {
            minDiff = diff;
            closestPrice = price;
          }
        }
        setSelectedPriceOption(closestPrice);
      } else {
        // Nuovo annuncio: seleziona prezzo consigliato
        const defaultPriceIndex = isNewBook ? 0 : 1;
        const defaultPrice = priceRange.prices[defaultPriceIndex]?.prezzoAcquirente || priceRange.prices[0]?.prezzoAcquirente;
        if (defaultPrice) {
          setSelectedPriceOption(defaultPrice);
        }
      }
    }
  }, [selectedBook, isNewBook, originalPrice]);

  const toggleBookshop = (shopId: string) => {
    setSelectedBookshops(prev => {
      if (prev.includes(shopId)) {
        return prev.filter(id => id !== shopId);
      } else {
        return [...prev, shopId];
      }
    });
  };

  // Photo handling
  const compressImage = async (uri: string): Promise<string | null> => {
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1280 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      return manipulated.base64 || null;
    } catch (error) {
      console.error('Error compressing:', error);
      return null;
    }
  };

  const takePhotoAtIndex = async (index: number) => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showAlert('Permesso negato', 'Serve il permesso per usare la fotocamera');
      return;
    }

    setLoadingPhoto(true);
    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0].uri) {
        const compressedBase64 = await compressImage(result.assets[0].uri);
        if (compressedBase64) {
          const newPhotos = [...listingPhotos];
          while (newPhotos.length < index) {
            newPhotos.push('');
          }
          if (newPhotos.length === index) {
            newPhotos.push(compressedBase64);
          } else {
            newPhotos[index] = compressedBase64;
          }
          setListingPhotos(newPhotos.filter(p => p !== ''));
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
    if (!selectedBook || !userId) return;

    // Validazione foto copertina obbligatoria
    if (!listingPhotos[0]) {
      showAlert('Foto richiesta', 'La foto della copertina è obbligatoria');
      return;
    }

    if (selectedPriceOption === null) {
      showAlert('Prezzo richiesto', 'Seleziona un prezzo dalla forbice o inserisci un prezzo personalizzato');
      return;
    }

    if (selectedBookshops.length === 0) {
      showAlert('Punto di scambio richiesto', 'Seleziona almeno una cartolibreria');
      return;
    }

    setCreatingListing(true);
    try {
      const selectedShopsDetails = bookshopsData.filter(b => selectedBookshops.includes(b.id));
      
      // Converti i nuovi valori (0-3) in percentuali (0-100) per compatibilità backend
      const conditionDetails = {
        penna: (scrittePenna / 3) * 100,
        matita: (scritteMatita / 3) * 100,
        evidenziatore: (pagineEvidenziate / 3) * 100,
        usura_libro: (condGenerale / 3) * 100,
        esercizi_penna: eserciziPenna,
        esercizi_matita: eserciziMatita,
        esercizi_quantita: eserciziQuantita,
      };
      
      const currentPriceCalc = calcolaPrezzoLibro();
      const guadagnoUtente = selectedPriceOption * 0.83 - 0.25;
      
      await axios.post(`${API_URL}/api/listings?user_id=${userId}`, {
        book_id: selectedBook.isbn || selectedBook.id,
        book_isbn: selectedBook.isbn,
        book_titolo: selectedBook.titolo,
        book_autori: selectedBook.autori,
        book_disciplina: selectedBook.disciplina,
        prezzo_copertina: selectedBook.prezzo_copertina,
        condizione: currentPriceCalc.condition,
        prezzo_vendita: selectedPriceOption,
        foto_base64: listingPhotos.length > 0 ? listingPhotos[0] : null,
        foto_aggiuntive: listingPhotos.slice(1),
        cover_url: autoCoverUrl,
        condition_details: conditionDetails,
        bookstore_ids: selectedBookshops,
        bookstore_names: selectedShopsDetails.map(s => s.name),
        bookstore_addresses: selectedShopsDetails.map(s => s.address),
        notes: notes,
        is_new_book: isNewBook,
        usura: currentPriceCalc.usura || 0,
        guadagno_utente: guadagnoUtente,
        foderare: foderare,
      });

      showAlert('Successo!', 'Annuncio creato con successo');
      router.back();
    } catch (error: any) {
      console.log('Create listing error:', error.response?.data || error.message);
      showAlert('Errore', error.response?.data?.detail || 'Impossibile creare annuncio');
    } finally {
      setCreatingListing(false);
    }
  };

  // Funzione per aggiornare un annuncio esistente
  const updateListing = async () => {
    if (!selectedBook || !userId || !existingListingId) return;

    // Validazione foto copertina obbligatoria
    if (!listingPhotos[0]) {
      showAlert('Foto richiesta', 'La foto della copertina è obbligatoria');
      return;
    }

    if (selectedPriceOption === null) {
      showAlert('Prezzo richiesto', 'Seleziona un prezzo dalla forbice o inserisci un prezzo personalizzato');
      return;
    }

    if (selectedBookshops.length === 0) {
      showAlert('Punto di scambio richiesto', 'Seleziona almeno una cartolibreria');
      return;
    }

    setCreatingListing(true);
    try {
      const selectedShopsDetails = bookshopsData.filter(b => selectedBookshops.includes(b.id));
      
      // Converti i nuovi valori (0-3) in percentuali (0-100) per compatibilità backend
      const conditionDetails = {
        penna: (scrittePenna / 3) * 100,
        matita: (scritteMatita / 3) * 100,
        evidenziatore: (pagineEvidenziate / 3) * 100,
        usura_libro: (condGenerale / 3) * 100,
        esercizi_penna: eserciziPenna,
        esercizi_matita: eserciziMatita,
        esercizi_quantita: eserciziQuantita,
      };
      
      const currentPriceCalc = calcolaPrezzoLibro();
      const guadagnoUtente = selectedPriceOption * 0.83 - 0.25;
      
      await axios.put(`${API_URL}/api/listings/${existingListingId}`, {
        seller_id: userId,
        book_id: selectedBook.isbn || selectedBook.id,
        book_isbn: selectedBook.isbn,
        book_titolo: selectedBook.titolo,
        book_autori: selectedBook.autori,
        book_disciplina: selectedBook.disciplina,
        prezzo_copertina: selectedBook.prezzo_copertina,
        condizione: currentPriceCalc.condition,
        prezzo_vendita: selectedPriceOption,
        foto_base64: listingPhotos.length > 0 ? listingPhotos[0] : null,
        foto_aggiuntive: listingPhotos.slice(1),
        cover_url: autoCoverUrl,
        condition_details: conditionDetails,
        bookstore_ids: selectedBookshops,
        bookstore_names: selectedShopsDetails.map(s => s.name),
        bookstore_addresses: selectedShopsDetails.map(s => s.address),
        notes: notes,
        note: notes,
        is_new_book: isNewBook,
        usura: currentPriceCalc.usura || 0,
        guadagno_utente: guadagnoUtente,
        foderare: foderare,
      });

      showAlert('Successo!', 'Annuncio modificato con successo');
      router.back();
    } catch (error: any) {
      console.log('Update listing error:', error.response?.data || error.message);
      showAlert('Errore', error.response?.data?.detail || 'Impossibile modificare annuncio');
    } finally {
      setCreatingListing(false);
    }
  };

  const getConditionLabel = (condition: string) => {
    switch (condition) {
      case 'nuovo': return 'Nuovo';
      case 'ottimo': return 'Ottimo';
      case 'buono': return 'Buono';
      case 'accettabile': return 'Accettabile';
      case 'scarso': return 'Scarso';
      default: return condition;
    }
  };

  const getConditionColor = (condition: string) => {
    switch (condition) {
      case 'nuovo': return '#2196F3';
      case 'ottimo': return '#4CAF50';
      case 'buono': return '#FF9800';
      case 'accettabile': return '#f44336';
      case 'scarso': return '#9e9e9e';
      default: return '#666';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a472a" />
      </View>
    );
  }

  if (!selectedBook) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="book-outline" size={64} color="#ccc" />
        <Text style={styles.emptyText}>Nessun libro selezionato</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Torna indietro</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{ 
          title: isEditMode ? 'Modifica annuncio' : 'Vendi libro',
          headerStyle: { backgroundColor: '#1a472a' },
          headerTintColor: '#fff',
        }} 
      />

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Book Info */}
        <View style={styles.bookInfoCard}>
          {autoCoverUrl && (
            <Image source={{ uri: autoCoverUrl }} style={styles.bookCover} resizeMode="contain" />
          )}
          <View style={styles.bookDetails}>
            <Text style={styles.bookTitle}>{selectedBook.titolo}</Text>
            {selectedBook.disciplina && <Text style={styles.bookDiscipline}>{selectedBook.disciplina}</Text>}
            <Text style={styles.bookIsbn}>ISBN: {selectedBook.isbn}</Text>
            {selectedBook.prezzo_copertina && (
              <View style={styles.bookPriceRow}>
                <Text style={styles.bookPriceLabel}>Prezzo copertina: </Text>
                <Text style={styles.bookPriceValue}>€{parseFloat(selectedBook.prezzo_copertina || 0).toFixed(2)}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Nota fascicoli */}
        <View style={styles.fascicoliNote}>
          <Ionicons name="information-circle-outline" size={18} color="#666" />
          <Text style={styles.fascicoliNoteText}>
            Il libro si intende comprensivo di fascicoli, se previsti.
          </Text>
        </View>

        {/* Libro Nuovo Checkbox */}
        <View style={styles.section}>
          <TouchableOpacity 
            style={[styles.newBookToggle, isNewBook && styles.newBookToggleActive]}
            onPress={() => setIsNewBook(!isNewBook)}
          >
            <Ionicons 
              name={isNewBook ? "checkbox" : "square-outline"} 
              size={24} 
              color={isNewBook ? "#2196F3" : "#666"} 
            />
            <Text style={[styles.newBookText, isNewBook && styles.newBookTextActive]}>
              Il libro è NUOVO (mai usato)
            </Text>
          </TouchableOpacity>
        </View>

        {/* Condizioni (solo se usato) */}
        {!isNewBook && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Condizioni del libro</Text>
            
            {/* Scritte a penna */}
            <Text style={styles.conditionCategoryLabelBold}>SCRITTE A PENNA</Text>
            <View style={styles.dotsRow}>
              {CONDITION_LABELS.map((label, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.dotContainer}
                  onPress={() => setScrittePenna(idx)}
                >
                  <View style={[
                    styles.conditionDot,
                    { backgroundColor: CONDITION_COLORS[idx] },
                    scrittePenna === idx && styles.conditionDotSelected
                  ]}>
                    {scrittePenna === idx && (
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    )}
                  </View>
                  <Text style={styles.dotLabel}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Checkbox Esercizi svolti a penna - opzionale */}
            {scrittePenna > 0 && (
              <TouchableOpacity 
                style={styles.eserciziCheckboxRow}
                onPress={() => setEserciziPenna(!eserciziPenna)}
              >
                <View style={[
                  styles.eserciziCheckbox,
                  eserciziPenna && styles.eserciziCheckboxSelected
                ]}>
                  {eserciziPenna && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <Text style={styles.eserciziCheckboxLabel}>Con esercizi svolti</Text>
              </TouchableOpacity>
            )}

            {/* Scritte a matita */}
            <Text style={styles.conditionCategoryLabelBold}>SCRITTE A MATITA</Text>
            <View style={styles.dotsRow}>
              {CONDITION_LABELS.map((label, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.dotContainer}
                  onPress={() => setScritteMatita(idx)}
                >
                  <View style={[
                    styles.conditionDot,
                    { backgroundColor: CONDITION_COLORS[idx] },
                    scritteMatita === idx && styles.conditionDotSelected
                  ]}>
                    {scritteMatita === idx && (
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    )}
                  </View>
                  <Text style={styles.dotLabel}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Checkbox Esercizi svolti a matita - opzionale */}
            {scritteMatita > 0 && (
              <TouchableOpacity 
                style={styles.eserciziCheckboxRow}
                onPress={() => setEserciziMatita(!eserciziMatita)}
              >
                <View style={[
                  styles.eserciziCheckbox,
                  eserciziMatita && styles.eserciziCheckboxSelected
                ]}>
                  {eserciziMatita && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <Text style={styles.eserciziCheckboxLabel}>Con esercizi svolti</Text>
              </TouchableOpacity>
            )}

            {/* Pagine evidenziate */}
            <Text style={styles.conditionCategoryLabelBold}>PAGINE EVIDENZIATE</Text>
            <View style={styles.dotsRow}>
              {CONDITION_LABELS.map((label, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.dotContainer}
                  onPress={() => setPagineEvidenziate(idx)}
                >
                  <View style={[
                    styles.conditionDot,
                    { backgroundColor: CONDITION_COLORS[idx] },
                    pagineEvidenziate === idx && styles.conditionDotSelected
                  ]}>
                    {pagineEvidenziate === idx && (
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    )}
                  </View>
                  <Text style={styles.dotLabel}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Usura pagine (pieghe/orecchie) */}
            <Text style={styles.conditionCategoryLabelBold}>USURA PAGINE (PIEGHE/ORECCHIE)</Text>
            <View style={styles.dotsRow}>
              {CONDITION_LABELS.map((label, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.dotContainer}
                  onPress={() => setCondGenerale(idx)}
                >
                  <View style={[
                    styles.conditionDot,
                    { backgroundColor: CONDITION_COLORS[idx] },
                    condGenerale === idx && styles.conditionDotSelected
                  ]}>
                    {condGenerale === idx && (
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    )}
                  </View>
                  <Text style={styles.dotLabel}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Risultato Condizione */}
        <View style={styles.conditionResult}>
          <Text style={styles.conditionLabel}>Condizione calcolata:</Text>
          <View style={[styles.conditionBadge, { backgroundColor: getConditionColor(priceRange.condition) + '20' }]}>
            <Text style={[styles.conditionText, { color: getConditionColor(priceRange.condition) }]}>
              {getConditionLabel(priceRange.condition)}
            </Text>
          </View>
        </View>

        {/* Forbice Prezzi */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Scegli il prezzo</Text>
          
          {/* Prezzi Consigliati - sempre 3 opzioni */}
          {priceRange.prices.map((price, idx) => (
            <TouchableOpacity
              key={idx}
              style={[
                styles.priceOption,
                !useCustomPrice && selectedPriceOption === price.prezzoAcquirente && styles.priceOptionSelected
              ]}
              onPress={() => {
                setUseCustomPrice(false);
                setSelectedPriceOption(price.prezzoAcquirente ?? null);
              }}
            >
              <View style={styles.priceOptionHeader}>
                <Ionicons 
                  name={!useCustomPrice && selectedPriceOption === price.prezzoAcquirente ? "radio-button-on" : "radio-button-off"} 
                  size={22} 
                  color={!useCustomPrice && selectedPriceOption === price.prezzoAcquirente ? "#1a472a" : "#666"} 
                />
                <Text style={styles.priceLabelBold}>{price.label}</Text>
              </View>
              <View style={styles.priceOptionDetails}>
                <Text style={styles.priceEarningMain}>Guadagni: <Text style={styles.priceEarningValue}>€{price.guadagnoVenditore?.toFixed(2)}</Text></Text>
                <Text style={styles.priceAcquirente}>L'acquirente pagherà €{price.prezzoAcquirente?.toFixed(2)}</Text>
              </View>
            </TouchableOpacity>
          ))}

          {/* Prezzo Personalizzato */}
          <TouchableOpacity
            style={[
              styles.priceOption,
              useCustomPrice && styles.priceOptionSelected
            ]}
            onPress={() => {
              setUseCustomPrice(true);
              setSelectedPriceOption(null);
            }}
          >
            <View style={styles.priceOptionHeader}>
              <Ionicons 
                name={useCustomPrice ? "radio-button-on" : "radio-button-off"} 
                size={22} 
                color={useCustomPrice ? "#1a472a" : "#666"} 
              />
              <Text style={styles.priceLabelBold}>Prezzo personalizzato</Text>
            </View>
            {useCustomPrice && (
              <View style={styles.customPriceContainer}>
                <View style={styles.customPriceInputRow}>
                  <Text style={styles.customPriceLabel}>€</Text>
                  <TextInput
                    style={styles.customPriceInput}
                    placeholder="0.00"
                    placeholderTextColor="#999"
                    keyboardType="decimal-pad"
                    value={customPrice}
                    onChangeText={(text) => {
                      // Permetti solo numeri e un punto decimale
                      const cleaned = text.replace(/[^0-9.]/g, '');
                      // Assicura che ci sia solo un punto decimale
                      const parts = cleaned.split('.');
                      if (parts.length > 2) return;
                      setCustomPrice(cleaned);
                      // Aggiorna selectedPriceOption
                      const numValue = parseFloat(cleaned);
                      if (!isNaN(numValue) && numValue > 0) {
                        setSelectedPriceOption(numValue);
                      }
                    }}
                  />
                </View>
                {customPrice && parseFloat(customPrice) > 0 && (
                  <View style={styles.customPriceDetails}>
                    <Text style={styles.priceEarningMain}>
                      Guadagni: <Text style={styles.priceEarningValue}>€{(parseFloat(customPrice) * 0.83 - 0.25).toFixed(2)}</Text>
                    </Text>
                    <Text style={styles.priceAcquirente}>L'acquirente pagherà €{parseFloat(customPrice).toFixed(2)}</Text>
                  </View>
                )}
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Foto del libro */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Foto del libro</Text>
          
          {/* Foto copertina - OBBLIGATORIA */}
          <TouchableOpacity
            style={[
              styles.coverPhotoSlot, 
              listingPhotos[0] && styles.photoSlotFilled,
              !listingPhotos[0] && styles.coverPhotoRequired
            ]}
            onPress={() => !listingPhotos[0] && takePhotoAtIndex(0)}
            disabled={loadingPhoto}
          >
            {listingPhotos[0] ? (
              <>
                <Image 
                  source={{ uri: `data:image/jpeg;base64,${listingPhotos[0]}` }} 
                  style={styles.coverPhotoPreview} 
                />
                <TouchableOpacity 
                  style={styles.removePhotoBtn}
                  onPress={() => removePhoto(0)}
                >
                  <Ionicons name="close-circle" size={24} color="#ff4444" />
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.coverPhotoContent}>
                <View style={styles.coverPhotoIcons}>
                  <Ionicons name="camera" size={28} color="#FF9800" />
                  <Ionicons name="book-outline" size={28} color="#FF9800" style={{ marginLeft: 8 }} />
                </View>
                <Text style={styles.coverPhotoText}>Apri il libro e scatta una foto che mostri contemporaneamente la copertina davanti e quella dietro.</Text>
                <Text style={styles.coverPhotoHint}>Obbligatoria</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Foto aggiuntive - OPZIONALI */}
          <Text style={[styles.photoLabel, { marginTop: 16 }]}>Foto aggiuntive (opzionali)</Text>
          <View style={styles.photoGrid}>
            {[1, 2].map((idx) => (
              <TouchableOpacity
                key={idx}
                style={[styles.photoSlot, listingPhotos[idx] && styles.photoSlotFilled]}
                onPress={() => !listingPhotos[idx] && takePhotoAtIndex(idx)}
                disabled={loadingPhoto}
              >
                {listingPhotos[idx] ? (
                  <>
                    <Image 
                      source={{ uri: `data:image/jpeg;base64,${listingPhotos[idx]}` }} 
                      style={styles.photoPreview} 
                    />
                    <TouchableOpacity 
                      style={styles.removePhotoBtn}
                      onPress={() => removePhoto(idx)}
                    >
                      <Ionicons name="close-circle" size={24} color="#ff4444" />
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Ionicons name="camera" size={28} color="#999" />
                    <Text style={styles.photoSlotText}>Foto {idx + 1}</Text>
                  </>
                )}
              </TouchableOpacity>
            ))}
          </View>
          {loadingPhoto && <ActivityIndicator style={{ marginTop: 10 }} />}
        </View>

        {/* Punti di scambio */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Punti di scambio</Text>
          {bookshopsData.map((shop) => (
            <TouchableOpacity
              key={shop.id}
              style={[styles.shopOption, selectedBookshops.includes(shop.id) && styles.shopOptionSelected]}
              onPress={() => toggleBookshop(shop.id)}
            >
              <Ionicons 
                name={selectedBookshops.includes(shop.id) ? "checkbox" : "square-outline"} 
                size={22} 
                color={selectedBookshops.includes(shop.id) ? "#1a472a" : "#666"} 
              />
              <View style={styles.shopInfo}>
                <Text style={styles.shopName}>{shop.name}</Text>
                <Text style={styles.shopAddress}>{shop.address}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Note */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Note (opzionale)</Text>
          <TextInput
            style={styles.notesInput}
            placeholder="Es: Include CD-ROM, fascicolo esercizi..."
            placeholderTextColor="#999"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Bottone Pubblica / Salva Modifica */}
        <TouchableOpacity
          style={[styles.publishButton, creatingListing && styles.publishButtonDisabled]}
          onPress={isEditMode ? updateListing : createListing}
          disabled={creatingListing}
        >
          {creatingListing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name={isEditMode ? "save" : "checkmark-circle"} size={22} color="#fff" />
              <Text style={styles.publishButtonText}>{isEditMode ? 'Salva modifica' : 'Pubblica annuncio'}</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
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
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
  },
  backButton: {
    marginTop: 20,
    backgroundColor: '#1a472a',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  bookInfoCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  bookCover: {
    width: 80,
    height: 120,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  bookDetails: {
    flex: 1,
    marginLeft: 16,
    justifyContent: 'center',
  },
  bookTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  bookDiscipline: {
    fontSize: 13,
    color: '#1a472a',
    marginBottom: 4,
  },
  bookIsbn: {
    fontSize: 12,
    color: '#888',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  bookPrice: {
    fontSize: 14,
    color: '#1a472a',
    fontWeight: '600',
  },
  bookPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  bookPriceLabel: {
    fontSize: 16,
    color: '#1a472a',
  },
  bookPriceValue: {
    fontSize: 18,
    color: '#1a472a',
    fontWeight: 'bold',
  },
  section: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  newBookToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
  },
  newBookToggleActive: {
    backgroundColor: '#e3f2fd',
  },
  newBookText: {
    fontSize: 15,
    color: '#666',
  },
  newBookTextActive: {
    color: '#2196F3',
    fontWeight: '600',
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sliderLabel: {
    width: 130,
    fontSize: 13,
    color: '#333',
  },
  slider: {
    flex: 1,
    height: 40,
  },
  sliderValue: {
    width: 45,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '600',
  },
  checkboxRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 8,
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkboxLabel: {
    fontSize: 13,
    color: '#333',
  },
  // Nuovi stili per pallini condizioni
  conditionCategoryLabel: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 8,
    fontStyle: 'italic',
    textDecorationLine: 'underline',
  },
  conditionCategoryLabelBold: {
    fontSize: 13,
    color: '#444',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
    fontWeight: '600',
    textDecorationLine: 'underline',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  eserciziFlag: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF3E0',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 4,
    marginBottom: 8,
    alignSelf: 'center',
    gap: 6,
  },
  eserciziFlagText: {
    fontSize: 12,
    color: '#FF9800',
    fontWeight: '600',
  },
  // Stile nota fascicoli
  fascicoliNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 8,
    gap: 8,
  },
  fascicoliNoteText: {
    flex: 1,
    fontSize: 13,
    color: '#666',
    fontStyle: 'italic',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 4,
  },
  dotContainer: {
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  conditionDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.5,
  },
  conditionDotSelected: {
    opacity: 1,
    transform: [{ scale: 1.15 }],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  dotLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
  },
  eserciziSection: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  eserciziCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 12,
    gap: 10,
  },
  eserciziLabel: {
    fontSize: 14,
    color: '#333',
  },
  eserciziCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#FF9800',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eserciziCheckboxSelected: {
    backgroundColor: '#FF9800',
    borderColor: '#FF9800',
  },
  eserciziCheckboxLabel: {
    fontSize: 13,
    color: '#666',
  },
  conditionResult: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 12,
  },
  conditionLabel: {
    fontSize: 14,
    color: '#666',
  },
  conditionBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  conditionText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  priceOption: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    marginBottom: 10,
  },
  priceOptionSelected: {
    borderColor: '#1a472a',
    backgroundColor: '#f0f8f0',
  },
  priceOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  priceOptionDetails: {
    paddingLeft: 34,
  },
  priceOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  priceLabel: {
    fontSize: 14,
    color: '#333',
  },
  priceLabelBold: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#333',
  },
  priceOptionRight: {
    alignItems: 'flex-end',
  },
  priceValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  priceEarning: {
    fontSize: 12,
    color: '#4CAF50',
    marginTop: 2,
  },
  priceEarningMain: {
    fontSize: 15,
    color: '#4CAF50',
  },
  priceEarningValue: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  priceAcquirente: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  // Stili per prezzo personalizzato
  customPriceContainer: {
    paddingLeft: 34,
    paddingTop: 8,
  },
  customPriceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  customPriceLabel: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  customPriceInput: {
    width: 100,
    backgroundColor: '#fff',
    borderWidth: 0,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
    fontWeight: '600',
    color: '#1a472a',
  },
  customPriceDetails: {
    marginTop: 8,
  },
  photoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  requiredStar: {
    color: '#ff4444',
    fontWeight: 'bold',
  },
  coverPhotoSlot: {
    height: 160,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverPhotoRequired: {
    borderColor: '#FF9800',
    backgroundColor: '#FFF8E1',
  },
  coverPhotoPreview: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
  },
  coverPhotoContent: {
    alignItems: 'center',
    padding: 16,
  },
  coverPhotoIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  coverPhotoText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#FF9800',
    textAlign: 'center',
    paddingHorizontal: 8,
    lineHeight: 20,
  },
  coverPhotoHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
  },
  photoGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  photoSlot: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoSlotFilled: {
    borderStyle: 'solid',
    borderColor: '#4CAF50',
  },
  photoSlotText: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
  },
  photoPreview: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  removePhotoBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  shopOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 10,
    gap: 12,
  },
  shopOptionSelected: {
    borderColor: '#1a472a',
    backgroundColor: '#f0f8f0',
  },
  shopInfo: {
    flex: 1,
  },
  shopName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  shopAddress: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  foderareOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#f9f9f9',
    marginTop: 8,
    gap: 10,
  },
  foderareOptionActive: {
    backgroundColor: '#e8f5e9',
  },
  foderareText: {
    fontSize: 14,
    color: '#666',
  },
  foderareTextActive: {
    color: '#4CAF50',
    fontWeight: '600',
  },
  notesInput: {
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#333',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  publishButton: {
    backgroundColor: '#1a472a',
    marginHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  publishButtonDisabled: {
    opacity: 0.7,
  },
  publishButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
  },
  // Custom Price Styles
  customPriceToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#fff8e1',
    borderWidth: 1,
    borderColor: '#FFE082',
    marginBottom: 16,
    gap: 12,
  },
  customPriceToggleText: {
    flex: 1,
  },
  customPriceToggleTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  customPriceToggleSubtitle: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
});
