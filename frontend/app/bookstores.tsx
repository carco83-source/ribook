import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Platform,
  SafeAreaView,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Bookstore {
  id: string;
  nome: string;
  indirizzo: string;
  citta: string;
  telefono: string;
}

export default function BookstoresScreen() {
  const router = useRouter();
  const [bookstores, setBookstores] = useState<Bookstore[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBookstore, setSelectedBookstore] = useState<Bookstore | null>(null);

  useEffect(() => {
    loadBookstores();
  }, []);

  const loadBookstores = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/bookstores`);
      setBookstores(response.data);
    } catch (error) {
      console.error('Error loading bookstores:', error);
    } finally {
      setLoading(false);
    }
  };

  const openMaps = (bookstore: Bookstore) => {
    const address = encodeURIComponent(`${bookstore.indirizzo}, ${bookstore.citta}`);
    if (Platform.OS === 'web') {
      window.open(`https://www.google.com/maps/search/?api=1&query=${address}`, '_blank');
    } else if (Platform.OS === 'ios') {
      Linking.openURL(`maps:0,0?q=${address}`);
    } else {
      Linking.openURL(`geo:0,0?q=${address}`);
    }
  };

  const callBookstore = (telefono: string) => {
    if (Platform.OS === 'web') {
      window.open(`tel:${telefono}`, '_self');
    } else {
      Linking.openURL(`tel:${telefono}`);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Cartolibrerie', headerShown: true }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1a472a" />
          <Text style={styles.loadingText}>Caricamento...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen 
        options={{ 
          title: 'Cartolibrerie Partner',
          headerShown: true,
          headerStyle: { backgroundColor: '#1a472a' },
          headerTintColor: '#fff',
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: 8 }}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
          ),
        }} 
      />
      
      {/* Map Placeholder for Web */}
      <View style={styles.mapPlaceholder}>
        <Ionicons name="map" size={48} color="#1a472a" />
        <Text style={styles.mapPlaceholderTitle}>Punti di Scambio</Text>
        <Text style={styles.mapPlaceholderText}>
          Le cartolibrerie partner dove puoi ritirare e consegnare i libri
        </Text>
      </View>

      {/* Bookstore List */}
      <View style={styles.listContainer}>
        <Text style={styles.listTitle}>
          <Ionicons name="storefront" size={18} color="#1a472a" /> Cartolibrerie a Catanzaro
        </Text>
        
        {bookstores.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="storefront-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>Nessuna cartolibreria disponibile</Text>
            <Text style={styles.emptySubtext}>Prossimamente aggiungeremo punti di ritiro</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {bookstores.map((store) => (
              <TouchableOpacity
                key={store.id}
                style={[
                  styles.bookstoreCard,
                  selectedBookstore?.id === store.id && styles.bookstoreCardSelected,
                ]}
                onPress={() => setSelectedBookstore(store)}
              >
                <View style={styles.bookstoreIcon}>
                  <Ionicons name="storefront" size={24} color="#fff" />
                </View>
                <View style={styles.bookstoreInfo}>
                  <Text style={styles.bookstoreName}>{store.nome}</Text>
                  <View style={styles.addressRow}>
                    <Ionicons name="location-outline" size={14} color="#666" />
                    <Text style={styles.bookstoreAddress}>{store.indirizzo}</Text>
                  </View>
                  <View style={styles.addressRow}>
                    <Ionicons name="business-outline" size={14} color="#999" />
                    <Text style={styles.bookstoreCity}>{store.citta}</Text>
                  </View>
                </View>
                <View style={styles.bookstoreActions}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => callBookstore(store.telefono)}
                  >
                    <Ionicons name="call" size={18} color="#1a472a" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.actionButtonPrimary]}
                    onPress={() => openMaps(store)}
                  >
                    <Ionicons name="navigate" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="shield-checkmark" size={20} color="#1a472a" />
        <Text style={styles.infoBannerText}>
          Le cartolibrerie custodiscono i libri per garantire scambi sicuri
        </Text>
      </View>
    </SafeAreaView>
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
    color: '#666',
    fontSize: 16,
  },
  mapPlaceholder: {
    backgroundColor: '#e8f5e9',
    padding: 24,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#c8e6c9',
  },
  mapPlaceholderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a472a',
    marginTop: 8,
  },
  mapPlaceholderText: {
    fontSize: 14,
    color: '#2e7d32',
    textAlign: 'center',
    marginTop: 4,
  },
  listContainer: {
    flex: 1,
    padding: 16,
  },
  listTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  bookstoreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  bookstoreCardSelected: {
    borderWidth: 2,
    borderColor: '#1a472a',
  },
  bookstoreIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1a472a',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  bookstoreInfo: {
    flex: 1,
  },
  bookstoreName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  bookstoreAddress: {
    fontSize: 13,
    color: '#666',
  },
  bookstoreCity: {
    fontSize: 12,
    color: '#999',
  },
  bookstoreActions: {
    flexDirection: 'column',
    gap: 8,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e8f5e9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonPrimary: {
    backgroundColor: '#1a472a',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#c8e6c9',
  },
  infoBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#1a472a',
    lineHeight: 18,
  },
});
