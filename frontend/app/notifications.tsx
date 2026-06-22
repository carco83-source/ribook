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
import QRCode from 'react-native-qrcode-svg';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  data?: any;
  read: boolean;
  created_at: string;
  book_isbn?: string;
  book_titolo?: string;
  listing_id?: string;
  prezzo?: number;
  order_id?: string;
  order_code?: string;
  bookstore_name?: string;
  bookstore_address?: string;
}

const NOTIFICATION_CONFIG: Record<string, { icon: string; color: string }> = {
  match: { icon: 'pulse', color: '#4CAF50' },
  sale: { icon: 'cart', color: '#2196F3' },
  delivery: { icon: 'cube', color: '#FF9800' },
  pickup: { icon: 'checkmark-circle', color: '#9C27B0' },
  chat: { icon: 'chatbubble', color: '#00BCD4' },
  system: { icon: 'information-circle', color: '#607D8B' },
  book_available: { icon: 'book', color: '#4CAF50' },
  confirmation_request: { icon: 'checkmark-circle', color: '#4CAF50' },
  cart_request: { icon: 'checkmark-circle', color: '#4CAF50' },
  seller_confirmation_request: { icon: 'help-circle', color: '#FF9800' },
  order_pending: { icon: 'time', color: '#2196F3' },
  ready_for_payment: { icon: 'card', color: '#4CAF50' },
  order_rejected: { icon: 'close-circle', color: '#f44336' },
  order_paid: { icon: 'checkmark-circle', color: '#4CAF50' },
  payment_released: { icon: 'cash', color: '#4CAF50' },
  ready_for_pickup: { icon: 'location', color: '#9C27B0' },
  order_qr_code: { icon: 'qr-code', color: '#1a472a' },
};

