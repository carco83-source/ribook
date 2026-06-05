import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { NotificationProvider } from '../context/NotificationContext';

export default function RootLayout() {
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
