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

export default function StripeBatchSuccessScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { session_id, order_ids } = params;
  
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderCodes, setOrderCodes] = useState<string[]>([]);
  const [orderCount, setOrderCount] = useState(0);

  useEffect(() => {
    verifyPayment();
  }, []);

  const verifyPayment = async () => {
    try {
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId || !session_id || !order_ids) {
        setError('Parametri mancanti. Riprova.');
        setLoading(false);
        return;
      }

      // Verifica il pagamento batch con il backend
      const response = await authApi.get(
        `/api/orders/verify-batch-checkout?session_id=${session_id}&order_ids=${order_ids}&user_id=${userId}`
      );

      if (response.success) {
        setSuccess(true);
        setOrderCodes(response.order_codes || []);
        setOrderCount(response.order_codes?.length || 0);
      } else {
        setError(response.message || 'Verifica pagamento fallita');
      }
    } catch (err: any) {
      console.error('Errore verifica pagamento batch:', err);
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
            <ActivityIndicator size="large" color="#1a472a" />
            <Text style={styles.loadingText}>Verifica del pagamento in corso...</Text>
          </View>
        ) : success ? (
          <View style={styles.successContainer}>
            <View style={styles.iconContainer}>
              <Ionicons name="checkmark-circle" size={100} color="#22c55e" />
            </View>
            <Text style={styles.successTitle}>Acquisto Completato!</Text>
            <Text style={styles.successMessage}>
              Hai acquistato {orderCount} {orderCount === 1 ? 'libro' : 'libri'}.{'\n'}
              Riceverai una notifica quando saranno pronti per il ritiro.
            </Text>
            
            {orderCodes.length > 0 && (
              <View style={styles.orderCodesContainer}>
                <Text style={styles.orderCodesLabel}>Codici Ordine</Text>
                {orderCodes.map((code, index) => (
                  <Text key={index} style={styles.orderCode}>#{code}</Text>
                ))}
              </View>
            )}

            <View style={styles.infoBox}>
              <Ionicons name="time-outline" size={20} color="#FF9800" />
              <Text style={styles.infoText}>
                I venditori hanno 2 giorni lavorativi per consegnare i libri alla cartolibreria.
              </Text>
            </View>

            <View style={styles.buttonsContainer}>
              <TouchableOpacity style={styles.primaryButton} onPress={goToOrders}>
                <Ionicons name="list-outline" size={20} color="#fff" />
                <Text style={styles.primaryButtonText}>I Miei Scambi</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.secondaryButton} onPress={goHome}>
                <Ionicons name="home-outline" size={20} color="#1a472a" />
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
                <Ionicons name="home-outline" size={20} color="#1a472a" />
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
  orderCodesContainer: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  orderCodesLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  orderCode: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a472a',
    letterSpacing: 1,
    marginVertical: 2,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    padding: 12,
    borderRadius: 10,
    marginBottom: 24,
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#E65100',
    lineHeight: 18,
  },
  buttonsContainer: {
    width: '100%',
    gap: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a472a',
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
    borderColor: '#1a472a',
    gap: 8,
  },
  secondaryButtonText: {
    color: '#1a472a',
    fontSize: 16,
    fontWeight: '600',
  },
});
