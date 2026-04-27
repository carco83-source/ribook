import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

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
  vendere?: {
    totale_vendibili: number;
    classe_destinazione: number;
  };
  comprare?: {
    totale_usati: number;
    risparmio_totale: number;
    classe_origine: number;
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

export default function StudentDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [child, setChild] = useState<ChildProfile | null>(null);
  const [compatibility, setCompatibility] = useState<CompatibilityData | null>(null);
  const [schoolData, setSchoolData] = useState<SchoolData | null>(null);

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
        {/* Header Alunno con pulsante chiudi */}
        <View style={styles.studentHeader}>
          {/* Pulsante Chiudi mobile */}
          <TouchableOpacity 
            style={styles.closeButtonMobile}
            onPress={() => router.back()}
          >
            <Ionicons name="close-circle" size={32} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
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
              <Ionicons name="wallet-outline" size={22} color="#1a472a" />
              <Text style={styles.sectionTitle}>Tetto di Spesa Ministeriale</Text>
            </View>
            
            <View style={styles.tettoCard}>
              <Text style={styles.tettoReference}>{compatibility.tetto_spesa.riferimento_normativo}</Text>
              
              <View style={styles.tettoRow}>
                <View style={styles.tettoItem}>
                  <Text style={styles.tettoLabel}>Tetto base</Text>
                  <Text style={styles.tettoValue}>€{compatibility.tetto_spesa.tetto_ministeriale.toFixed(2)}</Text>
                </View>
                <View style={styles.tettoItem}>
                  <Text style={styles.tettoLabel}>Con deroga +10%</Text>
                  <Text style={styles.tettoValueSmall}>€{compatibility.tetto_spesa.tetto_con_deroga_10.toFixed(2)}</Text>
                </View>
                <View style={styles.tettoItem}>
                  <Text style={styles.tettoLabel}>Max +15%</Text>
                  <Text style={styles.tettoValueSmall}>€{compatibility.tetto_spesa.tetto_con_deroga_15.toFixed(2)}</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Riepilogo Spesa Libri */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="calculator-outline" size={22} color="#1a472a" />
            <Text style={styles.sectionTitle}>Spesa Libri di Testo</Text>
          </View>
          
          <View style={[
            styles.spesaCard,
            { borderLeftColor: compatibility?.tetto_spesa?.entro_limite ? '#4CAF50' : 
                             compatibility?.tetto_spesa?.entro_deroga_15 ? '#FF9800' : '#f44336' }
          ]}>
            {/* Totale Testi Nuovi */}
            <View style={styles.spesaRow}>
              <View style={styles.spesaIcon}>
                <Ionicons name="book" size={24} color="#FF9800" />
              </View>
              <View style={styles.spesaInfo}>
                <Text style={styles.spesaLabel}>TOTALE TESTI NUOVI</Text>
                <Text style={styles.spesaSubLabel}>
                  ({compatibility?.nuovi?.totale || 0} libri)
                </Text>
                <Text style={styles.spesaNote}>
                  (se acquistati tutti a prezzo di copertina)
                </Text>
              </View>
              <Text style={styles.spesaAmount}>
                €{compatibility?.tetto_spesa?.costo_obbligatori?.toFixed(2) || compatibility?.nuovi?.costo_totale?.toFixed(2) || '0.00'}
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
                  (Usati €{((compatibility?.comprare?.totale_usati || 0) * 8).toFixed(0)} + Nuovi €{((compatibility?.nuovi?.totale || 0) - (compatibility?.comprare?.totale_usati || 0)) > 0 ? (((compatibility?.nuovi?.totale || 0) - (compatibility?.comprare?.totale_usati || 0)) * 15).toFixed(0) : '0'} - Ricavo €{((compatibility?.vendere?.totale_vendibili || 0) * 6).toFixed(0)})
                </Text>
              </View>
              <Text style={[styles.spesaAmount, { color: '#4CAF50' }]}>
                €{((compatibility?.nuovi?.costo_totale || 0) - (compatibility?.comprare?.risparmio_totale || 0)).toFixed(0)}
              </Text>
            </View>

            {/* Status Box */}
            <View style={[
              styles.statusBox,
              { backgroundColor: compatibility?.tetto_spesa?.entro_limite ? '#e8f5e9' : 
                               compatibility?.tetto_spesa?.entro_deroga_15 ? '#fff3e0' : '#ffebee' }
            ]}>
              {compatibility?.tetto_spesa?.entro_limite ? (
                <View style={styles.statusContent}>
                  <Ionicons name="checkmark-circle" size={28} color="#4CAF50" />
                  <Text style={[styles.statusText, { color: '#4CAF50' }]}>ENTRO LIMITE MINISTERIALE</Text>
                </View>
              ) : compatibility?.tetto_spesa?.entro_deroga_15 ? (
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
                      +{compatibility?.tetto_spesa?.percentuale_sforamento?.toFixed(1) || 0}% (€{compatibility?.tetto_spesa?.differenza?.toFixed(2) || 0} in più)
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Riepilogo Flusso Libri */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="swap-horizontal" size={22} color="#1a472a" />
            <Text style={styles.sectionTitle}>Flusso Libri</Text>
          </View>
          
          <View style={styles.flowGrid}>
            <View style={[styles.flowCard, { borderTopColor: '#2196F3' }]}>
              <Ionicons name="arrow-up-circle" size={32} color="#2196F3" />
              <Text style={styles.flowNumber}>{compatibility?.vendere?.totale_vendibili || 0}</Text>
              <Text style={styles.flowLabel}>Libri vendibili</Text>
              {compatibility?.vendere?.classe_destinazione && (
                <Text style={styles.flowHint}>
                  alla {getClasseLabel(compatibility.vendere.classe_destinazione)}
                </Text>
              )}
            </View>
            
            <View style={[styles.flowCard, { borderTopColor: '#FF9800' }]}>
              <Ionicons name="book" size={32} color="#FF9800" />
              <Text style={styles.flowNumber}>{compatibility?.nuovi?.totale || 0}</Text>
              <Text style={styles.flowLabel}>Da acquistare</Text>
              <Text style={styles.flowHint}>per quest'anno</Text>
            </View>
            
            <View style={[styles.flowCard, { borderTopColor: '#4CAF50' }]}>
              <Ionicons name="cart" size={32} color="#4CAF50" />
              <Text style={styles.flowNumber}>{compatibility?.comprare?.totale_usati || 0}</Text>
              <Text style={styles.flowLabel}>Usati disponibili</Text>
              {compatibility?.comprare?.risparmio_totale && compatibility.comprare.risparmio_totale > 0 && (
                <Text style={[styles.flowHint, { color: '#4CAF50' }]}>
                  Risparmio €{compatibility.comprare.risparmio_totale.toFixed(0)}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Lista Libri di Testo */}
        {compatibility?.nuovi?.libri && compatibility.nuovi.libri.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="list" size={22} color="#1a472a" />
              <Text style={styles.sectionTitle}>Lista Libri di Testo ({compatibility.nuovi.libri.length})</Text>
            </View>
            
            <View style={styles.bookListCard}>
              {compatibility.nuovi.libri.map((book: any, idx: number) => {
                const isObbligatorio = book.tipo_acquisto === 'obbligatorio' || book.obbligatorio;
                const prezzoNuovo = book.prezzo_copertina || book.prezzo_ministeriale || 0;
                
                return (
                  <View 
                    key={idx} 
                    style={[
                      styles.bookListItem,
                      idx === compatibility.nuovi!.libri!.length - 1 && { borderBottomWidth: 0 }
                    ]}
                  >
                    <View style={styles.bookListLeft}>
                      <View style={[
                        styles.bookTypeBadge,
                        { backgroundColor: isObbligatorio ? '#e8f5e9' : '#fff3e0' }
                      ]}>
                        <Text style={[
                          styles.bookTypeText,
                          { color: isObbligatorio ? '#4CAF50' : '#FF9800' }
                        ]}>
                          {isObbligatorio ? 'Obbligatorio' : 'Consigliato'}
                        </Text>
                      </View>
                      <Text style={styles.bookListDiscipline}>{book.disciplina}</Text>
                      <Text style={styles.bookListTitle} numberOfLines={2}>{book.titolo}</Text>
                      {book.autori && (
                        <Text style={styles.bookListAuthor} numberOfLines={1}>{book.autori}</Text>
                      )}
                      {book.editore && (
                        <Text style={styles.bookListEditor}>{book.editore}</Text>
                      )}
                      <Text style={styles.bookListIsbn}>ISBN: {book.isbn}</Text>
                    </View>
                    <View style={styles.bookListRight}>
                      <Text style={styles.bookListPrice}>€{prezzoNuovo.toFixed(2)}</Text>
                      {book.copie_usate_disponibili > 0 && (
                        <View style={styles.usatoBadge}>
                          <Text style={styles.usatoBadgeText}>
                            {book.copie_usate_disponibili} usati
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Pulsante Scarica Lista */}
        <TouchableOpacity
          style={styles.downloadButton}
          onPress={() => router.push(`/(tabs)/profile?download=${child.id}`)}
        >
          <Ionicons name="download" size={22} color="#fff" />
          <Text style={styles.downloadButtonText}>Scarica Lista Libri</Text>
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
    borderLeftWidth: 4,
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
  downloadButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
  },
  closeButtonMobile: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
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
});
