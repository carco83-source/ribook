import React, { useState, useEffect } from 'react';
import { Platform, View, Image, StyleSheet, Text } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Componente Header personalizzato con titolo a sinistra e logo centrato
const CustomHeader = ({ title }: { title: string }) => {
  const isLongTitle = title.length > 8;
  return (
    <View style={headerStyles.container}>
      <View style={headerStyles.titleContainer}>
        <Text style={[headerStyles.title, isLongTitle && headerStyles.titleSmall]} numberOfLines={1}>{title}</Text>
      </View>
      <Image 
        source={require('../../assets/images/ribook-header-logo-transparent.png')}
        style={headerStyles.logo}
        resizeMode="contain"
      />
      <View style={headerStyles.spacer} />
    </View>
  );
};

const headerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  titleContainer: {
    width: 90,
  },
  title: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#000',
  },
  titleSmall: {
    fontSize: 14,
  },
  logo: {
    width: 120,
    height: 45,
    marginLeft: 20,
  },
  spacer: {
    width: 45,
  },
});

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  
  // Fetch unread notifications count
  useEffect(() => {
    const fetchUnreadCount = async () => {
      try {
        const userId = await AsyncStorage.getItem('user_id');
        if (!userId) return;
        
        const response = await axios.get(`${API_URL}/api/notifications/${userId}`);
        const notifications = response.data.notifications || [];
        const unread = notifications.filter((n: any) => !n.read).length;
        setUnreadNotifications(unread);
      } catch (error) {
        console.error('Error fetching notifications:', error);
      }
    };
    
    fetchUnreadCount();
    // Refresh every 15 seconds
    const interval = setInterval(fetchUnreadCount, 15000);
    return () => clearInterval(interval);
  }, []);
  
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
          headerTitle: () => <CustomHeader title="Home" />,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="school" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Cerca/Vendi',
          headerTitle: () => <CustomHeader title="Cerca/Vendi" />,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="pricetag" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="sell"
        options={{
          title: 'Carrello',
          headerTitle: () => <CustomHeader title="Carrello" />,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cart" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Messaggi',
          headerTitle: () => <CustomHeader title="Messaggi" />,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles" size={size} color={color} />
          ),
          tabBarBadge: unreadNotifications > 0 ? unreadNotifications : undefined,
          tabBarBadgeStyle: {
            backgroundColor: '#f44336',
            fontSize: 10,
            minWidth: 18,
            height: 18,
          },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profilo',
          headerTitle: () => <CustomHeader title="Profilo" />,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
