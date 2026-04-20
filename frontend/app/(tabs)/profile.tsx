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
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Helper function per convertire numeri in parole italiane
const getClasseLabel = (classe: number | string): string => {
  const classeNum = typeof classe === 'string' ? parseInt(classe) : classe;
  const nomiClassi: { [key: number]: string } = {
    1: 'PRIMA',
    2: 'SECONDA', 
    3: 'TERZA',
    4: 'QUARTA',
    5: 'QUINTA',
  };
  return nomiClassi[classeNum] || `${classeNum}ª`;
};

// Cross-platform confirm dialog
const showConfirm = (title: string, message: string, onConfirm: () => void, destructive = false) => {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
  } else {
    Alert.alert(title, message, [
      { text: 'Annulla', style: 'cancel' },
      { text: destructive ? 'Elimina' : 'Conferma', style: destructive ? 'destructive' : 'default', onPress: onConfirm },
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
  const [childProfiles, setChildProfiles] = useState<any[]>([]);
  const [childrenCompatibility, setChildrenCompatibility] = useState<{[key: string]: any}>({});
  const [downloadingPdf, setDownloadingPdf] = useState<string | null>(null);

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

      // Get child profiles from user data
      const profili = response.data.profili_figli || [];
      setChildProfiles(profili);

      // Load analysis for each child profile (usa /analysis come il Radar)
      const compatibilityData: {[key: string]: any} = {};
      for (const child of profili) {
        try {
          const compRes = await axios.get(
            `${API_URL}/api/profiles/${userId}/children/${child.id}/analysis`
          );
          compatibilityData[child.id] = compRes.data;
        } catch (e) {
          console.log(`Failed to load analysis for ${child.nome_figlio}`);
        }
      }
      setChildrenCompatibility(compatibilityData);

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
    showConfirm(
      'Esci',
      'Sei sicuro di voler uscire?',
      async () => {
        await AsyncStorage.multiRemove([
          'user_id',
          'username',
          'user_nome',
          'is_premium',
        ]);
        router.replace('/');
      },
      true
    );
  };

  // Download PDF lista libri
  const downloadPdf = async (childId: string, childName: string, childClasse: string) => {
    setDownloadingPdf(childId);
    try {
      const userId = await AsyncStorage.getItem('user_id');
      const pdfUrl = `${API_URL}/api/profiles/${userId}/children/${childId}/books-pdf`;
      
      if (Platform.OS === 'web') {
        // On web, open PDF in new tab
        window.open(pdfUrl, '_blank');
      } else {
        // On mobile, download and share
        const filename = `lista_libri_${childName}_${childClasse}.pdf`;
        const fileUri = FileSystem.documentDirectory + filename;
        
        const downloadResult = await FileSystem.downloadAsync(pdfUrl, fileUri);
        
        if (downloadResult.status === 200) {
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(downloadResult.uri, {
              mimeType: 'application/pdf',
              dialogTitle: 'Condividi Lista Libri'
            });
          } else {
            showAlert('PDF Scaricato', `File salvato: ${filename}`);
          }
        } else {
          showAlert('Errore', 'Impossibile scaricare il PDF');
        }
      }
    } catch (error) {
      console.error('Error downloading PDF:', error);
      showAlert('Errore', 'Impossibile generare il PDF');
    } finally {
      setDownloadingPdf(null);
    }
  };

  // Elimina profilo figlio
  const handleDeleteProfile = async (childId: string, childName: string) => {
    showConfirm(
      'Elimina Profilo',
      `Sei sicuro di voler eliminare il profilo di ${childName}?\n\nQuesta azione non può essere annullata.`,
      async () => {
        try {
          const userId = await AsyncStorage.getItem('user_id');
          await axios.delete(`${API_URL}/api/users/${userId}/profiles/${childId}`);
          
          // Ricarica i dati
          loadUserData();
          showAlert('Successo', `Profilo di ${childName} eliminato`);
        } catch (error: any) {
          console.error('Error deleting profile:', error);
          showAlert('Errore', error.response?.data?.detail || 'Impossibile eliminare il profilo');
        }
      },
      true
    );
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
            <Ionicons name="log-out-outline" size={16} color="#ff4444" />
            <Text style={styles.logoutHeaderButtonText}>Esci</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Child Profiles with Book Flow */}
      {childProfiles.length > 0 && (
        <View style={styles.bookFlowSection}>
          {childProfiles.map((child) => {
            const compatibility = childrenCompatibility[child.id];
            if (!compatibility) return null;
            
            const isMedia = child.tipo_scuola === 'primo_grado';
            const tipoLabel = isMedia ? 'MEDIA' : 'SUP';
            const tipoScuolaLabel = isMedia ? 'Scuola Media' : 'Scuola Superiore';
            
            return (
              <View key={child.id} style={styles.childBookFlowCard}>
                {/* Child Header - Nome scuola prima riga, classe/sezione seconda riga */}
                <View style={styles.childHeader}>
                  <View style={styles.childNameBadge}>
                    <Ionicons name="person" size={16} color="#fff" />
                    <Text style={styles.childNameText}>{child.nome_figlio}</Text>
                  </View>
                  <Text style={styles.childSchoolTextBold} numberOfLines={1}>
                    {child.scuola}
                  </Text>
                  <Text style={styles.childClassText}>
                    classe {child.classe}ª sezione {child.sezione}
                  </Text>
                </View>
                
                {/* Three Column Layout */}
                <View style={styles.bookFlowContainer}>
                  {/* LEFT - VENDI (Cliccabile → vai a Sell Tab) */}
                  <TouchableOpacity 
                    style={styles.bookFlowColumn}
                    onPress={() => router.push('/(tabs)/sell')}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.bookFlowHeader, { backgroundColor: '#2196F3' }]}>
                      <Text style={styles.bookFlowHeaderClass}>
                        {compatibility.vendere?.classe_destinazione 
                          ? getClasseLabel(compatibility.vendere.classe_destinazione)
                          : 'N/A'}
                      </Text>
                    </View>
                    <View style={styles.bookFlowBody}>
                      <Ionicons name="arrow-up-circle" size={24} color="#2196F3" />
                      <Text style={[styles.bookFlowAction, { color: '#2196F3' }]}>VENDI</Text>
                      <Text style={[styles.bookFlowNumber, { color: '#2196F3' }]}>
                        {compatibility.vendere?.totale_vendibili || 0}
                      </Text>
                      <Text style={styles.bookFlowLabel}>libri</Text>
                    </View>
                    {/* Totale ipotetico ricavo */}
                    <Text style={[styles.bookFlowHint, { color: '#2196F3', fontWeight: '600' }]}>
                      Ricavo: €{((compatibility.vendere?.totale_vendibili || 0) * 8).toFixed(0)}
                    </Text>
                    {(compatibility.vendere?.totale_non_vendibili || 0) > 0 && (
                      <Text style={[styles.bookFlowHint, { color: '#f44336' }]}>
                        {compatibility.vendere?.totale_non_vendibili} ed. cambiate
                      </Text>
                    )}
                  </TouchableOpacity>

                  {/* CENTER - Iniziale del nome nel header */}
                  <View style={styles.bookFlowColumn}>
                    <View style={[styles.bookFlowHeader, { backgroundColor: '#1a472a' }]}>
                      <Text style={styles.bookFlowHeaderClass}>
                        {child.nome_figlio?.charAt(0) || '?'}
                      </Text>
                    </View>
                    <View style={styles.bookFlowBody}>
                      <Ionicons name="book" size={28} color="#FF9800" />
                      <Text style={[styles.bookFlowAction, { color: '#FF9800' }]}>NUOVI</Text>
                      <Text style={[styles.bookFlowNumber, { color: '#FF9800' }]}>
                        {compatibility.nuovi?.totale || 0}
                      </Text>
                      <Text style={styles.bookFlowLabel}>da comprare</Text>
                    </View>
                    <Text style={styles.bookFlowHint}>
                      €{compatibility.nuovi?.costo_totale?.toFixed(0) || 0}
                    </Text>
                  </View>

                  {/* RIGHT - COMPRA (Cliccabile → vai a Search Tab) */}
                  <TouchableOpacity 
                    style={styles.bookFlowColumn}
                    onPress={() => router.push('/(tabs)/search')}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.bookFlowHeader, { backgroundColor: '#4CAF50' }]}>
                      <Text style={styles.bookFlowHeaderClass}>
                        {compatibility.comprare?.classe_origine 
                          ? getClasseLabel(compatibility.comprare.classe_origine)
                          : 'N/A'}
                      </Text>
                    </View>
                    <View style={styles.bookFlowBody}>
                      <Ionicons name="cart" size={24} color="#4CAF50" />
                      <Text style={[styles.bookFlowAction, { color: '#4CAF50' }]}>COMPRA</Text>
                      <Text style={[styles.bookFlowNumber, { color: '#4CAF50' }]}>
                        {compatibility.comprare?.totale_usati || 0}
                      </Text>
                      <Text style={styles.bookFlowLabel}>usati</Text>
                    </View>
                    {/* Spesa ipotetica per libri usati */}
                    <Text style={[styles.bookFlowHint, { color: '#4CAF50', fontWeight: '600' }]}>
                      Spesa: €{((compatibility.comprare?.totale_usati || 0) * 10).toFixed(0)}
                    </Text>
                  </TouchableOpacity>
                </View>
                
                {/* TOTALE PARZIALE SPESA per questo profilo */}
                {(() => {
                  // COSTO TOTALE SE TUTTI I TESTI FOSSERO ACQUISTATI NUOVI
                  // Include tutti i libri da comprare (usati + nuovi) calcolati a prezzo di copertina
                  const totaleSeTuttiNuovi = compatibility.tetto_spesa?.costo_obbligatori || 0;
                  
                  // Numero totale libri da acquistare
                  const numLibriUsati = compatibility.comprare?.totale_usati || 0;
                  const numLibriNuovi = compatibility.nuovi?.totale || 0;
                  const totaleLibriDaComprare = numLibriUsati + numLibriNuovi;
                  
                  // TOTALE IPOTETICO: con libri usati (risparmio usando usati)
                  const costoUsatiParziale = (compatibility.comprare?.totale_usati || 0) * 10; // €10 per libro usato
                  const costoNuoviObbligatori = compatibility.nuovi?.costo_totale || 0;
                  const ricavoParziale = (compatibility.vendere?.totale_vendibili || 0) * 8; // €8 ricavo per libro venduto
                  const spesaNettaParziale = costoUsatiParziale + costoNuoviObbligatori - ricavoParziale;
                  
                  return (
                    <View style={styles.partialTotalBoxExpanded}>
                      {/* TOTALE SE TUTTI NUOVI */}
                      <View style={styles.totalNuoviRow}>
                        <Ionicons name="book" size={18} color="#1a472a" />
                        <Text style={styles.totalNuoviLabelBold}>
                          TOTALE TESTI NUOVI ({totaleLibriDaComprare}):
                        </Text>
                        <Text style={styles.totalNuoviValueBold}>
                          €{totaleSeTuttiNuovi.toFixed(2)}
                        </Text>
                      </View>
                      <Text style={[styles.partialTotalDetail, { marginBottom: 8, color: '#666' }]}>
                        (se acquistati tutti a prezzo di copertina)
                      </Text>
                      
                      {/* SPESA STIMATA - con libri usati */}
                      <View style={[styles.partialTotalRow, { paddingTop: 8, borderTopWidth: 1, borderTopColor: '#eee' }]}>
                        <Ionicons name="calculator-outline" size={18} color="#4CAF50" />
                        <Text style={[styles.partialTotalLabel, { color: '#4CAF50' }]}>SPESA STIMATA:</Text>
                        <Text style={[styles.partialTotalValue, { color: '#4CAF50', fontWeight: 'bold' }]}>
                          €{Math.abs(spesaNettaParziale).toFixed(0)} {spesaNettaParziale < 0 ? '(guadagno)' : ''}
                        </Text>
                      </View>
                      <Text style={styles.partialTotalDetail}>
                        (Usati €{costoUsatiParziale} + Nuovi €{costoNuoviObbligatori.toFixed(0)} - Ricavo €{ricavoParziale})
                      </Text>
                    </View>
                  );
                })()}
                
                {/* PDF Download Button */}
                <TouchableOpacity
                  style={styles.pdfDownloadButton}
                  onPress={() => downloadPdf(child.id, child.nome_figlio, `${child.classe}${tipoLabel}`)}
                  disabled={downloadingPdf === child.id}
                >
                  {downloadingPdf === child.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="document-text" size={20} color="#fff" />
                      <Text style={styles.pdfDownloadButtonText}>Scarica Lista Libri (PDF)</Text>
                    </>
                  )}
                </TouchableOpacity>
                
                {/* Delete Profile Button */}
                <TouchableOpacity
                  style={styles.deleteProfileButton}
                  onPress={() => handleDeleteProfile(child.id, child.nome_figlio)}
                >
                  <Ionicons name="trash-outline" size={18} color="#f44336" />
                  <Text style={styles.deleteProfileButtonText}>Elimina Profilo</Text>
                </TouchableOpacity>
              </View>
            );
          })}

          {/* Riepilogo Totale con 3 caselle come i figli */}
          {childProfiles.length > 0 && (
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>📊 Riepilogo Totale</Text>
              
              {(() => {
                // Calculate totals across all children
                let totaleVendibili = 0;
                let totaleAcquistabili = 0;
                let totaleNuovi = 0;
                let costoUsati = 0;
                let costoNuovi = 0;
                let guadagnoVendite = 0;

                Object.values(childrenCompatibility).forEach((comp: any) => {
                  totaleVendibili += comp.vendere?.totale_vendibili || 0;
                  totaleAcquistabili += comp.comprare?.totale_usati || 0;
                  totaleNuovi += comp.nuovi?.totale || 0;
                  
                  // Costo libri usati (somma prezzo_usato)
                  if (comp.comprare?.libri_usati) {
                    comp.comprare.libri_usati.forEach((libro: any) => {
                      costoUsati += libro.prezzo_usato || 0;
                    });
                  }
                  
                  costoNuovi += comp.nuovi?.costo_totale || 0;
                  
                  // Guadagno dalla vendita (somma prezzo_consigliato)
                  if (comp.vendere?.libri_vendibili) {
                    comp.vendere.libri_vendibili.forEach((libro: any) => {
                      guadagnoVendite += libro.prezzo_consigliato || 0;
                    });
                  }
                });

                const totaleSpesa = costoUsati + costoNuovi - guadagnoVendite;

                return (
                  <>
                    {/* Three Column Layout - same style as child cards */}
                    <View style={styles.bookFlowContainer}>
                      {/* VENDI - BLU (GUADAGNO +) */}
                      <View style={styles.bookFlowColumn}>
                        <View style={[styles.bookFlowHeader, { backgroundColor: '#2196F3' }]}>
                          <Text style={styles.bookFlowHeaderClass}>VENDI</Text>
                        </View>
                        <View style={styles.bookFlowBody}>
                          <Ionicons name="arrow-up-circle" size={24} color="#2196F3" />
                          <Text style={[styles.bookFlowNumber, { color: '#2196F3' }]}>
                            {totaleVendibili}
                          </Text>
                          <Text style={styles.bookFlowLabel}>libri</Text>
                        </View>
                        <Text style={[styles.bookFlowHint, { color: '#4CAF50', fontWeight: '600' }]}>
                          {guadagnoVendite > 0 ? `+ €${guadagnoVendite.toFixed(0)}` : '€0'}
                        </Text>
                      </View>

                      {/* NUOVI - NERO (SPESA -) */}
                      <View style={styles.bookFlowColumn}>
                        <View style={[styles.bookFlowHeader, { backgroundColor: '#1a472a' }]}>
                          <Text style={styles.bookFlowHeaderClass}>NUOVI</Text>
                        </View>
                        <View style={styles.bookFlowBody}>
                          <Ionicons name="book" size={24} color="#FF9800" />
                          <Text style={[styles.bookFlowNumber, { color: '#FF9800' }]}>
                            {totaleNuovi}
                          </Text>
                          <Text style={styles.bookFlowLabel}>da comprare</Text>
                        </View>
                        <Text style={[styles.bookFlowHint, { color: '#f44336', fontWeight: '600' }]}>
                          - €{costoNuovi.toFixed(0)}
                        </Text>
                      </View>

                      {/* COMPRA USATI - VERDE (SPESA -) */}
                      <View style={styles.bookFlowColumn}>
                        <View style={[styles.bookFlowHeader, { backgroundColor: '#4CAF50' }]}>
                          <Text style={styles.bookFlowHeaderClass}>USATI</Text>
                        </View>
                        <View style={styles.bookFlowBody}>
                          <Ionicons name="cart" size={24} color="#4CAF50" />
                          <Text style={[styles.bookFlowNumber, { color: '#4CAF50' }]}>
                            {totaleAcquistabili}
                          </Text>
                          <Text style={styles.bookFlowLabel}>da comprare</Text>
                        </View>
                        <Text style={[styles.bookFlowHint, { color: '#f44336', fontWeight: '600' }]}>
                          - €{costoUsati.toFixed(0)}
                        </Text>
                      </View>
                    </View>

                    {/* TOTALE SPESA sotto le caselle */}
                    <View style={styles.totalBalanceRow}>
                      <View style={styles.totalBalanceContent}>
                        <Text style={styles.totalBalanceLabel}>TOTALE SPESA</Text>
                        <Text style={[styles.totalBalanceAmount, { color: '#2196F3' }]}>
                          €{totaleSpesa.toFixed(0)}
                        </Text>
                      </View>
                    </View>
                  </>
                );
              })()}
            </View>
          )}

          {/* Pulsante Aggiungi Profilo */}
          <TouchableOpacity 
            style={styles.addProfileButton}
            onPress={() => router.push('/profiles/manage')}
          >
            <Ionicons name="add-circle" size={24} color="#1a472a" />
            <Text style={styles.addProfileButtonText}>Aggiungi profilo figlio</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Add first child if no children */}
      {childProfiles.length === 0 && (
        <View style={styles.section}>
          <TouchableOpacity 
            style={styles.addProfileButton}
            onPress={() => router.push('/profiles/manage')}
          >
            <Ionicons name="add-circle" size={24} color="#1a472a" />
            <Text style={styles.addProfileButtonText}>Aggiungi profilo figlio</Text>
          </TouchableOpacity>
        </View>
      )}

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
    backgroundColor: '#1a472a',
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    position: 'relative',
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
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,100,100,0.5)',
  },
  logoutHeaderButtonText: {
    color: '#ff6666',
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
});
