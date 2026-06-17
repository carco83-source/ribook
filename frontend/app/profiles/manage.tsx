import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  Platform,
  Switch,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Picker } from '@react-native-picker/picker';
import { SCUOLE_PRIMO_GRADO, SCUOLE_SECONDO_GRADO, getClassiByType } from '../../src/constants/schools';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Profile {
  id: string;
  nome_figlio: string;
  scuola: string;
  classe: string;
  sezione: string;
  tipo_scuola: string;
  classe_2025_2026?: number | null;
  fine_ciclo?: boolean;
}

export default function ManageProfilesScreen() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  
  // Dynamic sections state
  const [availableSections, setAvailableSections] = useState<string[]>([]);
  const [sectionsByClass, setSectionsByClass] = useState<{[key: string]: string[]}>({});
  const [loadingSections, setLoadingSections] = useState(false);
  
  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [newProfile, setNewProfile] = useState({
    nome_figlio: '',
    tipo_scuola: 'primo_grado',
    scuola: '',
    codice_scuola: '',
    classe: '',  // Classe 2026/2027
    sezione: '',
    // Nuovi campi V2
    classe_2025_2026: '',  // Classe anno precedente (vuoto = nuovo studente 1° anno)
    fine_ciclo: false,  // Toggle fine ciclo
  });

  // Determina se lo studente è un nuovo studente (1° anno)
  const isNuovoStudente = newProfile.classe === '1';

  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      setUserId(storedUserId);
      
      if (storedUserId) {
        const response = await axios.get(`${API_URL}/api/users/${storedUserId}/profiles`);
        setProfiles(response.data);
        
        // Get active profile
        const activeRes = await axios.get(`${API_URL}/api/users/${storedUserId}/active-profile`);
        setActiveProfileId(activeRes.data.id);
      }
    } catch (error) {
      console.error('Error loading profiles:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddProfile = async () => {
    // Validazione base
    if (!newProfile.nome_figlio || !newProfile.scuola || !newProfile.classe || !newProfile.sezione) {
      if (Platform.OS === 'web') {
        window.alert('Compila tutti i campi obbligatori');
      } else {
        Alert.alert('Errore', 'Compila tutti i campi obbligatori');
      }
      return;
    }

    // Se NON è primo anno e NON ha fine_ciclo attivo, deve selezionare classe 2025/2026
    if (!isNuovoStudente && !newProfile.fine_ciclo && !newProfile.classe_2025_2026) {
      if (Platform.OS === 'web') {
        window.alert('Seleziona la classe frequentata nel 2025/2026');
      } else {
        Alert.alert('Errore', 'Seleziona la classe frequentata nel 2025/2026');
      }
      return;
    }

    try {
      const payload = {
        ...newProfile,
        // Se è nuovo studente (1° anno), classe_2025_2026 è null
        classe_2025_2026: isNuovoStudente ? null : (newProfile.classe_2025_2026 || null),
      };

      await axios.post(`${API_URL}/api/users/${userId}/profiles`, payload);
      if (Platform.OS === 'web') {
        window.alert('Profilo aggiunto con successo!');
      } else {
        Alert.alert('Fatto!', 'Profilo aggiunto con successo');
      }
      setModalVisible(false);
      resetForm();
      loadProfiles();
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Errore durante l\'aggiunta';
      if (Platform.OS === 'web') {
        window.alert('Errore: ' + message);
      } else {
        Alert.alert('Errore', message);
      }
    }
  };

  const resetForm = () => {
    setNewProfile({
      nome_figlio: '',
      tipo_scuola: 'primo_grado',
      scuola: '',
      codice_scuola: '',
      classe: '',
      sezione: '',
      classe_2025_2026: '',
      fine_ciclo: false,
    });
    setAvailableSections([]);
    setSectionsByClass({});
  };

  const handleActivateProfile = async (profileId: string) => {
    try {
      await axios.put(`${API_URL}/api/users/${userId}/profiles/${profileId}/activate`);
      setActiveProfileId(profileId);
      
      // Update local storage with new profile info
      const profile = profiles.find(p => p.id === profileId);
      if (profile) {
        const userInfo = await AsyncStorage.getItem('user_info');
        if (userInfo) {
          const user = JSON.parse(userInfo);
          user.scuola = profile.scuola;
          user.classe = profile.classe;
          user.sezione = profile.sezione;
          user.tipo_scuola = profile.tipo_scuola;
          await AsyncStorage.setItem('user_info', JSON.stringify(user));
        }
      }
      
      if (Platform.OS === 'web') {
        window.alert('Profilo attivato!');
      } else {
        Alert.alert('Fatto!', 'Profilo attivato');
      }
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Errore durante l\'attivazione';
      if (Platform.OS === 'web') {
        window.alert('Errore: ' + message);
      } else {
        Alert.alert('Errore', message);
      }
    }
  };

  const handleDeleteProfile = async (profileId: string) => {
    if (profileId === 'main') {
      if (Platform.OS === 'web') {
        window.alert('Non puoi eliminare il profilo principale');
      } else {
        Alert.alert('Errore', 'Non puoi eliminare il profilo principale');
      }
      return;
    }

    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Sei sicuro di voler eliminare questo profilo?');
      if (confirmed) {
        try {
          await axios.delete(`${API_URL}/api/users/${userId}/profiles/${profileId}`);
          window.alert('Profilo eliminato!');
          loadProfiles();
        } catch (error: any) {
          window.alert('Errore: ' + (error.response?.data?.detail || 'Errore durante l\'eliminazione'));
        }
      }
    } else {
      Alert.alert(
        'Conferma eliminazione',
        'Sei sicuro di voler eliminare questo profilo?',
        [
          { text: 'Annulla', style: 'cancel' },
          {
            text: 'Elimina',
            style: 'destructive',
            onPress: async () => {
              try {
                await axios.delete(`${API_URL}/api/users/${userId}/profiles/${profileId}`);
                Alert.alert('Fatto!', 'Profilo eliminato');
                loadProfiles();
              } catch (error: any) {
                Alert.alert('Errore', error.response?.data?.detail || 'Errore durante l\'eliminazione');
              }
            },
          },
        ]
      );
    }
  };

  const getScuoleByTipo = () => {
    if (newProfile.tipo_scuola === 'primo_grado') {
      return SCUOLE_PRIMO_GRADO;
    } else {
      return SCUOLE_SECONDO_GRADO;
    }
  };

  const getClassi = () => {
    return getClassiByType(newProfile.tipo_scuola as 'primo_grado' | 'secondo_grado');
  };

  // Genera le classi disponibili per l'anno 2025/2026
  // Basandosi sulla classe 2026/2027, la classe precedente è classe - 1
  // Per studenti di 2°, 3°, 4°, 5° la classe precedente va da 1 a 4
  const getClassi2025_2026 = () => {
    const classeCorrente = parseInt(newProfile.classe);
    if (isNaN(classeCorrente) || classeCorrente <= 1) return [];
    
    // Per la classe 2025/2026, lo studente era nella classe precedente
    // Es: Se ora è in 2°, l'anno scorso era in 1°
    // Mostriamo solo la classe precedente logica
    const classePrecedente = classeCorrente - 1;
    return [classePrecedente.toString()];
  };

  // Ottieni le informazioni sulla situazione dello studente
  const getSituazioneLabel = () => {
    if (isNuovoStudente) {
      return { text: 'Nuovo studente (1° anno)', color: '#2196F3', icon: 'school-outline' as const };
    }
    if (newProfile.fine_ciclo) {
      return { text: 'Fine ciclo - Solo vendita libri', color: '#4CAF50', icon: 'checkmark-circle-outline' as const };
    }
    return { text: 'Studente frequentante', color: '#FF9800', icon: 'book-outline' as const };
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a472a" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Gestisci Profili',
          headerStyle: { backgroundColor: '#1a472a' },
          headerTintColor: '#fff',
          headerLeft: () => (
            <TouchableOpacity 
              onPress={() => router.canGoBack() ? router.back() : router.push('/(tabs)/profile')} 
              style={{ marginLeft: 16, padding: 8 }}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Info card */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={24} color="#1976D2" />
          <Text style={styles.infoText}>
            Aggiungi profili per i tuoi figli. Ogni profilo può cercare e vendere libri della propria classe.
          </Text>
        </View>

        {/* Profiles list */}
        <Text style={styles.sectionTitle}>I tuoi profili</Text>
        
        {profiles.map((profile) => (
          <View
            key={profile.id}
            style={[
              styles.profileCard,
              activeProfileId === profile.id && styles.profileCardActive,
            ]}
          >
            <View style={styles.profileHeader}>
              {profile.id === 'main' ? (
                <View style={styles.profileIcon}>
                  <Ionicons name="person" size={24} color="#fff" />
                </View>
              ) : (
                <View style={[styles.profileIcon, { backgroundColor: '#FF9800' }]}>
                  <Ionicons name="school" size={24} color="#fff" />
                </View>
              )}
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{profile.nome_figlio}</Text>
                <Text style={styles.profileSchool}>{profile.scuola}</Text>
                <Text style={styles.profileClass}>
                  Classe {profile.classe}{profile.sezione} • {profile.tipo_scuola === 'primo_grado' ? 'Media' : 'Superiore'}
                </Text>
                {/* Mostra info anno precedente */}
                {profile.classe_2025_2026 != null && (
                  <Text style={styles.profilePrevClass}>
                    2025/2026: Classe {profile.classe_2025_2026}
                  </Text>
                )}
                {profile.fine_ciclo && (
                  <View style={styles.fineCicloBadge}>
                    <Text style={styles.fineCicloText}>Fine ciclo</Text>
                  </View>
                )}
              </View>
              {activeProfileId === profile.id && (
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>ATTIVO</Text>
                </View>
              )}
            </View>

            <View style={styles.profileActions}>
              {activeProfileId !== profile.id && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleActivateProfile(profile.id)}
                >
                  <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                  <Text style={styles.actionButtonText}>Attiva</Text>
                </TouchableOpacity>
              )}
              {profile.id !== 'main' && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.deleteButton]}
                  onPress={() => handleDeleteProfile(profile.id)}
                >
                  <Ionicons name="trash" size={20} color="#f44336" />
                  <Text style={[styles.actionButtonText, { color: '#f44336' }]}>Elimina</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}

        {/* Add profile button */}
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setModalVisible(true)}
        >
          <Ionicons name="add-circle" size={24} color="#fff" />
          <Text style={styles.addButtonText}>Aggiungi profilo figlio</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Add Profile Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nuovo profilo</Text>
              <TouchableOpacity onPress={() => { setModalVisible(false); resetForm(); }}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Nome figlio */}
              <Text style={styles.inputLabel}>Nome del figlio *</Text>
              <TextInput
                style={styles.input}
                placeholder="Es. Marco"
                value={newProfile.nome_figlio}
                onChangeText={(text) => setNewProfile({ ...newProfile, nome_figlio: text })}
              />

              {/* Sezione: Anno Scolastico 2026/2027 */}
              <View style={styles.sectionHeader}>
                <Ionicons name="calendar" size={20} color="#1a472a" />
                <Text style={styles.sectionHeaderText}>Anno Scolastico 2026/2027</Text>
              </View>

              {/* Tipo scuola */}
              <Text style={styles.inputLabel}>Tipo scuola *</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={newProfile.tipo_scuola}
                  onValueChange={(value) => setNewProfile({ 
                    ...newProfile, 
                    tipo_scuola: value, 
                    scuola: '', 
                    codice_scuola: '',
                    classe: '',
                    sezione: '',
                    classe_2025_2026: ''
                  })}
                >
                  <Picker.Item label="Scuola Media" value="primo_grado" />
                  <Picker.Item label="Scuola Superiore" value="secondo_grado" />
                </Picker>
              </View>

              {/* Scuola */}
              <Text style={styles.inputLabel}>Scuola 2026/2027 *</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={newProfile.scuola}
                  onValueChange={async (value) => {
                    const scuolaSelezionata = getScuoleByTipo().find(s => s.nome === value);
                    const codice = scuolaSelezionata?.codice || '';
                    setNewProfile({ 
                      ...newProfile, 
                      scuola: value,
                      codice_scuola: codice,
                      classe: '',
                      sezione: '',
                      classe_2025_2026: ''
                    });
                    
                    // Carica sezioni dinamicamente
                    if (codice) {
                      setLoadingSections(true);
                      try {
                        const response = await axios.get(`${API_URL}/api/schools/${codice}/sections`);
                        setSectionsByClass(response.data.sezioni_per_classe || {});
                        setAvailableSections([]);
                      } catch (error) {
                        console.error('Error loading sections:', error);
                        setSectionsByClass({});
                      } finally {
                        setLoadingSections(false);
                      }
                    } else {
                      setSectionsByClass({});
                      setAvailableSections([]);
                    }
                  }}
                >
                  <Picker.Item label="Seleziona scuola..." value="" />
                  {getScuoleByTipo().map((scuola) => (
                    <Picker.Item key={scuola.codice} label={scuola.nome} value={scuola.nome} />
                  ))}
                </Picker>
              </View>

              {/* Classe 2026/2027 */}
              <Text style={styles.inputLabel}>Classe 2026/2027 *</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={newProfile.classe}
                  onValueChange={(value) => {
                    setNewProfile({ 
                      ...newProfile, 
                      classe: value, 
                      sezione: '',
                      // Reset classe_2025_2026 quando cambia la classe
                      classe_2025_2026: ''
                    });
                    // Aggiorna sezioni disponibili per questa classe
                    const sezioniPerClasse = sectionsByClass[value] || [];
                    setAvailableSections(sezioniPerClasse);
                  }}
                  enabled={!!newProfile.codice_scuola}
                >
                  <Picker.Item label="Seleziona classe..." value="" />
                  {getClassi().map((c) => (
                    <Picker.Item key={c} label={`${c}°`} value={c} />
                  ))}
                </Picker>
              </View>

              {/* Sezione */}
              <Text style={styles.inputLabel}>
                Sezione * {loadingSections && '(caricamento...)'}
              </Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={newProfile.sezione}
                  onValueChange={(value) => setNewProfile({ ...newProfile, sezione: value })}
                  enabled={!loadingSections && availableSections.length > 0}
                >
                  <Picker.Item 
                    label={
                      loadingSections 
                        ? "Caricamento..." 
                        : availableSections.length === 0 
                          ? (newProfile.classe ? "Nessuna sezione disponibile" : "Seleziona prima la classe")
                          : "Seleziona sezione..."
                    } 
                    value="" 
                  />
                  {availableSections.map((s) => (
                    <Picker.Item key={s} label={s} value={s} />
                  ))}
                </Picker>
              </View>

              {/* Mostra sezione anno precedente SOLO se la classe è selezionata */}
              {newProfile.classe && (
                <>
                  {/* Sezione: Anno Scolastico 2025/2026 */}
                  <View style={[styles.sectionHeader, { marginTop: 24, backgroundColor: '#e8f5e9' }]}>
                    <Ionicons name="time" size={20} color="#2E7D32" />
                    <Text style={[styles.sectionHeaderText, { color: '#2E7D32' }]}>Anno Precedente 2025/2026</Text>
                  </View>

                  {/* Info box situazione */}
                  {(() => {
                    const situazione = getSituazioneLabel();
                    return (
                      <View style={[styles.situazioneBox, { borderLeftColor: situazione.color }]}>
                        <Ionicons name={situazione.icon} size={24} color={situazione.color} />
                        <Text style={[styles.situazioneText, { color: situazione.color }]}>
                          {situazione.text}
                        </Text>
                      </View>
                    );
                  })()}

                  {/* Se è 1° anno: nuovo studente - campo disabilitato */}
                  {isNuovoStudente ? (
                    <View style={styles.nuovoStudenteInfo}>
                      <Ionicons name="information-circle" size={20} color="#1976D2" />
                      <Text style={styles.nuovoStudenteText}>
                        Studente al primo anno: non serve indicare la classe dell&apos;anno precedente.
                        {'\n'}Vedrà solo i libri da acquistare (usati o nuovi).
                      </Text>
                    </View>
                  ) : (
                    <>
                      {/* Toggle Fine Ciclo */}
                      <View style={styles.toggleRow}>
                        <View style={styles.toggleInfo}>
                          <Text style={styles.toggleLabel}>Fine ciclo (diplomato)</Text>
                          <Text style={styles.toggleDescription}>
                            Attiva se lo studente ha terminato il ciclo scolastico e vuole solo vendere libri
                          </Text>
                        </View>
                        <Switch
                          value={newProfile.fine_ciclo}
                          onValueChange={(value) => setNewProfile({ 
                            ...newProfile, 
                            fine_ciclo: value,
                            // Se attiva fine_ciclo, reset classe_2025_2026
                            classe_2025_2026: value ? '' : newProfile.classe_2025_2026
                          })}
                          trackColor={{ false: '#ddd', true: '#81C784' }}
                          thumbColor={newProfile.fine_ciclo ? '#4CAF50' : '#f4f3f4'}
                        />
                      </View>

                      {/* Classe 2025/2026 - Solo se NON fine_ciclo */}
                      {!newProfile.fine_ciclo && (
                        <>
                          <Text style={styles.inputLabel}>Classe frequentata nel 2025/2026 *</Text>
                          <View style={styles.pickerContainer}>
                            <Picker
                              selectedValue={newProfile.classe_2025_2026}
                              onValueChange={(value) => setNewProfile({ ...newProfile, classe_2025_2026: value })}
                            >
                              <Picker.Item label="Seleziona classe..." value="" />
                              {getClassi2025_2026().map((c) => (
                                <Picker.Item key={c} label={`${c}°`} value={c} />
                              ))}
                            </Picker>
                          </View>
                          <Text style={styles.helperText}>
                            Se lo studente è in {newProfile.classe}° nel 2026/2027, l'anno scorso era in {parseInt(newProfile.classe) - 1}°
                          </Text>
                        </>
                      )}

                      {/* Info fine ciclo */}
                      {newProfile.fine_ciclo && (
                        <View style={[styles.nuovoStudenteInfo, { backgroundColor: '#e8f5e9', borderLeftColor: '#4CAF50' }]}>
                          <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                          <Text style={[styles.nuovoStudenteText, { color: '#2E7D32' }]}>
                            Studente a fine ciclo: vedrà SOLO la categoria &quot;Libri vendibili&quot;.
                            {'\n'}Tutti i libri dell&apos;ultimo anno saranno disponibili per la vendita.
                          </Text>
                        </View>
                      )}
                    </>
                  )}
                </>
              )}

              <TouchableOpacity style={styles.saveButton} onPress={handleAddProfile}>
                <Text style={styles.saveButtonText}>Salva profilo</Text>
              </TouchableOpacity>
              
              <View style={{ height: 40 }} />
            </ScrollView>
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
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#e3f2fd',
    padding: 16,
    borderRadius: 12,
    gap: 12,
    marginBottom: 24,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#1976D2',
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
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
  profileCardActive: {
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1a472a',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  profileSchool: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  profileClass: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  profilePrevClass: {
    fontSize: 11,
    color: '#FF9800',
    marginTop: 2,
    fontStyle: 'italic',
  },
  fineCicloBadge: {
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  fineCicloText: {
    fontSize: 10,
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  activeBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  activeBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  profileActions: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#e8f5e9',
  },
  deleteButton: {
    backgroundColor: '#ffebee',
  },
  actionButtonText: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '500',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a472a',
    padding: 16,
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f5f5f5',
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  pickerContainer: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  sectionHeaderText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a472a',
  },
  situazioneBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  situazioneText: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  nuovoStudenteInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#e3f2fd',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#1976D2',
    marginBottom: 16,
  },
  nuovoStudenteText: {
    flex: 1,
    fontSize: 13,
    color: '#1565C0',
    lineHeight: 20,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  toggleInfo: {
    flex: 1,
    marginRight: 16,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  toggleDescription: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    lineHeight: 16,
  },
  helperText: {
    fontSize: 12,
    color: '#999',
    marginTop: -12,
    marginBottom: 16,
    fontStyle: 'italic',
  },
  saveButton: {
    backgroundColor: '#1a472a',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
