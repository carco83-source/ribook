import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { SafeAreaView } from 'react-native-safe-area-context';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Order {
  id: string;
  order_code: string;
  buyer_id: string;
  buyer_name: string;
  seller_id: string;
  seller_name: string;
  book_titolo: string;
  book_autore?: string;
  book_condizioni?: string;
  prezzo_libro: number;
  totale_acquirente: number;
  netto_venditore: number;
  status: string;
  status_label?: string;
  bookstore_name: string;
  created_at: string;
  seller_confirmation_deadline?: string;
  delivery_deadline?: string;
  return_deadline?: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string; bgColor: string }> = {
  in_attesa_conferma_venditore: { label: 'In attesa conferma', color: '#FF9800', icon: 'hourglass-outline', bgColor: '#FFF3E0' },
  pending_seller_confirmation: { label: 'In attesa conferma', color: '#FF9800', icon: 'hourglass-outline', bgColor: '#FFF3E0' },
  annullato_non_disponibile: { label: 'Non disponibile', color: '#f44336', icon: 'close-circle-outline', bgColor: '#FFEBEE' },
  annullato_timeout: { label: 'Scaduto', color: '#f44336', icon: 'time-outline', bgColor: '#FFEBEE' },
  in_attesa_pagamento: { label: 'In attesa pagamento', color: '#FF9800', icon: 'card-outline', bgColor: '#FFF3E0' },
  pending_payment: { label: 'In attesa pagamento', color: '#FF9800', icon: 'card-outline', bgColor: '#FFF3E0' },
  pagato_attesa_consegna: { label: 'Da consegnare', color: '#2196F3', icon: 'time-outline', bgColor: '#E3F2FD' },
  paid_escrow: { label: 'Pagato', color: '#2196F3', icon: 'lock-closed-outline', bgColor: '#E3F2FD' },
  rifiutato_condizioni: { label: 'Rifiutato', color: '#f44336', icon: 'alert-circle-outline', bgColor: '#FFEBEE' },
  pronto_per_ritiro: { label: 'Pronto per ritiro', color: '#4CAF50', icon: 'checkmark-circle-outline', bgColor: '#E8F5E9' },
  ready_for_pickup: { label: 'Pronto per ritiro', color: '#4CAF50', icon: 'checkmark-circle-outline', bgColor: '#E8F5E9' },
  picked_up: { label: 'Ritirato', color: '#4CAF50', icon: 'bag-check-outline', bgColor: '#E8F5E9' },
  completed: { label: 'Completato', color: '#1a472a', icon: 'trophy-outline', bgColor: '#E8F5E9' },
  in_verifica_reso: { label: 'Reso in verifica', color: '#FF9800', icon: 'time-outline', bgColor: '#FFF3E0' },
  reso_accettato: { label: 'Reso accettato', color: '#4CAF50', icon: 'checkmark-done-outline', bgColor: '#E8F5E9' },
  reso_rifiutato: { label: 'Reso rifiutato', color: '#f44336', icon: 'close-outline', bgColor: '#FFEBEE' },
  cancelled: { label: 'Annullato', color: '#f44336', icon: 'close-circle-outline', bgColor: '#FFEBEE' },
  refunded: { label: 'Rimborsato', color: '#f44336', icon: 'refresh-outline', bgColor: '#FFEBEE' },
};

