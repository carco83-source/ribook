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
  useWindowDimensions,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { secureSet, STORAGE_KEYS } from '../../src/utils/secureStorage';
import { registerForPushNotifications } from '../../src/utils/pushNotifications';

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
  const [googleLoading, setGoogleLoading] = useState(false);

  // Controlla se c'è un session_id nel URL (ritorno da OAuth web)
  useEffect(() => {
    if (Platform.OS === 'web') {
      checkWebOAuthReturn();
    }
  }, []);
  
  const checkWebOAuthReturn = async () => {
    if (Platform.OS !== 'web') return;
    
    // Controlla hash fragment o query params
    const hash = window.location.hash;
    const search = window.location.search;
    
    let sessionId = '';
    
    if (hash && hash.includes('session_id=')) {
      sessionId = hash.split('session_id=')[1]?.split('&')[0];
    } else if (search && search.includes('session_id=')) {
      sessionId = new URLSearchParams(search).get('session_id') || '';
    }
    
    if (sessionId) {
      console.log('[Google OAuth] Found session_id in URL');
      // Pulisci URL
      window.history.replaceState(null, '', window.location.pathname);
      await processGoogleSessionId(sessionId);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      // Costruisci redirect URL in base alla piattaforma
      let redirectUrl: string;
      
      if (Platform.OS === 'web') {
        // Su web, redirect a /auth che gestisce il callback OAuth
        redirectUrl = window.location.origin + '/auth';
      } else {
        redirectUrl = Linking.createURL('auth');
      }
      
      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
      
      console.log('[Google OAuth] Redirect URL:', redirectUrl);
      console.log('[Google OAuth] Auth URL:', authUrl);
      
      if (Platform.OS === 'web') {
        // Su web, redirect diretto
        window.location.href = authUrl;
      } else {
        // Su mobile, usa WebBrowser
        const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
        
        if (result.type === 'success' && result.url) {
          console.log('[Google OAuth] Result URL:', result.url);
          // Estrai session_id
          const url = new URL(result.url);
          let sessionId = url.searchParams.get('session_id');
          
          if (!sessionId && url.hash) {
            const hashParams = new URLSearchParams(url.hash.substring(1));
            sessionId = hashParams.get('session_id');
          }
          
          if (sessionId) {
            await processGoogleSessionId(sessionId);
          } else {
            Alert.alert('Errore', 'Autenticazione Google fallita');
          }
        } else if (result.type === 'cancel') {
          console.log('[Google OAuth] User cancelled');
        }
      }
    } catch (error: any) {
      console.error('[Google OAuth] Error:', error);
      Alert.alert('Errore', 'Impossibile avviare autenticazione Google');
    } finally {
      setGoogleLoading(false);
    }
  };
  
  const processGoogleSessionId = async (sessionId: string) => {
    setGoogleLoading(true);
    try {
      console.log('[Google OAuth] Processing session_id:', sessionId.substring(0, 20) + '...');
      
      // Chiama backend per verificare e creare sessione
      const response = await axios.post(`${API_URL}/api/auth/google/callback`, {
        session_id: sessionId
      });
      
      const data = response.data;
      console.log('[Google OAuth] Backend response:', data);
      
      if (data.success) {
        // Salva token in modo sicuro (localStorage su web, AsyncStorage su mobile)
        await secureSet(STORAGE_KEYS.SESSION_TOKEN, data.session_token);
        
        // IMPORTANTE: Salva user_id in AsyncStorage per compatibilità con il resto dell'app
        // Le altre pagine usano AsyncStorage.getItem('user_id')
        await AsyncStorage.setItem('user_id', data.user_id);
        await AsyncStorage.setItem('username', data.username);
        await AsyncStorage.setItem('user_nome', data.nome || data.username);
        await AsyncStorage.setItem('is_premium', data.is_premium ? 'true' : 'false');
        
        // Su web, salva anche in localStorage per sicurezza
        if (Platform.OS === 'web') {
          localStorage.setItem('user_id', data.user_id);
          localStorage.setItem('session_token', data.session_token);
        }
        
        console.log('[Google OAuth] User data saved. user_id:', data.user_id);
        
        // Registra per le push notifications (non-blocking)
        registerForPushNotifications(data.user_id).catch(err => {
          console.log('[Google OAuth] Push registration failed (non-blocking):', err);
        });
        
        // Migra profili temporanei se presenti
        const tempProfiles = await AsyncStorage.getItem('temp_profiles');
        if (tempProfiles) {
          try {
            const profiles = JSON.parse(tempProfiles);
            if (profiles && profiles.length > 0) {
              await axios.post(`${API_URL}/api/auth/migrate-profiles/${data.user_id}`, {
                profiles: profiles
              });
              await AsyncStorage.removeItem('temp_profiles');
              console.log('[Google OAuth] Migrated temp profiles');
            }
          } catch (migrateError) {
            console.log('[Google OAuth] Error migrating profiles:', migrateError);
          }
        }
        
        // Naviga alla home
        router.replace('/(tabs)');
      } else {
        Alert.alert('Errore', 'Autenticazione Google fallita');
      }
    } catch (error: any) {
      console.error('[Google OAuth] Process error:', error);
      Alert.alert('Errore', error.response?.data?.detail || 'Errore durante autenticazione Google');
    } finally {
      setGoogleLoading(false);
    }
  };

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
      // Salva dati sensibili in modo sicuro
      await secureSet(STORAGE_KEYS.USER_ID, response.data.user_id);
      await secureSet(STORAGE_KEYS.SESSION_TOKEN, response.data.session_token || '');
      
      // Dati non sensibili in AsyncStorage
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
              disabled={loading || googleLoading}
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

            {/* Divider */}
            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>oppure</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Google Login Button */}
            <TouchableOpacity
              style={[styles.googleButton, isDesktop && styles.googleButtonDesktop]}
              onPress={handleGoogleLogin}
              disabled={loading || googleLoading}
              activeOpacity={0.8}
            >
              {googleLoading ? (
                <ActivityIndicator color="#333" />
              ) : (
                <>
                  <Image 
                    source={{ uri: 'https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg' }}
                    style={styles.googleIcon}
                  />
                  <Text style={styles.googleButtonText}>Continua con Google</Text>
                </>
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
  // Google OAuth styles
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e0e0e0',
  },
  dividerText: {
    color: '#999',
    paddingHorizontal: 16,
    fontSize: 14,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    gap: 12,
  },
  googleButtonDesktop: {
    paddingVertical: 16,
    borderRadius: 14,
  },
  googleIcon: {
    width: 20,
    height: 20,
  },
  googleButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
});
