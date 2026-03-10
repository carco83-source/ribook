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
import axios from 'axios';
import { Picker } from '@react-native-picker/picker';

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
  const [scuola, setScuola] = useState('');
  const [classe, setClasse] = useState('');
  const [sezione, setSezione] = useState('');
  const [tipoScuola, setTipoScuola] = useState('primo_grado');

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId) {
        router.replace('/');
        return;
      }

      const response = await axios.get(`${API_URL}/api/users/${userId}`);
      const user = response.data;
      
      setUserData(user);
      setNome(user.nome || '');
      setCognome(user.cognome || '');
      setEmail(user.email || '');
      setTelefono(user.telefono || '');
      setScuola(user.scuola || '');
      setClasse(user.classe || '');
      setSezione(user.sezione || '');
      setTipoScuola(user.tipo_scuola || 'primo_grado');
    } catch (error) {
      console.error('Error loading user data:', error);
      Alert.alert('Errore', 'Impossibile caricare i dati del profilo');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!nome.trim() || !scuola.trim() || !classe.trim() || !sezione.trim()) {
      Alert.alert('Errore', 'Compila tutti i campi obbligatori');
      return;
    }

    setSaving(true);
    try {
      const userId = await AsyncStorage.getItem('user_id');
      
      await axios.put(`${API_URL}/api/users/${userId}`, {
        nome,
        cognome,
        email,
        telefono,
        scuola,
        classe,
        sezione,
        tipo_scuola: tipoScuola,
      });

      // Update local storage
      await AsyncStorage.setItem('user_nome', nome);
      
      Alert.alert('Successo', 'Profilo aggiornato con successo!', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Errore', 'Impossibile salvare le modifiche');
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
            <Text style={styles.label}>Cognome</Text>
            <TextInput
              style={styles.input}
              value={cognome}
              onChangeText={setCognome}
              placeholder="Il tuo cognome"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
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
            <Text style={styles.label}>Telefono</Text>
            <TextInput
              style={styles.input}
              value={telefono}
              onChangeText={setTelefono}
              placeholder="333-1234567"
              keyboardType="phone-pad"
            />
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Dati scolastici (Profilo principale)</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Tipo Scuola *</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={tipoScuola}
                onValueChange={setTipoScuola}
                style={styles.picker}
              >
                <Picker.Item label="Scuola Media (I grado)" value="primo_grado" />
                <Picker.Item label="Scuola Superiore (II grado)" value="secondo_grado" />
              </Picker>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Scuola *</Text>
            <TextInput
              style={styles.input}
              value={scuola}
              onChangeText={setScuola}
              placeholder="Nome della scuola"
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.label}>Classe *</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={classe}
                  onValueChange={setClasse}
                  style={styles.picker}
                >
                  <Picker.Item label="1ª" value="1" />
                  <Picker.Item label="2ª" value="2" />
                  <Picker.Item label="3ª" value="3" />
                  {tipoScuola === 'secondo_grado' && (
                    <>
                      <Picker.Item label="4ª" value="4" />
                      <Picker.Item label="5ª" value="5" />
                    </>
                  )}
                </Picker>
              </View>
            </View>

            <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
              <Text style={styles.label}>Sezione *</Text>
              <TextInput
                style={styles.input}
                value={sezione}
                onChangeText={setSezione}
                placeholder="A, B, C..."
                maxLength={2}
                autoCapitalize="characters"
              />
            </View>
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
