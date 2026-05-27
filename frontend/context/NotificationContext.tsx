import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface NotificationContextType {
  unreadCount: number;
  refreshNotifications: () => Promise<void>;
  setUnreadCount: (count: number) => void;
}

const NotificationContext = createContext<NotificationContextType>({
  unreadCount: 0,
  refreshNotifications: async () => {},
  setUnreadCount: () => {},
});

export const useNotifications = () => useContext(NotificationContext);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshNotifications = useCallback(async () => {
    try {
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId) {
        setUnreadCount(0);
        return;
      }

      const response = await axios.get(`${API_URL}/api/notifications/${userId}`);
      const notifications = response.data.notifications || [];
      const unread = notifications.filter((n: any) => !n.read).length;
      setUnreadCount(unread);
    } catch (error) {
      console.error('Error fetching notification count:', error);
    }
  }, []);

  useEffect(() => {
    refreshNotifications();
    
    // Refresh every 30 seconds
    const interval = setInterval(refreshNotifications, 30000);
    return () => clearInterval(interval);
  }, [refreshNotifications]);

  return (
    <NotificationContext.Provider value={{ unreadCount, refreshNotifications, setUnreadCount }}>
      {children}
    </NotificationContext.Provider>
  );
};

export default NotificationContext;
