import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  Image,
  ImageBackground,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Cross-platform confirm dialog
const showConfirm = (title: string, message: string, onConfirm: () => void, destructive = false, confirmText?: string) => {
  const buttonText = confirmText || (destructive ? 'Elimina' : 'Conferma');
  if (Platform.OS === 'web') {
    // Use setTimeout to ensure the confirm dialog is shown properly on web
    setTimeout(() => {
      const confirmed = window.confirm(`${title}\n\n${message}`);
      if (confirmed) {
        onConfirm();
      }
    }, 100);
  } else {
    Alert.alert(title, message, [
      { text: 'Annulla', style: 'cancel' },
      { text: buttonText, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
    ]);
  }
};

const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

export default function ProfileScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [transactions, setTransactions] = useState<{acquisti: any[], vendite: any[]}>({ acquisti: [], vendite: [] });
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const [myListings, setMyListings] = useState<any[]>([]);
  const [loadingListings, setLoadingListings] = useState(false);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const userId = await AsyncStorage.getItem('user_id');
      const username = await AsyncStorage.getItem('username');
      const nome = await AsyncStorage.getItem('user_nome');
      const isPremium = await AsyncStorage.getItem('is_premium');

      if (!userId) {
        router.replace('/');
        return;
      }

      // Get full user data
      const response = await axios.get(`${API_URL}/api/users/${userId}`);
      
      // Get user stats
      const statsRes = await axios.get(`${API_URL}/api/users/${userId}/stats`);
      setStats(statsRes.data);

      // Get user orders (I Miei Scambi) - usa il nuovo endpoint
      try {
        const ordersRes = await axios.get(`${API_URL}/api/user-orders/${userId}`);
        const orders = ordersRes.data.orders || [];
        // Converti gli ordini nel formato transactions per compatibilità
        setTransactions({
          acquisti: orders.filter((o: any) => o.buyer_id === userId),
          vendite: orders.filter((o: any) => o.seller_id === userId)
        });
      } catch (e) {
        console.log('No orders found');
        setTransactions({ acquisti: [], vendite: [] });
      }

      // Get user listings (i miei annunci)
      try {
        setLoadingListings(true);
        const listingsRes = await axios.get(`${API_URL}/api/listings/user/${userId}`);
        setMyListings(listingsRes.data || []);
      } catch (e) {
        console.log('No listings found');
        setMyListings([]);
      } finally {
        setLoadingListings(false);
      }

      setUserData({
        ...response.data,
        nome,
        isPremium: isPremium === 'true',
      });
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatoLabel = (stato: string) => {
    const labels: { [key: string]: { text: string; color: string } } = {
      // Stati ordini
      in_attesa_conferma_venditore: { text: 'Attesa conferma', color: '#FF9800' },
      pending_seller_confirmation: { text: 'Attesa conferma', color: '#FF9800' },
      in_attesa_pagamento: { text: 'Da pagare', color: '#FF9800' },
      pending_payment: { text: 'Da pagare', color: '#FF9800' },
      pagato_attesa_consegna: { text: 'Da consegnare', color: '#2196F3' },
      pronto_per_ritiro: { text: 'Da ritirare', color: '#4CAF50' },
      ready_for_pickup: { text: 'Da ritirare', color: '#4CAF50' },
      picked_up: { text: 'Ritirato', color: '#4CAF50' },
      ritirato: { text: 'Ritirato', color: '#4CAF50' },
      completed: { text: 'Completato', color: '#1a472a' },
      completato: { text: 'Completato', color: '#1a472a' },
      annullato: { text: 'Annullato', color: '#f44336' },
      cancelled: { text: 'Annullato', color: '#f44336' },
      // Stati vecchi per retrocompatibilità
      in_attesa_consegna: { text: 'In attesa', color: '#FFC107' },
      in_custodia: { text: 'In custodia', color: '#2196F3' },
    };
    return labels[stato] || { text: stato, color: '#666' };
  };

  const handleUpgradePremium = async () => {
    showConfirm(
      'Upgrade a Premium',
      'Diventa Premium per €5,99/anno e risparmia sulle commissioni!\n\n• 0% commissioni sulle vendite\n• Risparmia il 15% su ogni transazione\n• Supporto prioritario',
      async () => {
        setUpgrading(true);
        try {
          const userId = await AsyncStorage.getItem('user_id');
          await axios.post(`${API_URL}/api/users/${userId}/upgrade-premium`);
          await AsyncStorage.setItem('is_premium', 'true');
          setUserData({ ...userData, isPremium: true });
          showAlert(
            'Upgrade completato!',
            'Ora sei un utente Premium. Goditi lo 0% di commissioni!'
          );
        } catch (error) {
          showAlert('Errore', 'Impossibile completare l\'upgrade');
        } finally {
          setUpgrading(false);
        }
      }
    );
  };

  const handleLogout = async () => {
    // Su web esegui logout direttamente (può sempre rientrare)
    if (Platform.OS === 'web') {
      try {
        await AsyncStorage.multiRemove([
          'user_id',
          'username',
          'user_nome',
          'is_premium',
        ]);
        router.replace('/login');
      } catch (error) {
        console.error('Logout error:', error);
        router.replace('/login');
      }
      return;
    }
    
    // Su mobile mostra conferma
    Alert.alert(
      'Esci',
      'Sei sicuro di voler uscire?',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Esci',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.multiRemove([
                'user_id',
                'username',
                'user_nome',
                'is_premium',
              ]);
              router.replace('/login');
            } catch (error) {
              console.error('Logout error:', error);
              router.replace('/login');
            }
          },
        },
      ]
    );
  };

  // Get status color and label (kept for future use)
  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'available':
        return { color: '#4CAF50', label: 'In vendita', icon: 'pricetag' };
      case 'reserved':
        return { color: '#FF9800', label: 'Riservato', icon: 'time' };
      case 'sold':
        return { color: '#2196F3', label: 'Venduto', icon: 'checkmark-circle' };
      case 'cancelled':
        return { color: '#999', label: 'Annullato', icon: 'close-circle' };
      default:
        return { color: '#666', label: status, icon: 'help-circle' };
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a472a" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Profile Header con Logo RiBook */}
      <ImageBackground 
        source={require('../../assets/images/ribook-text-only.png')}
        style={styles.profileHeader}
        imageStyle={styles.profileHeaderImage}
        resizeMode="contain"
      >
        <View style={styles.profileHeaderOverlay}>
          <View style={styles.avatarContainer}>
            <Ionicons name="person" size={48} color="#fff" />
          </View>
          <Text style={styles.userName}>{userData?.nome || 'Utente'}</Text>
          <Text style={styles.userUsername}>{userData?.username}</Text>
          {userData?.isPremium && (
            <View style={styles.premiumBadge}>
              <Ionicons name="diamond" size={16} color="#fff" />
              <Text style={styles.premiumBadgeText}>Premium</Text>
            </View>
          )}
          {/* Buttons Row: Modifica Profilo + Esci */}
          <View style={styles.headerButtonsRow}>
            <TouchableOpacity 
              style={styles.editProfileButton}
              onPress={() => router.push('/profile/edit')}
            >
              <Ionicons name="pencil" size={16} color="#1a472a" />
              <Text style={styles.editProfileButtonText}>Modifica Profilo</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.logoutHeaderButton}
              onPress={handleLogout}
            >
              <Ionicons name="log-out-outline" size={16} color="#333" />
              <Text style={styles.logoutHeaderButtonText}>Esci</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ImageBackground>

      {/* Sezione Scambi */}
      <View style={styles.tradesSection}>
        <TouchableOpacity 
          style={styles.tradesSectionHeader}
          onPress={() => router.push('/profile/my-exchanges')}
        >
          <View style={styles.tradesSectionHeaderLeft}>
            <Ionicons name="swap-horizontal" size={24} color="#1a472a" />
            <Text style={styles.tradesSectionTitle}>I Miei Scambi</Text>
          </View>
          <View style={styles.tradesSectionHeaderRight}>
            <Text style={styles.tradesSectionCount}>
              {transactions.acquisti.length + transactions.vendite.length}
            </Text>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </View>
        </TouchableOpacity>
        
        {(transactions.acquisti.length + transactions.vendite.length) === 0 ? (
          <View style={styles.tradesEmpty}>
            <Ionicons name="swap-horizontal-outline" size={48} color="#ccc" />
            <Text style={styles.tradesEmptyTitle}>Nessuno scambio</Text>
            <Text style={styles.tradesEmptySubtitle}>
              I tuoi acquisti e vendite appariranno qui
            </Text>
          </View>
        ) : (
          <View style={styles.tradesList}>
            {/* Mostra max 3 transazioni */}
            {[...transactions.acquisti, ...transactions.vendite]
              .slice(0, showAllTransactions ? undefined : 3)
              .map((trans: any, index: number) => {
                const isAcquisto = transactions.acquisti.includes(trans);
                const statoInfo = getStatoLabel(trans.status || trans.stato);
                const prezzo = isAcquisto ? trans.totale_acquirente : trans.netto_venditore;
                return (
                  <TouchableOpacity 
                    key={trans.id || index} 
                    style={styles.tradeCard}
                    onPress={() => router.push('/profile/my-exchanges')}
                  >
                    <View style={styles.tradeCardHeader}>
                      <View style={[styles.tradeStatusBadge, { backgroundColor: statoInfo.color }]}>
                        <Text style={styles.tradeStatusText}>{statoInfo.text}</Text>
                      </View>
                      <Text style={styles.tradeCardPrice}>€{prezzo?.toFixed(2) || '0.00'}</Text>
                    </View>
                    <Text style={styles.tradeCardTitle} numberOfLines={1}>
                      {trans.book_titolo}
                    </Text>
                    <View style={styles.tradeCardMeta}>
                      <Ionicons 
                        name={isAcquisto ? "cart" : "pricetag"} 
                        size={14} 
                        color="#666" 
                      />
                      <Text style={styles.tradeCardMetaText}>
                        {isAcquisto ? `Acquisto` : `Vendita`}
                      </Text>
                    </View>
                    <View style={styles.tradeCardMeta}>
                      <Ionicons name="storefront" size={14} color="#666" />
                      <Text style={styles.tradeCardMetaText}>{trans.bookstore_name}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            
            {/* Pulsante Mostra altri */}
            {(transactions.acquisti.length + transactions.vendite.length) > 3 && !showAllTransactions && (
              <TouchableOpacity 
                style={styles.showMoreButton}
                onPress={() => router.push('/(tabs)/transactions')}
              >
                <Text style={styles.showMoreButtonText}>
                  Vedi tutti ({transactions.acquisti.length + transactions.vendite.length})
                </Text>
                <Ionicons name="chevron-forward" size={18} color="#1a472a" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Sezione I Miei Annunci */}
      <View style={styles.listingsSection}>
        <View style={styles.listingsSectionHeader}>
          <View style={styles.listingsSectionHeaderLeft}>
            <Ionicons name="pricetag" size={24} color="#FF9800" />
            <Text style={styles.listingsSectionTitle}>I Miei Annunci</Text>
          </View>
          <View style={styles.listingsSectionHeaderRight}>
            <Text style={styles.listingsSectionCount}>{myListings.length}</Text>
          </View>
        </View>
        
        {loadingListings ? (
          <View style={styles.listingsLoading}>
            <ActivityIndicator size="small" color="#FF9800" />
            <Text style={styles.listingsLoadingText}>Caricamento annunci...</Text>
          </View>
        ) : myListings.length === 0 ? (
          <View style={styles.listingsEmpty}>
            <Ionicons name="book-outline" size={48} color="#ccc" />
            <Text style={styles.listingsEmptyTitle}>Nessun annuncio attivo</Text>
            <Text style={styles.listingsEmptySubtitle}>
              I tuoi libri in vendita appariranno qui
            </Text>
            <TouchableOpacity 
              style={styles.listingsStartButton}
              onPress={() => router.push('/(tabs)/search')}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.listingsStartButtonText}>Vendi un libro</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.listingsList}>
            {myListings.slice(0, 3).map((listing: any, index: number) => {
              const coverUrl = listing.cover_url || listing.foto_base64 || 
                `https://www.ibs.it/images/${listing.book_isbn}_0_0_0_180_50.jpg`;
              const isCustomPrice = listing.is_custom_price;
              
              return (
                <TouchableOpacity 
                  key={listing.id || index} 
                  style={styles.listingCard}
                  onPress={() => router.push(`/listing/${listing.id}`)}
                >
                  <Image 
                    source={{ uri: coverUrl }}
                    style={styles.listingCover}
                    resizeMode="cover"
                  />
                  <View style={styles.listingCardContent}>
                    <View style={styles.listingCardHeader}>
                      <View style={[
                        styles.listingTypeBadge, 
                        { backgroundColor: isCustomPrice ? '#FFF3E0' : '#E8F5E9' }
                      ]}>
                        <Text style={[
                          styles.listingTypeBadgeText,
                          { color: isCustomPrice ? '#FF9800' : '#4CAF50' }
                        ]}>
                          {isCustomPrice ? 'Non scolastico' : 'Scolastico'}
                        </Text>
                      </View>
                      <Text style={styles.listingCardPrice}>€{listing.prezzo_vendita?.toFixed(2)}</Text>
                    </View>
                    <Text style={styles.listingCardTitle} numberOfLines={2}>
                      {listing.book_titolo || 'Titolo non disponibile'}
                    </Text>
                    {listing.book_autori && (
                      <Text style={styles.listingCardAuthor} numberOfLines={1}>
                        {listing.book_autori}
                      </Text>
                    )}
                    <View style={styles.listingCardMeta}>
                      <View style={[
                        styles.listingStatusBadge, 
                        { backgroundColor: listing.stato === 'disponibile' ? '#E8F5E9' : '#FFF8E1' }
                      ]}>
                        <View style={[
                          styles.listingStatusDot,
                          { backgroundColor: listing.stato === 'disponibile' ? '#4CAF50' : '#FFC107' }
                        ]} />
                        <Text style={[
                          styles.listingStatusText,
                          { color: listing.stato === 'disponibile' ? '#4CAF50' : '#FF9800' }
                        ]}>
                          {listing.stato === 'disponibile' ? 'In vendita' : listing.stato}
                        </Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
            
            {/* Pulsante Vedi altri */}
            {myListings.length > 3 && (
              <TouchableOpacity 
                style={styles.showMoreButton}
                onPress={() => router.push('/profile/my-listings')}
              >
                <Text style={styles.showMoreButtonText}>
                  Vedi tutti ({myListings.length})
                </Text>
                <Ionicons name="chevron-forward" size={18} color="#1a472a" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Vendi un libro - Sezione prominente */}
      <TouchableOpacity 
        style={styles.sellBookSection}
        onPress={() => router.push('/(tabs)/search')}
      >
        <View style={styles.sellBookContent}>
          <View style={styles.sellBookIconContainer}>
            <Ionicons name="camera" size={28} color="#fff" />
          </View>
          <View style={styles.sellBookTextContainer}>
            <Text style={styles.sellBookTitle}>Vendi un libro</Text>
            <Text style={styles.sellBookSubtitle}>Scansiona il codice ISBN e metti in vendita</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Quick Actions */}
      <View style={styles.section}>
        <TouchableOpacity 
          style={styles.menuItem}
          onPress={() => router.push('/profiles/manage')}
        >
          <View style={[styles.menuItemIcon, { backgroundColor: '#fff3e0' }]}>
            <Ionicons name="people" size={20} color="#FF9800" />
          </View>
          <View style={styles.menuItemContent}>
            <Text style={styles.menuItemTitle}>Gestisci profili figli</Text>
            <Text style={styles.menuItemSubtitle}>Aggiungi profili per più figli/classi</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#999" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.menuItem}
          onPress={() => router.push('/bookstores')}
        >
          <View style={[styles.menuItemIcon, { backgroundColor: '#e3f2fd' }]}>
            <Ionicons name="storefront" size={20} color="#1976D2" />
          </View>
          <View style={styles.menuItemContent}>
            <Text style={styles.menuItemTitle}>Cartolibrerie partner</Text>
            <Text style={styles.menuItemSubtitle}>Punti di ritiro e consegna libri</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#999" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.menuItem}
          onPress={() => router.push('/bookstore-portal')}
        >
          <View style={[styles.menuItemIcon, { backgroundColor: '#f3e5f5' }]}>
            <Ionicons name="business" size={20} color="#9C27B0" />
          </View>
          <View style={styles.menuItemContent}>
            <Text style={styles.menuItemTitle}>Area Cartolibrerie</Text>
            <Text style={styles.menuItemSubtitle}>Login e gestione ordini (per cartolibrerie)</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#999" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.menuItem}
          onPress={() => router.push('/admin')}
        >
          <View style={[styles.menuItemIcon, { backgroundColor: '#fce4ec' }]}>
            <Ionicons name="shield-checkmark" size={20} color="#c2185b" />
          </View>
          <View style={styles.menuItemContent}>
            <Text style={styles.menuItemTitle}>Pannello Admin</Text>
            <Text style={styles.menuItemSubtitle}>Gestione e statistiche (solo admin)</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#999" />
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>RiLiBro v1.0</Text>
        <Text style={styles.footerSubtext}>
          Acquisto libro usato assistito
        </Text>
      </View>
    </ScrollView>
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
  profileHeader: {
    minHeight: 280,
    justifyContent: 'center',
  },
  profileHeaderImage: {
    opacity: 0.4,
    resizeMode: 'contain',
  },
  profileHeaderOverlay: {
    backgroundColor: 'rgba(255, 228, 196, 0.95)',
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    width: '100%',
    minHeight: 280,
    justifyContent: 'center',
  },
  headerLogoutButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
  },
  userUsername: {
    fontSize: 14,
    color: '#333',
    marginTop: 4,
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f4a460',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 12,
    gap: 6,
  },
  premiumBadgeText: {
    color: '#fff',
    fontWeight: '600',
  },
  editProfileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  editProfileButtonText: {
    color: '#1a472a',
    fontWeight: '600',
    fontSize: 14,
  },
  headerButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 12,
  },
  logoutHeaderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  logoutHeaderButtonText: {
    color: '#333',
    fontWeight: '600',
    fontSize: 14,
  },
  childDetailsText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  addProfileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e8f5e9',
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
    gap: 8,
    borderWidth: 2,
    borderColor: '#1a472a',
    borderStyle: 'dashed',
  },
  addProfileButtonText: {
    color: '#1a472a',
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  infoText: {
    fontSize: 16,
    color: '#333',
  },
  premiumCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    borderWidth: 2,
    borderColor: '#f4a460',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  premiumHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  premiumTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  premiumPrice: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a472a',
    marginBottom: 16,
  },
  premiumFeatures: {
    gap: 12,
    marginBottom: 20,
  },
  premiumFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  premiumFeatureText: {
    fontSize: 14,
    color: '#666',
  },
  premiumButton: {
    backgroundColor: '#f4a460',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  premiumButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  commissionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  commissionLabel: {
    fontSize: 16,
    color: '#666',
  },
  commissionValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  commissionNote: {
    fontSize: 13,
    color: '#999',
    marginTop: 4,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#ffcccc',
  },
  logoutButtonText: {
    color: '#ff4444',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    padding: 24,
    paddingBottom: 40,
  },
  footerText: {
    fontSize: 14,
    color: '#999',
  },
  footerSubtext: {
    fontSize: 12,
    color: '#ccc',
    marginTop: 4,
  },
  // Trades Section Styles
  tradesSection: {
    margin: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  tradesSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  tradesSectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tradesSectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tradesSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  tradesSectionCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a472a',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tradesLoading: {
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  tradesLoadingText: {
    color: '#666',
    fontSize: 14,
  },
  tradesEmpty: {
    alignItems: 'center',
    padding: 24,
  },
  tradesEmptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 12,
  },
  tradesEmptySubtitle: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 16,
  },
  tradesStartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a472a',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  tradesStartButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  tradesList: {
    gap: 10,
  },
  tradeCard: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  tradeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  tradeStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tradeStatusText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  tradeCardPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  tradeCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  tradeCardIsbn: {
    fontSize: 11,
    color: '#888',
    marginBottom: 8,
  },
  tradeCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  tradeCardMetaText: {
    fontSize: 12,
    color: '#666',
  },
  showMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    gap: 4,
  },
  showMoreButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a472a',
  },
  tradeCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  tradeTypeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tradeCardInfo: {
    flex: 1,
  },
  tradeCardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  tradeCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tradeStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  tradeStatusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  tradeCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tradeCardPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  menuItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#e8f5e9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuItemContent: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  menuItemSubtitle: {
    fontSize: 13,
    color: '#999',
    marginTop: 2,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  // Profile cards styles
  profileCard: {
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
  profileCardHeader: {
    marginBottom: 12,
  },
  profileBadge: {
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  profileBadgeText: {
    color: '#1976D2',
    fontSize: 12,
    fontWeight: '600',
  },
  addChildButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1a472a',
    borderStyle: 'dashed',
    gap: 8,
  },
  addChildButtonText: {
    color: '#1a472a',
    fontSize: 14,
    fontWeight: '500',
  },
  // Book Flow Widget styles
  bookFlowSection: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  bookFlowTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a472a',
    textAlign: 'center',
  },
  bookFlowSubtitle: {
    fontSize: 11,
    color: '#888',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  bookFlowContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'stretch',
  },
  bookFlowColumn: {
    flex: 1,
    marginHorizontal: 6,
  },
  bookFlowHeader: {
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  bookFlowHeaderText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  bookFlowHeaderClass: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  bookFlowBody: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    marginTop: 10,
    alignItems: 'center',
  },
  bookFlowStat: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  bookFlowNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  bookFlowAction: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
  bookFlowLabel: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    marginTop: 4,
  },
  bookFlowDivider: {
    width: '80%',
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 8,
  },
  bookFlowCenter: {
    width: 70,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  bookFlowCenterBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1a472a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookFlowCenterClass: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  bookFlowCenterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a472a',
    marginTop: 4,
  },
  bookFlowCompatibility: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginTop: 8,
  },
  bookFlowCompatibilityLabel: {
    fontSize: 9,
    color: '#666',
  },
  bookFlowHint: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
    paddingHorizontal: 8,
  },
  bookFlowSellSection: {
    marginTop: 16,
    backgroundColor: '#f0f7ff',
    borderRadius: 12,
    padding: 12,
  },
  bookFlowSellStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  bookFlowSellStat: {
    alignItems: 'center',
  },
  bookFlowSellNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  bookFlowSellLabel: {
    fontSize: 11,
    color: '#666',
  },
  bookFlowSellHint: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  childBookFlowCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  childHeader: {
    backgroundColor: '#f8f9fa',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  childNameBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a472a',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  childNameText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  childSchoolText: {
    fontSize: 15,
    color: '#666',
    marginLeft: 4,
  },
  childSchoolTextBold: {
    fontSize: 14,
    color: '#333',
    fontWeight: 'bold',
    marginLeft: 4,
  },
  childClassText: {
    fontSize: 13,
    color: '#666',
    marginLeft: 4,
    marginTop: 2,
  },
  childSchoolTextCompact: {
    fontSize: 13,
    color: '#333',
    marginLeft: 4,
    flex: 1,
  },
  // Compact header styles for class badges
  bookFlowHeaderCompact: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  bookFlowHeaderClassCompact: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  // Expanded total box with Totale Nuovi
  partialTotalBoxExpanded: {
    backgroundColor: '#e8f5e9',
    padding: 12,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  totalNuoviRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#c8e6c9',
    gap: 6,
  },
  totalNuoviLabel: {
    fontSize: 13,
    color: '#FF9800',
    fontWeight: '600',
  },
  totalNuoviValue: {
    fontSize: 14,
    color: '#FF9800',
    fontWeight: 'bold',
    marginLeft: 'auto',
  },
  totalNuoviLabelBold: {
    fontSize: 14,
    color: '#1a472a',
    fontWeight: 'bold',
  },
  totalNuoviValueBold: {
    fontSize: 18,
    color: '#1a472a',
    fontWeight: 'bold',
    marginLeft: 'auto',
  },
  // PDF Download Button
  pdfDownloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a472a',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    gap: 10,
  },
  pdfDownloadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Summary Card Styles
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginTop: 20,
    borderWidth: 2,
    borderColor: '#1a472a',
  },
  summaryTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1a472a',
    marginBottom: 20,
  },
  summaryGrid: {
    gap: 16,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  summaryIcon: {
    width: 50,
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    width: 50,
  },
  summaryLabel: {
    fontSize: 16,
    color: '#666',
    flex: 1,
  },
  savingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#e8f5e9',
    padding: 16,
    borderRadius: 12,
    marginTop: 10,
  },
  savingsText: {
    fontSize: 17,
    color: '#1a472a',
  },
  savingsAmount: {
    fontWeight: 'bold',
    fontSize: 22,
    color: '#1a472a',
  },
  costRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff3e0',
    padding: 14,
    borderRadius: 12,
    marginTop: 10,
  },
  costText: {
    fontSize: 16,
    color: '#FF9800',
  },
  // Total Balance styles
  totalBalanceRow: {
    marginTop: 24,
    backgroundColor: '#f8f9fa',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1a472a',
  },
  totalBalanceContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  totalBalanceLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
  },
  totalBalanceAmount: {
    fontSize: 36,
    fontWeight: 'bold',
  },
  totalBalanceHint: {
    fontSize: 13,
    color: '#999',
    marginTop: 8,
    fontStyle: 'italic',
  },
  // PDF Modal styles
  pdfModalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  pdfModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a472a',
    padding: 16,
    paddingTop: 40,
  },
  pdfModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  pdfModalCloseButton: {
    padding: 8,
  },
  pdfIframeContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  pdfWebContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  pdfWebTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a472a',
    marginTop: 16,
  },
  pdfWebSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  pdfOpenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a472a',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    gap: 8,
    marginBottom: 16,
  },
  pdfOpenButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  pdfCopyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#1a472a',
    gap: 8,
  },
  pdfCopyButtonText: {
    color: '#1a472a',
    fontSize: 16,
    fontWeight: 'bold',
  },
  pdfUrlContainer: {
    backgroundColor: '#f0f0f0',
    padding: 16,
    borderRadius: 8,
    width: '100%',
    marginVertical: 16,
  },
  pdfUrlText: {
    fontSize: 12,
    color: '#333',
    fontFamily: 'monospace',
    wordBreak: 'break-all',
  },
  pdfHintText: {
    fontSize: 14,
    color: '#888',
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 24,
  },
  pdfCloseModalButton: {
    backgroundColor: '#1a472a',
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 12,
  },
  pdfCloseModalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // PDF Modal styles
  pdfModalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  pdfModalHeader: {
    backgroundColor: '#1a472a',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  pdfBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  pdfBackButtonText: {
    color: '#fff',
    fontSize: 16,
    marginLeft: 8,
  },
  pdfModalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  pdfWebView: {
    flex: 1,
  },
  pdfLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  pdfLoadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  // Totale parziale per profilo
  partialTotalBox: {
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#1a472a',
  },
  partialTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  partialTotalLabel: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  partialTotalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  partialTotalDetail: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  // Transazioni reali per profilo
  realTransactionsBox: {
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    marginBottom: 12,
  },
  realTransactionsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a472a',
    marginBottom: 8,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  realTransactionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  realTransactionItem: {
    alignItems: 'center',
    gap: 2,
  },
  realTransactionNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  realTransactionLabel: {
    fontSize: 11,
    color: '#666',
  },
  // View Book List Button
  viewBookListButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e8f5e9',
    padding: 14,
    borderRadius: 10,
    gap: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#1a472a',
  },
  viewBookListButtonText: {
    color: '#1a472a',
    fontSize: 14,
    fontWeight: '600',
  },
  // Listings Section Styles
  listingsSection: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  listingsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  listingsSectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  listingsSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  listingsSectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  listingsSectionCount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FF9800',
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  listingsLoading: {
    alignItems: 'center',
    padding: 20,
    gap: 10,
  },
  listingsLoadingText: {
    fontSize: 14,
    color: '#666',
  },
  listingsEmpty: {
    alignItems: 'center',
    padding: 24,
    gap: 8,
  },
  listingsEmptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 8,
  },
  listingsEmptySubtitle: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
  },
  listingsStartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF9800',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    gap: 8,
    marginTop: 12,
  },
  listingsStartButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  listingsList: {
    gap: 12,
  },
  listingCard: {
    flexDirection: 'row',
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  listingCover: {
    width: 60,
    height: 85,
    borderRadius: 6,
    backgroundColor: '#e0e0e0',
  },
  listingCardContent: {
    flex: 1,
    justifyContent: 'space-between',
  },
  listingCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  listingTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  listingTypeBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  listingCardPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  listingCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginTop: 4,
  },
  listingCardAuthor: {
    fontSize: 12,
    color: '#666',
  },
  listingCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  listingStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 5,
  },
  listingStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  listingStatusText: {
    fontSize: 11,
    fontWeight: '500',
  },
  addListingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: '#FF9800',
    borderRadius: 12,
    borderStyle: 'dashed',
  },
  addListingButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF9800',
  },
  // Stili sezione "Vendi un libro"
  sellBookSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FF9800',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    shadowColor: '#FF9800',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  sellBookContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 14,
  },
  sellBookIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellBookTextContainer: {
    flex: 1,
  },
  sellBookTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  sellBookSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
});
