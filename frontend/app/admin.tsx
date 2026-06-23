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
import * as Linking from 'expo-linking';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function AdminPortalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adminId, setAdminId] = useState<string | null>(null);
  
  // Login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  
  // Dashboard state
  const [stats, setStats] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'requests' | 'users' | 'orders' | 'bookstores' | 'downloads'>('dashboard');
  const [refreshing, setRefreshing] = useState(false);
  
  // Data lists
  const [requests, setRequests] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [bookstores, setBookstores] = useState<any[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);
  
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const storedAdminId = await AsyncStorage.getItem('admin_id');
      if (storedAdminId) {
        setAdminId(storedAdminId);
        setIsLoggedIn(true);
        loadDashboard(storedAdminId);
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
      const response = await axios.post(`${API_URL}/api/admin/login`, {
        email: email.trim(),
        password: password
      });
      
      if (response.data.success) {
        await AsyncStorage.setItem('admin_id', response.data.user_id);
        setAdminId(response.data.user_id);
        setIsLoggedIn(true);
        loadDashboard(response.data.user_id);
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
      } else if (error.message) {
        message = error.message;
      }
      
      if (Platform.OS === 'web') {
        window.alert('Errore: ' + message);
      } else {
        Alert.alert('Errore', message);
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('admin_id');
    setIsLoggedIn(false);
    setAdminId(null);
    setStats(null);
  };

  const loadDashboard = async (id: string) => {
    try {
      const [statsRes, requestsRes] = await Promise.all([
        axios.get(`${API_URL}/api/admin/stats?admin_id=${id}`),
        axios.get(`${API_URL}/api/admin/bookstore-requests?admin_id=${id}`)
      ]);
      
      setStats(statsRes.data);
      setRequests(requestsRes.data.requests || []);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    }
  };

  const loadUsers = async () => {
    if (!adminId) return;
    try {
      const response = await axios.get(`${API_URL}/api/admin/users?admin_id=${adminId}`);
      setUsers(response.data.users || []);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const loadOrders = async () => {
    if (!adminId) return;
    try {
      const response = await axios.get(`${API_URL}/api/admin/orders?admin_id=${adminId}`);
      setOrders(response.data.orders || []);
    } catch (error) {
      console.error('Error loading orders:', error);
    }
  };

  const loadBookstores = async () => {
    if (!adminId) return;
    try {
      const response = await axios.get(`${API_URL}/api/admin/bookstores?admin_id=${adminId}`);
      setBookstores(response.data.bookstores || []);
    } catch (error) {
      console.error('Error loading bookstores:', error);
    }
  };

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab);
    if (tab === 'users' && users.length === 0) loadUsers();
    if (tab === 'orders' && orders.length === 0) loadOrders();
    if (tab === 'bookstores' && bookstores.length === 0) loadBookstores();
  };

  const handleApproveRequest = async (requestId: string) => {
    if (!adminId) return;
    
    const confirm = Platform.OS === 'web' 
      ? window.confirm('Approvare questa richiesta?')
      : await new Promise(resolve => Alert.alert('Conferma', 'Approvare questa richiesta?', [
          { text: 'Annulla', onPress: () => resolve(false) },
          { text: 'Approva', onPress: () => resolve(true) }
        ]));
    
    if (!confirm) return;

    try {
      await axios.post(`${API_URL}/api/admin/bookstore-requests/${requestId}/approve?admin_id=${adminId}`);
      
      if (Platform.OS === 'web') {
        window.alert('Richiesta approvata! La password è stata generata.');
      } else {
        Alert.alert('Successo', 'Richiesta approvata! La password è stata generata.');
      }
      
      loadDashboard(adminId);
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Errore';
      if (Platform.OS === 'web') {
        window.alert('Errore: ' + message);
      } else {
        Alert.alert('Errore', message);
      }
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    if (!adminId) return;

    const confirm = Platform.OS === 'web' 
      ? window.confirm('Rifiutare questa richiesta?')
      : await new Promise(resolve => Alert.alert('Conferma', 'Rifiutare questa richiesta?', [
          { text: 'Annulla', onPress: () => resolve(false) },
          { text: 'Rifiuta', style: 'destructive', onPress: () => resolve(true) }
        ]));
    
    if (!confirm) return;

    try {
      await axios.post(`${API_URL}/api/admin/bookstore-requests/${requestId}/reject?admin_id=${adminId}`);
      
      if (Platform.OS === 'web') {
        window.alert('Richiesta rifiutata');
      } else {
        Alert.alert('Fatto', 'Richiesta rifiutata');
      }
      
      loadDashboard(adminId);
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Errore';
      if (Platform.OS === 'web') {
        window.alert('Errore: ' + message);
      } else {
        Alert.alert('Errore', message);
      }
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    if (adminId) {
      loadDashboard(adminId);
      if (activeTab === 'users') loadUsers();
      if (activeTab === 'orders') loadOrders();
      if (activeTab === 'bookstores') loadBookstores();
    }
    setRefreshing(false);
  };

  // Funzione per cancellare tutti i dati locali
  const handleClearLocalData = async () => {
    const confirm = Platform.OS === 'web' 
      ? window.confirm('⚠️ ATTENZIONE: Questo cancellerà TUTTI i dati locali (profili, notifiche cache, preferenze).\n\nVuoi procedere?')
      : await new Promise(resolve => Alert.alert(
          '⚠️ Cancella Dati Locali', 
          'Questo cancellerà TUTTI i dati locali (profili, notifiche cache, preferenze).\n\nVuoi procedere?', 
          [
            { text: 'Annulla', onPress: () => resolve(false) },
            { text: 'Cancella Tutto', style: 'destructive', onPress: () => resolve(true) }
          ]
        ));
    
    if (!confirm) return;

    try {
      // Cancella TUTTO da AsyncStorage
      await AsyncStorage.clear();
      
      // Cancella anche localStorage su web
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        localStorage.clear();
        sessionStorage.clear();
      }
      
      if (Platform.OS === 'web') {
        window.alert('✅ Dati locali cancellati!\n\nLa pagina verrà ricaricata.');
        window.location.reload();
      } else {
        Alert.alert('✅ Fatto', 'Dati locali cancellati! Riavvia l\'app per vedere le modifiche.');
      }
    } catch (error) {
      console.error('Error clearing local data:', error);
      if (Platform.OS === 'web') {
        window.alert('Errore durante la cancellazione');
      } else {
        Alert.alert('Errore', 'Errore durante la cancellazione');
      }
    }
  };

  // Funzione per cancellare dati dal database (server)
  const handleClearServerData = async () => {
    const confirm = Platform.OS === 'web' 
      ? window.confirm('⚠️ ATTENZIONE: Questo cancellerà TUTTI i dati dal DATABASE SERVER (notifiche, ordini, messaggi, annunci).\n\nQuesta azione è IRREVERSIBILE!\n\nVuoi procedere?')
      : await new Promise(resolve => Alert.alert(
          '⚠️ CANCELLA DATABASE', 
          'Questo cancellerà TUTTI i dati dal SERVER!\n\n• Notifiche\n• Ordini\n• Messaggi\n• Annunci\n• Conversazioni\n\nQuesta azione è IRREVERSIBILE!', 
          [
            { text: 'Annulla', onPress: () => resolve(false) },
            { text: 'CANCELLA TUTTO', style: 'destructive', onPress: () => resolve(true) }
          ]
        ));
    
    if (!confirm) return;

    try {
      await axios.post(`${API_URL}/api/admin/clear-all-data?admin_id=${adminId}`);
      
      if (Platform.OS === 'web') {
        window.alert('✅ Database svuotato!');
      } else {
        Alert.alert('✅ Fatto', 'Database svuotato!');
      }
      
      loadDashboard(adminId!);
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Errore';
      if (Platform.OS === 'web') {
        window.alert('Errore: ' + message);
      } else {
        Alert.alert('Errore', message);
      }
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#1a472a" />
      </View>
    );
  }

  // Login screen
  if (!isLoggedIn) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        
        <View style={styles.loginContainer}>
          <View style={styles.loginCard}>
            <View style={styles.loginHeader}>
              <Ionicons name="shield-checkmark" size={48} color="#1a472a" />
              <Text style={styles.loginTitle}>Admin RiBook</Text>
              <Text style={styles.loginSubtitle}>Accedi al pannello di controllo</Text>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Email admin"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <TextInput
              style={styles.input}
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <TouchableOpacity
              style={[styles.loginButton, loginLoading && styles.loginButtonDisabled]}
              onPress={handleLogin}
              disabled={loginLoading}
            >
              {loginLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.loginButtonText}>Accedi</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={16} color="#666" />
              <Text style={styles.backLinkText}>Torna all'app</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // Admin Dashboard
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="shield-checkmark" size={24} color="#fff" />
          <Text style={styles.headerTitle}>Admin Panel</Text>
        </View>
        <TouchableOpacity onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {[
          { key: 'dashboard', icon: 'grid', label: 'Dashboard' },
          { key: 'requests', icon: 'document-text', label: 'Richieste' },
          { key: 'users', icon: 'people', label: 'Utenti' },
          { key: 'orders', icon: 'cart', label: 'Ordini' },
          { key: 'bookstores', icon: 'storefront', label: 'Cartolibrerie' },
          { key: 'downloads', icon: 'download', label: 'Download' },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => handleTabChange(tab.key as typeof activeTab)}
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
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && stats && (
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { backgroundColor: '#e3f2fd' }]}>
              <Ionicons name="people" size={32} color="#2196F3" />
              <Text style={styles.statValue}>{stats.users?.total || 0}</Text>
              <Text style={styles.statLabel}>Utenti</Text>
            </View>
            
            <View style={[styles.statCard, { backgroundColor: '#e8f5e9' }]}>
              <Ionicons name="storefront" size={32} color="#4CAF50" />
              <Text style={styles.statValue}>{stats.bookstores?.total || 0}</Text>
              <Text style={styles.statLabel}>Cartolibrerie</Text>
            </View>
            
            <View style={[styles.statCard, { backgroundColor: '#fff3e0' }]}>
              <Ionicons name="cart" size={32} color="#FF9800" />
              <Text style={styles.statValue}>{stats.orders?.total || 0}</Text>
              <Text style={styles.statLabel}>Ordini totali</Text>
            </View>
            
            <View style={[styles.statCard, { backgroundColor: '#f3e5f5' }]}>
              <Ionicons name="book" size={32} color="#9C27B0" />
              <Text style={styles.statValue}>{stats.listings?.active || 0}</Text>
              <Text style={styles.statLabel}>Annunci attivi</Text>
            </View>
            
            <View style={[styles.statCard, { backgroundColor: '#ffebee' }]}>
              <Ionicons name="time" size={32} color="#f44336" />
              <Text style={styles.statValue}>{stats.bookstores?.pending_requests || 0}</Text>
              <Text style={styles.statLabel}>Richieste in attesa</Text>
            </View>
            
            <View style={[styles.statCard, { backgroundColor: '#e0f7fa' }]}>
              <Ionicons name="checkmark-circle" size={32} color="#00BCD4" />
              <Text style={styles.statValue}>{stats.orders?.completed || 0}</Text>
              <Text style={styles.statLabel}>Ordini completati</Text>
            </View>
            
            {/* Credito Piattaforma */}
            <View style={[styles.statCard, { backgroundColor: '#c8e6c9' }]}>
              <Ionicons name="wallet" size={32} color="#1a472a" />
              <Text style={[styles.statValue, { color: '#1a472a' }]}>
                €{stats.credito_piattaforma?.totale?.toFixed(2) || '0.00'}
              </Text>
              <Text style={styles.statLabel}>Credito Piattaforma</Text>
            </View>
            
            <View style={[styles.statCard, { backgroundColor: '#fff8e1' }]}>
              <Ionicons name="trending-up" size={32} color="#f57c00" />
              <Text style={[styles.statValue, { color: '#f57c00' }]}>
                €{stats.guadagni_piattaforma?.mese?.toFixed(2) || '0.00'}
              </Text>
              <Text style={styles.statLabel}>Guadagni Mese</Text>
            </View>
            
            <View style={[styles.statCard, { backgroundColor: '#e1f5fe' }]}>
              <Ionicons name="today" size={32} color="#0288d1" />
              <Text style={[styles.statValue, { color: '#0288d1' }]}>
                €{stats.guadagni_piattaforma?.oggi?.toFixed(2) || '0.00'}
              </Text>
              <Text style={styles.statLabel}>Guadagni Oggi</Text>
            </View>
          </View>
        )}
        
        {/* Sezione Pulizia Dati - solo in Dashboard */}
        {activeTab === 'dashboard' && (
          <View style={styles.dangerZone}>
            <Text style={styles.dangerZoneTitle}>⚠️ Zona Pericolosa</Text>
            <Text style={styles.dangerZoneSubtitle}>Queste azioni sono irreversibili</Text>
            
            <TouchableOpacity
              style={styles.dangerButton}
              onPress={handleClearLocalData}
            >
              <Ionicons name="phone-portrait-outline" size={20} color="#fff" />
              <View style={styles.dangerButtonContent}>
                <Text style={styles.dangerButtonTitle}>Cancella Dati Locali</Text>
                <Text style={styles.dangerButtonDesc}>Cache, profili salvati, preferenze del dispositivo</Text>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.dangerButton, styles.dangerButtonRed]}
              onPress={handleClearServerData}
            >
              <Ionicons name="server-outline" size={20} color="#fff" />
              <View style={styles.dangerButtonContent}>
                <Text style={styles.dangerButtonTitle}>Svuota Database Server</Text>
                <Text style={styles.dangerButtonDesc}>Notifiche, ordini, messaggi, annunci, conversazioni</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Requests Tab */}
        {activeTab === 'requests' && (
          <View style={styles.listContainer}>
            <Text style={styles.sectionTitle}>Richieste Cartolibrerie</Text>
            {requests.length === 0 ? (
              <Text style={styles.emptyText}>Nessuna richiesta in attesa</Text>
            ) : (
              requests.map((req) => (
                <View key={req.id} style={styles.requestCard}>
                  <View style={styles.requestHeader}>
                    <Text style={styles.requestName}>{req.nome}</Text>
                    <View style={[
                      styles.statusBadge,
                      req.status === 'pending' && styles.statusPending,
                      req.status === 'approved' && styles.statusApproved,
                      req.status === 'rejected' && styles.statusRejected,
                    ]}>
                      <Text style={styles.statusText}>
                        {req.status === 'pending' ? 'In attesa' : req.status === 'approved' ? 'Approvato' : 'Rifiutato'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.requestDetail}>📧 {req.email}</Text>
                  <Text style={styles.requestDetail}>📍 {req.indirizzo}, {req.citta}</Text>
                  <Text style={styles.requestDetail}>📞 {req.telefono}</Text>
                  {req.piva && <Text style={styles.requestDetail}>🏢 P.IVA: {req.piva}</Text>}
                  
                  {req.status === 'pending' && (
                    <View style={styles.requestActions}>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.rejectBtn]}
                        onPress={() => handleRejectRequest(req.id)}
                      >
                        <Ionicons name="close" size={16} color="#fff" />
                        <Text style={styles.actionBtnText}>Rifiuta</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.approveBtn]}
                        onPress={() => handleApproveRequest(req.id)}
                      >
                        <Ionicons name="checkmark" size={16} color="#fff" />
                        <Text style={styles.actionBtnText}>Approva</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  
                  {req.status === 'approved' && req.generated_password && (
                    <View style={styles.passwordBox}>
                      <Text style={styles.passwordLabel}>Password generata:</Text>
                      <Text style={styles.passwordValue}>{req.generated_password}</Text>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <View style={styles.listContainer}>
            <Text style={styles.sectionTitle}>Utenti ({users.length})</Text>
            {users.map((user) => (
              <View key={user.id} style={styles.userCard}>
                <View style={styles.userAvatar}>
                  <Ionicons name="person" size={24} color="#1a472a" />
                </View>
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{user.nome} {user.cognome}</Text>
                  <Text style={styles.userEmail}>{user.email}</Text>
                  {user.is_admin && (
                    <View style={styles.adminBadge}>
                      <Ionicons name="shield" size={12} color="#fff" />
                      <Text style={styles.adminBadgeText}>Admin</Text>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Orders Tab */}
        {activeTab === 'orders' && (
          <View style={styles.listContainer}>
            <Text style={styles.sectionTitle}>Ordini ({orders.length})</Text>
            {orders.map((order) => (
              <View key={order.id} style={styles.orderCard}>
                <View style={styles.orderHeader}>
                  <Text style={styles.orderCode}>{order.order_code}</Text>
                  <View style={[
                    styles.orderStatusBadge,
                    order.status === 'completed' && { backgroundColor: '#e8f5e9' },
                    order.status === 'in_attesa_pagamento' && { backgroundColor: '#fff3e0' },
                  ]}>
                    <Text style={styles.orderStatusText}>{order.status}</Text>
                  </View>
                </View>
                <Text style={styles.orderBook} numberOfLines={1}>📚 {order.book_titolo}</Text>
                <Text style={styles.orderDetail}>💰 €{order.totale_acquirente?.toFixed(2)}</Text>
                <Text style={styles.orderDetail}>👤 Venditore: {order.seller_name}</Text>
                <Text style={styles.orderDetail}>🛒 Acquirente: {order.buyer_name}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Bookstores Tab */}
        {activeTab === 'bookstores' && (
          <View style={styles.listContainer}>
            <Text style={styles.sectionTitle}>Cartolibrerie ({bookstores.length})</Text>
            {bookstores.map((bs) => (
              <View key={bs.id} style={styles.bookstoreCard}>
                <Ionicons name="storefront" size={32} color="#1a472a" />
                <View style={styles.bookstoreInfo}>
                  <Text style={styles.bookstoreName}>{bs.nome}</Text>
                  <Text style={styles.bookstoreDetail}>📍 {bs.indirizzo}, {bs.citta}</Text>
                  <Text style={styles.bookstoreDetail}>📧 {bs.email}</Text>
                  <Text style={styles.bookstoreDetail}>📞 {bs.telefono}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Downloads Tab */}
        {activeTab === 'downloads' && (
          <View style={styles.listContainer}>
            <Text style={styles.sectionTitle}>Download Liste Libri</Text>
            
            <View style={styles.downloadSection}>
              <Text style={styles.downloadSectionTitle}>📚 Anno Scolastico 2026/2027</Text>
              <Text style={styles.downloadDescription}>
                Liste complete delle adozioni per le 17 scuole di Catanzaro (5 medie + 12 superiori)
              </Text>
              
              <TouchableOpacity 
                style={[styles.downloadButton, downloading === 'pdf' && styles.downloadButtonDisabled]}
                disabled={downloading === 'pdf'}
                onPress={async () => {
                  try {
                    setDownloading('pdf');
                    const url = `${API_URL}/api/downloads/liste-pdf-2026-2027`;
                    
                    if (Platform.OS === 'web') {
                      // Direct link download
                      const link = document.createElement('a');
                      link.href = url;
                      link.target = '_blank';
                      link.rel = 'noopener noreferrer';
                      link.setAttribute('download', 'liste_libri_2026_2027.zip');
                      document.body.appendChild(link);
                      link.click();
                      setTimeout(() => {
                        document.body.removeChild(link);
                      }, 100);
                      setDownloading(null);
                    } else {
                      // Mobile: scarica e condividi
                      const filename = 'liste_libri_2026_2027.zip';
                      const fileUri = FileSystem.documentDirectory + filename;
                      
                      const downloadResult = await FileSystem.downloadAsync(url, fileUri);
                      
                      if (downloadResult.status === 200) {
                        const canShare = await Sharing.isAvailableAsync();
                        if (canShare) {
                          await Sharing.shareAsync(downloadResult.uri, {
                            mimeType: 'application/zip',
                            dialogTitle: 'Salva liste PDF'
                          });
                        } else {
                          Alert.alert('Successo', 'File scaricato in: ' + fileUri);
                        }
                      } else {
                        Alert.alert('Errore', 'Download fallito');
                      }
                      setDownloading(null);
                    }
                  } catch (error) {
                    console.error('Download error:', error);
                    Alert.alert('Errore', 'Impossibile scaricare il file');
                    setDownloading(null);
                  }
                }}
              >
                <Ionicons name="document" size={24} color="#fff" />
                <View style={styles.downloadButtonText}>
                  <Text style={styles.downloadButtonTitle}>
                    {downloading === 'pdf' ? 'Scaricamento...' : 'Scarica PDF (tutte le scuole)'}
                  </Text>
                  <Text style={styles.downloadButtonSubtitle}>17 file PDF in archivio ZIP • ~765 KB</Text>
                </View>
                {downloading === 'pdf' ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="download" size={20} color="#fff" />
                )}
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.downloadButton, styles.downloadButtonSecondary, downloading === 'csv2026' && styles.downloadButtonDisabled]}
                disabled={downloading === 'csv2026'}
                onPress={async () => {
                  try {
                    setDownloading('csv2026');
                    const url = `${API_URL}/api/downloads/lista-csv-2026-2027`;
                    
                    if (Platform.OS === 'web') {
                      window.open(url, '_blank');
                      setDownloading(null);
                    } else {
                      const filename = 'libri_catanzaro_2026_2027.csv';
                      const fileUri = FileSystem.documentDirectory + filename;
                      
                      const downloadResult = await FileSystem.downloadAsync(url, fileUri);
                      
                      if (downloadResult.status === 200) {
                        const canShare = await Sharing.isAvailableAsync();
                        if (canShare) {
                          await Sharing.shareAsync(downloadResult.uri, {
                            mimeType: 'text/csv',
                            dialogTitle: 'Salva lista CSV 2026/2027'
                          });
                        }
                      }
                      setDownloading(null);
                    }
                  } catch (error) {
                    Alert.alert('Errore', 'Impossibile scaricare il file');
                    setDownloading(null);
                  }
                }}
              >
                <Ionicons name="grid" size={24} color="#1a472a" />
                <View style={styles.downloadButtonText}>
                  <Text style={[styles.downloadButtonTitle, { color: '#1a472a' }]}>
                    {downloading === 'csv2026' ? 'Scaricamento...' : 'Scarica CSV 2026/2027'}
                  </Text>
                  <Text style={[styles.downloadButtonSubtitle, { color: '#666' }]}>6.397 libri • ~1 MB</Text>
                </View>
                {downloading === 'csv2026' ? (
                  <ActivityIndicator color="#1a472a" size="small" />
                ) : (
                  <Ionicons name="download" size={20} color="#1a472a" />
                )}
              </TouchableOpacity>
            </View>
            
            <View style={[styles.downloadSection, { marginTop: 20 }]}>
              <Text style={styles.downloadSectionTitle}>📖 Anno Scolastico 2025/2026</Text>
              <Text style={styles.downloadDescription}>
                Archivio storico delle adozioni per tutta la provincia di Catanzaro
              </Text>
              
              <TouchableOpacity 
                style={[styles.downloadButton, styles.downloadButtonSecondary, downloading === 'csv2025' && styles.downloadButtonDisabled]}
                disabled={downloading === 'csv2025'}
                onPress={async () => {
                  try {
                    setDownloading('csv2025');
                    const url = `${API_URL}/api/downloads/lista-csv-2025-2026`;
                    
                    if (Platform.OS === 'web') {
                      window.open(url, '_blank');
                      setDownloading(null);
                    } else {
                      const filename = 'libri_catanzaro_2025_2026.csv';
                      const fileUri = FileSystem.documentDirectory + filename;
                      
                      const downloadResult = await FileSystem.downloadAsync(url, fileUri);
                      
                      if (downloadResult.status === 200) {
                        const canShare = await Sharing.isAvailableAsync();
                        if (canShare) {
                          await Sharing.shareAsync(downloadResult.uri, {
                            mimeType: 'text/csv',
                            dialogTitle: 'Salva lista CSV 2025/2026'
                          });
                        }
                      }
                      setDownloading(null);
                    }
                  } catch (error) {
                    Alert.alert('Errore', 'Impossibile scaricare il file');
                    setDownloading(null);
                  }
                }}
              >
                <Ionicons name="archive" size={24} color="#1a472a" />
                <View style={styles.downloadButtonText}>
                  <Text style={[styles.downloadButtonTitle, { color: '#1a472a' }]}>
                    {downloading === 'csv2025' ? 'Scaricamento...' : 'Scarica CSV 2025/2026'}
                  </Text>
                  <Text style={[styles.downloadButtonSubtitle, { color: '#666' }]}>20.838 libri • ~3 MB</Text>
                </View>
                {downloading === 'csv2025' ? (
                  <ActivityIndicator color="#1a472a" size="small" />
                ) : (
                  <Ionicons name="download" size={20} color="#1a472a" />
                )}
              </TouchableOpacity>
            </View>
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
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loginCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  loginHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  loginTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a472a',
    marginTop: 12,
  },
  loginSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: '#fafafa',
  },
  loginButton: {
    backgroundColor: '#1a472a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    gap: 8,
  },
  backLinkText: {
    color: '#666',
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a472a',
    padding: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    gap: 4,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#1a472a',
  },
  tabText: {
    fontSize: 10,
    color: '#666',
  },
  tabTextActive: {
    color: '#1a472a',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    width: '48%',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  listContainer: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  emptyText: {
    textAlign: 'center',
    color: '#666',
    padding: 20,
  },
  requestCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  requestName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusPending: {
    backgroundColor: '#fff3e0',
  },
  statusApproved: {
    backgroundColor: '#e8f5e9',
  },
  statusRejected: {
    backgroundColor: '#ffebee',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  requestDetail: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  requestActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
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
    backgroundColor: '#f44336',
  },
  approveBtn: {
    backgroundColor: '#4CAF50',
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
  passwordBox: {
    backgroundColor: '#e8f5e9',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  passwordLabel: {
    fontSize: 12,
    color: '#666',
  },
  passwordValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a472a',
    marginTop: 4,
  },
  userCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 12,
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e8f5e9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  userEmail: {
    fontSize: 12,
    color: '#666',
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a472a',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginTop: 4,
    alignSelf: 'flex-start',
    gap: 4,
  },
  adminBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  orderCode: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  orderStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  orderStatusText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#666',
  },
  orderBook: {
    fontSize: 13,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  orderDetail: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  bookstoreCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 16,
  },
  bookstoreInfo: {
    flex: 1,
  },
  bookstoreName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  bookstoreDetail: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  downloadSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  downloadSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  downloadDescription: {
    fontSize: 13,
    color: '#666',
    marginBottom: 16,
    lineHeight: 18,
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a472a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  downloadButtonSecondary: {
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  downloadButtonDisabled: {
    opacity: 0.7,
  },
  downloadButtonText: {
    flex: 1,
  },
  downloadButtonTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  downloadButtonSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
});
