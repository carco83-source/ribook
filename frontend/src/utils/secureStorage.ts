/**
 * Secure Storage Utility
 * Gestisce lo storage sicuro per token e dati sensibili
 * 
 * - Web: Usa localStorage (con fallback)
 * - Mobile: Usa expo-secure-store (crittografato)
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Chiavi per lo storage
export const STORAGE_KEYS = {
  USER_ID: 'user_id',
  SESSION_TOKEN: 'session_token',
  REFRESH_TOKEN: 'refresh_token',
} as const;

/**
 * Salva un valore in modo sicuro
 * @param key - Chiave di storage
 * @param value - Valore da salvare
 */
export const secureSet = async (key: string, value: string): Promise<void> => {
  try {
    if (Platform.OS === 'web') {
      // Web: usa localStorage
      localStorage.setItem(key, value);
    } else {
      // Mobile: usa SecureStore (crittografato)
      await SecureStore.setItemAsync(key, value);
    }
  } catch (error) {
    console.error(`Errore salvataggio sicuro per ${key}:`, error);
    // Fallback ad AsyncStorage se SecureStore fallisce
    try {
      await AsyncStorage.setItem(key, value);
    } catch (fallbackError) {
      console.error(`Anche fallback AsyncStorage fallito per ${key}:`, fallbackError);
      throw fallbackError;
    }
  }
};

/**
 * Recupera un valore dallo storage sicuro
 * @param key - Chiave di storage
 * @returns Valore recuperato o null
 */
export const secureGet = async (key: string): Promise<string | null> => {
  try {
    if (Platform.OS === 'web') {
      // Web: prova prima localStorage
      const localValue = localStorage.getItem(key);
      if (localValue) return localValue;
      
      // Fallback: prova anche AsyncStorage per compatibilità retroattiva
      try {
        const asyncValue = await AsyncStorage.getItem(key);
        if (asyncValue) {
          // Migra a localStorage
          localStorage.setItem(key, asyncValue);
          console.log(`[SecureStorage] Migrato ${key} da AsyncStorage a localStorage`);
          return asyncValue;
        }
      } catch (e) {
        // AsyncStorage non disponibile su web, ignora
      }
      
      return null;
    } else {
      // Prima prova SecureStore
      const secureValue = await SecureStore.getItemAsync(key);
      if (secureValue) return secureValue;
      
      // Se non trovato in SecureStore, prova AsyncStorage (migrazione)
      const asyncValue = await AsyncStorage.getItem(key);
      if (asyncValue) {
        // Migra il valore a SecureStore
        await SecureStore.setItemAsync(key, asyncValue);
        // Rimuovi da AsyncStorage
        await AsyncStorage.removeItem(key);
        console.log(`Migrato ${key} da AsyncStorage a SecureStore`);
        return asyncValue;
      }
      
      return null;
    }
  } catch (error) {
    console.error(`Errore lettura sicura per ${key}:`, error);
    // Fallback ad AsyncStorage
    try {
      return await AsyncStorage.getItem(key);
    } catch (fallbackError) {
      console.error(`Anche fallback AsyncStorage fallito per ${key}:`, fallbackError);
      return null;
    }
  }
};

/**
 * Rimuove un valore dallo storage sicuro
 * @param key - Chiave di storage
 */
export const secureRemove = async (key: string): Promise<void> => {
  try {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
    } else {
      await SecureStore.deleteItemAsync(key);
      // Rimuovi anche da AsyncStorage se presente
      await AsyncStorage.removeItem(key);
    }
  } catch (error) {
    console.error(`Errore rimozione sicura per ${key}:`, error);
  }
};

/**
 * Pulisce tutti i dati di autenticazione
 */
export const clearAuthData = async (): Promise<void> => {
  await secureRemove(STORAGE_KEYS.USER_ID);
  await secureRemove(STORAGE_KEYS.SESSION_TOKEN);
  await secureRemove(STORAGE_KEYS.REFRESH_TOKEN);
};

/**
 * Verifica se l'utente è autenticato
 */
export const isAuthenticated = async (): Promise<boolean> => {
  const userId = await secureGet(STORAGE_KEYS.USER_ID);
  const token = await secureGet(STORAGE_KEYS.SESSION_TOKEN);
  return !!(userId && token);
};

/**
 * Ottiene l'ID utente corrente
 */
export const getCurrentUserId = async (): Promise<string | null> => {
  return await secureGet(STORAGE_KEYS.USER_ID);
};

/**
 * Ottiene il token di sessione corrente
 */
export const getSessionToken = async (): Promise<string | null> => {
  return await secureGet(STORAGE_KEYS.SESSION_TOKEN);
};

export default {
  set: secureSet,
  get: secureGet,
  remove: secureRemove,
  clearAuth: clearAuthData,
  isAuthenticated,
  getCurrentUserId,
  getSessionToken,
  KEYS: STORAGE_KEYS,
};
