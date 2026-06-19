import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface OrderItem {
  id: string;
  order_code: string;
  book_titolo: string;
  book_isbn: string;
  buyer_name: string;
  seller_name: string;
  prezzo_acquirente: number;
  status: string;
  created_at: string;
  seller_delivery_deadline?: string;
  delivered_to_bookstore_at?: string;
  bookstore_verified_at?: string;
}

export default function BookstorePanelScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bookstoreId, setBookstoreId] = useState<string | null>(null);
  const [bookstoreInfo, setBookstoreInfo] = useState<any>(null);
  
  // Login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  
  // Dashboard state
  const [stats, setStats] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'pending' | 'delivered' | 'completed' | 'returns'>('dashboard');
  const [refreshing, setRefreshing] = useState(false);
  
  // Data lists
  const [pendingDeliveries, setPendingDeliveries] = useState<OrderItem[]>([]);
  const [deliveredOrders, setDeliveredOrders] = useState<OrderItem[]>([]);
  const [completedOrders, setCompletedOrders] = useState<OrderItem[]>([]);
  const [returns, setReturns] = useState<OrderItem[]>([]);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const storedId = await AsyncStorage.getItem('bookstore_id');
      if (storedId) {
        setBookstoreId(storedId);
        setIsLoggedIn(true);
        loadDashboard(storedId);
      }
    } catch (error) {
      console.error('Error checking auth:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      if (Platform.OS === 'web') {
        window.alert('Inserisci email e password');
      } else {
        Alert.alert('Errore', 'Inserisci email e password');
      }
      return;
    }

    setLoginLoading(true);
    try {
      const response = await axios.post(`${API_URL}/api/bookstore/login`, {
        email: email.trim(),
        password: password
      });
      
      if (response.data.success) {
        await AsyncStorage.setItem('bookstore_id', response.data.bookstore_id);
        setBookstoreId(response.data.bookstore_id);
        setBookstoreInfo(response.data.bookstore);
        setIsLoggedIn(true);
        loadDashboard(response.data.bookstore_id);
      } else {
        throw new Error('Login fallito');
      }
    } catch (error: any) {
      console.log('Login error:', error);
      let message = 'Credenziali non valide';
      if (error.response?.data?.detail) {
        message = typeof error.response.data.detail === 'string' 
          ? error.response.data.detail 
          : JSON.stringify(error.response.data.detail);
      }
      if (Platform.OS === 'web') {
        window.alert(message);
      } else {
        Alert.alert('Errore', message);
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const loadDashboard = async (bsId: string) => {
    try {
      const [statsRes, pendingRes, deliveredRes, completedRes, returnsRes] = await Promise.all([
        axios.get(`${API_URL}/api/bookstore/${bsId}/stats`),
        axios.get(`${API_URL}/api/bookstore/${bsId}/orders/pending`),
        axios.get(`${API_URL}/api/bookstore/${bsId}/orders/delivered`),
        axios.get(`${API_URL}/api/bookstore/${bsId}/orders/completed`),
        axios.get(`${API_URL}/api/bookstore/${bsId}/returns`),
      ]);
      
      setStats(statsRes.data);
      setPendingDeliveries(pendingRes.data || []);
      setDeliveredOrders(deliveredRes.data || []);
      setCompletedOrders(completedRes.data || []);
      setReturns(returnsRes.data || []);
      
      // Carica info cartolibreria
      const infoRes = await axios.get(`${API_URL}/api/bookstore/${bsId}`);
      setBookstoreInfo(infoRes.data);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    }
  };

  const onRefresh = async () => {
    if (!bookstoreId) return;
    setRefreshing(true);
    await loadDashboard(bookstoreId);
    setRefreshing(false);
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('bookstore_id');
    setIsLoggedIn(false);
    setBookstoreId(null);
    setBookstoreInfo(null);
  };

  // Calcola tempo rimanente per consegna
  const getTimeRemaining = (deadline: string) => {
    const now = new Date();
    const deadlineDate = new Date(deadline);
    const diff = deadlineDate.getTime() - now.getTime();
    
    if (diff <= 0) return { text: 'SCADUTO', color: '#f44336', expired: true };
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours < 6) return { text: `${hours}h ${minutes}m`, color: '#f44336', expired: false };
    if (hours < 24) return { text: `${hours}h ${minutes}m`, color: '#FF9800', expired: false };
    return { text: `${hours}h`, color: '#4CAF50', expired: false };
  };

  // Conferma ricezione libro dal venditore
  const handleConfirmDelivery = async (orderId: string) => {
    try {
      await axios.post(`${API_URL}/api/bookstore/${bookstoreId}/confirm-delivery/${orderId}`);
      if (Platform.OS === 'web') {
        window.alert('Consegna confermata!');
      } else {
        Alert.alert('Successo', 'Consegna confermata!');
      }
      loadDashboard(bookstoreId!);
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'Errore durante la conferma';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Errore', msg);
      }
    }
  };

  // Conferma ritiro libro dall'acquirente
  const handleConfirmPickup = async (orderId: string) => {
    try {
      await axios.post(`${API_URL}/api/bookstore/${bookstoreId}/confirm-pickup/${orderId}`);
      if (Platform.OS === 'web') {
        window.alert('Ritiro confermato!');
      } else {
        Alert.alert('Successo', 'Ritiro confermato!');
      }
      loadDashboard(bookstoreId!);
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'Errore durante la conferma';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Errore', msg);
      }
    }
  };

  // Gestisci reso
  const handleReturn = async (orderId: string, reason: string) => {
    try {
      await axios.post(`${API_URL}/api/bookstore/${bookstoreId}/return/${orderId}`, { reason });
      if (Platform.OS === 'web') {
        window.alert('Reso registrato!');
      } else {
        Alert.alert('Successo', 'Reso registrato!');
      }
      loadDashboard(bookstoreId!);
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'Errore durante il reso';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Errore', msg);
      }
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#1a472a" />
      </View>
    );
  }

  // Login Screen
  if (!isLoggedIn) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        
        <View style={styles.loginContainer}>
          <View style={styles.loginHeader}>
            <Ionicons name="storefront" size={60} color="#1a472a" />
            <Text style={styles.loginTitle}>Area Cartolibreria</Text>
            <Text style={styles.loginSubtitle}>Accedi per gestire ordini e consegne</Text>
          </View>

          <View style={styles.loginForm}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="email@cartolibreria.it"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>

            <TouchableOpacity
              style={styles.loginButton}
              onPress={handleLogin}
              disabled={loginLoading}
            >
              {loginLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.loginButtonText}>Accedi</Text>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={20} color="#666" />
            <Text style={styles.backButtonText}>Torna indietro</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Dashboard Screen
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{bookstoreInfo?.nome || 'Cartolibreria'}</Text>
          <Text style={styles.headerSubtitle}>{bookstoreInfo?.indirizzo || ''}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Ionicons name="log-out-outline" size={24} color="#f44336" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsContainer}>
        {[
          { key: 'dashboard', label: 'Dashboard', icon: 'grid-outline' },
          { key: 'pending', label: 'In Arrivo', icon: 'time-outline' },
          { key: 'delivered', label: 'Da Ritirare', icon: 'cube-outline' },
          { key: 'completed', label: 'Completati', icon: 'checkmark-circle-outline' },
          { key: 'returns', label: 'Resi', icon: 'refresh-outline' },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key as any)}
          >
            <Ionicons 
              name={tab.icon as any} 
              size={20} 
              color={activeTab === tab.key ? '#1a472a' : '#666'} 
            />
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Content */}
      <ScrollView 
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1a472a']} />
        }
      >
        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && stats && (
          <View style={styles.dashboardGrid}>
            <View style={[styles.statCard, { backgroundColor: '#E3F2FD' }]}>
              <Ionicons name="time-outline" size={32} color="#1976D2" />
              <Text style={styles.statNumber}>{stats.pending_deliveries || 0}</Text>
              <Text style={styles.statLabel}>In Arrivo</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#FFF3E0' }]}>
              <Ionicons name="cube-outline" size={32} color="#F57C00" />
              <Text style={styles.statNumber}>{stats.awaiting_pickup || 0}</Text>
              <Text style={styles.statLabel}>Da Ritirare</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#E8F5E9' }]}>
              <Ionicons name="checkmark-circle-outline" size={32} color="#388E3C" />
              <Text style={styles.statNumber}>{stats.completed_today || 0}</Text>
              <Text style={styles.statLabel}>Oggi Completati</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#FCE4EC' }]}>
              <Ionicons name="refresh-outline" size={32} color="#C2185B" />
              <Text style={styles.statNumber}>{stats.returns_pending || 0}</Text>
              <Text style={styles.statLabel}>Resi in Attesa</Text>
            </View>
            
            {/* Guadagni */}
            <View style={[styles.earningsCard]}>
              <Text style={styles.earningsTitle}>Guadagni del Mese</Text>
              <Text style={styles.earningsAmount}>€{(stats.monthly_earnings || 0).toFixed(2)}</Text>
              <Text style={styles.earningsDetail}>
                {stats.monthly_transactions || 0} transazioni • 5% commissione
              </Text>
            </View>
          </View>
        )}

        {/* Pending Deliveries Tab */}
        {activeTab === 'pending' && (
          <View style={styles.ordersList}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="time-outline" size={20} color="#1976D2" /> In Attesa di Consegna ({pendingDeliveries.length})
            </Text>
            {pendingDeliveries.length === 0 ? (
              <Text style={styles.emptyText}>Nessuna consegna in arrivo</Text>
            ) : (
              pendingDeliveries.map((order) => {
                const timeInfo = order.seller_delivery_deadline 
                  ? getTimeRemaining(order.seller_delivery_deadline)
                  : null;
                return (
                  <View key={order.id} style={styles.orderCard}>
                    <View style={styles.orderHeader}>
                      <Text style={styles.orderCode}>{order.order_code}</Text>
                      {timeInfo && (
                        <View style={[styles.timerBadge, { backgroundColor: timeInfo.color }]}>
                          <Ionicons name="timer-outline" size={14} color="#fff" />
                          <Text style={styles.timerText}>{timeInfo.text}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.orderTitle} numberOfLines={1}>{order.book_titolo}</Text>
                    <Text style={styles.orderMeta}>ISBN: {order.book_isbn}</Text>
                    <Text style={styles.orderMeta}>Venditore: {order.seller_name}</Text>
                    <View style={styles.orderFooter}>
                      <Text style={styles.orderPrice}>€{order.prezzo_acquirente?.toFixed(2)}</Text>
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => handleConfirmDelivery(order.id)}
                      >
                        <Ionicons name="checkmark" size={18} color="#fff" />
                        <Text style={styles.actionButtonText}>Ricevuto</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* Delivered Orders Tab */}
        {activeTab === 'delivered' && (
          <View style={styles.ordersList}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="cube-outline" size={20} color="#F57C00" /> Da Ritirare ({deliveredOrders.length})
            </Text>
            {deliveredOrders.length === 0 ? (
              <Text style={styles.emptyText}>Nessun libro da ritirare</Text>
            ) : (
              deliveredOrders.map((order) => (
                <View key={order.id} style={styles.orderCard}>
                  <View style={styles.orderHeader}>
                    <Text style={styles.orderCode}>{order.order_code}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: '#FFF3E0' }]}>
                      <Text style={[styles.statusText, { color: '#F57C00' }]}>In Attesa Ritiro</Text>
                    </View>
                  </View>
                  <Text style={styles.orderTitle} numberOfLines={1}>{order.book_titolo}</Text>
                  <Text style={styles.orderMeta}>Acquirente: {order.buyer_name}</Text>
                  <View style={styles.orderFooter}>
                    <Text style={styles.orderPrice}>€{order.prezzo_acquirente?.toFixed(2)}</Text>
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: '#4CAF50' }]}
                      onPress={() => handleConfirmPickup(order.id)}
                    >
                      <Ionicons name="checkmark" size={18} color="#fff" />
                      <Text style={styles.actionButtonText}>Consegnato</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* Completed Orders Tab */}
        {activeTab === 'completed' && (
          <View style={styles.ordersList}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="checkmark-circle-outline" size={20} color="#388E3C" /> Completati ({completedOrders.length})
            </Text>
            {completedOrders.length === 0 ? (
              <Text style={styles.emptyText}>Nessun ordine completato</Text>
            ) : (
              completedOrders.map((order) => (
                <View key={order.id} style={[styles.orderCard, { borderLeftColor: '#4CAF50' }]}>
                  <View style={styles.orderHeader}>
                    <Text style={styles.orderCode}>{order.order_code}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: '#E8F5E9' }]}>
                      <Text style={[styles.statusText, { color: '#388E3C' }]}>Completato</Text>
                    </View>
                  </View>
                  <Text style={styles.orderTitle} numberOfLines={1}>{order.book_titolo}</Text>
                  <Text style={styles.orderMeta}>
                    {new Date(order.created_at).toLocaleDateString('it-IT')}
                  </Text>
                  <Text style={styles.orderPrice}>€{order.prezzo_acquirente?.toFixed(2)}</Text>
                </View>
              ))
            )}
          </View>
        )}

        {/* Returns Tab */}
        {activeTab === 'returns' && (
          <View style={styles.ordersList}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="refresh-outline" size={20} color="#C2185B" /> Resi ({returns.length})
            </Text>
            {returns.length === 0 ? (
              <Text style={styles.emptyText}>Nessun reso</Text>
            ) : (
              returns.map((order) => (
                <View key={order.id} style={[styles.orderCard, { borderLeftColor: '#f44336' }]}>
                  <View style={styles.orderHeader}>
                    <Text style={styles.orderCode}>{order.order_code}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: '#FFEBEE' }]}>
                      <Text style={[styles.statusText, { color: '#C2185B' }]}>Reso</Text>
                    </View>
                  </View>
                  <Text style={styles.orderTitle} numberOfLines={1}>{order.book_titolo}</Text>
                  <Text style={styles.orderPrice}>€{order.prezzo_acquirente?.toFixed(2)}</Text>
                </View>
              ))
            )}
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
  // Login Styles
  loginContainer: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  loginHeader: {
    alignItems: 'center',
    marginBottom: 40,
  },
  loginTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a472a',
    marginTop: 16,
  },
  loginSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  loginForm: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  loginButton: {
    backgroundColor: '#1a472a',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    gap: 8,
  },
  backButtonText: {
    color: '#666',
    fontSize: 14,
  },
  // Dashboard Styles
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  logoutButton: {
    padding: 8,
  },
  tabsContainer: {
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 4,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    gap: 6,
  },
  tabActive: {
    backgroundColor: '#E8F5E9',
  },
  tabText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#1a472a',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  dashboardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    width: '47%',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  earningsCard: {
    width: '100%',
    padding: 20,
    borderRadius: 12,
    backgroundColor: '#1a472a',
    marginTop: 8,
  },
  earningsTitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  earningsAmount: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
  },
  earningsDetail: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  ordersList: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 14,
    marginTop: 40,
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#1976D2',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  orderCode: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  timerText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  orderTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  orderMeta: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  orderPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1976D2',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
