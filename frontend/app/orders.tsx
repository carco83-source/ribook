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
  Modal,
  Platform,
} from 'react-native';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import QRCode from 'react-native-qrcode-svg';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Order {
  id: string;
  order_code: string;  // Codice 6 caratteri per QR
  buyer_id: string;
  buyer_name: string;
  seller_id: string;
  seller_name: string;
  listing_id: string;
  bookstore_id: string;
  bookstore_name: string;
  book_isbn: string;
  book_titolo: string;
  book_autore: string;
  prezzo_libro: number;
  commissione_app: number;
  commissione_cartolibreria: number;
  totale_acquirente: number;
  netto_venditore: number;
  payment_intent_id?: string;
  payment_status: string;
  status: string;
  status_label: string;
  status_history: Array<{ status: string; timestamp: string; note: string }>;
  created_at: string;
  paid_at?: string;
  delivered_to_bookstore_at?: string;
  ready_for_pickup_at?: string;
  picked_up_at?: string;
  completed_at?: string;
  escrow_release_deadline?: string;
  is_buyer: boolean;
  is_seller: boolean;
  // Campi reso
  return_deadline?: string;
  return_requested_at?: string;
  return_reason?: string;
  return_verified_at?: string;
  return_notes?: string;
}

// Stati con colori e icone - NUOVO FLUSSO RIBOOK
const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string; bgColor: string }> = {
  // Fase 1: Richiesta
  in_attesa_conferma_venditore: { 
    label: 'In attesa conferma venditore', 
    color: '#FF9800', 
    icon: 'hourglass-outline',
    bgColor: '#FFF3E0'
  },
  pending_seller_confirmation: { 
    label: 'In attesa conferma venditore', 
    color: '#FF9800', 
    icon: 'hourglass-outline',
    bgColor: '#FFF3E0'
  },
  annullato_non_disponibile: { 
    label: 'Annullato - Non disponibile', 
    color: '#f44336', 
    icon: 'close-circle-outline',
    bgColor: '#FFEBEE'
  },
  annullato_timeout: { 
    label: 'Annullato - Timeout 24h', 
    color: '#f44336', 
    icon: 'time-outline',
    bgColor: '#FFEBEE'
  },
  
  // Fase 2: Pagamento
  in_attesa_pagamento: { 
    label: 'In attesa di pagamento', 
    color: '#FF9800', 
    icon: 'card-outline',
    bgColor: '#FFF3E0'
  },
  pending_payment: { 
    label: 'In attesa di pagamento', 
    color: '#FF9800', 
    icon: 'card-outline',
    bgColor: '#FFF3E0'
  },
  
  // Fase 3: Consegna venditore
  pagato_attesa_consegna: { 
    label: 'Pagato - In attesa consegna', 
    color: '#2196F3', 
    icon: 'time-outline',
    bgColor: '#E3F2FD'
  },
  paid_escrow: { 
    label: 'Pagato (in escrow)', 
    color: '#2196F3', 
    icon: 'lock-closed-outline',
    bgColor: '#E3F2FD'
  },
  annullato_mancata_consegna: { 
    label: 'Annullato - Mancata consegna', 
    color: '#f44336', 
    icon: 'close-circle-outline',
    bgColor: '#FFEBEE'
  },
  delivering_to_bookstore: { 
    label: 'In consegna alla cartolibreria', 
    color: '#9C27B0', 
    icon: 'car-outline',
    bgColor: '#F3E5F5'
  },
  
  // Fase 4: Verifica cartolibreria
  rifiutato_condizioni: { 
    label: 'Rifiutato - Condizioni non conformi', 
    color: '#f44336', 
    icon: 'alert-circle-outline',
    bgColor: '#FFEBEE'
  },
  pronto_per_ritiro: { 
    label: 'Pronto per il ritiro', 
    color: '#4CAF50', 
    icon: 'checkmark-circle-outline',
    bgColor: '#E8F5E9'
  },
  ready_for_pickup: { 
    label: 'Pronto per il ritiro', 
    color: '#4CAF50', 
    icon: 'checkmark-circle-outline',
    bgColor: '#E8F5E9'
  },
  
  // Fase 5: Ritiro e completamento
  picked_up: { 
    label: 'Ritirato (periodo verifica)', 
    color: '#4CAF50', 
    icon: 'bag-check-outline',
    bgColor: '#E8F5E9'
  },
  completed: { 
    label: 'Completato', 
    color: '#1a472a', 
    icon: 'trophy-outline',
    bgColor: '#E8F5E9'
  },
  
  // Stati reso
  in_verifica_reso: { 
    label: 'Reso in verifica', 
    color: '#FF9800', 
    icon: 'time-outline',
    bgColor: '#FFF3E0'
  },
  reso_accettato: { 
    label: 'Reso accettato - Rimborsato', 
    color: '#4CAF50', 
    icon: 'checkmark-done-outline',
    bgColor: '#E8F5E9'
  },
  reso_rifiutato: { 
    label: 'Reso rifiutato', 
    color: '#f44336', 
    icon: 'close-outline',
    bgColor: '#FFEBEE'
  },
  
  // Altri stati
  cancelled: { 
    label: 'Annullato', 
    color: '#f44336', 
    icon: 'close-circle-outline',
    bgColor: '#FFEBEE'
  },
  refunded: { 
    label: 'Rimborsato', 
    color: '#f44336', 
    icon: 'refresh-outline',
    bgColor: '#FFEBEE'
  },
};

