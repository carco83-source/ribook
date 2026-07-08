import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.apiUrl || process.env.EXPO_PUBLIC_BACKEND_URL || '';

/**
 * Registra il device per le push notifications.
 * Deve essere chiamato dopo il login e ad ogni apertura dell'app.
 * 
 * @param userId - L'ID dell'utente autenticato
 * @returns true se la registrazione è andata a buon fine, false altrimenti
 */
export async function registerForPushNotifications(userId: string): Promise<boolean> {
  // Skip on web - push notifications work only on native
  if (Platform.OS === 'web') {
    console.log('[Push] Skipping registration on web');
    return false;
  }

  // Check if it's a physical device
  if (!Device.isDevice) {
    console.log('[Push] Must use physical device for Push Notifications');
    return false;
  }

  try {
    // 1. Request permission FIRST
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[Push] Permission not granted');
      return false;
    }

    // 2. Get the native device token (NOT Expo push token)
    const tokenResponse = await Notifications.getDevicePushTokenAsync();
    const deviceToken = tokenResponse.data;
    
    console.log('[Push] Device token obtained:', deviceToken.substring(0, 20) + '...');

    // 3. Register with backend
    const response = await fetch(`${API_URL}/api/register-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userId,
        platform: Platform.OS, // "android" or "ios"
        device_token: deviceToken,
      }),
    });

    if (response.ok) {
      console.log('[Push] Successfully registered for push notifications');
      return true;
    } else {
      const error = await response.text();
      console.error('[Push] Registration failed:', error);
      return false;
    }
  } catch (error) {
    console.error('[Push] Error registering for push notifications:', error);
    return false;
  }
}

/**
 * Verifica se le push notifications sono abilitate per questo dispositivo.
 */
export async function checkPushNotificationStatus(): Promise<{
  isEnabled: boolean;
  isDevice: boolean;
  permissionStatus: string;
}> {
  if (Platform.OS === 'web') {
    return {
      isEnabled: false,
      isDevice: false,
      permissionStatus: 'web_unsupported',
    };
  }

  const isDevice = Device.isDevice;
  const { status } = await Notifications.getPermissionsAsync();

  return {
    isEnabled: isDevice && status === 'granted',
    isDevice,
    permissionStatus: status,
  };
}
