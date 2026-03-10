import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function ProfileScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [childProfiles, setChildProfiles] = useState<any[]>([]);
  const [bookFlow, setBookFlow] = useState<any>(null);

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

      // Get child profiles
      const profilesRes = await axios.get(`${API_URL}/api/users/${userId}/profiles`);
      setChildProfiles(profilesRes.data.filter((p: any) => p.id !== 'main'));

      // Get class compatibility / book flow data
      try {
        const bookFlowRes = await axios.get(`${API_URL}/api/radar/${userId}/class-compatibility`);
        setBookFlow(bookFlowRes.data);
      } catch (e) {
        console.log('Book flow data not available');
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

  const handleUpgradePremium = async () => {
    Alert.alert(
      'Upgrade a Premium',
      'Diventa Premium per €5,99/anno e risparmia sulle commissioni!\n\n• 0% commissioni sulle vendite\n• Risparmia il 15% su ogni transazione\n• Supporto prioritario',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Acquista',
          onPress: async () => {
            setUpgrading(true);
            try {
              const userId = await AsyncStorage.getItem('user_id');
              await axios.post(`${API_URL}/api/users/${userId}/upgrade-premium`);
              await AsyncStorage.setItem('is_premium', 'true');
              setUserData({ ...userData, isPremium: true });
              Alert.alert(
                'Upgrade completato!',
                'Ora sei un utente Premium. Goditi lo 0% di commissioni!'
              );
            } catch (error) {
              Alert.alert('Errore', 'Impossibile completare l\'upgrade');
            } finally {
              setUpgrading(false);
            }
          },
        },
      ]
    );
  };

  const handleLogout = async () => {
    Alert.alert('Esci', 'Sei sicuro di voler uscire?', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Esci',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.multiRemove([
            'user_id',
            'username',
            'user_nome',
            'is_premium',
          ]);
          router.replace('/');
        },
      },
    ]);
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
      {/* Profile Header */}
      <View style={styles.profileHeader}>
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
        <TouchableOpacity 
          style={styles.editProfileButton}
          onPress={() => router.push('/profile/edit')}
        >
          <Ionicons name="pencil" size={16} color="#1a472a" />
          <Text style={styles.editProfileButtonText}>Modifica Profilo</Text>
        </TouchableOpacity>
      </View>

      {/* Book Flow Widget - Comprare/Vendere basato sulla classe */}
      {bookFlow && userData?.classe && (
        <View style={styles.bookFlowSection}>
          <Text style={styles.bookFlowTitle}>
            Flusso Libri - {userData.classe}ª Media
          </Text>
          <Text style={styles.bookFlowSubtitle}>
            Basato sul D.P.R. 157/1989 (adozioni triennali)
          </Text>
          
          <View style={styles.bookFlowContainer}>
            {/* Colonna Sinistra - Comprare da classe superiore */}
            {bookFlow.classes.find((c: any) => c.classe > parseInt(userData.classe)) && (
              <View style={styles.bookFlowColumn}>
                <View style={[styles.bookFlowHeader, { backgroundColor: '#4CAF50' }]}>
                  <Ionicons name="arrow-down-circle" size={24} color="#fff" />
                  <Text style={styles.bookFlowHeaderText}>COMPRA da</Text>
                  <Text style={styles.bookFlowHeaderClass}>
                    {bookFlow.classes.find((c: any) => c.classe > parseInt(userData.classe))?.classe}ª Media
                  </Text>
                </View>
                <View style={styles.bookFlowBody}>
                  <View style={styles.bookFlowStat}>
                    <Text style={styles.bookFlowNumber}>
                      {bookFlow.classes.find((c: any) => c.classe > parseInt(userData.classe))?.usable_for_you || 0}
                    </Text>
                    <Text style={styles.bookFlowLabel}>Libri usati{'\n'}disponibili</Text>
                  </View>
                  <View style={styles.bookFlowDivider} />
                  <View style={styles.bookFlowStat}>
                    <Text style={[styles.bookFlowNumber, { color: '#FF9800' }]}>
                      {bookFlow.classes.find((c: any) => c.classe > parseInt(userData.classe))?.books_count - 
                       (bookFlow.classes.find((c: any) => c.classe > parseInt(userData.classe))?.usable_for_you || 0) || 0}
                    </Text>
                    <Text style={styles.bookFlowLabel}>Da comprare{'\n'}nuovi</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Colonna Centrale - Riepilogo */}
            <View style={styles.bookFlowCenter}>
              <View style={styles.bookFlowCenterBadge}>
                <Text style={styles.bookFlowCenterClass}>{userData.classe}ª</Text>
              </View>
              <Text style={styles.bookFlowCenterText}>TU</Text>
              <Text style={styles.bookFlowCompatibility}>
                {bookFlow.summary?.overall_compatibility || 0}%
              </Text>
              <Text style={styles.bookFlowCompatibilityLabel}>compatibilità</Text>
            </View>

            {/* Colonna Destra - Vendere a classe inferiore */}
            {bookFlow.classes.find((c: any) => c.classe < parseInt(userData.classe)) && (
              <View style={styles.bookFlowColumn}>
                <View style={[styles.bookFlowHeader, { backgroundColor: '#2196F3' }]}>
                  <Ionicons name="arrow-up-circle" size={24} color="#fff" />
                  <Text style={styles.bookFlowHeaderText}>VENDI a</Text>
                  <Text style={styles.bookFlowHeaderClass}>
                    {bookFlow.classes.find((c: any) => c.classe < parseInt(userData.classe))?.classe}ª Media
                  </Text>
                </View>
                <View style={styles.bookFlowBody}>
                  <View style={styles.bookFlowStat}>
                    <Text style={styles.bookFlowNumber}>
                      {bookFlow.classes.find((c: any) => c.classe < parseInt(userData.classe))?.books_count || 0}
                    </Text>
                    <Text style={styles.bookFlowLabel}>Studenti{'\n'}interessati</Text>
                  </View>
                  <View style={styles.bookFlowDivider} />
                  <View style={styles.bookFlowStat}>
                    <Text style={[styles.bookFlowNumber, { color: '#4CAF50' }]}>
                      {bookFlow.classes.find((c: any) => c.classe < parseInt(userData.classe))?.sellers_count || 0}
                    </Text>
                    <Text style={styles.bookFlowLabel}>Venditori{'\n'}attivi</Text>
                  </View>
                </View>
              </View>
            )}
          </View>

          <Text style={styles.bookFlowHint}>
            {bookFlow.summary?.message || 'Caricamento...'}
          </Text>
        </View>
      )}

      {/* User Stats */}
      {stats && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Le tue statistiche</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.total_sales}</Text>
              <Text style={styles.statLabel}>Venduti</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.total_purchases}</Text>
              <Text style={styles.statLabel}>Acquistati</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.active_listings}</Text>
              <Text style={styles.statLabel}>In vendita</Text>
            </View>
            <View style={styles.statCard}>
              <View style={styles.ratingContainer}>
                <Ionicons name="star" size={18} color="#FFD700" />
                <Text style={styles.statNumber}>
                  {stats.rating > 0 ? stats.rating.toFixed(1) : '-'}
                </Text>
              </View>
              <Text style={styles.statLabel}>
                {stats.rating_count > 0 ? `${stats.rating_count} recensioni` : 'Nessuna recensione'}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* School Info - Main profile + Children */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Scuole</Text>
        
        {/* Main Profile */}
        <View style={styles.profileCard}>
          <View style={styles.profileCardHeader}>
            <View style={styles.profileBadge}>
              <Text style={styles.profileBadgeText}>Profilo principale</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="school-outline" size={20} color="#666" />
            <Text style={styles.infoText}>{userData?.scuola}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="bookmark-outline" size={20} color="#666" />
            <Text style={styles.infoText}>
              Classe {userData?.classe} - Sezione {userData?.sezione}
            </Text>
          </View>
        </View>

        {/* Child Profiles */}
        {childProfiles.length > 0 && childProfiles.map((profile) => (
          <View key={profile.id} style={styles.profileCard}>
            <View style={styles.profileCardHeader}>
              <View style={[styles.profileBadge, { backgroundColor: '#e8f5e9' }]}>
                <Text style={[styles.profileBadgeText, { color: '#4CAF50' }]}>
                  {profile.nome_figlio}
                </Text>
              </View>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="school-outline" size={20} color="#666" />
              <Text style={styles.infoText}>{profile.scuola}</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="bookmark-outline" size={20} color="#666" />
              <Text style={styles.infoText}>
                Classe {profile.classe} - Sezione {profile.sezione}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="school" size={20} color="#666" />
              <Text style={styles.infoText}>
                {profile.tipo_scuola === 'primo_grado' ? 'Scuola Media' : 'Scuola Superiore'}
              </Text>
            </View>
          </View>
        ))}

        {/* Add Child Profile Button */}
        <TouchableOpacity 
          style={styles.addChildButton}
          onPress={() => router.push('/profiles/manage')}
        >
          <Ionicons name="add-circle-outline" size={20} color="#1a472a" />
          <Text style={styles.addChildButtonText}>
            {childProfiles.length > 0 ? 'Gestisci profili figli' : 'Aggiungi profilo figlio'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Premium Section */}
      {!userData?.isPremium && (
        <View style={styles.section}>
          <View style={styles.premiumCard}>
            <View style={styles.premiumHeader}>
              <Ionicons name="diamond" size={32} color="#f4a460" />
              <Text style={styles.premiumTitle}>Diventa Premium</Text>
            </View>
            <Text style={styles.premiumPrice}>€5,99/anno</Text>
            <View style={styles.premiumFeatures}>
              <View style={styles.premiumFeature}>
                <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                <Text style={styles.premiumFeatureText}>
                  0% commissioni sulle vendite
                </Text>
              </View>
              <View style={styles.premiumFeature}>
                <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                <Text style={styles.premiumFeatureText}>
                  Risparmia il 15% su ogni transazione
                </Text>
              </View>
              <View style={styles.premiumFeature}>
                <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                <Text style={styles.premiumFeatureText}>
                  Supporto prioritario
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.premiumButton}
              onPress={handleUpgradePremium}
              disabled={upgrading}
            >
              {upgrading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.premiumButtonText}>Acquista Premium</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Commission Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Commissioni</Text>
        <View style={styles.infoCard}>
          <View style={styles.commissionRow}>
            <Text style={styles.commissionLabel}>Il tuo stato:</Text>
            <Text
              style={[
                styles.commissionValue,
                { color: userData?.isPremium ? '#4CAF50' : '#f4a460' },
              ]}
            >
              {userData?.isPremium ? '0%' : '15%'}
            </Text>
          </View>
          <Text style={styles.commissionNote}>
            {userData?.isPremium
              ? 'Come utente Premium, non paghi commissioni sulle vendite!'
              : 'Gli utenti Free pagano il 15% di commissione. Diventa Premium per azzerare le commissioni!'}
          </Text>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Le mie attività</Text>
        
        <TouchableOpacity 
          style={styles.menuItem}
          onPress={() => router.push('/my-sales')}
        >
          <View style={styles.menuItemIcon}>
            <Ionicons name="pricetag" size={20} color="#1a472a" />
          </View>
          <View style={styles.menuItemContent}>
            <Text style={styles.menuItemTitle}>Le mie vendite</Text>
            <Text style={styles.menuItemSubtitle}>Gestisci i libri in vendita e le consegne</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#999" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.menuItem}
          onPress={() => router.push('/my-purchases')}
        >
          <View style={[styles.menuItemIcon, { backgroundColor: '#e8f5e9' }]}>
            <Ionicons name="cart" size={20} color="#4CAF50" />
          </View>
          <View style={styles.menuItemContent}>
            <Text style={styles.menuItemTitle}>I miei acquisti</Text>
            <Text style={styles.menuItemSubtitle}>Stato degli ordini e codici ritiro</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#999" />
        </TouchableOpacity>

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

      {/* Actions */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#ff4444" />
          <Text style={styles.logoutButtonText}>Esci</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>ScambiaLibri v1.0</Text>
        <Text style={styles.footerSubtext}>
          La piattaforma per lo scambio di libri scolastici
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
    backgroundColor: '#1a472a',
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
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
    color: '#fff',
  },
  userUsername: {
    fontSize: 14,
    color: '#a8d5ba',
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
    marginTop: 12,
    gap: 6,
  },
  editProfileButtonText: {
    color: '#1a472a',
    fontWeight: '600',
    fontSize: 14,
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
    marginHorizontal: 4,
  },
  bookFlowHeader: {
    padding: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  bookFlowHeaderText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
  },
  bookFlowHeaderClass: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  bookFlowBody: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    alignItems: 'center',
  },
  bookFlowStat: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  bookFlowNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  bookFlowLabel: {
    fontSize: 10,
    color: '#666',
    textAlign: 'center',
    marginTop: 2,
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
});
