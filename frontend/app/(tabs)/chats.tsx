import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useNotifications } from '../../context/NotificationContext';

const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL 
  ? `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`
  : Constants.expoConfig?.extra?.apiUrl || '/api';

interface Conversation {
  id: string;
  listing_id: string;
  book_isbn: string;
  book_title: string;
  buyer_id: string;
  buyer_username: string;
  seller_id: string;
  seller_username: string;
  last_message?: string;
  last_message_at?: string;
  unread_count: number;
  created_at: string;
}

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  order_id?: string;
  order_code?: string;
  requires_action?: boolean;
  action_type?: string;
  action?: string;
  data?: {
    listing_id?: string;
    order_id?: string;
    order_code?: string;
    book_titolo?: string;
    book_title?: string;
    buyer_code?: string;
    bookstore_name?: string;
    prezzo?: number;
    deadline?: string;
    open_cart?: boolean;
  };
}

type TabType = 'messaggi' | 'notifiche';

export default function MessaggiScreen() {
  const router = useRouter();
  const { refreshNotifications: refreshGlobalNotifications, setUnreadCount: setGlobalUnreadCount } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('messaggi');
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      setUserId(storedUserId);

      if (!storedUserId) {
        setLoading(false);
        return;
      }

      // Carica conversazioni
      const convResponse = await fetch(`${API_BASE}/conversations/${storedUserId}`);
      if (convResponse.ok) {
        const data = await convResponse.json();
        setConversations(data.conversations || []);
      }

      // Carica notifiche
      try {
        const notifResponse = await fetch(`${API_BASE}/notifications/${storedUserId}`);
        if (notifResponse.ok) {
          const notifData = await notifResponse.json();
          setNotifications(notifData.notifications || []);
          setUnreadNotifications(notifData.unread_count || 0);
        }
      } catch (error) {
        // Endpoint notifiche potrebbe non esistere ancora
        console.log('Notifications endpoint not available');
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Reload when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const formatTime = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Ieri';
    } else if (days < 7) {
      return date.toLocaleDateString('it-IT', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
    }
  };

  const getOtherUserName = (conv: Conversation) => {
    return userId === conv.buyer_id ? conv.seller_username : conv.buyer_username;
  };

  const markNotificationAsRead = async (notifId: string) => {
    try {
      // 1. Chiama l'API per segnare come letta
      await fetch(`${API_BASE}/notifications/${notifId}/read`, { method: 'PUT' });
      
      // 2. Aggiorna lo stato locale immediatamente (optimistic update)
      setNotifications(prev => 
        prev.map(n => n.id === notifId ? { ...n, read: true } : n)
      );
      
      // 3. Decrementa il contatore locale
      setUnreadNotifications(prev => Math.max(0, prev - 1));
      
      // 4. Aggiorna il contatore globale (per il badge nella tab)
      setGlobalUnreadCount((prev: number) => Math.max(0, prev - 1));
      
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  // Venditore conferma disponibilità
  const handleSellerConfirm = async (notification: Notification) => {
    const orderId = notification.order_id || notification.data?.order_id;
    if (!orderId || !userId) return;
    
    setActionLoading(notification.id);
    try {
      const response = await fetch(`${API_BASE}/orders/${orderId}/seller-confirm?user_id=${userId}`, {
        method: 'POST',
      });
      
      if (response.ok) {
        // Segna come letta ma NON rimuovere dalla lista
        await markNotificationAsRead(notification.id);
        // Aggiorna lo stato della notifica localmente per rimuovere i pulsanti
        setNotifications(prev => prev.map(n => 
          n.id === notification.id 
            ? { ...n, read: true, action_type: 'completed', type: 'seller_confirmed' } 
            : n
        ));
        // Mostra conferma
        if (Platform.OS === 'web') {
          window.alert('✅ Disponibilità confermata! L\'acquirente può procedere al pagamento.');
        } else {
          Alert.alert('Conferma', 'Disponibilità confermata! L\'acquirente può procedere al pagamento.');
        }
      } else {
        const error = await response.json();
        const errorMsg = error.detail || 'Impossibile confermare';
        if (Platform.OS === 'web') {
          window.alert('Errore: ' + errorMsg);
        } else {
          Alert.alert('Errore', errorMsg);
        }
      }
    } catch (error) {
      console.error('Error confirming:', error);
    } finally {
      setActionLoading(null);
    }
  };

  // Venditore rifiuta
  const handleSellerReject = async (notification: Notification) => {
    const orderId = notification.order_id || notification.data?.order_id;
    if (!orderId || !userId) return;
    
    setActionLoading(notification.id);
    try {
      const response = await fetch(`${API_BASE}/orders/${orderId}/seller-reject?user_id=${userId}&reason=Libro non disponibile`, {
        method: 'POST',
      });
      
      if (response.ok) {
        // Segna come letta ma NON rimuovere dalla lista
        await markNotificationAsRead(notification.id);
        // Aggiorna lo stato della notifica localmente
        setNotifications(prev => prev.map(n => 
          n.id === notification.id 
            ? { ...n, read: true, action_type: 'completed', type: 'seller_rejected' } 
            : n
        ));
        if (Platform.OS === 'web') {
          window.alert('Richiesta annullata. L\'acquirente è stato notificato.');
        } else {
          Alert.alert('Annullato', 'Richiesta annullata. L\'acquirente è stato notificato.');
        }
      } else {
        const error = await response.json();
        const errorMsg = error.detail || 'Impossibile rifiutare';
        if (Platform.OS === 'web') {
          window.alert('Errore: ' + errorMsg);
        } else {
          Alert.alert('Errore', errorMsg);
        }
      }
    } catch (error) {
      console.error('Error rejecting:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'new_message': return 'chatbubble';
      case 'order_created': return 'cart';
      case 'order_confirmed': return 'checkmark-circle';
      case 'book_sold': return 'pricetag';
      case 'new_listing': return 'book';
      default: return 'notifications';
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'new_message': return '#2196F3';
      case 'order_created': return '#4CAF50';
      case 'order_confirmed': return '#4CAF50';
      case 'book_sold': return '#FF9800';
      case 'new_listing': return '#9C27B0';
      default: return '#666';
    }
  };

  const renderConversation = ({ item }: { item: Conversation }) => {
    const otherUser = getOtherUserName(item);
    const hasUnread = item.unread_count > 0;

    return (
      <TouchableOpacity
        style={styles.conversationCard}
        onPress={() => router.push(`/chat/${item.id}`)}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {otherUser?.charAt(0)?.toUpperCase() || '?'}
          </Text>
        </View>

        <View style={styles.conversationContent}>
          <View style={styles.conversationHeader}>
            <Text style={[styles.userName, hasUnread && styles.userNameUnread]}>
              {otherUser}
            </Text>
            <Text style={styles.timeText}>{formatTime(item.last_message_at)}</Text>
          </View>

          <Text style={styles.bookTitle} numberOfLines={1}>
            {item.book_title}
          </Text>

          <Text
            style={[styles.lastMessage, hasUnread && styles.lastMessageUnread]}
            numberOfLines={1}
          >
            {item.last_message || 'Inizia la conversazione...'}
          </Text>
        </View>

        {hasUnread && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>{item.unread_count}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderNotification = ({ item }: { item: Notification }) => {
    const isSellerConfirmation = item.type === 'seller_confirmation_request' || item.action_type === 'seller_confirmation';
    const isReadyForPayment = item.type === 'ready_for_payment' || item.action === 'open_cart' || item.data?.open_cart;
    const isLoading = actionLoading === item.id;
    
    // Handler per click sulla notifica - TUTTE le notifiche sono cliccabili per segnare come lette
    const handleNotificationPress = async () => {
      // Segna come letta se non lo è già
      if (!item.read) {
        await markNotificationAsRead(item.id);
      }
      
      // Navigazione opzionale basata sul tipo
      if (isReadyForPayment) {
        router.push('/(tabs)/sell');
      } else if (item.data?.order_id) {
        router.push('/orders');
      } else if (item.data?.listing_id) {
        router.push(`/listing/${item.data.listing_id}`);
      }
      // Per altre notifiche, semplicemente segna come letta senza navigare
    };
    
    // Contenuto della notifica
    const notificationContent = (
      <>
        <View style={styles.notificationMainContent}>
          <View style={[styles.notifIcon, { backgroundColor: getNotificationColor(item.type) + '20' }]}>
            <Ionicons 
              name={getNotificationIcon(item.type) as any} 
              size={22} 
              color={getNotificationColor(item.type)} 
            />
          </View>

          <View style={styles.notifContent}>
            <View style={styles.notifHeader}>
              <Text style={[styles.notifTitle, !item.read && styles.notifTitleUnread]}>
                {item.title}
              </Text>
              <Text style={styles.notifTime}>{formatTime(item.created_at)}</Text>
            </View>
            <Text style={styles.notifMessage} numberOfLines={isSellerConfirmation ? 8 : 5}>
              {item.message}
            </Text>
            {/* Indicatore "Vai al carrello" per notifiche ready_for_payment */}
            {isReadyForPayment && !isSellerConfirmation && (
              <View style={styles.goToCartIndicator}>
                <Ionicons name="cart" size={14} color="#1a472a" />
                <Text style={styles.goToCartText}>Tocca per andare al carrello</Text>
                <Ionicons name="chevron-forward" size={14} color="#1a472a" />
              </View>
            )}
          </View>

          {!item.read && <View style={styles.unreadDot} />}
        </View>
        
        {/* Pulsanti azione per richiesta conferma venditore */}
        {isSellerConfirmation && (
          <View style={styles.notificationActions}>
            <TouchableOpacity
              style={[styles.notifActionBtn, styles.notifRejectBtn]}
              onPress={() => handleSellerReject(item)}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="close" size={18} color="#fff" />
                  <Text style={styles.notifActionText}>NON DISPONIBILE</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.notifActionBtn, styles.notifConfirmBtn]}
              onPress={() => handleSellerConfirm(item)}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={18} color="#fff" />
                  <Text style={styles.notifActionText}>DISPONIBILE</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </>
    );
    
    // TUTTE le notifiche sono ora cliccabili per segnare come lette
    return (
      <TouchableOpacity
        style={[
          styles.notificationCard, 
          !item.read && styles.notificationUnread, 
          isSellerConfirmation && styles.notificationAction,
          isReadyForPayment && !isSellerConfirmation && styles.notificationClickable
        ]}
        onPress={handleNotificationPress}
        activeOpacity={0.7}
      >
        {notificationContent}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a472a" />
        <Text style={styles.loadingText}>Caricamento...</Text>
      </View>
    );
  }

  if (!userId) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="chatbubbles-outline" size={64} color="#ccc" />
        <Text style={styles.emptyTitle}>Accedi per vedere i messaggi</Text>
        <Text style={styles.emptySubtitle}>
          Effettua l'accesso per contattare i venditori
        </Text>
        <TouchableOpacity
          style={styles.loginButton}
          onPress={() => router.push('/login')}
        >
          <Text style={styles.loginButtonText}>Accedi</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Tab Switcher */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'messaggi' && styles.tabActive]}
          onPress={() => setActiveTab('messaggi')}
        >
          <Ionicons 
            name="chatbubbles" 
            size={20} 
            color={activeTab === 'messaggi' ? '#1a472a' : '#888'} 
          />
          <Text style={[styles.tabText, activeTab === 'messaggi' && styles.tabTextActive]}>
            Messaggi
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.tab, activeTab === 'notifiche' && styles.tabActive]}
          onPress={() => setActiveTab('notifiche')}
        >
          <View>
            <Ionicons 
              name="notifications" 
              size={20} 
              color={activeTab === 'notifiche' ? '#1a472a' : '#888'} 
            />
            {unreadNotifications > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>
                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.tabText, activeTab === 'notifiche' && styles.tabTextActive]}>
            Notifiche
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {activeTab === 'messaggi' ? (
        conversations.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={64} color="#ccc" />
            <Text style={styles.emptyTitle}>Nessuna conversazione</Text>
            <Text style={styles.emptySubtitle}>
              Quando contatterai un venditore, la chat apparirà qui
            </Text>
          </View>
        ) : (
          <FlatList
            data={conversations}
            renderItem={renderConversation}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            contentContainerStyle={styles.listContent}
          />
        )
      ) : (
        notifications.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="notifications-outline" size={64} color="#ccc" />
            <Text style={styles.emptyTitle}>Nessuna notifica</Text>
            <Text style={styles.emptySubtitle}>
              Riceverai notifiche per nuovi messaggi e aggiornamenti sugli ordini
            </Text>
          </View>
        ) : (
          <FlatList
            data={notifications}
            renderItem={renderNotification}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            contentContainerStyle={styles.listContent}
          />
        )
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
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#e8f5e9',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#888',
  },
  tabTextActive: {
    color: '#1a472a',
    fontWeight: '600',
  },
  tabBadge: {
    position: 'absolute',
    top: -6,
    right: -10,
    backgroundColor: '#f44336',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
  loginButton: {
    marginTop: 24,
    backgroundColor: '#1a472a',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
  },
  conversationCard: {
    flexDirection: 'row',
    alignItems: 'center',
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
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#1a472a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  conversationContent: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  userName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  userNameUnread: {
    fontWeight: '700',
  },
  timeText: {
    fontSize: 12,
    color: '#999',
  },
  bookTitle: {
    fontSize: 12,
    color: '#1a472a',
    marginBottom: 4,
  },
  lastMessage: {
    fontSize: 14,
    color: '#666',
  },
  lastMessageUnread: {
    color: '#333',
    fontWeight: '500',
  },
  unreadBadge: {
    backgroundColor: '#1a472a',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    marginLeft: 8,
  },
  unreadText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  // Notification styles
  notificationCard: {
    flexDirection: 'column',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  notificationMainContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  notificationUnread: {
    backgroundColor: '#f0f8f0',
    borderLeftWidth: 3,
    borderLeftColor: '#1a472a',
  },
  notificationAction: {
    borderWidth: 2,
    borderColor: '#FF9800',
    backgroundColor: '#FFF8E1',
  },
  notifIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  notifContent: {
    flex: 1,
  },
  notifHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  notifTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    flex: 1,
  },
  notifTitleUnread: {
    fontWeight: '700',
  },
  notifTime: {
    fontSize: 11,
    color: '#999',
    marginLeft: 8,
  },
  notifMessage: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1a472a',
    marginLeft: 8,
  },
  // Stili per azioni nella notifica
  notificationActions: {
    flexDirection: 'row',
    marginTop: 14,
    gap: 10,
  },
  notifActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 6,
  },
  notifRejectBtn: {
    backgroundColor: '#9e9e9e',
  },
  notifConfirmBtn: {
    backgroundColor: '#4CAF50',
  },
  notifActionText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  notificationClickable: {
    borderWidth: 2,
    borderColor: '#1a472a',
    backgroundColor: '#f0f8f0',
  },
  goToCartIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 6,
  },
  goToCartText: {
    fontSize: 12,
    color: '#1a472a',
    fontWeight: '600',
    flex: 1,
  },
});
