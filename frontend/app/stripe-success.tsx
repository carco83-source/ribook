import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi } from '../src/utils/api';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function StripeSuccessScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { order_id, session_id } = params;
  
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderDetails, setOrderDetails] = useState<any>(null);

  useEffect(() => {
    verifyPayment();
  }, []);

  const verifyPayment = async () => {
    try {
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId || !order_id || !session_id) {
        setError('Parametri mancanti. Riprova.');
        setLoading(false);
        return;
      }

      // Verifica il pagamento con il backend
      const response = await authApi.get(
        `/api/orders/${order_id}/verify-checkout?session_id=${session_id}&user_id=${userId}`
      );

      if (response.success) {
        setSuccess(true);
        setOrderDetails(response);
      } else {
        setError(response.message || 'Verifica pagamento fallita');
      }
    } catch (err: any) {
      console.error('Errore verifica pagamento:', err);
      setError(err.response?.data?.detail || 'Errore durante la verifica del pagamento');
    } finally {
      setLoading(false);
    }
  };

  const goToOrders = () => {
    router.replace('/profile/my-exchanges');
  };

  const goHome = () => {
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen 
        options={{ 
          title: 'Pagamento',
          headerShown: true,
          headerBackVisible: false,
        }} 
      />
      
      <View style={styles.content}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>Verifica del pagamento in corso...</Text>
          </View>
        ) : success ? (
          <View style={styles.successContainer}>
            <View style={styles.iconContainer}>
              <Ionicons name="checkmark-circle" size={100} color="#22c55e" />
            </View>
            <Text style={styles.successTitle}>Pagamento Completato!</Text>
            <Text style={styles.successMessage}>
              Il tuo ordine è stato confermato.{'\n'}
              Riceverai una notifica quando il libro sarà pronto per il ritiro.
            </Text>
            
            {orderDetails?.order_code && (
              <View style={styles.orderCodeContainer}>
                <Text style={styles.orderCodeLabel}>Codice Ordine</Text>
                <Text style={styles.orderCode}>{orderDetails.order_code}</Text>
              </View>
            )}

            <View style={styles.buttonsContainer}>
              <TouchableOpacity style={styles.primaryButton} onPress={goToOrders}>
                <Ionicons name="list-outline" size={20} color="#fff" />
                <Text style={styles.primaryButtonText}>I Miei Scambi</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.secondaryButton} onPress={goHome}>
                <Ionicons name="home-outline" size={20} color="#2563eb" />
                <Text style={styles.secondaryButtonText}>Torna alla Home</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.errorContainer}>
            <View style={styles.iconContainer}>
              <Ionicons name="close-circle" size={100} color="#ef4444" />
            </View>
            <Text style={styles.errorTitle}>Errore</Text>
            <Text style={styles.errorMessage}>{error}</Text>
            
            <View style={styles.buttonsContainer}>
              <TouchableOpacity style={styles.primaryButton} onPress={() => router.back()}>
                <Ionicons name="refresh-outline" size={20} color="#fff" />
                <Text style={styles.primaryButtonText}>Riprova</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.secondaryButton} onPress={goHome}>
                <Ionicons name="home-outline" size={20} color="#2563eb" />
                <Text style={styles.secondaryButtonText}>Torna alla Home</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingContainer: {
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  successContainer: {
    alignItems: 'center',
    width: '100%',
  },
  errorContainer: {
    alignItems: 'center',
    width: '100%',
  },
  iconContainer: {
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#22c55e',
    marginBottom: 12,
  },
  successMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  errorTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ef4444',
    marginBottom: 12,
  },
  errorMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  orderCodeContainer: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  orderCodeLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  orderCode: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2563eb',
    letterSpacing: 2,
  },
  buttonsContainer: {
    width: '100%',
    gap: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2563eb',
    gap: 8,
  },
  secondaryButtonText: {
    color: '#2563eb',
    fontSize: 16,
    fontWeight: '600',
  },
});
