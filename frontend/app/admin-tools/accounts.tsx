import React, { useState, useEffect, useCallback } from 'react';
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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { SafeAreaView } from 'react-native-safe-area-context';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';

interface User {
  id: string;
  email: string;
  nome: string;
  cognome: string;
  username: string;
  is_admin: boolean;
  google_auth: boolean;
  created_at: string;
  profili_count: number;
}

interface Bookstore {
  id: string;
  nome: string;
  email: string;
  citta: string;
  indirizzo: string;
  status: string;
  created_at: string;
}

export default function AdminAccountsScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Tab state
  const [activeTab, setActiveTab] = useState<'users' | 'bookstores'>('users');
  
  // Users
  const [users, setUsers] = useState<User[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [usersLoading, setUsersLoading] = useState(false);
  
  // Bookstores
  const [bookstores, setBookstores] = useState<Bookstore[]>([]);
  const [bookstoresLoading, setBookstoresLoading] = useState(false);
  
  // Delete state
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    try {
      // Controlla prima admin_id (login da pannello admin) poi user_id (login utente normale)
      let storedUserId = await AsyncStorage.getItem('admin_id');
      if (!storedUserId) {
        storedUserId = await AsyncStorage.getItem('user_id');
      }
      
      if (!storedUserId) {
        router.replace('/admin');
        return;
      }
      setUserId(storedUserId);
      
      // Verifica admin
      const response = await axios.get(`${API_URL}/api/users/${storedUserId}`);
      if (!response.data.is_admin) {
        if (Platform.OS === 'web') {
          window.alert('Accesso negato: Non sei autorizzato ad accedere a questa pagina');
        } else {
          Alert.alert('Accesso negato', 'Non sei autorizzato ad accedere a questa pagina');
        }
        router.back();
        return;
      }
      
      setIsAdmin(true);
      loadData(storedUserId);
    } catch (error) {
      console.error('Error checking admin:', error);
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const loadData = async (adminId: string) => {
    await Promise.all([loadUsers(adminId), loadBookstores(adminId)]);
  };

  const loadUsers = async (adminId?: string) => {
    const id = adminId || userId;
    if (!id) return;
    
    setUsersLoading(true);
    try {
      const response = await axios.get(
        `${API_URL}/api/admin/users-list?admin_id=${id}&search=${encodeURIComponent(userSearch)}`
      );
      setUsers(response.data.users || []);
    } catch (error: any) {
      console.error('Error loading users:', error);
      showAlert('Errore', 'Impossibile caricare gli utenti');
    } finally {
      setUsersLoading(false);
    }
  };

  const loadBookstores = async (adminId?: string) => {
    const id = adminId || userId;
    if (!id) return;
    
    setBookstoresLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/admin/bookstores?admin_id=${id}`);
      setBookstores(response.data.bookstores || []);
    } catch (error: any) {
      console.error('Error loading bookstores:', error);
      showAlert('Errore', 'Impossibile caricare le cartolibrerie');
    } finally {
      setBookstoresLoading(false);
    }
  };

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const confirmDelete = (type: 'user' | 'bookstore', item: User | Bookstore) => {
    const name = type === 'user' 
      ? `${(item as User).nome} ${(item as User).cognome} (${item.email})`
      : `${(item as Bookstore).nome} (${item.email})`;
    
    const message = `Sei sicuro di voler eliminare ${type === 'user' ? "l'utente" : "la cartolibreria"}:\n\n${name}\n\nQuesta azione è irreversibile!`;
    
    if (Platform.OS === 'web') {
      if (window.confirm(message)) {
        handleDelete(type, item.id);
      }
    } else {
      Alert.alert(
        `Elimina ${type === 'user' ? 'Utente' : 'Cartolibreria'}`,
        message,
        [
          { text: 'Annulla', style: 'cancel' },
          { text: 'Elimina', style: 'destructive', onPress: () => handleDelete(type, item.id) }
        ]
      );
    }
  };

  const handleDelete = async (type: 'user' | 'bookstore', itemId: string) => {
    if (!userId) return;
    
    setDeleting(itemId);
    try {
      const endpoint = type === 'user' 
        ? `${API_URL}/api/admin/users/${itemId}?admin_id=${userId}`
        : `${API_URL}/api/admin/bookstores/${itemId}?admin_id=${userId}`;
      
      const response = await axios.delete(endpoint);
      
      showAlert('Eliminato', response.data.message);
      
      // Ricarica lista
      if (type === 'user') {
        loadUsers();
      } else {
        loadBookstores();
      }
    } catch (error: any) {
      console.error('Error deleting:', error);
      showAlert('Errore', error.response?.data?.detail || 'Impossibile eliminare');
    } finally {
      setDeleting(null);
    }
  };

  const handleResetPassword = async (bookstoreId: string, bookstoreName: string) => {
    if (!userId) return;
    
    const confirmMsg = `Vuoi resettare la password per "${bookstoreName}"?\n\nVerrà generata una nuova password.`;
    
    const doReset = async () => {
      setDeleting(bookstoreId); // Riuso lo stato per loading
      try {
        const response = await axios.post(
          `${API_URL}/api/admin/bookstores/${bookstoreId}/reset-password?admin_id=${userId}`
        );
        
        const newPassword = response.data.new_password;
        const email = response.data.email;
        
        showAlert(
          'Password Resettata',
          `Nuova password per ${bookstoreName}:\n\nEmail: ${email}\nPassword: ${newPassword}\n\nComunica queste credenziali alla cartolibreria.`
        );
      } catch (error: any) {
        console.error('Error resetting password:', error);
        showAlert('Errore', error.response?.data?.detail || 'Impossibile resettare la password');
      } finally {
        setDeleting(null);
      }
    };
    
    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) {
        doReset();
      }
    } else {
      Alert.alert(
        'Reset Password',
        confirmMsg,
        [
          { text: 'Annulla', style: 'cancel' },
          { text: 'Reset', onPress: doReset }
        ]
      );
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(userId!);
    setRefreshing(false);
  }, [userId]);

  // Fix ordini cartolibreria
  const handleFixBookstoreOrders = async () => {
    const confirmMsg = 'Questa operazione collegherà tutti gli ordini senza cartolibreria a Ni.Ca. s.a.s. Continuare?';
    
    const doFix = async () => {
      try {
        setLoading(true);
        const response = await axios.post(
          `${API_URL}/api/admin/fix-bookstore-orders?admin_id=${userId}`
        );
        
        showAlert(
          'Ordini Corretti',
          `Cartolibreria: ${response.data.bookstore.nome}\n\nOrdini corretti: ${response.data.orders_fixed}\nNotifiche corrette: ${response.data.notifications_fixed}\nTotale ordini: ${response.data.total_orders_for_bookstore}`
        );
      } catch (error: any) {
        console.error('Error fixing orders:', error);
        showAlert('Errore', error.response?.data?.detail || 'Impossibile correggere gli ordini');
      } finally {
        setLoading(false);
      }
    };
    
    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) {
        doFix();
      }
    } else {
      Alert.alert('Correggi Ordini', confirmMsg, [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Correggi', onPress: doFix }
      ]);
    }
  };

  // Debug cartolibrerie
  const handleDebugBookstores = async () => {
    try {
      setLoading(true);
      const response = await axios.get(
        `${API_URL}/api/admin/debug-bookstore-orders?admin_id=${userId}`
      );
      
      const data = response.data;
      let message = `CARTOLIBRERIE:\n`;
      data.bookstores.forEach((bs: any) => {
        message += `\n${bs.nome}\n  - Attiva: ${bs.affiliazione_attiva ? 'Sì' : 'No'}\n  - Ordini: ${bs.orders_count}\n  - Notifiche: ${bs.notifications_count}\n`;
      });
      message += `\nTOTALE ORDINI: ${data.total_orders}`;
      message += `\nORDINI SENZA CARTOLIBRERIA: ${data.orders_without_bookstore}`;
      message += `\n\nSTATI ORDINI:\n`;
      Object.entries(data.orders_by_status).forEach(([status, count]) => {
        message += `  ${status}: ${count}\n`;
      });
      
      showAlert('Debug Cartolibrerie', message);
    } catch (error: any) {
      console.error('Error debugging:', error);
      showAlert('Errore', error.response?.data?.detail || 'Errore nel debug');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a472a" />
      </View>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1a472a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Gestione Account</Text>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={24} color="#1a472a" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'users' && styles.tabActive]}
          onPress={() => setActiveTab('users')}
        >
          <Ionicons name="people" size={20} color={activeTab === 'users' ? '#fff' : '#1a472a'} />
          <Text style={[styles.tabText, activeTab === 'users' && styles.tabTextActive]}>
            Utenti ({users.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'bookstores' && styles.tabActive]}
          onPress={() => setActiveTab('bookstores')}
        >
          <Ionicons name="storefront" size={20} color={activeTab === 'bookstores' ? '#fff' : '#1a472a'} />
          <Text style={[styles.tabText, activeTab === 'bookstores' && styles.tabTextActive]}>
            Cartolibrerie ({bookstores.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {activeTab === 'users' ? (
          <>
            {/* Search */}
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color="#666" />
              <TextInput
                style={styles.searchInput}
                placeholder="Cerca per email, nome o username..."
                value={userSearch}
                onChangeText={setUserSearch}
                onSubmitEditing={() => loadUsers()}
                returnKeyType="search"
              />
              {userSearch ? (
                <TouchableOpacity onPress={() => { setUserSearch(''); loadUsers(); }}>
                  <Ionicons name="close-circle" size={20} color="#666" />
                </TouchableOpacity>
              ) : null}
            </View>

            {usersLoading ? (
              <ActivityIndicator size="large" color="#1a472a" style={{ marginTop: 40 }} />
            ) : users.length === 0 ? (
              <Text style={styles.emptyText}>Nessun utente trovato</Text>
            ) : (
              users.map((user) => (
                <View key={user.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardIcon}>
                      <Ionicons 
                        name={user.google_auth ? "logo-google" : "person"} 
                        size={24} 
                        color={user.is_admin ? "#f59e0b" : "#1a472a"} 
                      />
                    </View>
                    <View style={styles.cardInfo}>
                      <Text style={styles.cardTitle}>
                        {user.nome} {user.cognome}
                        {user.is_admin && <Text style={styles.adminBadge}> (Admin)</Text>}
                      </Text>
                      <Text style={styles.cardEmail}>{user.email}</Text>
                      <Text style={styles.cardMeta}>
                        @{user.username} • {user.profili_count} profili • {formatDate(user.created_at)}
                      </Text>
                    </View>
                  </View>
                  
                  {!user.is_admin && (
                    <TouchableOpacity
                      style={[styles.deleteBtn, deleting === user.id && styles.deleteBtnDisabled]}
                      onPress={() => confirmDelete('user', user)}
                      disabled={deleting === user.id}
                    >
                      {deleting === user.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="trash" size={16} color="#fff" />
                          <Text style={styles.deleteBtnText}>Elimina</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </>
        ) : (
          <>
            {/* Pulsanti di manutenzione */}
            <View style={styles.maintenanceButtons}>
              <TouchableOpacity
                style={styles.debugBtn}
                onPress={handleDebugBookstores}
              >
                <Ionicons name="bug" size={18} color="#fff" />
                <Text style={styles.debugBtnText}>Debug Ordini</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.fixBtn}
                onPress={handleFixBookstoreOrders}
              >
                <Ionicons name="hammer" size={18} color="#fff" />
                <Text style={styles.fixBtnText}>Correggi Ordini</Text>
              </TouchableOpacity>
            </View>
            
            {bookstoresLoading ? (
              <ActivityIndicator size="large" color="#1a472a" style={{ marginTop: 40 }} />
            ) : bookstores.length === 0 ? (
              <Text style={styles.emptyText}>Nessuna cartolibreria registrata</Text>
            ) : (
              bookstores.map((bs) => (
                <View key={bs.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={[styles.cardIcon, { backgroundColor: '#e8f5e9' }]}>
                      <Ionicons name="storefront" size={24} color="#2e7d32" />
                    </View>
                    <View style={styles.cardInfo}>
                      <Text style={styles.cardTitle}>{bs.nome}</Text>
                      <Text style={styles.cardEmail}>{bs.email}</Text>
                      <Text style={styles.cardMeta}>
                        {bs.citta} • {bs.indirizzo?.substring(0, 30)}...
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={[styles.resetBtn, deleting === bs.id && styles.deleteBtnDisabled]}
                      onPress={() => handleResetPassword(bs.id, bs.nome)}
                      disabled={deleting === bs.id}
                    >
                      <Ionicons name="key" size={16} color="#fff" />
                      <Text style={styles.resetBtnText}>Reset Password</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={[styles.deleteBtn, deleting === bs.id && styles.deleteBtnDisabled]}
                      onPress={() => confirmDelete('bookstore', bs)}
                      disabled={deleting === bs.id}
                    >
                      {deleting === bs.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="trash" size={16} color="#fff" />
                          <Text style={styles.deleteBtnText}>Elimina</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </>
        )}
        
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
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
  backBtn: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a472a',
  },
  refreshBtn: {
    padding: 8,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  tabActive: {
    backgroundColor: '#1a472a',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a472a',
  },
  tabTextActive: {
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    fontSize: 15,
  },
  emptyText: {
    textAlign: 'center',
    color: '#666',
    fontSize: 15,
    marginTop: 40,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  adminBadge: {
    color: '#f59e0b',
    fontWeight: '700',
  },
  cardEmail: {
    fontSize: 14,
    color: '#1a472a',
    marginTop: 2,
  },
  cardMeta: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#ef4444',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    flex: 1,
  },
  deleteBtnDisabled: {
    backgroundColor: '#ccc',
  },
  deleteBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 10,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    flex: 1,
  },
  resetBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  maintenanceButtons: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  debugBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#6366f1',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  debugBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  fixBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#f59e0b',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  fixBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
