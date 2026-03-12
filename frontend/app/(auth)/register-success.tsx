import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface BookSummary {
  vendibili: number;
  acquistabili: number;
  nuovi: number;
  risparmio: number;
}

export default function RegisterSuccessScreen() {
  const router = useRouter();
  const { username, userId, scuola, classe, tipoScuola } = useLocalSearchParams<{ 
    username: string;
    userId: string;
    scuola: string;
    classe: string;
    tipoScuola: string;
  }>();

  const [loading, setLoading] = useState(true);
  const [bookSummary, setBookSummary] = useState<BookSummary | null>(null);

  useEffect(() => {
    loadBookSummary();
  }, [userId]);

  const loadBookSummary = async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      // Get compatibility data for the user
      const response = await axios.get(`${API_URL}/api/radar/${userId}/class-compatibility`);
      const data = response.data;
      
      // Calculate summary
      const vendibili = data.vendibili?.totale || 0;
      const acquistabili = data.comprare_usato?.totale || 0;
      const nuovi = data.comprare_nuovo?.totale || 0;
      
      // Calculate potential savings (50% of usable books)
      const prezzoUsato = data.comprare_usato?.prezzo_totale || 0;
      const prezzoNuovo = data.comprare_nuovo?.prezzo_totale || 0;
      const risparmio = Math.round(prezzoUsato * 0.5);

      setBookSummary({
        vendibili,
        acquistabili,
        nuovi,
        risparmio
      });
    } catch (error) {
      console.error('Error loading book summary:', error);
      // Set default values if API fails
      setBookSummary({
        vendibili: 0,
        acquistabili: 0,
        nuovi: 0,
        risparmio: 0
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          {/* Success Icon */}
          <View style={styles.iconContainer}>
            <Ionicons name="checkmark-circle" size={70} color="#4CAF50" />
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
              <Ionicons name="person-circle-outline" size={22} color="#1a472a" />
              <Text style={styles.usernameLabel}>Il tuo username:</Text>
            </View>
            <Text style={styles.username}>{username || 'N/A'}</Text>
          </View>

          {/* School Info */}
          {scuola && classe && (
            <View style={styles.schoolInfo}>
              <Ionicons name="school-outline" size={18} color="#666" />
              <Text style={styles.schoolText}>{scuola} - Classe {classe}</Text>
            </View>
          )}

          {/* Book Summary Card */}
          <View style={styles.bookSummaryCard}>
            <Text style={styles.bookSummaryTitle}>
              📚 I tuoi libri
            </Text>
            <Text style={styles.bookSummarySubtitle}>
              Ecco cosa puoi fare subito
            </Text>

            {loading ? (
              <ActivityIndicator size="large" color="#1a472a" style={{ marginVertical: 20 }} />
            ) : bookSummary ? (
              <View style={styles.bookStats}>
                {/* Libri da Vendere */}
                <View style={styles.bookStatItem}>
                  <View style={[styles.bookStatIcon, { backgroundColor: '#e3f2fd' }]}>
                    <Ionicons name="pricetag" size={24} color="#2196F3" />
                  </View>
                  <View style={styles.bookStatInfo}>
                    <Text style={styles.bookStatNumber}>{bookSummary.vendibili}</Text>
                    <Text style={styles.bookStatLabel}>Libri da vendere</Text>
                    <Text style={styles.bookStatHint}>alla classe sotto</Text>
                  </View>
                </View>

                {/* Libri da Acquistare Usato */}
                <View style={styles.bookStatItem}>
                  <View style={[styles.bookStatIcon, { backgroundColor: '#e8f5e9' }]}>
                    <Ionicons name="cart" size={24} color="#4CAF50" />
                  </View>
                  <View style={styles.bookStatInfo}>
                    <Text style={styles.bookStatNumber}>{bookSummary.acquistabili}</Text>
                    <Text style={styles.bookStatLabel}>Libri usati disponibili</Text>
                    <Text style={styles.bookStatHint}>dalla classe sopra</Text>
                  </View>
                </View>

                {/* Libri da Comprare Nuovi */}
                <View style={styles.bookStatItem}>
                  <View style={[styles.bookStatIcon, { backgroundColor: '#fff3e0' }]}>
                    <Ionicons name="book" size={24} color="#FF9800" />
                  </View>
                  <View style={styles.bookStatInfo}>
                    <Text style={styles.bookStatNumber}>{bookSummary.nuovi}</Text>
                    <Text style={styles.bookStatLabel}>Libri da comprare nuovi</Text>
                    <Text style={styles.bookStatHint}>edizione cambiata</Text>
                  </View>
                </View>

                {/* Risparmio Stimato */}
                {bookSummary.risparmio > 0 && (
                  <View style={styles.savingsBox}>
                    <Ionicons name="wallet" size={20} color="#1a472a" />
                    <Text style={styles.savingsText}>
                      Risparmio stimato: <Text style={styles.savingsAmount}>€{bookSummary.risparmio}</Text>
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              <Text style={styles.noDataText}>
                I dati sui libri saranno disponibili dopo il login
              </Text>
            )}
          </View>

          {/* Login Button */}
          <TouchableOpacity
            style={styles.loginButton}
            onPress={() => router.replace('/(auth)/login')}
          >
            <Text style={styles.loginButtonText}>Accedi ora</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
  },
  iconContainer: {
    marginTop: 20,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a472a',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  usernameCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e8f5e9',
    marginBottom: 12,
  },
  usernameHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  usernameLabel: {
    fontSize: 13,
    color: '#666',
  },
  username: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#1a472a',
    letterSpacing: 1,
  },
  schoolInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  schoolText: {
    fontSize: 13,
    color: '#666',
  },
  bookSummaryCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  bookSummaryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a472a',
    marginBottom: 4,
  },
  bookSummarySubtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 16,
  },
  bookStats: {
    gap: 12,
  },
  bookStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  bookStatIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bookStatInfo: {
    flex: 1,
  },
  bookStatNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  bookStatLabel: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  bookStatHint: {
    fontSize: 11,
    color: '#999',
  },
  savingsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#e8f5e9',
    padding: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  savingsText: {
    fontSize: 14,
    color: '#1a472a',
  },
  savingsAmount: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  noDataText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 20,
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
