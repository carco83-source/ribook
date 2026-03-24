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

interface CartData {
  total_confirmed: number;
  total_pending: number;
  items: any[];
}

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
  const [childProfiles, setChildProfiles] = useState<any[]>([]);
  const [childrenCompatibility, setChildrenCompatibility] = useState<{[key: string]: any}>({});
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  
  // New state for purchasable books
  const [totalePiattaforma, setTotalePiattaforma] = useState(0);
  const [libriPerProfilo, setLibriPerProfilo] = useState<{[key: string]: any}>({});
  
  // Cart state
  const [cartData, setCartData] = useState<CartData | null>(null);

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

      // Get user data with child profiles
      const userResponse = await axios.get(`${API_URL}/api/users/${storedUserId}`);
      const profili = userResponse.data.profili_figli || [];
      setChildProfiles(profili);

      // Load purchasable books data (NEW)
      try {
        const libriResponse = await axios.get(`${API_URL}/api/libri-acquistabili/${storedUserId}`);
        setTotalePiattaforma(libriResponse.data.totale_piattaforma || 0);
        
        // Map profili data by child_id
        const profiliMap: {[key: string]: any} = {};
        for (const p of libriResponse.data.profili || []) {
          profiliMap[p.child_id] = p;
        }
        setLibriPerProfilo(profiliMap);
      } catch (e) {
        console.log('Failed to load purchasable books');
      }

      // Load compatibility for each child profile
      const compatibilityData: {[key: string]: any} = {};
      for (const child of profili) {
        try {
          const compRes = await axios.get(
            `${API_URL}/api/profiles/${storedUserId}/children/${child.id}/compatibility`
          );
          compatibilityData[child.id] = compRes.data;
        } catch (e) {
          console.log(`Failed to load compatibility for ${child.nome_figlio}`);
        }
      }
      setChildrenCompatibility(compatibilityData);
      
      // Load cart data
      try {
        const cartResponse = await axios.get(`${API_URL}/api/cart/${storedUserId}`);
        setCartData(cartResponse.data);
      } catch (e) {
        console.log('Failed to load cart');
      }
      
      // Select first child by default
      if (profili.length > 0 && !selectedChildId) {
        setSelectedChildId(profili[0].id);
      }
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
      {/* Header with Cart and Notifications */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Ionicons name="book" size={28} color="#1a472a" />
          <Text style={styles.headerTitle}>ScambiaLibri</Text>
        </View>
        <View style={styles.headerRight}>
          {/* Cart Button */}
          <TouchableOpacity 
            style={styles.headerButton}
            onPress={() => router.push('/cart')}
          >
            <Ionicons name="cart" size={24} color="#1a472a" />
            {cartData && (cartData.total_confirmed + cartData.total_pending) > 0 && (
              <View style={[
                styles.headerBadge,
                cartData.total_confirmed > 0 ? styles.headerBadgeGreen : styles.headerBadgeOrange
              ]}>
                <Text style={styles.headerBadgeText}>
                  {(cartData.total_confirmed + cartData.total_pending) > 9 ? '9+' : (cartData.total_confirmed + cartData.total_pending)}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          
          {/* Notifications Button */}
          <TouchableOpacity 
            style={styles.headerButton}
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
      </View>

      {/* Child Profile Selector - SUBITO DOPO HEADER */}
      {childProfiles.length > 0 && (
        <View style={styles.profileSelectorCard}>
          <Text style={styles.profileSelectorLabel}>Seleziona profilo:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.childTabs}>
              {childProfiles.map((child) => (
                <TouchableOpacity
                  key={child.id}
                  style={[
                    styles.childTab,
                    selectedChildId === child.id && styles.childTabActive
                  ]}
                  onPress={() => setSelectedChildId(child.id)}
                >
                  <Text style={[
                    styles.childTabText,
                    selectedChildId === child.id && styles.childTabTextActive
                  ]}>
                    {child.nome_figlio}
                  </Text>
                  <Text style={[
                    styles.childTabSubtext,
                    selectedChildId === child.id && styles.childTabSubtextActive
                  ]}>
                    {child.classe}ª {child.tipo_scuola === 'primo_grado' ? 'media' : 'sup'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Book Flow Section */}
      {selectedChildId && childrenCompatibility[selectedChildId] && (() => {
        const compatibility = childrenCompatibility[selectedChildId];
        const child = childProfiles.find(c => c.id === selectedChildId);
        const isMedia = child?.tipo_scuola === 'primo_grado';
        const tipoLabel = isMedia ? 'MEDIA' : 'SUP';
        
        return (
          <View style={styles.classCompatSection}>
            <View style={styles.sectionHeader}>
              <Ionicons name="swap-horizontal" size={24} color="#1a472a" />
              <Text style={styles.sectionTitle}>Flusso Libri</Text>
            </View>
            
            <Text style={styles.classCompatSubtitle}>
              {child?.scuola} - {child?.classe}ª {tipoLabel}
            </Text>

            {/* Three Column Layout */}
            <View style={styles.bookFlowThreeColumns}>
              {/* LEFT - VENDI */}
              <View style={styles.bookFlowColumnNew}>
                <View style={[styles.bookFlowColumnHeader, { backgroundColor: '#2196F3' }]}>
                  <Text style={styles.bookFlowColumnHeaderText}>
                    {compatibility.vendere?.classe_destinazione 
                      ? `${compatibility.vendere.classe_destinazione}ª ${tipoLabel}` 
                      : 'N/A'}
                  </Text>
                </View>
                <View style={styles.bookFlowColumnBody}>
                  <Ionicons name="arrow-up-circle" size={28} color="#2196F3" />
                  <Text style={styles.bookFlowColumnAction}>VENDI</Text>
                  <Text style={styles.bookFlowColumnNumber}>
                    {compatibility.vendere?.totale_vendibili || 0}
                  </Text>
                  <Text style={styles.bookFlowColumnLabel}>libri</Text>
                </View>
                {(compatibility.vendere?.totale_non_vendibili || 0) > 0 && (
                  <Text style={[styles.bookFlowColumnHint, { color: '#f44336' }]}>
                    {compatibility.vendere?.totale_non_vendibili} ed. cambiate
                  </Text>
                )}
              </View>

              {/* CENTER - TU */}
              <View style={styles.bookFlowColumnNew}>
                <View style={[styles.bookFlowColumnHeader, { backgroundColor: '#1a472a' }]}>
                  <Text style={styles.bookFlowColumnHeaderText}>{child?.classe}ª {tipoLabel}</Text>
                </View>
                <View style={styles.bookFlowColumnBody}>
                  <View style={styles.bookFlowYouBadge}>
                    <Text style={styles.bookFlowYouText}>{child?.nome_figlio?.charAt(0) || '?'}</Text>
                  </View>
                  <Text style={[styles.bookFlowColumnAction, { color: '#FF9800', fontSize: 10 }]}>NON REPERITI</Text>
                  <Text style={[styles.bookFlowColumnNumber, { color: '#FF9800' }]}>
                    {compatibility.nuovi?.totale || 0}
                  </Text>
                  <Text style={[styles.bookFlowColumnLabel, { fontSize: 10 }]}>usati/nuovi</Text>
                </View>
                <Text style={styles.bookFlowColumnHint}>
                  €{compatibility.nuovi?.costo_totale?.toFixed(0) || 0} stimati
                </Text>
                {(compatibility.consigliati?.totale_da_comprare || 0) > 0 && (
                  <Text style={[styles.bookFlowColumnHint, { color: '#9C27B0', marginTop: 4, fontSize: 10 }]}>
                    +{compatibility.consigliati?.totale_da_comprare} consigliati
                  </Text>
                )}
              </View>

              {/* RIGHT - COMPRA */}
              <View style={styles.bookFlowColumnNew}>
                <View style={[styles.bookFlowColumnHeader, { backgroundColor: '#4CAF50' }]}>
                  <Text style={styles.bookFlowColumnHeaderText}>
                    {compatibility.comprare?.classe_origine 
                      ? `${compatibility.comprare.classe_origine}ª ${tipoLabel}` 
                      : 'N/A'}
                  </Text>
                </View>
                <View style={styles.bookFlowColumnBody}>
                  <Ionicons name="cart" size={28} color="#4CAF50" />
                  <Text style={[styles.bookFlowColumnAction, { color: '#4CAF50' }]}>COMPRA</Text>
                  <Text style={[styles.bookFlowColumnNumber, { color: '#4CAF50' }]}>
                    {compatibility.comprare?.totale_usati || 0}
                  </Text>
                  <Text style={styles.bookFlowColumnLabel}>usati</Text>
                </View>
                <Text style={styles.bookFlowColumnHint}>
                  {compatibility.comprare?.risparmio_totale > 0 
                    ? `Risparmio €${compatibility.comprare.risparmio_totale.toFixed(0)}`
                    : 'Fine ciclo'}
                </Text>
              </View>
            </View>

            {/* Tetto di Spesa Ministeriale - Per tutti i profili */}
            {compatibility.tetto_spesa && compatibility.tetto_spesa.tetto_ministeriale > 0 && (
              <View style={[styles.classCard, { 
                borderLeftWidth: 4, 
                borderLeftColor: compatibility.tetto_spesa.entro_limite ? '#4CAF50' : 
                                 compatibility.tetto_spesa.entro_deroga_15 ? '#FF9800' : '#f44336'
              }]}>
                <Text style={[styles.sampleBooksTitle, { color: '#1a472a' }]}>
                  📊 Tetto di Spesa Ministeriale
                </Text>
                <Text style={{ fontSize: 10, color: '#666', marginBottom: 8 }}>
                  {compatibility.tetto_spesa.riferimento_normativo}
                </Text>
                
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <View>
                    <Text style={{ fontSize: 12, color: '#666' }}>Tetto base:</Text>
                    <Text style={{ fontSize: 16, fontWeight: 'bold' }}>€{compatibility.tetto_spesa.tetto_ministeriale?.toFixed(2)}</Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 12, color: '#666' }}>Con deroga +10%:</Text>
                    <Text style={{ fontSize: 16 }}>€{compatibility.tetto_spesa.tetto_con_deroga_10?.toFixed(2)}</Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 12, color: '#666' }}>Max +15%:</Text>
                    <Text style={{ fontSize: 16 }}>€{compatibility.tetto_spesa.tetto_con_deroga_15?.toFixed(2)}</Text>
                  </View>
                </View>
                
                <View style={{ 
                  backgroundColor: compatibility.tetto_spesa.entro_limite ? '#E8F5E9' : 
                                   compatibility.tetto_spesa.entro_deroga_15 ? '#FFF3E0' : '#FFEBEE',
                  padding: 12,
                  borderRadius: 8,
                  marginTop: 8
                }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, color: '#666' }}>Costo libri obbligatori</Text>
                      <Text style={{ fontSize: 10, color: '#999', fontStyle: 'italic' }}>se acquistati tutti nuovi:</Text>
                      <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#1a472a' }}>
                        €{compatibility.tetto_spesa.costo_obbligatori?.toFixed(2)}
                      </Text>
                      {(compatibility.tetto_spesa.costo_consigliati || 0) > 0 && (
                        <Text style={{ fontSize: 10, color: '#9C27B0', marginTop: 4 }}>
                          + €{compatibility.tetto_spesa.costo_consigliati?.toFixed(2)} consigliati = €{compatibility.tetto_spesa.costo_totale_tutti?.toFixed(2)} totale
                        </Text>
                      )}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      {compatibility.tetto_spesa.entro_limite ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                          <Text style={{ color: '#4CAF50', fontWeight: 'bold', marginLeft: 4 }}>ENTRO LIMITE</Text>
                        </View>
                      ) : compatibility.tetto_spesa.entro_deroga_15 ? (
                        <View style={{ alignItems: 'flex-end' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Ionicons name="warning" size={24} color="#FF9800" />
                            <Text style={{ color: '#FF9800', fontWeight: 'bold', marginLeft: 4 }}>SFORA</Text>
                          </View>
                          <Text style={{ fontSize: 10, color: '#FF9800' }}>
                            +{compatibility.tetto_spesa.percentuale_sforamento?.toFixed(1)}% (entro deroga)
                          </Text>
                        </View>
                      ) : (
                        <View style={{ alignItems: 'flex-end' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Ionicons name="alert-circle" size={24} color="#f44336" />
                            <Text style={{ color: '#f44336', fontWeight: 'bold', marginLeft: 4 }}>OLTRE LIMITE!</Text>
                          </View>
                          <Text style={{ fontSize: 10, color: '#f44336' }}>
                            +{compatibility.tetto_spesa.percentuale_sforamento?.toFixed(1)}% (€{compatibility.tetto_spesa.differenza?.toFixed(2)} in più)
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* Libri Vendibili */}
            {compatibility.vendere?.libri_vendibili && compatibility.vendere.libri_vendibili.length > 0 && (
              <View style={styles.classCard}>
                <Text style={[styles.sampleBooksTitle, { color: '#2196F3' }]}>
                  Libri che {child?.nome_figlio} può vendere alla {compatibility.vendere?.classe_destinazione}ª:
                </Text>
                {compatibility.vendere.libri_vendibili.map((book: any, idx: number) => (
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
                      <Text style={[styles.sampleBookPrice, { color: '#2196F3' }]}>
                        €{book.prezzo_consigliato?.toFixed(2)}
                      </Text>
                      <Text style={{ fontSize: 10, color: '#4CAF50' }}>
                        vendibile
                      </Text>
                    </View>
                  </View>
                ))}
                {/* Link per vendere */}
                <TouchableOpacity
                  style={[styles.viewSellersButton, { backgroundColor: '#2196F3', marginTop: 12 }]}
                  onPress={() => router.push('/(tabs)/sell')}
                >
                  <Ionicons name="pricetag" size={18} color="#fff" />
                  <Text style={styles.viewSellersButtonText}>Vendi questi libri</Text>
                  <Ionicons name="arrow-forward" size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            )}

            {/* Libri NON Vendibili (edizione cambiata) */}
            {compatibility.vendere?.libri_non_vendibili && compatibility.vendere.libri_non_vendibili.length > 0 && (
              <View style={[styles.classCard, { borderLeftColor: '#f44336', borderLeftWidth: 3 }]}>
                <Text style={[styles.sampleBooksTitle, { color: '#f44336' }]}>
                  Libri NON vendibili (edizione cambiata):
                </Text>
                {compatibility.vendere.libri_non_vendibili.map((book: any, idx: number) => (
                  <View key={idx} style={styles.sampleBookItem}>
                    <View style={styles.sampleBookInfo}>
                      <Text style={styles.sampleBookTitle} numberOfLines={1}>
                        {book.disciplina}
                      </Text>
                      <Text style={[styles.sampleBookSeller, { color: '#f44336' }]} numberOfLines={1}>
                        {book.status}
                      </Text>
                    </View>
                    <Ionicons name="close-circle" size={20} color="#f44336" />
                  </View>
                ))}
              </View>
            )}

            {/* Libri Usati Disponibili - CON NUMERO COPIE E LINK */}
            {compatibility.comprare?.libri_usati && compatibility.comprare.libri_usati.length > 0 && (
              <View style={styles.classCard}>
                <Text style={styles.sampleBooksTitle}>
                  Libri usati da acquistare per {child?.nome_figlio}:
                </Text>
                {compatibility.comprare.libri_usati.map((book: any, idx: number) => (
                  <TouchableOpacity 
                    key={idx} 
                    style={[
                      styles.sampleBookItem,
                      book.copie_disponibili > 0 && styles.sampleBookItemClickable
                    ]}
                    onPress={() => {
                      if (book.copie_disponibili > 0 && book.isbn) {
                        router.push(`/book-sellers/${book.isbn}`);
                      }
                    }}
                    disabled={!book.copie_disponibili || book.copie_disponibili === 0}
                  >
                    <View style={styles.sampleBookInfo}>
                      <Text style={styles.sampleBookTitle} numberOfLines={1}>
                        {book.disciplina}
                      </Text>
                      <Text style={styles.sampleBookSeller} numberOfLines={1}>
                        {book.titolo}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', flexDirection: 'row', gap: 8 }}>
                      {/* Badge copie disponibili */}
                      <View style={[
                        styles.copieBadge,
                        book.copie_disponibili > 0 ? styles.copieBadgeAvailable : styles.copieBadgeNone
                      ]}>
                        <Text style={[
                          styles.copieBadgeText,
                          book.copie_disponibili > 0 ? styles.copieBadgeTextAvailable : styles.copieBadgeTextNone
                        ]}>
                          {book.copie_disponibili || 0}
                        </Text>
                      </View>
                      {book.copie_disponibili > 0 && (
                        <Ionicons name="chevron-forward" size={20} color="#4CAF50" />
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Libri non reperiti usati o nuove edizioni */}
            {compatibility.nuovi?.libri && compatibility.nuovi.libri.length > 0 && (
              <View style={styles.classCard}>
                <Text style={[styles.sampleBooksTitle, { color: '#FF9800' }]}>
                  Libri non reperiti usati o nuove edizioni:
                </Text>
                <Text style={{ fontSize: 11, color: '#666', marginBottom: 12, fontStyle: 'italic' }}>
                  Al momento da acquistare nuovi (oppure usati se disponibili)
                </Text>
                {compatibility.nuovi.libri.map((book: any, idx: number) => (
                  <TouchableOpacity 
                    key={idx} 
                    style={[
                      styles.sampleBookItem,
                      book.copie_usate_disponibili > 0 && styles.sampleBookItemClickable
                    ]}
                    onPress={() => {
                      // SEMPRE cliccabile se ci sono copie usate
                      if (book.copie_usate_disponibili > 0 && book.isbn) {
                        router.push(`/book-sellers/${book.isbn}`);
                      }
                    }}
                  >
                    <View style={styles.sampleBookInfo}>
                      <Text style={styles.sampleBookTitle} numberOfLines={1}>
                        {book.disciplina}
                      </Text>
                      <Text style={styles.sampleBookSeller} numberOfLines={2}>
                        {book.titolo}
                      </Text>
                      {book.is_nuova_edizione && (
                        <Text style={{ fontSize: 10, color: '#f44336', fontWeight: 'bold' }}>
                          ⚠️ NUOVA EDIZIONE 2025 - Solo nuovo
                        </Text>
                      )}
                      {!book.is_nuova_edizione && book.copie_usate_disponibili > 0 ? (
                        <Text style={{ fontSize: 10, color: '#4CAF50', fontWeight: 'bold' }}>
                          ✅ {book.copie_usate_disponibili} copie usate disponibili - Tocca per acquistare
                        </Text>
                      ) : !book.is_nuova_edizione && (
                        <Text style={{ fontSize: 10, color: '#999' }}>
                          Nessuna copia usata al momento
                        </Text>
                      )}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.sampleBookPrice, { color: '#FF9800' }]}>
                        €{book.prezzo?.toFixed(2)}
                      </Text>
                      {book.copie_usate_disponibili > 0 && !book.is_nuova_edizione && (
                        <Ionicons name="chevron-forward" size={16} color="#4CAF50" />
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Testi Consigliati o Da Non Acquistare */}
            {compatibility.consigliati?.libri_da_comprare && compatibility.consigliati.libri_da_comprare.length > 0 && (
              <View style={styles.classCard}>
                <Text style={[styles.sampleBooksTitle, { color: '#9C27B0' }]}>
                  Testi consigliati o da non acquistare:
                </Text>
                {compatibility.consigliati.libri_da_comprare.map((book: any, idx: number) => (
                  <TouchableOpacity 
                    key={idx} 
                    style={[
                      styles.sampleBookItem,
                      book.copie_usate_disponibili > 0 && styles.sampleBookItemClickable
                    ]}
                    onPress={() => {
                      // SEMPRE cliccabile se ci sono copie usate - anche per chi l'ha perso/rovinato
                      if (book.copie_usate_disponibili > 0 && book.isbn) {
                        router.push(`/book-sellers/${book.isbn}`);
                      }
                    }}
                  >
                    <View style={styles.sampleBookInfo}>
                      <Text style={styles.sampleBookTitle} numberOfLines={1}>
                        {book.disciplina}
                      </Text>
                      <Text style={styles.sampleBookSeller} numberOfLines={2}>
                        {book.titolo}
                      </Text>
                      {book.copie_usate_disponibili > 0 ? (
                        <Text style={{ fontSize: 10, color: '#4CAF50', fontWeight: 'bold' }}>
                          ✅ {book.copie_usate_disponibili} copie usate disponibili - Tocca per acquistare
                        </Text>
                      ) : (
                        <Text style={{ fontSize: 10, color: '#999' }}>
                          Nessuna copia usata al momento
                        </Text>
                      )}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.sampleBookPrice, { color: '#9C27B0' }]}>
                        €{book.prezzo?.toFixed(2)}
                      </Text>
                      {book.copie_usate_disponibili > 0 && (
                        <Ionicons name="chevron-forward" size={16} color="#4CAF50" />
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        );
      })()}

      {/* Empty state if no profile selected */}
      {childProfiles.length === 0 && (
        <View style={styles.emptyBooksSection}>
          <Ionicons name="person-add-outline" size={48} color="#ccc" />
          <Text style={styles.emptyText}>
            Nessun profilo figlio configurato
          </Text>
          <Text style={styles.emptySubtext}>
            Vai al tuo profilo per aggiungere i tuoi figli
          </Text>
          <TouchableOpacity
            style={styles.viewSellersButton}
            onPress={() => router.push('/(tabs)/profile')}
          >
            <Text style={styles.viewSellersButtonText}>Vai al Profilo</Text>
          </TouchableOpacity>
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
    fontSize: 26,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerButton: {
    position: 'relative',
    padding: 8,
  },
  headerBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBadgeGreen: {
    backgroundColor: '#4CAF50',
  },
  headerBadgeOrange: {
    backgroundColor: '#FF9800',
  },
  headerBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
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
    fontSize: 11,
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
    marginBottom: 12,
  },
  classCompatSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
    marginLeft: 4,
  },
  compatSummaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
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
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  compatSummaryLabel: {
    fontSize: 13,
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
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  bookFlowHeaderText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  // New Three Column Layout
  bookFlowThreeColumns: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
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
    paddingVertical: 12,
    alignItems: 'center',
  },
  bookFlowColumnHeaderText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  bookFlowColumnBody: {
    padding: 16,
    alignItems: 'center',
  },
  bookFlowColumnAction: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2196F3',
    marginTop: 6,
  },
  bookFlowColumnNumber: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#333',
  },
  bookFlowColumnLabel: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  bookFlowColumnHint: {
    fontSize: 11,
    color: '#888',
    textAlign: 'center',
    paddingBottom: 10,
    paddingHorizontal: 6,
  },
  bookFlowYouBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#1a472a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookFlowYouText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  // Child Profile Tabs
  childTabs: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 10,
  },
  childTab: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: '#e0e0e0',
  },
  childTabActive: {
    backgroundColor: '#1a472a',
  },
  childTabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  childTabTextActive: {
    color: '#fff',
  },
  // New Purchasable Books Styles
  purchasableCounters: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 16,
    marginBottom: 16,
  },
  counterBox: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  counterBoxHighlight: {
    backgroundColor: '#e8f5e9',
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  counterNumber: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  counterLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  counterSubLabel: {
    fontSize: 12,
    color: '#999',
  },
  counterName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  profileSelector: {
    marginTop: 8,
  },
  profileSelectorLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  childTabSmall: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#e0e0e0',
    marginRight: 8,
  },
  childTabSmallActive: {
    backgroundColor: '#1a472a',
  },
  childTabTextSmall: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  childTabTextSmallActive: {
    color: '#fff',
  },
  booksListSection: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    padding: 16,
  },
  bookCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  bookCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  bookDiscipline: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a472a',
    textTransform: 'uppercase',
  },
  conditionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#666',
  },
  conditionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  bookTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  bookPublisher: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  bookPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  bookPriceOld: {
    fontSize: 12,
    color: '#999',
    textDecorationLine: 'line-through',
  },
  bookPrice: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  bookSellerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bookSeller: {
    fontSize: 13,
    color: '#666',
  },
  bookstoreInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  bookstoreText: {
    fontSize: 12,
    color: '#1a472a',
    flex: 1,
  },
  emptyBooksSection: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
  },
  // Profile selector card
  profileSelectorCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  // Badge copie disponibili
  copieBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  copieBadgeAvailable: {
    backgroundColor: '#4CAF50',
  },
  copieBadgeNone: {
    backgroundColor: '#e0e0e0',
  },
  copieBadgeText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  copieBadgeTextAvailable: {
    color: '#fff',
  },
  copieBadgeTextNone: {
    color: '#999',
  },
  sampleBookItemClickable: {
    backgroundColor: '#f0fff0',
    marginHorizontal: -8,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  childTabSubtext: {
    fontSize: 10,
    color: '#888',
    marginTop: 2,
  },
  childTabSubtextActive: {
    color: '#fff',
  },
});
