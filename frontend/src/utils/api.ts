/**
 * API Utility con autenticazione
 * Tutte le chiamate API a endpoint protetti devono usare queste funzioni
 */
import axios, { AxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

/**
 * Recupera il token di sessione dallo storage
 */
export const getSessionToken = async (): Promise<string | null> => {
  try {
    if (Platform.OS === 'web') {
      return localStorage.getItem('session_token');
    } else {
      return await SecureStore.getItemAsync('session_token');
    }
  } catch (error) {
    console.error('Errore recupero token:', error);
    return null;
  }
};

/**
 * Crea gli headers di autenticazione
 */
export const getAuthHeaders = async (): Promise<Record<string, string>> => {
  const token = await getSessionToken();
  if (token) {
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }
  return {
    'Content-Type': 'application/json',
  };
};

/**
 * Client Axios con autenticazione automatica
 */
export const authApi = {
  /**
   * GET request autenticata
   */
  get: async <T = any>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    const headers = await getAuthHeaders();
    const response = await axios.get<T>(`${API_URL}${url}`, {
      ...config,
      headers: { ...headers, ...config?.headers },
    });
    return response.data;
  },

  /**
   * POST request autenticata
   */
  post: async <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> => {
    const headers = await getAuthHeaders();
    const response = await axios.post<T>(`${API_URL}${url}`, data, {
      ...config,
      headers: { ...headers, ...config?.headers },
    });
    return response.data;
  },

  /**
   * PUT request autenticata
   */
  put: async <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> => {
    const headers = await getAuthHeaders();
    const response = await axios.put<T>(`${API_URL}${url}`, data, {
      ...config,
      headers: { ...headers, ...config?.headers },
    });
    return response.data;
  },

  /**
   * DELETE request autenticata
   */
  delete: async <T = any>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    const headers = await getAuthHeaders();
    const response = await axios.delete<T>(`${API_URL}${url}`, {
      ...config,
      headers: { ...headers, ...config?.headers },
    });
    return response.data;
  },
};

export default authApi;