export default function MyExchangesScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadOrders = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      setUserId(storedUserId);
      
      if (!storedUserId) {
        setLoading(false);
        return;
      }

      const response = await axios.get(`${API_URL}/api/orders/user/${storedUserId}`);
      setOrders(response.data.orders || []);
    } catch (error) {
      console.error('Error loading orders:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadOrders();
  };

  // Venditore conferma disponibilità
  const handleSellerConfirm = async (order: Order) => {
    Alert.alert(
      '✅ DISPONIBILE',
      `Confermi la disponibilità del testo:\n📚 "${order.book_titolo}"\n\ne la consegna entro 2 giorni lavorativi presso:\n🏪 ${order.bookstore_name}?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Confermo',
          onPress: async () => {
            setActionLoading(true);
            try {
              await axios.post(`${API_URL}/api/orders/${order.id}/seller-confirm?user_id=${userId}`);
              Alert.alert('Disponibilità confermata!', 'L\'acquirente può ora procedere al pagamento.');
              loadOrders();
            } catch (error: any) {
              Alert.alert('Errore', error.response?.data?.detail || 'Errore');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  // Venditore rifiuta
  const handleSellerReject = async (order: Order) => {
    Alert.alert(
      '❌ NON DISPONIBILE',
      'Il libro non è più disponibile?',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Non disponibile',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              await axios.post(`${API_URL}/api/orders/${order.id}/seller-reject?user_id=${userId}&reason=Libro non disponibile`);
              Alert.alert('Richiesta annullata', 'L\'acquirente è stato notificato.');
              loadOrders();
            } catch (error: any) {
              Alert.alert('Errore', error.response?.data?.detail || 'Errore');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  // Acquirente paga
  const handlePayOrder = async (order: Order) => {
    Alert.alert(
      'Conferma pagamento',
      `Stai per pagare €${order.totale_acquirente.toFixed(2)} per:\n📚 "${order.book_titolo}"`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Paga ora',
          onPress: async () => {
            setActionLoading(true);
            try {
              await axios.post(`${API_URL}/api/orders/${order.id}/pay?user_id=${userId}`);
              Alert.alert('Pagamento completato!', 'Il venditore ha 2 giorni lavorativi per consegnare.');
              loadOrders();
            } catch (error: any) {
              Alert.alert('Errore', error.response?.data?.detail || 'Errore pagamento');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const getStatusConfig = (status: string) => {
    return STATUS_CONFIG[status] || { label: status, color: '#888', icon: 'help-outline', bgColor: '#f5f5f5' };
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const renderOrder = ({ item }: { item: Order }) => {
    const statusConfig = getStatusConfig(item.status);
    const isSeller = item.seller_id === userId;
    const isBuyer = item.buyer_id === userId;
    const needsSellerAction = isSeller && (item.status === 'in_attesa_conferma_venditore' || item.status === 'pending_seller_confirmation');
    const needsBuyerPayment = isBuyer && (item.status === 'in_attesa_pagamento' || item.status === 'pending_payment');

    return (
      <View style={[styles.orderCard, needsSellerAction && styles.orderCardAction]}>
        <View style={styles.orderHeader}>
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.bgColor }]}>
            <Ionicons name={statusConfig.icon as any} size={14} color={statusConfig.color} />
            <Text style={[styles.statusText, { color: statusConfig.color }]}>{statusConfig.label}</Text>
          </View>
          <Text style={styles.orderCode}>#{item.order_code}</Text>
        </View>

        <Text style={styles.bookTitle} numberOfLines={2}>{item.book_titolo}</Text>
        
        <View style={styles.orderDetails}>
          <View style={styles.detailRow}>
            <Ionicons name="storefront-outline" size={14} color="#666" />
            <Text style={styles.detailText}>{item.bookstore_name}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name={isSeller ? "person-outline" : "person"} size={14} color="#666" />
            <Text style={styles.detailText}>{isSeller ? `Acquirente: ${item.buyer_name}` : `Venditore: ${item.seller_name}`}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="cash-outline" size={14} color="#666" />
            <Text style={styles.detailText}>
              {isSeller ? `Riceverai: €${item.netto_venditore.toFixed(2)}` : `Pagato: €${item.totale_acquirente.toFixed(2)}`}
            </Text>
          </View>
        </View>

        {/* Azioni venditore */}
        {needsSellerAction && (
          <View style={styles.actionContainer}>
            <Text style={styles.actionLabel}>Rispondi alla richiesta:</Text>
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.rejectBtn]}
                onPress={() => handleSellerReject(item)}
                disabled={actionLoading}
              >
                <Ionicons name="close" size={18} color="#fff" />
                <Text style={styles.actionBtnText}>Non disponibile</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.confirmBtn]}
                onPress={() => handleSellerConfirm(item)}
                disabled={actionLoading}
              >
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={styles.actionBtnText}>Disponibile</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Azione pagamento acquirente */}
        {needsBuyerPayment && (
          <TouchableOpacity
            style={styles.payButton}
            onPress={() => handlePayOrder(item)}
            disabled={actionLoading}
          >
            <Ionicons name="card" size={20} color="#fff" />
            <Text style={styles.payButtonText}>Paga €{item.totale_acquirente.toFixed(2)}</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.orderDate}>{formatDate(item.created_at)}</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>I miei scambi</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1a472a" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>I miei scambi</Text>
        <View style={{ width: 40 }} />
      </View>

      {orders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="swap-horizontal-outline" size={64} color="#ccc" />
          <Text style={styles.emptyTitle}>Nessuno scambio</Text>
          <Text style={styles.emptySubtitle}>I tuoi acquisti e vendite appariranno qui</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          renderItem={renderOrder}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1a472a']} />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    padding: 16,
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  orderCardAction: {
    borderWidth: 2,
    borderColor: '#FF9800',
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  orderCode: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  bookTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  orderDetails: {
    gap: 6,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 13,
    color: '#666',
  },
  actionContainer: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  actionLabel: {
    fontSize: 13,
    color: '#666',
    marginBottom: 10,
    fontWeight: '500',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 6,
  },
  rejectBtn: {
    backgroundColor: '#9e9e9e',
  },
  confirmBtn: {
    backgroundColor: '#4CAF50',
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  payButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a472a',
    padding: 14,
    borderRadius: 8,
    marginTop: 12,
    gap: 8,
  },
  payButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  orderDate: {
    fontSize: 11,
    color: '#999',
    marginTop: 8,
    textAlign: 'right',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
});
