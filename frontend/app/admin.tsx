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
  books: number;
  listings: number;
  transactions: number;
  bookstores: number;
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

export default function AdminScreen() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [activeTab, setActiveTab] = useState<'stats' | 'transactions' | 'users'>('stats');

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
      // Load stats
      const [usersRes, booksRes, listingsRes, bookstoresRes] = await Promise.all([
        axios.get(`${API_URL}/api/books?limit=1`).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/api/books?limit=5000`),
        axios.get(`${API_URL}/api/listings?limit=1000`),
        axios.get(`${API_URL}/api/bookstores`),
      ]);

      setStats({
        users: 0, // We'd need an admin endpoint for this
        books: booksRes.data.length,
        listings: listingsRes.data.length,
        transactions: 0, // We'd need an admin endpoint
        bookstores: bookstoresRes.data.length,
      });
    } catch (error) {
      console.error('Error loading admin data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
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
            onPress={() => router.back()}
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
          <Text style={styles.headerSubtitle}>ScambiaLibri</Text>
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
            {/* Stats Cards */}
            <View style={styles.statsGrid}>
              <View style={[styles.statCard, { backgroundColor: '#e3f2fd' }]}>
                <Ionicons name="book" size={32} color="#1976d2" />
                <Text style={styles.statNumber}>{stats?.books || 0}</Text>
                <Text style={styles.statLabel}>Libri nel DB</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: '#e8f5e9' }]}>
                <Ionicons name="pricetag" size={32} color="#388e3c" />
                <Text style={styles.statNumber}>{stats?.listings || 0}</Text>
                <Text style={styles.statLabel}>Annunci Attivi</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: '#fff3e0' }]}>
                <Ionicons name="storefront" size={32} color="#f57c00" />
                <Text style={styles.statNumber}>{stats?.bookstores || 0}</Text>
                <Text style={styles.statLabel}>Cartolibrerie</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: '#fce4ec' }]}>
                <Ionicons name="swap-horizontal" size={32} color="#c2185b" />
                <Text style={styles.statNumber}>{stats?.transactions || 0}</Text>
                <Text style={styles.statLabel}>Transazioni</Text>
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
        ) : (
          <View style={styles.transactionsContainer}>
            <Text style={styles.emptyText}>Nessuna transazione recente</Text>
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
});
