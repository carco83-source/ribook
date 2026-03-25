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
  Platform,
} from 'react-native';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

// Cross-platform confirm dialog
const showConfirm = (title: string, message: string, onConfirm: () => void, destructive = false) => {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
  } else {
    Alert.alert(title, message, [
      { text: 'Annulla', style: 'cancel' },
      { text: destructive ? 'Elimina' : 'Conferma', style: destructive ? 'destructive' : 'default', onPress: onConfirm },
    ]);
  }
};

const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Sale {
  id: string;
  book_titolo: string;
  book_autore: string;
  prezzo_vendita: number;
  condizione: string;
  stato: string;
  days_remaining: number | null;
  deadline_consegna: string | null;
  bookstore_ritiro_nome: string | null;
  codice_ritiro: string | null;
  buyer_username?: string;
}

interface PendingConfirmation {
  id: string;
  listing_id: string;
  buyer_id: string;
  buyer_username: string;
  book_title: string;
  book_isbn: string;
  price: number;
  created_at: string;
  status: string;
}

const STATO_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  disponibile: { label: 'In vendita', color: '#4CAF50', icon: 'pricetag' },
  prenotato: { label: 'Prenotato', color: '#FF9800', icon: 'bookmark' },
  venduto: { label: 'Venduto - Da consegnare', color: '#FF9800', icon: 'time' },
  consegnato: { label: 'Consegnato', color: '#2196F3', icon: 'checkmark-circle' },
  ritirato: { label: 'Completato', color: '#9C27B0', icon: 'trophy' },
};

