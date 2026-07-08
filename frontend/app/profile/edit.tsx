import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function EditProfileScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  
  // Form fields
  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [iban, setIban] = useState('');

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId) {
        // Nessun user_id, utente non loggato
        if (Platform.OS === 'web') {
          window.alert('Devi effettuare il login per modificare il profilo');
        } else {
          Alert.alert('Accesso richiesto', 'Devi effettuare il login per modificare il profilo');
        }
        router.replace('/(auth)/login');
        return;
      }

      const response = await axios.get(`${API_URL}/api/users/${userId}`);
      const user = response.data;
      
      setUserData(user);
      setNome(user.nome || '');
      setCognome(user.cognome || '');
      setEmail(user.email || '');
      setTelefono(user.telefono || '');
      setIban(user.iban || '');
    } catch (error: any) {
      console.error('Error loading user data:', error);
      
      // Se l'utente non esiste nel database (404), pulisci la sessione e reindirizza al login
      if (error?.response?.status === 404) {
        // Pulisci la sessione locale corrotta
        await AsyncStorage.removeItem('user_id');
        await AsyncStorage.removeItem('username');
        await AsyncStorage.removeItem('user_nome');
        await AsyncStorage.removeItem('session_token');
        await AsyncStorage.removeItem('is_premium');
        
        if (Platform.OS === 'web') {
          localStorage.removeItem('session_token');
          window.alert('La tua sessione è scaduta. Effettua nuovamente il login o registrati.');
        } else {
          // Pulisci anche SecureStore su mobile
          try {
            await SecureStore.deleteItemAsync('session_token');
          } catch (e) {
            console.log('SecureStore cleanup error:', e);
          }
          Alert.alert(
            'Sessione scaduta', 
            'La tua sessione è scaduta. Effettua nuovamente il login o registrati.',
            [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }]
          );
          return;
        }
        router.replace('/(auth)/login');
        return;
      }
      
      if (Platform.OS === 'web') {
        window.alert('Impossibile caricare i dati del profilo');
      } else {
        Alert.alert('Errore', 'Impossibile caricare i dati del profilo');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    // Validazione campi obbligatori
    if (!nome.trim()) {
      if (Platform.OS === 'web') {
        window.alert('Il nome è obbligatorio');
      } else {
        Alert.alert('Errore', 'Il nome è obbligatorio');
      }
      return;
    }
    if (!cognome.trim()) {
      if (Platform.OS === 'web') {
        window.alert('Il cognome è obbligatorio');
      } else {
        Alert.alert('Errore', 'Il cognome è obbligatorio');
      }
      return;
    }
    if (!email.trim()) {
      if (Platform.OS === 'web') {
        window.alert('L\'email è obbligatoria');
      } else {
        Alert.alert('Errore', 'L\'email è obbligatoria');
      }
      return;
    }

    setSaving(true);
    try {
      const userId = await AsyncStorage.getItem('user_id');
      
      const updateData: any = {
        nome: nome.trim(),
        cognome: cognome.trim(),
        email: email.trim().toLowerCase(),
        telefono: telefono.trim(),
        iban: iban.trim(),
      };

      await axios.put(`${API_URL}/api/users/${userId}`, updateData);

      // Update local storage
      await AsyncStorage.setItem('user_nome', nome);
      
      if (Platform.OS === 'web') {
        window.alert('Profilo aggiornato con successo!');
        router.back();
      } else {
        Alert.alert('Successo', 'Profilo aggiornato con successo!', [
          { text: 'OK', onPress: () => router.back() }
        ]);
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      if (Platform.OS === 'web') {
        window.alert('Impossibile salvare le modifiche');
      } else {
        Alert.alert('Errore', 'Impossibile salvare le modifiche');
      }
    } finally {
      setSaving(false);
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
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView style={styles.scrollView}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#1a472a" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Modifica Profilo</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.sectionTitle}>Dati personali</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nome *</Text>
            <TextInput
              style={styles.input}
              value={nome}
              onChangeText={setNome}
              placeholder="Il tuo nome"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Cognome *</Text>
            <TextInput
              style={styles.input}
              value={cognome}
              onChangeText={setCognome}
              placeholder="Il tuo cognome"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email *</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="email@esempio.it"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Telefono (opzionale)</Text>
            <TextInput
              style={styles.input}
              value={telefono}
              onChangeText={setTelefono}
              placeholder="333-1234567"
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>IBAN (opzionale)</Text>
            <TextInput
              style={styles.input}
              value={iban}
              onChangeText={setIban}
              placeholder="IT60X0542811101000000123456"
              autoCapitalize="characters"
            />
            <Text style={styles.ibanNote}>
              L'IBAN non è obbligatorio per la registrazione, ma dovrà essere inserito per poter vendere i libri e ricevere i pagamenti.
            </Text>
          </View>

          <Text style={styles.note}>
            * I campi contrassegnati sono obbligatori
          </Text>

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.saveButtonText}>Salva Modifiche</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#fff',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  placeholder: {
    width: 40,
  },
  form: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  pickerContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    overflow: 'hidden',
  },
  picker: {
    height: 50,
  },
  row: {
    flexDirection: 'row',
  },
  note: {
    fontSize: 12,
    color: '#888',
    marginTop: 8,
    marginBottom: 24,
  },
  ibanNote: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    fontStyle: 'italic',
    lineHeight: 18,
    backgroundColor: '#fff8e1',
    padding: 10,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#FF9800',
  },
  saveButton: {
    backgroundColor: '#1a472a',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
});
