import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL 
  ? `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`
  : Constants.expoConfig?.extra?.apiUrl || '/api';

interface Listing {
  id: string;
  seller_id: string;
  seller_name: string;
  seller_username: string;
  prezzo_vendita?: number;
  price?: number; // Alternative field name from API
  condizione?: string;
  condition?: string; // Alternative field name from API
  condition_details?: {
    cover?: string;
    pages?: string;
    spine?: string;
    notes?: string;
  };
  bookstores?: Array<{ id: string; nome: string }>;
}

interface BookInfo {
  isbn: string;
  titolo: string;
  disciplina: string;
  editore: string;
  autori: string;
  prezzo_copertina: number;
}

export default function BookSellersScreen() {
  const { isbn } = useLocalSearchParams<{ isbn: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bookInfo, setBookInfo] = useState<BookInfo | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [contactingId, setContactingId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      // Get current user
      const storedUserId = await AsyncStorage.getItem('user_id');
      setUserId(storedUserId);

      const response = await fetch(`${API_BASE}/listings/isbn/${isbn}`);
      if (!response.ok) {
        throw new Error('Errore nel caricamento');
      }
      const data = await response.json();
      setBookInfo(data.book);
      setListings(data.listings || []);
      setError(null);
    } catch (err: any) {
      console.error('Errore:', err);
      setError(err.message || 'Errore nel caricamento');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Handle contact seller
  const handleContactSeller = async (listing: Listing) => {
    if (!userId) {
      if (Platform.OS === 'web') {
        if (confirm('Devi accedere per contattare il venditore. Vuoi accedere ora?')) {
          router.push('/login');
        }
      } else {
        Alert.alert(
          'Accesso richiesto',
          'Devi accedere per contattare il venditore',
          [
            { text: 'Annulla', style: 'cancel' },
            { text: 'Accedi', onPress: () => router.push('/login') }
          ]
        );
      }
      return;
    }

    // Prevent contacting yourself
    if (userId === listing.seller_id) {
      if (Platform.OS === 'web') {
        alert('Non puoi contattare te stesso!');
      } else {
        Alert.alert('Attenzione', 'Non puoi contattare te stesso!');
      }
      return;
    }

    setContactingId(listing.id);

    try {
      // Create or get existing conversation
      const response = await fetch(`${API_BASE}/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyer_id: userId,
          seller_id: listing.seller_id,
          listing_id: listing.id,
          book_isbn: isbn,
          book_title: bookInfo?.titolo || 'Libro',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Navigate to chat
        router.push(`/chat/${data.id}`);
      } else {
        throw new Error('Errore nella creazione della chat');
      }
    } catch (err) {
      console.error('Error creating conversation:', err);
      if (Platform.OS === 'web') {
        alert('Errore nell\'avvio della chat. Riprova.');
      } else {
        Alert.alert('Errore', 'Impossibile avviare la chat. Riprova.');
      }
    } finally {
      setContactingId(null);
    }
  };

  useEffect(() => {
    fetchData();
  }, [isbn]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const getConditionLabel = (condizione: string) => {
    switch (condizione) {
      case 'come_nuovo': return 'Come nuovo';
      case 'buono': return 'Buono';
      case 'molto_usato': return 'Molto usato';
      default: return condizione;
    }
  };

  const getConditionColor = (condizione: string) => {
    switch (condizione) {
      case 'come_nuovo': return '#4CAF50';
      case 'buono': return '#8BC34A';
      case 'molto_usato': return '#FF9800';
      default: return '#888';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen
          options={{
            title: 'Venditori',
            headerShown: true,
            headerStyle: { backgroundColor: '#1a472a' },
            headerTintColor: '#fff',
            headerLeft: () => (
              <TouchableOpacity 
                onPress={() => router.canGoBack() ? router.back() : router.push('/(tabs)')} 
                style={{ marginLeft: 16, padding: 8 }}
              >
                <Ionicons name="arrow-back" size={24} color="#fff" />
              </TouchableOpacity>
            ),
          }}
        />
        <ActivityIndicator size="large" color="#1a472a" />
        <Text style={styles.loadingText}>Caricamento venditori...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: `${listings.length} venditor${listings.length === 1 ? 'e' : 'i'}`,
          headerShown: true,
          headerStyle: { backgroundColor: '#1a472a' },
          headerTintColor: '#fff',
          headerLeft: () => (
            <TouchableOpacity 
              onPress={() => router.canGoBack() ? router.back() : router.push('/(tabs)')} 
              style={{ marginLeft: 16, padding: 8 }}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Book Info Header */}
        {bookInfo && (
          <View style={styles.bookHeader}>
            <Text style={styles.bookDiscipline}>{bookInfo.disciplina}</Text>
            <Text style={styles.bookTitle}>{bookInfo.titolo}</Text>
            <View style={styles.bookMeta}>
              <Text style={styles.bookEditore}>{bookInfo.editore}</Text>
              {bookInfo.autori && (
                <Text style={styles.bookAutori}>{bookInfo.autori}</Text>
              )}
            </View>
            <View style={styles.bookPriceRow}>
              <Text style={styles.bookPriceLabel}>Prezzo di copertina:</Text>
              <Text style={styles.bookPrice}>€{bookInfo.prezzo_copertina?.toFixed(2)}</Text>
            </View>
            <Text style={styles.bookIsbn}>ISBN: {isbn}</Text>
          </View>
        )}

        {/* Sellers List */}
        {listings.length > 0 ? (
          <View style={styles.sellersSection}>
            <Text style={styles.sectionTitle}>
              {listings.length} {listings.length === 1 ? 'copia disponibile' : 'copie disponibili'}
            </Text>

            {listings.map((listing) => {
              // Calculate savings safely - handle both field names
              const prezzoCopertina = bookInfo?.prezzo_copertina || 0;
              const prezzoVendita = listing.prezzo_vendita || listing.price || 0;
              const savings = prezzoCopertina - prezzoVendita;
              const showSavings = prezzoCopertina > 0 && prezzoVendita > 0 && savings > 0;
              const condizione = listing.condizione || listing.condition || 'buono';

              return (
              <View
                key={listing.id}
                style={styles.sellerCard}
              >
                <View style={styles.sellerHeader}>
                  <View style={styles.sellerInfo}>
                    <View style={styles.sellerAvatar}>
                      <Text style={styles.sellerAvatarText}>
                        {listing.seller_username?.charAt(0)?.toUpperCase() || '?'}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.sellerName}>{listing.seller_username}</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.listingPrice}>€{prezzoVendita.toFixed(2)}</Text>
                    {showSavings && (
                      <Text style={styles.savings}>
                        Risparmi €{savings.toFixed(2)}
                      </Text>
                    )}
                  </View>
                </View>

                <View style={styles.conditionRow}>
                  <View style={[
                    styles.conditionBadge,
                    { backgroundColor: getConditionColor(condizione) }
                  ]}>
                    <Text style={styles.conditionText}>
                      {getConditionLabel(condizione)}
                    </Text>
                  </View>
                  
                  {listing.condition_details?.notes && (
                    <Text style={styles.conditionNotes} numberOfLines={1}>
                      {listing.condition_details.notes}
                    </Text>
                  )}
                </View>

                {listing.bookstores && listing.bookstores.length > 0 && (
                  <View style={styles.bookstoreRow}>
                    <Ionicons name="location" size={14} color="#1a472a" />
                    <Text style={styles.bookstoreText}>
                      {listing.bookstores.map(b => b.nome).join(', ')}
                    </Text>
                  </View>
                )}

                {/* Action Buttons Row */}
                <View style={styles.actionButtonsRow}>
                  {/* Contact Seller Button */}
                  <TouchableOpacity
                    style={styles.contactButton}
                    onPress={() => handleContactSeller(listing)}
                    disabled={contactingId === listing.id}
                  >
                    {contactingId === listing.id ? (
                      <ActivityIndicator size="small" color="#1a472a" />
                    ) : (
                      <>
                        <Ionicons name="chatbubble-outline" size={16} color="#1a472a" />
                        <Text style={styles.contactButtonText}>Contatta venditore</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {/* View Details Button */}
                  <TouchableOpacity
                    style={styles.viewButton}
                    onPress={() => router.push(`/listing/${listing.id}`)}
                  >
                    <Text style={styles.viewButtonText}>Vedi dettagli</Text>
                    <Ionicons name="chevron-forward" size={16} color="#1a472a" />
                  </TouchableOpacity>
                </View>
              </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="book-outline" size={64} color="#ccc" />
            <Text style={styles.emptyTitle}>Nessuna copia disponibile</Text>
            <Text style={styles.emptySubtitle}>
              Al momento nessuno sta vendendo questo libro.
              Torna più tardi o attiva le notifiche.
            </Text>
          </View>
        )}
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
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  bookHeader: {
    backgroundColor: '#fff',
    padding: 20,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  bookDiscipline: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a472a',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  bookTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  bookMeta: {
    marginBottom: 12,
  },
  bookEditore: {
    fontSize: 14,
    color: '#666',
  },
  bookAutori: {
    fontSize: 13,
    color: '#888',
    fontStyle: 'italic',
  },
  bookPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  bookPriceLabel: {
    fontSize: 13,
    color: '#666',
  },
  bookPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  bookIsbn: {
    fontSize: 11,
    color: '#999',
    fontFamily: 'monospace',
  },
  sellersSection: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  sellerCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  sellerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  sellerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sellerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1a472a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerAvatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  sellerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  listingPrice: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  savings: {
    fontSize: 12,
    color: '#4CAF50',
  },
  conditionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  conditionBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  conditionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  conditionNotes: {
    flex: 1,
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  bookstoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  bookstoreText: {
    fontSize: 13,
    color: '#1a472a',
    flex: 1,
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  viewButtonText: {
    fontSize: 14,
    color: '#1a472a',
    fontWeight: '500',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    marginTop: 4,
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  contactButtonText: {
    fontSize: 13,
    color: '#1a472a',
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    marginTop: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
});
