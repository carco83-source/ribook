import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface EscrowOrder {
  id: string;
  order_code: string;
  buyer_id: string;
  seller_id: string;
  seller_name: string;
  listing_id: string;
  bookstore_id: string;
  bookstore_name: string;
  book_isbn: string;
  book_titolo: string;
  book_autore: string;
  prezzo_libro: number;
  commissione_app: number;
  commissione_cartolibreria: number;
  totale_acquirente: number;
  netto_venditore: number;
  status: string;
  created_at: string;
  include_foderazione?: boolean;
  costo_foderazione?: number;
}

export default function CartScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  
  const [pendingPaymentOrders, setPendingPaymentOrders] = useState<EscrowOrder[]>([]);
  const [pendingConfirmationOrders, setPendingConfirmationOrders] = useState<EscrowOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [payingOrderId, setPayingOrderId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [updatingFoderazione, setUpdatingFoderazione] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadCart();
    }, [])
  );

  const loadCart = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      const storedPremium = await AsyncStorage.getItem('is_premium');
      setUserId(storedUserId);
      setIsPremium(storedPremium === 'true');

      if (storedUserId) {
        // Carica ordini come acquirente
        const response = await axios.get(`${API_URL}/api/orders/user/${storedUserId}?role=buyer`);
        const orders = response.data?.orders || response.data || [];
        
        // Filtra ordini per stato
        const paymentReady = orders.filter((o: EscrowOrder) => 
          o.status === 'pending_payment' || o.status === 'in_attesa_pagamento'
        );
        const awaitingConfirmation = orders.filter((o: EscrowOrder) => 
          o.status === 'pending_seller_confirmation' || o.status === 'in_attesa_conferma_venditore'
        );
        
        setPendingPaymentOrders(paymentReady);
        setPendingConfirmationOrders(awaitingConfirmation);
      }
    } catch (error) {
      console.error('Error loading cart:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Toggle foderazione per un ordine
  const handleToggleFoderazione = async (order: EscrowOrder) => {
    if (!userId) return;
    
    setUpdatingFoderazione(order.id);
    try {
      const newValue = !order.include_foderazione;
      const response = await axios.put(
        `${API_URL}/api/orders/${order.id}/foderazione?buyer_id=${userId}&include_foderazione=${newValue}`
      );
      
      if (response.data) {
        // Aggiorna l'ordine nello state locale
        const updateOrder = (o: EscrowOrder) => {
          if (o.id === order.id) {
            return {
              ...o,
              include_foderazione: response.data.include_foderazione,
              costo_foderazione: response.data.costo_foderazione,
              totale_acquirente: response.data.totale_acquirente
            };
          }
          return o;
        };
        
        setPendingPaymentOrders(prev => prev.map(updateOrder));
        setPendingConfirmationOrders(prev => prev.map(updateOrder));
      }
    } catch (error: any) {
      console.error('Error toggling foderazione:', error);
      Alert.alert('Errore', error.response?.data?.detail || 'Impossibile aggiornare la foderazione');
    } finally {
      setUpdatingFoderazione(null);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadCart();
  };

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const handlePayOrder = async (order: EscrowOrder) => {
    const proceedWithPayment = async () => {
      setPayingOrderId(order.id);
      setPurchasing(true);
      
      try {
        // Effettua il pagamento simulato
        const response = await axios.post(`${API_URL}/api/orders/${order.id}/pay?user_id=${userId}`);
        
        const successMessage = `Pagamento completato!\n\n` +
          `Libro: ${order.book_titolo}\n` +
          `Codice Ordine: ${order.order_code}\n` +
          `Totale: €${order.totale_acquirente.toFixed(2)}\n\n` +
          `Il venditore è stato notificato.\n` +
          `Ritirerai il libro presso: ${order.bookstore_name}`;
        
        if (Platform.OS === 'web') {
          window.alert(successMessage);
        } else {
          Alert.alert('Pagamento completato!', successMessage, [{ text: 'OK' }]);
        }
        
        // Ricarica il carrello
        loadCart();
        
      } catch (error: any) {
        console.error('Error paying order:', error);
        const errorMsg = error.response?.data?.detail || 'Errore durante il pagamento';
        if (Platform.OS === 'web') {
          window.alert('Errore: ' + errorMsg);
        } else {
          Alert.alert('Errore', errorMsg);
        }
      } finally {
        setPayingOrderId(null);
        setPurchasing(false);
      }
    };
    
    // Su web procedi direttamente, su mobile mostra conferma
    if (Platform.OS === 'web') {
      await proceedWithPayment();
    } else {
      Alert.alert(
        'Conferma pagamento',
        `Stai per pagare €${order.totale_acquirente.toFixed(2)} per:\n\n"${order.book_titolo}"\n\nI fondi rimarranno in escrow fino al ritiro.`,
        [
          { text: 'Annulla', style: 'cancel' },
          { text: 'Paga ora', onPress: proceedWithPayment }
        ]
      );
    }
  };

  const handlePayAll = async () => {
    const total = pendingPaymentOrders.reduce((sum, o) => sum + o.totale_acquirente, 0);
    
    const proceedWithPayment = async () => {
      setPurchasing(true);
      
      try {
        // Usa il nuovo endpoint batch che raggruppa ordini dallo stesso venditore
        const orderIds = pendingPaymentOrders.map(o => o.id).join(',');
        const response = await axios.post(
          `${API_URL}/api/orders/pay-batch?user_id=${userId}&order_ids=${orderIds}`
        );
        
        const successMessage = `Tutti i pagamenti completati!\n\n` +
          `${response.data.paid_count || pendingPaymentOrders.length} libri acquistati\n` +
          `Totale: €${total.toFixed(2)}\n\n` +
          `I venditori sono stati notificati.\n` +
          `Se hai acquistato più libri dallo stesso venditore, avrai un unico QR code!`;
        
        if (Platform.OS === 'web') {
          window.alert(successMessage);
        } else {
          Alert.alert('Pagamento completato!', successMessage, [{ text: 'OK' }]);
        }
        
        loadCart();
        
      } catch (error: any) {
        console.error('Error paying orders:', error);
        const errorMsg = error.response?.data?.detail || 'Errore durante il pagamento';
        if (Platform.OS === 'web') {
          window.alert('Errore: ' + errorMsg);
        } else {
          Alert.alert('Errore', errorMsg);
        }
      } finally {
        setPurchasing(false);
      }
    };
    
    if (Platform.OS === 'web') {
      await proceedWithPayment();
    } else {
      Alert.alert(
        'Conferma pagamento',
        `Stai per pagare €${total.toFixed(2)} per ${pendingPaymentOrders.length} libri.\n\nI fondi rimarranno in escrow fino al ritiro.`,
        [
          { text: 'Annulla', style: 'cancel' },
          { text: 'Paga tutto', onPress: proceedWithPayment }
        ]
      );
    }
  };

  const handleCancelOrder = async (order: EscrowOrder) => {
    const proceedWithCancel = async () => {
      try {
        await axios.post(`${API_URL}/api/orders/${order.id}/cancel?user_id=${userId}`);
        
        if (Platform.OS === 'web') {
          window.alert('Ordine annullato');
        } else {
          Alert.alert('Ordine annullato', 'La richiesta è stata annullata.');
        }
        
        loadCart();
      } catch (error: any) {
        const errorMsg = error.response?.data?.detail || 'Errore';
        if (Platform.OS === 'web') {
          window.alert('Errore: ' + errorMsg);
        } else {
          Alert.alert('Errore', errorMsg);
        }
      }
    };
    
    if (Platform.OS === 'web') {
      if (window.confirm(`Vuoi annullare l'ordine per "${order.book_titolo}"?`)) {
        await proceedWithCancel();
      }
    } else {
      Alert.alert(
        'Annulla ordine',
        `Vuoi annullare l'ordine per "${order.book_titolo}"?`,
        [
          { text: 'No', style: 'cancel' },
          { text: 'Sì, annulla', style: 'destructive', onPress: proceedWithCancel }
        ]
      );
    }
  };

  const totalAmount = pendingPaymentOrders.reduce((sum, o) => sum + o.totale_acquirente, 0);
  const totalFoderazioni = pendingPaymentOrders.filter(o => o.include_foderazione).length;
  const totalFoderazioneCost = pendingPaymentOrders.reduce((sum, o) => o.include_foderazione ? sum + (o.costo_foderazione || 1.50) : sum, 0);
  const totalBooksOnly = totalAmount - totalFoderazioneCost;
  const allItems = [...pendingPaymentOrders, ...pendingConfirmationOrders];

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen
          options={{
            title: 'Carrello',
            headerStyle: { backgroundColor: '#1a472a' },
            headerTintColor: '#fff',
            headerLeft: () => (
              <TouchableOpacity onPress={handleGoBack} style={{ paddingHorizontal: 16 }}>
                <Ionicons name="arrow-back" size={24} color="#fff" />
              </TouchableOpacity>
            ),
          }}
        />
        <ActivityIndicator size="large" color="#1a472a" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: `Carrello (${allItems.length})`,
          headerStyle: { backgroundColor: '#1a472a' },
          headerTintColor: '#fff',
          headerLeft: () => (
            <TouchableOpacity onPress={handleGoBack} style={{ paddingHorizontal: 16 }}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
          ),
        }}
      />

      {allItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="cart-outline" size={64} color="#ccc" />
          <Text style={styles.emptyText}>Il carrello è vuoto</Text>
          <Text style={styles.emptySubtext}>
            Quando clicchi "Acquista ora" su un libro e il venditore conferma la disponibilità, lo troverai qui pronto per il pagamento.
          </Text>
          <TouchableOpacity style={styles.browseButton} onPress={() => router.push('/(tabs)')}>
            <Text style={styles.browseButtonText}>Cerca libri</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView 
            style={styles.scrollView}
            contentContainerStyle={isDesktop ? styles.scrollViewContentDesktop : undefined}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          >
            <View style={isDesktop ? styles.desktopContainer : undefined}>
              {/* Info Banner */}
              <View style={[styles.infoBanner, isDesktop && styles.infoBannerDesktop]}>
                <Ionicons name="information-circle" size={20} color="#1a472a" />
                <Text style={styles.infoBannerText}>
                  I fondi rimangono in escrow fino al ritiro del libro
                </Text>
              </View>

            {/* SEZIONE: Pronti per il pagamento */}
            {pendingPaymentOrders.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                  <Text style={[styles.sectionTitle, { color: '#4CAF50' }]}>
                    Pronti per il pagamento ({pendingPaymentOrders.length})
                  </Text>
                </View>
                
                {pendingPaymentOrders.map((order) => (
                  <View key={order.id} style={[styles.orderCard, styles.orderCardReady]}>
                    <View style={styles.statusBannerConfirmed}>
                      <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                      <Text style={styles.statusBannerTextConfirmed}>
                        Venditore ha confermato - Pronto per il pagamento
                      </Text>
                    </View>
                    
                    <Text style={styles.orderTitle} numberOfLines={2}>{order.book_titolo}</Text>
                    {order.book_autore && (
                      <Text style={styles.orderAuthor}>{order.book_autore}</Text>
                    )}
                    
                    <View style={styles.orderDetails}>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Venditore:</Text>
                        <Text style={styles.detailValue}>{order.seller_name}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Ritiro:</Text>
                        <Text style={styles.detailValue}>{order.bookstore_name}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Codice:</Text>
                        <Text style={[styles.detailValue, styles.orderCode]}>{order.order_code}</Text>
                      </View>
                    </View>
                    
                    <View style={styles.priceContainer}>
                      <View style={styles.priceBreakdown}>
                        <View style={styles.priceBreakdownRow}>
                          <Text style={styles.priceBreakdownLabel}>Prezzo libro</Text>
                          <Text style={styles.priceBreakdownValue}>€{order.prezzo_libro.toFixed(2)}</Text>
                        </View>
                        
                        {/* Toggle Foderazione */}
                        <TouchableOpacity 
                          style={styles.foderazioneToggle}
                          onPress={() => handleToggleFoderazione(order)}
                          disabled={updatingFoderazione === order.id}
                        >
                          <View style={[
                            styles.foderazioneCheckbox,
                            order.include_foderazione && styles.foderazioneCheckboxChecked
                          ]}>
                            {updatingFoderazione === order.id ? (
                              <ActivityIndicator size="small" color={order.include_foderazione ? "#fff" : "#1a472a"} />
                            ) : order.include_foderazione ? (
                              <Ionicons name="checkmark" size={14} color="#fff" />
                            ) : null}
                          </View>
                          <View style={styles.foderazioneInfo}>
                            <View style={styles.foderazioneHeader}>
                              <Ionicons name="shield-checkmark" size={14} color="#1a472a" />
                              <Text style={styles.foderazioneLabel}>Foderazione libro</Text>
                            </View>
                            <Text style={styles.foderazioneDesc}>Proteggi il libro con copertina</Text>
                          </View>
                          <Text style={styles.foderazionePrice}>+€1.50</Text>
                        </TouchableOpacity>
                        
                        <View style={[styles.priceBreakdownRow, styles.totalRowBreakdown]}>
                          <Text style={styles.priceLabel}>Totale</Text>
                          <Text style={styles.priceValue}>€{order.totale_acquirente.toFixed(2)}</Text>
                        </View>
                      </View>
                    </View>
                    
                    <TouchableOpacity
                      style={[styles.payButton, payingOrderId === order.id && styles.payButtonDisabled]}
                      onPress={() => handlePayOrder(order)}
                      disabled={purchasing}
                    >
                      {payingOrderId === order.id ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <>
                          <Ionicons name="card-outline" size={20} color="#fff" />
                          <Text style={styles.payButtonText}>Paga €{order.totale_acquirente.toFixed(2)}</Text>
                        </>
                      )}
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={styles.removeButton}
                      onPress={() => handleCancelOrder(order)}
                    >
                      <Ionicons name="trash-outline" size={16} color="#f44336" />
                      <Text style={styles.removeButtonText}>Rimuovi dal carrello</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* SEZIONE: In attesa di conferma venditore */}
            {pendingConfirmationOrders.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="time" size={24} color="#FF9800" />
                  <Text style={[styles.sectionTitle, { color: '#FF9800' }]}>
                    In attesa di conferma ({pendingConfirmationOrders.length})
                  </Text>
                </View>
                
                {pendingConfirmationOrders.map((order) => (
                  <View key={order.id} style={[styles.orderCard, styles.orderCardPending]}>
                    <View style={styles.statusBannerPending}>
                      <Ionicons name="hourglass" size={16} color="#FF9800" />
                      <Text style={styles.statusBannerTextPending}>
                        In attesa di conferma dal venditore
                      </Text>
                    </View>
                    
                    <Text style={styles.orderTitle} numberOfLines={2}>{order.book_titolo}</Text>
                    {order.book_autore && (
                      <Text style={styles.orderAuthor}>{order.book_autore}</Text>
                    )}
                    
                    <View style={styles.orderDetails}>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Venditore:</Text>
                        <Text style={styles.detailValue}>{order.seller_name}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Ritiro:</Text>
                        <Text style={styles.detailValue}>{order.bookstore_name}</Text>
                      </View>
                    </View>
                    
                    <View style={styles.priceContainerPending}>
                      {order.include_foderazione ? (
                        <View style={styles.priceBreakdown}>
                          <View style={styles.priceBreakdownRow}>
                            <Text style={styles.priceBreakdownLabelPending}>Prezzo libro</Text>
                            <Text style={styles.priceBreakdownValuePending}>€{order.prezzo_libro.toFixed(2)}</Text>
                          </View>
                          <View style={styles.priceBreakdownRow}>
                            <View style={styles.foderaturaTagPending}>
                              <Ionicons name="shield-checkmark" size={12} color="#FF9800" />
                              <Text style={styles.foderaturaTextPending}>Foderazione</Text>
                            </View>
                            <Text style={styles.priceBreakdownValuePending}>€{(order.costo_foderazione || 1.50).toFixed(2)}</Text>
                          </View>
                          <View style={[styles.priceBreakdownRow, styles.totalRowBreakdown]}>
                            <Text style={styles.priceLabelPending}>Totale previsto</Text>
                            <Text style={styles.priceValuePending}>€{order.totale_acquirente.toFixed(2)}</Text>
                          </View>
                        </View>
                      ) : (
                        <View style={styles.priceSimple}>
                          <Text style={styles.priceLabelPending}>Totale previsto</Text>
                          <Text style={styles.priceValuePending}>€{order.totale_acquirente.toFixed(2)}</Text>
                        </View>
                      )}
                    </View>
                    
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={() => handleCancelOrder(order)}
                    >
                      <Ionicons name="close-circle-outline" size={18} color="#f44336" />
                      <Text style={styles.cancelButtonText}>Annulla richiesta</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            </View>
          </ScrollView>

          {/* Footer: Paga Tutto (solo se ci sono ordini pronti) */}
          {pendingPaymentOrders.length > 0 && (
            <View style={styles.checkoutContainer}>
              {pendingConfirmationOrders.length > 0 && (
                <View style={styles.pendingWarning}>
                  <Ionicons name="hourglass-outline" size={16} color="#FF9800" />
                  <Text style={styles.pendingWarningText}>
                    {pendingConfirmationOrders.length} libri in attesa di conferma
                  </Text>
                </View>
              )}
              
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  Libri ({pendingPaymentOrders.length})
                </Text>
                <Text style={styles.summaryValue}>€{totalBooksOnly.toFixed(2)}</Text>
              </View>
              
              {totalFoderazioni > 0 && (
                <View style={styles.summaryRow}>
                  <View style={styles.foderazioneSummaryTag}>
                    <Ionicons name="shield-checkmark" size={14} color="#1a472a" />
                    <Text style={styles.summaryLabelFoderazione}>
                      Foderazioni ({totalFoderazioni})
                    </Text>
                  </View>
                  <Text style={styles.summaryValue}>€{totalFoderazioneCost.toFixed(2)}</Text>
                </View>
              )}
              
              <View style={[styles.summaryRow, styles.totalRow]}>
                <Text style={styles.totalLabel}>Totale da pagare</Text>
                <Text style={styles.totalValue}>€{totalAmount.toFixed(2)}</Text>
              </View>

              <TouchableOpacity
                style={[styles.checkoutButton, purchasing && styles.checkoutButtonDisabled]}
                onPress={handlePayAll}
                disabled={purchasing}
              >
                {purchasing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="card-outline" size={24} color="#fff" />
                    <Text style={styles.checkoutButtonText}>
                      Paga tutto €{totalAmount.toFixed(2)}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Footer: solo pending */}
          {pendingPaymentOrders.length === 0 && pendingConfirmationOrders.length > 0 && (
            <View style={styles.waitingFooter}>
              <Ionicons name="hourglass" size={24} color="#FF9800" />
              <Text style={styles.waitingFooterText}>
                Attendi la conferma dei venditori per procedere al pagamento
              </Text>
            </View>
          )}
        </>
      )}
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  browseButton: {
    marginTop: 24,
    backgroundColor: '#1a472a',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  browseButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Desktop styles
  scrollViewContentDesktop: {
    alignItems: 'center',
    paddingBottom: 24,
  },
  desktopContainer: {
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    padding: 12,
    gap: 8,
    margin: 16,
    marginBottom: 0,
    borderRadius: 8,
  },
  infoBannerDesktop: {
    marginHorizontal: 0,
    marginTop: 16,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#1a472a',
  },
  scrollView: {
    flex: 1,
  },
  section: {
    padding: 16,
    paddingTop: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  orderCardReady: {
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  orderCardPending: {
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  statusBannerConfirmed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e8f5e9',
  },
  statusBannerTextConfirmed: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
  },
  statusBannerPending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#fff3e0',
  },
  statusBannerTextPending: {
    fontSize: 12,
    color: '#FF9800',
    fontWeight: '600',
  },
  orderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  orderAuthor: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  orderDetails: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailLabel: {
    fontSize: 13,
    color: '#666',
  },
  detailValue: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
  },
  orderCode: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    color: '#1a472a',
    fontWeight: '700',
  },
  priceContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  priceLabel: {
    fontSize: 14,
    color: '#666',
  },
  priceValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  priceContainerPending: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  priceLabelPending: {
    fontSize: 14,
    color: '#999',
  },
  priceValuePending: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FF9800',
  },
  payButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    padding: 14,
    borderRadius: 10,
    gap: 8,
  },
  payButtonDisabled: {
    backgroundColor: '#ccc',
  },
  payButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 8,
    gap: 6,
  },
  cancelButtonText: {
    color: '#f44336',
    fontSize: 14,
    fontWeight: '600',
  },
  checkoutContainer: {
    backgroundColor: '#fff',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  pendingWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff3e0',
    padding: 10,
    borderRadius: 8,
    gap: 8,
    marginBottom: 12,
  },
  pendingWarningText: {
    fontSize: 13,
    color: '#e65100',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#666',
  },
  summaryValue: {
    fontSize: 14,
    color: '#333',
  },
  totalRow: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  totalValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  checkoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a472a',
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
    gap: 8,
  },
  checkoutButtonDisabled: {
    backgroundColor: '#ccc',
  },
  checkoutButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  waitingFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff3e0',
    padding: 16,
    gap: 10,
  },
  waitingFooterText: {
    flex: 1,
    fontSize: 14,
    color: '#e65100',
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f44336',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
    gap: 6,
  },
  removeButtonText: {
    color: '#f44336',
    fontSize: 13,
    fontWeight: '500',
  },
  // Stili per il breakdown prezzo con foderazione
  priceBreakdown: {
    flex: 1,
    marginBottom: 12,
  },
  priceBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  priceBreakdownLabel: {
    fontSize: 13,
    color: '#666',
  },
  priceBreakdownLabelPending: {
    fontSize: 13,
    color: '#999',
  },
  priceBreakdownValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  priceBreakdownValuePending: {
    fontSize: 14,
    color: '#FF9800',
    fontWeight: '500',
  },
  totalRowBreakdown: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e8f5e9',
  },
  priceSimple: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flex: 1,
  },
  foderaturaTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    gap: 4,
  },
  foderaturaText: {
    fontSize: 12,
    color: '#1a472a',
    fontWeight: '600',
  },
  foderaturaTagPending: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff3e0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    gap: 4,
  },
  foderaturaTextPending: {
    fontSize: 12,
    color: '#FF9800',
    fontWeight: '600',
  },
  foderazioneSummaryTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  summaryLabelFoderazione: {
    fontSize: 14,
    color: '#1a472a',
    fontWeight: '500',
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
  foderazioneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  foderazioneLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a472a',
  },
  foderazioneDesc: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  foderazionePrice: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a472a',
  },
  foderazioneNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
    marginBottom: 8,
    gap: 8,
  },
  foderazioneNoticeText: {
    flex: 1,
    fontSize: 12,
    color: '#1a472a',
    lineHeight: 18,
  },
});
