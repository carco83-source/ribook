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
  TextInput,
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
  totale_acquirente: number;
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
  
  // Card details state
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  useEffect(() => {
    loadUserAndOrder();
  }, []);

  const loadUserAndOrder = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      if (!storedUserId) {
        router.replace('/(auth)/login');
        return;
      }
      setUserId(storedUserId);

      // Carica dettagli ordine
      const response = await axios.get(`${API_URL}/api/orders/${orderId}?user_id=${storedUserId}`);
      setOrder(response.data);
      
      // Crea PaymentIntent
      try {
        const piResponse = await axios.post(
          `${API_URL}/api/orders/${orderId}/create-payment-intent?user_id=${storedUserId}`
        );
        setPaymentIntentId(piResponse.data.paymentIntentId);
        setClientSecret(piResponse.data.clientSecret);
      } catch (piErr: any) {
        console.log('PaymentIntent creation failed, will use mock payment:', piErr.message);
      }
    } catch (err: any) {
      console.error('Error loading order:', err);
      setError(err.response?.data?.detail || 'Errore nel caricamento ordine');
    } finally {
      setLoading(false);
    }
  };

  // Format card number with spaces
  const formatCardNumber = (text: string) => {
    const cleaned = text.replace(/\s/g, '').replace(/\D/g, '');
    const groups = cleaned.match(/.{1,4}/g);
    return groups ? groups.join(' ').substring(0, 19) : '';
  };

  // Format expiry as MM/YY
  const formatExpiry = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    if (cleaned.length >= 2) {
      return cleaned.substring(0, 2) + '/' + cleaned.substring(2, 4);
    }
    return cleaned;
  };

  // Validate card
  const isCardValid = () => {
    const cleanCardNumber = cardNumber.replace(/\s/g, '');
    return (
      cleanCardNumber.length >= 15 &&
      expiry.length === 5 &&
      cvc.length >= 3 &&
      cardholderName.length >= 2
    );
  };

  // Handle payment with Stripe
  const handlePayment = async () => {
    if (!userId || !order) return;

    if (!isCardValid()) {
      Alert.alert('Errore', 'Inserisci tutti i dati della carta correttamente');
      return;
    }

    setProcessing(true);
    try {
      // Se abbiamo un PaymentIntent, usiamo Stripe
      if (clientSecret && paymentIntentId) {
        // Conferma il pagamento tramite backend
        const confirmResponse = await axios.post(
          `${API_URL}/api/orders/${orderId}/confirm-stripe-payment`,
          {
            payment_intent_id: paymentIntentId,
            card_number: cardNumber.replace(/\s/g, ''),
            exp_month: parseInt(expiry.split('/')[0]),
            exp_year: parseInt('20' + expiry.split('/')[1]),
            cvc: cvc,
          },
          {
            params: { user_id: userId }
          }
        );

        if (confirmResponse.data.success) {
          showSuccess();
        } else {
          throw new Error(confirmResponse.data.message || 'Pagamento fallito');
        }
      } else {
        // Fallback: pagamento simulato
        await axios.post(`${API_URL}/api/orders/${orderId}/pay?user_id=${userId}`);
        showSuccess();
      }
    } catch (err: any) {
      console.error('Payment error:', err);
      const errorMsg = err.response?.data?.detail || err.message || 'Errore durante il pagamento';
      Alert.alert('Errore Pagamento', errorMsg);
    } finally {
      setProcessing(false);
    }
  };

  const showSuccess = () => {
    const successMessage = 'Pagamento completato!\n\nIl venditore è stato notificato e dovrà consegnare il libro alla cartolibreria.';
    
    if (Platform.OS === 'web') {
      window.alert(successMessage);
      router.replace('/profile/my-exchanges');
    } else {
      Alert.alert('Pagamento Completato! ✓', successMessage, [
        { text: 'OK', onPress: () => router.replace('/profile/my-exchanges') }
      ]);
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

  const totalPrice = order?.totale_acquirente || order?.prezzo_acquirente || 0;

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
            <Text style={styles.totalValue}>€{totalPrice.toFixed(2)}</Text>
          </View>
        </View>

        {/* Card Input Form */}
        <View style={styles.cardForm}>
          <Text style={styles.cardFormTitle}>
            <Ionicons name="card" size={20} color="#1a472a" /> Dati Carta
          </Text>
          
          <Text style={styles.inputLabel}>Intestatario carta</Text>
          <TextInput
            style={styles.input}
            placeholder="Nome e Cognome"
            placeholderTextColor="#999"
            value={cardholderName}
            onChangeText={setCardholderName}
            autoCapitalize="words"
          />
          
          <Text style={styles.inputLabel}>Numero carta</Text>
          <TextInput
            style={styles.input}
            placeholder="1234 5678 9012 3456"
            placeholderTextColor="#999"
            value={cardNumber}
            onChangeText={(text) => setCardNumber(formatCardNumber(text))}
            keyboardType="numeric"
            maxLength={19}
          />
          
          <View style={styles.row}>
            <View style={styles.halfInput}>
              <Text style={styles.inputLabel}>Scadenza</Text>
              <TextInput
                style={styles.input}
                placeholder="MM/YY"
                placeholderTextColor="#999"
                value={expiry}
                onChangeText={(text) => setExpiry(formatExpiry(text))}
                keyboardType="numeric"
                maxLength={5}
              />
            </View>
            <View style={styles.halfInput}>
              <Text style={styles.inputLabel}>CVC</Text>
              <TextInput
                style={styles.input}
                placeholder="123"
                placeholderTextColor="#999"
                value={cvc}
                onChangeText={(text) => setCvc(text.replace(/\D/g, ''))}
                keyboardType="numeric"
                maxLength={4}
                secureTextEntry
              />
            </View>
          </View>
          
          {/* Test card info */}
          <View style={styles.testInfo}>
            <Ionicons name="information-circle" size={16} color="#1976D2" />
            <Text style={styles.testInfoText}>
              Test: 4242 4242 4242 4242, qualsiasi data futura, qualsiasi CVC
            </Text>
          </View>
        </View>

        {/* Info sicurezza */}
        <View style={styles.securityInfo}>
          <Ionicons name="shield-checkmark" size={24} color="#4CAF50" />
          <Text style={styles.securityText}>
            Pagamento sicuro con Stripe. I fondi saranno trattenuti in escrow fino alla conferma del ritiro.
          </Text>
        </View>

        {/* Pulsante pagamento */}
        <TouchableOpacity
          style={[styles.payButton, (!isCardValid() || processing) && styles.payButtonDisabled]}
          onPress={handlePayment}
          disabled={!isCardValid() || processing}
        >
          {processing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="lock-closed" size={20} color="#fff" />
              <Text style={styles.payButtonText}>
                Paga €{totalPrice.toFixed(2)}
              </Text>
            </>
          )}
        </TouchableOpacity>
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
  cardForm: {
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
  cardFormTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a472a',
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fafafa',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  testInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    padding: 10,
    borderRadius: 8,
    marginTop: 12,
    gap: 8,
  },
  testInfoText: {
    flex: 1,
    fontSize: 11,
    color: '#1565C0',
  },
  securityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
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
});
