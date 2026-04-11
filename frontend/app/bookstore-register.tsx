import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function BookstoreRegisterScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [nomeAttivita, setNomeAttivita] = useState('');
  const [email, setEmail] = useState('');
  const [partitaIva, setPartitaIva] = useState('');
  const [indirizzo, setIndirizzo] = useState('');
  const [citta, setCitta] = useState('');
  const [telefono, setTelefono] = useState('');

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/bookstore-portal');
    }
  };

  const validateForm = () => {
    if (!nomeAttivita.trim()) {
      Alert.alert('Errore', 'Inserisci il nome dell\'attività');
      return false;
    }
    if (!email.trim() || !email.includes('@')) {
      Alert.alert('Errore', 'Inserisci un\'email valida');
      return false;
    }
    if (!partitaIva.trim() || partitaIva.length < 11) {
      Alert.alert('Errore', 'Inserisci una Partita IVA valida (11 cifre)');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      await axios.post(`${API_URL}/api/bookstore/registration-request`, {
        nome_attivita: nomeAttivita.trim(),
        email: email.trim().toLowerCase(),
        partita_iva: partitaIva.trim(),
        indirizzo: indirizzo.trim(),
        citta: citta.trim(),
        telefono: telefono.trim(),
      });

      setSubmitted(true);
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Errore durante l\'invio';
      Alert.alert('Errore', message);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{
            title: 'Richiesta inviata',
            headerStyle: { backgroundColor: '#1a472a' },
            headerTintColor: '#fff',
            headerLeft: () => (
              <TouchableOpacity onPress={handleGoBack} style={{ paddingHorizontal: 16 }}>
                <Ionicons name="arrow-back" size={24} color="#fff" />
              </TouchableOpacity>
            ),
          }}
        />
        
        <View style={styles.successContainer}>
          <Ionicons name="checkmark-circle" size={80} color="#4CAF50" />
          <Text style={styles.successTitle}>Richiesta inviata!</Text>
          <Text style={styles.successText}>
            La tua richiesta di registrazione è stata inviata con successo.
          </Text>
          <Text style={styles.successText}>
            Riceverai le credenziali di accesso via email dopo l'approvazione dell'amministratore.
          </Text>
          
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.replace('/bookstore-portal')}
          >
            <Ionicons name="arrow-back" size={20} color="#fff" />
            <Text style={styles.backButtonText}>Torna al portale</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Stack.Screen
        options={{
          title: 'Richiedi accesso',
          headerStyle: { backgroundColor: '#1a472a' },
          headerTintColor: '#fff',
          headerLeft: () => (
            <TouchableOpacity onPress={handleGoBack} style={{ paddingHorizontal: 16 }}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Ionicons name="storefront" size={48} color="#1a472a" />
          <Text style={styles.headerTitle}>Registra la tua cartolibreria</Text>
          <Text style={styles.headerSubtitle}>
            Compila il modulo per richiedere l'accesso al portale cartolibrerie di RiLiBro
          </Text>
        </View>

        <View style={styles.form}>
          {/* Nome Attività */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nome Attività *</Text>
            <TextInput
              style={styles.input}
              placeholder="Es. Cartolibreria Rossi"
              value={nomeAttivita}
              onChangeText={setNomeAttivita}
            />
          </View>

          {/* Email */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email *</Text>
            <TextInput
              style={styles.input}
              placeholder="email@esempio.it"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          {/* Partita IVA */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Partita IVA *</Text>
            <TextInput
              style={styles.input}
              placeholder="12345678901"
              value={partitaIva}
              onChangeText={(text) => setPartitaIva(text.replace(/\D/g, ''))}
              keyboardType="numeric"
              maxLength={11}
            />
          </View>

          {/* Indirizzo */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Indirizzo</Text>
            <TextInput
              style={styles.input}
              placeholder="Via Roma, 1"
              value={indirizzo}
              onChangeText={setIndirizzo}
            />
          </View>

          {/* Città */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Città</Text>
            <TextInput
              style={styles.input}
              placeholder="Catanzaro"
              value={citta}
              onChangeText={setCitta}
            />
          </View>

          {/* Telefono */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Telefono</Text>
            <TextInput
              style={styles.input}
              placeholder="0961 123456"
              value={telefono}
              onChangeText={setTelefono}
              keyboardType="phone-pad"
            />
          </View>

          <Text style={styles.requiredNote}>* Campi obbligatori</Text>

          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="send" size={20} color="#fff" />
                <Text style={styles.submitButtonText}>Invia richiesta</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1a472a',
    marginTop: 12,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
  },
  form: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
  },
  requiredNote: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 8,
    marginBottom: 20,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a472a',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#ccc',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a472a',
    marginTop: 16,
  },
  successText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 20,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a472a',
    padding: 14,
    borderRadius: 10,
    marginTop: 32,
    gap: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
