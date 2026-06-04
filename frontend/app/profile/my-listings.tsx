import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function MyListingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [listings, setListings] = useState<any[]>([]);

  useEffect(() => {
    loadListings();
  }, []);

  const loadListings = async () => {
    try {
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId) {
        router.replace('/');
        return;
      }

      const response = await axios.get(`${API_URL}/api/listings/user/${userId}`);
      setListings(response.data || []);
    } catch (error) {
      console.error('Error loading listings:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadListings();
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#FF9800" />
        <Text style={styles.loadingText}>Caricamento annunci...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>I Miei Annunci</Text>
        <View style={styles.headerRight}>
          <Text style={styles.countBadge}>{listings.length}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#FF9800']} />
        }
      >
        {listings.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="book-outline" size={64} color="#ccc" />
            <Text style={styles.emptyTitle}>Nessun annuncio</Text>
            <Text style={styles.emptySubtitle}>
              Non hai ancora messo in vendita nessun libro
            </Text>
            <TouchableOpacity 
              style={styles.addButton}
              onPress={() => router.push('/(tabs)/search')}
            >
              <Ionicons name="add" size={22} color="#fff" />
              <Text style={styles.addButtonText}>Vendi un libro</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {listings.map((listing: any, index: number) => {
              const coverUrl = listing.cover_url || listing.foto_base64 || 
                `https://www.ibs.it/images/${listing.book_isbn}_0_0_0_180_50.jpg`;
              const isCustomPrice = listing.is_custom_price;
              const hasActiveOrder = listing.order_id || listing.stato === 'riservato';
              const canEdit = listing.stato === 'disponibile' && !hasActiveOrder;
              
              return (
                <View key={listing.id || index} style={styles.listingCard}>
                  <TouchableOpacity 
                    style={styles.listingCardInner}
                    onPress={() => router.push(`/my-listing/${listing.id}`)}
                  >
                    <Image 
                      source={{ uri: coverUrl }}
                      style={styles.listingCover}
                      resizeMode="cover"
                    />
                    <View style={styles.listingContent}>
                      <View style={styles.listingHeader}>
                        <View style={[
                          styles.typeBadge, 
                          { backgroundColor: isCustomPrice ? '#FFF3E0' : '#E8F5E9' }
                        ]}>
                          <Text style={[
                            styles.typeBadgeText,
                            { color: isCustomPrice ? '#FF9800' : '#4CAF50' }
                          ]}>
                            {isCustomPrice ? 'Non scolastico' : 'Scolastico'}
                          </Text>
                        </View>
                        <Text style={styles.listingPrice}>€{listing.prezzo_vendita?.toFixed(2)}</Text>
                      </View>
                      
                      <Text style={styles.listingTitle} numberOfLines={2}>
                        {listing.book_titolo || 'Titolo non disponibile'}
                      </Text>
                      
                      {listing.book_autori && (
                        <Text style={styles.listingAuthor} numberOfLines={1}>
                          {listing.book_autori}
                        </Text>
                      )}
                      
                      <View style={styles.listingMeta}>
                        <View style={[
                          styles.statusBadge, 
                          { backgroundColor: listing.stato === 'disponibile' ? '#E8F5E9' : '#FFF8E1' }
                        ]}>
                          <View style={[
                            styles.statusDot,
                            { backgroundColor: listing.stato === 'disponibile' ? '#4CAF50' : '#FFC107' }
                          ]} />
                          <Text style={[
                            styles.statusText,
                            { color: listing.stato === 'disponibile' ? '#4CAF50' : '#FF9800' }
                          ]}>
                            {listing.stato === 'disponibile' ? 'In vendita' : listing.stato}
                          </Text>
                        </View>
                        
                        {listing.bookstore_names && listing.bookstore_names[0] && (
                          <View style={styles.locationMeta}>
                            <Ionicons name="storefront-outline" size={12} color="#888" />
                            <Text style={styles.locationText} numberOfLines={1}>
                              {listing.bookstore_names[0]}
                            </Text>
                          </View>
                        )}
                      </View>
                      
                      {/* Info condizioni */}
                      {listing.condizioni && (
                        <View style={styles.conditionsInfo}>
                          <Text style={styles.conditionsLabel}>Condizioni: {listing.condizioni}</Text>
                        </View>
                      )}
                    </View>
                    
                    <Ionicons name="chevron-forward" size={20} color="#ccc" />
                  </TouchableOpacity>
                  
                </View>
              );
            })}
            
            {/* Add new listing button */}
            <TouchableOpacity 
              style={styles.addNewButton}
              onPress={() => router.push('/(tabs)/search')}
            >
              <Ionicons name="add-circle" size={24} color="#FF9800" />
              <Text style={styles.addNewButtonText}>Vendi un altro libro</Text>
            </TouchableOpacity>
          </>
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
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  headerRight: {
    padding: 8,
  },
  countBadge: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FF9800',
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginTop: 8,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF9800',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 25,
    marginTop: 24,
    gap: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  listingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  listingCover: {
    width: 70,
    height: 100,
    borderRadius: 8,
    backgroundColor: '#e0e0e0',
  },
  listingContent: {
    flex: 1,
    marginLeft: 12,
  },
  listingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  listingPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  listingTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginTop: 6,
  },
  listingAuthor: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  listingMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 10,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '500',
  },
  locationMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  locationText: {
    fontSize: 11,
    color: '#888',
    flex: 1,
  },
  addNewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#FF9800',
    borderRadius: 12,
    borderStyle: 'dashed',
    marginTop: 8,
  },
  addNewButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FF9800',
  },
  listingCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  conditionsInfo: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  conditionsLabel: {
    fontSize: 11,
    color: '#666',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#E3F2FD',
    marginHorizontal: -16,
    marginBottom: -12,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    paddingHorizontal: 16,
  },
  editButtonText: {
    color: '#2196F3',
    fontSize: 14,
    fontWeight: '600',
  },
  activeOrderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#FFF8E1',
    marginHorizontal: -16,
    marginBottom: -12,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    paddingHorizontal: 16,
  },
  activeOrderText: {
    color: '#FF9800',
    fontSize: 12,
    fontStyle: 'italic',
  },
});
