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

interface Book {
  listing_id: string;
  book_id: string;
  titolo: string;
  autore?: string;
  autori?: string;
  prezzo_vendita: number;
  condizione: string;
  condition_details?: {
    sottolineature: number;
    copertina: number;
    pagine: number;
    esercizi: number;
  };
}

// Helper function
const getBookAuthor = (book: Book): string => book.autore || book.autori || 'N/A';

interface Seller {
  seller_id: string;
  seller_username: string;
  scuola: string;
  classe: string;
  sezione: string;
  category: string;
  books_count: number;
  total_price: number;
  books: Book[];
}

const CATEGORY_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  stessa_sezione: { label: 'Stessa sezione', color: '#4CAF50', icon: 'people' },
  stessa_classe: { label: 'Stessa classe', color: '#2196F3', icon: 'school' },
  stessa_scuola: { label: 'Stessa scuola', color: '#FF9800', icon: 'business' },
  altri: { label: 'Altre scuole', color: '#9C27B0', icon: 'globe' },
};

const CONDITION_LABELS: Record<string, string> = {
  perfetto: '🟢 Perfetto',
  buono: '🟡 Buono',
  molto_usato: '🔴 Molto usato',
};

export default function RadarSellersScreen() {
  const router = useRouter();
  const { filter } = useLocalSearchParams<{ filter?: string }>();
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [expandedSeller, setExpandedSeller] = useState<string | null>(null);
  const [childName, setChildName] = useState<string>('');

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  useEffect(() => {
    loadSellers();
  }, [filter]);

  const loadSellers = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      setUserId(storedUserId);
      
      if (storedUserId) {
        // Get user info to show child name
        const userResponse = await axios.get(`${API_URL}/api/users/${storedUserId}`);
        const profili = userResponse.data.profili_figli || [];
        if (profili.length > 0) {
          setChildName(profili[0].nome_figlio || '');
        }
        
        const params = filter ? `?filter_type=${filter}` : '';
        const response = await axios.get(`${API_URL}/api/radar/${storedUserId}/sellers${params}`);
        setSellers(response.data);
      }
    } catch (error) {
      console.error('Error loading sellers:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const getFilterTitle = () => {
    if (!filter) return 'Tutti i venditori';
    const config = CATEGORY_CONFIG[filter];
    return config ? config.label : 'Venditori';
  };

  const handleViewSeller = (sellerId: string) => {
    router.push(`/seller/${sellerId}`);
  };

  const toggleExpand = (sellerId: string) => {
    setExpandedSeller(expandedSeller === sellerId ? null : sellerId);
  };

  const renderConditionDetails = (details: Book['condition_details']) => {
    if (!details) return null;
    
    const items = [
      { key: 'sottolineature', label: 'Scritte', values: ['✨ Nessuna', '✏️ Poche', '🖊️ Molte'] },
      { key: 'copertina', label: 'Copertina', values: ['✨ Integra', '⚠️ Un po\'', '📉 Rovinata'] },
      { key: 'pagine', label: 'Pagine', values: ['✨ Perfette', '📄 Qualche piega', '📚 Molte pieghe'] },
      { key: 'esercizi', label: 'Esercizi', values: ['✨ Non compilati', '📝 Alcuni', '📋 Molti'] },
    ];

    return (
      <View style={styles.conditionDetails}>
        {items.map(item => (
          <Text key={item.key} style={styles.conditionDetailText}>
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

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: childName ? `Libri per ${childName}` : getFilterTitle(),
          headerStyle: { backgroundColor: '#1a472a' },
          headerTintColor: '#fff',
          headerLeft: () => (
            <TouchableOpacity onPress={handleGoBack} style={{ paddingHorizontal: 16 }}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
          ),
        }}
      />

      {/* Filter tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterTabs}>
        <TouchableOpacity
          style={[styles.filterTab, !filter && styles.filterTabActive]}
          onPress={() => router.setParams({ filter: undefined })}
        >
          <Text style={[styles.filterTabText, !filter && styles.filterTabTextActive]}>Tutti</Text>
        </TouchableOpacity>
        {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
          <TouchableOpacity
            key={key}
            style={[styles.filterTab, filter === key && styles.filterTabActive]}
            onPress={() => router.setParams({ filter: key })}
          >
            <Ionicons
              name={config.icon as any}
              size={16}
              color={filter === key ? '#fff' : config.color}
            />
            <Text style={[styles.filterTabText, filter === key && styles.filterTabTextActive]}>
              {config.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => {
            setRefreshing(true);
            loadSellers();
          }} />
        }
      >
        {sellers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="search-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>Nessun venditore trovato</Text>
            <Text style={styles.emptySubtext}>
              Aggiungi libri alla tua lista dei desideri per vedere chi li vende
            </Text>
          </View>
        ) : (
          sellers.map((seller) => {
            const config = CATEGORY_CONFIG[seller.category] || CATEGORY_CONFIG.altri;
            const isExpanded = expandedSeller === seller.seller_id;

            return (
              <View key={seller.seller_id} style={styles.sellerCard}>
                {/* Header */}
                <TouchableOpacity
                  style={styles.sellerHeader}
                  onPress={() => toggleExpand(seller.seller_id)}
                >
                  <View style={[styles.sellerIcon, { backgroundColor: config.color }]}>
                    <Ionicons name="person" size={24} color="#fff" />
                  </View>
                  <View style={styles.sellerInfo}>
                    <Text style={styles.sellerUsername}>{seller.seller_username}</Text>
                    <View style={styles.categoryBadge}>
                      <Ionicons name={config.icon as any} size={12} color={config.color} />
                      <Text style={[styles.categoryText, { color: config.color }]}>
                        {config.label}
                      </Text>
                    </View>
                    <Text style={styles.sellerSchool}>
                      {seller.classe}ª{seller.sezione} - {seller.scuola.slice(0, 30)}...
                    </Text>
                  </View>
                  <View style={styles.sellerStats}>
                    <Text style={styles.booksCount}>{seller.books_count}</Text>
                    <Text style={styles.booksLabel}>libri</Text>
                    <Text style={styles.totalPrice}>€{seller.total_price.toFixed(2)}</Text>
                  </View>
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={24}
                    color="#666"
                  />
                </TouchableOpacity>

                {/* Expanded books list */}
                {isExpanded && (
                  <View style={styles.booksContainer}>
                    {seller.books.map((book, index) => (
                      <TouchableOpacity
                        key={book.listing_id}
                        style={styles.bookItem}
                        onPress={() => router.push(`/${book.listing_id}`)}
                      >
                        <View style={styles.bookInfo}>
                          <Text style={styles.bookTitle} numberOfLines={2}>
                            {book.titolo}
                          </Text>
                          <Text style={styles.bookAuthor}>{getBookAuthor(book)}</Text>
                          <Text style={styles.bookCondition}>
                            {CONDITION_LABELS[book.condizione] || book.condizione}
                          </Text>
                          {book.condition_details && renderConditionDetails(book.condition_details)}
                        </View>
                        <View style={styles.bookPriceContainer}>
                          <Text style={styles.bookPrice}>€{book.prezzo_vendita.toFixed(2)}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                    
                    <TouchableOpacity
                      style={styles.viewAllButton}
                      onPress={() => handleViewSeller(seller.seller_id)}
                    >
                      <Text style={styles.viewAllButtonText}>
                        Vedi tutti i {seller.books_count} libri
                      </Text>
                      <Ionicons name="arrow-forward" size={16} color="#1a472a" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
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
  filterTabs: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    maxHeight: 60,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    marginHorizontal: 4,
    gap: 6,
  },
  filterTabActive: {
    backgroundColor: '#1a472a',
  },
  filterTabText: {
    fontSize: 14,
    color: '#666',
  },
  filterTabTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 32,
  },
  sellerCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  sellerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  sellerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sellerInfo: {
    flex: 1,
  },
  sellerUsername: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '500',
  },
  sellerSchool: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  sellerStats: {
    alignItems: 'center',
    marginRight: 8,
  },
  booksCount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  booksLabel: {
    fontSize: 11,
    color: '#999',
  },
  totalPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a472a',
    marginTop: 4,
  },
  booksContainer: {
    backgroundColor: '#f9f9f9',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  bookItem: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  bookInfo: {
    flex: 1,
  },
  bookTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  bookAuthor: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  bookCondition: {
    fontSize: 12,
    color: '#888',
  },
  conditionDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  conditionDetailText: {
    fontSize: 10,
    color: '#888',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  bookPriceContainer: {
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  bookPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  viewAllButtonText: {
    fontSize: 14,
    color: '#1a472a',
    fontWeight: '600',
  },
});
