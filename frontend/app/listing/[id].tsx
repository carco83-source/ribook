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
  seller_username: string;
  book_id: string;
  book_titolo: string;
  book_autore?: string;
  book_autori?: string;
  book_isbn: string;
  book_materia?: string;
  book_disciplina?: string;
  book_classe?: string;
  prezzo_ministeriale?: number;
  prezzo_copertina?: number;
  condizione: string;
  condition_details?: {
    sottolineature: number;
    copertina: number;
    pagine: number;
    esercizi: number;
  };
  prezzo_vendita: number;
  ha_fascicoli?: boolean;
  fascicoli_totali?: number;
  fascicoli_presenti?: number;
  bookstore_ids?: string[];
  bookstore_names?: string[];
  note?: string;
  foto_base64?: string;
  stato: string;
}

// Helper functions
const getListingAuthor = (listing: Listing | null): string => {
  if (!listing) return 'N/A';
  return listing.book_autore || listing.book_autori || 'N/A';
};
const getListingPrice = (listing: Listing | null): number => {
  if (!listing) return 0;
  return listing.prezzo_ministeriale || listing.prezzo_copertina || 0;
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

  const calculateCommission = () => {
    if (!listing) return { commission: 0, total: 0 };
    if (isPremium) {
      return { commission: 0, total: listing.prezzo_vendita };
    }
    const commission = listing.prezzo_vendita * 0.15;
    return { commission, total: listing.prezzo_vendita };
  };

  const handleShare = async () => {
    if (!listing) return;
    
    const message = `📚 ${listing.book_titolo}\n` +
      `✍️ ${listing.book_autore}\n` +
      `💰 Prezzo: €${listing.prezzo_vendita.toFixed(2)}\n` +
      `📖 Condizione: ${getConditionLabel(listing.condizione)}\n\n` +
      `Trovato su RiLiBro - L'app per scambiare libri scolastici usati a Catanzaro!`;

    try {
      await Share.share({
        message,
        title: `${listing.book_titolo} in vendita su RiLiBro`,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleShareWhatsApp = async () => {
    if (!listing) return;
    
    const message = `📚 *${listing.book_titolo}*\n` +
      `✍️ ${listing.book_autore}\n` +
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

  const { commission, total } = calculateCommission();

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
          <Text style={styles.price}>€{listing.prezzo_vendita.toFixed(2)}</Text>
          <View style={styles.conditionBadge}>
            <Text style={styles.conditionText}>
              {getConditionLabel(listing.condizione)}
            </Text>
          </View>
        </View>

        <Text style={styles.title}>{listing.book_titolo}</Text>
        <Text style={styles.author}>{listing.book_autore}</Text>

        <View style={styles.metaContainer}>
          <View style={styles.metaItem}>
            <Ionicons name="school-outline" size={16} color="#666" />
            <Text style={styles.metaText}>Classe {listing.book_classe}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="bookmark-outline" size={16} color="#666" />
            <Text style={styles.metaText}>{listing.book_materia}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="barcode-outline" size={16} color="#666" />
            <Text style={styles.metaText}>{listing.book_isbn}</Text>
          </View>
        </View>

        {/* Condition Details */}
        {listing.condition_details && (
          <View style={styles.conditionDetailsCard}>
            <Text style={styles.conditionDetailsTitle}>Stato del libro</Text>
            <View style={styles.conditionGrid}>
              <View style={styles.conditionItem}>
                <Text style={styles.conditionItemLabel}>Scritte/evidenziature</Text>
                <Text style={styles.conditionItemValue}>
                  {['✨ Nessuna', '✏️ Poche', '🖊️ Molte'][listing.condition_details.sottolineature]}
                </Text>
              </View>
              <View style={styles.conditionItem}>
                <Text style={styles.conditionItemLabel}>Copertina</Text>
                <Text style={styles.conditionItemValue}>
                  {['✨ Integra', '⚠️ Un po\' rovinata', '📉 Molto rovinata'][listing.condition_details.copertina]}
                </Text>
              </View>
              <View style={styles.conditionItem}>
                <Text style={styles.conditionItemLabel}>Pagine</Text>
                <Text style={styles.conditionItemValue}>
                  {['✨ Perfette', '📄 Qualche piega', '📚 Molte pieghe'][listing.condition_details.pagine]}
                </Text>
              </View>
              <View style={styles.conditionItem}>
                <Text style={styles.conditionItemLabel}>Esercizi compilati</Text>
                <Text style={styles.conditionItemValue}>
                  {['✨ Nessuno', '📝 Alcuni', '📋 Molti'][listing.condition_details.esercizi]}
                </Text>
              </View>
            </View>
          </View>
        )}

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
        {listing.bookstore_names && listing.bookstore_names.length > 0 && (
          <View style={styles.bookstoresAvailableCard}>
            <Text style={styles.bookstoresAvailableTitle}>Punti di ritiro disponibili</Text>
            <Text style={styles.bookstoresAvailableSubtitle}>Seleziona dove vuoi ritirare il libro</Text>
            {listing.bookstore_names.map((name: string, index: number) => {
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
            })}
          </View>
        )}

        <View style={styles.sellerCard}>
          <Ionicons name="person-circle-outline" size={24} color="#1a472a" />
          <Text style={styles.sellerText}>Venditore: {listing.seller_username}</Text>
        </View>
        
        {listing.note && (
          <View style={styles.noteCard}>
            <Text style={styles.noteTitle}>Note del venditore:</Text>
            <Text style={styles.noteText}>{listing.note}</Text>
          </View>
        )}

        {/* Price Breakdown */}
        <View style={styles.priceBreakdown}>
          <Text style={styles.breakdownTitle}>Riepilogo costi</Text>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Prezzo libro:</Text>
            <Text style={styles.breakdownValue}>
              €{listing.prezzo_vendita.toFixed(2)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>
              Commissione ({isPremium ? 'Premium' : 'Standard'}):
            </Text>
            <Text
              style={[
                styles.breakdownValue,
                { color: isPremium ? '#4CAF50' : '#f4a460' },
              ]}
            >
              {isPremium ? 'GRATIS' : `\u20ac${commission.toFixed(2)} (15%)`}
            </Text>
          </View>
          <View style={[styles.breakdownRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Totale:</Text>
            <Text style={styles.totalValue}>
              €{(total + commission).toFixed(2)}
            </Text>
          </View>
          
          {!isPremium && (
            <TouchableOpacity
              style={styles.premiumHint}
              onPress={() => router.push('/(tabs)/profile')}
            >
              <Ionicons name="diamond" size={16} color="#f4a460" />
              <Text style={styles.premiumHintText}>
                Diventa Premium per risparmiare \u20ac{commission.toFixed(2)}!
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Bookstore Selection - ONLY seller's bookstores */}
        {listing.bookstores && listing.bookstores.length > 0 ? (
          <View style={styles.bookstoreSelectionCard}>
            <Text style={styles.sectionTitle}>Seleziona punto di ritiro</Text>
            <Text style={styles.sectionSubtitle}>Il venditore consegnerà il libro qui</Text>
            
            {listing.bookstores.map((store: any, index: number) => (
              <TouchableOpacity
                key={store.id || index}
                style={[
                  styles.bookstoreItem,
                  selectedBookstore?.id === store.id && styles.bookstoreItemSelected,
                ]}
                onPress={() => setSelectedBookstore(store)}
              >
                <Ionicons 
                  name={selectedBookstore?.id === store.id ? "radio-button-on" : "radio-button-off"} 
                  size={22} 
                  color={selectedBookstore?.id === store.id ? "#1a472a" : "#666"} 
                />
                <View style={styles.bookstoreInfo}>
                  <Text style={[
                    styles.bookstoreName,
                    selectedBookstore?.id === store.id && { color: '#1a472a', fontWeight: '600' }
                  ]}>
                    {store.nome}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.noBookstores}>
            <Ionicons name="alert-circle-outline" size={24} color="#f4a460" />
            <Text style={styles.noBookstoresText}>
              Nessun punto di ritiro disponibile per questo annuncio
            </Text>
          </View>
        )}

        {/* Add to Cart Button */}
        <TouchableOpacity
          style={[
            styles.purchaseButton,
            (!selectedBookstore || purchasing) && styles.purchaseButtonDisabled,
          ]}
          onPress={handleAddToCart}
          disabled={!selectedBookstore || purchasing}
        >
          {purchasing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="cart-outline" size={24} color="#fff" />
              <Text style={styles.purchaseButtonText}>Aggiungi al carrello</Text>
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
  conditionItemValue: {
    fontSize: 14,
    fontWeight: '500',
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
});
