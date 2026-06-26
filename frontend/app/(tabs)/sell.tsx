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
import { authApi } from '../../src/utils/api';
import { secureGet, STORAGE_KEYS } from '../../src/utils/secureStorage';
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
  prezzo?: number;
  commissione_app: number;
  commissione_cartolibreria: number;
  totale_acquirente: number;
  include_foderazione?: boolean;
  costo_foderazione?: number;
  status: string;
  created_at: string;
}

export default function CartScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderToPay[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [payingAll, setPayingAll] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [updatingFoderazione, setUpdatingFoderazione] = useState<string | null>(null);

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
        setIsAnonymous(true);
        setLoading(false);
        return;
      }
      setIsAnonymous(false);

      // Carica ordini dell'utente (usando API autenticata)
      const response = await authApi.get(`/api/user-orders/${storedUserId}`);
      const allOrders = response.orders || [];
      
      // Filtra solo ordini in attesa di pagamento DOVE L'UTENTE È L'ACQUIRENTE
      const ordersToPay = allOrders.filter((o: any) => 
        (o.status === 'in_attesa_pagamento' || o.status === 'pending_payment') &&
        o.buyer_id === storedUserId  // Solo ordini dove sono l'acquirente
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

  const handleRemoveOrder = async (order: OrderToPay) => {
    // Su web, usa confirm invece di Alert
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        `Rimuovi dal carrello?\n\nVuoi rimuovere "${order.book_titolo}" dal carrello?\n\nL'ordine verrà annullato.`
      );
      
      if (confirmed) {
        try {
          await axios.post(`${API_URL}/api/orders/${order.id}/cancel?user_id=${userId}`);
          loadOrders();
        } catch (error: any) {
          window.alert('Errore: ' + (error.response?.data?.detail || 'Errore'));
        }
      }
      return;
    }
    
    // Su mobile, usa Alert
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

  // Toggle foderazione per un ordine
  const handleToggleFoderazione = async (order: OrderToPay) => {
    if (!userId) return;
    
    setUpdatingFoderazione(order.id);
    try {
      const newValue = !order.include_foderazione;
      const response = await axios.put(
        `${API_URL}/api/orders/${order.id}/foderazione?buyer_id=${userId}&include_foderazione=${newValue}`
      );
      
      if (response.data) {
        // Aggiorna l'ordine nello state locale
        setOrders(prev => prev.map(o => {
          if (o.id === order.id) {
            return {
              ...o,
              include_foderazione: response.data.include_foderazione,
              costo_foderazione: response.data.costo_foderazione,
              totale_acquirente: response.data.totale_acquirente
            };
          }
          return o;
        }));
      }
    } catch (error: any) {
      console.error('Error toggling foderazione:', error);
      if (Platform.OS === 'web') {
        window.alert('Errore: ' + (error.response?.data?.detail || 'Impossibile aggiornare la foderazione'));
      } else {
        Alert.alert('Errore', error.response?.data?.detail || 'Impossibile aggiornare la foderazione');
      }
    } finally {
      setUpdatingFoderazione(null);
    }
  };

  const calculateTotal = () => {
    return orders.reduce((sum, order) => sum + order.totale_acquirente, 0);
  };

  // Pagamento unico per tutti gli ordini nel carrello
  const handlePayAll = async () => {
    if (orders.length === 0) return;
    
    const total = calculateTotal();
    const booksList = orders.map(o => `• ${o.book_titolo}`).join('\n');
    
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        `Conferma acquisto\n\nStai per acquistare ${orders.length} libri:\n${booksList}\n\nTotale: €${total.toFixed(2)}`
      );
      
      if (confirmed) {
        setPayingAll(true);
        try {
          const orderIds = orders.map(o => o.id).join(',');
          await axios.post(`${API_URL}/api/orders/pay-batch?user_id=${userId}&order_ids=${orderIds}`);
          
          const bookstores = [...new Set(orders.map(o => o.bookstore_name))];
          window.alert(
            `✅ Acquisto completato!\n\n${orders.length} libri acquistati per €${total.toFixed(2)}\n\n🏪 Ritiro presso:\n${bookstores.join('\n')}\n\nI venditori hanno 2 giorni lavorativi per consegnare.`
          );
          loadOrders();
        } catch (error: any) {
          window.alert('Errore: ' + (error.response?.data?.detail || 'Errore nel pagamento'));
        } finally {
          setPayingAll(false);
        }
      }
      return;
    }
    
    // Su mobile, usa Alert
    Alert.alert(
      'Conferma acquisto',
      `Stai per acquistare ${orders.length} libri:\n\n${booksList}\n\nTotale: €${total.toFixed(2)}`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: `Paga €${total.toFixed(2)}`,
          onPress: async () => {
            setPayingAll(true);
            try {
              const orderIds = orders.map(o => o.id).join(',');
              await axios.post(`${API_URL}/api/orders/pay-batch?user_id=${userId}&order_ids=${orderIds}`);
              
              const bookstores = [...new Set(orders.map(o => o.bookstore_name))];
              Alert.alert(
                '✅ Acquisto completato!',
                `${orders.length} libri acquistati per €${total.toFixed(2)}\n\n🏪 Ritiro presso:\n${bookstores.join('\n')}\n\nI venditori hanno 2 giorni lavorativi per consegnare.`,
                [{ text: 'OK' }]
              );
              loadOrders();
            } catch (error: any) {
              Alert.alert('Errore', error.response?.data?.detail || 'Errore nel pagamento');
            } finally {
              setPayingAll(false);
            }
          },
        },
      ]
    );
  };

  const renderOrder = ({ item }: { item: OrderToPay }) => {
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
              <Text style={styles.priceValue}>€{(item.prezzo_libro || item.prezzo || 0).toFixed(2)}</Text>
            </View>
            
            {/* Toggle Foderazione */}
            <TouchableOpacity 
              style={styles.foderazioneToggle}
              onPress={() => handleToggleFoderazione(item)}
              disabled={updatingFoderazione === item.id}
            >
              <View style={[
                styles.foderazioneCheckbox,
                item.include_foderazione && styles.foderazioneCheckboxChecked
              ]}>
                {updatingFoderazione === item.id ? (
                  <ActivityIndicator size="small" color={item.include_foderazione ? "#fff" : "#1a472a"} />
                ) : item.include_foderazione ? (
                  <Ionicons name="checkmark" size={14} color="#fff" />
                ) : null}
              </View>
              <View style={styles.foderazioneInfo}>
                <Text style={styles.foderazioneLabel}>📗 Foderazione libro</Text>
              </View>
              <Text style={styles.foderazionePrice}>+€1.50</Text>
            </TouchableOpacity>
            
            {item.include_foderazione && (
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Foderazione</Text>
                <Text style={styles.priceValue}>€{(item.costo_foderazione || 1.50).toFixed(2)}</Text>
              </View>
            )}
            <View style={[styles.priceRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>Subtotale</Text>
              <Text style={styles.totalValue}>€{(item.totale_acquirente || (item.prezzo_libro || item.prezzo || 0) + (item.include_foderazione ? 1.50 : 0)).toFixed(2)}</Text>
            </View>
          </View>
        </View>

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

  // Schermata per utenti non loggati
  if (isAnonymous) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.anonymousContainer}>
          <Ionicons name="cart-outline" size={80} color="#ccc" />
          <Text style={styles.anonymousTitle}>Accedi per il carrello</Text>
          <Text style={styles.anonymousSubtitle}>
            Per acquistare libri usati devi accedere al tuo account
          </Text>
          <TouchableOpacity
            style={styles.anonymousButton}
            onPress={() => router.push('/(auth)/login')}
          >
            <Ionicons name="log-in-outline" size={20} color="#fff" />
            <Text style={styles.anonymousButtonText}>Accedi</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.anonymousRegisterLink}
            onPress={() => router.push('/(auth)/register')}
          >
            <Text style={styles.anonymousRegisterText}>
              Non hai un account? <Text style={styles.anonymousRegisterBold}>Registrati</Text>
            </Text>
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
            Quando clicchi "Acquista ora" su un libro e il venditore confermerà la disponibilità, lo troverai qui pronto per il pagamento.
          </Text>
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
          
          {/* Footer con totale e pulsante PAGA TUTTO */}
          <View style={styles.footer}>
            <View style={styles.footerTotal}>
              <Text style={styles.footerTotalLabel}>Totale carrello</Text>
              <Text style={styles.footerTotalValue}>€{calculateTotal().toFixed(2)}</Text>
            </View>
            
            {/* Pulsante PAGA TUTTO */}
            <TouchableOpacity
              style={[styles.payAllButton, payingAll && styles.payAllButtonDisabled]}
              onPress={handlePayAll}
              disabled={payingAll || orders.length === 0}
            >
              {payingAll ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="wallet" size={22} color="#fff" />
                  <Text style={styles.payAllButtonText}>
                    Paga tutto €{calculateTotal().toFixed(2)}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            
            <Text style={styles.footerNote}>
              {orders.length > 1 ? 'I fondi verranno divisi tra i venditori' : 'Pagamento sicuro'}
            </Text>
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 10,
  },
  footerTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
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
  payAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a472a',
    padding: 18,
    borderRadius: 14,
    gap: 10,
  },
  payAllButtonDisabled: {
    backgroundColor: '#aaa',
  },
  payAllButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
  },
  footerNote: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    marginTop: 10,
  },
  // Stili per utenti anonimi
  anonymousContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  anonymousTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
    marginBottom: 12,
  },
  anonymousSubtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
    maxWidth: 300,
  },
  anonymousButton: {
    backgroundColor: '#1a472a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 25,
    gap: 8,
  },
  anonymousButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  anonymousRegisterLink: {
    marginTop: 20,
  },
  anonymousRegisterText: {
    color: '#666',
    fontSize: 14,
  },
  anonymousRegisterBold: {
    color: '#1a472a',
    fontWeight: 'bold',
  },
  // Toggle Foderazione styles
  foderazioneToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    padding: 12,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  foderazioneCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#1a472a',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  foderazioneCheckboxChecked: {
    backgroundColor: '#1a472a',
  },
  foderazioneInfo: {
    flex: 1,
  },
  foderazioneLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a472a',
  },
  foderazionePrice: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a472a',
  },
});
