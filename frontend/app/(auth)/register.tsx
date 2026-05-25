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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

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
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setErrorMessage('');
  };

  const handleRegister = async () => {
    setErrorMessage('');
    const { nome, cognome, email, password, confirmPassword } = formData;

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
      const response = await axios.post(`${API_URL}/api/auth/register`, {
        nome: nome.trim(),
        cognome: cognome.trim(),
        email: email.trim().toLowerCase(),
        password,
      });

      const { user } = response.data;

      // Salva i dati dell'utente
      await AsyncStorage.setItem('user_id', user.id);
      await AsyncStorage.setItem('username', user.email);
      await AsyncStorage.setItem('user_nome', user.nome);
      await AsyncStorage.setItem('is_premium', String(user.is_premium || false));

      // Vai alla home
      router.replace('/(tabs)');
    } catch (error: any) {
      console.error('Registration error:', error.response?.data || error.message);
      const message = error.response?.data?.detail || 'Errore durante la registrazione';
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

              {/* Info Box */}
              <View style={styles.infoBox}>
                <Ionicons name="information-circle" size={20} color="#1a472a" />
                <Text style={styles.infoText}>
                  Dopo la registrazione potrai aggiungere i profili dei tuoi figli e scoprire i libri di cui hanno bisogno.
                </Text>
              </View>

              {/* Register Button */}
              <TouchableOpacity
                style={[
                  styles.registerButton,
                  loading && styles.registerButtonDisabled,
                  isDesktop && styles.registerButtonDesktop,
                ]}
                onPress={handleRegister}
                disabled={loading}
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
});
