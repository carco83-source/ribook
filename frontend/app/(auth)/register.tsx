import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import {
  SCHOOL_TYPES,
  getSchoolsByType,
  getClassiByType,
  SEZIONI,
  SchoolType,
  School,
} from '../../src/constants/schools';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function RegisterScreen() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    nome: '',
    cognome: '',
    email: '',
    telefono: '',
    password: '',
    confirmPassword: '',
    tipoScuola: '' as SchoolType | '',
    scuola: '',
    scuolaNome: '',
    classe: '',
    sezione: '',
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // Modal states
  const [showTipoScuolaModal, setShowTipoScuolaModal] = useState(false);
  const [showScuolaModal, setShowScuolaModal] = useState(false);
  const [showClasseModal, setShowClasseModal] = useState(false);
  const [showSezioneModal, setShowSezioneModal] = useState(false);

  const [availableSchools, setAvailableSchools] = useState<School[]>([]);
  const [availableClassi, setAvailableClassi] = useState<string[]>([]);

  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (formData.tipoScuola) {
      setAvailableSchools(getSchoolsByType(formData.tipoScuola as SchoolType));
      setAvailableClassi(getClassiByType(formData.tipoScuola as SchoolType));
      // Reset dependent fields
      setFormData(prev => ({
        ...prev,
        scuola: '',
        scuolaNome: '',
        classe: '',
      }));
    }
  }, [formData.tipoScuola]);

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSelectSchool = (school: School) => {
    setFormData(prev => ({
      ...prev,
      scuola: school.id,
      scuolaNome: school.nome,
    }));
    setShowScuolaModal(false);
  };

  const handleRegister = async () => {
    setErrorMessage('');
    const { nome, cognome, email, telefono, password, confirmPassword, scuolaNome, classe, sezione, tipoScuola } = formData;

    // Validate all fields
    if (!nome || !cognome) {
      setErrorMessage('Inserisci nome e cognome');
      return;
    }
    if (!email) {
      setErrorMessage('Inserisci la tua email');
      return;
    }
    if (!telefono) {
      setErrorMessage('Inserisci il tuo numero di telefono');
      return;
    }
    if (!tipoScuola) {
      setErrorMessage('Seleziona il tipo di scuola');
      return;
    }
    if (!scuolaNome) {
      setErrorMessage('Seleziona la tua scuola');
      return;
    }
    if (!classe) {
      setErrorMessage('Seleziona la classe');
      return;
    }
    if (!sezione) {
      setErrorMessage('Seleziona la sezione');
      return;
    }
    if (!password) {
      setErrorMessage('Inserisci una password');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('La password deve avere almeno 6 caratteri');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Le password non corrispondono');
      return;
    }

    setLoading(true);
    try {
      console.log('Sending registration request...', { nome, cognome, email, scuolaNome, classe, sezione, tipoScuola });
      const response = await axios.post(`${API_URL}/api/auth/register`, {
        nome,
        cognome,
        email,
        telefono,
        password,
        scuola: scuolaNome,
        classe,
        sezione,
        tipo_scuola: tipoScuola,
      });

      console.log('Registration successful:', response.data);
      
      // Show success and navigate
      Alert.alert(
        'Registrazione completata!',
        `Il tuo username anonimo è: ${response.data.username}\n\nQuesto username sarà visibile agli altri utenti per proteggere la tua privacy.`,
        [
          {
            text: 'OK',
            onPress: () => router.push('/(auth)/login'),
          },
        ]
      );
      
      // Also navigate directly for web where Alert might not work well
      setTimeout(() => {
        router.push('/(auth)/login');
      }, 2000);
      
    } catch (error: any) {
      console.error('Registration error:', error);
      const errorMsg = error.response?.data?.detail || 'Errore durante la registrazione. Riprova.';
      setErrorMessage(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const renderDropdown = (
    label: string,
    value: string,
    onPress: () => void,
    disabled?: boolean
  ) => (
    <TouchableOpacity
      style={[styles.dropdownButton, disabled && styles.dropdownDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.dropdownText, !value && styles.dropdownPlaceholder]}>
        {value || label}
      </Text>
      <Ionicons name="chevron-down" size={20} color={disabled ? '#ccc' : '#666'} />
    </TouchableOpacity>
  );

  const getTipoScuolaLabel = () => {
    const tipo = SCHOOL_TYPES.find(t => t.key === formData.tipoScuola);
    return tipo?.label || '';
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerBanner}>
          <Ionicons name="location" size={20} color="#1a472a" />
          <Text style={styles.headerBannerText}>Solo per le scuole di Catanzaro</Text>
        </View>

        <Text style={styles.title}>Crea il tuo account</Text>
        <Text style={styles.subtitle}>
          I tuoi dati personali rimarranno privati. Ti verrà assegnato un username anonimo.
        </Text>

        <View style={styles.form}>
          {/* Error Message */}
          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={20} color="#c62828" />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>Dati Personali</Text>
          
          <View style={styles.row}>
            <View style={[styles.inputContainer, styles.halfInput]}>
              <TextInput
                style={styles.input}
                placeholder="Nome"
                value={formData.nome}
                onChangeText={(v) => updateField('nome', v)}
              />
            </View>
            <View style={[styles.inputContainer, styles.halfInput]}>
              <TextInput
                style={styles.input}
                placeholder="Cognome"
                value={formData.cognome}
                onChangeText={(v) => updateField('cognome', v)}
              />
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Ionicons name="mail-outline" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Email"
              value={formData.email}
              onChangeText={(v) => updateField('email', v)}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputContainer}>
            <Ionicons name="call-outline" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Telefono"
              value={formData.telefono}
              onChangeText={(v) => updateField('telefono', v)}
              keyboardType="phone-pad"
            />
          </View>

          <Text style={styles.sectionTitle}>Scuola</Text>

          {/* Tipo Scuola Dropdown */}
          <Text style={styles.dropdownLabel}>Tipo di scuola</Text>
          {renderDropdown(
            'Seleziona tipo scuola...',
            getTipoScuolaLabel(),
            () => setShowTipoScuolaModal(true)
          )}

          {/* Scuola Dropdown */}
          <Text style={styles.dropdownLabel}>Scuola</Text>
          {renderDropdown(
            'Seleziona la tua scuola...',
            formData.scuolaNome,
            () => setShowScuolaModal(true),
            !formData.tipoScuola
          )}

          {/* Classe e Sezione */}
          <View style={styles.row}>
            <View style={styles.halfInput}>
              <Text style={styles.dropdownLabel}>Classe</Text>
              {renderDropdown(
                'Classe',
                formData.classe ? `${formData.classe}°` : '',
                () => setShowClasseModal(true),
                !formData.tipoScuola
              )}
            </View>
            <View style={styles.halfInput}>
              <Text style={styles.dropdownLabel}>Sezione</Text>
              {renderDropdown(
                'Sezione',
                formData.sezione,
                () => setShowSezioneModal(true),
                !formData.scuola
              )}
            </View>
          </View>

          <Text style={styles.sectionTitle}>Sicurezza</Text>

          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              value={formData.password}
              onChangeText={(v) => updateField('password', v)}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color="#666"
              />
            </TouchableOpacity>
          </View>

          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Conferma Password"
              value={formData.confirmPassword}
              onChangeText={(v) => updateField('confirmPassword', v)}
              secureTextEntry={!showPassword}
            />
          </View>

          <TouchableOpacity
            style={styles.registerButton}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.registerButtonText}>Registrati</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.loginLink}
            onPress={() => router.push('/(auth)/login')}
          >
            <Text style={styles.loginLinkText}>
              Hai già un account? <Text style={styles.loginLinkBold}>Accedi</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Tipo Scuola Modal */}
      <Modal
        visible={showTipoScuolaModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowTipoScuolaModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Seleziona tipo scuola</Text>
              <TouchableOpacity onPress={() => setShowTipoScuolaModal(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            {SCHOOL_TYPES.map((tipo) => (
              <TouchableOpacity
                key={tipo.key}
                style={styles.modalItem}
                onPress={() => {
                  updateField('tipoScuola', tipo.key);
                  setShowTipoScuolaModal(false);
                }}
              >
                <Text style={styles.modalItemText}>{tipo.label}</Text>
                {formData.tipoScuola === tipo.key && (
                  <Ionicons name="checkmark" size={20} color="#1a472a" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* Scuola Modal */}
      <Modal
        visible={showScuolaModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowScuolaModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.modalContentLarge]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Seleziona la tua scuola</Text>
              <TouchableOpacity onPress={() => setShowScuolaModal(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={availableSchools}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => handleSelectSchool(item)}
                >
                  <Text style={styles.modalItemText}>{item.nome}</Text>
                  {formData.scuola === item.id && (
                    <Ionicons name="checkmark" size={20} color="#1a472a" />
                  )}
                </TouchableOpacity>
              )}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>

      {/* Classe Modal */}
      <Modal
        visible={showClasseModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowClasseModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Seleziona la classe</Text>
              <TouchableOpacity onPress={() => setShowClasseModal(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            {availableClassi.map((classe) => (
              <TouchableOpacity
                key={classe}
                style={styles.modalItem}
                onPress={() => {
                  updateField('classe', classe);
                  setShowClasseModal(false);
                }}
              >
                <Text style={styles.modalItemText}>{classe}° Anno</Text>
                {formData.classe === classe && (
                  <Ionicons name="checkmark" size={20} color="#1a472a" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* Sezione Modal */}
      <Modal
        visible={showSezioneModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSezioneModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Seleziona la sezione</Text>
              <TouchableOpacity onPress={() => setShowSezioneModal(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            {SEZIONI.map((sezione) => (
              <TouchableOpacity
                key={sezione}
                style={styles.modalItem}
                onPress={() => {
                  updateField('sezione', sezione);
                  setShowSezioneModal(false);
                }}
              >
                <Text style={styles.modalItemText}>Sezione {sezione}</Text>
                {formData.sezione === sezione && (
                  <Ionicons name="checkmark" size={20} color="#1a472a" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
  },
  headerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e8f5e9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  headerBannerText: {
    color: '#1a472a',
    fontWeight: '600',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#ef9a9a',
  },
  errorText: {
    flex: 1,
    color: '#c62828',
    fontSize: 14,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a472a',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  form: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a472a',
    marginTop: 8,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  halfInput: {
    flex: 1,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
  },
  dropdownLabel: {
    fontSize: 13,
    color: '#666',
    marginBottom: 6,
    marginTop: 4,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  dropdownDisabled: {
    backgroundColor: '#f5f5f5',
    borderColor: '#e8e8e8',
  },
  dropdownText: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  dropdownPlaceholder: {
    color: '#999',
  },
  registerButton: {
    backgroundColor: '#1a472a',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  registerButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  loginLink: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 32,
  },
  loginLinkText: {
    color: '#666',
    fontSize: 14,
  },
  loginLinkBold: {
    color: '#1a472a',
    fontWeight: 'bold',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
    maxHeight: '50%',
  },
  modalContentLarge: {
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalItemText: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
});
