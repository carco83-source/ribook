import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Listing {
  id: string;
  book_titolo: string;
  book_autore: string;
  book_isbn: string;
  book_materia: string;
  book_classe: string;
  prezzo_vendita: number;
  condizione: string;
  condition_details?: {
    sottolineature: number;
    copertina: number;
    pagine: number;
    esercizi: number;
  };
  is_wanted: boolean;
}

interface Seller {
  id: string;
  username: string;
  scuola: string;
  classe: string;
  sezione: string;
}

const CONDITION_LABELS: Record<string, { label: string; color: string }> = {
  perfetto: { label: '🟢 Perfetto', color: '#4CAF50' },
  buono: { label: '🟡 Buono', color: '#FF9800' },
  molto_usato: { label: '🔴 Molto usato', color: '#f44336' },
};

export default function SellerProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [seller, setSeller] = useState<Seller | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      setUserId(storedUserId);
      
      const response = await axios.get(
        `${API_URL}/api/seller/${id}/listings${storedUserId ? `?buyer_id=${storedUserId}` : ''}`
      );
      
      setSeller(response.data.seller);
      setListings(response.data.listings);
    } catch (error) {
      console.error('Error loading seller data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const renderConditionDetails = (details: Listing['condition_details']) => {
    if (!details) return null;
    
    const items = [
      { key: 'sottolineature', values: ['✨', '✏️', '🖊️'] },
      { key: 'copertina', values: ['✨', '⚠️', '📉'] },
      { key: 'pagine', values: ['✨', '📄', '📚'] },
      { key: 'esercizi', values: ['✨', '📝', '📋'] },
    ];

    return (
      <View style={styles.conditionIcons}>
        {items.map(item => (
          <Text key={item.key} style={styles.conditionIcon}>
            {item.values[details[item.key as keyof typeof details] || 0]}
          </Text>
        ))}
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

  if (!seller) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={64} color="#ccc" />
        <Text style={styles.errorText}>Venditore non trovato</Text>
      </View>
    );
  }

  const wantedBooks = listings.filter(l => l.is_wanted);
  const otherBooks = listings.filter(l => !l.is_wanted);
  const totalPrice = listings.reduce((sum, l) => sum + l.prezzo_vendita, 0);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: seller.username,
          headerStyle: { backgroundColor: '#1a472a' },
          headerTintColor: '#fff',
        }}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => {
            setRefreshing(true);
            loadData();
          }} />
        }
      >
        {/* Seller Card */}
        <View style={styles.sellerCard}>
          <View style={styles.sellerIcon}>
            <Ionicons name="person" size={32} color="#fff" />
          </View>
          <View style={styles.sellerInfo}>
            <Text style={styles.sellerUsername}>{seller.username}</Text>
            <Text style={styles.sellerSchool}>{seller.scuola}</Text>
            <Text style={styles.sellerClass}>
              Classe {seller.classe}ª{seller.sezione}
            </Text>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{listings.length}</Text>
            <Text style={styles.statLabel}>Libri in vendita</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{wantedBooks.length}</Text>
            <Text style={styles.statLabel}>Che ti interessano</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: '#1a472a' }]}>
              €{totalPrice.toFixed(0)}
            </Text>
            <Text style={styles.statLabel}>Totale</Text>
          </View>
        </View>

        {/* Wanted Books */}
        {wantedBooks.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="heart" size={20} color="#e91e63" />
              <Text style={styles.sectionTitle}>Libri che cerchi ({wantedBooks.length})</Text>
            </View>
            {wantedBooks.map((listing) => (
              <TouchableOpacity
                key={listing.id}
                style={[styles.bookCard, styles.wantedCard]}
                onPress={() => router.push(`/listing/${listing.id}`)}
              >
                <View style={styles.bookInfo}>
                  <Text style={styles.bookTitle} numberOfLines={2}>
                    {listing.book_titolo}
                  </Text>
                  <Text style={styles.bookAuthor}>{listing.book_autore}</Text>
                  <Text style={styles.bookMeta}>
                    {listing.book_materia} • Classe {listing.book_classe}
                  </Text>
                  <View style={styles.conditionRow}>
                    <Text style={[
                      styles.conditionBadge,
                      { backgroundColor: CONDITION_LABELS[listing.condizione]?.color || '#666' }
                    ]}>
                      {CONDITION_LABELS[listing.condizione]?.label || listing.condizione}
                    </Text>
                    {listing.condition_details && renderConditionDetails(listing.condition_details)}
                  </View>
                </View>
                <View style={styles.bookPriceContainer}>
                  <Text style={styles.bookPrice}>€{listing.prezzo_vendita.toFixed(2)}</Text>
                  <Ionicons name="chevron-forward" size={20} color="#999" />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Other Books */}
        {otherBooks.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="book" size={20} color="#666" />
              <Text style={styles.sectionTitle}>Altri libri ({otherBooks.length})</Text>
            </View>
            {otherBooks.map((listing) => (
              <TouchableOpacity
                key={listing.id}
                style={styles.bookCard}
                onPress={() => router.push(`/listing/${listing.id}`)}
              >
                <View style={styles.bookInfo}>
                  <Text style={styles.bookTitle} numberOfLines={2}>
                    {listing.book_titolo}
                  </Text>
                  <Text style={styles.bookAuthor}>{listing.book_autore}</Text>
                  <Text style={styles.bookMeta}>
                    {listing.book_materia} • Classe {listing.book_classe}
                  </Text>
                  <View style={styles.conditionRow}>
                    <Text style={[
                      styles.conditionBadge,
                      { backgroundColor: CONDITION_LABELS[listing.condizione]?.color || '#666' }
                    ]}>
                      {CONDITION_LABELS[listing.condizione]?.label || listing.condizione}
                    </Text>
                  </View>
                </View>
                <View style={styles.bookPriceContainer}>
                  <Text style={styles.bookPrice}>€{listing.prezzo_vendita.toFixed(2)}</Text>
                  <Ionicons name="chevron-forward" size={20} color="#999" />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {listings.length === 0 && (
          <View style={styles.emptyContainer}>
            <Ionicons name="book-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>Nessun libro in vendita</Text>
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
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  sellerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a472a',
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
  },
  sellerIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  sellerInfo: {
    flex: 1,
  },
  sellerUsername: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  sellerSchool: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  sellerClass: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#e0e0e0',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  bookCard: {
    flexDirection: 'row',
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
  wantedCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#e91e63',
  },
  bookInfo: {
    flex: 1,
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
    marginBottom: 4,
  },
  bookMeta: {
    fontSize: 12,
    color: '#999',
    marginBottom: 8,
  },
  conditionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  conditionBadge: {
    fontSize: 11,
    color: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  conditionIcons: {
    flexDirection: 'row',
    gap: 2,
  },
  conditionIcon: {
    fontSize: 12,
  },
  bookPriceContainer: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  bookPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a472a',
    marginBottom: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
  },
});
