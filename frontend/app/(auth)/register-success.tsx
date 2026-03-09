import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function RegisterSuccessScreen() {
  const router = useRouter();
  const { username } = useLocalSearchParams<{ username: string }>();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Success Icon */}
        <View style={styles.iconContainer}>
          <Ionicons name="checkmark-circle" size={80} color="#4CAF50" />
        </View>

        {/* Title */}
        <Text style={styles.title}>Registrazione Completata!</Text>
        
        {/* Subtitle */}
        <Text style={styles.subtitle}>
          Il tuo account è stato creato con successo
        </Text>

        {/* Username Card */}
        <View style={styles.usernameCard}>
          <View style={styles.usernameHeader}>
            <Ionicons name="person-circle-outline" size={24} color="#1a472a" />
            <Text style={styles.usernameLabel}>Il tuo username anonimo:</Text>
          </View>
          <Text style={styles.username}>{username || 'N/A'}</Text>
          <Text style={styles.usernameNote}>
            Questo username sarà visibile agli altri utenti per proteggere la tua privacy.
          </Text>
        </View>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={20} color="#1976D2" />
          <Text style={styles.infoText}>
            Ricorda questo username! Lo userai per le comunicazioni con altri utenti sull'app.
          </Text>
        </View>

        {/* Login Button */}
        <TouchableOpacity
          style={styles.loginButton}
          onPress={() => router.replace('/(auth)/login')}
        >
          <Text style={styles.loginButtonText}>Vai al Login</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a472a',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
  },
  usernameCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#e8f5e9',
  },
  usernameHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  usernameLabel: {
    fontSize: 14,
    color: '#666',
  },
  username: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1a472a',
    marginBottom: 12,
    letterSpacing: 1,
  },
  usernameNote: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
    lineHeight: 18,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#e3f2fd',
    padding: 16,
    borderRadius: 12,
    gap: 12,
    marginBottom: 32,
    width: '100%',
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#1976D2',
    lineHeight: 20,
  },
  loginButton: {
    backgroundColor: '#1a472a',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    justifyContent: 'center',
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
