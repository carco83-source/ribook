import React from 'react';
import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  
  // Calcola l'altezza della tab bar in base alla piattaforma
  // Per Android aggiungiamo spazio extra per la navigation bar di sistema
  const getTabBarHeight = () => {
    if (Platform.OS === 'ios') return 88;
    if (Platform.OS === 'android') {
      // Altezza base + inset bottom per la navigation bar di sistema
      // Minimo 80px per garantire spazio sufficiente
      return Math.max(80, 60 + insets.bottom);
    }
    return 70; // Web
  };
  
  const getTabBarPaddingBottom = () => {
    if (Platform.OS === 'ios') return 24;
    if (Platform.OS === 'android') {
      // Padding extra per Android - almeno 20px o l'inset di sistema
      return Math.max(20, insets.bottom + 8);
    }
    return 12; // Web
  };

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#1a472a',
        tabBarInactiveTintColor: '#888',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopWidth: 1,
          borderTopColor: '#e0e0e0',
          paddingBottom: getTabBarPaddingBottom(),
          paddingTop: 8,
          height: getTabBarHeight(),
          elevation: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.15,
          shadowRadius: 6,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarIconStyle: {
          marginTop: 4,
        },
        headerStyle: {
          backgroundColor: '#f5f5f5',
        },
        headerTintColor: '#333',
        headerTitleStyle: {
          fontWeight: 'bold',
          color: '#000',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="school" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Cerca',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="sell"
        options={{
          title: 'Carrello',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cart" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Scambi',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="swap-horizontal" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Messaggi',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profilo',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
