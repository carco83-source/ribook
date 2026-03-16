import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';

interface CartItem {
  listing_id: string;
  book_titolo: string;
  book_autore: string;
  prezzo_vendita: number;
  prezzo_copertina: number;
  condizione: string;
  seller_id: string;
  seller_username: string;
  bookstore: {
    id: string;
    nome: string;
  };
  added_at: string;
}

export default function CartScreen() {
  const router = useRouter();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [isPremium, setIsPremium] = useState(false);

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
        const cartKey = `cart_${storedUserId}`;
        const cartData = await AsyncStorage.getItem(cartKey);
        setCartItems(cartData ? JSON.parse(cartData) : []);
      }
    } catch (error) {
      console.error('Error loading cart:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const removeFromCart = async (listingId: string) => {
    try {
      const cartKey = `cart_${userId}`;
      const newCart = cartItems.filter(item => item.listing_id !== listingId);
      setCartItems(newCart);
      await AsyncStorage.setItem(cartKey, JSON.stringify(newCart));
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

  const calculateTotal = () => {
    const subtotal = cartItems.reduce((sum, item) => sum + item.prezzo_vendita, 0);
    const commission = isPremium ? 0 : subtotal * 0.15;
    return { subtotal, commission, total: subtotal + commission };
  };

  const handleCheckout = async () => {
    if (cartItems.length === 0) return;

    const { subtotal, commission, total } = calculateTotal();

    Alert.alert(
      'Conferma acquisto',
      `Stai per acquistare ${cartItems.length} libri.\n\n` +
      `Subtotale: €${subtotal.toFixed(2)}\n` +
      (commission > 0 ? `Commissione (15%): €${commission.toFixed(2)}\n` : '') +
      `Totale: €${total.toFixed(2)}`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Conferma',
          onPress: async () => {
            setPurchasing(true);
            try {
              // Process each item
              const results = [];
              for (const item of cartItems) {
                const response = await axios.post(`${API_URL}/api/purchase?buyer_id=${userId}`, {
                  listing_id: item.listing_id,
                  bookstore_id: item.bookstore.id,
                });
                results.push({
                  titolo: item.book_titolo,
                  codice: response.data.codice_ritiro,
                  bookstore: item.bookstore.nome
                });
              }

              // Clear cart
              const cartKey = `cart_${userId}`;
              await AsyncStorage.setItem(cartKey, JSON.stringify([]));
              setCartItems([]);

              // Show success
              const codesText = results.map(r => 
                `${r.titolo.substring(0, 30)}...\nCodice: ${r.codice}\nRitiro: ${r.bookstore}`
              ).join('\n\n');

              Alert.alert(
                'Acquisto completato!',
                `I venditori hanno 5 giorni per consegnare i libri.\n\n${codesText}`,
                [{ text: 'OK', onPress: () => router.push('/my-purchases') }]
              );
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

      {cartItems.length === 0 ? (
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
          <ScrollView style={styles.scrollView}>
            <View style={styles.itemsContainer}>
              {cartItems.map((item) => (
                <View key={item.listing_id} style={styles.cartItem}>
                  <View style={styles.itemHeader}>
                    <View style={[
                      styles.conditionBadge,
                      item.condizione === 'come_nuovo' && { backgroundColor: '#4CAF50' },
                      item.condizione === 'buono' && { backgroundColor: '#8BC34A' },
                      item.condizione === 'molto_usato' && { backgroundColor: '#FF9800' },
                    ]}>
                      <Text style={styles.conditionText}>{getConditionLabel(item.condizione)}</Text>
                    </View>
                    <TouchableOpacity 
                      style={styles.removeButton}
                      onPress={() => {
                        Alert.alert(
                          'Rimuovi dal carrello',
                          `Vuoi rimuovere "${item.book_titolo}"?`,
                          [
                            { text: 'Annulla', style: 'cancel' },
                            { text: 'Rimuovi', style: 'destructive', onPress: () => removeFromCart(item.listing_id) }
                          ]
                        );
                      }}
                    >
                      <Ionicons name="trash-outline" size={20} color="#f44336" />
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.itemTitle} numberOfLines={2}>{item.book_titolo}</Text>
                  <Text style={styles.itemAuthor}>{item.book_autore}</Text>

                  <View style={styles.itemFooter}>
                    <View>
                      <Text style={styles.priceOld}>€{item.prezzo_copertina?.toFixed(2)}</Text>
                      <Text style={styles.price}>€{item.prezzo_vendita.toFixed(2)}</Text>
                    </View>
                    <View style={styles.bookstoreTag}>
                      <Ionicons name="location" size={14} color="#1a472a" />
                      <Text style={styles.bookstoreText}>{item.bookstore.nome}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>

          {/* Checkout Section */}
          <View style={styles.checkoutContainer}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotale ({cartItems.length} libri)</Text>
              <Text style={styles.summaryValue}>€{subtotal.toFixed(2)}</Text>
            </View>
            {!isPremium && (
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
                  <Text style={styles.checkoutButtonText}>Completa acquisto</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
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
  scrollView: {
    flex: 1,
  },
  itemsContainer: {
    padding: 16,
  },
  cartItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
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
  itemAuthor: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  priceOld: {
    fontSize: 12,
    color: '#999',
    textDecorationLine: 'line-through',
  },
  price: {
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
    fontWeight: '600',
  },
});
