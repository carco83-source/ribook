import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Linking,
  Platform,
  Alert,
  ImageBackground,
  ActionSheetIOS,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import * as WebBrowser from 'expo-web-browser';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';

interface ChildProfile {
  id: string;
  nome_figlio: string;
  scuola: string;
  codice_scuola: string;
  classe: string;
  sezione: string;
  tipo_scuola: string;
}

interface CompatibilityData {
  nuovi?: {
    totale: number;
    costo_totale: number;
    libri?: any[];
  };
  vendere?: {
    totale_vendibili: number;
    totale_non_vendibili?: number;
    classe_destinazione: number;
    libri_vendibili?: any[];
  };
  comprare?: {
    totale_usati: number;
    risparmio_totale: number;
    classe_origine: number;
    libri_usati?: any[];
  };
  nuove_adozioni?: {
    totale: number;
    libri?: any[];
  };
  libri_gia_posseduti?: any[];
  tetto_spesa?: {
    tetto_ministeriale: number;
    tetto_con_deroga_10: number;
    tetto_con_deroga_15: number;
    costo_obbligatori: number;
    costo_consigliati: number;
    costo_totale_tutti: number;
    entro_limite: boolean;
    entro_deroga_15: boolean;
    percentuale_sforamento: number;
    differenza: number;
    riferimento_normativo: string;
  };
}

interface SchoolData {
  codice_scuola: string;
  denominazione: string;
  indirizzo: string;
  cap: string;
  comune: string;
  provincia: string;
  tipo_scuola: string;
  email?: string;
  telefono?: string;
}

const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

