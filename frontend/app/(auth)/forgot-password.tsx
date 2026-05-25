import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const BREAKPOINTS = {
  tablet: 768,
  desktop: 1024,
};

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  
  const isDesktop = width >= BREAKPOINTS.desktop;
  const isTablet = width >= BREAKPOINTS.tablet && width < BREAKPOINTS.desktop;
  
  const [step, setStep] = useState<'email' | 'reset'>('email');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [userId, setUserId] = useState('');

  const dynamicStyles = {
    maxWidth: isDesktop ? 440 : isTablet ? 400 : '100%',
    padding: isDesktop ? 40 : isTablet ? 32 : 24,
    fontSize: {
      title: isDesktop ? 28 : 24,
      subtitle: isDesktop ? 16 : 15,
      input: isDesktop ? 17 : 16,
      button: isDesktop ? 18 : 17,
    },
  };

  const handleVerifyEmail = async () => {
    if (!email.trim()) {
      setError('Inserisci la tua email');
      return;
    }

    if (!email.includes('@')) {
      setError('Inserisci un\'email valida');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await axios.post(`${API_URL}/api/auth/verify-email`, {
        email: email.trim().toLowerCase(),
      });

      if (response.data.exists) {
        setUserId(response.data.user_id);
        setStep('reset');
        setSuccess('Email verificata! Inserisci la nuova password.');
      } else {
        setError('Email non trovata nel sistema');
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Errore durante la verifica');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || !confirmPassword) {
      setError('Compila tutti i campi');
      return;
    }

    if (newPassword.length < 6) {
      setError('La password deve essere di almeno 6 caratteri');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Le password non coincidono');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await axios.post(`${API_URL}/api/auth/reset-password`, {
        user_id: userId,
        new_password: newPassword,
      });

      setSuccess('Password reimpostata con successo!');
      setTimeout(() => {
        router.replace('/(auth)/login');
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Errore durante il reset');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          (isDesktop || isTablet) && styles.scrollContentCentered,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[
          styles.card,
          isDesktop && styles.cardDesktop,
          isTablet && styles.cardTablet,
          { maxWidth: dynamicStyles.maxWidth, padding: dynamicStyles.padding },
        ]}>
          {/* Back Button */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => step === 'reset' ? setStep('email') : router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#1a472a" />
          </TouchableOpacity>

          {/* Icon */}
          <View style={styles.iconContainer}>
            <View style={styles.iconCircle}>
              <Ionicons 
                name={step === 'email' ? 'mail-outline' : 'lock-closed-outline'} 
                size={40} 
                color="#1a472a" 
              />
            </View>
          </View>

          {/* Title */}
          <Text style={[styles.title, { fontSize: dynamicStyles.fontSize.title }]}>
            {step === 'email' ? 'Recupera Password' : 'Nuova Password'}
          </Text>
          <Text style={[styles.subtitle, { fontSize: dynamicStyles.fontSize.subtitle }]}>
            {step === 'email' 
              ? 'Inserisci la tua email per recuperare la password'
              : 'Inserisci la tua nuova password'
            }
          </Text>

          {/* Error Message */}
          {error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={20} color="#f44336" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Success Message */}
          {success ? (
            <View style={styles.successContainer}>
              <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
              <Text style={styles.successText}>{success}</Text>
            </View>
          ) : null}

          {step === 'email' ? (
            /* Step 1: Email */
            <>
              <View style={[styles.inputContainer, isDesktop && styles.inputContainerDesktop]}>
                <Ionicons name="mail-outline" size={20} color="#666" style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { fontSize: dynamicStyles.fontSize.input }]}
                  placeholder="La tua email"
                  placeholderTextColor="#999"
                  value={email}
                  onChangeText={(v) => { setEmail(v); setError(''); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <TouchableOpacity
                style={[styles.button, isDesktop && styles.buttonDesktop]}
                onPress={handleVerifyEmail}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.buttonText, { fontSize: dynamicStyles.fontSize.button }]}>
                    Verifica Email
                  </Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            /* Step 2: New Password */
            <>
              <View style={[styles.inputContainer, isDesktop && styles.inputContainerDesktop]}>
                <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { fontSize: dynamicStyles.fontSize.input }]}
                  placeholder="Nuova password"
                  placeholderTextColor="#999"
                  value={newPassword}
                  onChangeText={(v) => { setNewPassword(v); setError(''); }}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="#666"
                  />
                </TouchableOpacity>
              </View>

              <View style={[styles.inputContainer, isDesktop && styles.inputContainerDesktop]}>
                <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { fontSize: dynamicStyles.fontSize.input }]}
                  placeholder="Conferma password"
                  placeholderTextColor="#999"
                  value={confirmPassword}
                  onChangeText={(v) => { setConfirmPassword(v); setError(''); }}
                  secureTextEntry={!showConfirmPassword}
                />
                <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeButton}>
                  <Ionicons
                    name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="#666"
                  />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.button, isDesktop && styles.buttonDesktop]}
                onPress={handleResetPassword}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.buttonText, { fontSize: dynamicStyles.fontSize.button }]}>
                    Reimposta Password
                  </Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {/* Back to Login */}
          <TouchableOpacity
            style={styles.loginLink}
            onPress={() => router.push('/(auth)/login')}
          >
            <Text style={styles.loginLinkText}>
              Ricordi la password? <Text style={styles.loginLinkBold}>Accedi</Text>
            </Text>
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
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  scrollContentCentered: {
    alignItems: 'center',
  },
  card: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
  },
  cardDesktop: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
  },
  cardTablet: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  backButton: {
    alignSelf: 'flex-start',
    padding: 8,
    marginBottom: 8,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#e8f5e9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a472a',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
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
  successContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  successText: {
    flex: 1,
    color: '#4CAF50',
    fontSize: 14,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 16,
  },
  inputContainerDesktop: {
    borderRadius: 14,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    fontSize: 16,
    color: '#333',
  },
  eyeButton: {
    padding: 4,
  },
  button: {
    backgroundColor: '#1a472a',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDesktop: {
    paddingVertical: 18,
    borderRadius: 14,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
  },
  loginLink: {
    alignItems: 'center',
    marginTop: 24,
  },
  loginLinkText: {
    color: '#666',
    fontSize: 14,
  },
  loginLinkBold: {
    color: '#1a472a',
    fontWeight: 'bold',
  },
});