export default function OrdersScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'buyer' | 'seller' | 'all'>('buyer');

  const loadOrders = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      setUserId(storedUserId);
      
      if (storedUserId) {
        const response = await axios.get(
          `${API_URL}/api/orders/user/${storedUserId}?role=${viewMode}`
        );
        setOrders(response.data.orders || []);
      }
    } catch (error) {
      console.error('Error loading orders:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadOrders();
    }, [viewMode])
  );

  useEffect(() => {
    loadOrders();
  }, [viewMode]);

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const getStatusConfig = (status: string) => {
    return STATUS_CONFIG[status] || { 
      label: status, 
      color: '#666', 
      icon: 'help-circle-outline',
      bgColor: '#f5f5f5'
    };
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('it-IT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const calculateTimeRemaining = (deadline?: string) => {
    if (!deadline) return null;
    const now = new Date();
    const deadlineDate = new Date(deadline);
    const diff = deadlineDate.getTime() - now.getTime();
    
    if (diff <= 0) return 'Scaduto';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      return `${days} giorn${days === 1 ? 'o' : 'i'} rimanent${days === 1 ? 'e' : 'i'}`;
    }
    if (hours > 0) return `${hours}h ${minutes}m rimanenti`;
    return `${minutes}m rimanenti`;
  };

  // === AZIONI ORDINE ===

  // Venditore conferma disponibilità - DISPONIBILE
  const handleSellerConfirm = async (order: Order) => {
    Alert.alert(
      '✅ DISPONIBILE',
      `Confermi la disponibilità del testo:\n📚 "${order.book_titolo}"\n\ne la consegna entro 2 giorni lavorativi presso:\n🏪 ${order.bookstore_name}?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Sì, confermo',
          onPress: async () => {
            setActionLoading(true);
            try {
              await axios.post(
                `${API_URL}/api/orders/${order.id}/seller-confirm?user_id=${userId}`
              );
              Alert.alert(
                'Disponibilità confermata!',
                'L\'acquirente è stato notificato e potrà procedere al pagamento.',
                [{ text: 'OK' }]
              );
              loadOrders();
              setShowDetailModal(false);
            } catch (error: any) {
              Alert.alert('Errore', error.response?.data?.detail || 'Errore nella conferma');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  // Venditore rifiuta - NON DISPONIBILE
  const handleSellerReject = async (order: Order) => {
    Alert.alert(
      '❌ NON DISPONIBILE',
      `Il libro "${order.book_titolo}" non è più disponibile?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Sì, non disponibile',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              await axios.post(
                `${API_URL}/api/orders/${order.id}/seller-reject?user_id=${userId}&reason=Libro non più disponibile`
              );
              Alert.alert(
                'Richiesta annullata',
                'L\'acquirente è stato notificato che il libro non è disponibile.',
                [{ text: 'OK' }]
              );
              loadOrders();
              setShowDetailModal(false);
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

  const handlePayOrder = async (order: Order) => {
    Alert.alert(
      'Conferma pagamento',
      `Stai per pagare €${order.totale_acquirente.toFixed(2)} per "${order.book_titolo}".\n\nI fondi saranno bloccati in escrow fino alla conferma del ritiro.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Paga ora',
          onPress: async () => {
            setActionLoading(true);
            try {
              const response = await axios.post(
                `${API_URL}/api/orders/${order.id}/pay?user_id=${userId}`
              );
              Alert.alert(
                'Pagamento completato!',
                'I fondi sono in escrow. Il venditore è stato notificato e consegnerà il libro alla cartolibreria.',
                [{ text: 'OK' }]
              );
              loadOrders();
              setShowDetailModal(false);
            } catch (error: any) {
              Alert.alert('Errore', error.response?.data?.detail || 'Pagamento fallito');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleConfirmPickup = async (order: Order) => {
    Alert.alert(
      'Conferma ritiro',
      `Confermi di aver ritirato "${order.book_titolo}" presso ${order.bookstore_name}?\n\nAvrai 3 giorni per segnalare eventuali problemi con le condizioni del libro.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Confermo il ritiro',
          style: 'default',
          onPress: async () => {
            setActionLoading(true);
            try {
              await axios.post(
                `${API_URL}/api/orders/${order.id}/confirm-pickup?user_id=${userId}`
              );
              Alert.alert(
                'Ritiro confermato!',
                'Hai 3 giorni per verificare le condizioni del libro e segnalare eventuali problemi. Dopo questo periodo, il pagamento verrà rilasciato al venditore.',
                [{ text: 'OK' }]
              );
              loadOrders();
              setShowDetailModal(false);
            } catch (error: any) {
              Alert.alert('Errore', error.response?.data?.detail || 'Errore nella conferma');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleCancelOrder = async (order: Order) => {
    const isRefund = order.status === 'paid_escrow';
    Alert.alert(
      isRefund ? 'Richiedi rimborso' : 'Annulla ordine',
      isRefund 
        ? 'Vuoi annullare questo ordine? Riceverai un rimborso completo.'
        : 'Vuoi annullare questo ordine?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: isRefund ? 'Sì, rimborsa' : 'Sì, annulla',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              await axios.post(
                `${API_URL}/api/orders/${order.id}/cancel?user_id=${userId}`
              );
              Alert.alert(
                'Ordine annullato',
                isRefund ? 'Il rimborso è stato elaborato.' : 'L\'ordine è stato annullato.',
                [{ text: 'OK' }]
              );
              loadOrders();
              setShowDetailModal(false);
            } catch (error: any) {
              Alert.alert('Errore', error.response?.data?.detail || 'Impossibile annullare');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  // Richiesta reso (acquirente) - solo per stato 'picked_up' entro 72h
  const handleRequestReturn = async (order: Order) => {
    Alert.alert(
      'Richiedi reso',
      'Puoi richiedere un reso SOLO se le condizioni del libro non corrispondono alla descrizione.\n\nLa cartolibreria verificherà il libro e deciderà.',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Condizioni non conformi',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              await axios.post(
                `${API_URL}/api/orders/${order.id}/request-return?user_id=${userId}`
              );
              Alert.alert(
                'Richiesta reso inviata',
                'La cartolibreria verificherà il libro. Riceverai una notifica con l\'esito.',
                [{ text: 'OK' }]
              );
              loadOrders();
              setShowDetailModal(false);
            } catch (error: any) {
              Alert.alert('Errore', error.response?.data?.detail || 'Impossibile richiedere il reso');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  // Calcola tempo rimanente per reso
  const getReturnTimeRemaining = (order: Order) => {
    if (order.status !== 'picked_up' || !order.return_deadline) return null;
    return calculateTimeRemaining(order.return_deadline);
  };

  // Azione venditore: conferma consegna
  const handleDeliverToBookstore = async (order: Order) => {
    Alert.alert(
      'Conferma consegna',
      `Hai consegnato "${order.book_titolo}" presso ${order.bookstore_name}?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Sì, ho consegnato',
          onPress: async () => {
            setActionLoading(true);
            try {
              await axios.post(
                `${API_URL}/api/orders/${order.id}/deliver-to-bookstore?user_id=${userId}`
              );
              Alert.alert(
                'Consegna registrata!',
                'L\'acquirente è stato notificato. Attendi che la cartolibreria confermi la ricezione.',
                [{ text: 'OK' }]
              );
              loadOrders();
              setShowDetailModal(false);
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

  const renderOrderCard = (order: Order) => {
    const statusConfig = getStatusConfig(order.status);
    const isBuyer = order.buyer_id === userId;
    
    return (
      <TouchableOpacity
        key={order.id}
        style={styles.orderCard}
        onPress={() => {
          setSelectedOrder(order);
          setShowDetailModal(true);
        }}
      >
        {/* Status Badge */}
        <View style={[styles.statusBadge, { backgroundColor: statusConfig.bgColor }]}>
          <Ionicons name={statusConfig.icon as any} size={16} color={statusConfig.color} />
          <Text style={[styles.statusText, { color: statusConfig.color }]}>
            {statusConfig.label}
          </Text>
        </View>

        {/* Book Info */}
        <Text style={styles.bookTitle} numberOfLines={2}>{order.book_titolo}</Text>
        {order.book_autore && (
          <Text style={styles.bookAuthor}>{order.book_autore}</Text>
        )}

        {/* Price & Role */}
        <View style={styles.orderFooter}>
          <View>
            <Text style={styles.priceLabel}>
              {isBuyer ? 'Hai pagato' : 'Riceverai'}
            </Text>
            <Text style={styles.priceValue}>
              €{isBuyer ? order.totale_acquirente.toFixed(2) : order.netto_venditore.toFixed(2)}
            </Text>
          </View>
          <View style={styles.roleTag}>
            <Ionicons 
              name={isBuyer ? 'cart' : 'storefront'} 
              size={14} 
              color={isBuyer ? '#2196F3' : '#4CAF50'} 
            />
            <Text style={[styles.roleText, { color: isBuyer ? '#2196F3' : '#4CAF50' }]}>
              {isBuyer ? 'Acquisto' : 'Vendita'}
            </Text>
          </View>
        </View>

        {/* Bookstore */}
        <View style={styles.bookstoreRow}>
          <Ionicons name="location-outline" size={14} color="#666" />
          <Text style={styles.bookstoreText}>{order.bookstore_name}</Text>
        </View>

        {/* Action hint for ready_for_pickup */}
        {order.status === 'ready_for_pickup' && isBuyer && (
          <View style={styles.actionHint}>
            <Ionicons name="hand-left-outline" size={16} color="#4CAF50" />
            <Text style={styles.actionHintText}>Tocca per confermare il ritiro</Text>
          </View>
        )}

        {/* Action hint for pending_payment */}
        {order.status === 'pending_payment' && isBuyer && (
          <View style={[styles.actionHint, { backgroundColor: '#FFF3E0' }]}>
            <Ionicons name="card-outline" size={16} color="#FF9800" />
            <Text style={[styles.actionHintText, { color: '#FF9800' }]}>Tocca per pagare</Text>
          </View>
        )}

        {/* Escrow deadline */}
        {order.status === 'ready_for_pickup' && order.escrow_release_deadline && (
          <View style={styles.deadlineRow}>
            <Ionicons name="timer-outline" size={14} color="#666" />
            <Text style={styles.deadlineText}>
              {calculateTimeRemaining(order.escrow_release_deadline)}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderDetailModal = () => {
    if (!selectedOrder) return null;
    const statusConfig = getStatusConfig(selectedOrder.status);
    const isBuyer = selectedOrder.buyer_id === userId;

    return (
      <Modal
        visible={showDetailModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowDetailModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Dettaglio Ordine</Text>
            <TouchableOpacity onPress={() => setShowDetailModal(false)}>
              <Ionicons name="close" size={28} color="#333" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            {/* Status */}
            <View style={[styles.statusCard, { backgroundColor: statusConfig.bgColor }]}>
              <Ionicons name={statusConfig.icon as any} size={32} color={statusConfig.color} />
              <Text style={[styles.statusCardText, { color: statusConfig.color }]}>
                {statusConfig.label}
              </Text>
              {selectedOrder.escrow_release_deadline && selectedOrder.status === 'ready_for_pickup' && (
                <Text style={styles.deadlineInfo}>
                  Auto-completamento: {calculateTimeRemaining(selectedOrder.escrow_release_deadline)}
                </Text>
              )}
            </View>

            {/* QR Code for buyer - show when ready for pickup */}
            {isBuyer && selectedOrder.order_code && selectedOrder.status === 'ready_for_pickup' && (
              <View style={styles.qrCodeSection}>
                <Text style={styles.qrCodeTitle}>Mostra questo codice alla cartolibreria</Text>
                <View style={styles.qrCodeContainer}>
                  <QRCode
                    value={selectedOrder.order_code}
                    size={180}
                    color="#1a472a"
                    backgroundColor="#fff"
                  />
                </View>
                <View style={styles.orderCodeBox}>
                  <Text style={styles.orderCodeLabel}>Codice ritiro</Text>
                  <Text style={styles.orderCodeValue}>{selectedOrder.order_code}</Text>
                </View>
              </View>
            )}

            {/* Order Code display for all statuses */}
            {selectedOrder.order_code && selectedOrder.status !== 'ready_for_pickup' && (
              <View style={styles.orderCodeSection}>
                <Ionicons name="barcode-outline" size={20} color="#666" />
                <Text style={styles.orderCodeSectionText}>
                  Codice ordine: <Text style={styles.orderCodeBold}>{selectedOrder.order_code}</Text>
                </Text>
              </View>
            )}

            {/* Book Info */}
            <View style={styles.detailSection}>
              <Text style={styles.sectionTitle}>Libro</Text>
              <Text style={styles.detailBookTitle}>{selectedOrder.book_titolo}</Text>
              {selectedOrder.book_autore && (
                <Text style={styles.detailBookAuthor}>{selectedOrder.book_autore}</Text>
              )}
              <Text style={styles.detailIsbn}>ISBN: {selectedOrder.book_isbn}</Text>
            </View>

            {/* Price Breakdown */}
            <View style={styles.detailSection}>
              <Text style={styles.sectionTitle}>Riepilogo Pagamento</Text>
              <View style={styles.priceRow}>
                <Text style={styles.priceRowLabel}>Prezzo libro</Text>
                <Text style={styles.priceRowValue}>€{selectedOrder.prezzo_libro.toFixed(2)}</Text>
              </View>
              <View style={styles.priceRow}>
                <Text style={styles.priceRowLabel}>Commissione RLB (17%)</Text>
                <Text style={styles.priceRowValue}>€{selectedOrder.commissione_app.toFixed(2)}</Text>
              </View>
              <View style={[styles.priceRow, styles.priceRowTotal]}>
                <Text style={styles.priceRowLabelTotal}>Totale acquirente</Text>
                <Text style={styles.priceRowValueTotal}>€{selectedOrder.totale_acquirente.toFixed(2)}</Text>
              </View>
              {isBuyer ? null : (
                <View style={[styles.priceRow, styles.sellerNet]}>
                  <Text style={styles.priceRowLabel}>Riceverai</Text>
                  <Text style={[styles.priceRowValue, { color: '#4CAF50', fontWeight: 'bold' }]}>
                    €{selectedOrder.netto_venditore.toFixed(2)}
                  </Text>
                </View>
              )}
            </View>

            {/* Parties */}
            <View style={styles.detailSection}>
              <Text style={styles.sectionTitle}>Parti coinvolte</Text>
              <View style={styles.partyRow}>
                <Ionicons name="person" size={18} color="#2196F3" />
                <Text style={styles.partyLabel}>Acquirente:</Text>
                <Text style={styles.partyValue}>{selectedOrder.buyer_name}</Text>
              </View>
              <View style={styles.partyRow}>
                <Ionicons name="storefront" size={18} color="#4CAF50" />
                <Text style={styles.partyLabel}>Venditore:</Text>
                <Text style={styles.partyValue}>{selectedOrder.seller_name}</Text>
              </View>
              <View style={styles.partyRow}>
                <Ionicons name="location" size={18} color="#9C27B0" />
                <Text style={styles.partyLabel}>Ritiro:</Text>
                <Text style={styles.partyValue}>{selectedOrder.bookstore_name}</Text>
              </View>
            </View>

            {/* Timeline */}
            <View style={styles.detailSection}>
              <Text style={styles.sectionTitle}>Cronologia</Text>
              {selectedOrder.status_history.map((event, index) => (
                <View key={index} style={styles.timelineItem}>
                  <View style={styles.timelineDot} />
                  <View style={styles.timelineContent}>
                    <Text style={styles.timelineNote}>{event.note}</Text>
                    <Text style={styles.timelineDate}>{formatDate(event.timestamp)}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Actions */}
            <View style={styles.actionsSection}>
              {/* Seller: Confirm availability */}
              {!isBuyer && selectedOrder.status === 'pending_seller_confirmation' && (
                <>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.confirmButton]}
                    onPress={() => handleSellerConfirm(selectedOrder)}
                    disabled={actionLoading}
                  >
                    {actionLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={20} color="#fff" />
                        <Text style={styles.actionButtonText}>Confermo disponibilità</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.cancelButton]}
                    onPress={() => handleSellerReject(selectedOrder)}
                    disabled={actionLoading}
                  >
                    <Ionicons name="close-circle" size={20} color="#f44336" />
                    <Text style={[styles.actionButtonText, { color: '#f44336' }]}>Libro non disponibile</Text>
                  </TouchableOpacity>
                </>
              )}

              {/* Buyer: Waiting for seller */}
              {isBuyer && selectedOrder.status === 'pending_seller_confirmation' && (
                <View style={styles.waitingBox}>
                  <Ionicons name="hourglass-outline" size={24} color="#FF9800" />
                  <Text style={styles.waitingText}>In attesa che il venditore confermi la disponibilità</Text>
                </View>
              )}

              {/* Buyer: Pay */}
              {isBuyer && selectedOrder.status === 'pending_payment' && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.payButton]}
                  onPress={() => handlePayOrder(selectedOrder)}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="card" size={20} color="#fff" />
                      <Text style={styles.actionButtonText}>Paga €{selectedOrder.totale_acquirente.toFixed(2)}</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {/* Buyer: Confirm Pickup */}
              {isBuyer && selectedOrder.status === 'ready_for_pickup' && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.confirmButton]}
                  onPress={() => handleConfirmPickup(selectedOrder)}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={20} color="#fff" />
                      <Text style={styles.actionButtonText}>Conferma ritiro</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {/* Seller: Deliver to bookstore */}
              {!isBuyer && selectedOrder.status === 'paid_escrow' && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.deliverButton]}
                  onPress={() => handleDeliverToBookstore(selectedOrder)}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="car" size={20} color="#fff" />
                      <Text style={styles.actionButtonText}>Ho consegnato alla cartolibreria</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {/* Cancel/Refund */}
              {(selectedOrder.status === 'pending_payment' || selectedOrder.status === 'paid_escrow') && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.cancelButton]}
                  onPress={() => handleCancelOrder(selectedOrder)}
                  disabled={actionLoading}
                >
                  <Ionicons name="close-circle" size={20} color="#f44336" />
                  <Text style={[styles.actionButtonText, { color: '#f44336' }]}>
                    {selectedOrder.status === 'paid_escrow' ? 'Richiedi rimborso' : 'Annulla ordine'}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Return Period Info and Button - For picked_up orders */}
              {isBuyer && selectedOrder.status === 'picked_up' && (
                <View style={styles.returnSection}>
                  <View style={styles.returnInfoBox}>
                    <Ionicons name="time-outline" size={24} color="#FF9800" />
                    <View style={styles.returnInfoContent}>
                      <Text style={styles.returnInfoTitle}>Periodo di verifica</Text>
                      <Text style={styles.returnInfoTime}>
                        {getReturnTimeRemaining(selectedOrder) || 'Caricamento...'}
                      </Text>
                      <Text style={styles.returnInfoDesc}>
                        Puoi richiedere un reso solo se le condizioni del libro non corrispondono alla descrizione.
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.returnButton]}
                    onPress={() => handleRequestReturn(selectedOrder)}
                    disabled={actionLoading}
                  >
                    {actionLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="arrow-undo" size={20} color="#fff" />
                        <Text style={styles.actionButtonText}>Richiedi reso</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {/* Return in verification */}
              {selectedOrder.status === 'in_verifica_reso' && (
                <View style={styles.verificationBox}>
                  <Ionicons name="hourglass-outline" size={24} color="#FF9800" />
                  <Text style={styles.verificationText}>
                    Reso in attesa di verifica dalla cartolibreria
                  </Text>
                  {selectedOrder.return_reason && (
                    <Text style={styles.returnReasonText}>
                      Motivo: {selectedOrder.return_reason}
                    </Text>
                  )}
                </View>
              )}

              {/* Return accepted */}
              {selectedOrder.status === 'reso_accettato' && (
                <View style={[styles.verificationBox, { backgroundColor: '#E8F5E9' }]}>
                  <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                  <Text style={[styles.verificationText, { color: '#4CAF50' }]}>
                    Reso accettato - Rimborso in elaborazione
                  </Text>
                  {selectedOrder.return_notes && (
                    <Text style={styles.returnReasonText}>
                      Note: {selectedOrder.return_notes}
                    </Text>
                  )}
                </View>
              )}

              {/* Return rejected */}
              {selectedOrder.status === 'reso_rifiutato' && (
                <View style={[styles.verificationBox, { backgroundColor: '#FFEBEE' }]}>
                  <Ionicons name="close-circle" size={24} color="#f44336" />
                  <Text style={[styles.verificationText, { color: '#f44336' }]}>
                    Reso rifiutato - Libro conforme alla descrizione
                  </Text>
                  {selectedOrder.return_notes && (
                    <Text style={styles.returnReasonText}>
                      Note: {selectedOrder.return_notes}
                    </Text>
                  )}
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen
          options={{
            title: 'I miei ordini',
            headerStyle: { backgroundColor: '#1a472a' },
            headerTintColor: '#fff',
            headerLeft: () => (
              <TouchableOpacity onPress={handleGoBack} style={{ paddingHorizontal: 16 }}>
                <Ionicons name="arrow-back" size={24} color="#fff" />
              </TouchableOpacity>
            ),
          }}
        />
        <ActivityIndicator size="large" color="#1a472a" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'I miei ordini',
          headerStyle: { backgroundColor: '#1a472a' },
          headerTintColor: '#fff',
          headerLeft: () => (
            <TouchableOpacity onPress={handleGoBack} style={{ paddingHorizontal: 16 }}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
          ),
        }}
      />

      {/* Filter Tabs */}
      <View style={styles.filterTabs}>
        <TouchableOpacity
          style={[styles.filterTab, viewMode === 'buyer' && styles.filterTabActive]}
          onPress={() => setViewMode('buyer')}
        >
          <Ionicons 
            name="cart" 
            size={18} 
            color={viewMode === 'buyer' ? '#fff' : '#1a472a'} 
          />
          <Text style={[styles.filterTabText, viewMode === 'buyer' && styles.filterTabTextActive]}>
            Acquisti
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, viewMode === 'seller' && styles.filterTabActive]}
          onPress={() => setViewMode('seller')}
        >
          <Ionicons 
            name="storefront" 
            size={18} 
            color={viewMode === 'seller' ? '#fff' : '#1a472a'} 
          />
          <Text style={[styles.filterTabText, viewMode === 'seller' && styles.filterTabTextActive]}>
            Vendite
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, viewMode === 'all' && styles.filterTabActive]}
          onPress={() => setViewMode('all')}
        >
          <Ionicons 
            name="list" 
            size={18} 
            color={viewMode === 'all' ? '#fff' : '#1a472a'} 
          />
          <Text style={[styles.filterTabText, viewMode === 'all' && styles.filterTabTextActive]}>
            Tutti
          </Text>
        </TouchableOpacity>
      </View>

      {orders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="receipt-outline" size={64} color="#ccc" />
          <Text style={styles.emptyText}>Nessun ordine</Text>
          <Text style={styles.emptySubtext}>
            {viewMode === 'buyer' 
              ? 'I tuoi acquisti appariranno qui'
              : viewMode === 'seller'
              ? 'Le tue vendite appariranno qui'
              : 'I tuoi ordini appariranno qui'}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => {
              setRefreshing(true);
              loadOrders();
            }} />
          }
        >
          {orders.map(renderOrderCard)}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {renderDetailModal()}
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
    backgroundColor: '#f5f5f5',
  },
  filterTabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  filterTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  filterTabActive: {
    backgroundColor: '#1a472a',
  },
  filterTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a472a',
  },
  filterTabTextActive: {
    color: '#fff',
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  orderCard: {
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
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 10,
  },
  statusText: {
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
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  priceLabel: {
    fontSize: 12,
    color: '#666',
  },
  priceValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  roleTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
  },
  roleText: {
    fontSize: 12,
    fontWeight: '500',
  },
  bookstoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  bookstoreText: {
    fontSize: 13,
    color: '#666',
  },
  actionHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E8F5E9',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
  },
  actionHintText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#4CAF50',
  },
  deadlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  deadlineText: {
    fontSize: 12,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  statusCard: {
    alignItems: 'center',
    padding: 20,
    borderRadius: 12,
    marginBottom: 16,
  },
  statusCardText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 8,
  },
  deadlineInfo: {
    fontSize: 13,
    color: '#666',
    marginTop: 8,
  },
  detailSection: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  detailBookTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  detailBookAuthor: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  detailIsbn: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
    fontFamily: 'monospace',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  priceRowLabel: {
    fontSize: 14,
    color: '#666',
  },
  priceRowValue: {
    fontSize: 14,
    color: '#333',
  },
  priceRowTotal: {
    borderBottomWidth: 0,
    marginTop: 8,
  },
  priceRowLabelTotal: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  priceRowValueTotal: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  sellerNet: {
    backgroundColor: '#E8F5E9',
    marginTop: 8,
    padding: 12,
    borderRadius: 8,
    borderBottomWidth: 0,
  },
  partyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  partyLabel: {
    fontSize: 14,
    color: '#666',
    width: 80,
  },
  partyValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    flex: 1,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1a472a',
    marginTop: 4,
  },
  timelineContent: {
    flex: 1,
  },
  timelineNote: {
    fontSize: 14,
    color: '#333',
  },
  timelineDate: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  actionsSection: {
    gap: 12,
    marginTop: 8,
    marginBottom: 40,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 16,
    borderRadius: 12,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  payButton: {
    backgroundColor: '#FF9800',
  },
  confirmButton: {
    backgroundColor: '#4CAF50',
  },
  deliverButton: {
    backgroundColor: '#9C27B0',
  },
  cancelButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f44336',
  },
  // QR Code styles
  qrCodeSection: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#1a472a',
    borderStyle: 'dashed',
  },
  qrCodeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a472a',
    marginBottom: 16,
    textAlign: 'center',
  },
  qrCodeContainer: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  orderCodeBox: {
    marginTop: 16,
    backgroundColor: '#E8F5E9',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  orderCodeLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  orderCodeValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a472a',
    letterSpacing: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  orderCodeSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  orderCodeSectionText: {
    fontSize: 14,
    color: '#666',
  },
  orderCodeBold: {
    fontWeight: 'bold',
    color: '#1a472a',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  waitingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#FFF3E0',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF9800',
  },
  waitingText: {
    fontSize: 14,
    color: '#FF9800',
    fontWeight: '500',
    flex: 1,
  },
  // Return section styles
  returnSection: {
    marginTop: 16,
  },
  returnInfoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFF3E0',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    gap: 12,
  },
  returnInfoContent: {
    flex: 1,
  },
  returnInfoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#E65100',
    marginBottom: 4,
  },
  returnInfoTime: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF9800',
    marginBottom: 8,
  },
  returnInfoDesc: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  returnButton: {
    backgroundColor: '#f44336',
  },
  verificationBox: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFF3E0',
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
  },
  verificationText: {
    fontSize: 14,
    color: '#FF9800',
    fontWeight: '500',
    textAlign: 'center',
  },
  returnReasonText: {
    fontSize: 13,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