export default function NotificationsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Funzione per confermare disponibilità (venditore)
  const handleConfirmAvailability = async (notification: Notification) => {
    const orderId = notification.order_id || notification.data?.order_id;
    if (!orderId || !userId) return;

    setActionLoading(notification.id);
    try {
      await axios.post(`${API_URL}/api/orders/${orderId}/seller-confirm?user_id=${userId}`);
      Alert.alert(
        'DISPONIBILITÀ CONFERMATA',
        'L\'acquirente è stato notificato e potrà procedere al pagamento.',
        [{ text: 'OK' }]
      );
      loadNotifications();
    } catch (error: any) {
      Alert.alert('Errore', error.response?.data?.detail || 'Errore nella conferma');
    } finally {
      setActionLoading(null);
    }
  };

  // Funzione per rifiutare disponibilità (venditore)
  const handleRejectAvailability = async (notification: Notification) => {
    const orderId = notification.order_id || notification.data?.order_id;
    if (!orderId || !userId) return;

    Alert.alert(
      'CONFERMA RIFIUTO',
      'Sei sicuro che il libro non è più disponibile?',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Non disponibile',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(notification.id);
            try {
              await axios.post(`${API_URL}/api/orders/${orderId}/seller-reject?user_id=${userId}&reason=Libro non disponibile`);
              Alert.alert('ORDINE ANNULLATO', 'L\'acquirente è stato notificato.');
              loadNotifications();
            } catch (error: any) {
              Alert.alert('Errore', error.response?.data?.detail || 'Errore');
            } finally {
              setActionLoading(null);
            }
          }
        }
      ]
    );
  };

  // Funzione per procedere al pagamento (acquirente)
  const handleProceedToPayment = async (notification: Notification) => {
    // Naviga direttamente al carrello
    router.push('/cart');
  };

  const loadNotifications = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      setUserId(storedUserId);
      
      if (storedUserId) {
        // Try to load from API, fall back to generated notifications
        try {
          const response = await axios.get(`${API_URL}/api/notifications/${storedUserId}`);
          // API returns { notifications: [...], unread_count: N }
          const apiNotifications = response.data.notifications || response.data || [];
          // Ordina per data decrescente (più recenti prima)
          const sortedNotifications = apiNotifications.sort((a: Notification, b: Notification) => {
            const dateA = new Date(a.created_at).getTime();
            const dateB = new Date(b.created_at).getTime();
            return dateB - dateA;
          });
          setNotifications(sortedNotifications);
        } catch (error) {
          // Generate mock notifications based on user activity
          const mockNotifications = await generateNotifications(storedUserId);
          setNotifications(mockNotifications);
        }
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const generateNotifications = async (userId: string): Promise<Notification[]> => {
    const notifications: Notification[] = [];
    
    try {
      // Check for radar matches
      const radarRes = await axios.get(`${API_URL}/api/radar/${userId}`);
      if (radarRes.data.total_matches > 0) {
        notifications.push({
          id: '1',
          type: 'match',
          title: 'Nuovi match trovati!',
          message: `Hai ${radarRes.data.total_matches} libri disponibili che stai cercando`,
          read: false,
          created_at: new Date().toISOString(),
        });
      }

      // Check for pending deliveries (as seller)
      const salesRes = await axios.get(`${API_URL}/api/user/${userId}/sales`);
      const pendingDeliveries = salesRes.data.filter((s: any) => s.stato === 'venduto');
      if (pendingDeliveries.length > 0) {
        notifications.push({
          id: '2',
          type: 'delivery',
          title: 'Libri da consegnare',
          message: `Hai ${pendingDeliveries.length} libri da consegnare alla cartolibreria`,
          read: false,
          created_at: new Date().toISOString(),
        });
      }

      // Check for ready pickups (as buyer)
      const purchasesRes = await axios.get(`${API_URL}/api/user/${userId}/purchases`);
      const readyPickups = purchasesRes.data.filter((p: any) => p.stato === 'consegnato');
      if (readyPickups.length > 0) {
        notifications.push({
          id: '3',
          type: 'pickup',
          title: 'Libri pronti per il ritiro!',
          message: `${readyPickups.length} libri ti aspettano in cartolibreria`,
          read: false,
          created_at: new Date().toISOString(),
        });
      }

      // Add welcome notification if no activity
      if (notifications.length === 0) {
        notifications.push({
          id: '0',
          type: 'system',
          title: 'Benvenuto su RiLiBro!',
          message: 'Inizia cercando i libri che ti servono o metti in vendita quelli che non usi più',
          read: true,
          created_at: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('Error generating notifications:', error);
    }

    // Ordina per data decrescente
    return notifications.sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return dateB - dateA;
    });
  };

  useFocusEffect(
    useCallback(() => {
      loadNotifications();
    }, [])
  );

  const handleNotificationPress = (notification: Notification) => {
    // Segna la notifica come letta
    if (!notification.read && userId) {
      axios.put(`${API_URL}/api/notifications/${notification.id}/read`).catch(console.error);
      // Aggiorna lo stato locale
      setNotifications(prev => prev.map(n => 
        n.id === notification.id ? { ...n, read: true } : n
      ));
    }
    
    switch (notification.type) {
      case 'match':
        router.push('/radar/sellers');
        break;
      case 'sale':
      case 'delivery':
        router.push('/orders');
        break;
      case 'pickup':
      case 'order_pending':
      case 'ready_for_pickup':
      case 'book_at_bookstore':
        router.push('/orders');
        break;
      case 'chat':
      case 'new_message':
        router.push('/(tabs)/chats');
        break;
      case 'confirmation_request':
        // Naviga agli ordini per confermare
        router.push('/orders');
        break;
      // book_available e seller_confirmed mantengono il comportamento originale
      // (gestiti dal pulsante "Tocca per andare al carrello")
      default:
        // Per tutte le altre notifiche, resta nella pagina notifiche
        break;
    }
  };

  const formatTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Data non valida';
      
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Adesso';
      if (diffMins < 60) return `${diffMins} min fa`;
      if (diffHours < 24) return `${diffHours}h fa`;
      if (diffDays < 1) return 'Oggi';
      if (diffDays === 1) return 'Ieri';
      if (diffDays < 7) return `${diffDays} giorni fa`;
      
      // Per date più vecchie, mostra data e ora italiana
      return date.toLocaleString('it-IT', { 
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return 'Data non valida';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a472a" />
      </View>
    );
  }

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Notifiche',
          headerStyle: { backgroundColor: '#1a472a' },
          headerTintColor: '#fff',
          headerLeft: () => (
            <TouchableOpacity 
              onPress={() => router.canGoBack() ? router.back() : router.push('/(tabs)')} 
              style={{ marginLeft: 16, padding: 8 }}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
          ),
          headerRight: () => unreadCount > 0 ? (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{unreadCount}</Text>
            </View>
          ) : null,
        }}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => {
            setRefreshing(true);
            loadNotifications();
          }} />
        }
      >
        {notifications.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="notifications-off-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>Nessuna notifica</Text>
            <Text style={styles.emptySubtext}>
              Le notifiche appariranno qui quando ci saranno novità
            </Text>
          </View>
        ) : (
          notifications.map((notification) => {
            const config = NOTIFICATION_CONFIG[notification.type] || NOTIFICATION_CONFIG.system;
            const isSellerConfirmation = notification.type === 'seller_confirmation_request';
            const isReadyForPayment = notification.type === 'ready_for_payment';
            const isOrderPending = notification.type === 'order_pending';
            
            return (
              <View
                key={notification.id}
                style={[
                  styles.notificationCard,
                  !notification.read && styles.notificationUnread,
                ]}
              >
                <TouchableOpacity
                  style={styles.notificationTouchable}
                  onPress={() => handleNotificationPress(notification)}
                >
                  <View style={[styles.iconContainer, { backgroundColor: config.color }]}>
                    <Ionicons name={config.icon as any} size={24} color="#fff" />
                  </View>
                  <View style={styles.notificationContent}>
                    <Text style={styles.notificationTitle}>{notification.title}</Text>
                    <Text style={styles.notificationMessage}>{notification.message}</Text>
                    <Text style={styles.notificationTime}>
                      {formatTime(notification.created_at)}
                    </Text>
                  </View>
                  {!notification.read && <View style={styles.unreadDot} />}
                </TouchableOpacity>
                
                {/* Pulsanti per VENDITORE - Conferma disponibilità */}
                {isSellerConfirmation && (
                  <View style={styles.actionButtonsContainer}>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.confirmButton]}
                      onPress={() => handleConfirmAvailability(notification)}
                      disabled={actionLoading === notification.id}
                    >
                      {actionLoading === notification.id ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle" size={20} color="#fff" />
                          <Text style={styles.actionButtonText}>DISPONIBILE</Text>
                        </>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.rejectButton]}
                      onPress={() => handleRejectAvailability(notification)}
                      disabled={actionLoading === notification.id}
                    >
                      <Ionicons name="close-circle" size={20} color="#fff" />
                      <Text style={styles.actionButtonText}>NON DISPONIBILE</Text>
                    </TouchableOpacity>
                  </View>
                )}
                
                {/* Pulsanti per ACQUIRENTE - Procedi al pagamento */}
                {isReadyForPayment && (
                  <View style={styles.actionButtonsContainer}>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.payButton, { flex: 1 }]}
                      onPress={() => handleProceedToPayment(notification)}
                    >
                      <Ionicons name="cart" size={20} color="#fff" />
                      <Text style={styles.actionButtonText}>AGGIUNGI AL CARRELLO</Text>
                    </TouchableOpacity>
                  </View>
                )}
                
                {/* Info per ACQUIRENTE - Ordine in attesa */}
                {isOrderPending && (
                  <View style={styles.pendingInfoBox}>
                    <Ionicons name="time-outline" size={18} color="#FF9800" />
                    <Text style={styles.pendingInfoText}>In attesa di conferma dal venditore</Text>
                  </View>
                )}
                
                {/* QR Code per ordini completati */}
                {(notification.type === 'order_qr_code' || notification.type === 'order_paid' || notification.type === 'ready_for_pickup' || notification.type === 'order_paid_deliver' || notification.type === 'order_paid_waiting') && (notification.data?.order_code || notification.order_code) && notification.data?.show_qr !== false && (
                  <View style={styles.qrCodeContainer}>
                    <View style={styles.qrCodeBox}>
                      {Platform.OS !== 'web' ? (
                        <QRCode
                          value={notification.data?.order_code || notification.order_code}
                          size={150}
                          backgroundColor="white"
                          color="#1a472a"
                        />
                      ) : (
                        <View style={styles.qrCodePlaceholder}>
                          <Ionicons name="qr-code" size={100} color="#1a472a" />
                        </View>
                      )}
                    </View>
                    <View style={styles.qrCodeInfo}>
                      <Text style={styles.qrCodeLabel}>CODICE</Text>
                      <Text style={styles.qrCodeValue}>{notification.data?.order_code || notification.order_code}</Text>
                      {(notification.data?.bookstore_name || notification.bookstore_name) && (
                        <Text style={styles.qrCodeBookstore}>📍 {notification.data?.bookstore_name || notification.bookstore_name}</Text>
                      )}
                    </View>
                  </View>
                )}
                
                {/* Condizioni del libro (senza prezzo) */}
                {notification.data?.books_conditions && notification.data.books_conditions.length > 0 && (
                  <View style={styles.conditionsContainer}>
                    <Text style={styles.conditionsTitle}>📋 CONDIZIONI LIBRO</Text>
                    {notification.data.books_conditions.map((book: any, idx: number) => (
                      <View key={idx} style={styles.conditionItem}>
                        {notification.data.books_conditions.length > 1 && (
                          <Text style={styles.conditionBookTitle}>{book.title}</Text>
                        )}
                        <Text style={styles.conditionText}>{book.conditions}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })
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
  headerBadge: {
    backgroundColor: '#ff4444',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: 16,
  },
  headerBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 32,
  },
  notificationCard: {
    flexDirection: 'column',
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
  notificationTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  notificationUnread: {
    backgroundColor: '#f0f9f0',
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  notificationMessage: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  notificationTime: {
    fontSize: 11,
    color: '#999',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
    marginRight: 8,
  },
  // Action Buttons Styles
  actionButtonsContainer: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 6,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  confirmButton: {
    backgroundColor: '#4CAF50',
  },
  rejectButton: {
    backgroundColor: '#f44336',
  },
  payButton: {
    backgroundColor: '#1a472a',
  },
  continueButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#1a472a',
  },
  pendingInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    gap: 8,
  },
  pendingInfoText: {
    fontSize: 13,
    color: '#FF9800',
    fontStyle: 'italic',
  },
  // QR Code styles
  qrCodeContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    alignItems: 'center',
  },
  qrCodeBox: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 12,
  },
  qrCodePlaceholder: {
    width: 150,
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  qrCodeInfo: {
    alignItems: 'center',
    marginBottom: 12,
  },
  qrCodeLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  qrCodeValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a472a',
    letterSpacing: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  qrCodeBookstore: {
    fontSize: 14,
    color: '#333',
    marginTop: 8,
  },
  screenshotTip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  screenshotTipText: {
    fontSize: 12,
    color: '#1a472a',
    fontWeight: '500',
  },
  conditionsContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    width: '100%',
  },
  conditionsTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  conditionItem: {
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  conditionBookTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a472a',
    marginBottom: 6,
  },
  conditionText: {
    fontSize: 13,
    color: '#555',
    lineHeight: 20,
  },
});
