import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Admin credentials (in a real app, this would be server-side)
const ADMIN_PASSWORD = 'admin2024';

interface Stats {
  users: number;
  premium_users: number;
  books: number;
  listings: number;
  listings_available: number;
  listings_sold: number;
  transactions: number;
  bookstores: number;
  revenue: number;
}

interface Transaction {
  id: string;
  book_titolo: string;
  buyer_username: string;
  seller_username: string;
  bookstore_nome: string;
  prezzo_totale: number;
  stato: string;
  created_at: string;
}

interface BookstoreRequest {
  id: string;
  nome_attivita: string;
  email: string;
  partita_iva: string;
  indirizzo: string;
  citta: string;
  telefono: string;
  status: string;
  generated_password?: string;
  created_at: string;
  approved_at?: string;
}

export default function AdminScreen() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [bookstoreRequests, setBookstoreRequests] = useState<BookstoreRequest[]>([]);
  const [activeTab, setActiveTab] = useState<'stats' | 'transactions' | 'bookstores'>('stats');
  const [approvingId, setApprovingId] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const isAdmin = await AsyncStorage.getItem('is_admin');
    if (isAdmin === 'true') {
      setIsAuthenticated(true);
      loadData();
    }
  };

  const handleLogin = async () => {
    if (password === ADMIN_PASSWORD) {
      await AsyncStorage.setItem('is_admin', 'true');
      setIsAuthenticated(true);
      loadData();
    } else {
      Alert.alert('Errore', 'Password non valida');
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('is_admin');
    setIsAuthenticated(false);
    setPassword('');
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const userId = await AsyncStorage.getItem('user_id');
      
      // Load stats from admin endpoint
      const statsRes = await axios.get(`${API_URL}/api/admin/stats`);
      const data = statsRes.data;
      
      setStats({
        users: data.users.total,
        premium_users: data.users.premium,
        books: data.books,
        listings: data.listings.total,
        listings_available: data.listings.available,
        listings_sold: data.listings.sold,
        transactions: data.transactions,
        bookstores: data.bookstores,
        revenue: data.revenue,
      });
      
      // Load recent transactions
      const transRes = await axios.get(`${API_URL}/api/admin/transactions?limit=20`);
      setRecentTransactions(transRes.data);
      
      // Load bookstore requests
      try {
        const reqRes = await axios.get(`${API_URL}/api/admin/bookstore-requests?admin_id=${userId}`);
        setBookstoreRequests(reqRes.data.requests || []);
      } catch (e) {
        console.log('No bookstore requests endpoint or not admin');
      }
    } catch (error) {
      console.error('Error loading admin data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleApproveRequest = async (requestId: string) => {
    setApprovingId(requestId);
    try {
      const userId = await AsyncStorage.getItem('user_id');
      const response = await axios.post(
        `${API_URL}/api/admin/bookstore-requests/${requestId}/approve?admin_id=${userId}`
      );
      
      Alert.alert(
        'Richiesta approvata!',
        `Email: ${response.data.email}\nPassword: ${response.data.password}\n\nInvia queste credenziali alla cartolibreria.`,
        [{ text: 'OK' }]
      );
      
      loadData();
    } catch (error: any) {
      Alert.alert('Errore', error.response?.data?.detail || 'Errore approvazione');
    } finally {
      setApprovingId(null);
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    Alert.alert(
      'Rifiuta richiesta',
      'Sei sicuro di voler rifiutare questa richiesta?',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Rifiuta',
          style: 'destructive',
          onPress: async () => {
            try {
              const userId = await AsyncStorage.getItem('user_id');
              await axios.post(
                `${API_URL}/api/admin/bookstore-requests/${requestId}/reject?admin_id=${userId}`
              );
              loadData();
            } catch (error: any) {
              Alert.alert('Errore', error.response?.data?.detail || 'Errore');
            }
          },
        },
      ]
    );
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (!isAuthenticated) {
    return (
      <View style={styles.loginContainer}>
        <View style={styles.loginCard}>
          <Ionicons name="shield-checkmark" size={64} color="#1a472a" />
          <Text style={styles.loginTitle}>Pannello Admin</Text>
          <Text style={styles.loginSubtitle}>Inserisci la password per accedere</Text>
          
          <TextInput
            style={styles.passwordInput}
            placeholder="Password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          
          <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
            <Text style={styles.loginButtonText}>Accedi</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.canGoBack() ? router.back() : router.push('/(tabs)')}
          >
            <Text style={styles.backButtonText}>Torna all'app</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Pannello Admin</Text>
          <Text style={styles.headerSubtitle}>RiLiBro</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'stats' && styles.tabActive]}
          onPress={() => setActiveTab('stats')}
        >
          <Ionicons
            name="stats-chart"
            size={20}
            color={activeTab === 'stats' ? '#1a472a' : '#666'}
          />
          <Text style={[styles.tabText, activeTab === 'stats' && styles.tabTextActive]}>
            Statistiche
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'transactions' && styles.tabActive]}
          onPress={() => setActiveTab('transactions')}
        >
          <Ionicons
            name="swap-horizontal"
            size={20}
            color={activeTab === 'transactions' ? '#1a472a' : '#666'}
          />
          <Text style={[styles.tabText, activeTab === 'transactions' && styles.tabTextActive]}>
            Transazioni
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'bookstores' && styles.tabActive]}
          onPress={() => setActiveTab('bookstores')}
        >
          <Ionicons
            name="storefront"
            size={20}
            color={activeTab === 'bookstores' ? '#1a472a' : '#666'}
          />
          <Text style={[styles.tabText, activeTab === 'bookstores' && styles.tabTextActive]}>
            Cartolibrerie
          </Text>
          {bookstoreRequests.filter(r => r.status === 'pending').length > 0 && (
            <View style={styles.badgeCount}>
              <Text style={styles.badgeCountText}>
                {bookstoreRequests.filter(r => r.status === 'pending').length}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loading ? (
          <ActivityIndicator size="large" color="#1a472a" style={{ marginTop: 40 }} />
        ) : activeTab === 'stats' ? (
          <View style={styles.statsContainer}>
            {/* Main Stats Cards */}
            <View style={styles.statsGrid}>
              <View style={[styles.statCard, { backgroundColor: '#e8f5e9' }]}>
                <Ionicons name="people" size={32} color="#388e3c" />
                <Text style={styles.statNumber}>{stats?.users || 0}</Text>
                <Text style={styles.statLabel}>Utenti Totali</Text>
                <Text style={styles.statSubLabel}>
                  {stats?.premium_users || 0} Premium
                </Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: '#e3f2fd' }]}>
                <Ionicons name="book" size={32} color="#1976d2" />
                <Text style={styles.statNumber}>{stats?.books || 0}</Text>
                <Text style={styles.statLabel}>Libri nel DB</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: '#fff3e0' }]}>
                <Ionicons name="pricetag" size={32} color="#f57c00" />
                <Text style={styles.statNumber}>{stats?.listings || 0}</Text>
                <Text style={styles.statLabel}>Annunci</Text>
                <Text style={styles.statSubLabel}>
                  {stats?.listings_available || 0} disponibili
                </Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: '#fce4ec' }]}>
                <Ionicons name="swap-horizontal" size={32} color="#c2185b" />
                <Text style={styles.statNumber}>{stats?.listings_sold || 0}</Text>
                <Text style={styles.statLabel}>Venduti</Text>
              </View>
            </View>

            {/* Revenue Card */}
            <View style={styles.revenueCard}>
              <View style={styles.revenueHeader}>
                <Ionicons name="cash" size={28} color="#1a472a" />
                <Text style={styles.revenueTitle}>Ricavi Totali</Text>
              </View>
              <Text style={styles.revenueAmount}>€{stats?.revenue?.toFixed(2) || '0.00'}</Text>
              <Text style={styles.revenueNote}>Commissioni da utenti Free (15%)</Text>
            </View>

            {/* Quick Info */}
            <View style={styles.infoRow}>
              <View style={styles.infoItem}>
                <Ionicons name="storefront" size={20} color="#666" />
                <Text style={styles.infoText}>{stats?.bookstores || 0} Cartolibrerie Partner</Text>
              </View>
              <View style={styles.infoItem}>
                <Ionicons name="star" size={20} color="#f4a460" />
                <Text style={styles.infoText}>{stats?.premium_users || 0} Utenti Premium</Text>
              </View>
            </View>

            {/* Quick Actions */}
            <Text style={styles.sectionTitle}>Azioni Rapide</Text>
            <View style={styles.actionsContainer}>
              <TouchableOpacity style={styles.actionCard}>
                <Ionicons name="cloud-upload" size={24} color="#1a472a" />
                <Text style={styles.actionText}>Aggiorna DB Libri</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionCard}>
                <Ionicons name="notifications" size={24} color="#1a472a" />
                <Text style={styles.actionText}>Invia Notifica</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionCard}>
                <Ionicons name="download" size={24} color="#1a472a" />
                <Text style={styles.actionText}>Esporta Dati</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : activeTab === 'transactions' ? (
          <View style={styles.transactionsContainer}>
            {recentTransactions && recentTransactions.length > 0 ? (
              recentTransactions.map((trans: any, index: number) => (
                <View key={index} style={styles.transactionCard}>
                  <View style={styles.transactionInfo}>
                    <Text style={styles.transactionTitle}>{trans.book_titolo}</Text>
                    <Text style={styles.transactionSeller}>
                      Venditore: {trans.seller_username}
                    </Text>
                    <Text style={styles.transactionStatus}>
                      Stato: {trans.stato}
                    </Text>
                  </View>
                  <Text style={styles.transactionPrice}>
                    €{trans.prezzo_vendita?.toFixed(2)}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>Nessuna transazione recente</Text>
            )}
          </View>
        ) : activeTab === 'bookstores' ? (
          <View style={styles.bookstoreRequestsContainer}>
            <Text style={styles.sectionTitle}>Richieste di registrazione</Text>
            
            {bookstoreRequests.filter(r => r.status === 'pending').length === 0 ? (
              <Text style={styles.emptyText}>Nessuna richiesta in attesa</Text>
            ) : (
              bookstoreRequests
                .filter(r => r.status === 'pending')
                .map((request) => (
                  <View key={request.id} style={styles.requestCard}>
                    <View style={styles.requestHeader}>
                      <Ionicons name="storefront" size={24} color="#9C27B0" />
                      <Text style={styles.requestName}>{request.nome_attivita}</Text>
                    </View>
                    
                    <View style={styles.requestDetails}>
                      <View style={styles.requestRow}>
                        <Ionicons name="mail" size={16} color="#666" />
                        <Text style={styles.requestText}>{request.email}</Text>
                      </View>
                      <View style={styles.requestRow}>
                        <Ionicons name="document-text" size={16} color="#666" />
                        <Text style={styles.requestText}>P.IVA: {request.partita_iva}</Text>
                      </View>
                      {request.indirizzo && (
                        <View style={styles.requestRow}>
                          <Ionicons name="location" size={16} color="#666" />
                          <Text style={styles.requestText}>{request.indirizzo}, {request.citta}</Text>
                        </View>
                      )}
                      {request.telefono && (
                        <View style={styles.requestRow}>
                          <Ionicons name="call" size={16} color="#666" />
                          <Text style={styles.requestText}>{request.telefono}</Text>
                        </View>
                      )}
                    </View>
                    
                    <View style={styles.requestActions}>
                      <TouchableOpacity
                        style={[styles.requestButton, styles.approveButton]}
                        onPress={() => handleApproveRequest(request.id)}
                        disabled={approvingId === request.id}
                      >
                        {approvingId === request.id ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <>
                            <Ionicons name="checkmark" size={18} color="#fff" />
                            <Text style={styles.requestButtonText}>Approva</Text>
                          </>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.requestButton, styles.rejectButton]}
                        onPress={() => handleRejectRequest(request.id)}
                      >
                        <Ionicons name="close" size={18} color="#f44336" />
                        <Text style={[styles.requestButtonText, { color: '#f44336' }]}>Rifiuta</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
            )}

            {/* Approved requests with password */}
            {bookstoreRequests.filter(r => r.status === 'approved').length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Approvate di recente</Text>
                {bookstoreRequests
                  .filter(r => r.status === 'approved')
                  .slice(0, 5)
                  .map((request) => (
                    <View key={request.id} style={[styles.requestCard, { borderLeftColor: '#4CAF50', borderLeftWidth: 4 }]}>
                      <View style={styles.requestHeader}>
                        <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                        <Text style={styles.requestName}>{request.nome_attivita}</Text>
                      </View>
                      <View style={styles.requestDetails}>
                        <View style={styles.requestRow}>
                          <Ionicons name="mail" size={16} color="#666" />
                          <Text style={styles.requestText}>{request.email}</Text>
                        </View>
                        {request.generated_password && (
                          <View style={[styles.requestRow, styles.passwordRow]}>
                            <Ionicons name="key" size={16} color="#4CAF50" />
                            <Text style={[styles.requestText, styles.passwordText]}>
                              Password: {request.generated_password}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  ))}
              </>
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loginContainer: {
    flex: 1,
    backgroundColor: '#1a472a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loginCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  loginTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
  },
  loginSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    marginBottom: 24,
  },
  passwordInput: {
    width: '100%',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 16,
  },
  loginButton: {
    width: '100%',
    backgroundColor: '#1a472a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  backButton: {
    marginTop: 16,
    padding: 12,
  },
  backButtonText: {
    color: '#666',
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a472a',
    padding: 20,
    paddingTop: 60,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#a8d5ba',
  },
  logoutButton: {
    padding: 8,
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
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  tabActive: {
    backgroundColor: '#e8f5e9',
  },
  tabText: {
    fontSize: 14,
    color: '#666',
  },
  tabTextActive: {
    color: '#1a472a',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  statsContainer: {
    padding: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    width: '48%',
    padding: 20,
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 24,
    marginBottom: 12,
  },
  actionsContainer: {
    gap: 12,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  actionText: {
    fontSize: 16,
    color: '#333',
  },
  transactionsContainer: {
    padding: 16,
  },
  emptyText: {
    textAlign: 'center',
    color: '#666',
    marginTop: 40,
  },
  statSubLabel: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  revenueCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    marginTop: 16,
    borderWidth: 2,
    borderColor: '#1a472a',
  },
  revenueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  revenueTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a472a',
  },
  revenueAmount: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#1a472a',
    marginTop: 8,
  },
  revenueNote: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  infoRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  infoItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  infoText: {
    fontSize: 13,
    color: '#666',
  },
  transactionCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  transactionSeller: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  transactionStatus: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  transactionPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  // Badge count for tabs
  badgeCount: {
    backgroundColor: '#f44336',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
  badgeCountText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  // Bookstore requests styles
  bookstoreRequestsContainer: {
    padding: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  requestCard: {
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
  requestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  requestName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  requestDetails: {
    gap: 6,
    marginBottom: 12,
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  requestText: {
    fontSize: 14,
    color: '#666',
  },
  passwordRow: {
    backgroundColor: '#E8F5E9',
    padding: 8,
    borderRadius: 6,
    marginTop: 8,
  },
  passwordText: {
    color: '#4CAF50',
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  requestActions: {
    flexDirection: 'row',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 12,
  },
  requestButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderRadius: 8,
    gap: 6,
  },
  approveButton: {
    backgroundColor: '#4CAF50',
  },
  rejectButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f44336',
  },
  requestButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
