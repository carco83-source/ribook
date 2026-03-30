import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

export default function WelcomeScreen() {
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const userId = await AsyncStorage.getItem('user_id');
    if (userId) {
      router.replace('/(tabs)');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="book" size={80} color="#fff" />
        <Text style={styles.title}>RiLiBro</Text>
        <Text style={styles.subtitle}>Acquisto libro usato assistito</Text>
      </View>

      <View style={styles.features}>
        <View style={styles.featureItem}>
          <Ionicons name="search" size={32} color="#1a472a" />
          <Text style={styles.featureText}>Trova i libri che cerchi</Text>
        </View>
        <View style={styles.featureItem}>
          <Ionicons name="checkmark-done" size={32} color="#1a472a" />
          <Text style={styles.featureText}>Ti selezioniamo i libri da vendere e da acquistare</Text>
        </View>
        <View style={styles.featureItem}>
          <Ionicons name="calculator" size={32} color="#1a472a" />
          <Text style={styles.featureText}>Calcoliamo immediatamente il tuo risparmio</Text>
        </View>
      </View>

      <View style={styles.buttons}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/(auth)/register')}
        >
          <Text style={styles.primaryButtonText}>Registrati</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push('/(auth)/login')}
        >
          <Text style={styles.secondaryButtonText}>Hai già un account? Accedi</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.footer}>Risparmia. Scambia. Studia.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a472a',
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#a8d5ba',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
  },
  features: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 40,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  featureText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 16,
  },
  buttons: {
    gap: 16,
  },
  primaryButton: {
    backgroundColor: '#f4a460',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  secondaryButton: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#a8d5ba',
    fontSize: 16,
  },
  footer: {
    color: '#a8d5ba',
    textAlign: 'center',
    marginTop: 'auto',
    marginBottom: 40,
    fontSize: 14,
  },
});
