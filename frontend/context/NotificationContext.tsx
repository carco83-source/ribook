import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi } from '../src/utils/api';

interface NotificationContextType {
  unreadCount: number;
  refreshNotifications: () => Promise<void>;
  setUnreadCount: React.Dispatch<React.SetStateAction<number>>;
  decrementUnread: () => void;
}

const NotificationContext = createContext<NotificationContextType>({
  unreadCount: 0,
  refreshNotifications: async () => {},
  setUnreadCount: () => {},
  decrementUnread: () => {},
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

      // Usa authApi per includere il token di autenticazione
      const response = await authApi.get(`/api/notifications/${userId}`);
      const notifications = response.notifications || [];
      const unread = notifications.filter((n: any) => !n.read).length;
      setUnreadCount(unread);
    } catch (error: any) {
      // Non mostrare errore se è 401 (utente non loggato o sessione scaduta)
      if (error?.response?.status !== 401) {
        console.error('Error fetching notification count:', error);
      }
      setUnreadCount(0);
    }
  }, []);

  // Funzione per decrementare il contatore (chiamata quando si legge una notifica)
  const decrementUnread = useCallback(() => {
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  useEffect(() => {
    refreshNotifications();
    
    // Refresh every 30 seconds
    const interval = setInterval(refreshNotifications, 30000);
    return () => clearInterval(interval);
  }, [refreshNotifications]);

  return (
    <NotificationContext.Provider value={{ unreadCount, refreshNotifications, setUnreadCount, decrementUnread }}>
      {children}
    </NotificationContext.Provider>
  );
};

export default NotificationContext;
