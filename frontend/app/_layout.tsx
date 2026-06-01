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
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/login" options={{ title: 'Accedi' }} />
        <Stack.Screen name="(auth)/register" options={{ title: 'Registrati' }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="listing/create" options={{ title: 'Vendi un Libro' }} />
        <Stack.Screen name="listing/[id]" options={{ title: 'Dettaglio Libro' }} />
        <Stack.Screen name="chat/[listingId]" options={{ title: 'Chat' }} />
        {/* Pagine profilo come modal per mantenere tabs visibili */}
        <Stack.Screen 
          name="profile/my-listings" 
          options={{ 
            title: 'I Miei Annunci',
            presentation: 'modal',
            headerShown: false,
          }} 
        />
        <Stack.Screen 
          name="profile/my-exchanges" 
          options={{ 
            title: 'I Miei Scambi',
            presentation: 'modal',
            headerShown: false,
          }} 
        />
        <Stack.Screen 
          name="edit-listing/[id]" 
          options={{ 
            title: 'Modifica Annuncio',
            presentation: 'modal',
            headerShown: false,
          }} 
        />
      </Stack>
    </NotificationProvider>
  );
}