export default function MySalesScreen() {
  const router = useRouter();
  const [sales, setSales] = useState<Sale[]>([]);
  const [pendingConfirmations, setPendingConfirmations] = useState<PendingConfirmation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/transactions');
    }
  };

  const loadSales = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      setUserId(storedUserId);
      
      if (storedUserId) {
        // Carica vendite
        const salesResponse = await axios.get(`${API_URL}/api/user/${storedUserId}/sales`);
        setSales(salesResponse.data);
        
        // Carica richieste di conferma pendenti
        try {
          const pendingResponse = await axios.get(`${API_URL}/api/seller/${storedUserId}/pending-confirmations`);
          setPendingConfirmations(pendingResponse.data);
        } catch (error) {
          console.log('No pending confirmations or error:', error);
          setPendingConfirmations([]);
        }
      }
    } catch (error) {
      console.error('Error loading sales:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleConfirmRequest = async (cartItemId: string) => {
    showConfirm(
      'Conferma disponibilità',
      'Confermi che il libro è disponibile per la vendita?',
      async () => {
        setProcessingId(cartItemId);
        try {
          await axios.post(`${API_URL}/api/cart/${cartItemId}/confirm`);
          showAlert('Successo', 'Richiesta confermata! L\'acquirente può ora procedere al pagamento.');
          loadSales();
        } catch (error: any) {
          showAlert('Errore', error.response?.data?.detail || 'Errore durante la conferma');
        } finally {
          setProcessingId(null);
        }
      }
    );
  };

  const handleRejectRequest = async (cartItemId: string) => {
    showConfirm(
      'Rifiuta richiesta',
      'Sei sicuro di voler rifiutare questa richiesta? Il libro tornerà disponibile per altri acquirenti.',
      async () => {
        setProcessingId(cartItemId);
        try {
          await axios.post(`${API_URL}/api/cart/${cartItemId}/reject`);
          showAlert('Richiesta rifiutata', 'Il libro è di nuovo disponibile per altri acquirenti.');
          loadSales();
        } catch (error: any) {
          showAlert('Errore', error.response?.data?.detail || 'Errore durante il rifiuto');
        } finally {
          setProcessingId(null);
        }
      },
      true
    );
  };

  useFocusEffect(
    useCallback(() => {
      loadSales();
    }, [])
  );

  const handleDeleteListing = async (listingId: string, bookTitle: string) => {
    showConfirm(
      'Elimina annuncio',
      `Sei sicuro di voler eliminare l'annuncio per "${bookTitle}"?`,
      async () => {
        setProcessingId(listingId);
        try {
          await axios.delete(`${API_URL}/api/listings/${listingId}?user_id=${userId}`);
          showAlert('Fatto!', 'Annuncio eliminato con successo');
          loadSales();
        } catch (error: any) {
          showAlert('Errore', error.response?.data?.detail || 'Errore durante l\'eliminazione');
        } finally {
          setProcessingId(null);
        }
      },
      true
    );
  };

  const handleMarkDelivered = async (listingId: string) => {
    showConfirm(
      'Conferma consegna',
      'Hai consegnato il libro alla cartolibreria?',
      async () => {
        try {
          await axios.post(
            `${API_URL}/api/listings/${listingId}/mark-delivered?seller_id=${userId}`
          );
          showAlert('Fatto!', 'Libro segnato come consegnato');
          loadSales();
        } catch (error: any) {
          showAlert('Errore', error.response?.data?.detail || 'Errore durante l\'operazione');
        }
      }
    );
  };

  const renderSaleCard = (sale: Sale) => {
    const config = STATO_CONFIG[sale.stato] || STATO_CONFIG.disponibile;
    const isUrgent = sale.days_remaining !== null && sale.days_remaining <= 2;

    return (
      <View key={sale.id} style={styles.saleCard}>
        {/* Header with status */}
        <View style={[styles.statusBadge, { backgroundColor: config.color }]}>
          <Ionicons name={config.icon as any} size={14} color="#fff" />
          <Text style={styles.statusText}>{config.label}</Text>
        </View>

        {/* Book info */}
        <Text style={styles.bookTitle}>{sale.book_titolo}</Text>
        <Text style={styles.bookAuthor}>{sale.book_autore}</Text>

        {/* Price and condition */}
        <View style={styles.infoRow}>
          <View style={styles.priceTag}>
            <Text style={styles.priceText}>€{sale.prezzo_vendita.toFixed(2)}</Text>
          </View>
          <Text style={styles.conditionText}>
            {sale.condizione === 'perfetto' && '🟢 Perfetto'}
            {sale.condizione === 'buono' && '🟡 Buono'}
            {sale.condizione === 'molto_usato' && '🔴 Molto usato'}
          </Text>
        </View>

        {/* Delivery info for sold items */}
        {sale.stato === 'venduto' && (
          <View style={styles.deliverySection}>
            {isUrgent && (
              <View style={styles.urgentBanner}>
                <Ionicons name="warning" size={16} color="#fff" />
                <Text style={styles.urgentText}>
                  {sale.days_remaining === 0
                    ? 'SCADENZA OGGI!'
                    : `Solo ${sale.days_remaining} giorni rimasti!`}
                </Text>
              </View>
            )}

            <View style={styles.deliveryInfo}>
              <Ionicons name="storefront" size={16} color="#666" />
              <Text style={styles.deliveryText}>
                Consegna a: <Text style={styles.deliveryBold}>{sale.bookstore_ritiro_nome}</Text>
              </Text>
            </View>

            {sale.days_remaining !== null && !isUrgent && (
              <View style={styles.deliveryInfo}>
                <Ionicons name="time" size={16} color="#666" />
                <Text style={styles.deliveryText}>
                  Hai <Text style={styles.deliveryBold}>{sale.days_remaining} giorni</Text> per consegnare
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.deliverButton}
              onPress={() => handleMarkDelivered(sale.id)}
            >
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.deliverButtonText}>Ho consegnato il libro</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Waiting for pickup */}
        {sale.stato === 'consegnato' && (
          <View style={styles.waitingSection}>
            <Ionicons name="hourglass" size={20} color="#2196F3" />
            <Text style={styles.waitingText}>
              In attesa che l'acquirente ritiri il libro
            </Text>
          </View>
        )}

        {/* Completed */}
        {sale.stato === 'ritirato' && (
          <View style={styles.completedSection}>
            <Ionicons name="checkmark-done-circle" size={20} color="#9C27B0" />
            <Text style={styles.completedText}>
              Transazione completata!
            </Text>
          </View>
        )}

        {/* Buyer info */}
        {sale.buyer_username && sale.stato !== 'disponibile' && (
          <View style={styles.buyerInfo}>
            <Ionicons name="person" size={14} color="#999" />
            <Text style={styles.buyerText}>Acquirente: {sale.buyer_username}</Text>
          </View>
        )}

        {/* Delete button for available listings */}
        {sale.stato === 'disponibile' && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDeleteListing(sale.id, sale.book_titolo)}
            disabled={processingId === sale.id}
          >
            {processingId === sale.id ? (
              <ActivityIndicator size="small" color="#f44336" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={18} color="#f44336" />
                <Text style={styles.deleteButtonText}>Elimina annuncio</Text>
              </>
            )}
          </TouchableOpacity>
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

  const pendingSales = sales.filter(s => s.stato === 'venduto');
  const activeSales = sales.filter(s => s.stato === 'disponibile');
  const deliveredSales = sales.filter(s => s.stato === 'consegnato');
  const completedSales = sales.filter(s => s.stato === 'ritirato');

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Le mie vendite',
          headerStyle: { backgroundColor: '#1a472a' },
          headerTintColor: '#fff',
          headerLeft: () => (
            <TouchableOpacity onPress={handleGoBack} style={{ paddingHorizontal: 16 }}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => {
            setRefreshing(true);
            loadSales();
          }} />
        }
      >
        {/* Richieste di conferma pendenti */}
        {pendingConfirmations.length > 0 && (
          <View style={styles.section}>
            <View style={styles.pendingHeader}>
              <Ionicons name="notifications" size={20} color="#f44336" />
              <Text style={[styles.sectionTitle, { color: '#f44336', marginLeft: 8 }]}>
                Richieste in attesa ({pendingConfirmations.length})
              </Text>
            </View>
            <Text style={styles.pendingSubtitle}>
              Conferma la disponibilità dei tuoi libri entro 24 ore
            </Text>
            {pendingConfirmations.map((item) => (
              <View key={item.id} style={styles.pendingCard}>
                <View style={styles.pendingCardHeader}>
                  <Ionicons name="cart" size={20} color="#f44336" />
                  <Text style={styles.pendingBuyerText}>
                    {item.buyer_username} vuole acquistare
                  </Text>
                </View>
                <Text style={styles.pendingBookTitle} numberOfLines={2}>
                  {item.book_title}
                </Text>
                <Text style={styles.pendingIsbn}>ISBN: {item.book_isbn}</Text>
                <View style={styles.pendingPriceRow}>
                  <Text style={styles.pendingPrice}>€{item.price?.toFixed(2)}</Text>
                  <Text style={styles.pendingDate}>
                    Richiesta: {new Date(item.created_at).toLocaleDateString('it-IT')}
                  </Text>
                </View>
                <View style={styles.pendingActions}>
                  <TouchableOpacity
                    style={[styles.pendingButton, styles.rejectButton]}
                    onPress={() => handleRejectRequest(item.id)}
                    disabled={processingId === item.id}
                  >
                    {processingId === item.id ? (
                      <ActivityIndicator size="small" color="#f44336" />
                    ) : (
                      <>
                        <Ionicons name="close-circle" size={18} color="#f44336" />
                        <Text style={styles.rejectButtonText}>Rifiuta</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.pendingButton, styles.confirmButton]}
                    onPress={() => handleConfirmRequest(item.id)}
                    disabled={processingId === item.id}
                  >
                    {processingId === item.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={18} color="#fff" />
                        <Text style={styles.confirmButtonText}>Conferma</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Pending deliveries */}
        {pendingSales.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="alert-circle" size={18} color="#FF9800" /> Da consegnare ({pendingSales.length})
            </Text>
            {pendingSales.map(renderSaleCard)}
          </View>
        )}

        {/* Waiting for pickup */}
        {deliveredSales.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="hourglass" size={18} color="#2196F3" /> In attesa di ritiro ({deliveredSales.length})
            </Text>
            {deliveredSales.map(renderSaleCard)}
          </View>
        )}

        {/* Active listings */}
        {activeSales.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="pricetag" size={18} color="#4CAF50" /> In vendita ({activeSales.length})
            </Text>
            {activeSales.map(renderSaleCard)}
          </View>
        )}

        {/* Completed */}
        {completedSales.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="trophy" size={18} color="#9C27B0" /> Completate ({completedSales.length})
            </Text>
            {completedSales.map(renderSaleCard)}
          </View>
        )}

        {sales.length === 0 && (
          <View style={styles.emptyContainer}>
            <Ionicons name="book-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>Non hai ancora messo libri in vendita</Text>
            <TouchableOpacity
              style={styles.sellButton}
              onPress={() => router.push('/listing/create')}
            >
              <Text style={styles.sellButtonText}>Vendi un libro</Text>
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
  saleCard: {
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
    marginBottom: 8,
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
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  priceTag: {
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  priceText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  conditionText: {
    fontSize: 14,
    color: '#666',
  },
  deliverySection: {
    backgroundColor: '#fff8e1',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  urgentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f44336',
    padding: 8,
    borderRadius: 6,
    gap: 8,
    marginBottom: 12,
  },
  urgentText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  deliveryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  deliveryText: {
    fontSize: 14,
    color: '#666',
  },
  deliveryBold: {
    fontWeight: '600',
    color: '#333',
  },
  deliverButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    padding: 12,
    borderRadius: 8,
    gap: 8,
    marginTop: 8,
  },
  deliverButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  waitingSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 8,
    gap: 8,
    marginTop: 8,
  },
  waitingText: {
    color: '#1976D2',
    fontSize: 14,
  },
  completedSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3e5f5',
    padding: 12,
    borderRadius: 8,
    gap: 8,
    marginTop: 8,
  },
  completedText: {
    color: '#7B1FA2',
    fontSize: 14,
    fontWeight: '500',
  },
  buyerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  buyerText: {
    fontSize: 13,
    color: '#999',
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
  sellButton: {
    backgroundColor: '#1a472a',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  sellButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Stili per richieste pendenti
  pendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  pendingSubtitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  pendingCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#ffcdd2',
    shadowColor: '#f44336',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  pendingCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  pendingBuyerText: {
    fontSize: 14,
    color: '#f44336',
    fontWeight: '600',
  },
  pendingBookTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  pendingIsbn: {
    fontSize: 12,
    color: '#999',
    marginBottom: 8,
  },
  pendingPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  pendingPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  pendingDate: {
    fontSize: 12,
    color: '#666',
  },
  pendingActions: {
    flexDirection: 'row',
    gap: 12,
  },
  pendingButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 6,
  },
  confirmButton: {
    backgroundColor: '#4CAF50',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  rejectButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#f44336',
  },
  rejectButtonText: {
    color: '#f44336',
    fontSize: 14,
    fontWeight: '600',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f44336',
    padding: 10,
    borderRadius: 8,
    gap: 6,
    marginTop: 12,
  },
  deleteButtonText: {
    color: '#f44336',
    fontSize: 14,
    fontWeight: '600',
  },
});
