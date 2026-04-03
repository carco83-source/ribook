import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Notification {
  id: string;
  type: 'match' | 'sale' | 'delivery' | 'pickup' | 'chat' | 'system' | 'book_available';
  title: string;
  message: string;
  data?: any;
  read: boolean;
  created_at: string;
  book_isbn?: string;
  book_titolo?: string;
  listing_id?: string;
  prezzo?: number;
}

const NOTIFICATION_CONFIG: Record<string, { icon: string; color: string }> = {
  match: { icon: 'pulse', color: '#4CAF50' },
  sale: { icon: 'cart', color: '#2196F3' },
  delivery: { icon: 'cube', color: '#FF9800' },
  pickup: { icon: 'checkmark-circle', color: '#9C27B0' },
  chat: { icon: 'chatbubble', color: '#00BCD4' },
  system: { icon: 'information-circle', color: '#607D8B' },
  book_available: { icon: 'book', color: '#4CAF50' },
};

export default function NotificationsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

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
          setNotifications(apiNotifications);
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

    return notifications;
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
        router.push('/my-sales');
        break;
      case 'pickup':
        router.push('/my-purchases');
        break;
      case 'chat':
        router.push('/(tabs)/chats');
        break;
      case 'book_available':
        // Naviga alla pagina dei venditori per questo libro
        if (notification.book_isbn) {
          router.push(`/book-sellers/${notification.book_isbn}`);
        }
        break;
      default:
        break;
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Adesso';
    if (diffMins < 60) return `${diffMins} min fa`;
    if (diffHours < 24) return `${diffHours} ore fa`;
    if (diffDays < 7) return `${diffDays} giorni fa`;
    return date.toLocaleDateString('it-IT');
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
            
            return (
              <TouchableOpacity
                key={notification.id}
                style={[
                  styles.notificationCard,
                  !notification.read && styles.notificationUnread,
                ]}
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
                <Ionicons name="chevron-forward" size={20} color="#ccc" />
              </TouchableOpacity>
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
});
