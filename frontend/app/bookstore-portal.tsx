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
  useWindowDimensions,
  Image,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

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

// Calcola giorni lavorativi rimanenti (esclude sabato e domenica)
const getWorkingDaysRemaining = (deadline: string): { days: number; hours: number; expired: boolean; urgency: 'ok' | 'warning' | 'danger' } => {
  const now = new Date();
  const deadlineDate = new Date(deadline);
  const diff = deadlineDate.getTime() - now.getTime();
  
  if (diff <= 0) {
    return { days: 0, hours: 0, expired: true, urgency: 'danger' };
  }
  
  const totalHours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  
  let urgency: 'ok' | 'warning' | 'danger' = 'ok';
  if (days === 0 && hours < 12) urgency = 'danger';
  else if (days === 0 || (days === 1 && hours < 12)) urgency = 'warning';
  
  return { days, hours, expired: false, urgency };
};

interface Order {
  id: string;
  order_code: string;
  buyer_id: string;
  buyer_name: string;
  seller_name: string;
  seller_id: string;
  book_titolo: string;
  book_autore: string;
  book_isbn: string;
  totale_acquirente: number;
  prezzo_venditore: number;
  prezzo_libro: number;
  costo_foderazione: number;
  commissione_stripe: number;
  commissione_cartolibreria: number;
  commissione_cartolibreria_libro: number;
  commissione_cartolibreria_foderazione: number;
  status: string;
  status_label: string;
  created_at: string;
  seller_delivery_deadline?: string;
  delivered_to_bookstore_at?: string;
  ready_for_pickup_at?: string;
  completed_at?: string;
  condition_details?: any;
  include_foderazione?: boolean;
}

interface DashboardStats {
  in_arrivo: number;
  da_ritirare: number;
  completati_oggi: number;
  completati_mese: number;
  resi_in_attesa: number;
  guadagno_oggi: number;
  guadagno_mese: number;
  ordini_scaduti: number;
  // Nuovi campi per calcolo dettagliato
  guadagno_libri_oggi: number;
  guadagno_libri_mese: number;
  guadagno_foderazione_oggi: number;
  guadagno_foderazione_mese: number;
  num_foderazione_oggi: number;
  num_foderazione_mese: number;
  // Sistema credito
  credito?: {
    commissioni_libro: number;
    foderazione: number;
    totale: number;
  };
}

// Costanti per calcolo compensi - NUOVA LOGICA 20%
const COSTO_FODERAZIONE = 1.50; // €1,50 per copertina
const COMMISSIONE_VENDITA_PERCENT = 0.20; // 20% sul libro (diviso 50/50)
const COMMISSIONE_CARTOLIBRERIA_PERCENT = 0.10; // 10% sul libro (metà del 20%)
const STRIPE_FEE_PERCENT = 0.029; // 2.9%
const STRIPE_FEE_FIXED = 0.25; // €0.25

// Calcola la commissione Stripe su un importo
const calcolaCommissioneStripe = (importo: number): number => {
  return importo * STRIPE_FEE_PERCENT + STRIPE_FEE_FIXED;
};

// Calcola i compensi della cartolibreria per un ordine
const calcolaCompensiCartolibreria = (prezzoLibro: number, includeFoderazione: boolean) => {
  const costoFoderazione = includeFoderazione ? COSTO_FODERAZIONE : 0;
  const totale = prezzoLibro + costoFoderazione;
  const commissioneStripe = calcolaCommissioneStripe(totale);
  
  // Proporzione per dividere la commissione Stripe
  const proporzioneLibro = prezzoLibro / totale;
  const proporzioneFoderazione = costoFoderazione / totale;
  
  // Commissione Stripe proporzionale
  const stripeLibro = commissioneStripe * proporzioneLibro;
  const stripeFoderazione = commissioneStripe * proporzioneFoderazione;
  
  // Compenso cartolibreria dal libro: 10% - 50% della commissione Stripe proporzionale
  const compensoLibro = (prezzoLibro * COMMISSIONE_CARTOLIBRERIA_PERCENT) - (stripeLibro * 0.5);
  
  // Compenso dalla foderazione: €1,50 - commissione Stripe proporzionale
  const compensoFoderazione = includeFoderazione ? (COSTO_FODERAZIONE - stripeFoderazione) : 0;
  
  return {
    compensoLibro: Math.max(0, compensoLibro),
    compensoFoderazione: Math.max(0, compensoFoderazione),
    totale: Math.max(0, compensoLibro) + Math.max(0, compensoFoderazione),
    commissioneStripe,
    stripeLibro,
    stripeFoderazione,
  };
};

interface BookstoreNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  order_code?: string;
  read: boolean;
  created_at: string;
  books_conditions?: any[];
  books_photos?: string[];
}

type TabType = 'dashboard' | 'in_arrivo' | 'da_ritirare' | 'completati' | 'resi' | 'notifiche';

