import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Image,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Listing {
  id: string;
  book_titolo: string;
  book_autore: string;
  book_materia: string;
  condizione: string;
  prezzo_vendita: number;
  prezzo_ministeriale: number;
  stato: string;
  foto_base64?: string;
  created_at: string;
}

export default function SellScreen() {
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      if (!storedUserId) {
        router.replace('/');
        return;
      }
      setUserId(storedUserId);

      const response = await axios.get(
        `${API_URL}/api/listings/user/${storedUserId}`
      );
      setListings(response.data);
    } catch (error) {
      console.error('Error loading listings:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleDeleteListing = async (listingId: string) => {
    Alert.alert(
      'Elimina annuncio',
      'Sei sicuro di voler eliminare questo annuncio?',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(
                `${API_URL}/api/listings/${listingId}?user_id=${userId}`
              );
              setListings(listings.filter((l) => l.id !== listingId));
              Alert.alert('Eliminato', 'Annuncio eliminato con successo');
            } catch (error: any) {
              Alert.alert(
                'Errore',
                error.response?.data?.detail || 'Impossibile eliminare'
              );
            }
          },
        },
      ]
    );
  };

  const getConditionLabel = (condition: string) => {
    const labels: { [key: string]: string } = {
      nuovo: 'Nuovo',
      come_nuovo: 'Come Nuovo',
      ottime_condizioni: 'Ottime Condizioni',
      buono: 'Buono',
      scarso: 'Scarso',
    };
    return labels[condition] || condition;
  };

  const getStatoColor = (stato: string) => {
    switch (stato) {
      case 'disponibile':
        return '#4CAF50';
      case 'prenotato':
        return '#FFC107';
      case 'venduto':
        return '#9E9E9E';
      default:
        return '#666';
    }
  };

  const renderListing = ({ item }: { item: Listing }) => (
    <View style={styles.listingCard}>
      {item.foto_base64 && (
        <Image
          source={{ uri: `data:image/jpeg;base64,${item.foto_base64}` }}
          style={styles.listingImage}
        />
      )}
      
      <View style={styles.listingContent}>
        <View style={styles.listingHeader}>
          <View
            style={[
              styles.statoBadge,
              { backgroundColor: getStatoColor(item.stato) },
            ]}
          >
            <Text style={styles.statoText}>
              {item.stato.charAt(0).toUpperCase() + item.stato.slice(1)}
            </Text>
          </View>
          <Text style={styles.listingPrice}>
            €{item.prezzo_vendita.toFixed(2)}
          </Text>
        </View>

        <Text style={styles.listingTitle}>{item.book_titolo}</Text>
        <Text style={styles.listingAuthor}>{item.book_autore}</Text>

        <View style={styles.listingMeta}>
          <View style={styles.conditionBadge}>
            <Text style={styles.conditionText}>
              {getConditionLabel(item.condizione)}
            </Text>
          </View>
          <Text style={styles.originalPrice}>
            Listino: €{item.prezzo_ministeriale.toFixed(2)}
          </Text>
        </View>

        {item.stato === 'disponibile' && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDeleteListing(item.id)}
          >
            <Ionicons name="trash-outline" size={16} color="#ff4444" />
            <Text style={styles.deleteButtonText}>Elimina</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a472a" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => router.push('/listing/create')}
      >
        <Ionicons name="add-circle" size={24} color="#fff" />
        <Text style={styles.addButtonText}>Vendi un libro</Text>
      </TouchableOpacity>

      {listings.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="pricetag-outline" size={48} color="#ccc" />
          <Text style={styles.emptyText}>Nessun annuncio</Text>
          <Text style={styles.emptySubtext}>
            Inizia a vendere i tuoi libri usati!
          </Text>
        </View>
      ) : (
        <FlatList
          data={listings}
          renderItem={renderListing}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          showsVerticalScrollIndicator={false}
        />
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
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a472a',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  listingCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  listingImage: {
    width: '100%',
    height: 150,
    resizeMode: 'cover',
  },
  listingContent: {
    padding: 16,
  },
  listingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statoBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statoText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  listingPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  listingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  listingAuthor: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  listingMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 12,
  },
  conditionBadge: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  conditionText: {
    fontSize: 12,
    color: '#666',
  },
  originalPrice: {
    fontSize: 12,
    color: '#999',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 4,
  },
  deleteButtonText: {
    color: '#ff4444',
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 100,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
});