export default function StudentDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [child, setChild] = useState<ChildProfile | null>(null);
  const [compatibility, setCompatibility] = useState<CompatibilityData | null>(null);
  const [schoolData, setSchoolData] = useState<SchoolData | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      if (!storedUserId) {
        router.replace('/');
        return;
      }
      setUserId(storedUserId);

      // Get user data with child profiles
      const userResponse = await axios.get(`${API_URL}/api/users/${storedUserId}`);
      const profili = userResponse.data.profili_figli || [];
      const childProfile = profili.find((p: any) => p.id === id);
      
      if (!childProfile) {
        router.back();
        return;
      }
      setChild(childProfile);

      // Load compatibility data
      try {
        const compRes = await axios.get(
          `${API_URL}/api/profiles/${storedUserId}/children/${id}/analysis`
        );
        setCompatibility(compRes.data);
      } catch (e) {
        console.log('Failed to load analysis');
      }

      // Load school data
      try {
        const schoolRes = await axios.get(`${API_URL}/api/schools/${childProfile.codice_scuola}`);
        setSchoolData(schoolRes.data);
      } catch (e) {
        // Build basic school data from child profile
        setSchoolData({
          codice_scuola: childProfile.codice_scuola,
          denominazione: childProfile.scuola,
          indirizzo: '',
          cap: '',
          comune: 'Catanzaro',
          provincia: 'CZ',
          tipo_scuola: childProfile.tipo_scuola,
        });
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Download PDF directly
  const downloadPdf = async () => {
    if (!child) {
      showAlert('Errore', 'Dati studente non caricati');
      return;
    }
    if (!userId) {
      showAlert('Errore', 'Sessione non valida. Rieffettua il login.');
      return;
    }
    
    setDownloadingPdf(true);
    try {
      const isMedia = child.tipo_scuola === 'primo_grado';
      const tipoLabel = isMedia ? 'MEDIA' : 'SUP';
      const pdfUrl = `${API_URL}/api/profiles/${userId}/children/${child.id}/books-pdf`;
      const filename = `lista_libri_${child.nome_figlio}_${child.classe}${tipoLabel}.pdf`;
      
      console.log('PDF URL:', pdfUrl);
      console.log('userId:', userId);
      console.log('childId:', child.id);
      
      if (Platform.OS === 'web') {
        // Apri direttamente l'URL del PDF in una nuova scheda
        window.open(pdfUrl, '_blank');
      } else {
        // Su iOS e Android: scarica il file e poi condividi
        const fileUri = FileSystem.cacheDirectory + filename;
        
        console.log('Downloading to:', fileUri);
        const downloadResult = await FileSystem.downloadAsync(pdfUrl, fileUri);
        console.log('Download result:', downloadResult.status);
        
        if (downloadResult.status === 200) {
          // Condividi il file - funziona su iOS e Android
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(downloadResult.uri, {
              mimeType: 'application/pdf',
              dialogTitle: 'Condividi Lista Libri PDF',
              UTI: 'com.adobe.pdf' // Importante per iOS
            });
          } else {
            showAlert('Errore', 'Condivisione non disponibile su questo dispositivo');
          }
        } else {
          showAlert('Errore', `Impossibile scaricare il PDF (${downloadResult.status})`);
        }
      }
    } catch (error) {
      console.error('Error downloading PDF:', error);
      showAlert('Errore', `Errore: ${error instanceof Error ? error.message : 'Sconosciuto'}`);
    } finally {
      setDownloadingPdf(false);
    }
  };

  const getClasseLabel = (classe: number | string): string => {
    const classeNum = typeof classe === 'string' ? parseInt(classe) : classe;
    const nomiClassi: { [key: number]: string } = {
      1: 'Prima',
      2: 'Seconda', 
      3: 'Terza',
      4: 'Quarta',
      5: 'Quinta',
    };
    return nomiClassi[classeNum] || `${classeNum}ª`;
  };

  const getTipoScuolaLabel = (tipo: string): string => {
    return tipo === 'primo_grado' ? 'Scuola Media' : 'Scuola Superiore';
  };

  const openMaps = () => {
    if (schoolData?.indirizzo) {
      const address = encodeURIComponent(`${schoolData.indirizzo}, ${schoolData.comune}`);
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${address}`);
    }
  };

  // Calcolo corretto dei totali - NUOVA LOGICA v2 con useMemo
  const totals = React.useMemo(() => {
    if (!compatibility) {
      console.log('[calculateTotals] No compatibility data');
      return null;
    }
    
    // Nuova struttura v2
    const riepilogo = compatibility.riepilogo;
    if (!riepilogo) {
      console.log('[calculateTotals] No riepilogo in compatibility');
      return null;
    }
    
    console.log('[calculateTotals] Riepilogo:', JSON.stringify(riepilogo));
    
    // Libri da comprare usati
    const libriUsati = compatibility.da_acquistare_usati || [];
    const costoUsati = parseFloat(String(riepilogo.costo_usati)) || 0;
    
    // Libri da comprare nuovi
    const libriNuovi = compatibility.da_acquistare_nuovi || [];
    const costoNuovi = parseFloat(String(riepilogo.costo_nuovi)) || 0;
    
    // Calcola il costo totale se tutti i libri fossero comprati nuovi
    // ESCLUDI i libri di strumento musicale dal calcolo
    const costoUsatiSeNuovi = libriUsati.reduce((sum: number, libro: any) => {
      // Salta libri di strumento musicale
      if (libro.is_strumento_musicale || libro.escluso_dal_calcolo) {
        return sum;
      }
      const prezzo = parseFloat(String(libro.prezzo)) || 0;
      return sum + prezzo;
    }, 0);
    
    // Calcola anche il costo nuovi senza strumenti musicali
    const costoNuoviSenzaStrumenti = libriNuovi.reduce((sum: number, libro: any) => {
      if (libro.is_strumento_musicale || libro.escluso_dal_calcolo) {
        return sum;
      }
      const prezzo = parseFloat(String(libro.prezzo)) || 0;
      return sum + prezzo;
    }, 0);
    
    const totaleSeTuttiNuovi = costoUsatiSeNuovi + costoNuoviSenzaStrumenti;
    
    // Conta libri strumento esclusi
    const strumentiEsclusi = riepilogo.libri_strumento_esclusi || 0;
    
    console.log('[calculateTotals] Costs:', { costoUsatiSeNuovi, costoNuovi, totaleSeTuttiNuovi, strumentiEsclusi });
    
    // Numero totale libri da acquistare
    const numLibriUsati = riepilogo.totale_da_comprare_usati || 0;
    const numLibriNuovi = riepilogo.totale_da_comprare_nuovi || 0;
    const totaleLibriDaComprare = numLibriUsati + numLibriNuovi;
    
    // Potenziale vendita
    const potenzVendita = parseFloat(String(riepilogo.potenziale_vendita)) || 0;
    
    // Risparmio
    const risparmio = parseFloat(String(riepilogo.risparmio_stimato)) || 0;
    
    // Spesa netta = costo usati + costo nuovi - ricavo vendita
    const spesaNetta = costoUsati + costoNuovi - potenzVendita;
    
    return {
      totaleSeTuttiNuovi,
      totaleLibriDaComprare,
      costoUsatiReale: costoUsati,
      costoNuoviReale: costoNuovi,
      ricavoParziale: potenzVendita,
      risparmioStimato: risparmio,
      spesaNetta,
      numLibriUsati,
      numLibriNuovi,
      strumentiEsclusi,
    };
  }, [compatibility]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a472a" />
      </View>
    );
  }

  if (!child) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="alert-circle-outline" size={64} color="#ccc" />
        <Text style={styles.errorText}>Alunno non trovato</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Torna indietro</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isMedia = child.tipo_scuola === 'primo_grado';
  // Ora totals viene calcolato con useMemo sopra

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{ 
          title: child.nome_figlio,
          headerStyle: { backgroundColor: '#1a472a' },
          headerTintColor: '#fff',
          headerLeft: () => (
            <TouchableOpacity 
              onPress={() => router.back()} 
              style={{ marginLeft: 8, padding: 8 }}
            >
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          ),
        }} 
      />

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header Alunno con Logo RiBook */}
        <ImageBackground 
          source={require('../../assets/images/ribook-text-only.png')}
          style={styles.studentHeaderBg}
          imageStyle={styles.studentHeaderImage}
          resizeMode="contain"
        >
          <View style={styles.studentHeaderOverlay}>
            <View style={styles.studentAvatar}>
              <Text style={styles.studentInitial}>{child.nome_figlio.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.studentInfo}>
              <Text style={styles.studentName}>{child.nome_figlio}</Text>
              <Text style={styles.studentClass}>
                Classe {getClasseLabel(child.classe)} sezione {child.sezione}
              </Text>
              <View style={styles.schoolTypeBadge}>
                <Text style={styles.schoolTypeText}>{getTipoScuolaLabel(child.tipo_scuola)}</Text>
              </View>
            </View>
          </View>
        </ImageBackground>

        {/* Dati Scuola */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="school" size={22} color="#1a472a" />
            <Text style={styles.sectionTitle}>Scuola</Text>
          </View>
          
          <View style={styles.schoolCard}>
            <Text style={styles.schoolName}>{schoolData?.denominazione || child.scuola}</Text>
            
            <View style={styles.schoolDetail}>
              <Ionicons name="barcode-outline" size={18} color="#666" />
              <Text style={styles.schoolDetailLabel}>Codice Ministeriale:</Text>
              <Text style={styles.schoolDetailValue}>{child.codice_scuola}</Text>
            </View>
            
            {schoolData?.indirizzo && (
              <TouchableOpacity style={styles.schoolDetail} onPress={openMaps}>
                <Ionicons name="location-outline" size={18} color="#666" />
                <Text style={styles.schoolDetailLabel}>Indirizzo:</Text>
                <Text style={[styles.schoolDetailValue, styles.linkText]}>
                  {schoolData.indirizzo}, {schoolData.cap} {schoolData.comune}
                </Text>
                <Ionicons name="open-outline" size={14} color="#2196F3" />
              </TouchableOpacity>
            )}
            
            {schoolData?.telefono && (
              <View style={styles.schoolDetail}>
                <Ionicons name="call-outline" size={18} color="#666" />
                <Text style={styles.schoolDetailLabel}>Tel:</Text>
                <Text style={styles.schoolDetailValue}>{schoolData.telefono}</Text>
              </View>
            )}
            
            {schoolData?.email && (
              <View style={styles.schoolDetail}>
                <Ionicons name="mail-outline" size={18} color="#666" />
                <Text style={styles.schoolDetailLabel}>Email:</Text>
                <Text style={styles.schoolDetailValue}>{schoolData.email}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Tetto di Spesa Ministeriale */}
        {compatibility?.tetto_spesa && compatibility.tetto_spesa.tetto_ministeriale > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="document-text-outline" size={22} color="#1a472a" />
              <Text style={styles.sectionTitle}>Tetto di Spesa Ministeriale</Text>
            </View>
            
            <View style={styles.tettoCard}>
              {/* Riferimento Normativo */}
              <View style={styles.tettoLawBox}>
                <Ionicons name="information-circle" size={20} color="#1976D2" />
                <View style={styles.tettoLawContent}>
                  <Text style={styles.tettoLawTitle}>Riferimento Normativo</Text>
                  <Text style={styles.tettoLawText}>
                    {compatibility.tetto_spesa.riferimento_normativo || 
                     'D.M. n. 781 del 27/09/2013 - Art. 3'}
                  </Text>
                  <Text style={styles.tettoLawDesc}>
                    Definizione dei tetti di spesa per i libri di testo della scuola secondaria
                  </Text>
                </View>
              </View>
              
              {/* Valori del Tetto */}
              <View style={styles.tettoValuesContainer}>
                {/* Tetto Base */}
                <View style={[styles.tettoValueBox, styles.tettoValuePrimary]}>
                  <Text style={styles.tettoValueLabel}>TETTO BASE</Text>
                  <Text style={styles.tettoValueAmount}>
                    €{compatibility.tetto_spesa.tetto_ministeriale.toFixed(2)}
                  </Text>
                  <Text style={styles.tettoValueNote}>Limite ministeriale</Text>
                </View>
                
                {/* Deroga +10% */}
                <View style={[styles.tettoValueBox, styles.tettoValueSecondary]}>
                  <Text style={styles.tettoValueLabel}>DEROGA +10%</Text>
                  <Text style={styles.tettoValueAmountSmall}>
                    €{compatibility.tetto_spesa.tetto_con_deroga_10.toFixed(2)}
                  </Text>
                  <Text style={styles.tettoValueNote}>Per nuove adozioni</Text>
                </View>
                
                {/* Deroga +15% */}
                <View style={[styles.tettoValueBox, styles.tettoValueTertiary]}>
                  <Text style={styles.tettoValueLabel}>DEROGA MAX +15%</Text>
                  <Text style={styles.tettoValueAmountSmall}>
                    €{compatibility.tetto_spesa.tetto_con_deroga_15.toFixed(2)}
                  </Text>
                  <Text style={styles.tettoValueNote}>Limite massimo</Text>
                </View>
              </View>
              
              {/* Info Aggiuntive */}
              <View style={styles.tettoInfoBox}>
                <Text style={styles.tettoInfoText}>
                  Il tetto di spesa è stabilito dal Ministero dell'Istruzione e varia in base 
                  alla classe e al tipo di scuola. Le deroghe sono consentite per nuove adozioni 
                  o per particolari esigenze didattiche.
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Spesa Libri di Testo - CALCOLATA CORRETTAMENTE */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="calculator-outline" size={22} color="#1a472a" />
            <Text style={styles.sectionTitle}>Spesa Libri di Testo</Text>
          </View>
          
          <View style={styles.spesaCard}>
            {totals && (
              <>
                {/* Totale Testi Nuovi */}
                <View style={styles.spesaRow}>
                  <View style={styles.spesaIcon}>
                    <Ionicons name="book" size={24} color="#FF9800" />
                  </View>
                  <View style={styles.spesaInfo}>
                    <Text style={styles.spesaLabel}>TOTALE TESTI NUOVI</Text>
                    <Text style={styles.spesaSubLabel}>
                      ({totals.totaleLibriDaComprare} libri)
                    </Text>
                    <Text style={styles.spesaNote}>
                      (se acquistati tutti a prezzo di copertina)
                    </Text>
                    {totals.strumentiEsclusi > 0 && (
                      <Text style={[styles.spesaNote, { color: '#9C27B0', fontStyle: 'italic' }]}>
                        * Esclusi {totals.strumentiEsclusi} libri strumento musicale
                      </Text>
                    )}
                  </View>
                  <Text style={styles.spesaAmount}>
                    €{totals.totaleSeTuttiNuovi.toFixed(2)}
                  </Text>
                </View>

                {/* Divider */}
                <View style={styles.divider} />

                {/* Spesa Stimata con RiLiBro */}
                <View style={styles.spesaRow}>
                  <View style={[styles.spesaIcon, { backgroundColor: '#e8f5e9' }]}>
                    <Ionicons name="trending-down" size={24} color="#4CAF50" />
                  </View>
                  <View style={styles.spesaInfo}>
                    <Text style={[styles.spesaLabel, { color: '#4CAF50' }]}>SPESA STIMATA</Text>
                    <Text style={styles.spesaSubLabel}>
                      (Usati €{totals.costoUsatiReale.toFixed(0)} + Nuovi €{totals.costoNuoviReale.toFixed(0)} - Ricavo €{totals.ricavoParziale})
                    </Text>
                  </View>
                  <Text style={[styles.spesaAmount, { color: totals.spesaNetta < 0 ? '#4CAF50' : '#333' }]}>
                    €{Math.abs(totals.spesaNetta).toFixed(0)}{totals.spesaNetta < 0 ? ' (guadagno)' : ''}
                  </Text>
                </View>

                {/* Status Box basato su tetto ministeriale */}
                {compatibility?.tetto_spesa && (
                  <View style={[
                    styles.statusBox,
                    { backgroundColor: compatibility.tetto_spesa.entro_limite ? '#e8f5e9' : 
                                     compatibility.tetto_spesa.entro_deroga_15 ? '#fff3e0' : '#ffebee' }
                  ]}>
                    {compatibility.tetto_spesa.entro_limite ? (
                      <View style={styles.statusContent}>
                        <Ionicons name="checkmark-circle" size={28} color="#4CAF50" />
                        <Text style={[styles.statusText, { color: '#4CAF50' }]}>ENTRO LIMITE MINISTERIALE</Text>
                      </View>
                    ) : compatibility.tetto_spesa.entro_deroga_15 ? (
                      <View style={styles.statusContent}>
                        <Ionicons name="warning" size={28} color="#FF9800" />
                        <View>
                          <Text style={[styles.statusText, { color: '#FF9800' }]}>SFORA IL TETTO</Text>
                          <Text style={styles.statusSubtext}>
                            +{compatibility.tetto_spesa.percentuale_sforamento.toFixed(1)}% (entro deroga)
                          </Text>
                        </View>
                      </View>
                    ) : (
                      <View style={styles.statusContent}>
                        <Ionicons name="alert-circle" size={28} color="#f44336" />
                        <View>
                          <Text style={[styles.statusText, { color: '#f44336' }]}>OLTRE LIMITE!</Text>
                          <Text style={styles.statusSubtext}>
                            +{compatibility.tetto_spesa.percentuale_sforamento?.toFixed(1) || 0}% (€{compatibility.tetto_spesa.differenza?.toFixed(2) || 0} in più)
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>
                )}
              </>
            )}
          </View>
        </View>

        {/* 4 Categorie Libri - NUOVA LOGICA v2 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="library" size={22} color="#1a472a" />
            <Text style={styles.sectionTitle}>Situazione Libri</Text>
          </View>
          
          <View style={styles.categoryGrid}>
            {/* 1. ANCORA IN USO - Libri che devi conservare */}
            <TouchableOpacity 
              style={[styles.categoryCard, { borderLeftColor: '#9C27B0' }]}
              onPress={() => {
                router.push(`/?childId=${id}&t=${Date.now()}`);
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.categoryIcon, { backgroundColor: '#f3e5f5' }]}>
                <Ionicons name="bookmark" size={28} color="#9C27B0" />
              </View>
              <View style={styles.categoryInfo}>
                <Text style={styles.categoryNumber}>{compatibility?.riepilogo?.totale_ancora_in_uso || 0}</Text>
                <Text style={styles.categoryLabel}>Ancora in uso</Text>
                <Text style={styles.categoryHint}>
                  Libri da conservare
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9C27B0" />
            </TouchableOpacity>

            {/* 2. VENDIBILI USATI - Libri che puoi vendere */}
            <TouchableOpacity 
              style={[styles.categoryCard, { borderLeftColor: '#2196F3' }]}
              onPress={() => {
                router.push(`/?childId=${id}&t=${Date.now()}`);
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.categoryIcon, { backgroundColor: '#e3f2fd' }]}>
                <Ionicons name="arrow-up-circle" size={28} color="#2196F3" />
              </View>
              <View style={styles.categoryInfo}>
                <Text style={styles.categoryNumber}>{compatibility?.riepilogo?.totale_vendibili || 0}</Text>
                <Text style={styles.categoryLabel}>Vendibili usati</Text>
                <Text style={styles.categoryHint}>
                  {compatibility?.riepilogo?.potenziale_vendita ? `Ricavo: €${compatibility.riepilogo.potenziale_vendita.toFixed(0)}` : 'Libri che puoi vendere'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#2196F3" />
            </TouchableOpacity>

            {/* 3. DA ACQUISTARE USATI */}
            <TouchableOpacity 
              style={[styles.categoryCard, { borderLeftColor: '#4CAF50' }]}
              onPress={() => {
                router.push(`/?childId=${id}&t=${Date.now()}`);
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.categoryIcon, { backgroundColor: '#e8f5e9' }]}>
                <Ionicons name="cart" size={28} color="#4CAF50" />
              </View>
              <View style={styles.categoryInfo}>
                <Text style={styles.categoryNumber}>{compatibility?.riepilogo?.totale_da_comprare_usati || 0}</Text>
                <Text style={styles.categoryLabel}>Da comprare usati</Text>
                <Text style={styles.categoryHint}>
                  {compatibility?.riepilogo?.risparmio_stimato ? `Risparmio: €${compatibility.riepilogo.risparmio_stimato.toFixed(0)}` : 'Disponibili usati'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#4CAF50" />
            </TouchableOpacity>

            {/* 4. DA ACQUISTARE NUOVI */}
            <TouchableOpacity 
              style={[styles.categoryCard, { borderLeftColor: '#FF9800' }]}
              onPress={() => {
                router.push(`/?childId=${id}&t=${Date.now()}`);
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.categoryIcon, { backgroundColor: '#fff3e0' }]}>
                <Ionicons name="sparkles" size={28} color="#FF9800" />
              </View>
              <View style={styles.categoryInfo}>
                <Text style={styles.categoryNumber}>{compatibility?.riepilogo?.totale_da_comprare_nuovi || 0}</Text>
                <Text style={styles.categoryLabel}>Da comprare nuovi</Text>
                <Text style={styles.categoryHint}>
                  {compatibility?.riepilogo?.costo_nuovi ? `Costo: €${compatibility.riepilogo.costo_nuovi.toFixed(0)}` : 'Non disponibili usati'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#FF9800" />
            </TouchableOpacity>

            {/* 5. FUORI CORSO */}
            {(compatibility?.fuori_corso?.length > 0) && (
              <TouchableOpacity 
                style={[styles.categoryCard, { borderLeftColor: '#795548' }]}
                onPress={() => {
                  router.push(`/?childId=${id}&t=${Date.now()}`);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.categoryIcon, { backgroundColor: '#efebe9' }]}>
                  <Ionicons name="close-circle" size={28} color="#795548" />
                </View>
                <View style={styles.categoryInfo}>
                  <Text style={styles.categoryNumber}>{compatibility?.fuori_corso?.length || 0}</Text>
                  <Text style={styles.categoryLabel}>Fuori corso</Text>
                  <Text style={styles.categoryHint}>
                    Libri non più richiesti
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#795548" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Pulsante Scarica Lista */}
        <TouchableOpacity
          style={[styles.downloadButton, downloadingPdf && styles.downloadButtonDisabled]}
          onPress={async () => {
            // Leggi userId direttamente da AsyncStorage per sicurezza
            const currentUserId = await AsyncStorage.getItem('user_id');
            
            if (!currentUserId) {
              if (Platform.OS === 'web') {
                window.alert('Sessione scaduta. Effettua nuovamente il login.');
              } else {
                Alert.alert('Errore', 'Sessione scaduta. Effettua nuovamente il login.');
              }
              return;
            }
            
            if (!child) {
              if (Platform.OS === 'web') {
                window.alert('Dati studente non disponibili');
              } else {
                Alert.alert('Errore', 'Dati studente non disponibili');
              }
              return;
            }
            
            const pdfUrl = `${API_URL}/api/profiles/${currentUserId}/children/${child.id}/books-pdf`;
            console.log('Opening PDF URL:', pdfUrl);
            
            try {
              if (Platform.OS === 'web') {
                // Su web, naviga direttamente all'URL
                window.location.href = pdfUrl;
              } else {
                // Su mobile, usa WebBrowser
                await WebBrowser.openBrowserAsync(pdfUrl);
              }
            } catch (error) {
              console.error('Error opening PDF:', error);
              // Fallback con Linking
              await Linking.openURL(pdfUrl);
            }
          }}
          disabled={downloadingPdf}
        >
          {downloadingPdf ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="document-text" size={22} color="#fff" />
              <Text style={styles.downloadButtonText}>Scarica Lista Libri</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Pulsante Chiudi in basso */}
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => router.back()}
        >
          <Ionicons name="close-circle-outline" size={22} color="#666" />
          <Text style={styles.closeButtonText}>Chiudi</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
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
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
  },
  backButton: {
    marginTop: 20,
    backgroundColor: '#1a472a',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  studentHeaderBg: {
    width: '100%',
  },
  studentHeaderImage: {
    opacity: 0.4,
    resizeMode: 'contain',
  },
  studentHeaderOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(26, 71, 42, 0.85)',
    padding: 20,
    paddingTop: 10,
  },
  studentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a472a',
    padding: 20,
    paddingTop: 10,
  },
  studentAvatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentInitial: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  studentInfo: {
    flex: 1,
    marginLeft: 16,
  },
  studentName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  studentClass: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
  },
  schoolTypeBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  schoolTypeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  section: {
    marginTop: 16,
    marginHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#888',
    marginBottom: 12,
    marginTop: -8,
    fontStyle: 'italic',
  },
  schoolCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  schoolName: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  schoolDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 8,
  },
  schoolDetailLabel: {
    fontSize: 13,
    color: '#666',
  },
  schoolDetailValue: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  linkText: {
    color: '#2196F3',
  },
  tettoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  tettoReference: {
    fontSize: 11,
    color: '#999',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  tettoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tettoItem: {
    alignItems: 'center',
  },
  tettoLabel: {
    fontSize: 11,
    color: '#666',
    marginBottom: 4,
  },
  tettoValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  tettoValueSmall: {
    fontSize: 16,
    color: '#333',
  },
  spesaCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  spesaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  spesaIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff3e0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  spesaInfo: {
    flex: 1,
  },
  spesaLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  spesaSubLabel: {
    fontSize: 12,
    color: '#666',
  },
  spesaNote: {
    fontSize: 10,
    color: '#999',
    fontStyle: 'italic',
  },
  spesaAmount: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FF9800',
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 12,
  },
  statusBox: {
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  statusContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  statusSubtext: {
    fontSize: 11,
    color: '#666',
  },
  flowGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  flowCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderTopWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  flowNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 8,
  },
  flowLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  flowHint: {
    fontSize: 10,
    color: '#999',
    marginTop: 4,
  },
  classiInfoBox: {
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  classiInfoText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a472a',
    marginHorizontal: 16,
    marginTop: 20,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 10,
  },
  downloadButtonDisabled: {
    opacity: 0.7,
  },
  downloadButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
  },
  closeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  closeButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '500',
  },
  // Lista Libri styles
  bookListCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
  },
  bookListItem: {
    flexDirection: 'row',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  bookListLeft: {
    flex: 1,
  },
  bookListRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: 12,
  },
  bookTypeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginBottom: 6,
  },
  bookTypeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  bookListDiscipline: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a472a',
    marginBottom: 2,
  },
  bookListTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  bookListAuthor: {
    fontSize: 12,
    color: '#666',
  },
  bookListEditor: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
  bookListIsbn: {
    fontSize: 10,
    color: '#999',
    fontFamily: 'monospace',
    marginTop: 4,
  },
  bookListPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  usatoBadge: {
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginTop: 6,
  },
  usatoBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#4CAF50',
  },
  sellIconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginTop: 8,
    gap: 4,
  },
  sellIconText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2196F3',
  },
  // Category Grid styles (4 categorie)
  categoryGrid: {
    gap: 10,
  },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  categoryIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  categoryLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginTop: 2,
  },
  categoryHint: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  // Tetto Ministeriale Styles
  tettoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  tettoLawBox: {
    flexDirection: 'row',
    backgroundColor: '#e3f2fd',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    gap: 10,
    alignItems: 'flex-start',
  },
  tettoLawContent: {
    flex: 1,
  },
  tettoLawTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1976D2',
    marginBottom: 4,
  },
  tettoLawText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1565C0',
    marginBottom: 2,
  },
  tettoLawDesc: {
    fontSize: 11,
    color: '#1976D2',
    lineHeight: 15,
  },
  tettoValuesContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  tettoValueBox: {
    flex: 1,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  tettoValuePrimary: {
    backgroundColor: '#1a472a',
  },
  tettoValueSecondary: {
    backgroundColor: '#2e7d32',
  },
  tettoValueTertiary: {
    backgroundColor: '#388e3c',
  },
  tettoValueLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 4,
    textAlign: 'center',
  },
  tettoValueAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  tettoValueAmountSmall: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#fff',
  },
  tettoValueNote: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
    textAlign: 'center',
  },
  tettoInfoBox: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#1a472a',
  },
  tettoInfoText: {
    fontSize: 11,
    color: '#666',
    lineHeight: 16,
  },
});
