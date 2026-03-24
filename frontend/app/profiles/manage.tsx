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
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Picker } from '@react-native-picker/picker';
import { SCUOLE_PRIMO_GRADO, SCUOLE_SECONDO_GRADO, getClassiByType, SEZIONI } from '../../src/constants/schools';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Profile {
  id: string;
  nome_figlio: string;
  scuola: string;
  classe: string;
  sezione: string;
  tipo_scuola: string;
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
    classe: '',
    sezione: '',
  });

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
    if (!newProfile.nome_figlio || !newProfile.scuola || !newProfile.classe || !newProfile.sezione) {
      Alert.alert('Errore', 'Compila tutti i campi');
      return;
    }

    try {
      await axios.post(`${API_URL}/api/users/${userId}/profiles`, newProfile);
      Alert.alert('Fatto!', 'Profilo aggiunto con successo');
      setModalVisible(false);
      setNewProfile({
        nome_figlio: '',
        tipo_scuola: 'primo_grado',
        scuola: '',
        codice_scuola: '',
        classe: '',
        sezione: '',
      });
      loadProfiles();
    } catch (error: any) {
      Alert.alert('Errore', error.response?.data?.detail || 'Errore durante l\'aggiunta');
    }
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
      
      Alert.alert('Fatto!', 'Profilo attivato');
    } catch (error: any) {
      Alert.alert('Errore', error.response?.data?.detail || 'Errore durante l\'attivazione');
    }
  };

  const handleDeleteProfile = async (profileId: string) => {
    if (profileId === 'main') {
      Alert.alert('Errore', 'Non puoi eliminare il profilo principale');
      return;
    }

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
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              {/* Nome figlio */}
              <Text style={styles.inputLabel}>Nome del figlio</Text>
              <TextInput
                style={styles.input}
                placeholder="Es. Marco"
                value={newProfile.nome_figlio}
                onChangeText={(text) => setNewProfile({ ...newProfile, nome_figlio: text })}
              />

              {/* Tipo scuola */}
              <Text style={styles.inputLabel}>Tipo scuola</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={newProfile.tipo_scuola}
                  onValueChange={(value) => setNewProfile({ ...newProfile, tipo_scuola: value, scuola: '' })}
                >
                  <Picker.Item label="Scuola Media" value="primo_grado" />
                  <Picker.Item label="Scuola Superiore" value="secondo_grado" />
                </Picker>
              </View>

              {/* Scuola */}
              <Text style={styles.inputLabel}>Scuola</Text>
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
                      sezione: ''
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

              {/* Classe */}
              <Text style={styles.inputLabel}>Classe</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={newProfile.classe}
                  onValueChange={(value) => {
                    setNewProfile({ ...newProfile, classe: value, sezione: '' });
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

              {/* Sezione - Dinamico */}
              <Text style={styles.inputLabel}>
                Sezione {loadingSections && '(caricamento...)'}
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

              <TouchableOpacity style={styles.saveButton} onPress={handleAddProfile}>
                <Text style={styles.saveButtonText}>Salva profilo</Text>
              </TouchableOpacity>
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
    maxHeight: '80%',
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
