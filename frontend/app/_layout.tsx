import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { NotificationProvider } from '../context/NotificationContext';
import * as Notifications from 'expo-notifications';
import * as Linking from 'expo-linking';

// ============== PUSH NOTIFICATIONS SETUP ==============
// 1. Foreground handler - MODULE SCOPE, before any component
// Controlla come vengono mostrate le notifiche quando l'app è in foreground
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// 2. Android channel - MODULE SCOPE, before any component
// Necessario per Android per mostrare le notifiche
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#1a472a',
  });
}

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    // Skip notification listeners on web
    if (Platform.OS === 'web') return;

    // 3. Warm tap - user taps notification while app is open
    const tapSub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data || {};
        const url = data.deeplink || data.action_url;
        if (!url) return;
        
        // Navigate to the URL
        if (typeof url === 'string') {
          if (url.startsWith('http')) {
            Linking.openURL(url);
          } else {
            router.push(url as any);
          }
        }
      }
    );

    // 4. Cold-start tap - user tapped notification while app was killed
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = response.notification.request.content.data || {};
      const url = data.deeplink || data.action_url;
      if (url && typeof url === 'string') {
        if (url.startsWith('http')) {
          Linking.openURL(url);
        } else {
          router.push(url as any);
        }
      }
    });

    // Cleanup
    return () => {
      tapSub.remove();
    };
  }, [router]);

  return (
    <NotificationProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: '#1a472a',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
          contentStyle: {
            backgroundColor: '#f5f5f5',
          },
          // Disabilita animazione per mostrare tabs sotto
          animation: 'none',
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/login" options={{ title: 'Accedi' }} />
        <Stack.Screen name="(auth)/register" options={{ title: 'Registrati' }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="listing/create" options={{ title: 'Vendi un Libro' }} />
        <Stack.Screen name="listing/[id]" options={{ title: 'Dettaglio Libro' }} />
        <Stack.Screen name="chat/[listingId]" options={{ title: 'Chat' }} />
        <Stack.Screen name="chat/[conversationId]" options={{ title: 'Chat' }} />
        <Stack.Screen name="profile/my-listings" options={{ title: 'I Miei Annunci' }} />
        <Stack.Screen name="profile/my-exchanges" options={{ title: 'I Miei Scambi' }} />
        <Stack.Screen name="profile/documents" options={{ title: 'Documenti', headerShown: false }} />
        <Stack.Screen name="edit-listing/[id]" options={{ title: 'Modifica Annuncio' }} />
        <Stack.Screen name="my-listing/[id]" options={{ title: 'Modifica Annuncio' }} />
        <Stack.Screen name="student/[id]" options={{ title: 'Dettagli Alunno' }} />
        <Stack.Screen name="radar/[childId]" options={{ title: 'Radar Libri' }} />
        <Stack.Screen name="profiles/manage" options={{ title: 'Gestisci Profili' }} />
        <Stack.Screen name="orders" options={{ title: 'I Miei Ordini' }} />
        <Stack.Screen name="cart" options={{ title: 'Carrello' }} />
        <Stack.Screen name="sell-form" options={{ title: 'Vendi Libro' }} />
        <Stack.Screen name="bookstore-portal" options={{ title: 'Portale Cartolibreria', headerShown: false }} />
        <Stack.Screen name="admin" options={{ title: 'Admin', headerShown: false }} />
      </Stack>
    </NotificationProvider>
  );
}
