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
  Modal,
  TextInput,
  Keyboard,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { authApi } from '../../src/utils/api';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';

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
  is_buyer?: boolean;
  is_seller?: boolean;
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
  annullato_acquirente: { label: 'Annullato', color: '#f44336', icon: 'close-circle-outline', bgColor: '#FFEBEE' },
  rimborsato_acquirente: { label: 'Rimborsato', color: '#f44336', icon: 'refresh-outline', bgColor: '#FFEBEE' },
  refunded: { label: 'Rimborsato', color: '#f44336', icon: 'refresh-outline', bgColor: '#FFEBEE' },
};

export default function MyExchangesScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  // Modal per annullamento con motivazione
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);

  const loadOrders = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      console.log('[MyExchanges] storedUserId:', storedUserId);
      setUserId(storedUserId);
      
      if (!storedUserId) {
        console.log('[MyExchanges] No user ID found');
        setLoading(false);
        return;
      }

      const response = await authApi.get(`/api/user-orders/${storedUserId}`);
      console.log('[MyExchanges] API response:', JSON.stringify(response, null, 2));
      const ordersData = response.orders || [];
      console.log('[MyExchanges] Orders count:', ordersData.length);
      setOrders(ordersData);
    } catch (error) {
      console.error('[MyExchanges] Error loading orders:', error);
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

  // Acquirente paga con Stripe Checkout
  const handlePayOrder = async (order: Order) => {
    console.log('handlePayOrder called with order:', order.id, order.order_code);
    
    if (!order.id) {
      Alert.alert('Errore', 'ID ordine non valido. Riprova più tardi.');
      return;
    }
    
    // Mostra loading
    setActionLoading(true);
    
    try {
      // Crea Stripe Checkout Session
      const response = await authApi.post(
        `/api/orders/${order.id}/create-checkout-session?user_id=${userId}`,
        { platform: 'web' }
      );
      
      console.log('Checkout session response:', response);
      
      if (response.checkout_url) {
        // Apri la pagina di pagamento Stripe
        const result = await WebBrowser.openBrowserAsync(response.checkout_url, {
          dismissButtonStyle: 'close',
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
        });
        
        console.log('WebBrowser result:', result);
        
        // Dopo che l'utente chiude il browser, ricarica gli ordini
        // (il redirect a stripe-success gestirà la conferma)
        loadOrders();
      } else {
        throw new Error('URL di checkout non ricevuto');
      }
    } catch (error: any) {
      console.error('Checkout error:', error.response?.data || error.message);
      const errorMsg = error.response?.data?.detail || 'Errore durante la creazione del pagamento. Riprova.';
      Alert.alert('Errore', errorMsg);
    } finally {
      setActionLoading(false);
    }
  };

  // Apre il modal per annullare ordine
  const openCancelModal = (order: Order) => {
    setOrderToCancel(order);
    setCancelReason('');
    setCancelModalVisible(true);
  };

  // Conferma annullamento con motivazione
  const confirmCancelOrder = async () => {
    if (!orderToCancel || !userId) return;
    
    if (!cancelReason.trim()) {
      Alert.alert('Attenzione', 'Inserisci una motivazione per l\'annullamento');
      return;
    }
    
    setActionLoading(true);
    setCancelModalVisible(false);
    
    try {
      const response = await authApi.post(
        `/api/orders/${orderToCancel.id}/buyer-cancel?user_id=${userId}&reason=${encodeURIComponent(cancelReason)}`
      );
      
      const isPaid = ['pagato_attesa_consegna', 'paid', 'in_transito_a_cartolibreria'].includes(orderToCancel.status);
      
      Alert.alert(
        '✅ Ordine annullato',
        isPaid 
          ? 'L\'ordine è stato annullato e il pagamento rimborsato. Il venditore è stato notificato di non consegnare il libro.'
          : 'L\'ordine è stato annullato. Il libro è tornato disponibile.',
        [{ text: 'OK', onPress: () => loadOrders() }]
      );
    } catch (error: any) {
      console.error('Cancel error:', error.response?.data || error.message);
      Alert.alert('Errore', error.response?.data?.detail || 'Impossibile annullare l\'ordine');
    } finally {
      setActionLoading(false);
      setOrderToCancel(null);
    }
  };

  // Acquirente annulla ordine (versione semplice per ordini non pagati)
  const handleBuyerCancel = async (order: Order) => {
    // Per ordini pagati, usa il modal con motivazione
    const isPaid = ['pagato_attesa_consegna', 'paid', 'in_transito_a_cartolibreria'].includes(order.status);
    
    if (isPaid) {
      openCancelModal(order);
      return;
    }
    
    // Per ordini non pagati, conferma semplice
    Alert.alert(
      '❌ Annulla ordine',
      `Sei sicuro di voler annullare l'ordine per "${order.book_titolo}"?\n\nIl libro tornerà disponibile nel marketplace.`,
      [
        { text: 'No, mantieni', style: 'cancel' },
        {
          text: 'Sì, annulla',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              const response = await authApi.post(
                `/api/orders/${order.id}/buyer-cancel?user_id=${userId}&reason=Annullato dall'acquirente`
              );
              Alert.alert(
                '✅ Ordine annullato',
                'L\'ordine è stato annullato. Il libro è tornato disponibile.',
                [{ text: 'OK', onPress: () => loadOrders() }]
              );
            } catch (error: any) {
              console.error('Cancel error:', error.response?.data || error.message);
              Alert.alert('Errore', error.response?.data?.detail || 'Impossibile annullare l\'ordine');
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

  // Stato per modal reso
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [selectedOrderForReturn, setSelectedOrderForReturn] = useState<Order | null>(null);

  // Acquirente richiede reso
  const handleRequestReturn = async (order: Order) => {
    setSelectedOrderForReturn(order);
    setReturnReason('');
    setShowReturnModal(true);
  };

  const submitReturn = async () => {
    if (!selectedOrderForReturn || !returnReason.trim()) {
      Alert.alert('Errore', 'Descrivi il motivo del reso');
      return;
    }
    
    setActionLoading(true);
    try {
      await axios.post(`${API_URL}/api/orders/${selectedOrderForReturn.id}/request-return?user_id=${userId}&reason=${encodeURIComponent(returnReason)}`);
      Alert.alert('Richiesta reso inviata!', 'La cartolibreria verificherà il libro e processerà il reso.');
      setShowReturnModal(false);
      setSelectedOrderForReturn(null);
      setReturnReason('');
      loadOrders();
    } catch (error: any) {
      Alert.alert('Errore', error.response?.data?.detail || 'Errore nella richiesta di reso');
    } finally {
      setActionLoading(false);
    }
  };

  const renderOrder = ({ item }: { item: Order }) => {
    const statusConfig = getStatusConfig(item.status);
    // Usa i flag dal backend che sono già calcolati correttamente
    const isSeller = item.is_seller === true;
    const isBuyer = item.is_buyer === true;
    const needsSellerAction = isSeller && (item.status === 'in_attesa_conferma_venditore' || item.status === 'pending_seller_confirmation');
    const needsBuyerPayment = isBuyer && (item.status === 'in_attesa_pagamento' || item.status === 'pending_payment');
    
    // Pronto per ritiro - mostra info all'acquirente
    const isReadyForPickup = isBuyer && (item.status === 'pronto_per_ritiro' || item.status === 'ready_for_pickup');
    
    // L'acquirente può annullare l'ordine PRIMA della consegna (non pagato)
    const canBuyerCancelUnpaid = isBuyer && [
      'in_attesa_conferma_venditore',
      'pending_seller_confirmation',
      'in_attesa_pagamento',
      'pending_payment'
    ].includes(item.status);
    
    // L'acquirente può annullare un ordine PAGATO prima che venga consegnato (CON RIMBORSO)
    const canBuyerCancelPaid = isBuyer && [
      'pagato_attesa_consegna',
      'paid',
      'in_transito_a_cartolibreria'
    ].includes(item.status);
    
    // L'acquirente può richiedere reso per ordini ritirato O pronto_per_ritiro (per test)
    const canRequestReturn = isBuyer && (
      item.status === 'picked_up' || 
      item.status === 'ritirato' || 
      item.status === 'pronto_per_ritiro' || 
      item.status === 'ready_for_pickup'
    );
    const returnDeadlineDate = item.return_deadline ? new Date(item.return_deadline) : null;
    const isReturnPeriodValid = returnDeadlineDate ? returnDeadlineDate > new Date() : true; // Se non c'è deadline, permetti reso

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
          <View>
            <TouchableOpacity
              style={[styles.payButton, actionLoading && styles.payButtonDisabled]}
              onPress={() => handlePayOrder(item)}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="card" size={20} color="#fff" />
                  <Text style={styles.payButtonText}>Paga €{item.totale_acquirente.toFixed(2)}</Text>
                </>
              )}
            </TouchableOpacity>
            {/* Pulsante Annulla per acquirente */}
            <TouchableOpacity
              style={styles.cancelOrderButton}
              onPress={() => handleBuyerCancel(item)}
              disabled={actionLoading}
            >
              <Ionicons name="close-circle-outline" size={18} color="#f44336" />
              <Text style={styles.cancelOrderButtonText}>Annulla ordine</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Pulsante Annulla per ordini in attesa conferma venditore */}
        {canBuyerCancelUnpaid && !needsBuyerPayment && (
          <TouchableOpacity
            style={styles.cancelOrderButton}
            onPress={() => handleBuyerCancel(item)}
            disabled={actionLoading}
          >
            <Ionicons name="close-circle-outline" size={18} color="#f44336" />
            <Text style={styles.cancelOrderButtonText}>Annulla ordine</Text>
          </TouchableOpacity>
        )}

        {/* Pulsante Annulla per ordini GIÀ PAGATI (prima della consegna) - CON RIMBORSO */}
        {canBuyerCancelPaid && (
          <View style={styles.paidCancelContainer}>
            <View style={styles.paidCancelInfo}>
              <Ionicons name="time-outline" size={18} color="#2196F3" />
              <View style={{flex: 1, marginLeft: 8}}>
                <Text style={styles.paidCancelTitle}>In attesa di consegna dal venditore</Text>
                <Text style={styles.paidCancelNote}>
                  Puoi annullare l'ordine prima che il venditore consegni il libro alla cartolibreria. Il pagamento verrà rimborsato.
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.cancelPaidOrderButton}
              onPress={() => handleBuyerCancel(item)}
              disabled={actionLoading}
            >
              <Ionicons name="close-circle" size={18} color="#fff" />
              <Text style={styles.cancelPaidOrderButtonText}>Annulla e rimborsa</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Opzione reso per acquirente (solo dopo ritiro, entro 72h) */}
        {canRequestReturn && isReturnPeriodValid && (
          <View style={styles.returnContainer}>
            {/* Info timer */}
            <View style={styles.returnTimerInfo}>
              <Ionicons name="time-outline" size={18} color="#FF9800" />
              <View style={{flex: 1, marginLeft: 8}}>
                <Text style={styles.returnPeriodTitle}>Hai tempo fino al {new Date(item.return_deadline).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
                <Text style={styles.returnPeriodNote}>
                  Puoi richiedere il reso se il libro non corrisponde alla descrizione. Dopo questa scadenza il pagamento sarà rilasciato al venditore.
                </Text>
              </View>
            </View>
            {/* Bottone reso */}
            <TouchableOpacity
              style={styles.returnButton}
              onPress={() => handleRequestReturn(item)}
              disabled={actionLoading}
            >
              <Ionicons name="refresh" size={18} color="#FF9800" />
              <Text style={styles.returnButtonText}>Richiedi reso (incongruenza)</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Info periodo reso per VENDITORE (mostra che l'acquirente può ancora richiedere reso) */}
        {!isBuyer && (item.status === 'picked_up' || item.status === 'ritirato') && item.return_deadline && (
          <View style={styles.returnPeriodInfo}>
            <Ionicons name="time-outline" size={18} color="#FF9800" />
            <View style={{flex: 1, marginLeft: 8}}>
              <Text style={styles.returnPeriodTitle}>Periodo verifica reso attivo</Text>
              <Text style={styles.returnPeriodText}>
                L'acquirente può richiedere reso entro il {new Date(item.return_deadline).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </Text>
              <Text style={styles.returnPeriodNote}>
                Il pagamento sarà rilasciato dopo questo periodo se non ci sono contestazioni.
              </Text>
            </View>
          </View>
        )}

        {/* Info pronto per ritiro */}
        {isReadyForPickup && (
          <View style={styles.pickupInfo}>
            <Ionicons name="location" size={18} color="#4CAF50" />
            <View style={styles.pickupInfoText}>
              <Text style={styles.pickupInfoTitle}>Pronto per il ritiro!</Text>
              <Text style={styles.pickupInfoSubtitle}>
                Ritira il libro presso {item.bookstore_name}
              </Text>
              <Text style={styles.pickupInfoNote}>
                Dopo il ritiro avrai 72h per verificare il libro e richiedere un eventuale reso
              </Text>
            </View>
          </View>
        )}

        <Text style={styles.orderDate}>{formatDate(item.created_at)}</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Stack.Screen
          options={{
            title: 'I miei scambi',
            headerStyle: { backgroundColor: '#1a472a' },
            headerTintColor: '#fff',
          }}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1a472a" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'I miei scambi',
          headerStyle: { backgroundColor: '#1a472a' },
          headerTintColor: '#fff',
        }}
      />

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

      {/* Modal Richiesta Reso */}
      <Modal
        visible={showReturnModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          Keyboard.dismiss();
          setShowReturnModal(false);
        }}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView 
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.keyboardAvoidingView}
            >
              <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                <View style={styles.modalContent}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Richiedi reso</Text>
                    <TouchableOpacity onPress={() => {
                      Keyboard.dismiss();
                      setShowReturnModal(false);
                    }}>
                      <Ionicons name="close" size={24} color="#333" />
                    </TouchableOpacity>
                  </View>
                  
                  <ScrollView 
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                  >
                    <Text style={styles.modalSubtitle}>
                      Descrivi l'incongruenza tra le condizioni dichiarate e quelle reali del libro:
                    </Text>
                    
                    <TextInput
                      style={styles.returnInput}
                      multiline
                      numberOfLines={4}
                      placeholder="Es: Il libro presenta sottolineature non dichiarate, la copertina è danneggiata..."
                      value={returnReason}
                      onChangeText={setReturnReason}
                      textAlignVertical="top"
                      blurOnSubmit={true}
                      returnKeyType="done"
                    />
                    
                    <Text style={styles.returnNote}>
                      La cartolibreria verificherà il libro. Se l'incongruenza è confermata, riceverai il rimborso completo.
                    </Text>
                    
                    <View style={styles.modalButtons}>
                      <TouchableOpacity 
                        style={styles.cancelButton}
                        onPress={() => {
                          Keyboard.dismiss();
                          setShowReturnModal(false);
                        }}
                      >
                        <Text style={styles.cancelButtonText}>Annulla</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.submitButton, !returnReason.trim() && styles.submitButtonDisabled]}
                        onPress={() => {
                          Keyboard.dismiss();
                          submitReturn();
                        }}
                        disabled={!returnReason.trim() || actionLoading}
                      >
                        {actionLoading ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.submitButtonText}>Invia richiesta</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </ScrollView>
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Modal Annullamento Ordine Pagato */}
      <Modal
        visible={cancelModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          Keyboard.dismiss();
          setCancelModalVisible(false);
        }}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView 
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.keyboardAvoidingView}
            >
              <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                <View style={styles.modalContent}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Annulla ordine</Text>
                    <TouchableOpacity onPress={() => {
                      Keyboard.dismiss();
                      setCancelModalVisible(false);
                    }}>
                      <Ionicons name="close" size={24} color="#333" />
                    </TouchableOpacity>
                  </View>
                  
                  <ScrollView 
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                  >
                    {orderToCancel && (
                      <View style={styles.cancelOrderInfo}>
                        <Ionicons name="warning" size={32} color="#f44336" />
                        <Text style={styles.cancelOrderTitle}>Stai annullando un ordine già pagato</Text>
                        <Text style={styles.cancelOrderBook}>📚 {orderToCancel.book_titolo}</Text>
                        <Text style={styles.cancelOrderAmount}>
                          💰 Pagamento: €{orderToCancel.totale_acquirente?.toFixed(2)}
                        </Text>
                      </View>
                    )}
                    
                    <Text style={styles.modalSubtitle}>
                      Inserisci il motivo dell'annullamento:
                    </Text>
                    
                    <TextInput
                      style={styles.returnInput}
                      multiline
                      numberOfLines={3}
                      placeholder="Es: Ho trovato il libro altrove, non mi serve più, errore nell'ordine..."
                      value={cancelReason}
                      onChangeText={setCancelReason}
                      textAlignVertical="top"
                      blurOnSubmit={true}
                      returnKeyType="done"
                    />
                    
                    <View style={styles.cancelRefundInfo}>
                      <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                      <Text style={styles.cancelRefundText}>
                        Il pagamento verrà rimborsato automaticamente e il venditore sarà notificato di non consegnare il libro.
                      </Text>
                    </View>
                    
                    <View style={styles.modalButtons}>
                      <TouchableOpacity 
                        style={styles.cancelButton}
                        onPress={() => {
                          Keyboard.dismiss();
                          setCancelModalVisible(false);
                          setOrderToCancel(null);
                          setCancelReason('');
                        }}
                      >
                        <Text style={styles.cancelButtonText}>Indietro</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.confirmCancelButton, !cancelReason.trim() && styles.submitButtonDisabled]}
                        onPress={() => {
                          Keyboard.dismiss();
                          confirmCancelOrder();
                        }}
                        disabled={!cancelReason.trim() || actionLoading}
                      >
                        {actionLoading ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.submitButtonText}>Conferma annullamento</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </ScrollView>
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
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
  payButtonDisabled: {
    backgroundColor: '#ccc',
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
  // Stili per pulsante reso
  returnButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: '#FF9800',
    borderRadius: 8,
    paddingVertical: 10,
    marginTop: 12,
    gap: 8,
  },
  returnButtonText: {
    color: '#FF9800',
    fontSize: 14,
    fontWeight: '600',
  },
  // Stili info periodo reso per venditore
  returnPeriodInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFF8E1',
    borderWidth: 1,
    borderColor: '#FFE082',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  // Container reso acquirente con timer + bottone
  returnContainer: {
    marginTop: 12,
    backgroundColor: '#FFF8E1',
    borderWidth: 1,
    borderColor: '#FFE082',
    borderRadius: 12,
    padding: 14,
  },
  returnTimerInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  returnPeriodTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FF8F00',
    marginBottom: 4,
  },
  returnPeriodText: {
    fontSize: 12,
    color: '#666',
  },
  returnPeriodNote: {
    fontSize: 11,
    color: '#888',
    marginTop: 4,
    fontStyle: 'italic',
  },
  // Stili modal reso
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  keyboardAvoidingView: {
    width: '100%',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  returnInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    fontSize: 14,
    minHeight: 120,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  returnNote: {
    fontSize: 12,
    color: '#888',
    marginTop: 12,
    fontStyle: 'italic',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  submitButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#FF9800',
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Stili info ritiro
  pickupInfo: {
    flexDirection: 'row',
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    gap: 12,
    alignItems: 'flex-start',
  },
  pickupInfoText: {
    flex: 1,
  },
  pickupInfoTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginBottom: 4,
  },
  pickupInfoSubtitle: {
    fontSize: 13,
    color: '#4CAF50',
    marginBottom: 4,
  },
  pickupInfoNote: {
    fontSize: 11,
    color: '#666',
    fontStyle: 'italic',
  },
  // Pulsante annulla ordine
  cancelOrderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f44336',
    backgroundColor: '#fff',
    gap: 6,
  },
  cancelOrderButtonText: {
    color: '#f44336',
    fontSize: 14,
    fontWeight: '500',
  },
  // Stili per modal annullamento ordine pagato
  cancelOrderInfo: {
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cancelOrderTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#d32f2f',
    marginTop: 8,
    textAlign: 'center',
  },
  cancelOrderBook: {
    fontSize: 14,
    color: '#333',
    marginTop: 8,
    fontWeight: '500',
  },
  cancelOrderAmount: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  cancelRefundInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    gap: 8,
  },
  cancelRefundText: {
    flex: 1,
    fontSize: 12,
    color: '#2E7D32',
    lineHeight: 18,
  },
  confirmCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#f44336',
    alignItems: 'center',
  },
  // Stili per annullamento ordine pagato
  paidCancelContainer: {
    marginTop: 12,
    backgroundColor: '#E3F2FD',
    borderWidth: 1,
    borderColor: '#90CAF9',
    borderRadius: 12,
    padding: 14,
  },
  paidCancelInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  paidCancelTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1976D2',
    marginBottom: 4,
  },
  paidCancelNote: {
    fontSize: 11,
    color: '#666',
    lineHeight: 16,
  },
  cancelPaidOrderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f44336',
    borderRadius: 8,
    paddingVertical: 12,
    gap: 8,
  },
  cancelPaidOrderButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
