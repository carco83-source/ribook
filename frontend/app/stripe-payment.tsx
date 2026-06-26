import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

interface OrderDetails {
  id: string;
  order_code: string;
  book_titolo: string;
  book_isbn: string;
  prezzo_libro: number;
  prezzo_acquirente: number;
  include_foderazione: boolean;
  seller_name: string;
  bookstore_name: string;
}

export default function StripePaymentScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadUserAndOrder();
  }, []);

  const loadUserAndOrder = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('userId');
      if (!storedUserId) {
        router.replace('/(auth)/login');
        return;
      }
      setUserId(storedUserId);

      // Carica dettagli ordine
      const response = await axios.get(`${API_URL}/api/orders/${orderId}?user_id=${storedUserId}`);
      setOrder(response.data);
    } catch (err: any) {
      console.error('Error loading order:', err);
      setError(err.response?.data?.detail || 'Errore nel caricamento ordine');
    } finally {
      setLoading(false);
    }
  };

  // Pagamento (mock su web, reale su mobile)
  const handlePayment = async () => {
    if (!userId) return;

    setProcessing(true);
    try {
      const response = await axios.post(
        `${API_URL}/api/orders/${orderId}/pay?user_id=${userId}`
      );
      
      const successMessage = 'Pagamento completato!\n\nIl venditore è stato notificato.';
      
      if (Platform.OS === 'web') {
        window.alert(successMessage);
      } else {
        Alert.alert('Successo', successMessage);
      }
      
      router.replace('/profile/my-exchanges');
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || 'Errore durante il pagamento';
      if (Platform.OS === 'web') {
        window.alert('Errore: ' + errorMsg);
      } else {
        Alert.alert('Errore', errorMsg);
      }
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#1a472a" />
        <Text style={styles.loadingText}>Caricamento...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Ionicons name="alert-circle" size={64} color="#f44336" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => router.back()}>
          <Text style={styles.retryButtonText}>Torna indietro</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Pagamento',
          headerShown: true,
        }}
      />
      
      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Riepilogo ordine */}
        <View style={styles.orderCard}>
          <Text style={styles.orderTitle}>{order?.book_titolo}</Text>
          <Text style={styles.orderCode}>Codice: {order?.order_code}</Text>
          
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Prezzo libro</Text>
            <Text style={styles.priceValue}>€{order?.prezzo_libro?.toFixed(2)}</Text>
          </View>
          
          {order?.include_foderazione && (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Foderazione</Text>
              <Text style={styles.priceValue}>€1.50</Text>
            </View>
          )}
          
          <View style={[styles.priceRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Totale</Text>
            <Text style={styles.totalValue}>€{order?.prezzo_acquirente?.toFixed(2)}</Text>
          </View>
        </View>

        {/* Info sicurezza */}
        <View style={styles.securityInfo}>
          <Ionicons name="shield-checkmark" size={24} color="#4CAF50" />
          <Text style={styles.securityText}>
            Pagamento sicuro. I fondi saranno trattenuti in escrow fino alla conferma del ritiro.
          </Text>
        </View>

        {/* Pulsante pagamento */}
        <TouchableOpacity
          style={[styles.payButton, processing && styles.payButtonDisabled]}
          onPress={handlePayment}
          disabled={processing}
        >
          {processing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="card" size={24} color="#fff" />
              <Text style={styles.payButtonText}>
                Paga €{order?.prezzo_acquirente?.toFixed(2)}
              </Text>
            </>
          )}
        </TouchableOpacity>
        
        {Platform.OS === 'web' && (
          <Text style={styles.webNote}>
            Pagamento in modalità demo per la preview web.
          </Text>
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
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    color: '#f44336',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  retryButton: {
    marginTop: 24,
    backgroundColor: '#1a472a',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  orderTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  orderCode: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  priceLabel: {
    fontSize: 14,
    color: '#666',
  },
  priceValue: {
    fontSize: 14,
    color: '#333',
  },
  totalRow: {
    borderBottomWidth: 0,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 2,
    borderTopColor: '#1a472a',
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a472a',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a472a',
  },
  securityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 24,
  },
  securityText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 13,
    color: '#2E7D32',
    lineHeight: 18,
  },
  payButton: {
    backgroundColor: '#1a472a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  payButtonDisabled: {
    opacity: 0.6,
  },
  payButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  webNote: {
    marginTop: 16,
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
