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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
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
  book_autore: string;
  book_isbn: string;
  book_materia: string;
  book_classe: string;
  prezzo_ministeriale: number;
  condizione: string;
  prezzo_vendita: number;
  note?: string;
  foto_base64?: string;
  stato: string;
}

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

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      const storedPremium = await AsyncStorage.getItem('is_premium');
      setUserId(storedUserId);
      setIsPremium(storedPremium === 'true');

      // Load listing
      const listingsResponse = await axios.get(`${API_URL}/api/listings`);
      const foundListing = listingsResponse.data.find((l: Listing) => l.id === id);
      setListing(foundListing);

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

  const handlePurchase = async () => {
    if (!selectedBookstore) {
      Alert.alert('Errore', 'Seleziona una cartolibreria per il ritiro');
      return;
    }

    Alert.alert(
      'Conferma acquisto',
      `Stai per acquistare "${listing?.book_titolo}" per \u20ac${listing?.prezzo_vendita.toFixed(2)}${!isPremium ? ' (+ 15% commissione)' : ''}.\n\nRitiro presso: ${selectedBookstore.nome}`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Conferma',
          onPress: async () => {
            setPurchasing(true);
            try {
              await axios.post(`${API_URL}/api/transactions?user_id=${userId}`, {
                listing_id: listing?.id,
                bookstore_id: selectedBookstore.id,
              });

              Alert.alert(
                'Acquisto completato!',
                `Il venditore ha 5 giorni per consegnare il libro presso ${selectedBookstore.nome}. Riceverai una notifica quando sarà pronto per il ritiro.`,
                [
                  {
                    text: 'OK',
                    onPress: () => router.push('/(tabs)/transactions'),
                  },
                ]
              );
            } catch (error: any) {
              Alert.alert(
                'Errore',
                error.response?.data?.detail || 'Impossibile completare l\'acquisto'
              );
            } finally {
              setPurchasing(false);
            }
          },
        },
      ]
    );
  };

  const sellerCard = listing ? (
    <TouchableOpacity
      style={styles.sellerCard}
      onPress={() =>
        router.push(
          `/chat/${listing.id}?otherUserId=${listing.seller_id}&otherUsername=${listing.seller_username}&title=${encodeURIComponent(listing.book_titolo)}`
        )
      }
    >
      <Ionicons name="person-circle-outline" size={24} color="#1a472a" />
      <Text style={styles.sellerText}>Venditore: {listing.seller_username}</Text>
      <View style={styles.chatBadge}>
        <Ionicons name="chatbubble" size={14} color="#fff" />
        <Text style={styles.chatBadgeText}>Chat</Text>
      </View>
    </TouchableOpacity>
  ) : null;

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

  const { commission, total } = calculateCommission();

  return (
    <ScrollView style={styles.container}>
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

        <View style={styles.sellerCard}>
          <Ionicons name="person-circle-outline" size={24} color="#1a472a" />
          <Text style={styles.sellerText}>Venditore: {listing.seller_username}</Text>
        </View>
        
        {/* Chat Button */}
        <TouchableOpacity
          style={styles.chatButton}
          onPress={() =>
            router.push(
              `/chat/${listing.id}?otherUserId=${listing.seller_id}&otherUsername=${listing.seller_username}&title=${encodeURIComponent(listing.book_titolo)}`
            )
          }
        >
          <Ionicons name="chatbubble" size={20} color="#fff" />
          <Text style={styles.chatButtonText}>Contatta venditore</Text>
        </TouchableOpacity>

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

        {/* Bookstore Selection */}
        <Text style={styles.sectionTitle}>Seleziona cartolibreria per ritiro</Text>
        
        {bookstores.length === 0 ? (
          <View style={styles.noBookstores}>
            <Text style={styles.noBookstoresText}>
              Nessuna cartolibreria disponibile nella tua zona
            </Text>
          </View>
        ) : (
          <View style={styles.bookstoresList}>
            {bookstores.map((store) => (
              <TouchableOpacity
                key={store.id}
                style={[
                  styles.bookstoreItem,
                  selectedBookstore?.id === store.id && styles.bookstoreItemSelected,
                ]}
                onPress={() => setSelectedBookstore(store)}
              >
                <View style={styles.bookstoreInfo}>
                  <Text style={styles.bookstoreName}>{store.nome}</Text>
                  <Text style={styles.bookstoreAddress}>{store.indirizzo}</Text>
                  <Text style={styles.bookstoreCity}>{store.citta}</Text>
                </View>
                {selectedBookstore?.id === store.id && (
                  <Ionicons name="checkmark-circle" size={24} color="#1a472a" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Purchase Button */}
        <TouchableOpacity
          style={[
            styles.purchaseButton,
            (!selectedBookstore || purchasing) && styles.purchaseButtonDisabled,
          ]}
          onPress={handlePurchase}
          disabled={!selectedBookstore || purchasing}
        >
          {purchasing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="cart" size={24} color="#fff" />
              <Text style={styles.purchaseButtonText}>Acquista</Text>
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
});
