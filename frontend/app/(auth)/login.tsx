import React, { useState } from 'react';
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
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

// Debug: log API_URL
console.log('[Login] API_URL:', API_URL);

// Breakpoints per responsive design
const BREAKPOINTS = {
  mobile: 480,
  tablet: 768,
  desktop: 1024,
};

export default function LoginScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  
  // Determina il tipo di dispositivo
  const isDesktop = width >= BREAKPOINTS.desktop;
  const isTablet = width >= BREAKPOINTS.tablet && width < BREAKPOINTS.desktop;
  const isMobile = width < BREAKPOINTS.tablet;
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Stili dinamici
  const dynamicStyles = {
    maxWidth: isDesktop ? 440 : isTablet ? 400 : '100%',
    iconSize: isDesktop ? 70 : isTablet ? 65 : 60,
    fontSize: {
      title: isDesktop ? 32 : isTablet ? 30 : 28,
      subtitle: isDesktop ? 17 : 16,
      input: isDesktop ? 17 : 16,
      button: isDesktop ? 19 : 18,
    },
    padding: isDesktop ? 40 : isTablet ? 32 : 24,
  };

  const handleLogin = async () => {
    console.log('[Login] handleLogin called');
    console.log('[Login] email:', email);
    console.log('[Login] password length:', password?.length);
    
    if (!email || !password) {
      Alert.alert('Errore', 'Inserisci email e password');
      return;
    }

    setLoading(true);
    try {
      console.log('[Login] Making API call to:', `${API_URL}/api/auth/login`);
      const response = await axios.post(`${API_URL}/api/auth/login`, {
        email,
        password,
      });

      console.log('[Login] Response:', response.data);
      await AsyncStorage.setItem('user_id', response.data.user_id);
      await AsyncStorage.setItem('username', response.data.username);
      await AsyncStorage.setItem('user_nome', response.data.nome);
      await AsyncStorage.setItem('is_premium', response.data.is_premium.toString());

      router.replace('/(tabs)');
    } catch (error: any) {
      console.error('[Login] Error:', error);
      console.error('[Login] Error response:', error.response?.data);
      Alert.alert(
        'Errore',
        error.response?.data?.detail || 'Credenziali non valide'
      );
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
        {/* Card container per desktop/tablet */}
        <View style={[
          styles.card,
          isDesktop && styles.cardDesktop,
          isTablet && styles.cardTablet,
          { maxWidth: dynamicStyles.maxWidth, padding: dynamicStyles.padding },
        ]}>
          <View style={styles.iconContainer}>
            <Ionicons name="book" size={dynamicStyles.iconSize} color="#1a472a" />
          </View>

          <Text style={[styles.title, { fontSize: dynamicStyles.fontSize.title }]}>
            Bentornato!
          </Text>
          <Text style={[styles.subtitle, { fontSize: dynamicStyles.fontSize.subtitle }]}>
            Accedi per continuare
          </Text>

          <View style={styles.form}>
            <View style={[styles.inputContainer, isDesktop && styles.inputContainerDesktop]}>
              <Ionicons name="mail-outline" size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { fontSize: dynamicStyles.fontSize.input }]}
                placeholder="Email"
                placeholderTextColor="#999"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={[styles.inputContainer, isDesktop && styles.inputContainerDesktop]}>
              <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { fontSize: dynamicStyles.fontSize.input }]}
                placeholder="Password"
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
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

            <TouchableOpacity
              style={[styles.loginButton, isDesktop && styles.loginButtonDesktop]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
              testID="login-button"
              accessibilityRole="button"
              accessibilityLabel="Accedi"
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.loginButtonText, { fontSize: dynamicStyles.fontSize.button }]}>
                  Accedi
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.forgotPassword}
              onPress={() => router.push('/(auth)/forgot-password')}
            >
              <Text style={styles.forgotPasswordText}>Password dimenticata?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.registerLink}
              onPress={() => router.push('/(auth)/register')}
            >
              <Text style={styles.registerLinkText}>
                Non hai un account? <Text style={styles.registerLinkBold}>Registrati</Text>
              </Text>
            </TouchableOpacity>
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
    padding: 24,
    justifyContent: 'center',
  },
  scrollContentCentered: {
    alignItems: 'center',
  },
  card: {
    width: '100%',
  },
  cardDesktop: {
    backgroundColor: '#fff',
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
  },
  cardTablet: {
    backgroundColor: '#fff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a472a',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  form: {
    gap: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
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
  loginButton: {
    backgroundColor: '#1a472a',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  loginButtonDesktop: {
    paddingVertical: 18,
    borderRadius: 14,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  registerLink: {
    alignItems: 'center',
    marginTop: 16,
  },
  registerLinkText: {
    color: '#666',
    fontSize: 14,
  },
  registerLinkBold: {
    color: '#1a472a',
    fontWeight: 'bold',
  },
  forgotPassword: {
    alignItems: 'center',
    marginTop: 12,
  },
  forgotPasswordText: {
    color: '#1a5c4c',
    fontSize: 14,
    fontWeight: '500',
  },
});
