import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { SafeAreaView } from 'react-native-safe-area-context';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';

interface OrderToPay {
  id: string;
  order_code: string;
  book_titolo: string;
  book_autore?: string;
  book_isbn: string;
  seller_name: string;
  bookstore_name: string;
  prezzo_libro: number;
  commissione_app: number;
  commissione_cartolibreria: number;
  totale_acquirente: number;
  status: string;
  created_at: string;
}

export default function CartScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderToPay[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [payingOrderId, setPayingOrderId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadOrders();
    }, [])
  );

  const loadOrders = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      setUserId(storedUserId);

      if (!storedUserId) {
        setLoading(false);
        return;
      }

      // Carica ordini dell'utente
      const response = await axios.get(`${API_URL}/api/user-orders/${storedUserId}`);
      const allOrders = response.data.orders || [];
      
      // Filtra solo ordini in attesa di pagamento (carrello)
      const ordersToPay = allOrders.filter((o: any) => 
        o.status === 'in_attesa_pagamento' || o.status === 'pending_payment'
      );
      
      setOrders(ordersToPay);
    } catch (error: any) {
      console.error('Error loading orders:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadOrders();
  };

  const handlePayOrder = async (order: OrderToPay) => {
    // Su web, usa confirm invece di Alert
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        `Conferma acquisto\n\nStai per acquistare:\n📚 ${order.book_titolo}\n\nTotale: €${order.totale_acquirente.toFixed(2)}`
      );
      
      if (confirmed) {
        setPayingOrderId(order.id);
        try {
          await axios.post(`${API_URL}/api/orders/${order.id}/pay?user_id=${userId}`);
          window.alert(
            `✅ Acquisto effettuato con successo!\n\n📚 ${order.book_titolo}\n\n🏪 Ritiro presso: ${order.bookstore_name}\n\nIl venditore ha 2 giorni lavorativi per consegnare il libro.\n\n(Presto inseriremo un vero sistema Stripe per i pagamenti)`
          );
          loadOrders();
        } catch (error: any) {
          window.alert('Errore: ' + (error.response?.data?.detail || 'Errore nel pagamento'));
        } finally {
          setPayingOrderId(null);
        }
      }
      return;
    }
    
    // Su mobile, usa Alert
    Alert.alert(
      'Conferma acquisto',
      `Stai per acquistare:\n\n📚 ${order.book_titolo}\n\nTotale: €${order.totale_acquirente.toFixed(2)}\n\n(Prezzo: €${order.prezzo_libro.toFixed(2)} + Commissioni: €${(order.commissione_app + order.commissione_cartolibreria).toFixed(2)})`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Paga ora',
          onPress: async () => {
            setPayingOrderId(order.id);
            try {
              await axios.post(`${API_URL}/api/orders/${order.id}/pay?user_id=${userId}`);
              Alert.alert(
                '✅ Acquisto effettuato con successo!',
                `📚 ${order.book_titolo}\n\n🏪 Ritiro presso: ${order.bookstore_name}\n\nIl venditore ha 2 giorni lavorativi per consegnare il libro.\n\n(Presto inseriremo un vero sistema Stripe per i pagamenti)`,
                [{ text: 'OK' }]
              );
              loadOrders();
            } catch (error: any) {
              Alert.alert('Errore', error.response?.data?.detail || 'Errore nel pagamento');
            } finally {
              setPayingOrderId(null);
            }
          },
        },
      ]
    );
  };

  const handleRemoveOrder = async (order: OrderToPay) => {
    Alert.alert(
      'Rimuovi dal carrello',
      `Vuoi rimuovere "${order.book_titolo}" dal carrello?\n\nL'ordine verrà annullato.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Rimuovi',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.post(`${API_URL}/api/orders/${order.id}/cancel?user_id=${userId}`);
              loadOrders();
            } catch (error: any) {
              Alert.alert('Errore', error.response?.data?.detail || 'Errore');
            }
          },
        },
      ]
    );
  };

  const calculateTotal = () => {
    return orders.reduce((sum, order) => sum + order.totale_acquirente, 0);
  };

  const renderOrder = ({ item }: { item: OrderToPay }) => {
    const isPaying = payingOrderId === item.id;
    
    return (
      <View style={styles.orderCard}>
        <View style={styles.orderHeader}>
          <View style={styles.bookIconContainer}>
            <Ionicons name="book" size={32} color="#1a472a" />
          </View>
          <View style={styles.orderInfo}>
            <Text style={styles.bookTitle} numberOfLines={2}>{item.book_titolo}</Text>
            {item.book_autore && (
              <Text style={styles.bookAuthor} numberOfLines={1}>{item.book_autore}</Text>
            )}
          </View>
          <TouchableOpacity 
            style={styles.removeButton}
            onPress={() => handleRemoveOrder(item)}
          >
            <Ionicons name="trash-outline" size={20} color="#f44336" />
          </TouchableOpacity>
        </View>

        <View style={styles.orderDetails}>
          <View style={styles.detailRow}>
            <Ionicons name="person-outline" size={16} color="#666" />
            <Text style={styles.detailText}>Venditore: {item.seller_name}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="storefront-outline" size={16} color="#666" />
            <Text style={styles.detailText}>Ritiro: {item.bookstore_name}</Text>
          </View>
        </View>

        <View style={styles.priceSection}>
          <View style={styles.priceBreakdown}>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Prezzo libro</Text>
              <Text style={styles.priceValue}>€{item.prezzo_libro.toFixed(2)}</Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabelSmall}>Commissioni servizio</Text>
              <Text style={styles.priceValueSmall}>€{(item.commissione_app + item.commissione_cartolibreria).toFixed(2)}</Text>
            </View>
            <View style={[styles.priceRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>Totale</Text>
              <Text style={styles.totalValue}>€{item.totale_acquirente.toFixed(2)}</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.payButton, isPaying && styles.payButtonDisabled]}
          onPress={() => handlePayOrder(item)}
          disabled={isPaying}
        >
          {isPaying ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="card" size={20} color="#fff" />
              <Text style={styles.payButtonText}>Paga €{item.totale_acquirente.toFixed(2)}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1a472a" />
        </View>
      </SafeAreaView>
    );
  }

  if (!userId) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.emptyContainer}>
          <Ionicons name="person-outline" size={64} color="#ccc" />
          <Text style={styles.emptyTitle}>Accedi per vedere il carrello</Text>
          <TouchableOpacity style={styles.loginButton} onPress={() => router.push('/login')}>
            <Text style={styles.loginButtonText}>Accedi</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {orders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="cart-outline" size={80} color="#ccc" />
          <Text style={styles.emptyTitle}>Il carrello è vuoto</Text>
          <Text style={styles.emptySubtitle}>
            Quando un venditore conferma la disponibilità di un libro, lo troverai qui pronto per l'acquisto
          </Text>
          <TouchableOpacity 
            style={styles.exploreButton}
            onPress={() => router.push('/(tabs)')}
          >
            <Ionicons name="search" size={20} color="#fff" />
            <Text style={styles.exploreButtonText}>Cerca libri</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <FlatList
            data={orders}
            renderItem={renderOrder}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContainer}
            refreshControl={
              <RefreshControl 
                refreshing={refreshing} 
                onRefresh={onRefresh}
                colors={['#1a472a']}
              />
            }
            ListHeaderComponent={
              <View style={styles.listHeader}>
                <Text style={styles.listHeaderTitle}>
                  {orders.length} {orders.length === 1 ? 'libro' : 'libri'} nel carrello
                </Text>
              </View>
            }
          />
          
          {/* Footer con totale */}
          <View style={styles.footer}>
            <View style={styles.footerTotal}>
              <Text style={styles.footerTotalLabel}>Totale carrello</Text>
              <Text style={styles.footerTotalValue}>€{calculateTotal().toFixed(2)}</Text>
            </View>
          </View>
        </>
      )}
    </SafeAreaView>
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 12,
    textAlign: 'center',
    lineHeight: 20,
  },
  exploreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a472a',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 24,
    gap: 8,
  },
  exploreButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  loginButton: {
    backgroundColor: '#1a472a',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 20,
  },
  loginButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  listContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  listHeader: {
    marginBottom: 16,
  },
  listHeaderTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  orderHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  bookIconContainer: {
    width: 56,
    height: 56,
    backgroundColor: '#e8f5e9',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  orderInfo: {
    flex: 1,
  },
  bookTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  bookAuthor: {
    fontSize: 13,
    color: '#666',
  },
  removeButton: {
    padding: 8,
  },
  orderDetails: {
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  detailText: {
    fontSize: 13,
    color: '#666',
  },
  priceSection: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 16,
    marginBottom: 16,
  },
  priceBreakdown: {
    gap: 8,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: 14,
    color: '#333',
  },
  priceValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  priceLabelSmall: {
    fontSize: 12,
    color: '#888',
  },
  priceValueSmall: {
    fontSize: 12,
    color: '#888',
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 10,
    marginTop: 8,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  payButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a472a',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  payButtonDisabled: {
    backgroundColor: '#ccc',
  },
  payButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
  },
  footerTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerTotalLabel: {
    fontSize: 16,
    color: '#666',
  },
  footerTotalValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a472a',
  },
});
