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
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface CartItem {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  book_isbn: string;
  book_titolo: string;
  book_editore: string;
  prezzo: number;
  bookstore_id: string;
  bookstore_nome: string;
  status: 'pending' | 'confirmed' | 'rejected' | 'expired';
  created_at: string;
  expires_at: string;
  condizione?: string;
  condition_details?: {
    sottolineature?: number;
    copertina?: number;
    pagine?: number;
    esercizi?: number;
  };
}

interface CartData {
  items: CartItem[];
  confirmed: CartItem[];
  pending: CartItem[];
  expired: CartItem[];
  total_confirmed: number;
  total_pending: number;
  can_checkout: boolean;
}

export default function CartScreen() {
  const router = useRouter();
  const [cartData, setCartData] = useState<CartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    loadCart();
  }, []);

  const loadCart = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      const storedPremium = await AsyncStorage.getItem('is_premium');
      setUserId(storedUserId);
      setIsPremium(storedPremium === 'true');

      if (storedUserId) {
        const response = await axios.get(`${API_URL}/api/cart/${storedUserId}`);
        setCartData(response.data);
      }
    } catch (error) {
      console.error('Error loading cart:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
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

  const removeFromCart = async (cartItemId: string) => {
    try {
      await axios.delete(`${API_URL}/api/cart/${cartItemId}?buyer_id=${userId}`);
      loadCart();
    } catch (error) {
      Alert.alert('Errore', 'Impossibile rimuovere dal carrello');
    }
  };

  const getConditionLabel = (condition: string) => {
    switch (condition) {
      case 'come_nuovo': return 'Come nuovo';
      case 'buono': return 'Buono';
      case 'molto_usato': return 'Molto usato';
      default: return condition;
    }
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'confirmed':
        return { 
          icon: 'checkmark-circle', 
          color: '#4CAF50', 
          text: 'Confermato',
          description: 'Pronto per il pagamento'
        };
      case 'pending':
        return { 
          icon: 'time', 
          color: '#FF9800', 
          text: 'In attesa',
          description: 'Attesa conferma venditore (24h)'
        };
      case 'expired':
        return { 
          icon: 'alert-circle', 
          color: '#f44336', 
          text: 'Scaduto',
          description: 'Il venditore non ha risposto'
        };
      case 'rejected':
        return { 
          icon: 'close-circle', 
          color: '#f44336', 
          text: 'Non disponibile',
          description: 'Il venditore ha rifiutato'
        };
      default:
        return { icon: 'help-circle', color: '#999', text: status, description: '' };
    }
  };

  const calculateTimeRemaining = (expiresAt: string) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();
    
    if (diff <= 0) return 'Scaduto';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) return `${hours}h ${minutes}m rimanenti`;
    return `${minutes}m rimanenti`;
  };

  const calculateTotal = () => {
    if (!cartData) return { subtotal: 0, commission: 0, total: 0 };
    
    const confirmedItems = cartData.confirmed || [];
    const subtotal = confirmedItems.reduce((sum, item) => sum + item.prezzo, 0);
    const commission = isPremium ? 0 : subtotal * 0.15;
    return { subtotal, commission, total: subtotal + commission };
  };

  const handleCheckout = async () => {
    if (!cartData || cartData.confirmed.length === 0) return;

    const { subtotal, commission, total } = calculateTotal();

    Alert.alert(
      'Conferma acquisto',
      `Stai per acquistare ${cartData.confirmed.length} libri confermati.\n\n` +
      `Subtotale: €${subtotal.toFixed(2)}\n` +
      (commission > 0 ? `Commissione (15%): €${commission.toFixed(2)}\n` : '') +
      `Totale: €${total.toFixed(2)}`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Paga ora',
          onPress: async () => {
            setPurchasing(true);
            try {
              const results = [];
              for (const item of cartData.confirmed) {
                const response = await axios.post(`${API_URL}/api/purchase?buyer_id=${userId}`, {
                  listing_id: item.listing_id,
                  bookstore_id: item.bookstore_id,
                });
                results.push({
                  titolo: item.book_titolo,
                  codice: response.data.codice_ritiro,
                  bookstore: item.bookstore_nome
                });
              }

              const codesText = results.map(r => 
                `${r.titolo.substring(0, 30)}...\nCodice: ${r.codice}\nRitiro: ${r.bookstore}`
              ).join('\n\n');

              Alert.alert(
                'Acquisto completato!',
                `I venditori hanno 5 giorni per consegnare i libri.\n\n${codesText}`,
                [{ text: 'OK', onPress: () => router.push('/my-purchases') }]
              );
              
              loadCart();
            } catch (error: any) {
              Alert.alert('Errore', error.response?.data?.detail || 'Impossibile completare l\'acquisto');
            } finally {
              setPurchasing(false);
            }
          },
        },
      ]
    );
  };

  const { subtotal, commission, total } = calculateTotal();
  const allItems = cartData?.items || [];
  const confirmedItems = cartData?.confirmed || [];
  const pendingItems = cartData?.pending || [];

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
          <Text style={styles.emptySubtext}>Aggiungi libri dalla sezione "Libri acquistabili"</Text>
          <TouchableOpacity style={styles.browseButton} onPress={() => router.push('/(tabs)')}>
            <Text style={styles.browseButtonText}>Sfoglia libri</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView 
            style={styles.scrollView}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          >
            {/* Info Banner */}
            <View style={styles.infoBanner}>
              <Ionicons name="information-circle" size={20} color="#1a472a" />
              <Text style={styles.infoBannerText}>
                I venditori hanno 24h per confermare la disponibilità
              </Text>
            </View>

            {/* Pending Items */}
            {pendingItems.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="time" size={20} color="#FF9800" />
                  <Text style={styles.sectionTitle}>In attesa di conferma ({pendingItems.length})</Text>
                </View>
                {pendingItems.map((item) => (
                  <View key={item.id} style={[styles.cartItem, styles.cartItemPending]}>
                    <View style={styles.statusBanner}>
                      <Ionicons name="time" size={16} color="#FF9800" />
                      <Text style={styles.statusBannerText}>
                        {calculateTimeRemaining(item.expires_at)}
                      </Text>
                    </View>
                    <Text style={styles.itemTitle} numberOfLines={2}>{item.book_titolo}</Text>
                    <Text style={styles.itemPublisher}>{item.book_editore}</Text>
                    <View style={styles.itemFooter}>
                      <Text style={styles.price}>€{item.prezzo.toFixed(2)}</Text>
                      <View style={styles.bookstoreTag}>
                        <Ionicons name="location" size={14} color="#1a472a" />
                        <Text style={styles.bookstoreText}>{item.bookstore_nome}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Confirmed Items */}
            {confirmedItems.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                  <Text style={[styles.sectionTitle, { color: '#4CAF50' }]}>
                    Confermati - Pronti per pagamento ({confirmedItems.length})
                  </Text>
                </View>
                {confirmedItems.map((item) => (
                  <View key={item.id} style={[styles.cartItem, styles.cartItemConfirmed]}>
                    <View style={styles.statusBannerConfirmed}>
                      <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                      <Text style={styles.statusBannerTextConfirmed}>Confermato dal venditore</Text>
                    </View>
                    <View style={styles.itemHeader}>
                      {item.condizione && (
                        <View style={[
                          styles.conditionBadge,
                          item.condizione === 'come_nuovo' && { backgroundColor: '#4CAF50' },
                          item.condizione === 'buono' && { backgroundColor: '#8BC34A' },
                          item.condizione === 'molto_usato' && { backgroundColor: '#FF9800' },
                        ]}>
                          <Text style={styles.conditionText}>{getConditionLabel(item.condizione)}</Text>
                        </View>
                      )}
                      <TouchableOpacity 
                        style={styles.removeButton}
                        onPress={() => {
                          Alert.alert(
                            'Rimuovi dal carrello',
                            `Vuoi rimuovere "${item.book_titolo}"?`,
                            [
                              { text: 'Annulla', style: 'cancel' },
                              { text: 'Rimuovi', style: 'destructive', onPress: () => removeFromCart(item.id) }
                            ]
                          );
                        }}
                      >
                        <Ionicons name="trash-outline" size={20} color="#f44336" />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.itemTitle} numberOfLines={2}>{item.book_titolo}</Text>
                    <Text style={styles.itemPublisher}>{item.book_editore}</Text>
                    <View style={styles.itemFooter}>
                      <Text style={styles.priceConfirmed}>€{item.prezzo.toFixed(2)}</Text>
                      <View style={styles.bookstoreTag}>
                        <Ionicons name="location" size={14} color="#1a472a" />
                        <Text style={styles.bookstoreText}>{item.bookstore_nome}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          {/* Checkout Section - Solo se ci sono confermati */}
          {confirmedItems.length > 0 && (
            <View style={styles.checkoutContainer}>
              {pendingItems.length > 0 && (
                <View style={styles.pendingWarning}>
                  <Ionicons name="warning" size={16} color="#FF9800" />
                  <Text style={styles.pendingWarningText}>
                    {pendingItems.length} libri in attesa di conferma
                  </Text>
                </View>
              )}
              
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subtotale ({confirmedItems.length} confermati)</Text>
                <Text style={styles.summaryValue}>€{subtotal.toFixed(2)}</Text>
              </View>
              {!isPremium && commission > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Commissione (15%)</Text>
                  <Text style={styles.summaryValue}>€{commission.toFixed(2)}</Text>
                </View>
              )}
              <View style={[styles.summaryRow, styles.totalRow]}>
                <Text style={styles.totalLabel}>Totale</Text>
                <Text style={styles.totalValue}>€{total.toFixed(2)}</Text>
              </View>

              <TouchableOpacity
                style={[styles.checkoutButton, purchasing && styles.checkoutButtonDisabled]}
                onPress={handleCheckout}
                disabled={purchasing}
              >
                {purchasing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="card-outline" size={24} color="#fff" />
                    <Text style={styles.checkoutButtonText}>Paga €{total.toFixed(2)}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Info se solo pending */}
          {confirmedItems.length === 0 && pendingItems.length > 0 && (
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
    paddingTop: 8,
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
  cartItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cartItemPending: {
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  cartItemConfirmed: {
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  statusBannerText: {
    fontSize: 13,
    color: '#FF9800',
    fontWeight: '500',
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
    fontSize: 13,
    color: '#4CAF50',
    fontWeight: '500',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  conditionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  conditionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  removeButton: {
    padding: 4,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  itemPublisher: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  price: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FF9800',
  },
  priceConfirmed: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  bookstoreTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  bookstoreText: {
    fontSize: 12,
    color: '#1a472a',
    fontWeight: '500',
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
    backgroundColor: '#4CAF50',
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
    fontWeight: '600',
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
});
