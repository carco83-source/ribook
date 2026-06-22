import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  Share,
  Platform,
  Linking,
  Modal,
  TextInput,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Listing {
  id: string;
  seller_id: string;
  seller_username?: string;
  seller_name?: string;
  book_id?: string;
  book_titolo?: string;
  book_title?: string;
  book_autore?: string;
  book_autori?: string;
  book_author?: string;
  book_isbn: string;
  book_materia?: string;
  book_disciplina?: string;
  book_subject?: string;
  book_classe?: string;
  book_class?: number;
  prezzo_ministeriale?: number;
  prezzo_copertina?: number;
  original_price?: number;
  condizione?: string;
  condition?: string;
  condition_details?: {
    // New structure with percentages (sell.tsx)
    penna?: number;
    matita?: number;
    evidenziatore?: number;
    usura_libro?: number;
    esercizi_penna?: boolean;
    esercizi_matita?: boolean;
    // Old structure (fallback)
    scritte?: number;
    evidenziature?: number;
    pieghe?: number;
    // Legacy structure (numeric indices)
    sottolineature?: number;
    copertina?: number;
    pagine?: number;
    esercizi?: number;
  };
  prezzo_vendita?: number;
  price?: number;
  ha_fascicoli?: boolean;
  fascicoli_totali?: number;
  fascicoli_presenti?: number;
  bookstore_ids?: string[];
  bookstore_names?: string[];
  bookstores?: any[];
  note?: string;
  description?: string;
  foto_base64?: string;
  photos?: string[];
  photo_1?: string;
  photo_2?: string;
  photo_3?: string;
  condizione_percentuale?: number;
  stato?: string;
  status?: string;
}

// Helper functions
const getListingAuthor = (listing: Listing | null): string => {
  if (!listing) return 'N/A';
  return listing.book_autore || listing.book_autori || listing.book_author || 'N/A';
};
const getListingPrice = (listing: Listing | null): number => {
  if (!listing) return 0;
  return listing.prezzo_ministeriale || listing.prezzo_copertina || listing.original_price || 0;
};
const getListingTitle = (listing: Listing | null): string => {
  if (!listing) return 'N/A';
  return listing.book_titolo || listing.book_title || 'N/A';
};
const getListingCondition = (listing: Listing | null): string => {
  if (!listing) return 'buono';
  return listing.condizione || listing.condition || 'buono';
};
const getListingSellingPrice = (listing: Listing | null): number => {
  if (!listing) return 0;
  return listing.prezzo_vendita || listing.price || 0;
};

// Calcola il prezzo totale per l'acquirente (prezzo libro + 10% commissione)
const getListingBuyerPrice = (listing: Listing | null, includeFoderazione: boolean = false): number => {
  if (!listing) return 0;
  const prezzoLibro = listing.prezzo_vendita || listing.price || 0;
  const commissione = prezzoLibro * 0.10; // 10% commissione
  const foderazione = includeFoderazione ? 1.50 : 0;
  return prezzoLibro + commissione + foderazione;
};

const getListingSubject = (listing: Listing | null): string => {
  if (!listing) return '';
  return listing.book_materia || listing.book_disciplina || listing.book_subject || '';
};
const getListingClass = (listing: Listing | null): string => {
  if (!listing) return '';
  return listing.book_classe || (listing.book_class ? String(listing.book_class) : '') || '';
};
const getListingNotes = (listing: Listing | null): string => {
  if (!listing) return '';
  return listing.note || listing.description || '';
};
const getListingSellerName = (listing: Listing | null): string => {
  if (!listing) return 'Venditore';
  return listing.seller_username || listing.seller_name || 'Venditore';
};

// Calcola la percentuale della condizione generale
const calculateConditionPercentage = (listing: Listing | null): number => {
  if (!listing || !listing.condition_details) {
    // Fallback basato sulla condizione testuale
    const condition = getListingCondition(listing);
    switch (condition) {
      case 'nuovo': return 0;
      case 'ottimo': return 15;
      case 'buono': return 45;
      case 'accettabile': return 70;
      case 'scarso': return 90;
      default: return 50;
    }
  }
  
  const cd = listing.condition_details;
  
  // Se ha i nuovi campi (penna, matita, evidenziatore, usura_libro)
  if (cd.penna !== undefined || cd.usura_libro !== undefined) {
    const penna = cd.penna || 0;
    const matita = cd.matita || 0;
    const evidenziatore = cd.evidenziatore || 0;
    const usura = cd.usura_libro || 0;
    
    // Pesi: 75% Condizioni Pagine, 25% Usura
    // Dentro Condizioni Pagine: Penna 50%, Evidenziatore 35%, Matita 15%
    const condizioniPagineMedia = (penna * 0.50 + evidenziatore * 0.35 + matita * 0.15);
    let percentuale = (condizioniPagineMedia * 0.75 + usura * 0.25);
    
    // Aggiungi penalità esercizi
    if (cd.esercizi_penna) percentuale = Math.min(100, percentuale + 10);
    if (cd.esercizi_matita) percentuale = Math.min(100, percentuale + 10);
    
    return Math.round(percentuale);
  }
  
  // Fallback per struttura vecchia (scritte, evidenziature, pieghe)
  if (cd.scritte !== undefined) {
    const scritte = cd.scritte || 0;
    const evidenziature = cd.evidenziature || 0;
    const pieghe = cd.pieghe || 0;
    return Math.round((scritte + evidenziature + pieghe) / 3);
  }
  
  return 50; // Default
};

