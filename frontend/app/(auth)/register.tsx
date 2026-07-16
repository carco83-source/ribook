import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { secureSet, STORAGE_KEYS } from '../../src/utils/secureStorage';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Breakpoints per responsive design
const BREAKPOINTS = {
  mobile: 480,
  tablet: 768,
  desktop: 1024,
};

export default function RegisterScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  
  // Determina il tipo di dispositivo
  const isDesktop = width >= BREAKPOINTS.desktop;
  const isTablet = width >= BREAKPOINTS.tablet && width < BREAKPOINTS.desktop;
  const isMobile = width < BREAKPOINTS.tablet;
  const isLandscape = width > height;
  
  const [formData, setFormData] = useState({
    nome: '',
    cognome: '',
    email: '',
    password: '',
    confirmPassword: '',
    codiceFiscale: '',
    dataNascita: '',
    iban: '',
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedMarketing, setAcceptedMarketing] = useState(false);

  // Versione corrente dei termini
  const TERMS_VERSION = '1.0.0';

  // Funzione per validare IBAN italiano
  const validateIBAN = (iban: string): boolean => {
    if (!iban) return true; // IBAN è opzionale
    const cleanIban = iban.replace(/\s/g, '').toUpperCase();
    // IBAN italiano: IT + 2 cifre controllo + 1 lettera + 5 cifre ABI + 5 cifre CAB + 12 caratteri conto
    const ibanRegex = /^IT\d{2}[A-Z]\d{5}\d{5}[A-Z0-9]{12}$/;
    return ibanRegex.test(cleanIban);
  };

  // Funzione per validare formato Codice Fiscale
  const validateCodiceFiscaleFormat = (cf: string): boolean => {
    if (!cf) return false;
    const cleanCf = cf.toUpperCase().replace(/\s/g, '');
    // Pattern: 6 lettere + 2 numeri + 1 lettera + 2 numeri + 1 lettera + 3 alfanumerici + 1 lettera
    const pattern = /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/;
    return pattern.test(cleanCf);
  };

  // Formatta codice fiscale in maiuscolo
  const formatCodiceFiscale = (value: string): string => {
    return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
  };

  // Calcola età dalla data di nascita (formato GG/MM/AAAA)
  const calculateAge = (dateString: string): number => {
    if (!dateString || dateString.length < 10) return -1;
    
    // Parse formato GG/MM/AAAA
    const parts = dateString.split('/');
    if (parts.length !== 3) return -1;
    
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // Mesi in JS sono 0-indexed
    const year = parseInt(parts[2], 10);
    
    if (isNaN(day) || isNaN(month) || isNaN(year)) return -1;
    
    const birthDate = new Date(year, month, day);
    const today = new Date();
    
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const formatIBAN = (value: string): string => {
    const clean = value.replace(/\s/g, '').toUpperCase();
    // Formatta in gruppi di 4 caratteri
    return clean.replace(/(.{4})/g, '$1 ').trim();
  };

  const updateField = (field: string, value: string) => {
    if (field === 'iban') {
      value = formatIBAN(value);
    } else if (field === 'codiceFiscale') {
      value = formatCodiceFiscale(value);
    }
    setFormData(prev => ({ ...prev, [field]: value }));
    setErrorMessage('');
  };

  const handleRegister = async () => {
    setErrorMessage('');
    const { nome, cognome, email, password, confirmPassword, codiceFiscale, dataNascita, iban } = formData;

    // Validazione campi
    if (!nome.trim()) {
      setErrorMessage('Inserisci il tuo nome');
      return;
    }
    if (!cognome.trim()) {
      setErrorMessage('Inserisci il tuo cognome');
      return;
    }
    if (!email.trim()) {
      setErrorMessage('Inserisci la tua email');
      return;
    }
    if (!email.includes('@')) {
      setErrorMessage('Inserisci un\'email valida');
      return;
    }
    
    // Validazione Codice Fiscale (OBBLIGATORIO)
    if (!codiceFiscale.trim()) {
      setErrorMessage('Il codice fiscale è obbligatorio');
      return;
    }
    if (!validateCodiceFiscaleFormat(codiceFiscale)) {
      setErrorMessage('Codice fiscale non valido. Deve essere di 16 caratteri.');
      return;
    }
    
    // Validazione Data di Nascita (OBBLIGATORIA)
    if (!dataNascita) {
      setErrorMessage('La data di nascita è obbligatoria');
      return;
    }
    
    // Verifica età minima (18 anni)
    const age = calculateAge(dataNascita);
    if (age < 18) {
      setErrorMessage('Devi avere almeno 18 anni per registrarti');
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
    // Validazione IBAN (opzionale ma se inserito deve essere valido)
    if (iban && !validateIBAN(iban)) {
      setErrorMessage('IBAN non valido. Formato: IT + 25 caratteri');
      return;
    }
    // Validazione accettazione termini (obbligatoria)
    if (!acceptedTerms) {
      setErrorMessage('Devi accettare i Termini e Condizioni, la Privacy Policy e la Cookie Policy per registrarti');
      return;
    }

    setLoading(true);
    try {
      const cleanIban = iban ? iban.replace(/\s/g, '').toUpperCase() : null;
      
      // Converti data da GG/MM/AAAA a AAAA-MM-GG per il backend
      let formattedDate = dataNascita;
      if (dataNascita && dataNascita.includes('/')) {
        const parts = dataNascita.split('/');
        if (parts.length === 3) {
          formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
      }
      
      const response = await axios.post(`${API_URL}/api/auth/register`, {
        nome: nome.trim(),
        cognome: cognome.trim(),
        email: email.trim().toLowerCase(),
        password,
        codice_fiscale: codiceFiscale.toUpperCase(),
        data_nascita: formattedDate,
        iban: cleanIban,
        // Consensi GDPR
        terms_accepted: true,
        terms_version: TERMS_VERSION,
        marketing_consent: acceptedMarketing,
        registration_method: 'email',
      });

      // Il backend ritorna { message, user_id, username }
      const { user_id, username } = response.data;

      // Migra eventuali profili temporanei
      const tempProfiles = await AsyncStorage.getItem('temp_profiles');
      if (tempProfiles) {
        try {
          const profiles = JSON.parse(tempProfiles);
          if (profiles && profiles.length > 0) {
            await axios.post(`${API_URL}/api/auth/migrate-profiles/${user_id}`, {
              profiles: profiles
            });
            // Rimuovi i profili temporanei dopo la migrazione
            await AsyncStorage.removeItem('temp_profiles');
            console.log(`Migrated ${profiles.length} temporary profiles to user ${user_id}`);
          }
        } catch (migrateError) {
          console.log('Error migrating temp profiles:', migrateError);
          // Non bloccare la registrazione se la migrazione fallisce
        }
      }

      // Salva i dati dell'utente in modo sicuro
      await secureSet(STORAGE_KEYS.USER_ID, user_id);
      
      // Dati non sensibili in AsyncStorage
      await AsyncStorage.setItem('username', username);
      await AsyncStorage.setItem('user_nome', nome.trim());
      await AsyncStorage.setItem('is_premium', 'false');

      // Vai alla home
      router.replace('/(tabs)');
    } catch (error: any) {
      console.error('Registration error:', error);
      console.error('Response data:', error.response?.data);
      console.error('Response status:', error.response?.status);
      
      let message = 'Errore durante la registrazione';
      if (error.response?.data?.detail) {
        message = error.response.data.detail;
      } else if (error.message) {
        message = error.message;
      }
      
      // Mostra alert per debug
      if (Platform.OS === 'web') {
        window.alert(`Errore: ${message}\n\nStatus: ${error.response?.status || 'N/A'}`);
      } else {
        Alert.alert('Errore Registrazione', message);
      }
      
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  // Stili dinamici basati sulla dimensione dello schermo
  const dynamicStyles = {
    formMaxWidth: isDesktop ? 500 : isTablet ? 450 : '100%',
    headerPadding: isDesktop ? 60 : isTablet ? 50 : 40,
    fontSize: {
      title: isDesktop ? 36 : isTablet ? 34 : 32,
      subtitle: isDesktop ? 18 : 16,
      sectionTitle: isDesktop ? 20 : 18,
      input: isDesktop ? 17 : 16,
      button: isDesktop ? 19 : 18,
    },
    spacing: {
      inputMargin: isDesktop ? 20 : 16,
      containerPadding: isDesktop ? 32 : isTablet ? 28 : 20,
    },
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <Stack.Screen 
        options={{
          title: 'Registrati',
          headerShown: true,
          headerBackTitle: '',
          headerBackTitleVisible: false,
          headerStyle: { backgroundColor: '#1a472a' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '600' },
        }}
      />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isDesktop && styles.scrollContentDesktop,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Layout wrapper per centrare su desktop/tablet */}
        <View style={[
          styles.contentWrapper,
          isDesktop && styles.contentWrapperDesktop,
          isTablet && styles.contentWrapperTablet,
        ]}>
          
          {/* Header Banner */}
          <View style={[
            styles.headerBanner,
            isDesktop && styles.headerBannerDesktop,
            isTablet && styles.headerBannerTablet,
          ]}>
            <Ionicons name="book" size={isDesktop ? 56 : isTablet ? 52 : 48} color="#fff" />
            <Text style={[styles.headerTitle, { fontSize: dynamicStyles.fontSize.title }]}>
              RiBook
            </Text>
            <Text style={[styles.headerSubtitle, { fontSize: dynamicStyles.fontSize.subtitle }]}>
              Crea il tuo account
            </Text>
          </View>

          {/* Form Container */}
          <View style={[
            styles.formContainer,
            isDesktop && styles.formContainerDesktop,
            isTablet && styles.formContainerTablet,
            { padding: dynamicStyles.spacing.containerPadding },
          ]}>
            {/* Inner container per max-width */}
            <View style={[
              styles.formInner,
              { maxWidth: dynamicStyles.formMaxWidth, width: '100%' },
            ]}>
              
              {errorMessage ? (
                <View style={styles.errorContainer}>
                  <Ionicons name="alert-circle" size={20} color="#f44336" />
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              ) : null}

              <Text style={[styles.sectionTitle, { fontSize: dynamicStyles.fontSize.sectionTitle }]}>
                I tuoi dati
              </Text>

              {/* Layout a 2 colonne per desktop/tablet landscape */}
              <View style={[
                styles.fieldsRow,
                (isDesktop || (isTablet && isLandscape)) && styles.fieldsRowDesktop,
              ]}>
                {/* Nome */}
                <View style={[
                  styles.inputGroup,
                  (isDesktop || (isTablet && isLandscape)) && styles.inputGroupHalf,
                  { marginBottom: dynamicStyles.spacing.inputMargin },
                ]}>
                  <Text style={styles.inputLabel}>Nome *</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="person-outline" size={20} color="#666" style={styles.inputIcon} />
                    <TextInput
                      style={[styles.input, { fontSize: dynamicStyles.fontSize.input }]}
                      placeholder="Il tuo nome"
                      placeholderTextColor="#999"
                      value={formData.nome}
                      onChangeText={(v) => updateField('nome', v)}
                      autoCapitalize="words"
                    />
                  </View>
                </View>

                {/* Cognome */}
                <View style={[
                  styles.inputGroup,
                  (isDesktop || (isTablet && isLandscape)) && styles.inputGroupHalf,
                  { marginBottom: dynamicStyles.spacing.inputMargin },
                ]}>
                  <Text style={styles.inputLabel}>Cognome *</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="person-outline" size={20} color="#666" style={styles.inputIcon} />
                    <TextInput
                      style={[styles.input, { fontSize: dynamicStyles.fontSize.input }]}
                      placeholder="Il tuo cognome"
                      placeholderTextColor="#999"
                      value={formData.cognome}
                      onChangeText={(v) => updateField('cognome', v)}
                      autoCapitalize="words"
                    />
                  </View>
                </View>
              </View>

              {/* Email - full width */}
              <View style={[styles.inputGroup, { marginBottom: dynamicStyles.spacing.inputMargin }]}>
                <Text style={styles.inputLabel}>Email *</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="mail-outline" size={20} color="#666" style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { fontSize: dynamicStyles.fontSize.input }]}
                    placeholder="La tua email"
                    placeholderTextColor="#999"
                    value={formData.email}
                    onChangeText={(v) => updateField('email', v)}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>

              {/* Sezione Identità */}
              <Text style={[
                styles.sectionTitle, 
                { marginTop: 24, fontSize: dynamicStyles.fontSize.sectionTitle }
              ]}>
                Verifica Identità
              </Text>
              
              <View style={styles.identityInfoBox}>
                <Ionicons name="shield-checkmark-outline" size={18} color="#2563eb" />
                <Text style={styles.identityInfoText}>
                  Per la sicurezza di tutti gli utenti, verifichiamo la tua identità tramite il codice fiscale.
                  I dati sono criptati e protetti.
                </Text>
              </View>

              {/* Layout a 2 colonne per CF e Data Nascita su desktop */}
              <View style={[
                styles.fieldsRow,
                (isDesktop || (isTablet && isLandscape)) && styles.fieldsRowDesktop,
              ]}>
                {/* Codice Fiscale */}
                <View style={[
                  styles.inputGroup,
                  (isDesktop || (isTablet && isLandscape)) && styles.inputGroupHalf,
                  { marginBottom: dynamicStyles.spacing.inputMargin },
                ]}>
                  <Text style={styles.inputLabel}>Codice Fiscale *</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="card-outline" size={20} color="#666" style={styles.inputIcon} />
                    <TextInput
                      style={[styles.input, { fontSize: dynamicStyles.fontSize.input }]}
                      placeholder="Es: RSSMRA85M01H501Z"
                      placeholderTextColor="#999"
                      value={formData.codiceFiscale}
                      onChangeText={(v) => updateField('codiceFiscale', v)}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      maxLength={16}
                    />
                  </View>
                  {formData.codiceFiscale.length > 0 && formData.codiceFiscale.length < 16 && (
                    <Text style={styles.charCountText}>
                      {formData.codiceFiscale.length}/16 caratteri
                    </Text>
                  )}
                </View>

                {/* Data di Nascita */}
                <View style={[
                  styles.inputGroup,
                  (isDesktop || (isTablet && isLandscape)) && styles.inputGroupHalf,
                  { marginBottom: dynamicStyles.spacing.inputMargin },
                ]}>
                  <Text style={styles.inputLabel}>Data di Nascita *</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="calendar-outline" size={20} color="#666" style={styles.inputIcon} />
                    <TextInput
                      style={[styles.input, { fontSize: dynamicStyles.fontSize.input }]}
                      placeholder="GG/MM/AAAA (es: 15/05/1990)"
                      placeholderTextColor="#999"
                      value={formData.dataNascita}
                      onChangeText={(v) => {
                        // Formattazione automatica della data GG/MM/AAAA
                        let formatted = v.replace(/[^0-9]/g, '');
                        if (formatted.length > 2) {
                          formatted = formatted.slice(0, 2) + '/' + formatted.slice(2);
                        }
                        if (formatted.length > 5) {
                          formatted = formatted.slice(0, 5) + '/' + formatted.slice(5);
                        }
                        formatted = formatted.slice(0, 10);
                        updateField('dataNascita', formatted);
                      }}
                      keyboardType="numeric"
                      maxLength={10}
                    />
                  </View>
                  {formData.dataNascita && calculateAge(formData.dataNascita) >= 0 && (
                    <Text style={[
                      styles.ageText,
                      calculateAge(formData.dataNascita) < 18 && styles.ageTextError
                    ]}>
                      {calculateAge(formData.dataNascita) < 18 
                        ? `Età: ${calculateAge(formData.dataNascita)} anni - Devi avere almeno 18 anni`
                        : `Età: ${calculateAge(formData.dataNascita)} anni ✓`
                      }
                    </Text>
                  )}
                </View>
              </View>

              <Text style={[
                styles.sectionTitle, 
                { marginTop: 24, fontSize: dynamicStyles.fontSize.sectionTitle }
              ]}>
                Sicurezza
              </Text>

              {/* Layout a 2 colonne per password su desktop */}
              <View style={[
                styles.fieldsRow,
                isDesktop && styles.fieldsRowDesktop,
              ]}>
                {/* Password */}
                <View style={[
                  styles.inputGroup,
                  isDesktop && styles.inputGroupHalf,
                  { marginBottom: dynamicStyles.spacing.inputMargin },
                ]}>
                  <Text style={styles.inputLabel}>Password *</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
                    <TextInput
                      style={[styles.input, { fontSize: dynamicStyles.fontSize.input }]}
                      placeholder="Almeno 6 caratteri"
                      placeholderTextColor="#999"
                      value={formData.password}
                      onChangeText={(v) => updateField('password', v)}
                      secureTextEntry={!showPassword}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword(!showPassword)}
                      style={styles.eyeButton}
                    >
                      <Ionicons
                        name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={20}
                        color="#666"
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Conferma Password */}
                <View style={[
                  styles.inputGroup,
                  isDesktop && styles.inputGroupHalf,
                  { marginBottom: dynamicStyles.spacing.inputMargin },
                ]}>
                  <Text style={styles.inputLabel}>Conferma Password *</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
                    <TextInput
                      style={[styles.input, { fontSize: dynamicStyles.fontSize.input }]}
                      placeholder="Ripeti la password"
                      placeholderTextColor="#999"
                      value={formData.confirmPassword}
                      onChangeText={(v) => updateField('confirmPassword', v)}
                      secureTextEntry={!showConfirmPassword}
                    />
                    <TouchableOpacity
                      onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                      style={styles.eyeButton}
                    >
                      <Ionicons
                        name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={20}
                        color="#666"
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Sezione Pagamenti */}
              <Text style={[
                styles.sectionTitle, 
                { marginTop: 24, fontSize: dynamicStyles.fontSize.sectionTitle }
              ]}>
                Pagamenti (opzionale)
              </Text>

              {/* IBAN */}
              <View style={[styles.inputGroup, { marginBottom: dynamicStyles.spacing.inputMargin }]}>
                <Text style={styles.inputLabel}>IBAN</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="card-outline" size={20} color="#666" style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { fontSize: dynamicStyles.fontSize.input }]}
                    placeholder="IT00 A000 0000 0000 0000 0000 000"
                    placeholderTextColor="#999"
                    value={formData.iban}
                    onChangeText={(v) => updateField('iban', v)}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={34}
                  />
                </View>
                <Text style={styles.ibanHint}>
                  Inserisci il tuo IBAN per ricevere i pagamenti quando vendi i libri
                </Text>
              </View>

              {/* Info Box */}
              <View style={styles.infoBox}>
                <Ionicons name="information-circle" size={20} color="#1a472a" />
                <Text style={styles.infoText}>
                  Dopo la registrazione potrai aggiungere i profili dei tuoi figli e scoprire i libri di cui hanno bisogno.
                </Text>
              </View>

              {/* Sezione Consensi */}
              <Text style={[
                styles.sectionTitle, 
                { marginTop: 24, fontSize: dynamicStyles.fontSize.sectionTitle }
              ]}>
                Consensi
              </Text>

              {/* Checkbox Termini (obbligatoria) */}
              <TouchableOpacity 
                style={styles.checkboxContainer}
                onPress={() => setAcceptedTerms(!acceptedTerms)}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.checkbox,
                  acceptedTerms && styles.checkboxChecked
                ]}>
                  {acceptedTerms && (
                    <Ionicons name="checkmark" size={16} color="#fff" />
                  )}
                </View>
                <Text style={styles.checkboxLabel}>
                  Dichiaro di aver letto e accettato i{' '}
                  <Text style={styles.checkboxLink}>Termini e Condizioni</Text>,{' '}
                  la <Text style={styles.checkboxLink}>Privacy Policy</Text> e{' '}
                  la <Text style={styles.checkboxLink}>Cookie Policy</Text>.{' '}
                  <Text style={styles.requiredStar}>*</Text>
                </Text>
              </TouchableOpacity>

              {/* Checkbox Marketing (facoltativa) */}
              <TouchableOpacity 
                style={[styles.checkboxContainer, { marginTop: 12 }]}
                onPress={() => setAcceptedMarketing(!acceptedMarketing)}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.checkbox,
                  acceptedMarketing && styles.checkboxChecked
                ]}>
                  {acceptedMarketing && (
                    <Ionicons name="checkmark" size={16} color="#fff" />
                  )}
                </View>
                <Text style={styles.checkboxLabel}>
                  Acconsento a ricevere comunicazioni informative e promozionali da RiBook.
                </Text>
              </TouchableOpacity>

              {/* Register Button */}
              <TouchableOpacity
                style={[
                  styles.registerButton,
                  (loading || !acceptedTerms) && styles.registerButtonDisabled,
                  isDesktop && styles.registerButtonDesktop,
                ]}
                onPress={handleRegister}
                disabled={loading || !acceptedTerms}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={[styles.registerButtonText, { fontSize: dynamicStyles.fontSize.button }]}>
                      Crea Account
                    </Text>
                    <Ionicons name="arrow-forward" size={20} color="#fff" />
                  </>
                )}
              </TouchableOpacity>

              {/* Link Login */}
              <TouchableOpacity
                style={styles.loginLink}
                onPress={() => router.push('/(auth)/login')}
              >
                <Text style={styles.loginLinkText}>
                  Hai già un account? <Text style={styles.loginLinkBold}>Accedi</Text>
                </Text>
              </TouchableOpacity>
            </View>
          </View>
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
  scrollContent: {
    flexGrow: 1,
  },
  scrollContentDesktop: {
    justifyContent: 'center',
    minHeight: '100%',
  },
  contentWrapper: {
    flex: 1,
  },
  contentWrapperDesktop: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 40,
    maxWidth: 1200,
    alignSelf: 'center',
    width: '100%',
  },
  contentWrapperTablet: {
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  headerBanner: {
    backgroundColor: '#1a472a',
    paddingTop: 60,
    paddingBottom: 40,
    alignItems: 'center',
  },
  headerBannerDesktop: {
    flex: 1,
    maxWidth: 400,
    borderRadius: 24,
    marginRight: 40,
    justifyContent: 'center',
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 40,
  },
  headerBannerTablet: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingTop: 70,
    paddingBottom: 50,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 12,
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  formContainer: {
    padding: 20,
    marginTop: -20,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: 500,
  },
  formContainerDesktop: {
    flex: 1.5,
    marginTop: 0,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  formContainerTablet: {
    marginHorizontal: 20,
    marginTop: -20,
    marginBottom: 20,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  formInner: {
    alignSelf: 'center',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    flex: 1,
    color: '#f44336',
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 16,
  },
  fieldsRow: {
    flexDirection: 'column',
  },
  fieldsRowDesktop: {
    flexDirection: 'row',
    gap: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputGroupHalf: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  inputIcon: {
    paddingLeft: 14,
  },
  input: {
    flex: 1,
    padding: 14,
    fontSize: 16,
    color: '#333',
  },
  eyeButton: {
    padding: 14,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#e8f5e9',
    padding: 14,
    borderRadius: 10,
    marginTop: 8,
    marginBottom: 24,
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#1a472a',
    lineHeight: 18,
  },
  registerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a472a',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  registerButtonDesktop: {
    padding: 18,
    borderRadius: 14,
  },
  registerButtonDisabled: {
    backgroundColor: '#ccc',
  },
  registerButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  loginLink: {
    alignItems: 'center',
    marginTop: 20,
    paddingBottom: 20,
  },
  loginLinkText: {
    fontSize: 14,
    color: '#666',
  },
  loginLinkBold: {
    color: '#1a472a',
    fontWeight: '700',
  },
  ibanHint: {
    fontSize: 12,
    color: '#666',
    marginTop: 6,
    lineHeight: 16,
  },
  identityInfoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#eff6ff',
    padding: 14,
    borderRadius: 10,
    marginBottom: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  identityInfoText: {
    flex: 1,
    fontSize: 13,
    color: '#1e40af',
    lineHeight: 18,
  },
  charCountText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    textAlign: 'right',
  },
  ageText: {
    fontSize: 12,
    color: '#22c55e',
    marginTop: 4,
  },
  ageTextError: {
    color: '#ef4444',
  },
  // Stili checkbox consensi
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#1a472a',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: '#1a472a',
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  checkboxLink: {
    color: '#1a472a',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  requiredStar: {
    color: '#ef4444',
    fontWeight: '700',
  },
});
