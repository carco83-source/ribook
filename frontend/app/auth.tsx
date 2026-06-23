import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

/**
 * Auth redirect handler per deep links (mobile) e redirect OAuth (web).
 * Questa route riceve il session_id dal redirect di Google OAuth.
 */
export default function AuthRedirectScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  useEffect(() => {
    handleOAuthRedirect();
  }, []);

  const handleOAuthRedirect = async () => {
    try {
      // Estrai session_id dai params o dalla URL
      let sessionId = params.session_id as string;
      
      // Se non trovato nei params, prova dalla URL (web)
      if (!sessionId && Platform.OS === 'web') {
        const hash = window.location.hash;
        const search = window.location.search;
        
        if (hash && hash.includes('session_id=')) {
          sessionId = hash.split('session_id=')[1]?.split('&')[0];
        } else if (search) {
          sessionId = new URLSearchParams(search).get('session_id') || '';
        }
        
        // Pulisci URL
        if (sessionId) {
          window.history.replaceState(null, '', window.location.pathname);
        }
      }

      if (!sessionId) {
        console.log('[Auth Redirect] No session_id found, redirecting to login');
        router.replace('/(auth)/login');
        return;
      }

      console.log('[Auth Redirect] Processing session_id:', sessionId.substring(0, 20) + '...');

      // Chiama backend per verificare e creare sessione
      const response = await axios.post(`${API_URL}/api/auth/google/callback`, {
        session_id: sessionId
      });

      const data = response.data;

      if (data.success) {
        // Salva token
        if (Platform.OS === 'web') {
          localStorage.setItem('session_token', data.session_token);
        } else {
          await SecureStore.setItemAsync('session_token', data.session_token);
        }

        // Salva dati utente
        await AsyncStorage.setItem('user_id', data.user_id);
        await AsyncStorage.setItem('username', data.username);
        await AsyncStorage.setItem('user_nome', data.nome || data.username);
        await AsyncStorage.setItem('is_premium', data.is_premium ? 'true' : 'false');

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
              console.log('[Auth Redirect] Migrated temp profiles');
            }
          } catch (migrateError) {
            console.log('[Auth Redirect] Error migrating profiles:', migrateError);
          }
        }

        // Naviga alla home
        router.replace('/(tabs)');
      } else {
        console.error('[Auth Redirect] Backend returned failure');
        router.replace('/(auth)/login');
      }
    } catch (error: any) {
      console.error('[Auth Redirect] Error:', error);
      router.replace('/(auth)/login');
    }
  };

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#1a472a" />
      <Text style={styles.text}>Autenticazione in corso...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  text: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
});
