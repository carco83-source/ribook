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
  Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { authApi } from '../src/utils/api';
import { SafeAreaView } from 'react-native-safe-area-context';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

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
  commissione_piattaforma?: number;
  foderazione_costo?: number;
}

export default function StripePaymentScreen() {
  const router = useRouter();
  const { orderId, canceled } = useLocalSearchParams<{ orderId: string; canceled?: string }>();
  
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadUserAndOrder();
  }, []);

  useEffect(() => {
    // Se l'utente ha annullato il pagamento su Stripe
    if (canceled === 'true') {
      Alert.alert(
        'Pagamento Annullato',
        'Hai annullato il processo di pagamento. Puoi riprovare quando vuoi.',
        [{ text: 'OK' }]
      );
    }
  }, [canceled]);

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
    } catch (err: any) {
      console.error('Error loading order:', err);
      setError(err.response?.data?.detail || 'Errore nel caricamento ordine');
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async () => {
    if (!userId || !orderId) return;
    
    setProcessing(true);
    setError(null);

    try {
      // Crea Checkout Session su Stripe
      const response = await authApi.post(
        `/api/orders/${orderId}/create-checkout-session?user_id=${userId}`,
        { platform: Platform.OS === 'web' ? 'web' : 'mobile' }
      );

      if (response.checkout_url) {
        // WEB: Redirect alla pagina Stripe Checkout
        if (Platform.OS === 'web') {
          // Per web, redirect diretto
          window.location.href = response.checkout_url;
        } else {
          // MOBILE: Apri nel browser
          const supported = await Linking.canOpenURL(response.checkout_url);
          if (supported) {
            await Linking.openURL(response.checkout_url);
          } else {
            Alert.alert('Errore', 'Impossibile aprire la pagina di pagamento');
          }
        }
      } else if (response.paymentIntent) {
        // MOBILE con Payment Sheet (richiede stripe-react-native SDK)
        Alert.alert(
          'Pagamento Mobile',
          'Per completare il pagamento su dispositivi mobili, usa la versione web oppure attendi l\'aggiornamento dell\'app.',
          [
            { text: 'Apri Web', onPress: () => handlePayment() },
            { text: 'Annulla', style: 'cancel' }
          ]
        );
      }
    } catch (err: any) {
      console.error('Payment error:', err);
      const errorMessage = err.response?.data?.detail || 'Errore durante l\'avvio del pagamento';
      setError(errorMessage);
      Alert.alert('Errore Pagamento', errorMessage);
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = () => {
    Alert.alert(
      'Annulla Pagamento',
      'Sei sicuro di voler annullare? L\'ordine rimarrà in attesa di pagamento.',
      [
        { text: 'No, continua', style: 'cancel' },
        { 
          text: 'Sì, annulla', 
          style: 'destructive',
          onPress: () => router.back()
        }
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Stack.Screen options={{ title: 'Pagamento', headerShown: true }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Caricamento ordine...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !order) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Stack.Screen options={{ title: 'Errore', headerShown: true }} />
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={60} color="#ef4444" />
          <Text style={styles.errorTitle}>Errore</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => router.back()}>
            <Text style={styles.retryButtonText}>Torna indietro</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen 
        options={{ 
          title: 'Pagamento Sicuro',
          headerShown: true,
          headerLeft: () => (
            <TouchableOpacity onPress={handleCancel} style={{ padding: 8 }}>
              <Ionicons name="close" size={24} color="#000" />
            </TouchableOpacity>
          ),
        }} 
      />
      
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Order Summary */}
        <View style={styles.orderCard}>
          <Text style={styles.orderTitle}>Riepilogo Ordine</Text>
          
          <View style={styles.orderRow}>
            <Text style={styles.orderLabel}>Libro:</Text>
            <Text style={styles.orderValue} numberOfLines={2}>{order?.book_titolo}</Text>
          </View>
          
          <View style={styles.orderRow}>
            <Text style={styles.orderLabel}>Codice Ordine:</Text>
            <Text style={styles.orderCode}>{order?.order_code}</Text>
          </View>
          
          <View style={styles.orderRow}>
            <Text style={styles.orderLabel}>Venditore:</Text>
            <Text style={styles.orderValue}>{order?.seller_name}</Text>
          </View>
          
          <View style={styles.orderRow}>
            <Text style={styles.orderLabel}>Ritiro presso:</Text>
            <Text style={styles.orderValue}>{order?.bookstore_name}</Text>
          </View>
          
          <View style={styles.divider} />
          
          {/* Price breakdown */}
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Prezzo libro:</Text>
            <Text style={styles.priceValue}>€{order?.prezzo_libro?.toFixed(2)}</Text>
          </View>
          
          {order?.commissione_piattaforma && order.commissione_piattaforma > 0 && (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Commissione servizio:</Text>
              <Text style={styles.priceValue}>€{order.commissione_piattaforma.toFixed(2)}</Text>
            </View>
          )}
          
          {order?.include_foderazione && order?.foderazione_costo && (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Foderazione:</Text>
              <Text style={styles.priceValue}>€{order.foderazione_costo.toFixed(2)}</Text>
            </View>
          )}
          
          <View style={styles.divider} />
          
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>TOTALE:</Text>
            <Text style={styles.totalValue}>€{order?.totale_acquirente?.toFixed(2)}</Text>
          </View>
        </View>

        {/* Stripe Security Info */}
        <View style={styles.securityCard}>
          <View style={styles.securityHeader}>
            <Ionicons name="shield-checkmark" size={24} color="#22c55e" />
            <Text style={styles.securityTitle}>Pagamento Sicuro</Text>
          </View>
          <Text style={styles.securityText}>
            Sarai reindirizzato alla pagina di pagamento sicura di Stripe. 
            I tuoi dati di pagamento sono protetti e non vengono mai memorizzati sui nostri server.
          </Text>
          <View style={styles.stripeLogoContainer}>
            <Text style={styles.poweredBy}>Powered by</Text>
            <Text style={styles.stripeLogo}>stripe</Text>
          </View>
        </View>

        {/* Escrow Info */}
        <View style={styles.escrowCard}>
          <View style={styles.escrowHeader}>
            <Ionicons name="time-outline" size={20} color="#2563eb" />
            <Text style={styles.escrowTitle}>Sistema Escrow</Text>
          </View>
          <Text style={styles.escrowText}>
            I fondi saranno trattenuti in modo sicuro fino a 72 ore dopo il ritiro, 
            per garantire che il libro sia conforme alla descrizione.
          </Text>
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="warning" size={20} color="#dc2626" />
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        )}

        {/* Pay Button */}
        <TouchableOpacity 
          style={[styles.payButton, processing && styles.payButtonDisabled]}
          onPress={handlePayment}
          disabled={processing}
        >
          {processing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="card-outline" size={24} color="#fff" />
              <Text style={styles.payButtonText}>
                Paga €{order?.totale_acquirente?.toFixed(2)}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
          <Text style={styles.cancelButtonText}>Annulla</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ef4444',
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  orderTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#1a1a1a',
  },
  orderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  orderLabel: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  orderValue: {
    fontSize: 14,
    color: '#1a1a1a',
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
  },
  orderCode: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2563eb',
    flex: 2,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e5e5',
    marginVertical: 16,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  priceLabel: {
    fontSize: 14,
    color: '#666',
  },
  priceValue: {
    fontSize: 14,
    color: '#1a1a1a',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  totalValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  securityCard: {
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  securityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  securityTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#166534',
  },
  securityText: {
    fontSize: 14,
    color: '#166534',
    lineHeight: 20,
  },
  stripeLogoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 8,
  },
  poweredBy: {
    fontSize: 12,
    color: '#666',
  },
  stripeLogo: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#635bff',
    fontStyle: 'italic',
  },
  escrowCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  escrowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  escrowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e40af',
  },
  escrowText: {
    fontSize: 13,
    color: '#1e40af',
    lineHeight: 18,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 14,
    color: '#dc2626',
  },
  payButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
    paddingVertical: 18,
    borderRadius: 12,
    marginBottom: 12,
    gap: 12,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  payButtonDisabled: {
    backgroundColor: '#93c5fd',
  },
  payButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
  },
});
