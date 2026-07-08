/**
 * Secure Storage Utility
 * Gestisce lo storage sicuro per token e dati sensibili
 * 
 * NOTA: Per massima compatibilità con Expo Go, usiamo AsyncStorage
 * con fallback a localStorage su web.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Chiavi per lo storage
export const STORAGE_KEYS = {
  USER_ID: 'user_id',
  SESSION_TOKEN: 'session_token',
  REFRESH_TOKEN: 'refresh_token',
} as const;

/**
 * Salva un valore in modo sicuro
 */
export const secureSet = async (key: string, value: string): Promise<void> => {
  try {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
    } else {
      await AsyncStorage.setItem(key, value);
    }
    console.log(`[SecureStorage] Saved ${key}`);
  } catch (error) {
    console.error(`[SecureStorage] Error saving ${key}:`, error);
    throw error;
  }
};

/**
 * Recupera un valore dallo storage
 */
export const secureGet = async (key: string): Promise<string | null> => {
  try {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    } else {
      return await AsyncStorage.getItem(key);
    }
  } catch (error) {
    console.error(`[SecureStorage] Error getting ${key}:`, error);
    return null;
  }
};

/**
 * Rimuove un valore dallo storage
 */
export const secureRemove = async (key: string): Promise<void> => {
  try {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
    } else {
      await AsyncStorage.removeItem(key);
    }
  } catch (error) {
    console.error(`[SecureStorage] Error removing ${key}:`, error);
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
