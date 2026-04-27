import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  Alert,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';

interface CartItem {
  id: string;
  listing_id: string;
  book_isbn: string;
  book_titolo: string;
  book_autori?: string;
  book_disciplina?: string;
  prezzo_vendita: number;
  prezzo_copertina?: number;
  condizione: string;
  seller_id: string;
  seller_username?: string;
  cover_url?: string;
  added_at: string;
}

export default function CartScreen() {
  const router = useRouter();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [processingCheckout, setProcessingCheckout] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadCart();
    }, [])
  );

  const loadCart = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      setUserId(storedUserId);

      if (!storedUserId) {
        setLoading(false);
        return;
      }

      // Carica carrello dal backend
      const response = await axios.get(`${API_URL}/api/cart/${storedUserId}`);
      setCartItems(response.data.items || []);
    } catch (error: any) {
      console.error('Error loading cart:', error);
      // Se endpoint non esiste, carica dal local storage
      if (error.response?.status === 404) {
        const localCart = await AsyncStorage.getItem('cart_items');
        if (localCart) {
          setCartItems(JSON.parse(localCart));
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadCart();
  };

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const removeFromCart = async (itemId: string) => {
    try {
      // Rimuovi dal backend
      await axios.delete(`${API_URL}/api/cart/${userId}/item/${itemId}`);
      setCartItems(prev => prev.filter(item => item.id !== itemId));
    } catch (error) {
      // Fallback locale
      const updatedCart = cartItems.filter(item => item.id !== itemId);
      setCartItems(updatedCart);
      await AsyncStorage.setItem('cart_items', JSON.stringify(updatedCart));
    }
  };

  const confirmRemove = (itemId: string, bookTitle: string) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`Rimuovere "${bookTitle}" dal carrello?`)) {
        removeFromCart(itemId);
      }
    } else {
      Alert.alert(
        'Rimuovi dal carrello',
        `Rimuovere "${bookTitle}" dal carrello?`,
        [
          { text: 'Annulla', style: 'cancel' },
          { text: 'Rimuovi', style: 'destructive', onPress: () => removeFromCart(itemId) },
        ]
      );
    }
  };

  const calculateTotal = () => {
    return cartItems.reduce((sum, item) => sum + item.prezzo_vendita, 0);
  };

  const calculateSavings = () => {
    const totalNew = cartItems.reduce((sum, item) => sum + (item.prezzo_copertina || item.prezzo_vendita), 0);
    const totalUsed = calculateTotal();
    return totalNew - totalUsed;
  };

  const handleCheckout = async () => {
    if (cartItems.length === 0) {
      showAlert('Carrello vuoto', 'Aggiungi libri al carrello prima di procedere');
      return;
    }

    setProcessingCheckout(true);
    try {
      // Crea ordine
      const response = await axios.post(`${API_URL}/api/orders`, {
        buyer_id: userId,
        items: cartItems.map(item => ({
          listing_id: item.listing_id,
          book_isbn: item.book_isbn,
          prezzo: item.prezzo_vendita,
        })),
        total: calculateTotal(),
      });

      showAlert('Ordine creato!', 'Verrai contattato dai venditori per organizzare lo scambio.');
      
      // Svuota carrello
      setCartItems([]);
      await AsyncStorage.removeItem('cart_items');
      
      // Vai agli scambi
      router.push('/(tabs)/transactions');
    } catch (error: any) {
      console.error('Checkout error:', error);
      showAlert('Errore', error.response?.data?.detail || 'Impossibile completare l\'ordine');
    } finally {
      setProcessingCheckout(false);
    }
  };

  const getConditionColor = (condition: string) => {
    switch (condition) {
      case 'nuovo': return '#2196F3';
      case 'ottimo': return '#4CAF50';
      case 'buono': return '#FF9800';
      case 'accettabile': return '#f44336';
      default: return '#666';
    }
  };

  const getConditionLabel = (condition: string) => {
    switch (condition) {
      case 'nuovo': return 'Nuovo';
      case 'ottimo': return 'Ottimo';
      case 'buono': return 'Buono';
      case 'accettabile': return 'Accettabile';
      default: return condition;
    }
  };

  const renderCartItem = ({ item }: { item: CartItem }) => {
    const coverUrl = item.cover_url || `https://www.ibs.it/images/${item.book_isbn}_0_0_0_536_0.jpg`;
    
    return (
      <View style={styles.cartItem}>
        <Image
          source={{ uri: coverUrl }}
          style={styles.bookCover}
          resizeMode="contain"
        />
        
        <View style={styles.itemInfo}>
          <Text style={styles.bookTitle} numberOfLines={2}>{item.book_titolo}</Text>
          {item.book_disciplina && (
            <Text style={styles.bookSubject}>{item.book_disciplina}</Text>
          )}
          <Text style={styles.isbn}>ISBN: {item.book_isbn}</Text>
          
          <View style={styles.conditionRow}>
            <View style={[styles.conditionBadge, { backgroundColor: getConditionColor(item.condizione) + '20' }]}>
              <Text style={[styles.conditionText, { color: getConditionColor(item.condizione) }]}>
                {getConditionLabel(item.condizione)}
              </Text>
            </View>
            {item.seller_username && (
              <Text style={styles.sellerText}>da {item.seller_username}</Text>
            )}
          </View>
        </View>
        
        <View style={styles.priceSection}>
          <Text style={styles.price}>€{item.prezzo_vendita.toFixed(2)}</Text>
          {item.prezzo_copertina && item.prezzo_copertina > item.prezzo_vendita && (
            <Text style={styles.originalPrice}>€{item.prezzo_copertina.toFixed(2)}</Text>
          )}
          <TouchableOpacity
            style={styles.removeButton}
            onPress={() => confirmRemove(item.id, item.book_titolo)}
          >
            <Ionicons name="trash-outline" size={20} color="#ff4444" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a472a" />
        <Text style={styles.loadingText}>Caricamento carrello...</Text>
      </View>
    );
  }

  if (!userId) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="cart-outline" size={80} color="#ccc" />
        <Text style={styles.emptyTitle}>Accedi per vedere il carrello</Text>
        <Text style={styles.emptySubtitle}>
          Effettua l'accesso per salvare i libri che vuoi acquistare
        </Text>
        <TouchableOpacity
          style={styles.loginButton}
          onPress={() => router.push('/login')}
        >
          <Text style={styles.loginButtonText}>Accedi</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Il tuo carrello</Text>
        {cartItems.length > 0 && (
          <Text style={styles.itemCount}>{cartItems.length} {cartItems.length === 1 ? 'libro' : 'libri'}</Text>
        )}
      </View>

      {cartItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="cart-outline" size={80} color="#ccc" />
          <Text style={styles.emptyTitle}>Carrello vuoto</Text>
          <Text style={styles.emptySubtitle}>
            Cerca libri nella sezione "Cerca" e aggiungili al carrello
          </Text>
          <TouchableOpacity
            style={styles.searchButton}
            onPress={() => router.push('/(tabs)/search')}
          >
            <Ionicons name="search" size={20} color="#fff" />
            <Text style={styles.searchButtonText}>Cerca libri</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <FlatList
            data={cartItems}
            renderItem={renderCartItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          />

          {/* Footer con totale e checkout */}
          <View style={styles.footer}>
            <View style={styles.totalSection}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Totale:</Text>
                <Text style={styles.totalPrice}>€{calculateTotal().toFixed(2)}</Text>
              </View>
              {calculateSavings() > 0 && (
                <Text style={styles.savingsText}>
                  Risparmi €{calculateSavings().toFixed(2)} rispetto al nuovo!
                </Text>
              )}
            </View>
            
            <TouchableOpacity
              style={[styles.checkoutButton, processingCheckout && styles.checkoutButtonDisabled]}
              onPress={handleCheckout}
              disabled={processingCheckout}
            >
              {processingCheckout ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={22} color="#fff" />
                  <Text style={styles.checkoutButtonText}>Procedi all'acquisto</Text>
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
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  itemCount: {
    fontSize: 14,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginTop: 20,
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 22,
  },
  loginButton: {
    marginTop: 24,
    backgroundColor: '#1a472a',
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 10,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  searchButton: {
    marginTop: 24,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    paddingBottom: 180,
  },
  cartItem: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  bookCover: {
    width: 60,
    height: 85,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
  },
  itemInfo: {
    flex: 1,
    marginLeft: 12,
  },
  bookTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  bookSubject: {
    fontSize: 13,
    color: '#1a472a',
    marginBottom: 4,
  },
  isbn: {
    fontSize: 11,
    color: '#888',
    fontFamily: 'monospace',
    marginBottom: 6,
  },
  conditionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  conditionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  conditionText: {
    fontSize: 11,
    fontWeight: '600',
  },
  sellerText: {
    fontSize: 12,
    color: '#666',
  },
  priceSection: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  price: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  originalPrice: {
    fontSize: 13,
    color: '#999',
    textDecorationLine: 'line-through',
  },
  removeButton: {
    marginTop: 8,
    padding: 6,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 10,
  },
  totalSection: {
    marginBottom: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  totalPrice: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  savingsText: {
    fontSize: 13,
    color: '#4CAF50',
    fontWeight: '600',
    marginTop: 4,
  },
  checkoutButton: {
    backgroundColor: '#1a472a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 10,
  },
  checkoutButtonDisabled: {
    opacity: 0.7,
  },
  checkoutButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
  },
});
