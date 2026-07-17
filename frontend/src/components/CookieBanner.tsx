import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  useWindowDimensions,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

const COOKIE_CONSENT_KEY = 'ribook_cookie_consent';

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  useEffect(() => {
    checkCookieConsent();
  }, []);

  const checkCookieConsent = async () => {
    try {
      const consent = await AsyncStorage.getItem(COOKIE_CONSENT_KEY);
      if (!consent) {
        // Mostra il banner solo se non c'è già un consenso salvato
        setVisible(true);
      }
    } catch (error) {
      console.log('Error checking cookie consent:', error);
    }
  };

  const handleAccept = async () => {
    try {
      await AsyncStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify({
        accepted: true,
        timestamp: new Date().toISOString(),
      }));
      setVisible(false);
    } catch (error) {
      console.log('Error saving cookie consent:', error);
      setVisible(false);
    }
  };

  const handleDecline = async () => {
    try {
      await AsyncStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify({
        accepted: false,
        timestamp: new Date().toISOString(),
      }));
      setVisible(false);
    } catch (error) {
      console.log('Error saving cookie consent:', error);
      setVisible(false);
    }
  };

  const handleLearnMore = () => {
    router.push('/cookie-policy');
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={[styles.banner, isDesktop && styles.bannerDesktop]}>
          <View style={styles.content}>
            <Text style={styles.title}>Utilizziamo i cookie</Text>
            <Text style={styles.description}>
              Questo sito utilizza cookie tecnici necessari al funzionamento e cookie analitici per migliorare la tua esperienza.
              Puoi accettare tutti i cookie o solo quelli necessari.
            </Text>
            
            <TouchableOpacity onPress={handleLearnMore}>
              <Text style={styles.learnMore}>Scopri di più nella Cookie Policy</Text>
            </TouchableOpacity>
          </View>
          
          <View style={[styles.buttons, isDesktop && styles.buttonsDesktop]}>
            <TouchableOpacity
              style={[styles.button, styles.declineButton]}
              onPress={handleDecline}
            >
              <Text style={styles.declineButtonText}>Solo necessari</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.button, styles.acceptButton]}
              onPress={handleAccept}
            >
              <Text style={styles.acceptButtonText}>Accetta tutti</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  banner: {
    backgroundColor: '#fff',
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 10,
  },
  bannerDesktop: {
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
    marginBottom: 20,
    borderRadius: 16,
  },
  content: {
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a472a',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 8,
  },
  learnMore: {
    fontSize: 14,
    color: '#1a472a',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  buttons: {
    flexDirection: 'column',
    gap: 10,
  },
  buttonsDesktop: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineButton: {
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  declineButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
  acceptButton: {
    backgroundColor: '#1a472a',
  },
  acceptButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
