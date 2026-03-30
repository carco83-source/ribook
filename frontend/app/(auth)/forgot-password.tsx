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
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'reset'>('email');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [userId, setUserId] = useState('');

  const handleVerifyEmail = async () => {
    if (!email.trim()) {
      setError('Inserisci la tua email');
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

      // Successo - torna al login
      router.replace({
        pathname: '/(auth)/login',
        params: { message: 'Password reimpostata con successo!' }
      });
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
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Ionicons name="key-outline" size={60} color="#fff" />
          <Text style={styles.title}>Recupera Password</Text>
          <Text style={styles.subtitle}>
            {step === 'email'
              ? 'Inserisci la tua email per recuperare la password'
              : 'Inserisci la nuova password'}
          </Text>
        </View>

        {/* Form */}
        <View style={styles.formContainer}>
          {error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={20} color="#f44336" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {step === 'email' ? (
            <>
              <View style={styles.inputContainer}>
                <Ionicons name="mail-outline" size={20} color="#999" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor="#999"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleVerifyEmail}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Continua</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.emailConfirm}>
                <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                <Text style={styles.emailConfirmText}>Email verificata: {email}</Text>
              </View>

              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={20} color="#999" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Nuova Password"
                  placeholderTextColor="#999"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="#999"
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={20} color="#999" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Conferma Password"
                  placeholderTextColor="#999"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                />
              </View>

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleResetPassword}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Reimposta Password</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.backToEmail}
                onPress={() => {
                  setStep('email');
                  setError('');
                }}
              >
                <Text style={styles.backToEmailText}>← Cambia email</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity
            style={styles.loginLink}
            onPress={() => router.push('/(auth)/login')}
          >
            <Text style={styles.loginLinkText}>Ricordi la password? Accedi</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a5c4c',
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    padding: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 20,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 8,
    textAlign: 'center',
  },
  formContainer: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 30,
    paddingTop: 40,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    gap: 8,
  },
  errorText: {
    color: '#f44336',
    fontSize: 14,
    flex: 1,
  },
  emailConfirm: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    gap: 8,
  },
  emailConfirmText: {
    color: '#2e7d32',
    fontSize: 14,
    flex: 1,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  button: {
    backgroundColor: '#1a5c4c',
    borderRadius: 12,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  backToEmail: {
    alignItems: 'center',
    marginTop: 16,
  },
  backToEmailText: {
    color: '#1a5c4c',
    fontSize: 14,
  },
  loginLink: {
    alignItems: 'center',
    marginTop: 30,
  },
  loginLinkText: {
    color: '#1a5c4c',
    fontSize: 16,
  },
});
