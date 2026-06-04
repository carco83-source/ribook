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
  TextInput,
  Modal,
  Platform,
} from 'react-native';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import QRCode from 'react-native-qrcode-svg';

// Conditional import for camera (not available on web)
let CameraView: any = null;
let useCameraPermissions: any = () => [{ granted: false }, () => {}];

if (Platform.OS !== 'web') {
  try {
    const camera = require('expo-camera');
    CameraView = camera.CameraView;
    useCameraPermissions = camera.useCameraPermissions;
  } catch (e) {
    console.log('Camera not available');
  }
}

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Order {
  id: string;
  order_code: string;
  buyer_id: string;
  buyer_name: string;
  seller_name: string;
  book_titolo: string;
  book_autore: string;
  totale_acquirente: number;
  status: string;
  status_label: string;
  created_at: string;
  ready_for_pickup_at?: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  paid_escrow: { label: 'In arrivo', color: '#2196F3', icon: 'time-outline' },
  delivering_to_bookstore: { label: 'In consegna', color: '#9C27B0', icon: 'car-outline' },
  ready_for_pickup: { label: 'Pronto ritiro', color: '#4CAF50', icon: 'checkmark-circle-outline' },
};

export default function BookstorePortalScreen() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bookstoreId, setBookstoreId] = useState<string | null>(null);
  const [bookstoreName, setBookstoreName] = useState<string>('');
  const [orders, setOrders] = useState<Order[]>([]);
  
  // Login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  
  // Scanner state
  const [showScanner, setShowScanner] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [confirmingPickup, setConfirmingPickup] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  
  // Notifications state
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  
  // Returns state
  const [pendingReturns, setPendingReturns] = useState<any[]>([]);
  const [showReturnsModal, setShowReturnsModal] = useState(false);
  const [processingReturn, setProcessingReturn] = useState(false);
  
  // Expanded notifications state
  const [expandedNotifications, setExpandedNotifications] = useState<Set<string>>(new Set());

  useEffect(() => {
    checkLoginStatus();
  }, []);

  const checkLoginStatus = async () => {
    try {
      const storedBookstoreId = await AsyncStorage.getItem('bookstore_id');
      const storedBookstoreName = await AsyncStorage.getItem('bookstore_name');
      
      if (storedBookstoreId) {
        setBookstoreId(storedBookstoreId);
        setBookstoreName(storedBookstoreName || '');
        setIsLoggedIn(true);
        await loadOrders(storedBookstoreId);
      }
    } catch (error) {
      console.error('Error checking login:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadOrders = async (bsId: string) => {
    try {
      const response = await axios.get(`${API_URL}/api/bookstore/${bsId}/orders`);
      setOrders(response.data.orders || []);
      setBookstoreName(response.data.bookstore_name || '');
      
      // Carica anche le notifiche e i resi in attesa
      await loadNotifications(bsId);
      await loadPendingReturns(bsId);
    } catch (error) {
      console.error('Error loading orders:', error);
    } finally {
      setRefreshing(false);
    }
  };
  
  const loadNotifications = async (bsId: string) => {
    try {
      const response = await axios.get(`${API_URL}/api/bookstore/${bsId}/notifications`);
      setNotifications(response.data.notifications || []);
      setUnreadCount(response.data.unread_count || 0);
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  };
  
  const loadPendingReturns = async (bsId: string) => {
    try {
      const response = await axios.get(`${API_URL}/api/bookstore/${bsId}/pending-returns`);
      setPendingReturns(response.data.returns || []);
    } catch (error) {
      console.error('Error loading pending returns:', error);
    }
  };
  
  const handleVerifyReturn = async (orderId: string, accepted: boolean, notificationId?: string) => {
    const actionText = accepted ? 'accettare' : 'rifiutare';
    const confirmText = accepted 
      ? 'Confermi che il libro NON corrisponde alla descrizione? L\'acquirente riceverà un rimborso.'
      : 'Confermi che il libro corrisponde alla descrizione? Il venditore riceverà il pagamento.';
    
    // Usa window.confirm su web, Alert.alert su mobile
    const doVerify = async () => {
      setProcessingReturn(true);
      try {
        await axios.post(
          `${API_URL}/api/orders/${orderId}/verify-return?bookstore_id=${bookstoreId}&accepted=${accepted}&notes=`
        );
        
        // Segna la notifica come letta
        if (notificationId && bookstoreId) {
          try {
            await axios.put(`${API_URL}/api/bookstore/${bookstoreId}/notifications/${notificationId}/read`);
          } catch (e) {
            console.log('Error marking notification as read:', e);
          }
        }
        
        const successMsg = accepted 
          ? 'Reso accettato. L\'acquirente riceverà il rimborso.'
          : 'Reso rifiutato. Il venditore riceverà il pagamento.';
        
        if (Platform.OS === 'web') {
          window.alert(successMsg);
        } else {
          Alert.alert('Reso verificato', successMsg, [{ text: 'OK' }]);
        }
        
        // Ricarica resi e notifiche
        if (bookstoreId) {
          await loadPendingReturns(bookstoreId);
          await loadNotifications(bookstoreId);
        }
      } catch (error: any) {
        const errorMsg = error.response?.data?.detail || 'Errore nella verifica';
        if (Platform.OS === 'web') {
          window.alert('Errore: ' + errorMsg);
        } else {
          Alert.alert('Errore', errorMsg);
        }
      } finally {
        setProcessingReturn(false);
      }
    };
    
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(`Conferma ${actionText} reso\n\n${confirmText}`);
      if (confirmed) {
        await doVerify();
      }
    } else {
      Alert.alert(
        `Conferma ${actionText} reso`,
        confirmText,
        [
          { text: 'Annulla', style: 'cancel' },
          {
            text: accepted ? 'Accetta reso' : 'Rifiuta reso',
            style: accepted ? 'destructive' : 'default',
            onPress: doVerify,
          },
        ]
      );
    }
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Errore', 'Inserisci email e password');
      return;
    }

    setLoginLoading(true);
    try {
      const response = await axios.post(
        `${API_URL}/api/bookstore/login?email=${encodeURIComponent(email.toLowerCase())}&password=${encodeURIComponent(password)}`
      );
      
      await AsyncStorage.setItem('bookstore_id', response.data.bookstore_id);
      await AsyncStorage.setItem('bookstore_name', response.data.nome);
      
      setBookstoreId(response.data.bookstore_id);
      setBookstoreName(response.data.nome);
      setIsLoggedIn(true);
      
      await loadOrders(response.data.bookstore_id);
    } catch (error: any) {
      Alert.alert('Errore', error.response?.data?.detail || 'Credenziali non valide');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Vuoi uscire dal portale cartolibreria?',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Esci',
          onPress: async () => {
            await AsyncStorage.removeItem('bookstore_id');
            await AsyncStorage.removeItem('bookstore_name');
            setIsLoggedIn(false);
            setBookstoreId(null);
            setEmail('');
            setPassword('');
          },
        },
      ]
    );
  };

  const handleConfirmPickup = async (code: string) => {
    if (!code.trim()) {
      if (Platform.OS === 'web') {
        window.alert('Inserisci il codice ordine');
      } else {
        Alert.alert('Errore', 'Inserisci il codice ordine');
      }
      return;
    }

    setConfirmingPickup(true);
    try {
      // Prima prova la consegna del venditore (paid_escrow -> ready_for_pickup)
      try {
        const response = await axios.post(
          `${API_URL}/api/bookstore/${bookstoreId}/confirm-seller-delivery?order_code=${code.toUpperCase()}`
        );
        
        const msg = `✅ CONSEGNA VENDITORE CONFERMATA!\n\nOrdine: ${response.data.order_code}\n${response.data.book_titolo}\n\nL'acquirente ${response.data.buyer_name} è stato notificato che può ritirare.`;
        
        if (Platform.OS === 'web') {
          window.alert(msg);
        } else {
          Alert.alert('Consegna confermata!', msg, [{ text: 'OK' }]);
        }
        
        setShowScanner(false);
        setManualCode('');
        await loadOrders(bookstoreId!);
        return;
      } catch (sellerError: any) {
        // Se non è in stato paid_escrow, prova il ritiro acquirente
        if (sellerError.response?.status === 400) {
          // Prova la conferma ritiro acquirente
          const response = await axios.post(
            `${API_URL}/api/bookstore/${bookstoreId}/confirm-pickup-by-code?order_code=${code.toUpperCase()}`
          );
          
          const msg = `✅ RITIRO ACQUIRENTE CONFERMATO!\n\nOrdine: ${response.data.order_code}\n${response.data.book_titolo}\n\nAcquirente: ${response.data.buyer_name}\n\n💰 Pagamento rilasciato al venditore!`;
          
          if (Platform.OS === 'web') {
            window.alert(msg);
          } else {
            Alert.alert('Ritiro confermato!', msg, [{ text: 'OK' }]);
          }
          
          setShowScanner(false);
          setManualCode('');
          await loadOrders(bookstoreId!);
          return;
        }
        throw sellerError;
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || 'Codice non valido o ordine non trovato';
      if (Platform.OS === 'web') {
        window.alert('Errore: ' + errorMsg);
      } else {
        Alert.alert('Errore', errorMsg);
      }
    } finally {
      setConfirmingPickup(false);
    }
  };

  const handleMarkReady = async (orderId: string) => {
    try {
      await axios.post(`${API_URL}/api/bookstore/${bookstoreId}/mark-ready/${orderId}`);
      Alert.alert('Fatto!', 'Ordine segnato come pronto per il ritiro');
      await loadOrders(bookstoreId!);
    } catch (error: any) {
      Alert.alert('Errore', error.response?.data?.detail || 'Errore');
    }
  };

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    console.log('=== QR CODE DETECTED ===');
    console.log('Data:', data);
    console.log('========================');
    
    setShowScanner(false);
    handleConfirmPickup(data);
  };

  const getStatusConfig = (status: string) => {
    return STATUS_CONFIG[status] || { label: status, color: '#666', icon: 'help-circle-outline' };
  };

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/profile');
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen
          options={{
            title: 'Portale Cartolibreria',
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

  // Login Screen
  if (!isLoggedIn) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.loginContainer}>
        <Stack.Screen
          options={{
            title: 'Accesso Cartolibreria',
            headerStyle: { backgroundColor: '#1a472a' },
            headerTintColor: '#fff',
            headerLeft: () => (
              <TouchableOpacity onPress={handleGoBack} style={{ paddingHorizontal: 16 }}>
                <Ionicons name="arrow-back" size={24} color="#fff" />
              </TouchableOpacity>
            ),
          }}
        />

        <View style={styles.loginCard}>
          <Ionicons name="storefront" size={64} color="#1a472a" />
          <Text style={styles.loginTitle}>Portale Cartolibreria</Text>
          <Text style={styles.loginSubtitle}>Accedi per gestire gli ordini</Text>

          <View style={styles.inputContainer}>
            <Ionicons name="mail-outline" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            style={[styles.loginButton, loginLoading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={loginLoading}
          >
            {loginLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="log-in-outline" size={20} color="#fff" />
                <Text style={styles.loginButtonText}>Accedi</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.registerLink}
            onPress={() => router.push('/bookstore-register')}
          >
            <Text style={styles.registerLinkText}>Non hai un account? Richiedi accesso</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // Dashboard
  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: bookstoreName || 'Portale Cartolibreria',
          headerStyle: { backgroundColor: '#1a472a' },
          headerTintColor: '#fff',
          headerLeft: () => (
            <TouchableOpacity onPress={handleGoBack} style={{ paddingHorizontal: 16 }}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity onPress={handleLogout} style={{ paddingHorizontal: 16 }}>
              <Ionicons name="log-out-outline" size={24} color="#fff" />
            </TouchableOpacity>
          ),
        }}
      />

      {/* Scan Button */}
      <TouchableOpacity
        style={styles.scanButton}
        onPress={() => setShowScanner(true)}
      >
        <Ionicons name="qr-code" size={24} color="#fff" />
        <Text style={styles.scanButtonText}>Scansiona QR / Inserisci Codice</Text>
      </TouchableOpacity>

      {/* Orders List */}
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadOrders(bookstoreId!);
            }}
          />
        }
      >
        {/* Notifiche Section */}
        {notifications.length > 0 && (
          <View style={styles.notificationsSection}>
            <View style={styles.notificationHeader}>
              <Ionicons name="notifications" size={20} color="#FF9800" />
              <Text style={styles.notificationTitle}>
                Notifiche {unreadCount > 0 && `(${unreadCount} nuove)`}
              </Text>
            </View>
            {notifications.slice(0, 5).map((notif) => {
              const isCompleted = notif.type === 'order_completed';
              const isReturnRequest = notif.type === 'return_request';
              const isExpanded = expandedNotifications.has(notif.id);
              
              const toggleExpand = () => {
                const newExpanded = new Set(expandedNotifications);
                if (isExpanded) {
                  newExpanded.delete(notif.id);
                } else {
                  newExpanded.add(notif.id);
                }
                setExpandedNotifications(newExpanded);
              };
              
              return (
                <TouchableOpacity
                  key={notif.id} 
                  style={[
                    styles.notificationCard,
                    !notif.read && styles.notificationUnread,
                    isCompleted && styles.notificationCompleted,
                    isReturnRequest && styles.notificationReturn,
                    isExpanded && styles.notificationExpanded
                  ]}
                  onPress={toggleExpand}
                  activeOpacity={0.8}
                >
                  <View style={styles.notificationHeader}>
                    <View style={[
                      styles.notificationIcon, 
                      isCompleted && { backgroundColor: '#e8f5e9' },
                      isReturnRequest && { backgroundColor: '#ffebee' }
                    ]}>
                      <Ionicons 
                        name={isCompleted ? "checkmark-circle" : isReturnRequest ? "arrow-undo" : "cube"} 
                        size={20} 
                        color={isCompleted ? "#4CAF50" : isReturnRequest ? "#f44336" : "#FF9800"} 
                      />
                    </View>
                    <View style={styles.notificationContent}>
                      <Text style={[
                        styles.notificationTitleText, 
                        isCompleted && { color: '#4CAF50' },
                        isReturnRequest && { color: '#f44336' }
                      ]}>
                        {notif.title}
                      </Text>
                      {!isExpanded && (
                        <Text style={styles.notificationMessage} numberOfLines={2}>
                          {notif.message}
                        </Text>
                      )}
                    </View>
                    <Ionicons 
                      name={isExpanded ? "chevron-up" : "chevron-down"} 
                      size={20} 
                      color="#666" 
                    />
                  </View>
                  
                  {/* Contenuto espanso */}
                  {isExpanded && (
                    <View style={styles.notificationExpandedContent}>
                      {/* Messaggio completo */}
                      <Text style={styles.notificationFullMessage}>
                        {notif.message}
                      </Text>
                      
                      {/* QR Code */}
                      {notif.order_code && (
                        <View style={styles.qrCodeContainer}>
                          <Text style={styles.qrCodeLabel}>Codice ordine</Text>
                          <View style={styles.qrCodeWrapper}>
                            <QRCode
                              value={notif.order_code}
                              size={120}
                              backgroundColor="#fff"
                            />
                          </View>
                          <View style={[
                            styles.notificationCodeBadge, 
                            isCompleted && { backgroundColor: '#e8f5e9' },
                            isReturnRequest && { backgroundColor: '#ffebee' }
                          ]}>
                            <Text style={[
                              styles.notificationCodeText, 
                              isCompleted && { color: '#4CAF50' },
                              isReturnRequest && { color: '#f44336' }
                            ]}>
                              {notif.order_code}
                            </Text>
                          </View>
                        </View>
                      )}
                      
                      {/* Dettagli libro per richieste reso */}
                      {isReturnRequest && notif.book_details && (
                        <View style={styles.bookDetailsContainer}>
                          <Text style={styles.bookDetailsTitle}>Condizioni dichiarate del libro:</Text>
                          
                          {notif.book_details.condition_answers && (
                            <View style={styles.conditionsList}>
                              {notif.book_details.condition_answers.sottolineature !== undefined && (
                                <View style={styles.conditionRow}>
                                  <Ionicons name="pencil" size={16} color="#666" />
                                  <Text style={styles.conditionLabel}>Scritte/evidenziature:</Text>
                                  <Text style={styles.conditionValue}>
                                    {['Nessuna', 'Poche', 'Molte'][notif.book_details.condition_answers.sottolineature] || 'N/D'}
                                  </Text>
                                </View>
                              )}
                              {notif.book_details.condition_answers.copertina !== undefined && (
                                <View style={styles.conditionRow}>
                                  <Ionicons name="book" size={16} color="#666" />
                                  <Text style={styles.conditionLabel}>Copertina rovinata:</Text>
                                  <Text style={styles.conditionValue}>
                                    {['No', 'Un po\'', 'Molto'][notif.book_details.condition_answers.copertina] || 'N/D'}
                                  </Text>
                                </View>
                              )}
                              {notif.book_details.condition_answers.pagine !== undefined && (
                                <View style={styles.conditionRow}>
                                  <Ionicons name="document-text" size={16} color="#666" />
                                  <Text style={styles.conditionLabel}>Pagine piegate:</Text>
                                  <Text style={styles.conditionValue}>
                                    {['Nessuna', 'Qualcuna', 'Molte'][notif.book_details.condition_answers.pagine] || 'N/D'}
                                  </Text>
                                </View>
                              )}
                              {notif.book_details.condition_answers.esercizi !== undefined && (
                                <View style={styles.conditionRow}>
                                  <Ionicons name="create" size={16} color="#666" />
                                  <Text style={styles.conditionLabel}>Esercizi compilati:</Text>
                                  <Text style={styles.conditionValue}>
                                    {['No', 'Qualcuno', 'Molti'][notif.book_details.condition_answers.esercizi] || 'N/D'}
                                  </Text>
                                </View>
                              )}
                            </View>
                          )}
                          
                          {notif.book_details.note && (
                            <View style={styles.noteContainer}>
                              <Text style={styles.noteLabel}>Note del venditore:</Text>
                              <Text style={styles.noteText}>{notif.book_details.note}</Text>
                            </View>
                          )}
                          
                          {notif.return_reason && (
                            <View style={styles.returnReasonContainer}>
                              <Text style={styles.returnReasonLabel}>Motivo del reso:</Text>
                              <Text style={styles.returnReasonText}>{notif.return_reason}</Text>
                            </View>
                          )}
                        </View>
                      )}
                      
                      {isCompleted && notif.commissione_cartolibreria && (
                        <View style={styles.earningsBadge}>
                          <Ionicons name="cash" size={14} color="#4CAF50" />
                          <Text style={styles.earningsText}>
                            Ricavato: €{notif.commissione_cartolibreria.toFixed(2)}
                          </Text>
                        </View>
                      )}
                      
                      {/* Pulsanti Accetta/Rifiuta per richieste reso */}
                      {isReturnRequest && notif.order_id && (
                        <View style={styles.returnActionButtons}>
                          <TouchableOpacity
                            style={[styles.returnActionBtn, styles.returnRejectBtn]}
                            onPress={() => handleVerifyReturn(notif.order_id, false, notif.id)}
                          >
                            <Ionicons name="close" size={18} color="#fff" />
                            <Text style={styles.returnActionBtnText}>Rifiuta reso</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.returnActionBtn, styles.returnAcceptBtn]}
                            onPress={() => handleVerifyReturn(notif.order_id, true, notif.id)}
                          >
                            <Ionicons name="checkmark" size={18} color="#fff" />
                            <Text style={styles.returnActionBtnText}>Accetta reso</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        
        {/* Resi in Attesa Section */}
        {pendingReturns.length > 0 && (
          <View style={styles.returnsSection}>
            <View style={styles.returnsSectionHeader}>
              <Ionicons name="arrow-undo" size={20} color="#f44336" />
              <Text style={styles.returnsSectionTitle}>
                Resi da verificare ({pendingReturns.length})
              </Text>
            </View>
            {pendingReturns.map((returnItem) => (
              <View key={returnItem.id} style={styles.returnCard}>
                <View style={styles.returnCardHeader}>
                  <Text style={styles.returnBookTitle}>{returnItem.book_titolo}</Text>
                  <Text style={styles.returnOrderCode}>#{returnItem.order_code}</Text>
                </View>
                <Text style={styles.returnReason}>
                  Motivo: {returnItem.return_reason || 'Condizioni non conformi'}
                </Text>
                <Text style={styles.returnBuyer}>
                  Acquirente: {returnItem.buyer_name}
                </Text>
                <View style={styles.returnActions}>
                  <TouchableOpacity
                    style={[styles.returnActionBtn, styles.returnRejectBtn]}
                    onPress={() => handleVerifyReturn(returnItem.id, false)}
                    disabled={processingReturn}
                  >
                    <Ionicons name="close" size={18} color="#fff" />
                    <Text style={styles.returnActionText}>Rifiuta</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.returnActionBtn, styles.returnAcceptBtn]}
                    onPress={() => handleVerifyReturn(returnItem.id, true)}
                    disabled={processingReturn}
                  >
                    <Ionicons name="checkmark" size={18} color="#fff" />
                    <Text style={styles.returnActionText}>Accetta</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
        
        {/* Totale Ricavato */}
        {orders.filter(o => o.status === 'completed').length > 0 && (
          <View style={styles.totalEarningsCard}>
            <Ionicons name="wallet" size={24} color="#4CAF50" />
            <View style={styles.totalEarningsContent}>
              <Text style={styles.totalEarningsLabel}>Totale Ricavato (5%)</Text>
              <Text style={styles.totalEarningsValue}>
                €{orders
                  .filter(o => o.status === 'completed')
                  .reduce((sum, o) => sum + (o.commissione_cartolibreria || 0), 0)
                  .toFixed(2)}
              </Text>
            </View>
          </View>
        )}
        
        <Text style={styles.sectionTitle}>Ordini ({orders.length})</Text>

        {orders.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="receipt-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>Nessun ordine al momento</Text>
          </View>
        ) : (
          orders.map((order) => {
            const statusConfig = getStatusConfig(order.status);
            return (
              <View key={order.id} style={styles.orderCard}>
                <View style={styles.orderHeader}>
                  <View style={[styles.statusBadge, { backgroundColor: statusConfig.color }]}>
                    <Ionicons name={statusConfig.icon as any} size={14} color="#fff" />
                    <Text style={styles.statusText}>{statusConfig.label}</Text>
                  </View>
                  <Text style={styles.orderCode}>{order.order_code}</Text>
                </View>

                <Text style={styles.bookTitle}>{order.book_titolo}</Text>
                {order.book_autore && (
                  <Text style={styles.bookAuthor}>{order.book_autore}</Text>
                )}

                <View style={styles.orderDetails}>
                  <View style={styles.detailRow}>
                    <Ionicons name="person" size={16} color="#666" />
                    <Text style={styles.detailText}>Acquirente: {order.buyer_name}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Ionicons name="cash" size={16} color="#666" />
                    <Text style={styles.detailText}>€{order.totale_acquirente.toFixed(2)}</Text>
                  </View>
                </View>

                {/* Actions */}
                {order.status === 'delivering_to_bookstore' && (
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleMarkReady(order.id)}
                  >
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                    <Text style={styles.actionButtonText}>Segna come pronto</Text>
                  </TouchableOpacity>
                )}

                {order.status === 'ready_for_pickup' && (
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: '#4CAF50' }]}
                    onPress={() => handleConfirmPickup(order.order_code)}
                  >
                    <Ionicons name="bag-check" size={20} color="#fff" />
                    <Text style={styles.actionButtonText}>Conferma ritiro</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Scanner Modal */}
      <Modal
        visible={showScanner}
        animationType="slide"
        onRequestClose={() => setShowScanner(false)}
      >
        <View style={styles.scannerContainer}>
          <View style={styles.scannerHeader}>
            <Text style={styles.scannerTitle}>Scansiona QR o inserisci codice</Text>
            <TouchableOpacity onPress={() => setShowScanner(false)}>
              <Ionicons name="close" size={28} color="#333" />
            </TouchableOpacity>
          </View>

          {permission?.granted ? (
            <View style={styles.cameraContainer}>
              <CameraView
                style={styles.camera}
                facing="back"
                onBarcodeScanned={handleBarCodeScanned}
                barcodeScannerSettings={{
                  barcodeTypes: ['qr', 'aztec', 'datamatrix', 'code128', 'code39'],
                  interval: 500,
                }}
              />
              <View style={styles.cameraOverlay}>
                <View style={styles.scanFrame} />
                <Text style={styles.scanHint}>Inquadra il QR code</Text>
              </View>
            </View>
          ) : (
            <View style={styles.permissionContainer}>
              <Ionicons name="camera-outline" size={64} color="#ccc" />
              <Text style={styles.permissionText}>Permesso fotocamera non concesso</Text>
              <TouchableOpacity
                style={styles.permissionButton}
                onPress={requestPermission}
              >
                <Text style={styles.permissionButtonText}>Concedi permesso</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.manualInputContainer}>
            <Text style={styles.manualInputLabel}>Oppure inserisci il codice manualmente:</Text>
            <View style={styles.manualInputRow}>
              <TextInput
                style={styles.manualInput}
                placeholder="Es. A1B2C3"
                value={manualCode}
                onChangeText={setManualCode}
                autoCapitalize="characters"
                maxLength={6}
              />
              <TouchableOpacity
                style={[styles.confirmButton, confirmingPickup && styles.confirmButtonDisabled]}
                onPress={() => handleConfirmPickup(manualCode)}
                disabled={confirmingPickup || !manualCode.trim()}
              >
                {confirmingPickup ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="checkmark" size={24} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  loginContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  loginCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  loginTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a472a',
    marginTop: 16,
  },
  loginSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    marginBottom: 24,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 12,
    width: '100%',
  },
  inputIcon: {
    padding: 14,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    paddingRight: 14,
    fontSize: 16,
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a472a',
    padding: 16,
    borderRadius: 12,
    width: '100%',
    marginTop: 8,
    gap: 8,
  },
  loginButtonDisabled: {
    backgroundColor: '#ccc',
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  registerLink: {
    marginTop: 20,
  },
  registerLinkText: {
    color: '#1a472a',
    fontSize: 14,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a472a',
    padding: 16,
    margin: 16,
    borderRadius: 12,
    gap: 10,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
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
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  orderCode: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a472a',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  bookTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  bookAuthor: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  orderDetails: {
    marginTop: 12,
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 14,
    color: '#666',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#9C27B0',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    gap: 8,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Scanner Modal
  scannerContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  scannerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: 250,
    height: 250,
    borderWidth: 3,
    borderColor: '#1a472a',
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  scanHint: {
    color: '#fff',
    fontSize: 16,
    marginTop: 20,
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  permissionText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
    textAlign: 'center',
  },
  permissionButton: {
    backgroundColor: '#1a472a',
    padding: 14,
    borderRadius: 8,
    marginTop: 16,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  manualInputContainer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#f8f9fa',
  },
  manualInputLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  manualInputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  manualInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 14,
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  confirmButton: {
    backgroundColor: '#4CAF50',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: '#ccc',
  },
  // Notification styles
  notificationsSection: {
    backgroundColor: '#fff3e0',
    margin: 16,
    marginBottom: 8,
    borderRadius: 12,
    padding: 16,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#e65100',
  },
  notificationCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#FF9800',
  },
  notificationUnread: {
    backgroundColor: '#fffde7',
    borderLeftColor: '#f44336',
  },
  notificationIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff3e0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  notificationMessage: {
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
  },
  notificationCodeBadge: {
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  notificationCodeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a472a',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  notificationCompleted: {
    backgroundColor: '#e8f5e9',
    borderLeftColor: '#4CAF50',
  },
  earningsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#c8e6c9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 8,
    gap: 6,
  },
  earningsText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2e7d32',
  },
  totalEarningsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    margin: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  totalEarningsContent: {
    flex: 1,
  },
  totalEarningsLabel: {
    fontSize: 12,
    color: '#666',
  },
  totalEarningsValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  // Returns section styles
  returnsSection: {
    margin: 16,
    marginBottom: 8,
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    padding: 12,
    borderWidth: 2,
    borderColor: '#f44336',
  },
  returnsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  returnsSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#f44336',
  },
  returnCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#f44336',
  },
  returnCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  returnBookTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  returnOrderCode: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  returnReason: {
    fontSize: 13,
    color: '#f44336',
    marginBottom: 4,
    fontStyle: 'italic',
  },
  returnBuyer: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
  },
  returnActions: {
    flexDirection: 'row',
    gap: 12,
  },
  returnActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderRadius: 8,
    gap: 6,
  },
  returnRejectBtn: {
    backgroundColor: '#9e9e9e',
  },
  returnAcceptBtn: {
    backgroundColor: '#f44336',
  },
  returnActionText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  // Stili per pulsanti nella notifica
  returnActionButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#ffcdd2',
  },
  returnActionBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  // Stile notifica reso
  notificationReturn: {
    borderLeftColor: '#f44336',
    borderLeftWidth: 4,
    backgroundColor: '#fff8f8',
  },
  // Stili per notifiche espandibili
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  notificationExpanded: {
    borderWidth: 2,
    borderColor: '#1a472a',
  },
  notificationExpandedContent: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  notificationFullMessage: {
    fontSize: 14,
    color: '#333',
    lineHeight: 22,
    marginBottom: 16,
  },
  qrCodeContainer: {
    alignItems: 'center',
    marginBottom: 16,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  qrCodeLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
  },
  qrCodeWrapper: {
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  bookDetailsContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  bookDetailsTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  conditionsList: {
    gap: 10,
  },
  conditionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  conditionLabel: {
    fontSize: 13,
    color: '#666',
    flex: 1,
  },
  conditionValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  noteContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  noteLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  noteText: {
    fontSize: 13,
    color: '#333',
    fontStyle: 'italic',
  },
  returnReasonContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#ffebee',
    borderRadius: 8,
  },
  returnReasonLabel: {
    fontSize: 12,
    color: '#f44336',
    fontWeight: '600',
    marginBottom: 4,
  },
  returnReasonText: {
    fontSize: 14,
    color: '#c62828',
    fontWeight: '500',
  },
});