export default function BookstorePortalScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bookstoreId, setBookstoreId] = useState<string | null>(null);
  const [bookstoreName, setBookstoreName] = useState<string>('');
  
  // Login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  
  // Dashboard state
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [stats, setStats] = useState<DashboardStats>({
    in_arrivo: 0,
    da_ritirare: 0,
    completati_oggi: 0,
    completati_mese: 0,
    resi_in_attesa: 0,
    guadagno_oggi: 0,
    guadagno_mese: 0,
    ordini_scaduti: 0,
    guadagno_libri_oggi: 0,
    guadagno_libri_mese: 0,
    guadagno_foderazione_oggi: 0,
    guadagno_foderazione_mese: 0,
    num_foderazione_oggi: 0,
    num_foderazione_mese: 0,
  });
  
  // Orders by status
  const [ordersInArrivo, setOrdersInArrivo] = useState<Order[]>([]);
  const [ordersDaRitirare, setOrdersDaRitirare] = useState<Order[]>([]);
  const [ordersCompletati, setOrdersCompletati] = useState<Order[]>([]);
  const [ordersResi, setOrdersResi] = useState<Order[]>([]);
  
  // Notifiche cartolibreria
  const [notifications, setNotifications] = useState<BookstoreNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  
  // Scanner state
  const [showScanner, setShowScanner] = useState(false);
  const [scanMode, setScanMode] = useState<'generic' | 'delivery' | 'pickup' | 'return'>('generic');
  const [manualCode, setManualCode] = useState('');
  const [confirmingAction, setConfirmingAction] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  
  // Dialogo conferma dopo scansione
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [scannedOrder, setScannedOrder] = useState<any>(null);
  const [pendingAction, setPendingAction] = useState<'delivery' | 'pickup' | 'return' | null>(null);

  // Funzione per aprire scanner in modalità specifica
  const openScanner = (mode: 'generic' | 'delivery' | 'pickup' | 'return') => {
    setScanMode(mode);
    setShowScanner(true);
  };
  
  // Cerca ordine per codice e mostra dialogo conferma
  const findOrderAndShowConfirm = (code: string, action: 'delivery' | 'pickup' | 'return') => {
    let order = null;
    
    if (action === 'delivery') {
      order = ordersInArrivo.find(o => o.order_code === code);
    } else if (action === 'pickup') {
      order = ordersDaRitirare.find(o => o.order_code === code);
    } else if (action === 'return') {
      order = ordersResi.find(o => o.order_code === code);
    }
    
    // Se non trovato, cerca in tutti gli ordini
    if (!order) {
      order = [...ordersInArrivo, ...ordersDaRitirare, ...ordersResi].find(o => o.order_code === code);
      if (order) {
        // Determina automaticamente l'azione
        if (ordersInArrivo.some(o => o.order_code === code)) action = 'delivery';
        else if (ordersDaRitirare.some(o => o.order_code === code)) action = 'pickup';
        else if (ordersResi.some(o => o.order_code === code)) action = 'return';
      }
    }
    
    if (order) {
      setScannedOrder(order);
      setPendingAction(action);
      setShowScanner(false);
      setShowConfirmDialog(true);
    } else {
      Alert.alert('Errore', `Nessun ordine trovato con codice ${code}`);
    }
  };
  
  // Timer update
  const [, setTimerTick] = useState(0);

  useEffect(() => {
    checkLoginStatus();
  }, []);

  // Update timers every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setTimerTick(t => t + 1);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const checkLoginStatus = async () => {
    try {
      const storedBookstoreId = await AsyncStorage.getItem('bookstore_id');
      const storedBookstoreName = await AsyncStorage.getItem('bookstore_name');
      
      if (storedBookstoreId) {
        setBookstoreId(storedBookstoreId);
        setBookstoreName(storedBookstoreName || '');
        setIsLoggedIn(true);
        await loadDashboardData(storedBookstoreId);
      }
    } catch (error) {
      console.error('Error checking login:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDashboardData = async (bsId: string) => {
    try {
      // Load all data from dashboard endpoint
      const response = await axios.get(`${API_URL}/api/bookstore/${bsId}/dashboard`);
      const data = response.data;
      
      setBookstoreName(data.bookstore_name || '');
      setOrdersInArrivo(data.orders_in_arrivo || []);
      setOrdersDaRitirare(data.orders_da_ritirare || []);
      setOrdersCompletati(data.orders_completati || []);
      setOrdersResi(data.orders_resi || []);
      
      // Carica notifiche
      if (data.notifications) {
        setNotifications(data.notifications);
        setUnreadCount(data.notifications.filter((n: BookstoreNotification) => !n.read).length);
      }
      
      // Carica anche stats con credito dal nuovo endpoint
      try {
        const statsRes = await axios.get(`${API_URL}/api/bookstore/${bsId}/stats`);
        const statsData = statsRes.data;
        
        // Merge stats con credito
        setStats(prev => ({
          ...prev,
          ...data.stats,
          credito: statsData.credito
        }));
      } catch (e) {
        // Se fallisce, usa le stats senza credito
        setStats(data.stats || stats);
      }
      
    } catch (error) {
      console.error('Error loading dashboard:', error);
      // Fallback: load orders the old way
      try {
        const ordersRes = await axios.get(`${API_URL}/api/bookstore/${bsId}/orders`);
        const allOrders = ordersRes.data.orders || [];
        
        // Categorize orders
        const inArrivo = allOrders.filter((o: Order) => ['paid_escrow', 'delivering_to_bookstore', 'pagato_attesa_consegna'].includes(o.status));
        const daRitirare = allOrders.filter((o: Order) => ['ready_for_pickup', 'pronto_per_ritiro'].includes(o.status));
        const completati = allOrders.filter((o: Order) => o.status === 'completed');
        const resi = allOrders.filter((o: Order) => ['return_requested', 'returned', 'refunded', 'reso_richiesto'].includes(o.status));
        
        setOrdersInArrivo(inArrivo);
        setOrdersDaRitirare(daRitirare);
        setOrdersCompletati(completati);
        setOrdersResi(resi);
        
        // Calculate stats con nuovo calcolo compensi
        const today = new Date().toDateString();
        const completatiOggi = completati.filter((o: Order) => new Date(o.completed_at || o.created_at).toDateString() === today);
        
        // Calcola compensi dettagliati per ogni ordine completato
        let guadagnoLibriOggi = 0;
        let guadagnoLibriMese = 0;
        let guadagnoFoderazioneOggi = 0;
        let guadagnoFoderazioneMese = 0;
        let numFoderazioneOggi = 0;
        let numFoderazioneMese = 0;
        
        completati.forEach((order: Order) => {
          const prezzoLibro = order.prezzo_libro || order.prezzo_venditore || order.totale_acquirente || 0;
          const includeFoderazione = order.include_foderazione || order.costo_foderazione > 0;
          
          const compensi = calcolaCompensiCartolibreria(prezzoLibro, includeFoderazione);
          
          const isToday = new Date(order.completed_at || order.created_at).toDateString() === today;
          
          if (isToday) {
            guadagnoLibriOggi += compensi.compensoLibro;
            guadagnoFoderazioneOggi += compensi.compensoFoderazione;
            if (includeFoderazione) numFoderazioneOggi++;
          }
          
          guadagnoLibriMese += compensi.compensoLibro;
          guadagnoFoderazioneMese += compensi.compensoFoderazione;
          if (includeFoderazione) numFoderazioneMese++;
        });
        
        setStats({
          in_arrivo: inArrivo.length,
          da_ritirare: daRitirare.length,
          completati_oggi: completatiOggi.length,
          completati_mese: completati.length,
          resi_in_attesa: resi.filter((o: Order) => o.status === 'return_requested').length,
          guadagno_oggi: guadagnoLibriOggi + guadagnoFoderazioneOggi,
          guadagno_mese: guadagnoLibriMese + guadagnoFoderazioneMese,
          ordini_scaduti: inArrivo.filter((o: Order) => o.seller_delivery_deadline && new Date(o.seller_delivery_deadline) < new Date()).length,
          guadagno_libri_oggi: guadagnoLibriOggi,
          guadagno_libri_mese: guadagnoLibriMese,
          guadagno_foderazione_oggi: guadagnoFoderazioneOggi,
          guadagno_foderazione_mese: guadagnoFoderazioneMese,
          num_foderazione_oggi: numFoderazioneOggi,
          num_foderazione_mese: numFoderazioneMese,
        });
        
        setBookstoreName(ordersRes.data.bookstore_name || '');
      } catch (e) {
        console.error('Fallback also failed:', e);
      }
    } finally {
      setRefreshing(false);
    }
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
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
        email: email.toLowerCase().trim(),
        password: password
      });
      
      await AsyncStorage.setItem('bookstore_id', response.data.bookstore_id);
      await AsyncStorage.setItem('bookstore_name', response.data.bookstore?.nome || response.data.nome || 'Cartolibreria');
      
      setBookstoreId(response.data.bookstore_id);
      setBookstoreName(response.data.bookstore?.nome || response.data.nome || 'Cartolibreria');
      setIsLoggedIn(true);
      
      await loadDashboardData(response.data.bookstore_id);
    } catch (error: any) {
      console.log('Login error:', error.response?.data);
      const msg = error.response?.data?.detail || 'Credenziali non valide';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Errore', msg);
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    const doLogout = async () => {
      await AsyncStorage.removeItem('bookstore_id');
      await AsyncStorage.removeItem('bookstore_name');
      setIsLoggedIn(false);
      setBookstoreId(null);
      setBookstoreName('');
      setEmail('');
      setPassword('');
      setActiveTab('dashboard');
    };
    
    if (Platform.OS === 'web') {
      if (window.confirm('Vuoi uscire dal portale cartolibreria?')) {
        await doLogout();
      }
    } else {
      Alert.alert('Logout', 'Vuoi uscire dal portale cartolibreria?', [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Esci', onPress: doLogout },
      ]);
    }
  };

  // Conferma ricezione libro dal venditore
  const handleConfirmSellerDelivery = async (orderCode: string) => {
    setConfirmingAction(true);
    try {
      const response = await axios.post(
        `${API_URL}/api/bookstore/${bookstoreId}/confirm-seller-delivery?order_code=${orderCode.toUpperCase()}`
      );
      
      const msg = `✅ Consegna confermata!\n\nOrdine: ${response.data.order_code}\n${response.data.book_titolo}\n\nL'acquirente è stato notificato.`;
      
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Successo', msg);
      }
      
      setShowScanner(false);
      setManualCode('');
      await loadDashboardData(bookstoreId!);
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || 'Errore durante la conferma';
      if (Platform.OS === 'web') {
        window.alert('Errore: ' + errorMsg);
      } else {
        Alert.alert('Errore', errorMsg);
      }
    } finally {
      setConfirmingAction(false);
    }
  };

  // Conferma ritiro acquirente
  const handleConfirmBuyerPickup = async (orderCode: string) => {
    setConfirmingAction(true);
    try {
      const response = await axios.post(
        `${API_URL}/api/bookstore/${bookstoreId}/confirm-pickup-by-code?order_code=${orderCode.toUpperCase()}`
      );
      
      const msg = `✅ Ritiro confermato!\n\nOrdine: ${response.data.order_code}\n${response.data.book_titolo}\n\n💰 Pagamento rilasciato al venditore!`;
      
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Successo', msg);
      }
      
      setShowScanner(false);
      setManualCode('');
      await loadDashboardData(bookstoreId!);
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || 'Errore durante la conferma';
      if (Platform.OS === 'web') {
        window.alert('Errore: ' + errorMsg);
      } else {
        Alert.alert('Errore', errorMsg);
      }
    } finally {
      setConfirmingAction(false);
    }
  };

  // Gestione reso
  const handleVerifyReturn = async (orderId: string, accepted: boolean) => {
    const actionText = accepted ? 'accettare il reso' : 'rifiutare il reso';
    const confirmText = accepted 
      ? 'Il libro NON corrisponde alla descrizione. L\'acquirente riceverà un rimborso.'
      : 'Il libro corrisponde alla descrizione. Il venditore riceverà il pagamento.';
    
    const doVerify = async () => {
      setConfirmingAction(true);
      try {
        await axios.post(
          `${API_URL}/api/orders/${orderId}/verify-return?bookstore_id=${bookstoreId}&accepted=${accepted}&notes=`
        );
        
        const successMsg = accepted 
          ? 'Reso accettato. Rimborso in corso.'
          : 'Reso rifiutato. Pagamento al venditore confermato.';
        
        if (Platform.OS === 'web') {
          window.alert(successMsg);
        } else {
          Alert.alert('Completato', successMsg);
        }
        
        await loadDashboardData(bookstoreId!);
      } catch (error: any) {
        const errorMsg = error.response?.data?.detail || 'Errore nella verifica';
        if (Platform.OS === 'web') {
          window.alert('Errore: ' + errorMsg);
        } else {
          Alert.alert('Errore', errorMsg);
        }
      } finally {
        setConfirmingAction(false);
      }
    };
    
    if (Platform.OS === 'web') {
      if (window.confirm(`Vuoi ${actionText}?\n\n${confirmText}`)) {
        await doVerify();
      }
    } else {
      Alert.alert(`Conferma ${actionText}`, confirmText, [
        { text: 'Annulla', style: 'cancel' },
        { text: accepted ? 'Accetta' : 'Rifiuta', style: accepted ? 'destructive' : 'default', onPress: doVerify },
      ]);
    }
  };

  const handleScanOrManualCode = async (code: string) => {
    if (!code.trim()) return;
    
    // Cerca l'ordine corrispondente al codice
    const orderInArrivo = ordersInArrivo.find(o => o.order_code === code.toUpperCase());
    const orderDaRitirare = ordersDaRitirare.find(o => o.order_code === code.toUpperCase());
    const orderReso = ordersResi.find(o => o.order_code === code.toUpperCase() && o.status === 'return_requested');
    
    if (orderInArrivo) {
      setScannedOrder(orderInArrivo);
      setPendingAction('delivery');
      setShowScanner(false);
      setShowConfirmDialog(true);
    } else if (orderDaRitirare) {
      setScannedOrder(orderDaRitirare);
      setPendingAction('pickup');
      setShowScanner(false);
      setShowConfirmDialog(true);
    } else if (orderReso) {
      setScannedOrder(orderReso);
      setPendingAction('return');
      setShowScanner(false);
      setShowConfirmDialog(true);
    } else {
      if (Platform.OS === 'web') {
        window.alert('Nessun ordine trovato con codice: ' + code.toUpperCase());
      } else {
        Alert.alert('Errore', 'Nessun ordine trovato con codice: ' + code.toUpperCase());
      }
    }
    setManualCode('');
  };
  
  // Conferma azione dopo scansione
  const handleConfirmScannedAction = async (accept: boolean = true) => {
    if (!scannedOrder || !pendingAction) return;
    
    setConfirmingAction(true);
    try {
      if (pendingAction === 'delivery') {
        await handleConfirmSellerDelivery(scannedOrder.order_code);
      } else if (pendingAction === 'pickup') {
        await handleConfirmBuyerPickup(scannedOrder.order_code);
      } else if (pendingAction === 'return') {
        await handleVerifyReturn(scannedOrder.id, accept);
      }
      setShowConfirmDialog(false);
      setScannedOrder(null);
      setPendingAction(null);
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || 'Errore durante l\'operazione';
      if (Platform.OS === 'web') {
        window.alert('Errore: ' + errorMsg);
      } else {
        Alert.alert('Errore', errorMsg);
      }
    } finally {
      setConfirmingAction(false);
    }
  };

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    try {
      // Chiudi lo scanner immediatamente
      setShowScanner(false);
      
      // Valida che il dato sia un codice ordine valido (6 caratteri alfanumerici)
      if (!data || typeof data !== 'string') {
        Alert.alert('Errore', 'QR code non valido');
        return;
      }
      
      // Pulisci il dato
      const cleanedCode = data.trim().toUpperCase();
      
      // Verifica se è un URL (non è un codice ordine)
      if (cleanedCode.startsWith('HTTP') || cleanedCode.startsWith('WWW') || cleanedCode.includes('://')) {
        Alert.alert('Codice non valido', 'Questo QR contiene un URL, non un codice ordine.\n\nScansiona il QR dell\'ordine.');
        return;
      }
      
      // Verifica la lunghezza (i codici ordine sono 6 caratteri)
      if (cleanedCode.length !== 6) {
        Alert.alert('Codice non valido', `Il codice deve essere di 6 caratteri.\n\nHai scansionato: "${cleanedCode.substring(0, 20)}${cleanedCode.length > 20 ? '...' : ''}"`);
        return;
      }
      
      // Verifica che contenga solo caratteri alfanumerici
      if (!/^[A-Z0-9]+$/.test(cleanedCode)) {
        Alert.alert('Codice non valido', 'Il codice deve contenere solo lettere e numeri.');
        return;
      }
      
      // Codice valido, procedi
      handleScanOrManualCode(cleanedCode);
    } catch (error) {
      console.error('Errore scansione QR:', error);
      Alert.alert('Errore', 'Si è verificato un errore durante la scansione. Riprova.');
    }
  };

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/profile');
    }
  };

  // Render timer badge
  const renderTimer = (deadline: string | undefined) => {
    if (!deadline) return null;
    
    const timer = getWorkingDaysRemaining(deadline);
    
    const bgColor = timer.expired ? '#f44336' : timer.urgency === 'danger' ? '#FF5722' : timer.urgency === 'warning' ? '#FF9800' : '#4CAF50';
    const text = timer.expired 
      ? '⚠️ SCADUTO' 
      : timer.days > 0 
        ? `${timer.days}g ${timer.hours}h` 
        : `${timer.hours}h`;
    
    return (
      <View style={[styles.timerBadge, { backgroundColor: bgColor }]}>
        <Ionicons name="timer-outline" size={14} color="#fff" />
        <Text style={styles.timerText}>{text}</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color="#1a472a" />
      </View>
    );
  }

  // Login Screen
  if (!isLoggedIn) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.loginContainer}>
        <Stack.Screen options={{ headerShown: false }} />

        <View style={styles.loginCard}>
          <Ionicons name="storefront" size={64} color="#1a472a" />
          <Text style={styles.loginTitle}>Portale Cartolibreria</Text>
          <Text style={styles.loginSubtitle}>Gestisci ordini, consegne e resi</Text>

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
              onSubmitEditing={handleLogin}
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

          <TouchableOpacity style={styles.backLink} onPress={handleGoBack}>
            <Ionicons name="arrow-back" size={18} color="#666" />
            <Text style={styles.backLinkText}>Torna indietro</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // Dashboard
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={handleGoBack} style={styles.headerBackBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Ionicons name="storefront" size={24} color="#fff" />
          <Text style={styles.headerTitle}>{bookstoreName}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={20} color="#fff" />
          <Text style={styles.logoutBtnText}>Esci</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs - ESATTAMENTE come Admin */}
      <View style={styles.adminTabs}>
        {[
          { key: 'dashboard', icon: 'grid', label: 'Dashboard' },
          { key: 'in_arrivo', icon: 'time', label: 'In Arrivo' },
          { key: 'da_ritirare', icon: 'cube', label: 'Da Ritirare' },
          { key: 'completati', icon: 'checkmark-circle', label: 'Completati' },
          { key: 'resi', icon: 'refresh', label: 'Resi' },
          { key: 'notifiche', icon: 'notifications', label: 'Notifiche' },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.adminTab, activeTab === tab.key && styles.adminTabActive]}
            onPress={() => setActiveTab(tab.key as TabType)}
          >
            <View style={styles.adminTabIconContainer}>
              <Ionicons
                name={tab.icon as any}
                size={20}
                color={activeTab === tab.key ? '#1a472a' : '#666'}
              />
              {tab.key !== 'dashboard' && (() => {
                const count = tab.key === 'in_arrivo' ? stats.in_arrivo
                  : tab.key === 'da_ritirare' ? stats.da_ritirare
                  : tab.key === 'completati' ? stats.completati_mese
                  : tab.key === 'resi' ? stats.resi_in_attesa
                  : tab.key === 'notifiche' ? unreadCount : 0;
                return count > 0 ? (
                  <View style={styles.adminTabBadge}>
                    <Text style={styles.adminTabBadgeText}>{count}</Text>
                  </View>
                ) : null;
              })()}
            </View>
            <Text style={[styles.adminTabText, activeTab === tab.key && styles.adminTabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* SCAN BAR FISSA - sotto i tabs */}
      <View style={styles.fixedScanBarNew}>
        <TextInput
          style={styles.scanInputNew}
          placeholder="Codice ordine"
          value={manualCode}
          onChangeText={setManualCode}
          autoCapitalize="characters"
          maxLength={6}
          placeholderTextColor="#999"
        />
        <TouchableOpacity
          style={[styles.scanConfirmBtn, (!manualCode.trim() || confirmingAction) && styles.scanConfirmBtnDisabled]}
          onPress={() => handleScanOrManualCode(manualCode)}
          disabled={!manualCode.trim() || confirmingAction}
        >
          {confirmingAction ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name="checkmark" size={20} color="#fff" />
          )}
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.scanQrBtn} 
          onPress={() => {
            if (Platform.OS === 'web') {
              Alert.alert('Info', 'La scansione QR funziona solo su dispositivi mobili con fotocamera');
            } else {
              setShowScanner(true);
            }
          }}
        >
          <Ionicons name="qr-code" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Content - ScrollView come Admin */}
      <ScrollView
        style={styles.adminContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadDashboardData(bookstoreId!);
            }}
            colors={['#1a472a']}
          />
        }
      >
        {/* Dashboard Tab - Card grandi come Admin */}
        {activeTab === 'dashboard' && (
          <>
            {/* Stats Grid - ESATTAMENTE come Admin */}
            <View style={styles.adminStatsGrid}>
              <TouchableOpacity 
                style={[styles.adminStatCard, { backgroundColor: '#e3f2fd' }]}
                onPress={() => setActiveTab('in_arrivo')}
              >
                <Ionicons name="time" size={32} color="#2196F3" />
                <Text style={styles.adminStatValue}>{stats.in_arrivo}</Text>
                <Text style={styles.adminStatLabel}>In Arrivo</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.adminStatCard, { backgroundColor: '#fff3e0' }]}
                onPress={() => setActiveTab('da_ritirare')}
              >
                <Ionicons name="cube" size={32} color="#FF9800" />
                <Text style={styles.adminStatValue}>{stats.da_ritirare}</Text>
                <Text style={styles.adminStatLabel}>Da Ritirare</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.adminStatCard, { backgroundColor: '#e8f5e9' }]}
                onPress={() => setActiveTab('completati')}
              >
                <Ionicons name="checkmark-circle" size={32} color="#4CAF50" />
                <Text style={styles.adminStatValue}>{stats.completati_oggi}</Text>
                <Text style={styles.adminStatLabel}>Completati Oggi</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.adminStatCard, { backgroundColor: '#fce4ec' }]}
                onPress={() => setActiveTab('resi')}
              >
                <Ionicons name="refresh" size={32} color="#E91E63" />
                <Text style={styles.adminStatValue}>{stats.resi_in_attesa}</Text>
                <Text style={styles.adminStatLabel}>Resi in Attesa</Text>
              </TouchableOpacity>
              
              <View style={[styles.adminStatCard, { backgroundColor: '#f3e5f5' }]}>
                <Ionicons name="wallet" size={32} color="#9C27B0" />
                <Text style={styles.adminStatValue}>€{stats.credito?.totale?.toFixed(2) || '0.00'}</Text>
                <Text style={styles.adminStatLabel}>Credito Totale</Text>
              </View>
              
              <View style={[styles.adminStatCard, { backgroundColor: '#e0f7fa' }]}>
                <Ionicons name="stats-chart" size={32} color="#00BCD4" />
                <Text style={styles.adminStatValue}>{stats.completati_mese}</Text>
                <Text style={styles.adminStatLabel}>Completati Mese</Text>
              </View>
            </View>

            {/* Info */}
            <View style={styles.infoCardBottom}>
              <Ionicons name="information-circle-outline" size={20} color="#1a472a" />
              <Text style={styles.infoCardTextSmall}>
                I venditori hanno 2 giorni lavorativi per consegnare. Timer scaduto = rimborso automatico.
              </Text>
            </View>
          </>
        )}
        {/* In Arrivo Tab */}
        {activeTab === 'in_arrivo' && (
          <View style={styles.ordersList}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>📦 Ordini In Arrivo ({ordersInArrivo.length})</Text>
              <Text style={styles.sectionSubtitle}>Attendi la consegna del venditore</Text>
            </View>
            
            {ordersInArrivo.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="checkmark-circle" size={64} color="#4CAF50" />
                <Text style={styles.emptyStateText}>Nessun ordine in arrivo</Text>
              </View>
            ) : (
              ordersInArrivo.map((order) => (
                <View key={order.id} style={[styles.orderCard, styles.orderCardInArrivo]}>
                  <View style={styles.orderCardHeader}>
                    <View style={styles.orderCodeContainer}>
                      <Text style={styles.orderCode}>{order.order_code}</Text>
                      {renderTimer(order.seller_delivery_deadline)}
                    </View>
                  </View>
                  
                  <Text style={styles.orderBookTitle}>{order.book_titolo}</Text>
                  {order.book_autore && <Text style={styles.orderBookAuthor}>{order.book_autore}</Text>}
                  
                  <View style={styles.orderMeta}>
                    <View style={styles.orderMetaRow}>
                      <Ionicons name="person" size={14} color="#666" />
                      <Text style={styles.orderMetaText}>Venditore: {order.seller_name}</Text>
                    </View>
                    <View style={styles.orderMetaRow}>
                      <Ionicons name="cart" size={14} color="#666" />
                      <Text style={styles.orderMetaText}>Acquirente: {order.buyer_name}</Text>
                    </View>
                  </View>

                  {/* Codice alfanumerico da verificare per consegna venditore */}
                  <View style={styles.alphaCodeContainer}>
                    <Text style={styles.alphaCodeLabel}>Codice consegna:</Text>
                    <Text style={styles.alphaCodeValue}>{order.order_code}</Text>
                    <Text style={styles.alphaCodeHint}>Richiedi QR o codice al venditore</Text>
                  </View>

                  <View style={styles.orderFooter}>
                    <Text style={styles.orderPrice}>€{order.totale_acquirente?.toFixed(2)}</Text>
                    <View style={styles.actionBtnsRow}>
                      {Platform.OS !== 'web' && (
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.actionBtnScan]}
                          onPress={() => openScanner('delivery')}
                        >
                          <Ionicons name="qr-code" size={18} color="#fff" />
                          <Text style={styles.actionBtnText}>Scansiona</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => handleConfirmSellerDelivery(order.order_code)}
                      >
                        <Ionicons name="checkmark" size={18} color="#fff" />
                        <Text style={styles.actionBtnText}>Ricevuto</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* Da Ritirare Tab */}
        {activeTab === 'da_ritirare' && (
          <View style={styles.ordersList}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>🏪 Da Ritirare ({ordersDaRitirare.length})</Text>
              <Text style={styles.sectionSubtitle}>In attesa che l'acquirente venga a ritirare</Text>
            </View>
            
            {ordersDaRitirare.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="cube-outline" size={64} color="#ccc" />
                <Text style={styles.emptyStateText}>Nessun libro da ritirare</Text>
              </View>
            ) : (
              ordersDaRitirare.map((order) => (
                <View key={order.id} style={[styles.orderCard, styles.orderCardDaRitirare]}>
                  <View style={styles.orderCardHeader}>
                    <Text style={styles.orderCode}>{order.order_code}</Text>
                    <View style={styles.statusBadgeReady}>
                      <Text style={styles.statusBadgeReadyText}>Pronto</Text>
                    </View>
                  </View>
                  
                  <Text style={styles.orderBookTitle}>{order.book_titolo}</Text>
                  
                  <View style={styles.orderMeta}>
                    <View style={styles.orderMetaRow}>
                      <Ionicons name="person" size={14} color="#666" />
                      <Text style={styles.orderMetaText}>Acquirente: {order.buyer_name}</Text>
                    </View>
                  </View>

                  {/* Codice alfanumerico da verificare */}
                  <View style={styles.alphaCodeContainer}>
                    <Text style={styles.alphaCodeLabel}>Codice ritiro:</Text>
                    <Text style={styles.alphaCodeValue}>{order.order_code}</Text>
                    <Text style={styles.alphaCodeHint}>Richiedi QR o codice all'acquirente</Text>
                  </View>

                  <View style={styles.orderFooter}>
                    <Text style={styles.orderPrice}>€{order.totale_acquirente?.toFixed(2)}</Text>
                    <View style={styles.actionBtnsRow}>
                      {Platform.OS !== 'web' && (
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.actionBtnScan]}
                          onPress={() => openScanner('pickup')}
                        >
                          <Ionicons name="qr-code" size={18} color="#fff" />
                          <Text style={styles.actionBtnText}>Scansiona</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionBtnGreen]}
                        onPress={() => handleConfirmBuyerPickup(order.order_code)}
                      >
                        <Ionicons name="bag-check" size={18} color="#fff" />
                        <Text style={styles.actionBtnText}>Consegnato</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* Completati Tab */}
        {activeTab === 'completati' && (
          <View style={styles.ordersList}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>✅ Completati ({ordersCompletati.length})</Text>
              <Text style={styles.sectionSubtitle}>Ordini consegnati con successo</Text>
            </View>
            
            {ordersCompletati.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="checkmark-circle-outline" size={64} color="#ccc" />
                <Text style={styles.emptyStateText}>Nessun ordine completato</Text>
              </View>
            ) : (
              ordersCompletati.slice(0, 20).map((order) => (
                <View key={order.id} style={[styles.orderCard, styles.orderCardCompleted]}>
                  <View style={styles.orderCardHeader}>
                    <Text style={styles.orderCode}>{order.order_code}</Text>
                    <View style={styles.earningsBadgeSmall}>
                      <Ionicons name="cash" size={12} color="#4CAF50" />
                      <Text style={styles.earningsBadgeText}>+€{(order.commissione_cartolibreria || 0).toFixed(2)}</Text>
                    </View>
                  </View>
                  
                  <Text style={styles.orderBookTitle}>{order.book_titolo}</Text>
                  
                  <View style={styles.orderMeta}>
                    <View style={styles.orderMetaRow}>
                      <Ionicons name="calendar" size={14} color="#666" />
                      <Text style={styles.orderMetaText}>
                        {new Date(order.completed_at || order.created_at).toLocaleDateString('it-IT')}
                      </Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* Resi Tab */}
        {activeTab === 'resi' && (
          <View style={styles.ordersList}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>🔄 Resi ({ordersResi.length})</Text>
              <Text style={styles.sectionSubtitle}>Verifica le condizioni e approva/rifiuta</Text>
            </View>
            
            {ordersResi.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="thumbs-up-outline" size={64} color="#4CAF50" />
                <Text style={styles.emptyStateText}>Nessun reso in attesa</Text>
              </View>
            ) : (
              ordersResi.map((order) => (
                <View key={order.id} style={[styles.orderCard, styles.orderCardReso]}>
                  <View style={styles.orderCardHeader}>
                    <Text style={styles.orderCode}>{order.order_code}</Text>
                    <View style={styles.statusBadgeReturn}>
                      <Text style={styles.statusBadgeReturnText}>
                        {order.status === 'return_requested' ? 'Da verificare' : order.status === 'returned' ? 'Rimborsato' : 'Rifiutato'}
                      </Text>
                    </View>
                  </View>
                  
                  <Text style={styles.orderBookTitle}>{order.book_titolo}</Text>
                  
                  <View style={styles.orderMeta}>
                    <View style={styles.orderMetaRow}>
                      <Ionicons name="person" size={14} color="#666" />
                      <Text style={styles.orderMetaText}>Acquirente: {order.buyer_name}</Text>
                    </View>
                  </View>

                  {order.status === 'return_requested' && (
                    <>
                      {/* Codice alfanumerico per verifica reso */}
                      <View style={styles.alphaCodeContainer}>
                        <Text style={styles.alphaCodeLabel}>Codice reso:</Text>
                        <Text style={styles.alphaCodeValue}>{order.order_code}</Text>
                        <Text style={styles.alphaCodeHint}>Richiedi QR o codice all'acquirente</Text>
                      </View>
                      
                      <View style={styles.returnActions}>
                        {Platform.OS !== 'web' && (
                          <TouchableOpacity
                            style={[styles.returnBtn, styles.actionBtnScan]}
                            onPress={() => openScanner('return')}
                          >
                            <Ionicons name="qr-code" size={18} color="#fff" />
                            <Text style={styles.returnBtnText}>Scansiona</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          style={[styles.returnBtn, styles.returnBtnReject]}
                          onPress={() => handleVerifyReturn(order.id, false)}
                        >
                          <Ionicons name="close" size={18} color="#fff" />
                          <Text style={styles.returnBtnText}>Rifiuta</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.returnBtn, styles.returnBtnAccept]}
                          onPress={() => handleVerifyReturn(order.id, true)}
                        >
                          <Ionicons name="checkmark" size={18} color="#fff" />
                          <Text style={styles.returnBtnText}>Accetta</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* Notifiche Tab */}
        {activeTab === 'notifiche' && (
          <View style={styles.ordersList}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>🔔 Notifiche ({notifications.length})</Text>
              <Text style={styles.sectionSubtitle}>Ordini e aggiornamenti</Text>
            </View>
            
            {notifications.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="notifications-off-outline" size={64} color="#ccc" />
                <Text style={styles.emptyStateText}>Nessuna notifica</Text>
              </View>
            ) : (
              notifications.map((notification) => (
                <View key={notification.id} style={[styles.notificationCard, !notification.read && styles.notificationUnread]}>
                  <View style={styles.notificationHeader}>
                    <Text style={styles.notificationTitle}>{notification.title}</Text>
                    {notification.order_code && (
                      <Text style={styles.notificationCode}>{notification.order_code}</Text>
                    )}
                  </View>
                  
                  <Text style={styles.notificationMessage}>{notification.message}</Text>
                  
                  {/* Foto copertina */}
                  {notification.books_photos && notification.books_photos.length > 0 && notification.books_photos[0] && (
                    <View style={styles.notificationPhotoContainer}>
                      <Image 
                        source={{ uri: notification.books_photos[0].startsWith('data:') ? notification.books_photos[0] : `data:image/jpeg;base64,${notification.books_photos[0]}` }}
                        style={styles.notificationPhoto}
                        resizeMode="contain"
                      />
                    </View>
                  )}
                  
                  {/* Condizioni libro */}
                  {notification.books_conditions && notification.books_conditions.length > 0 && (
                    <View style={styles.notificationConditions}>
                      <Text style={styles.notificationConditionsTitle}>📋 Condizioni:</Text>
                      {notification.books_conditions.map((book: any, idx: number) => (
                        <View key={idx} style={styles.notificationConditionItem}>
                          {notification.books_conditions.length > 1 && (
                            <Text style={styles.notificationConditionBook}>{book.title}</Text>
                          )}
                          <Text style={styles.notificationConditionText}>{book.conditions}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  
                  {/* Badge Foderazione */}
                  {notification.include_foderazione && (
                    <View style={styles.foderazioneBadge}>
                      <Ionicons name="book" size={16} color="#fff" />
                      <Text style={styles.foderazioneBadgeText}>📗 FODERAZIONE RICHIESTA (+€1.50)</Text>
                    </View>
                  )}
                  
                  <Text style={styles.notificationTime}>
                    {new Date(notification.created_at).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Scanner Modal */}
      <Modal visible={showScanner} animationType="slide" onRequestClose={() => setShowScanner(false)}>
        <View style={styles.scannerModal}>
          <View style={styles.scannerHeader}>
            <Text style={styles.scannerTitle}>
              {scanMode === 'delivery' ? '📦 Scansiona QR Venditore' : 
               scanMode === 'pickup' ? '🛍️ Scansiona QR Acquirente' : 
               scanMode === 'return' ? '🔄 Scansiona QR Reso' :
               'Scansiona o inserisci codice'}
            </Text>
            <TouchableOpacity onPress={() => setShowScanner(false)}>
              <Ionicons name="close" size={28} color="#333" />
            </TouchableOpacity>
          </View>

          {Platform.OS !== 'web' && permission?.granted && CameraView ? (
            <View style={styles.cameraContainer}>
              <CameraView
                style={styles.camera}
                facing="back"
                onBarcodeScanned={handleBarCodeScanned}
                barcodeScannerSettings={{
                  barcodeTypes: ['qr'],
                  interval: 500,
                }}
              />
              <View style={styles.cameraOverlay}>
                <View style={styles.scanFrame} />
                <Text style={styles.scanHint}>Inquadra il QR code</Text>
              </View>
            </View>
          ) : (
            <View style={styles.noCameraContainer}>
              <Ionicons name="qr-code-outline" size={80} color="#ccc" />
              <Text style={styles.noCameraText}>
                {Platform.OS === 'web' ? 'Scanner non disponibile su web' : 'Permesso fotocamera non concesso'}
              </Text>
              {Platform.OS !== 'web' && (
                <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
                  <Text style={styles.permissionBtnText}>Concedi permesso</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <View style={styles.manualInputContainer}>
            <Text style={styles.manualInputLabel}>Inserisci codice manualmente:</Text>
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
                style={[styles.manualInputBtn, confirmingAction && styles.manualInputBtnDisabled]}
                onPress={() => handleScanOrManualCode(manualCode)}
                disabled={confirmingAction || !manualCode.trim()}
              >
                {confirmingAction ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="checkmark" size={24} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Conferma Azione dopo Scansione */}
      <Modal visible={showConfirmDialog} transparent animationType="fade" onRequestClose={() => setShowConfirmDialog(false)}>
        <View style={styles.confirmModalOverlay}>
          <View style={styles.confirmModalContent}>
            {scannedOrder && (
              <>
                <View style={styles.confirmModalHeader}>
                  <Ionicons 
                    name={pendingAction === 'delivery' ? 'cube' : pendingAction === 'pickup' ? 'bag-check' : 'refresh'} 
                    size={40} 
                    color={pendingAction === 'return' ? '#FF9800' : '#4CAF50'} 
                  />
                  <Text style={styles.confirmModalTitle}>
                    {pendingAction === 'delivery' ? '📦 Conferma Consegna' : 
                     pendingAction === 'pickup' ? '🛍️ Conferma Ritiro' : 
                     '🔄 Verifica Reso'}
                  </Text>
                </View>
                
                <View style={styles.confirmModalBody}>
                  <Text style={styles.confirmModalCode}>{scannedOrder.order_code}</Text>
                  <Text style={styles.confirmModalBook}>{scannedOrder.book_titolo}</Text>
                  
                  {pendingAction === 'delivery' && (
                    <Text style={styles.confirmModalInfo}>
                      Venditore: {scannedOrder.seller_name}
                    </Text>
                  )}
                  {pendingAction === 'pickup' && (
                    <Text style={styles.confirmModalInfo}>
                      Acquirente: {scannedOrder.buyer_name}
                    </Text>
                  )}
                  {pendingAction === 'return' && (
                    <Text style={styles.confirmModalInfo}>
                      Reso richiesto da: {scannedOrder.buyer_name}
                    </Text>
                  )}
                  
                  <Text style={styles.confirmModalPrice}>€{scannedOrder.totale_acquirente?.toFixed(2)}</Text>
                </View>
                
                <View style={styles.confirmModalActions}>
                  {pendingAction === 'return' ? (
                    // Per i resi: due pulsanti Accetta/Rifiuta
                    <>
                      <TouchableOpacity 
                        style={[styles.confirmModalBtn, styles.confirmModalBtnReject]}
                        onPress={() => handleConfirmScannedAction(false)}
                        disabled={confirmingAction}
                      >
                        {confirmingAction ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <>
                            <Ionicons name="close" size={20} color="#fff" />
                            <Text style={styles.confirmModalBtnText}>Rifiuta Reso</Text>
                          </>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.confirmModalBtn, styles.confirmModalBtnAccept]}
                        onPress={() => handleConfirmScannedAction(true)}
                        disabled={confirmingAction}
                      >
                        {confirmingAction ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <>
                            <Ionicons name="checkmark" size={20} color="#fff" />
                            <Text style={styles.confirmModalBtnText}>Accetta Reso</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </>
                  ) : (
                    // Per consegne e ritiri: Annulla/Conferma
                    <>
                      <TouchableOpacity 
                        style={[styles.confirmModalBtn, styles.confirmModalBtnCancel]}
                        onPress={() => {
                          setShowConfirmDialog(false);
                          setScannedOrder(null);
                          setPendingAction(null);
                        }}
                        disabled={confirmingAction}
                      >
                        <Ionicons name="close" size={20} color="#666" />
                        <Text style={[styles.confirmModalBtnText, { color: '#666' }]}>Annulla</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.confirmModalBtn, styles.confirmModalBtnConfirm]}
                        onPress={() => handleConfirmScannedAction(true)}
                        disabled={confirmingAction}
                      >
                        {confirmingAction ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <>
                            <Ionicons name="checkmark" size={20} color="#fff" />
                            <Text style={styles.confirmModalBtnText}>
                              {pendingAction === 'delivery' ? 'Conferma Ricevuto' : 'Conferma Consegnato'}
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </>
            )}
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
  // ========== STILI ADMIN-LIKE ==========
  adminTabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  adminTab: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    gap: 4,
  },
  adminTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#1a472a',
  },
  adminTabIconContainer: {
    position: 'relative',
  },
  adminTabBadge: {
    position: 'absolute',
    top: -6,
    right: -10,
    backgroundColor: '#f44336',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  adminTabBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  adminTabText: {
    fontSize: 10,
    color: '#666',
  },
  adminTabTextActive: {
    color: '#1a472a',
    fontWeight: '600',
  },
  adminContent: {
    flex: 1,
    padding: 16,
  },
  // SCAN BAR FISSA
  fixedScanBarNew: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a472a',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  scanInputNew: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
  },
  scanConfirmBtn: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanConfirmBtnDisabled: {
    backgroundColor: '#ccc',
  },
  scanQrBtn: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  adminStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  adminStatCard: {
    width: '48%',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  adminStatValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 8,
  },
  adminStatLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  scanBarCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  scanBarTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a472a',
    marginBottom: 12,
  },
  infoCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
    gap: 8,
  },
  infoCardTextSmall: {
    flex: 1,
    fontSize: 12,
    color: '#1a472a',
  },
  // ========== FINE STILI ADMIN-LIKE ==========
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  // Login
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
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    gap: 6,
  },
  backLinkText: {
    color: '#666',
    fontSize: 14,
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a472a',
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingTop: Platform.OS === 'ios' ? 50 : 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerBackBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  logoutBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  // Fixed Scan Bar
  fixedScanBar: {
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  scanInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scanInput: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  scanSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 4,
  },
  scanSubmitBtnDisabled: {
    backgroundColor: '#ccc',
  },
  scanSubmitBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  cameraBtn: {
    backgroundColor: '#1a472a',
    padding: 10,
    borderRadius: 8,
  },
  // Tabs - più larghi e quadrati
  tabsContainer: {
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    paddingBottom: 4,
    flexDirection: 'row',
  },
  tabsWrapper: {
    backgroundColor: '#fff',
    marginBottom: 0,
  },
  tabsContainerInner: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
  },
  tab: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginHorizontal: 4,
    borderRadius: 10,
    backgroundColor: '#e8e8e8',
    width: 72,
    height: 72,
  },
  tabActive: {
    backgroundColor: '#d0d0d0',
  },
  tabIconContainer: {
    position: 'relative',
  },
  tabText: {
    fontSize: 10,
    color: '#444',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 6,
  },
  tabTextActive: {
    color: '#1a472a',
    fontWeight: '700',
  },
  tabBadge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: '#f44336',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6,
    minWidth: 14,
    alignItems: 'center',
  },
  tabBadgeActive: {
    backgroundColor: '#f44336',
  },
  tabBadgeText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#fff',
  },
  tabBadgeTextActive: {
    color: '#fff',
  },
  // Content
  content: {
    backgroundColor: '#f5f5f5',
  },
  dashboardContent: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: 'rgba(255,0,0,0.2)', // DEBUG - rimuovere dopo
  },
  // Quick Actions Card
  quickActionsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#1a472a',
  },
  quickActionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  quickActionsTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  codeInputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  codeInput: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 14,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 3,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  codeSubmitBtn: {
    backgroundColor: '#4CAF50',
    width: 52,
    height: 52,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  codeSubmitBtnDisabled: {
    backgroundColor: '#ccc',
  },
  scanQrBtnText: {
    color: '#1a472a',
    fontSize: 13,
    fontWeight: '500',
  },
  // Scan Button (old - kept for compatibility)
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a472a',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    gap: 16,
  },
  scanButtonTextContainer: {
    flex: 1,
  },
  scanButtonTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  scanButtonSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginTop: 2,
  },
  // Stats Grid - Card quadrate verticali
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
    marginTop: 0,
  },
  statsGridDesktop: {
    gap: 12,
  },
  statCard: {
    width: '47%',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    minHeight: 90,
  },
  statCardBlue: {
    backgroundColor: '#E3F2FD',
  },
  statCardOrange: {
    backgroundColor: '#FFF3E0',
  },
  statCardGreen: {
    backgroundColor: '#E8F5E9',
  },
  statCardRed: {
    backgroundColor: '#FCE4EC',
  },
  statNumber: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#555',
    marginTop: 2,
    fontWeight: '500',
  },
  alertBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f44336',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  alertBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  // Earnings Card
  earningsCard: {
    backgroundColor: '#1a472a',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  earningsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  earningsTitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    fontWeight: '500',
  },
  earningsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  earningsItem: {
    flex: 1,
    alignItems: 'center',
  },
  earningsItemLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  earningsItemValue: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 4,
  },
  earningsDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  // Foderazione Card
  foderazioneCard: {
    backgroundColor: '#FF9800',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  foderazioneSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    marginTop: 2,
  },
  // Total Earnings Card
  totalEarningsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  totalEarningsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalEarningsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  totalEarningsRight: {
    alignItems: 'flex-end',
  },
  totalEarningsLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  totalEarningsSubLabel: {
    fontSize: 11,
    color: '#666',
  },
  totalEarningsValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  totalEarningsSmall: {
    fontSize: 12,
    color: '#666',
  },
  // Credit Card - Sistema Credito Accumulato
  creditCard: {
    backgroundColor: '#1a472a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  creditHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  creditTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  creditContent: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: 12,
  },
  creditRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  creditLabel: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
  },
  creditValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  creditDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginVertical: 8,
  },
  creditTotalLabel: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  creditTotalValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  creditNote: {
    fontSize: 11,
    color: '#fff',
    opacity: 0.7,
    marginTop: 10,
    fontStyle: 'italic',
  },
  // Formula Card
  formulaCard: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  formulaTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  formulaSection: {
    marginBottom: 8,
  },
  formulaSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a472a',
  },
  formulaText: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  formulaExample: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#1a472a',
  },
  formulaExampleTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 6,
  },
  formulaExampleText: {
    fontSize: 11,
    color: '#666',
    marginBottom: 2,
  },
  formulaExampleTotal: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginTop: 4,
  },
  // Info Card
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  infoCardContent: {
    flex: 1,
  },
  infoCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a472a',
    marginBottom: 4,
  },
  infoCardText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  // Orders List
  ordersList: {
    padding: 16,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
  },
  // Order Card
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  orderCardInArrivo: {
    borderLeftColor: '#1976D2',
  },
  orderCardDaRitirare: {
    borderLeftColor: '#FF9800',
  },
  orderCardCompleted: {
    borderLeftColor: '#4CAF50',
  },
  orderCardReso: {
    borderLeftColor: '#f44336',
  },
  orderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  orderCodeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  orderCode: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a472a',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  timerText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  orderBookTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  orderBookAuthor: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  orderMeta: {
    marginTop: 12,
    gap: 6,
  },
  orderMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  orderMetaText: {
    fontSize: 13,
    color: '#666',
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  orderPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1976D2',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  actionBtnGreen: {
    backgroundColor: '#4CAF50',
  },
  actionBtnScan: {
    backgroundColor: '#FF9800',
  },
  actionBtnsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Status badges
  statusBadgeReady: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeReadyText: {
    color: '#388E3C',
    fontSize: 12,
    fontWeight: '600',
  },
  statusBadgeReturn: {
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeReturnText: {
    color: '#C2185B',
    fontSize: 12,
    fontWeight: '600',
  },
  // QR Container (mantenuto per compatibilità)
  qrContainer: {
    alignItems: 'center',
    marginTop: 16,
    padding: 16,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
  qrHint: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
  },
  // Codice Alfanumerico Container
  alphaCodeContainer: {
    alignItems: 'center',
    marginTop: 12,
    padding: 12,
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#4CAF50',
    borderStyle: 'dashed',
  },
  alphaCodeLabel: {
    fontSize: 11,
    color: '#666',
    marginBottom: 4,
  },
  alphaCodeValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1a472a',
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  alphaCodeHint: {
    fontSize: 10,
    color: '#888',
    marginTop: 6,
    fontStyle: 'italic',
  },
  // Earnings badge
  earningsBadgeSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  earningsBadgeText: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '600',
  },
  // Return actions
  returnActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  returnBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 6,
  },
  returnBtnReject: {
    backgroundColor: '#9e9e9e',
  },
  returnBtnAccept: {
    backgroundColor: '#f44336',
  },
  returnBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Scanner Modal
  scannerModal: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 16,
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
  noCameraContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  noCameraText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
    textAlign: 'center',
  },
  permissionBtn: {
    backgroundColor: '#1a472a',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  permissionBtnText: {
    color: '#fff',
    fontSize: 14,
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
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  manualInputBtn: {
    backgroundColor: '#4CAF50',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  manualInputBtnDisabled: {
    backgroundColor: '#ccc',
  },
  // Notification styles
  notificationCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#1a472a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  notificationUnread: {
    backgroundColor: '#f0f9f0',
    borderLeftColor: '#4CAF50',
  },
  notificationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  notificationTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  notificationCode: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1a472a',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  notificationMessage: {
    fontSize: 13,
    color: '#555',
    lineHeight: 20,
  },
  notificationPhotoContainer: {
    marginTop: 12,
    alignItems: 'center',
  },
  notificationPhoto: {
    width: 120,
    height: 160,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  notificationConditions: {
    marginTop: 12,
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 8,
  },
  notificationConditionsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  notificationConditionItem: {
    marginBottom: 4,
  },
  notificationConditionBook: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a472a',
    marginBottom: 2,
  },
  notificationConditionText: {
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
  },
  notificationTime: {
    fontSize: 11,
    color: '#999',
    marginTop: 12,
    textAlign: 'right',
  },
  // Badge Foderazione nelle notifiche
  foderazioneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 12,
    gap: 6,
    alignSelf: 'flex-start',
  },
  foderazioneBadgeText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#fff',
  },
  // Modal Conferma Azione
  confirmModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  confirmModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    overflow: 'hidden',
  },
  confirmModalHeader: {
    alignItems: 'center',
    padding: 20,
    paddingBottom: 10,
    backgroundColor: '#f9f9f9',
  },
  confirmModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 10,
    textAlign: 'center',
  },
  confirmModalBody: {
    padding: 20,
    alignItems: 'center',
  },
  confirmModalCode: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a472a',
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 8,
  },
  confirmModalBook: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
    marginBottom: 4,
  },
  confirmModalInfo: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  confirmModalPrice: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginTop: 12,
  },
  confirmModalActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  confirmModalBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 6,
  },
  confirmModalBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  confirmModalBtnCancel: {
    backgroundColor: '#f5f5f5',
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
  },
  confirmModalBtnConfirm: {
    backgroundColor: '#4CAF50',
  },
  confirmModalBtnAccept: {
    backgroundColor: '#f44336',
  },
  confirmModalBtnReject: {
    backgroundColor: '#666',
    borderRightWidth: 1,
    borderRightColor: '#555',
  },
});
