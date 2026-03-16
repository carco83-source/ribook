import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Sale {
  id: string;
  book_titolo: string;
  book_autore: string;
  prezzo_vendita: number;
  condizione: string;
  stato: string;
  days_remaining: number | null;
  deadline_consegna: string | null;
  bookstore_ritiro_nome: string | null;
  codice_ritiro: string | null;
  buyer_username?: string;
}

const STATO_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  disponibile: { label: 'In vendita', color: '#4CAF50', icon: 'pricetag' },
  venduto: { label: 'Venduto - Da consegnare', color: '#FF9800', icon: 'time' },
  consegnato: { label: 'Consegnato', color: '#2196F3', icon: 'checkmark-circle' },
  ritirato: { label: 'Completato', color: '#9C27B0', icon: 'trophy' },
};

export default function MySalesScreen() {
  const router = useRouter();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/transactions');
    }
  };

  const loadSales = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      setUserId(storedUserId);
      
      if (storedUserId) {
        const response = await axios.get(`${API_URL}/api/user/${storedUserId}/sales`);
        setSales(response.data);
      }
    } catch (error) {
      console.error('Error loading sales:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadSales();
    }, [])
  );

  const handleMarkDelivered = async (listingId: string) => {
    Alert.alert(
      'Conferma consegna',
      'Hai consegnato il libro alla cartolibreria?',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Sì, confermo',
          onPress: async () => {
            try {
              await axios.post(
                `${API_URL}/api/listings/${listingId}/mark-delivered?seller_id=${userId}`
              );
              Alert.alert('Fatto!', 'Libro segnato come consegnato');
              loadSales();
            } catch (error: any) {
              Alert.alert('Errore', error.response?.data?.detail || 'Errore durante l\'operazione');
            }
          },
        },
      ]
    );
  };

  const renderSaleCard = (sale: Sale) => {
    const config = STATO_CONFIG[sale.stato] || STATO_CONFIG.disponibile;
    const isUrgent = sale.days_remaining !== null && sale.days_remaining <= 2;

    return (
      <View key={sale.id} style={styles.saleCard}>
        {/* Header with status */}
        <View style={[styles.statusBadge, { backgroundColor: config.color }]}>
          <Ionicons name={config.icon as any} size={14} color="#fff" />
          <Text style={styles.statusText}>{config.label}</Text>
        </View>

        {/* Book info */}
        <Text style={styles.bookTitle}>{sale.book_titolo}</Text>
        <Text style={styles.bookAuthor}>{sale.book_autore}</Text>

        {/* Price and condition */}
        <View style={styles.infoRow}>
          <View style={styles.priceTag}>
            <Text style={styles.priceText}>€{sale.prezzo_vendita.toFixed(2)}</Text>
          </View>
          <Text style={styles.conditionText}>
            {sale.condizione === 'perfetto' && '🟢 Perfetto'}
            {sale.condizione === 'buono' && '🟡 Buono'}
            {sale.condizione === 'molto_usato' && '🔴 Molto usato'}
          </Text>
        </View>

        {/* Delivery info for sold items */}
        {sale.stato === 'venduto' && (
          <View style={styles.deliverySection}>
            {isUrgent && (
              <View style={styles.urgentBanner}>
                <Ionicons name="warning" size={16} color="#fff" />
                <Text style={styles.urgentText}>
                  {sale.days_remaining === 0
                    ? 'SCADENZA OGGI!'
                    : `Solo ${sale.days_remaining} giorni rimasti!`}
                </Text>
              </View>
            )}

            <View style={styles.deliveryInfo}>
              <Ionicons name="storefront" size={16} color="#666" />
              <Text style={styles.deliveryText}>
                Consegna a: <Text style={styles.deliveryBold}>{sale.bookstore_ritiro_nome}</Text>
              </Text>
            </View>

            {sale.days_remaining !== null && !isUrgent && (
              <View style={styles.deliveryInfo}>
                <Ionicons name="time" size={16} color="#666" />
                <Text style={styles.deliveryText}>
                  Hai <Text style={styles.deliveryBold}>{sale.days_remaining} giorni</Text> per consegnare
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.deliverButton}
              onPress={() => handleMarkDelivered(sale.id)}
            >
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.deliverButtonText}>Ho consegnato il libro</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Waiting for pickup */}
        {sale.stato === 'consegnato' && (
          <View style={styles.waitingSection}>
            <Ionicons name="hourglass" size={20} color="#2196F3" />
            <Text style={styles.waitingText}>
              In attesa che l'acquirente ritiri il libro
            </Text>
          </View>
        )}

        {/* Completed */}
        {sale.stato === 'ritirato' && (
          <View style={styles.completedSection}>
            <Ionicons name="checkmark-done-circle" size={20} color="#9C27B0" />
            <Text style={styles.completedText}>
              Transazione completata!
            </Text>
          </View>
        )}

        {/* Buyer info */}
        {sale.buyer_username && sale.stato !== 'disponibile' && (
          <View style={styles.buyerInfo}>
            <Ionicons name="person" size={14} color="#999" />
            <Text style={styles.buyerText}>Acquirente: {sale.buyer_username}</Text>
          </View>
        )}
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

  const pendingSales = sales.filter(s => s.stato === 'venduto');
  const activeSales = sales.filter(s => s.stato === 'disponibile');
  const deliveredSales = sales.filter(s => s.stato === 'consegnato');
  const completedSales = sales.filter(s => s.stato === 'ritirato');

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Le mie vendite',
          headerStyle: { backgroundColor: '#1a472a' },
          headerTintColor: '#fff',
          headerLeft: () => (
            <TouchableOpacity onPress={handleGoBack} style={{ paddingHorizontal: 16 }}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => {
            setRefreshing(true);
            loadSales();
          }} />
        }
      >
        {/* Pending deliveries */}
        {pendingSales.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="alert-circle" size={18} color="#FF9800" /> Da consegnare ({pendingSales.length})
            </Text>
            {pendingSales.map(renderSaleCard)}
          </View>
        )}

        {/* Waiting for pickup */}
        {deliveredSales.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="hourglass" size={18} color="#2196F3" /> In attesa di ritiro ({deliveredSales.length})
            </Text>
            {deliveredSales.map(renderSaleCard)}
          </View>
        )}

        {/* Active listings */}
        {activeSales.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="pricetag" size={18} color="#4CAF50" /> In vendita ({activeSales.length})
            </Text>
            {activeSales.map(renderSaleCard)}
          </View>
        )}

        {/* Completed */}
        {completedSales.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="trophy" size={18} color="#9C27B0" /> Completate ({completedSales.length})
            </Text>
            {completedSales.map(renderSaleCard)}
          </View>
        )}

        {sales.length === 0 && (
          <View style={styles.emptyContainer}>
            <Ionicons name="book-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>Non hai ancora messo libri in vendita</Text>
            <TouchableOpacity
              style={styles.sellButton}
              onPress={() => router.push('/listing/create')}
            >
              <Text style={styles.sellButtonText}>Vendi un libro</Text>
            </TouchableOpacity>
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
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  saleCard: {
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
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    marginBottom: 8,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  bookTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  bookAuthor: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  priceTag: {
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  priceText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  conditionText: {
    fontSize: 14,
    color: '#666',
  },
  deliverySection: {
    backgroundColor: '#fff8e1',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  urgentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f44336',
    padding: 8,
    borderRadius: 6,
    gap: 8,
    marginBottom: 12,
  },
  urgentText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  deliveryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  deliveryText: {
    fontSize: 14,
    color: '#666',
  },
  deliveryBold: {
    fontWeight: '600',
    color: '#333',
  },
  deliverButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    padding: 12,
    borderRadius: 8,
    gap: 8,
    marginTop: 8,
  },
  deliverButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  waitingSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 8,
    gap: 8,
    marginTop: 8,
  },
  waitingText: {
    color: '#1976D2',
    fontSize: 14,
  },
  completedSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3e5f5',
    padding: 12,
    borderRadius: 8,
    gap: 8,
    marginTop: 8,
  },
  completedText: {
    color: '#7B1FA2',
    fontSize: 14,
    fontWeight: '500',
  },
  buyerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  buyerText: {
    fontSize: 13,
    color: '#999',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
    marginBottom: 24,
  },
  sellButton: {
    backgroundColor: '#1a472a',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  sellButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
