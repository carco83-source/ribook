import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface TabBarProps {
  currentTab?: string;
}

export default function GlobalTabBar({ currentTab }: TabBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [cartItemsCount, setCartItemsCount] = useState(0);

  // Determina la tab attiva basandosi sul pathname o currentTab
  const getActiveTab = () => {
    if (currentTab) return currentTab;
    if (pathname.includes('/search') || pathname.includes('/listing')) return 'search';
    if (pathname.includes('/sell') || pathname.includes('/cart')) return 'sell';
    if (pathname.includes('/chat') || pathname.includes('/notification')) return 'chats';
    if (pathname.includes('/profile') || pathname.includes('/student') || pathname.includes('/radar') || pathname.includes('/order')) return 'profile';
    return 'index';
  };

  const activeTab = getActiveTab();

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const userId = await AsyncStorage.getItem('user_id');
        if (!userId) return;

        const notifResponse = await axios.get(`${API_URL}/api/notifications/${userId}`);
        const notifications = notifResponse.data.notifications || [];
        const unread = notifications.filter((n: any) => !n.read).length;
        setUnreadNotifications(unread);

        const ordersResponse = await axios.get(`${API_URL}/api/user-orders/${userId}`);
        const orders = ordersResponse.data.orders || [];
        const cartOrders = orders.filter((o: any) =>
          (o.status === 'in_attesa_pagamento' || o.status === 'pending_payment') &&
          o.buyer_id === userId
        );
        setCartItemsCount(cartOrders.length);
      } catch (error) {
        console.error('Error fetching counts:', error);
      }
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, 15000);
    return () => clearInterval(interval);
  }, []);

  const tabs = [
    { name: 'index', label: 'Home', icon: 'school', route: '/(tabs)' },
    { name: 'search', label: 'Cerca/Vendi', icon: 'pricetag', route: '/(tabs)/search' },
    { name: 'sell', label: 'Carrello', icon: 'cart', route: '/(tabs)/sell', badge: cartItemsCount },
    { name: 'chats', label: 'Messaggi', icon: 'chatbubbles', route: '/(tabs)/chats', badge: unreadNotifications, badgeColor: '#f44336' },
    { name: 'profile', label: 'Profilo', icon: 'person', route: '/(tabs)/profile' },
  ];

  const getTabBarPaddingBottom = () => {
    if (Platform.OS === 'ios') return 24;
    if (Platform.OS === 'android') return Math.max(20, insets.bottom + 8);
    return 12;
  };

  const getTabBarHeight = () => {
    if (Platform.OS === 'ios') return 88;
    if (Platform.OS === 'android') return Math.max(80, 60 + insets.bottom);
    return 70;
  };

  return (
    <View style={[
      styles.container,
      {
        paddingBottom: getTabBarPaddingBottom(),
        height: getTabBarHeight(),
      }
    ]}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.name;
        return (
          <TouchableOpacity
            key={tab.name}
            style={styles.tab}
            onPress={() => router.push(tab.route as any)}
            activeOpacity={0.7}
          >
            <View style={styles.iconContainer}>
              <Ionicons
                name={tab.icon as any}
                size={24}
                color={isActive ? '#1a472a' : '#888'}
              />
              {tab.badge && tab.badge > 0 && (
                <View style={[
                  styles.badge,
                  { backgroundColor: tab.badgeColor || '#1a472a' }
                ]}>
                  <Text style={styles.badgeText}>
                    {tab.badge > 9 ? '9+' : tab.badge}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[
              styles.label,
              isActive && styles.labelActive
            ]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingTop: 8,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: '#888',
    marginTop: 4,
  },
  labelActive: {
    color: '#1a472a',
  },
});
