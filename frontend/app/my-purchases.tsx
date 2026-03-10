import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Purchase {
  id: string;
  book_titolo: string;
  book_autore: string;
  prezzo_vendita: number;
  condizione: string;
  stato: string;
  seller_username?: string;
  bookstore_ritiro_nome?: string;
  codice_ritiro?: string;
  data_consegna?: string;
}

const STATO_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  venduto: { label: 'In attesa consegna', color: '#FF9800', icon: 'time' },
  consegnato: { label: 'Pronto per ritiro', color: '#4CAF50', icon: 'checkmark-circle' },
  ritirato: { label: 'Completato', color: '#9C27B0', icon: 'trophy' },
};

export default function MyPurchasesScreen() {
  const router = useRouter();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const loadPurchases = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      setUserId(storedUserId);
      
      if (storedUserId) {
        const response = await axios.get(`${API_URL}/api/user/${storedUserId}/purchases`);
        setPurchases(response.data);
      }
    } catch (error) {
      console.error('Error loading purchases:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadPurchases();
    }, [])
  );

  const handleConfirmPickup = async (listingId: string, codice: string) => {
    Alert.prompt(
      'Conferma ritiro',
      'Inserisci il codice ritiro mostrato sul pacco:',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Conferma',
          onPress: async (inputCode) => {
            if (!inputCode) {
              Alert.alert('Errore', 'Inserisci il codice');
              return;
            }
            try {
              await axios.post(
                `${API_URL}/api/listings/${listingId}/confirm-pickup?buyer_id=${userId}&codice=${inputCode}`
              );
              Alert.alert('Fatto!', 'Ritiro confermato. Transazione completata!');
              loadPurchases();
            } catch (error: any) {
              Alert.alert('Errore', error.response?.data?.detail || 'Codice non valido');
            }
          },
        },
      ],
      'plain-text',
      codice // Pre-fill with expected code for testing
    );
  };

  // Fallback for web where prompt doesn't work well
  const handleConfirmPickupWeb = async (listingId: string, codice: string) => {
    Alert.alert(
      'Conferma ritiro',
      `Il tuo codice ritiro è: ${codice}\n\nConfermi di aver ritirato il libro?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Conferma ritiro',
          onPress: async () => {
            try {
              await axios.post(
                `${API_URL}/api/listings/${listingId}/confirm-pickup?buyer_id=${userId}&codice=${codice}`
              );
              Alert.alert('Fatto!', 'Ritiro confermato. Transazione completata!');
              loadPurchases();
            } catch (error: any) {
              Alert.alert('Errore', error.response?.data?.detail || 'Errore durante la conferma');
            }
          },
        },
      ]
    );
  };

  const renderPurchaseCard = (purchase: Purchase) => {
    const config = STATO_CONFIG[purchase.stato] || STATO_CONFIG.venduto;

    return (
      <View key={purchase.id} style={styles.purchaseCard}>
        {/* Header with status */}
        <View style={[styles.statusBadge, { backgroundColor: config.color }]}>
          <Ionicons name={config.icon as any} size={14} color="#fff" />
          <Text style={styles.statusText}>{config.label}</Text>
        </View>

        {/* Book info */}
        <Text style={styles.bookTitle}>{purchase.book_titolo}</Text>
        <Text style={styles.bookAuthor}>{purchase.book_autore}</Text>

        {/* Price */}
        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>Prezzo pagato:</Text>
          <Text style={styles.priceValue}>€{purchase.prezzo_vendita.toFixed(2)}</Text>
        </View>

        {/* Seller info */}
        {purchase.seller_username && (
          <View style={styles.infoRow}>
            <Ionicons name="person-outline" size={16} color="#666" />
            <Text style={styles.infoText}>Venditore: {purchase.seller_username}</Text>
          </View>
        )}

        {/* Bookstore info */}
        {purchase.bookstore_ritiro_nome && (
          <View style={styles.infoRow}>
            <Ionicons name="storefront-outline" size={16} color="#666" />
            <Text style={styles.infoText}>Ritiro: {purchase.bookstore_ritiro_nome}</Text>
          </View>
        )}

        {/* Pickup code for ready items */}
        {purchase.stato === 'consegnato' && purchase.codice_ritiro && (
          <View style={styles.pickupSection}>
            <View style={styles.pickupCodeContainer}>
              <Text style={styles.pickupCodeLabel}>Codice ritiro:</Text>
              <Text style={styles.pickupCode}>{purchase.codice_ritiro}</Text>
            </View>
            <Text style={styles.pickupHint}>
              Mostra questo codice quando ritiri il libro
            </Text>
            <TouchableOpacity
              style={styles.confirmButton}
              onPress={() => handleConfirmPickupWeb(purchase.id, purchase.codice_ritiro!)}
            >
              <Ionicons name="checkmark-done" size={20} color="#fff" />
              <Text style={styles.confirmButtonText}>Ho ritirato il libro</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Waiting message */}
        {purchase.stato === 'venduto' && (
          <View style={styles.waitingSection}>
            <Ionicons name="hourglass-outline" size={20} color="#FF9800" />
            <Text style={styles.waitingText}>
              In attesa che il venditore consegni il libro alla cartolibreria
            </Text>
          </View>
        )}

        {/* Completed message */}
        {purchase.stato === 'ritirato' && (
          <View style={styles.completedSection}>
            <Ionicons name="checkmark-done-circle" size={20} color="#9C27B0" />
            <Text style={styles.completedText}>
              Transazione completata!
            </Text>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a472a" />
      </View>
    );
  }

  const pendingPurchases = purchases.filter(p => p.stato === 'venduto');
  const readyPurchases = purchases.filter(p => p.stato === 'consegnato');
  const completedPurchases = purchases.filter(p => p.stato === 'ritirato');

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'I miei acquisti',
          headerStyle: { backgroundColor: '#1a472a' },
          headerTintColor: '#fff',
        }}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => {
            setRefreshing(true);
            loadPurchases();
          }} />
        }
      >
        {/* Ready for pickup */}
        {readyPurchases.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="checkmark-circle" size={18} color="#4CAF50" /> Pronti per il ritiro ({readyPurchases.length})
            </Text>
            {readyPurchases.map(renderPurchaseCard)}
          </View>
        )}

        {/* Waiting for delivery */}
        {pendingPurchases.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="time" size={18} color="#FF9800" /> In attesa ({pendingPurchases.length})
            </Text>
            {pendingPurchases.map(renderPurchaseCard)}
          </View>
        )}

        {/* Completed */}
        {completedPurchases.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="trophy" size={18} color="#9C27B0" /> Completati ({completedPurchases.length})
            </Text>
            {completedPurchases.map(renderPurchaseCard)}
          </View>
        )}

        {purchases.length === 0 && (
          <View style={styles.emptyContainer}>
            <Ionicons name="cart-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>Non hai ancora acquistato nulla</Text>
            <TouchableOpacity
              style={styles.searchButton}
              onPress={() => router.push('/(tabs)/search')}
            >
              <Text style={styles.searchButtonText}>Cerca libri</Text>
            </TouchableOpacity>
          </View>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  purchaseCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    marginBottom: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  bookTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  bookAuthor: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  priceLabel: {
    fontSize: 14,
    color: '#666',
  },
  priceValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
  },
  pickupSection: {
    backgroundColor: '#e8f5e9',
    padding: 16,
    borderRadius: 8,
    marginTop: 12,
  },
  pickupCodeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  pickupCodeLabel: {
    fontSize: 14,
    color: '#2e7d32',
  },
  pickupCode: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a472a',
    letterSpacing: 2,
  },
  pickupHint: {
    fontSize: 12,
    color: '#4CAF50',
    marginBottom: 12,
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  waitingSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff8e1',
    padding: 12,
    borderRadius: 8,
    gap: 8,
    marginTop: 12,
  },
  waitingText: {
    flex: 1,
    fontSize: 13,
    color: '#e65100',
  },
  completedSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3e5f5',
    padding: 12,
    borderRadius: 8,
    gap: 8,
    marginTop: 12,
  },
  completedText: {
    fontSize: 14,
    color: '#7B1FA2',
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
    marginBottom: 24,
  },
  searchButton: {
    backgroundColor: '#1a472a',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
