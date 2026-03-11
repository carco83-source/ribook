import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface RadarData {
  total_matches: number;
  same_section: number;
  same_class: number;
  same_school: number;
  others: number;
  books_searching: number;
}

interface Match {
  listing: any;
  compatibility_score: number;
  same_school: boolean;
  same_class: boolean;
  same_section: boolean;
}

interface ClassCompatibility {
  classe: number;
  relationship: string;
  relationship_desc: string;
  sellers_count: number;
  books_count: number;
  usable_for_you: number;
  compatibility_percentage: number;
  total_value: number;
  usato_medio_percentage: number;
  top_sellers: { username: string; sezione: string; books_count: number }[];
  sample_books: {
    listing_id: string;
    titolo: string;
    prezzo_vendita: number;
    condizione: string;
    is_volume_unico: boolean;
    is_usable_for_you: boolean;
    seller_username: string;
  }[];
}

interface ClassCompatibilityData {
  user_classe: number;
  user_scuola: string;
  classes: ClassCompatibility[];
  summary: {
    total_sellers: number;
    total_books_available: number;
    total_usable_for_you: number;
    overall_compatibility: number;
    message: string;
  };
}

export default function RadarScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [radarData, setRadarData] = useState<RadarData | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [classCompatibility, setClassCompatibility] = useState<ClassCompatibilityData | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      const storedPremium = await AsyncStorage.getItem('is_premium');
      
      if (!storedUserId) {
        router.replace('/');
        return;
      }
      
      setUserId(storedUserId);
      setIsPremium(storedPremium === 'true');

      // Get radar data
      const radarResponse = await axios.get(`${API_URL}/api/radar/${storedUserId}`);
      setRadarData(radarResponse.data);

      // Get matches
      const matchesResponse = await axios.get(`${API_URL}/api/matches/${storedUserId}`);
      setMatches(matchesResponse.data.matches || []);

      // Get class compatibility data
      const classCompatResponse = await axios.get(`${API_URL}/api/radar/${storedUserId}/class-compatibility`);
      setClassCompatibility(classCompatResponse.data);
    } catch (error) {
      console.error('Error loading radar data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleMatchPress = (match: Match) => {
    if (!isPremium) {
      Alert.alert(
        'Account Premium richiesto',
        'Per procedere con l\'acquisto, devi avere un account Premium (€5,99/anno) oppure pagherai una commissione del 15% sulla transazione.',
        [
          { text: 'Annulla', style: 'cancel' },
          {
            text: 'Vai al Profilo',
            onPress: () => router.push('/(tabs)/profile'),
          },
          {
            text: 'Continua con 15%',
            onPress: () => router.push(`/listing/${match.listing.id}`),
          },
        ]
      );
    } else {
      router.push(`/listing/${match.listing.id}`);
    }
  };

  const getCompatibilityLabel = (score: number) => {
    if (score >= 100) return { text: 'Stessa Sezione', color: '#4CAF50' };
    if (score >= 80) return { text: 'Stessa Classe', color: '#8BC34A' };
    if (score >= 60) return { text: 'Stessa Scuola', color: '#FFC107' };
    return { text: 'Altra Scuola', color: '#FF9800' };
  };

  const getConditionLabel = (condition: string) => {
    const labels: { [key: string]: string } = {
      'nuovo': 'Nuovo',
      'come_nuovo': 'Come Nuovo',
      'ottime_condizioni': 'Ottime',
      'buono': 'Buono',
      'scarso': 'Scarso',
    };
    return labels[condition] || condition;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a472a" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header with Notifications */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Ionicons name="radio" size={28} color="#1a472a" />
          <Text style={styles.headerTitle}>ScambiaLibri</Text>
        </View>
        <TouchableOpacity 
          style={styles.notificationButton}
          onPress={() => router.push('/notifications')}
        >
          <Ionicons name="notifications" size={24} color="#1a472a" />
          {radarData && radarData.total_matches > 0 && (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>
                {radarData.total_matches > 9 ? '9+' : radarData.total_matches}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Radar Summary */}
      <View style={styles.radarCard}>
        <View style={styles.radarHeader}>
          <Ionicons name="radio" size={32} color="#1a472a" />
          <Text style={styles.radarTitle}>Il tuo Radar</Text>
        </View>

        {radarData && radarData.books_searching > 0 ? (
          <>
            <Text style={styles.radarSubtitle}>
              Stai cercando {radarData.books_searching} libri
            </Text>

            <View style={styles.radarStats}>
              <TouchableOpacity 
                style={styles.statItem}
                onPress={() => router.push('/radar/sellers')}
              >
                <Text style={styles.statNumber}>{radarData.total_matches}</Text>
                <Text style={styles.statLabel}>Totale Match</Text>
              </TouchableOpacity>
              <View style={styles.statDivider} />
              <TouchableOpacity 
                style={styles.statItem}
                onPress={() => router.push('/radar/sellers?filter=stessa_sezione')}
              >
                <Text style={[styles.statNumber, { color: '#4CAF50' }]}>
                  {radarData.same_section}
                </Text>
                <Text style={styles.statLabel}>Stessa Sezione</Text>
              </TouchableOpacity>
              <View style={styles.statDivider} />
              <TouchableOpacity 
                style={styles.statItem}
                onPress={() => router.push('/radar/sellers?filter=stessa_classe')}
              >
                <Text style={[styles.statNumber, { color: '#8BC34A' }]}>
                  {radarData.same_class}
                </Text>
                <Text style={styles.statLabel}>Stessa Classe</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.radarStats}>
              <TouchableOpacity 
                style={styles.statItem}
                onPress={() => router.push('/radar/sellers?filter=stessa_scuola')}
              >
                <Text style={[styles.statNumber, { color: '#FFC107' }]}>
                  {radarData.same_school}
                </Text>
                <Text style={styles.statLabel}>Stessa Scuola</Text>
              </TouchableOpacity>
              <View style={styles.statDivider} />
              <TouchableOpacity 
                style={styles.statItem}
                onPress={() => router.push('/radar/sellers?filter=altri')}
              >
                <Text style={[styles.statNumber, { color: '#FF9800' }]}>
                  {radarData.others}
                </Text>
                <Text style={styles.statLabel}>Altre Scuole</Text>
              </TouchableOpacity>
            </View>

            {/* View Sellers Button */}
            <TouchableOpacity
              style={styles.viewSellersButton}
              onPress={() => router.push('/radar/sellers')}
            >
              <Ionicons name="people" size={20} color="#fff" />
              <Text style={styles.viewSellersButtonText}>Vedi tutti i venditori</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.emptyRadar}>
            <Ionicons name="book-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>Nessuna ricerca attiva</Text>
            <Text style={styles.emptySubtext}>
              Vai su "Cerca" per aggiungere i libri che stai cercando
            </Text>
            <TouchableOpacity
              style={styles.searchButton}
              onPress={() => router.push('/(tabs)/search')}
            >
              <Text style={styles.searchButtonText}>Cerca Libri</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Book Flow Section - Simplified */}
      {classCompatibility && classCompatibility.summary && (
        <View style={styles.classCompatSection}>
          <View style={styles.sectionHeader}>
            <Ionicons name="swap-horizontal" size={24} color="#1a472a" />
            <Text style={styles.sectionTitle}>Flusso Libri</Text>
          </View>
          
          <Text style={styles.classCompatSubtitle}>
            Calcolo teorico basato sulle adozioni della tua scuola
          </Text>

          {/* Three Column Layout */}
          <View style={styles.bookFlowThreeColumns}>
            {/* LEFT - VENDI alla 1ª */}
            <View style={styles.bookFlowColumnNew}>
              <View style={[styles.bookFlowColumnHeader, { backgroundColor: '#2196F3' }]}>
                <Text style={styles.bookFlowColumnHeaderText}>
                  {classCompatibility.vendere?.classe_destinazione || 1}ª MEDIA
                </Text>
              </View>
              <View style={styles.bookFlowColumnBody}>
                <Ionicons name="arrow-up-circle" size={28} color="#2196F3" />
                <Text style={styles.bookFlowColumnAction}>VENDI</Text>
                <Text style={styles.bookFlowColumnNumber}>
                  {classCompatibility.vendere?.totale_vendibili || 0}
                </Text>
                <Text style={styles.bookFlowColumnLabel}>libri</Text>
              </View>
              {(classCompatibility.vendere?.totale_non_vendibili || 0) > 0 && (
                <Text style={[styles.bookFlowColumnHint, { color: '#f44336' }]}>
                  {classCompatibility.vendere?.totale_non_vendibili} ed. cambiate
                </Text>
              )}
            </View>

            {/* CENTER - TU (2ª) - NUOVI */}
            <View style={styles.bookFlowColumnNew}>
              <View style={[styles.bookFlowColumnHeader, { backgroundColor: '#1a472a' }]}>
                <Text style={styles.bookFlowColumnHeaderText}>{classCompatibility.user_classe}ª MEDIA</Text>
              </View>
              <View style={styles.bookFlowColumnBody}>
                <View style={styles.bookFlowYouBadge}>
                  <Text style={styles.bookFlowYouText}>TU</Text>
                </View>
                <Text style={[styles.bookFlowColumnAction, { color: '#FF9800' }]}>NUOVI</Text>
                <Text style={[styles.bookFlowColumnNumber, { color: '#FF9800' }]}>
                  {classCompatibility.nuovi?.totale || 0}
                </Text>
                <Text style={styles.bookFlowColumnLabel}>da comprare</Text>
              </View>
              <Text style={styles.bookFlowColumnHint}>
                €{classCompatibility.nuovi?.costo_totale?.toFixed(0) || 0} stimati
              </Text>
            </View>

            {/* RIGHT - COMPRA dalla 3ª */}
            <View style={styles.bookFlowColumnNew}>
              <View style={[styles.bookFlowColumnHeader, { backgroundColor: '#4CAF50' }]}>
                <Text style={styles.bookFlowColumnHeaderText}>
                  {classCompatibility.comprare?.classe_origine || 3}ª MEDIA
                </Text>
              </View>
              <View style={styles.bookFlowColumnBody}>
                <Ionicons name="cart" size={28} color="#4CAF50" />
                <Text style={[styles.bookFlowColumnAction, { color: '#4CAF50' }]}>COMPRA</Text>
                <Text style={[styles.bookFlowColumnNumber, { color: '#4CAF50' }]}>
                  {classCompatibility.comprare?.totale_usati || 0}
                </Text>
                <Text style={styles.bookFlowColumnLabel}>usati</Text>
              </View>
              <Text style={styles.bookFlowColumnHint}>
                Risparmio €{classCompatibility.comprare?.risparmio_totale?.toFixed(0) || 0}
              </Text>
            </View>
          </View>

          {/* Libri Usati Teoricamente Disponibili */}
          {classCompatibility.comprare?.libri_usati && classCompatibility.comprare.libri_usati.length > 0 && (
            <View style={styles.classCard}>
              <Text style={styles.sampleBooksTitle}>
                Libri che puoi comprare usato dalla {classCompatibility.comprare?.classe_origine}ª:
              </Text>
              {classCompatibility.comprare.libri_usati.slice(0, 4).map((book: any, idx: number) => (
                <View key={idx} style={styles.sampleBookItem}>
                  <View style={styles.sampleBookInfo}>
                    <Text style={styles.sampleBookTitle} numberOfLines={1}>
                      {book.disciplina}
                    </Text>
                    <Text style={styles.sampleBookSeller} numberOfLines={1}>
                      {book.titolo}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.sampleBookPrice, { color: '#4CAF50' }]}>
                      €{book.prezzo_usato?.toFixed(2)}
                    </Text>
                    <Text style={{ fontSize: 10, color: '#888', textDecorationLine: 'line-through' }}>
                      €{book.prezzo_nuovo?.toFixed(2)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Libri da Comprare Nuovi */}
          {classCompatibility.nuovi?.libri && classCompatibility.nuovi.libri.length > 0 && (
            <View style={styles.classCard}>
              <Text style={[styles.sampleBooksTitle, { color: '#FF9800' }]}>
                Libri da comprare nuovi (edizione cambiata):
              </Text>
              {classCompatibility.nuovi.libri.slice(0, 3).map((book: any, idx: number) => (
                <View key={idx} style={styles.sampleBookItem}>
                  <View style={styles.sampleBookInfo}>
                    <Text style={styles.sampleBookTitle} numberOfLines={1}>
                      {book.disciplina}
                    </Text>
                    <Text style={[styles.sampleBookSeller, { color: '#FF9800' }]} numberOfLines={1}>
                      {book.motivo}
                    </Text>
                  </View>
                  <Text style={[styles.sampleBookPrice, { color: '#FF9800' }]}>
                    €{book.prezzo?.toFixed(2)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Libri Non Vendibili */}
          {classCompatibility.vendere?.libri_non_vendibili && classCompatibility.vendere.libri_non_vendibili.length > 0 && (
            <View style={styles.classCard}>
              <Text style={[styles.sampleBooksTitle, { color: '#f44336' }]}>
                Libri che non puoi vendere (edizione cambiata):
              </Text>
              {classCompatibility.vendere.libri_non_vendibili.map((book: any, idx: number) => (
                <View key={idx} style={styles.sampleBookItem}>
                  <View style={styles.sampleBookInfo}>
                    <Text style={styles.sampleBookTitle} numberOfLines={1}>
                      {book.disciplina}
                    </Text>
                    <Text style={[styles.sampleBookSeller, { color: '#f44336' }]} numberOfLines={1}>
                      1ª richiede: {book.titolo_nuovo?.substring(0, 30)}...
                    </Text>
                  </View>
                  <Ionicons name="close-circle" size={20} color="#f44336" />
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Matches List */}
      {matches.length > 0 && (
        <View style={styles.matchesSection}>
          <Text style={styles.sectionTitle}>Libri Disponibili</Text>
          
          {!isPremium && (
            <View style={styles.premiumBanner}>
              <Ionicons name="diamond" size={20} color="#f4a460" />
              <Text style={styles.premiumBannerText}>
                Diventa Premium per 0% commissioni!
              </Text>
            </View>
          )}

          {matches.map((match, index) => {
            const compat = getCompatibilityLabel(match.compatibility_score);
            return (
              <TouchableOpacity
                key={index}
                style={styles.matchCard}
                onPress={() => handleMatchPress(match)}
              >
                <View style={styles.matchHeader}>
                  <View style={[styles.compatBadge, { backgroundColor: compat.color }]}>
                    <Text style={styles.compatBadgeText}>{compat.text}</Text>
                  </View>
                  <Text style={styles.matchPrice}>
                    €{match.listing.prezzo_vendita?.toFixed(2)}
                  </Text>
                </View>

                <Text style={styles.matchTitle}>{match.listing.book_titolo}</Text>
                <Text style={styles.matchAuthor}>{match.listing.book_autore}</Text>

                <View style={styles.matchFooter}>
                  <View style={styles.conditionBadge}>
                    <Text style={styles.conditionText}>
                      {getConditionLabel(match.listing.condizione)}
                    </Text>
                  </View>
                  <Text style={styles.matchSeller}>
                    da {match.listing.seller_username}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radarCard: {
    backgroundColor: '#fff',
    margin: 16,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  radarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  radarTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a472a',
    marginLeft: 12,
  },
  radarSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  radarStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#e0e0e0',
  },
  emptyRadar: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  searchButton: {
    backgroundColor: '#1a472a',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  searchButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  matchesSection: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  premiumBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff8f0',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f4a460',
  },
  premiumBannerText: {
    marginLeft: 8,
    color: '#c77c3c',
    fontWeight: '500',
  },
  matchCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  matchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  compatBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  compatBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  matchPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  matchTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  matchAuthor: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  matchFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  conditionBadge: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  conditionText: {
    fontSize: 12,
    color: '#666',
  },
  matchSeller: {
    fontSize: 12,
    color: '#999',
  },
  viewSellersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a472a',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 16,
    gap: 8,
  },
  viewSellersButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  notificationButton: {
    position: 'relative',
    padding: 8,
  },
  notificationBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#ff4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  // Cross-Class Compatibility Styles
  classCompatSection: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  classCompatSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    marginLeft: 4,
  },
  compatSummaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  compatSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  compatSummaryStat: {
    alignItems: 'center',
    flex: 1,
  },
  compatSummaryNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  compatSummaryLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
  },
  compatSummaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#e0e0e0',
  },
  compatMessage: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
  },
  classCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  classCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  classInfo: {
    flex: 1,
  },
  classBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  classBadgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  classRelationship: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  classRelationshipText: {
    fontSize: 12,
    marginLeft: 4,
  },
  classStats: {
    alignItems: 'flex-end',
  },
  classCompatPercent: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  classCompatLabel: {
    fontSize: 11,
    color: '#666',
  },
  classDescription: {
    fontSize: 13,
    color: '#555',
    marginBottom: 12,
  },
  classMetaRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 12,
    gap: 16,
  },
  classMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  classMetaText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4,
  },
  sampleBooksContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  sampleBooksTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  sampleBookItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  sampleBookUsable: {
    backgroundColor: '#e8f5e9',
    marginHorizontal: -8,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  sampleBookInfo: {
    flex: 1,
  },
  sampleBookTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#333',
  },
  sampleBookSeller: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
  sampleBookRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  volumeUnicoBadge: {
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  volumeUnicoText: {
    fontSize: 10,
    color: '#1976D2',
    fontWeight: '600',
  },
  sampleBookPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  topSellersContainer: {
    marginTop: 4,
  },
  topSellersTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  topSellersList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  topSellerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  topSellerName: {
    fontSize: 12,
    color: '#333',
  },
  topSellerBooks: {
    fontSize: 10,
    color: '#666',
    marginLeft: 4,
  },
  // Book Flow Header styles
  bookFlowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    gap: 8,
  },
  bookFlowHeaderText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  // New Three Column Layout
  bookFlowThreeColumns: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 16,
  },
  bookFlowColumnNew: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  bookFlowColumnHeader: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  bookFlowColumnHeaderText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  bookFlowColumnBody: {
    padding: 12,
    alignItems: 'center',
  },
  bookFlowColumnAction: {
    fontSize: 10,
    fontWeight: '600',
    color: '#2196F3',
    marginTop: 4,
  },
  bookFlowColumnNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  bookFlowColumnLabel: {
    fontSize: 11,
    color: '#666',
  },
  bookFlowColumnHint: {
    fontSize: 9,
    color: '#888',
    textAlign: 'center',
    paddingBottom: 8,
    paddingHorizontal: 4,
  },
  bookFlowYouBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1a472a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookFlowYouText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
