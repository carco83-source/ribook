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

      {/* Cross-Class Compatibility Section */}
      {classCompatibility && classCompatibility.classes.length > 0 && (
        <View style={styles.classCompatSection}>
          <View style={styles.sectionHeader}>
            <Ionicons name="swap-horizontal" size={24} color="#1a472a" />
            <Text style={styles.sectionTitle}>Compatibilità tra Classi</Text>
          </View>
          
          <Text style={styles.classCompatSubtitle}>
            Sei in {classCompatibility.user_classe}ª media - Ecco cosa puoi trovare dalle altre classi
          </Text>

          {/* Summary Card */}
          <View style={styles.compatSummaryCard}>
            <View style={styles.compatSummaryRow}>
              <View style={styles.compatSummaryStat}>
                <Text style={styles.compatSummaryNumber}>{classCompatibility.summary.total_books_available}</Text>
                <Text style={styles.compatSummaryLabel}>Libri totali</Text>
              </View>
              <View style={styles.compatSummaryDivider} />
              <View style={styles.compatSummaryStat}>
                <Text style={[styles.compatSummaryNumber, { color: '#4CAF50' }]}>
                  {classCompatibility.summary.total_usable_for_you}
                </Text>
                <Text style={styles.compatSummaryLabel}>Usabili per te</Text>
              </View>
              <View style={styles.compatSummaryDivider} />
              <View style={styles.compatSummaryStat}>
                <Text style={[styles.compatSummaryNumber, { color: '#2196F3' }]}>
                  {classCompatibility.summary.overall_compatibility}%
                </Text>
                <Text style={styles.compatSummaryLabel}>Compatibilità</Text>
              </View>
            </View>
            <Text style={styles.compatMessage}>{classCompatibility.summary.message}</Text>
          </View>

          {/* Per-Class Cards */}
          {classCompatibility.classes.map((classData) => (
            <View key={classData.classe} style={styles.classCard}>
              <View style={styles.classCardHeader}>
                <View style={styles.classInfo}>
                  <View style={[
                    styles.classBadge, 
                    { backgroundColor: classData.relationship === 'precedente' ? '#4CAF50' : '#2196F3' }
                  ]}>
                    <Text style={styles.classBadgeText}>{classData.classe}ª Media</Text>
                  </View>
                  <View style={styles.classRelationship}>
                    <Ionicons 
                      name={classData.relationship === 'precedente' ? 'arrow-up' : 'arrow-down'} 
                      size={14} 
                      color={classData.relationship === 'precedente' ? '#4CAF50' : '#2196F3'} 
                    />
                    <Text style={[
                      styles.classRelationshipText,
                      { color: classData.relationship === 'precedente' ? '#4CAF50' : '#2196F3' }
                    ]}>
                      {classData.relationship === 'precedente' ? 'Classe precedente' : 'Classe successiva'}
                    </Text>
                  </View>
                </View>
                <View style={styles.classStats}>
                  <Text style={styles.classCompatPercent}>{classData.compatibility_percentage}%</Text>
                  <Text style={styles.classCompatLabel}>compatibile</Text>
                </View>
              </View>

              <Text style={styles.classDescription}>{classData.relationship_desc}</Text>

              <View style={styles.classMetaRow}>
                <View style={styles.classMeta}>
                  <Ionicons name="people-outline" size={16} color="#666" />
                  <Text style={styles.classMetaText}>{classData.sellers_count} venditori</Text>
                </View>
                <View style={styles.classMeta}>
                  <Ionicons name="book-outline" size={16} color="#666" />
                  <Text style={styles.classMetaText}>{classData.books_count} libri</Text>
                </View>
                <View style={styles.classMeta}>
                  <Ionicons name="checkmark-circle-outline" size={16} color="#4CAF50" />
                  <Text style={[styles.classMetaText, { color: '#4CAF50' }]}>
                    {classData.usable_for_you} per te
                  </Text>
                </View>
              </View>

              {/* Sample Books */}
              {classData.sample_books.length > 0 && (
                <View style={styles.sampleBooksContainer}>
                  <Text style={styles.sampleBooksTitle}>Libri in vendita:</Text>
                  {classData.sample_books.slice(0, 3).map((book, idx) => (
                    <TouchableOpacity 
                      key={idx} 
                      style={[
                        styles.sampleBookItem,
                        book.is_usable_for_you && styles.sampleBookUsable
                      ]}
                      onPress={() => router.push(`/listing/${book.listing_id}`)}
                    >
                      <View style={styles.sampleBookInfo}>
                        <Text style={styles.sampleBookTitle} numberOfLines={1}>
                          {book.titolo}
                        </Text>
                        <Text style={styles.sampleBookSeller}>
                          da {book.seller_username}
                        </Text>
                      </View>
                      <View style={styles.sampleBookRight}>
                        {book.is_volume_unico && (
                          <View style={styles.volumeUnicoBadge}>
                            <Text style={styles.volumeUnicoText}>Vol. Unico</Text>
                          </View>
                        )}
                        <Text style={styles.sampleBookPrice}>€{book.prezzo_vendita.toFixed(2)}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Top Sellers */}
              {classData.top_sellers.length > 0 && (
                <View style={styles.topSellersContainer}>
                  <Text style={styles.topSellersTitle}>Top venditori:</Text>
                  <View style={styles.topSellersList}>
                    {classData.top_sellers.map((seller, idx) => (
                      <View key={idx} style={styles.topSellerBadge}>
                        <Text style={styles.topSellerName}>{seller.username}</Text>
                        <Text style={styles.topSellerBooks}>({seller.books_count})</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          ))}
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
});