interface Bookstore {
  id: string;
  nome: string;
  indirizzo: string;
  citta: string;
  telefono: string;
}

export default function ListingDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [listing, setListing] = useState<Listing | null>(null);
  const [bookstores, setBookstores] = useState<Bookstore[]>([]);
  const [selectedBookstore, setSelectedBookstore] = useState<Bookstore | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState(false);

  // Report modal state
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [sendingReport, setSendingReport] = useState(false);
  
  // Opzione foderazione libro
  const [richiediFoderazione, setRichiediFoderazione] = useState(false);

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const REPORT_REASONS = [
    { value: 'foto_inappropriata', label: 'Foto inappropriata o offensiva' },
    { value: 'foto_non_corrispondente', label: 'Foto non corrisponde al libro' },
    { value: 'prezzo_ingannevole', label: 'Prezzo ingannevole' },
    { value: 'condizione_falsa', label: 'Condizione del libro falsa' },
    { value: 'spam', label: 'Spam o annuncio duplicato' },
    { value: 'altro', label: 'Altro' },
  ];

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      const storedPremium = await AsyncStorage.getItem('is_premium');
      setUserId(storedUserId);
      setIsPremium(storedPremium === 'true');

      // Load listing by ID directly (new endpoint)
      try {
        const listingResponse = await axios.get(`${API_URL}/api/listings/${id}`);
        setListing(listingResponse.data);
      } catch (err: any) {
        // Fallback to old method if endpoint not found
        if (err.response?.status === 404) {
          console.log('Listing not found');
          setListing(null);
        } else {
          const listingsResponse = await axios.get(`${API_URL}/api/listings`);
          const foundListing = listingsResponse.data.find((l: Listing) => l.id === id);
          setListing(foundListing);
        }
      }

      // Load bookstores
      const bookstoresResponse = await axios.get(`${API_URL}/api/bookstores`);
      setBookstores(bookstoresResponse.data);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getConditionLabel = (condition: string) => {
    const labels: { [key: string]: string } = {
      nuovo: 'Nuovo',
      come_nuovo: 'Come Nuovo',
      ottime_condizioni: 'Ottime Condizioni',
      buono: 'Buono',
      scarso: 'Scarso',
    };
    return labels[condition] || condition;
  };

  // Helper functions for percentage-based condition display
  const getPercentageColor = (percentage: number): string => {
    if (percentage === 0) return '#4CAF50'; // Green - None
    if (percentage <= 25) return '#8BC34A'; // Light green - Few
    if (percentage <= 50) return '#FFC107'; // Yellow - Some
    if (percentage <= 75) return '#FF9800'; // Orange - Many
    return '#f44336'; // Red - A lot
  };

  const getPercentageLabel = (percentage: number): string => {
    if (percentage === 0) return 'Nessuna';
    if (percentage <= 33) return 'Poche';
    if (percentage <= 66) return 'Diverse';
    return 'Molte';
  };

  const calculateCommission = () => {
    if (!listing) return { commission: 0, total: 0, foderazione: 0 };
    const sellingPrice = getListingSellingPrice(listing);
    const foderazioneCost = richiediFoderazione ? 1.50 : 0;
    if (isPremium) {
      return { commission: 0, total: sellingPrice, foderazione: foderazioneCost };
    }
    const commission = sellingPrice * 0.17;
    return { commission, total: sellingPrice, foderazione: foderazioneCost };
  };

  const handleShare = async () => {
    if (!listing) return;
    const sellingPrice = getListingSellingPrice(listing);
    const message = `📚 ${getListingTitle(listing)}\n` +
      `✍️ ${getListingAuthor(listing)}\n` +
      `💰 Prezzo: €${sellingPrice.toFixed(2)}\n` +
      `📖 Condizione: ${getConditionLabel(getListingCondition(listing))}\n\n` +
      `Trovato su RiLiBro - L'app per scambiare libri scolastici usati a Catanzaro!`;

    try {
      await Share.share({
        message,
        title: `${getListingTitle(listing)} in vendita su RiLiBro`,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleShareWhatsApp = async () => {
    if (!listing) return;
    const sellingPrice = getListingSellingPrice(listing);
    const message = `📚 *${getListingTitle(listing)}*\n` +
      `✍️ ${getListingAuthor(listing)}\n` +
      `💰 Prezzo: €${listing.prezzo_vendita.toFixed(2)}\n` +
      `📖 Condizione: ${getConditionLabel(listing.condizione)}\n\n` +
      `Trovato su RiLiBro!`;

    const url = `whatsapp://send?text=${encodeURIComponent(message)}`;
    
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        // Fallback to web WhatsApp
        await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(message)}`);
      }
    } catch (error) {
      console.error('Error sharing to WhatsApp:', error);
      Alert.alert('Errore', 'Impossibile aprire WhatsApp');
    }
  };

  const handleReport = async () => {
    if (!reportReason) {
      Alert.alert('Errore', 'Seleziona un motivo per la segnalazione');
      return;
    }

    setSendingReport(true);
    try {
      await axios.post(
        `${API_URL}/api/listings/${listing?.id}/report?reporter_id=${userId}`,
        {
          motivo: reportReason,
          descrizione: reportDescription.trim() || undefined,
        }
      );

      setShowReportModal(false);
      setReportReason('');
      setReportDescription('');
      
      Alert.alert(
        'Segnalazione inviata',
        'Grazie per la segnalazione. Il nostro team la esaminerà al più presto.',
        [{ text: 'OK' }]
      );
    } catch (error: any) {
      console.error('Error sending report:', error);
      Alert.alert(
        'Errore',
        error.response?.data?.detail || 'Impossibile inviare la segnalazione'
      );
    } finally {
      setSendingReport(false);
    }
  };

  const handleBuyNow = async () => {
    console.log('handleBuyNow called', { selectedBookstore, userId, listing: listing?.id });
    
    if (!selectedBookstore) {
      if (Platform.OS === 'web') {
        window.alert('Seleziona un punto di ritiro');
      } else {
        Alert.alert('Errore', 'Seleziona un punto di ritiro');
      }
      return;
    }
    
    if (!userId) {
      if (Platform.OS === 'web') {
        window.alert('Devi effettuare il login');
      } else {
        Alert.alert('Errore', 'Devi effettuare il login');
      }
      return;
    }

    // Check se è il proprio libro
    if (listing?.seller_id === userId) {
      if (Platform.OS === 'web') {
        window.alert('Non puoi acquistare i tuoi libri');
      } else {
        Alert.alert('Errore', 'Non puoi acquistare i tuoi libri');
      }
      return;
    }

    // Procedi direttamente con l'acquisto
    setPurchasing(true);
    try {
      // Usa query params per evitare problemi con il body attraverso il proxy
      const url = `${API_URL}/api/orders/create?user_id=${userId}&listing_id=${listing?.id}&bookstore_id=${selectedBookstore.id}`;
      
      console.log('Creating order with URL:', url);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      const data = await response.json();
      console.log('Response:', response.status, data);
      
      if (!response.ok) {
        throw new Error(data.detail || `Error ${response.status}`);
      }
      
      console.log('Order created:', data);
      
      // Naviga direttamente alle notifiche
      router.push('/notifications');
      
    } catch (error: any) {
      console.error('Error creating order:', error);
      const errorMsg = error.message || 'Impossibile completare la richiesta';
      if (Platform.OS === 'web') {
        window.alert('Errore: ' + errorMsg);
      } else {
        Alert.alert('Errore', errorMsg);
      }
    } finally {
      setPurchasing(false);
    }
  };

  // Manteniamo anche la funzione per aggiungere al carrello (vecchio sistema) se necessario
  const handleAddToCart = async () => {
    if (!selectedBookstore) {
      Alert.alert('Errore', 'Seleziona un punto di ritiro');
      return;
    }

    setPurchasing(true);
    try {
      // Add to cart via API (with seller confirmation)
      const response = await axios.post(
        `${API_URL}/api/cart/add?listing_id=${listing?.id}&bookstore_id=${selectedBookstore.id}&buyer_id=${userId}`
      );
      
      Alert.alert(
        'Prenotazione inviata!',
        `"${listing?.book_titolo}" è stato prenotato.\n\nIl venditore ha 24 ore per confermare la disponibilità.\n\nRitiro: ${selectedBookstore.nome}`,
        [
          { text: 'Continua acquisti', onPress: () => router.back() },
          { text: 'Vai al carrello', onPress: () => router.push('/cart') }
        ]
      );
    } catch (error: any) {
      console.error('Error adding to cart:', error);
      const errorMsg = error.response?.data?.detail || 'Impossibile aggiungere al carrello';
      Alert.alert('Errore', errorMsg);
    } finally {
      setPurchasing(false);
    }
  };

  const { commission, total, foderazione } = calculateCommission();
  
  // Verifica se l'utente corrente è il venditore
  const isOwner = userId && listing?.seller_id === userId;
  
  // Prezzo da mostrare: venditore vede il suo prezzo, acquirente vede il totale
  const displayPrice = isOwner ? total : getListingBuyerPrice(listing, richiediFoderazione);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a472a" />
      </View>
    );
  }

  if (!listing) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={48} color="#ff4444" />
        <Text style={styles.errorText}>Annuncio non trovato</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Torna indietro</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Dettaglio Libro',
          headerStyle: { backgroundColor: '#1a472a' },
          headerTintColor: '#fff',
          headerLeft: () => (
            <TouchableOpacity onPress={handleGoBack} style={{ paddingHorizontal: 16 }}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
          ),
        }}
      />
      
      {/* Book Image */}
      {listing.foto_base64 ? (
        <Image
          source={{ uri: `data:image/jpeg;base64,${listing.foto_base64}` }}
          style={styles.bookImage}
        />
      ) : (
        <View style={styles.noImage}>
          <Ionicons name="book" size={64} color="#ccc" />
        </View>
      )}

      {/* Book Details */}
      <View style={styles.content}>
        {/* Book Details */}
        <View style={styles.priceRow}>
          <Text style={styles.price}>€{displayPrice.toFixed(2)}</Text>
          <View style={styles.conditionBadge}>
            <Text style={styles.conditionText}>
              {getConditionLabel(getListingCondition(listing))}
            </Text>
          </View>
        </View>
        
        {/* Condizione Generale Percentuale */}
        <View style={styles.conditionPercentageRow}>
          <Text style={styles.conditionPercentageLabel}>Condizione Generale:</Text>
          <Text style={[
            styles.conditionPercentageValue,
            { color: getPercentageColor(calculateConditionPercentage(listing)) }
          ]}>
            {calculateConditionPercentage(listing)}%
          </Text>
        </View>

        <Text style={styles.title}>{getListingTitle(listing)}</Text>
        <Text style={styles.author}>{getListingAuthor(listing)}</Text>

        <View style={styles.metaContainer}>
          <View style={styles.metaItem}>
            <Ionicons name="school-outline" size={16} color="#666" />
            <Text style={styles.metaText}>Classe {getListingClass(listing)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="bookmark-outline" size={16} color="#666" />
            <Text style={styles.metaText}>{getListingSubject(listing)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="barcode-outline" size={16} color="#666" />
            <Text style={styles.metaText}>{listing.book_isbn}</Text>
          </View>
        </View>

        {/* Condition Details - NEW Percentage-based display */}
        {listing.condition_details && (
          <View style={styles.conditionDetailsCard}>
            <Text style={styles.conditionDetailsTitle}>Stato dettagliato del libro</Text>
            
            {/* New condition details with labels */}
            {(listing.condition_details.penna !== undefined || 
              listing.condition_details.scritte !== undefined || 
              listing.condition_details.evidenziature !== undefined) ? (
              <View style={styles.conditionGrid}>
                {/* Scritte a penna */}
                <View style={styles.conditionItemNew}>
                  <View style={styles.conditionItemHeader}>
                    <Ionicons name="pencil" size={18} color="#666" />
                    <Text style={styles.conditionItemLabel}>Scritte a penna</Text>
                  </View>
                  <View style={[
                    styles.conditionBadgeSmall,
                    { backgroundColor: getPercentageColor(listing.condition_details.penna || listing.condition_details.scritte || 0) }
                  ]}>
                    <Text style={styles.conditionBadgeText}>
                      {getPercentageLabel(listing.condition_details.penna || listing.condition_details.scritte || 0)}
                    </Text>
                  </View>
                </View>

                {/* Scritte a matita */}
                {listing.condition_details.matita !== undefined && (
                  <View style={styles.conditionItemNew}>
                    <View style={styles.conditionItemHeader}>
                      <Ionicons name="create-outline" size={18} color="#666" />
                      <Text style={styles.conditionItemLabel}>Scritte a matita</Text>
                    </View>
                    <View style={[
                      styles.conditionBadgeSmall,
                      { backgroundColor: getPercentageColor(listing.condition_details.matita || 0) }
                    ]}>
                      <Text style={styles.conditionBadgeText}>
                        {getPercentageLabel(listing.condition_details.matita || 0)}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Evidenziature */}
                <View style={styles.conditionItemNew}>
                  <View style={styles.conditionItemHeader}>
                    <Ionicons name="color-fill" size={18} color="#666" />
                    <Text style={styles.conditionItemLabel}>Pagine evidenziate</Text>
                  </View>
                  <View style={[
                    styles.conditionBadgeSmall,
                    { backgroundColor: getPercentageColor(listing.condition_details.evidenziatore || listing.condition_details.evidenziature || 0) }
                  ]}>
                    <Text style={styles.conditionBadgeText}>
                      {getPercentageLabel(listing.condition_details.evidenziatore || listing.condition_details.evidenziature || 0)}
                    </Text>
                  </View>
                </View>

                {/* Usura Libro */}
                {(listing.condition_details.usura_libro !== undefined || listing.condition_details.pieghe !== undefined) && (
                  <View style={styles.conditionItemNew}>
                    <View style={styles.conditionItemHeader}>
                      <Ionicons name="document-text" size={18} color="#666" />
                      <Text style={styles.conditionItemLabel}>Usura pagine</Text>
                    </View>
                    <View style={[
                      styles.conditionBadgeSmall,
                      { backgroundColor: getPercentageColor(listing.condition_details.usura_libro || listing.condition_details.pieghe || 0) }
                    ]}>
                      <Text style={styles.conditionBadgeText}>
                        {getPercentageLabel(listing.condition_details.usura_libro || listing.condition_details.pieghe || 0)}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Esercizi Svolti */}
                {(listing.condition_details.esercizi_penna || listing.condition_details.esercizi_matita) && (
                  <View style={styles.eserciziSvoltiContainer}>
                    <View style={styles.eserciziSvoltiHeader}>
                      <Ionicons name="checkbox" size={18} color="#FF9800" />
                      <Text style={styles.eserciziSvoltiLabel}>Esercizi svolti:</Text>
                    </View>
                    <View style={styles.eserciziSvoltiTags}>
                      {listing.condition_details.esercizi_penna && (
                        <View style={styles.eserciziTag}>
                          <Text style={styles.eserciziTagText}>A penna</Text>
                        </View>
                      )}
                      {listing.condition_details.esercizi_matita && (
                        <View style={styles.eserciziTag}>
                          <Text style={styles.eserciziTagText}>A matita</Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}
              </View>
            ) : (
              /* Legacy condition details (fallback) */
              <View style={styles.conditionGrid}>
                <View style={styles.conditionItem}>
                  <Text style={styles.conditionItemLabel}>Scritte/evidenziature</Text>
                  <Text style={styles.conditionItemValue}>
                    {['✨ Nessuna', '✏️ Poche', '🖊️ Molte'][listing.condition_details.sottolineature || 0]}
                  </Text>
                </View>
                <View style={styles.conditionItem}>
                  <Text style={styles.conditionItemLabel}>Copertina</Text>
                  <Text style={styles.conditionItemValue}>
                    {['✨ Integra', '⚠️ Un po\' rovinata', '📉 Molto rovinata'][listing.condition_details.copertina || 0]}
                  </Text>
                </View>
                <View style={styles.conditionItem}>
                  <Text style={styles.conditionItemLabel}>Pagine</Text>
                  <Text style={styles.conditionItemValue}>
                    {['✨ Perfette', '📄 Qualche piega', '📚 Molte pieghe'][listing.condition_details.pagine || 0]}
                  </Text>
                </View>
                <View style={styles.conditionItem}>
                  <Text style={styles.conditionItemLabel}>Esercizi compilati</Text>
                  <Text style={styles.conditionItemValue}>
                    {['✨ Nessuno', '📝 Alcuni', '📋 Molti'][listing.condition_details.esercizi || 0]}
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Foto del venditore */}
        {(listing.photos && listing.photos.length > 0) || listing.photo_1 || listing.photo_2 || listing.photo_3 ? (
          <View style={styles.photosCard}>
            <Text style={styles.photosTitle}>Foto del libro</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosScroll}>
              {listing.photos?.map((photo, index) => (
                <Image 
                  key={index} 
                  source={{ uri: photo.startsWith('data:') ? photo : `data:image/jpeg;base64,${photo}` }} 
                  style={styles.photoThumbnail} 
                />
              ))}
              {listing.photo_1 && (
                <Image 
                  source={{ uri: listing.photo_1.startsWith('data:') ? listing.photo_1 : `data:image/jpeg;base64,${listing.photo_1}` }} 
                  style={styles.photoThumbnail} 
                />
              )}
              {listing.photo_2 && (
                <Image 
                  source={{ uri: listing.photo_2.startsWith('data:') ? listing.photo_2 : `data:image/jpeg;base64,${listing.photo_2}` }} 
                  style={styles.photoThumbnail} 
                />
              )}
              {listing.photo_3 && (
                <Image 
                  source={{ uri: listing.photo_3.startsWith('data:') ? listing.photo_3 : `data:image/jpeg;base64,${listing.photo_3}` }} 
                  style={styles.photoThumbnail} 
                />
              )}
            </ScrollView>
          </View>
        ) : null}

        {/* Fascicoli Info */}
        {listing.ha_fascicoli && listing.fascicoli_totali && listing.fascicoli_totali > 0 && (
          <View style={styles.fascicoliCard}>
            <Text style={styles.fascicoliTitle}>Fascicoli allegati</Text>
            <View style={styles.fascicoliInfo}>
              <Ionicons 
                name={listing.fascicoli_presenti === listing.fascicoli_totali ? "checkmark-circle" : "alert-circle"} 
                size={20} 
                color={listing.fascicoli_presenti === listing.fascicoli_totali ? "#4CAF50" : "#FF9800"} 
              />
              <Text style={styles.fascicoliText}>
                {listing.fascicoli_presenti}/{listing.fascicoli_totali} fascicoli presenti
              </Text>
            </View>
            {listing.fascicoli_presenti !== listing.fascicoli_totali && (
              <Text style={styles.fascicoliWarning}>
                ⚠️ Mancano {listing.fascicoli_totali - (listing.fascicoli_presenti || 0)} fascicoli
              </Text>
            )}
          </View>
        )}

        {/* Bookstores where seller can deliver */}
        {/* Usa listing.bookstores se disponibile, altrimenti fallback a bookstore_names */}
        {((listing.bookstores && listing.bookstores.length > 0) || (listing.bookstore_names && listing.bookstore_names.length > 0)) && (
          <View style={styles.bookstoresAvailableCard}>
            <Text style={styles.bookstoresAvailableTitle}>Punti di ritiro disponibili</Text>
            <Text style={styles.bookstoresAvailableSubtitle}>Seleziona dove vuoi ritirare il libro</Text>
            {(listing.bookstores && listing.bookstores.length > 0) ? (
              listing.bookstores.map((bs: any, index: number) => {
                const isSelected = selectedBookstore?.id === bs.id;
                return (
                  <TouchableOpacity
                    key={bs.id || index}
                    style={[
                      styles.bookstoreAvailableCard,
                      isSelected && styles.bookstoreAvailableCardSelected
                    ]}
                    onPress={() => setSelectedBookstore({ 
                      id: bs.id, 
                      nome: bs.nome,
                      indirizzo: bs.indirizzo,
                      citta: bs.citta,
                      telefono: bs.telefono
                    })}
                  >
                    <View style={styles.bookstoreAvailableHeader}>
                      <Ionicons 
                        name={isSelected ? "radio-button-on" : "radio-button-off"} 
                        size={22} 
                        color={isSelected ? "#1a472a" : "#666"} 
                      />
                      <View style={styles.bookstoreAvailableInfo}>
                        <Text style={[
                          styles.bookstoreAvailableName,
                          isSelected && styles.bookstoreAvailableNameSelected
                        ]}>
                          {bs.nome}
                        </Text>
                        {bs.indirizzo && (
                          <Text style={styles.bookstoreAvailableAddress}>
                            {bs.indirizzo}{bs.citta ? `, ${bs.citta}` : ''}
                          </Text>
                        )}
                      </View>
                    </View>
                    {bs.indirizzo && (
                      <TouchableOpacity
                        style={styles.mapsButton}
                        onPress={() => {
                          const encodedAddress = encodeURIComponent(`${bs.indirizzo}, ${bs.citta || ''}`);
                          const mapsUrl = Platform.select({
                            ios: `maps:0,0?q=${encodedAddress}`,
                            android: `geo:0,0?q=${encodedAddress}`,
                            default: `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`
                          });
                          Linking.openURL(mapsUrl as string);
                        }}
                      >
                        <Ionicons name="navigate" size={16} color="#1a472a" />
                        <Text style={styles.mapsButtonText}>Indicazioni</Text>
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                );
              })
            ) : (
              listing.bookstore_names.map((name: string, index: number) => {
              const address = listing.bookstore_addresses?.[index] || '';
              const isSelected = selectedBookstore?.nome === name;
              
              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.bookstoreAvailableCard,
                    isSelected && styles.bookstoreAvailableCardSelected
                  ]}
                  onPress={() => setSelectedBookstore({ 
                    id: listing.bookstore_ids?.[index] || '', 
                    nome: name 
                  })}
                >
                  <View style={styles.bookstoreAvailableHeader}>
                    <Ionicons 
                      name={isSelected ? "radio-button-on" : "radio-button-off"} 
                      size={22} 
                      color={isSelected ? "#1a472a" : "#666"} 
                    />
                    <View style={styles.bookstoreAvailableInfo}>
                      <Text style={[
                        styles.bookstoreAvailableName,
                        isSelected && styles.bookstoreAvailableNameSelected
                      ]}>
                        {name}
                      </Text>
                      {address && (
                        <Text style={styles.bookstoreAvailableAddress}>{address}</Text>
                      )}
                    </View>
                  </View>
                  {address && (
                    <TouchableOpacity
                      style={styles.mapsButton}
                      onPress={() => {
                        const encodedAddress = encodeURIComponent(address);
                        const mapsUrl = Platform.select({
                          ios: `maps:0,0?q=${encodedAddress}`,
                          android: `geo:0,0?q=${encodedAddress}`,
                          default: `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`
                        });
                        Linking.openURL(mapsUrl as string);
                      }}
                    >
                      <Ionicons name="navigate" size={16} color="#1a472a" />
                      <Text style={styles.mapsButtonText}>Indicazioni</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              );
            })
            )}
          </View>
        )}

        {/* Opzione Foderazione - appare quando una cartolibreria è selezionata */}
        {selectedBookstore && (
          <TouchableOpacity 
            style={styles.foderaturaCard}
            onPress={() => setRichiediFoderazione(!richiediFoderazione)}
          >
            <View style={styles.foderaturaContent}>
              <View style={[
                styles.foderaturaCheckbox,
                richiediFoderazione && styles.foderaturaCheckboxChecked
              ]}>
                {richiediFoderazione && (
                  <Ionicons name="checkmark" size={16} color="#fff" />
                )}
              </View>
              <View style={styles.foderaturaTextContainer}>
                <Text style={styles.foderaturaTitle}>Foderazione libro</Text>
                <Text style={styles.foderaturaSubtitle}>
                  Richiedi la foderazione presso {selectedBookstore.nome}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        )}

        <View style={styles.sellerCard}>
          <Ionicons name="person-circle-outline" size={24} color="#1a472a" />
          <Text style={styles.sellerText}>Venditore: {getListingSellerName(listing)}</Text>
        </View>
        
        {getListingNotes(listing) ? (
          <View style={styles.noteCard}>
            <Text style={styles.noteTitle}>Note del venditore:</Text>
            <Text style={styles.noteText}>{getListingNotes(listing)}</Text>
          </View>
        ) : null}

        {/* Price Display - Diverso per venditore e acquirente */}
        <View style={styles.priceBreakdown}>
          {isOwner ? (
            // VENDITORE: vede solo il suo prezzo
            <>
              <View style={styles.priceRow}>
                <Text style={styles.priceRowLabel}>Il tuo guadagno</Text>
                <Text style={styles.priceRowValue}>€{total.toFixed(2)}</Text>
              </View>
            </>
          ) : (
            // ACQUIRENTE: vede il breakdown completo
            <>
              <View style={styles.priceRow}>
                <Text style={styles.priceRowLabel}>Libro</Text>
                <Text style={styles.priceRowValue}>€{getListingBuyerPrice(listing, false).toFixed(2)}</Text>
              </View>
              
              {richiediFoderazione && (
                <View style={[styles.priceRow, { marginTop: 8 }]}>
                  <Text style={styles.priceRowLabel}>Foderazione</Text>
                  <Text style={styles.priceRowValue}>€{foderazione.toFixed(2)}</Text>
                </View>
              )}
              
              <View style={styles.totalDivider} />
              <View style={styles.priceRow}>
                <Text style={styles.totalLabel}>Totale</Text>
                <Text style={styles.totalValue}>€{getListingBuyerPrice(listing, richiediFoderazione).toFixed(2)}</Text>
              </View>
            </>
          )}
        </View>

        {/* Buy Now Button - NEW Escrow System */}
        <TouchableOpacity
          style={[
            styles.purchaseButton,
            (!selectedBookstore || purchasing) && styles.purchaseButtonDisabled,
          ]}
          onPress={handleBuyNow}
          disabled={!selectedBookstore || purchasing}
        >
          {purchasing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="paper-plane" size={24} color="#fff" />
              <Text style={styles.purchaseButtonText}>Richiedi disponibilità</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 18,
    color: '#333',
    marginTop: 12,
  },
  backButton: {
    marginTop: 16,
    padding: 12,
  },
  backButtonText: {
    color: '#1a472a',
    fontWeight: '600',
  },
  bookImage: {
    width: '100%',
    height: 250,
    resizeMode: 'cover',
  },
  noImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 16,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  priceRowLabel: {
    fontSize: 14,
    color: '#333',
  },
  priceRowValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  priceSubLabel: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
    marginTop: -4,
    marginBottom: 4,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  totalDivider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 8,
  },
  price: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  conditionBadge: {
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  conditionText: {
    color: '#1a472a',
    fontWeight: '600',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  author: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
  },
  metaContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    gap: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 14,
    color: '#666',
  },
  sellerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
    gap: 8,
  },
  sellerText: {
    fontSize: 14,
    color: '#333',
  },
  chatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
  },
  chatButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  noteCard: {
    backgroundColor: '#fff8f0',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#f4a460',
  },
  noteTitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  noteText: {
    fontSize: 14,
    color: '#333',
  },
  priceBreakdown: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
  },
  breakdownTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  breakdownLabel: {
    fontSize: 14,
    color: '#666',
  },
  breakdownValue: {
    fontSize: 14,
    color: '#333',
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingTop: 8,
    marginTop: 8,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  premiumHint: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 6,
  },
  premiumHintText: {
    fontSize: 13,
    color: '#f4a460',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 24,
    marginBottom: 12,
  },
  noBookstores: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  noBookstoresText: {
    color: '#666',
    textAlign: 'center',
  },
  bookstoresList: {
    gap: 8,
  },
  bookstoreItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  bookstoreItemSelected: {
    borderColor: '#1a472a',
    backgroundColor: '#f0f8f0',
  },
  bookstoreInfo: {
    flex: 1,
  },
  bookstoreName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  bookstoreAddress: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  bookstoreCity: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  purchaseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a472a',
    padding: 16,
    borderRadius: 12,
    marginTop: 24,
    marginBottom: 32,
    gap: 8,
  },
  purchaseButtonDisabled: {
    backgroundColor: '#ccc',
  },
  purchaseButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  conditionDetailsCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
  },
  conditionDetailsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  conditionGrid: {
    gap: 12,
  },
  conditionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  conditionItemLabel: {
    fontSize: 14,
    color: '#666',
  },
  conditionBadgeSmall: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  conditionBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  conditionItemValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  // New percentage-based condition styles
  conditionItemNew: {
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  conditionItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  percentageBarContainer: {
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  percentageBar: {
    height: '100%',
    borderRadius: 4,
  },
  percentageText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
  },
  fascicoliCard: {
    backgroundColor: '#fff8e1',
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
  },
  fascicoliTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  fascicoliInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fascicoliText: {
    fontSize: 14,
    color: '#666',
  },
  fascicoliWarning: {
    fontSize: 13,
    color: '#e65100',
    marginTop: 8,
  },
  bookstoresAvailableCard: {
    backgroundColor: '#e8f5e9',
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
  },
  bookstoresAvailableTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a472a',
    marginBottom: 12,
  },
  bookstoreAvailableItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  bookstoreAvailableName: {
    fontSize: 14,
    color: '#333',
  },
  shareRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  shareButton: {
    flex: 1,
    minWidth: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1a472a',
  },
  shareButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1a472a',
  },
  whatsappButton: {
    borderColor: '#25D366',
  },
  reportButton: {
    borderColor: '#f44336',
  },
  // Report Modal Styles
  reportModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  reportModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '85%',
  },
  reportModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  reportModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  reportModalSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  reportReasons: {
    marginBottom: 20,
  },
  reportReasonOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 8,
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    gap: 10,
  },
  reportReasonSelected: {
    backgroundColor: '#ffebee',
    borderColor: '#f44336',
  },
  reportReasonText: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  reportReasonTextSelected: {
    color: '#f44336',
    fontWeight: '500',
  },
  reportDescLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  reportDescInput: {
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  reportModalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  reportCancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    alignItems: 'center',
  },
  reportCancelButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  reportSubmitButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#f44336',
  },
  reportSubmitButtonDisabled: {
    backgroundColor: '#ccc',
  },
  reportSubmitButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
  },
  // Bookstore selection for purchase
  bookstoresAvailableSubtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  bookstoreAvailableCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  bookstoreAvailableCardSelected: {
    backgroundColor: '#e8f5e9',
    borderColor: '#1a472a',
  },
  bookstoreAvailableHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bookstoreAvailableInfo: {
    flex: 1,
  },
  bookstoreAvailableNameSelected: {
    color: '#1a472a',
  },
  bookstoreAvailableAddress: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  mapsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-end',
    marginTop: 10,
  },
  mapsButtonText: {
    fontSize: 13,
    color: '#1a472a',
    fontWeight: '600',
  },
  // Questions Section
  questionsSection: {
    backgroundColor: '#f8f9fa',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  questionsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  questionsSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  comingSoonText: {
    fontSize: 13,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 8,
    marginLeft: 34,
  },
  questionsSectionSubtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 16,
  },
  questionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    gap: 12,
  },
  questionButtonText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  // Bookstore Selection Card
  bookstoreSelectionCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  questionsSubtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 8,
    marginBottom: 12,
  },
  contactSellerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a472a',
    padding: 14,
    borderRadius: 12,
    gap: 10,
  },
  contactSellerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  // Simplified price display
  totalPriceContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  totalPriceLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  totalPriceValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  serviceRLB: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  foderazioneLine: {
    fontSize: 13,
    color: '#4CAF50',
    marginTop: 8,
    fontWeight: '600',
  },
  // Condizione percentuale row
  conditionPercentageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  conditionPercentageLabel: {
    fontSize: 14,
    color: '#666',
  },
  conditionPercentageValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  // Esercizi svolti
  eserciziSvoltiContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  eserciziSvoltiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  eserciziSvoltiLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF9800',
  },
  eserciziSvoltiTags: {
    flexDirection: 'row',
    gap: 8,
  },
  eserciziTag: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FF9800',
  },
  eserciziTagText: {
    fontSize: 12,
    color: '#FF9800',
    fontWeight: '600',
  },
  // Foto del libro
  photosCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  photosTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  photosScroll: {
    flexDirection: 'row',
  },
  photoThumbnail: {
    width: 100,
    height: 100,
    borderRadius: 8,
    marginRight: 10,
  },
  // Foderazione libro
  foderaturaCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  foderaturaContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  foderaturaCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#1a472a',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  foderaturaCheckboxChecked: {
    backgroundColor: '#1a472a',
  },
  foderaturaTextContainer: {
    flex: 1,
  },
  foderaturaTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  foderaturaSubtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
});
