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
  Image,
  Modal,
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Picker } from '@react-native-picker/picker';
import { SCUOLE_PRIMO_GRADO, SCUOLE_SECONDO_GRADO, getClassiByType, SEZIONI } from '../../src/constants/schools';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Helper function per convertire numeri in parole italiane
const getClasseLabel = (classe: number | string): string => {
  const classeNum = typeof classe === 'string' ? parseInt(classe) : classe;
  const nomiClassi: { [key: number]: string } = {
    1: 'PRIMA',
    2: 'SECONDA', 
    3: 'TERZA',
    4: 'QUARTA',
    5: 'QUINTA',
  };
  return nomiClassi[classeNum] || `${classeNum}ª`;
};

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

  // Notifications state
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Modal Aggiungi Profilo state
  const [showAddProfileModal, setShowAddProfileModal] = useState(false);
  const [newProfile, setNewProfile] = useState({
    nome_figlio: '',
    tipo_scuola: 'primo_grado',
    scuola: '',
    codice_scuola: '',
    classe: '',
    sezione: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [availableSections, setAvailableSections] = useState<string[]>([]);
  const [sectionsByClass, setSectionsByClass] = useState<{[key: string]: string[]}>({});
  const [loadingSections, setLoadingSections] = useState(false);

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

      // Load compatibility for each child profile (using new /analysis endpoint)
      const compatibilityData: {[key: string]: any} = {};
      for (const child of profili) {
        try {
          // Usa il nuovo endpoint /analysis con logica semplificata per medie
          const compRes = await axios.get(
            `${API_URL}/api/profiles/${storedUserId}/children/${child.id}/analysis`
          );
          compatibilityData[child.id] = compRes.data;
        } catch (e) {
          console.log(`Failed to load analysis for ${child.nome_figlio}`);
          // Fallback al vecchio endpoint se il nuovo fallisce
          try {
            const fallbackRes = await axios.get(
              `${API_URL}/api/profiles/${storedUserId}/children/${child.id}/compatibility`
            );
            compatibilityData[child.id] = fallbackRes.data;
          } catch (e2) {
            console.log(`Failed to load compatibility for ${child.nome_figlio}`);
          }
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
      
      // Load notifications - prima controlla le scadute
      try {
        // Controlla e processa notifiche scadute
        await axios.get(`${API_URL}/api/notifications/check-expired/${storedUserId}`);
        
        // Poi carica le notifiche aggiornate
        const notifResponse = await axios.get(`${API_URL}/api/notifications/${storedUserId}`);
        setNotifications(notifResponse.data.notifications || []);
        setUnreadCount(notifResponse.data.unread_count || 0);
      } catch (e) {
        console.log('Failed to load notifications');
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

  // Helper per ottenere scuole per tipo
  const getScuoleByTipo = () => {
    if (newProfile.tipo_scuola === 'primo_grado') {
      return SCUOLE_PRIMO_GRADO;
    } else {
      return SCUOLE_SECONDO_GRADO;
    }
  };

  const getClassi = () => {
    return getClassiByType(newProfile.tipo_scuola as 'primo_grado' | 'secondo_grado');
  };

  // Funzione per salvare nuovo profilo
  const saveNewProfile = async () => {
    if (!newProfile.nome_figlio.trim()) {
      if (Platform.OS === 'web') {
        window.alert('Inserisci il nome dell\'alunno');
      } else {
        Alert.alert('Errore', 'Inserisci il nome dell\'alunno');
      }
      return;
    }
    if (!newProfile.scuola) {
      if (Platform.OS === 'web') {
        window.alert('Seleziona la scuola');
      } else {
        Alert.alert('Errore', 'Seleziona la scuola');
      }
      return;
    }
    if (!newProfile.classe) {
      if (Platform.OS === 'web') {
        window.alert('Seleziona la classe');
      } else {
        Alert.alert('Errore', 'Seleziona la classe');
      }
      return;
    }
    if (!newProfile.sezione) {
      if (Platform.OS === 'web') {
        window.alert('Seleziona la sezione');
      } else {
        Alert.alert('Errore', 'Seleziona la sezione');
      }
      return;
    }

    setSavingProfile(true);
    try {
      await axios.post(`${API_URL}/api/profiles/${userId}/children`, newProfile);
      
      // Reset form
      setNewProfile({
        nome_figlio: '',
        tipo_scuola: 'primo_grado',
        scuola: '',
        codice_scuola: '',
        classe: '',
        sezione: '',
      });
      setAvailableSections([]);
      setSectionsByClass({});
      setShowAddProfileModal(false);
      
      // Ricarica dati
      loadData();
      
      if (Platform.OS === 'web') {
        window.alert('Profilo aggiunto con successo!');
      } else {
        Alert.alert('Successo', 'Profilo aggiunto con successo!');
      }
    } catch (error: any) {
      console.error('Error saving profile:', error);
      const message = error.response?.data?.detail || 'Errore nel salvataggio del profilo';
      if (Platform.OS === 'web') {
        window.alert(message);
      } else {
        Alert.alert('Errore', message);
      }
    } finally {
      setSavingProfile(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a472a" />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
      {/* Sezione Alunni - Cerchi con nome e info sotto */}
      <View style={styles.profileSelectorCard}>
        <Text style={styles.profileSelectorLabel}>Alunni</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.childTabs}>
            {/* Cerchio + per aggiungere profilo */}
            <View style={styles.childCircleContainer}>
              <TouchableOpacity
                style={styles.addProfileCircle}
                onPress={() => setShowAddProfileModal(true)}
              >
                <Ionicons name="add" size={36} color="#000" />
              </TouchableOpacity>
              <Text style={styles.addProfileText}>Aggiungi</Text>
            </View>
            
            {/* Profili esistenti */}
            {childProfiles.map((child) => {
              const isSelected = selectedChildId === child.id;
              const initial = child.nome_figlio?.charAt(0)?.toUpperCase() || '?';
              
              return (
                <View key={child.id} style={styles.childCircleContainer}>
                  {/* Cerchio con nome */}
                  <TouchableOpacity
                    style={[
                      styles.childCircle,
                      isSelected && styles.childCircleSelected
                    ]}
                    onPress={() => setSelectedChildId(child.id)}
                  >
                    <Text style={styles.childCircleInitial}>{initial}</Text>
                    <Text style={styles.childCircleName} numberOfLines={1}>
                      {child.nome_figlio}
                    </Text>
                  </TouchableOpacity>
                  
                  {/* Pulsante Info sotto il cerchio */}
                  <TouchableOpacity
                    style={[
                      styles.childInfoButtonNew,
                      isSelected && styles.childInfoButtonNewActive
                    ]}
                    onPress={() => router.push(`/student/${child.id}`)}
                  >
                    <Ionicons 
                      name="information-circle-outline" 
                      size={16} 
                      color={isSelected ? '#FF9800' : '#888'} 
                    />
                    <Text style={[
                      styles.childInfoText,
                      isSelected && styles.childInfoTextActive
                    ]}>
                      info
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>

      {/* Sezione Libri per il profilo selezionato */}
      {selectedChildId && childrenCompatibility[selectedChildId] && (() => {
        const compatibility = childrenCompatibility[selectedChildId];
        const child = childProfiles.find(c => c.id === selectedChildId);
        const isMedia = child?.tipo_scuola === 'primo_grado';
        const tipoLabel = isMedia ? 'MEDIA' : 'SUP';
        const tipoScuolaLabel = isMedia ? 'Scuola Media' : 'Scuola Superiore';
        
        return (
          <View style={styles.classCompatSection}>

            {/* Libri Vendibili */}
            {compatibility.vendere?.libri_vendibili && compatibility.vendere.libri_vendibili.length > 0 && (
              <View style={styles.classCard}>
                <Text style={styles.sectionTitleBlue}>
                  LIBRI VENDIBILI ({compatibility.vendere.libri_vendibili.length})
                </Text>
                <View style={styles.booksGrid}>
                  {compatibility.vendere.libri_vendibili.map((book: any, idx: number) => {
                    const coverUrl = book.isbn ? `https://www.ibs.it/images/${book.isbn}_0_0_0_536_0.jpg` : null;
                    const prezzoNuovo = book.prezzo_copertina || book.prezzo_ministeriale || 0;
                    const prezzoUsato = book.prezzo_consigliato || (prezzoNuovo * 0.6);
                    return (
                      <TouchableOpacity 
                        key={idx} 
                        style={[styles.sampleBookItem, styles.sampleBookItemClickable]}
                        onPress={() => router.push(`/sell-form?isbn=${book.isbn}&titolo=${encodeURIComponent(book.titolo || '')}&prezzo=${prezzoNuovo}`)}
                      >
                        {coverUrl && (
                          <Image 
                            source={{ uri: coverUrl }} 
                            style={styles.bookCoverImage}
                            resizeMode="contain"
                          />
                        )}
                        <View style={styles.bookDetailsContainer}>
                          <Text style={styles.sampleBookSubject}>{book.disciplina}</Text>
                          <Text style={styles.sampleBookTitle}>{book.titolo}</Text>
                          {book.autori && <Text style={styles.sampleBookAuthor}>{book.autori}</Text>}
                          {book.editore && <Text style={styles.sampleBookEdition}>{book.editore}</Text>}
                          {book.isbn && <Text style={styles.bookIsbnText}>ISBN: {book.isbn}</Text>}
                          <View style={styles.priceContainer}>
                            <View>
                              <Text style={styles.priceNewLabel}>Nuovo: <Text style={styles.priceNewValue}>€{prezzoNuovo.toFixed(2)}</Text></Text>
                              <Text style={styles.priceUsedLabel}>Vendi a: <Text style={styles.priceUsedValue}>€{prezzoUsato.toFixed(2)}</Text></Text>
                            </View>
                            <View style={{ alignItems: 'center' }}>
                              <View style={[styles.copieBadge, { backgroundColor: '#e3f2fd', borderColor: '#2196F3' }]}>
                                <Text style={[styles.copieBadgeText, { color: '#2196F3' }]}>vendibile</Text>
                              </View>
                            </View>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Libri Usati Disponibili - CON NUMERO COPIE E LINK */}
            {(() => {
              // Combina libri_usati + libri da "nuovi" che hanno copie usate disponibili
              const libriUsatiBase = compatibility.comprare?.libri_usati || [];
              const libriNuoviConUsati = (compatibility.nuovi?.libri || []).filter(
                (book: any) => book.copie_usate_disponibili > 0 && !book.is_nuova_edizione
              );
              const tuttiLibriUsati = [...libriUsatiBase, ...libriNuoviConUsati];
              
              if (tuttiLibriUsati.length === 0) return null;
              
              return (
                <View style={styles.classCard}>
                  <Text style={styles.sectionTitleGreen}>
                    LIBRI USATI ACQUISTABILI PER {child?.nome_figlio?.toUpperCase()}
                  </Text>
                  <View style={styles.booksGrid}>
                    {tuttiLibriUsati.map((book: any, idx: number) => {
                      const copie = book.copie_disponibili || book.copie_usate_disponibili || 0;
                      const coverUrl = book.isbn ? `https://www.ibs.it/images/${book.isbn}_0_0_0_536_0.jpg` : null;
                      const prezzoNuovo = book.prezzo_copertina || book.prezzo_ministeriale || 0;
                      const prezzoUsato = copie > 0 ? (book.prezzo_minimo_usato || book.prezzo_usato_minimo || (prezzoNuovo * 0.6)) : 0;
                      return (
                        <TouchableOpacity 
                          key={idx} 
                          style={[
                            styles.sampleBookItem,
                            copie > 0 && styles.sampleBookItemClickable
                          ]}
                          onPress={() => {
                            if (copie > 0 && book.isbn) {
                              router.push(`/book-sellers/${book.isbn}`);
                            }
                          }}
                          disabled={copie === 0}
                        >
                          {coverUrl && (
                            <Image 
                              source={{ uri: coverUrl }} 
                              style={styles.bookCoverImage}
                              resizeMode="contain"
                            />
                          )}
                          <View style={styles.bookDetailsContainer}>
                            <Text style={styles.sampleBookSubject}>{book.disciplina}</Text>
                            <Text style={styles.sampleBookTitle}>{book.titolo}</Text>
                            {book.autori && <Text style={styles.sampleBookAuthor}>{book.autori}</Text>}
                            {book.editore && <Text style={styles.sampleBookEdition}>{book.editore}</Text>}
                            {book.isbn && <Text style={styles.bookIsbnText}>ISBN: {book.isbn}</Text>}
                            <View style={styles.priceContainer}>
                              <View>
                                <Text style={styles.priceNewLabel}>Nuovo: <Text style={styles.priceNewValue}>€{prezzoNuovo.toFixed(2)}</Text></Text>
                                <Text style={styles.priceUsedLabel}>Usato da: <Text style={styles.priceUsedValue}>€{prezzoUsato.toFixed(2)}</Text></Text>
                              </View>
                              <View style={{ alignItems: 'center' }}>
                                <View style={[
                                  styles.copieBadge,
                                  copie > 0 ? styles.copieBadgeAvailable : styles.copieBadgeNone
                                ]}>
                                  <Text style={[
                                    styles.copieBadgeText,
                                    copie > 0 ? styles.copieBadgeTextAvailable : styles.copieBadgeTextNone
                                  ]}>
                                    {copie} {copie === 1 ? 'copia' : 'copie'}
                                  </Text>
                                </View>
                              </View>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {/* Pulsante Cerca questi libri */}
                  <TouchableOpacity
                    style={[styles.viewSellersButton, { backgroundColor: '#4CAF50', marginTop: 12 }]}
                    onPress={() => router.push('/(tabs)/search')}
                  >
                    <Ionicons name="search" size={18} color="#fff" />
                    <Text style={styles.viewSellersButtonText}>Cerca questi libri</Text>
                    <Ionicons name="arrow-forward" size={14} color="#fff" />
                  </TouchableOpacity>
                </View>
              );
            })()}

            {/* SEZIONE UNIFICATA: LIBRI NON VENDIBILI GIÀ IN TUO POSSESSO - ANCORA IN USO */}
            {(() => {
              // Combina libri non vendibili + libri già posseduti, rimuovendo duplicati per ISBN
              const libriNonVendibili = compatibility.vendere?.libri_non_vendibili || [];
              const libriGiaPosseduti = compatibility.libri_gia_posseduti || [];
              
              // Rimuovi duplicati usando ISBN come chiave
              const isbnVisti = new Set();
              const tuttiLibriInUso: any[] = [];
              
              // Prima aggiungi i già posseduti (priorità)
              for (const libro of libriGiaPosseduti) {
                const isbn = libro.isbn || libro.titolo;
                if (!isbnVisti.has(isbn)) {
                  isbnVisti.add(isbn);
                  tuttiLibriInUso.push(libro);
                }
              }
              
              // Poi aggiungi i non vendibili (solo se non già presenti)
              for (const libro of libriNonVendibili) {
                const isbn = libro.isbn || libro.titolo;
                if (!isbnVisti.has(isbn)) {
                  isbnVisti.add(isbn);
                  tuttiLibriInUso.push(libro);
                }
              }
              
              if (tuttiLibriInUso.length === 0) return null;
              
              return (
                <View style={[styles.classCard, { borderLeftColor: '#9C27B0', borderLeftWidth: 3 }]}>
                  <Text style={[styles.sectionTitlePurple, { marginBottom: 8 }]}>
                    LIBRI NON VENDIBILI GIÀ IN TUO POSSESSO - ANCORA IN USO ({tuttiLibriInUso.length})
                  </Text>
                  <View style={styles.booksGrid}>
                    {tuttiLibriInUso.map((book: any, idx: number) => {
                      const coverUrl = book.isbn ? `https://www.ibs.it/images/${book.isbn}_0_0_0_536_0.jpg` : null;
                      const prezzoNuovo = book.prezzo_copertina || book.prezzo_ministeriale || 0;
                      const copie = book.copie_disponibili || book.copie_usate_disponibili || 0;
                      const prezzoUsato = copie > 0 ? (book.prezzo_minimo_usato || book.prezzo_usato_minimo || (prezzoNuovo * 0.6)) : 0;
                      const isClickable = copie > 0 && book.isbn;
                      
                      const CardComponent = isClickable ? TouchableOpacity : View;
                      
                      return (
                        <CardComponent 
                          key={idx} 
                          style={[
                            styles.sampleBookItem,
                            isClickable && styles.sampleBookItemClickable
                          ]}
                          {...(isClickable ? {
                            onPress: () => router.push(`/book-sellers/${book.isbn}`)
                          } : {})}
                        >
                          {coverUrl && (
                            <Image 
                              source={{ uri: coverUrl }} 
                              style={styles.bookCoverImage}
                              resizeMode="contain"
                            />
                          )}
                          <View style={styles.bookDetailsContainer}>
                            <Text style={styles.sampleBookSubject}>{book.disciplina}</Text>
                            <Text style={styles.sampleBookTitle}>{book.titolo || book.titolo_vecchio}</Text>
                            {book.autori && <Text style={styles.sampleBookAuthor}>{book.autori}</Text>}
                            {book.editore && <Text style={styles.sampleBookEdition}>{book.editore}</Text>}
                            <View style={styles.priceContainer}>
                              <View>
                                <Text style={styles.priceNewLabel}>Nuovo: <Text style={styles.priceNewValue}>€{prezzoNuovo.toFixed(2)}</Text></Text>
                                <Text style={styles.priceUsedLabel}>Usato da: <Text style={styles.priceUsedValue}>€{prezzoUsato.toFixed(2)}</Text></Text>
                              </View>
                              <View style={{ alignItems: 'center' }}>
                                {copie > 0 ? (
                                  <View style={[styles.copieBadge, styles.copieBadgeAvailable]}>
                                    <Text style={[styles.copieBadgeText, styles.copieBadgeTextAvailable]}>
                                      {copie} {copie === 1 ? 'copia' : 'copie'}
                                    </Text>
                                  </View>
                                ) : (
                                  <Ionicons name="checkmark-circle" size={24} color="#9C27B0" />
                                )}
                              </View>
                            </View>
                          </View>
                        </CardComponent>
                      );
                    })}
                  </View>
                </View>
              );
            })()}

            {/* Libri NUOVI da acquistare (non trovabili usati) */}
            {(() => {
              const libriNuovi = compatibility.nuovi?.libri || [];
              
              if (libriNuovi.length === 0) return null;
              
              return (
                <View style={[styles.classCard, { borderLeftColor: '#F44336', borderLeftWidth: 3 }]}>
                  <Text style={styles.sectionTitleRed}>
                    LIBRI NUOVI DA ACQUISTARE ({libriNuovi.length})
                  </Text>
                  <Text style={{ fontSize: 11, color: '#D32F2F', marginBottom: 12, fontStyle: 'italic' }}>
                    Non disponibili usati - da comprare nuovi
                  </Text>
                  <View style={styles.booksGrid}>
                    {libriNuovi.map((book: any, idx: number) => {
                      const coverUrl = book.isbn ? `https://www.ibs.it/images/${book.isbn}_0_0_0_536_0.jpg` : null;
                      const prezzoNuovo = book.prezzo_copertina || book.prezzo_ministeriale || 0;
                      return (
                        <View key={idx} style={styles.sampleBookItem}>
                          {coverUrl && (
                            <Image 
                              source={{ uri: coverUrl }} 
                              style={styles.bookCoverImage}
                              resizeMode="contain"
                            />
                          )}
                          <View style={styles.bookDetailsContainer}>
                            <Text style={styles.sampleBookSubject}>{book.disciplina}</Text>
                            <Text style={styles.sampleBookTitle}>{book.titolo}</Text>
                            {book.autori && <Text style={styles.sampleBookAuthor}>{book.autori}</Text>}
                            {book.editore && <Text style={styles.sampleBookEdition}>{book.editore}</Text>}
                            <View style={styles.priceContainer}>
                              <View>
                                <Text style={styles.priceNewLabel}>Nuovo: <Text style={styles.priceNewValue}>€{prezzoNuovo.toFixed(2)}</Text></Text>
                                <Text style={{ fontSize: 12, color: '#F44336' }}>{book.motivo || 'Da acquistare nuovo'}</Text>
                              </View>
                              <View style={{ alignItems: 'center' }}>
                                <View style={[styles.copieBadge, { backgroundColor: '#ffebee', borderColor: '#F44336' }]}>
                                  <Text style={[styles.copieBadgeText, { color: '#F44336' }]}>nuovo</Text>
                                </View>
                              </View>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })()}
          </View>
        );
      })()}

      </ScrollView>

      {/* Modal Aggiungi Profilo */}
      <Modal
        visible={showAddProfileModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddProfileModal(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Aggiungi Alunno</Text>
              <TouchableOpacity 
                onPress={() => setShowAddProfileModal(false)}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={28} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
              {/* Nome Alunno */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabelLarge}>Nome Alunno *</Text>
                <TextInput
                  style={styles.formInputLarge}
                  placeholder="Es: Mario"
                  placeholderTextColor="#999"
                  value={newProfile.nome_figlio}
                  onChangeText={(value) => setNewProfile({ ...newProfile, nome_figlio: value })}
                  autoCapitalize="words"
                />
              </View>

              {/* Tipo Scuola */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabelLarge}>Tipo Scuola *</Text>
                <View style={styles.pickerContainerLarge}>
                  <Picker
                    selectedValue={newProfile.tipo_scuola}
                    onValueChange={(value) => setNewProfile({ 
                      ...newProfile, 
                      tipo_scuola: value, 
                      scuola: '',
                      codice_scuola: '',
                      classe: '',
                      sezione: ''
                    })}
                    style={styles.pickerLarge}
                  >
                    <Picker.Item label="Scuola Media" value="primo_grado" />
                    <Picker.Item label="Scuola Superiore" value="secondo_grado" />
                  </Picker>
                </View>
              </View>

              {/* Scuola */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabelLarge}>Scuola *</Text>
                <View style={styles.pickerContainerLarge}>
                  <Picker
                    selectedValue={newProfile.scuola}
                    onValueChange={async (value) => {
                      const scuolaSelezionata = getScuoleByTipo().find(s => s.nome === value);
                      const codice = scuolaSelezionata?.codice || '';
                      setNewProfile({ 
                        ...newProfile, 
                        scuola: value,
                        codice_scuola: codice,
                        classe: '',
                        sezione: ''
                      });
                      
                      // Carica sezioni dinamicamente
                      if (codice) {
                        setLoadingSections(true);
                        try {
                          const response = await axios.get(`${API_URL}/api/schools/${codice}/sections`);
                          setSectionsByClass(response.data.sezioni_per_classe || {});
                          setAvailableSections([]);
                        } catch (error) {
                          console.error('Error loading sections:', error);
                          setSectionsByClass({});
                        } finally {
                          setLoadingSections(false);
                        }
                      } else {
                        setSectionsByClass({});
                        setAvailableSections([]);
                      }
                    }}
                    style={styles.pickerLarge}
                  >
                    <Picker.Item label="Seleziona scuola..." value="" />
                    {getScuoleByTipo().map((scuola) => (
                      <Picker.Item key={scuola.codice} label={scuola.nome} value={scuola.nome} />
                    ))}
                  </Picker>
                </View>
              </View>

              {/* Classe */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabelLarge}>Classe *</Text>
                <View style={styles.pickerContainerLarge}>
                  <Picker
                    selectedValue={newProfile.classe}
                    onValueChange={(value) => {
                      setNewProfile({ ...newProfile, classe: value, sezione: '' });
                      // Aggiorna sezioni disponibili per questa classe
                      const sezioniPerClasse = sectionsByClass[value] || SEZIONI;
                      setAvailableSections(sezioniPerClasse);
                    }}
                    enabled={!!newProfile.codice_scuola}
                    style={styles.pickerLarge}
                  >
                    <Picker.Item label="Seleziona classe..." value="" />
                    {getClassi().map((c) => (
                      <Picker.Item key={c} label={`${c}°`} value={c} />
                    ))}
                  </Picker>
                </View>
              </View>

              {/* Sezione */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabelLarge}>
                  Sezione * {loadingSections && '(caricamento...)'}
                </Text>
                <View style={styles.pickerContainerLarge}>
                  <Picker
                    selectedValue={newProfile.sezione}
                    onValueChange={(value) => setNewProfile({ ...newProfile, sezione: value })}
                    enabled={!loadingSections && (availableSections.length > 0 || !!newProfile.classe)}
                    style={styles.pickerLarge}
                  >
                    <Picker.Item 
                      label={
                        loadingSections 
                          ? "Caricamento..." 
                          : !newProfile.classe
                            ? "Seleziona prima la classe"
                            : "Seleziona sezione..."
                      } 
                      value="" 
                    />
                    {(availableSections.length > 0 ? availableSections : SEZIONI).map((s) => (
                      <Picker.Item key={s} label={s} value={s} />
                    ))}
                  </Picker>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.saveProfileButton, savingProfile && styles.saveProfileButtonDisabled]}
                onPress={saveNewProfile}
                disabled={savingProfile}
              >
                {savingProfile ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={24} color="#fff" />
                    <Text style={styles.saveProfileButtonText}>Salva Profilo</Text>
                  </>
                )}
              </TouchableOpacity>

              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </>
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
    backgroundColor: '#f5f5f5',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#000',
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
  classCompatSubtitleBold: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
    marginLeft: 4,
  },
  classCompatSubtitleLight: {
    fontSize: 13,
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
  booksGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  sampleBooksTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  sectionTitleGreen: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a472a',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionTitleOrange: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF9800',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionTitlePurple: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#9C27B0',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionTitleBlue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2196F3',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionTitleRed: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#f44336',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sampleBookItem: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    flexDirection: 'row',
  },
  sampleBookItemClickable: {
    borderColor: '#1a472a',
    borderWidth: 1.5,
  },
  sampleBookUsable: {
    backgroundColor: '#e8f5e9',
    borderColor: '#4CAF50',
  },
  bookCoverImage: {
    width: 80,
    height: 110,
    borderRadius: 6,
    backgroundColor: '#f5f5f5',
  },
  bookDetailsContainer: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'space-between',
  },
  sampleBookInfo: {
    flex: 1,
  },
  sampleBookSubject: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  sampleBookTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
    lineHeight: 18,
  },
  sampleBookAuthor: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  sampleBookEdition: {
    fontSize: 11,
    color: '#888',
    marginBottom: 6,
  },
  priceContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  priceNewLabel: {
    fontSize: 13,
    color: '#666',
  },
  priceNewValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F44336',
  },
  priceUsedLabel: {
    fontSize: 13,
    color: '#666',
  },
  priceUsedValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#4CAF50',
  },
  isbnText: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
    fontFamily: 'monospace',
  },
  sampleBookSeller: {
    fontSize: 12,
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
    fontSize: 11,
    color: '#1976D2',
    fontWeight: '600',
  },
  sampleBookPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a472a',
    marginTop: 8,
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
  bookFlowColumnHeaderCompact: {
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  bookFlowColumnHeaderTextCompact: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
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
  bookFlowCenterBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FF9800',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookFlowCenterClass: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  // Child Profile Tabs
  childTabs: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 10,
  },
  childTabContainer: {
    flexDirection: 'row',
    alignItems: 'center',
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
  childInfoButton: {
    marginLeft: 6,
    padding: 6,
  },
  // Nuovo design cerchi Alunni
  childCircleContainer: {
    alignItems: 'center',
    marginRight: 16,
  },
  childCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  childCircleSelected: {
    borderColor: '#FF9800',
    borderWidth: 4,
  },
  childCircleInitial: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  childCircleName: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
    maxWidth: 70,
    textAlign: 'center',
  },
  childInfoButtonNew: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    gap: 4,
  },
  childInfoButtonNewActive: {
    backgroundColor: '#fff3e0',
  },
  childInfoText: {
    fontSize: 12,
    color: '#888',
  },
  childInfoTextActive: {
    color: '#FF9800',
    fontWeight: '600',
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
  // Cerchio + Aggiungi Profilo
  addProfileCircle: {
    width: 65,
    height: 65,
    borderRadius: 35,
    backgroundColor: '#FF9800',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  addProfileText: {
    fontSize: 11,
    color: '#FF9800',
    fontWeight: '600',
    marginTop: 6,
  },
  // ISBN Text
  bookIsbnText: {
    fontSize: 11,
    color: '#888',
    fontFamily: 'monospace',
    marginTop: 4,
    marginBottom: 6,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  modalCloseButton: {
    padding: 4,
  },
  modalScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  formGroup: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  formLabelLarge: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a472a',
    marginBottom: 12,
  },
  formInputLarge: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 18,
    fontSize: 20,
    color: '#333',
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  pickerContainerLarge: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    overflow: 'hidden',
  },
  pickerLarge: {
    fontSize: 18,
    height: 60,
    color: '#333',
  },
  tipoScuolaButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  tipoScuolaButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
  },
  tipoScuolaButtonActive: {
    borderColor: '#FF9800',
    backgroundColor: '#fff3e0',
  },
  tipoScuolaButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
  tipoScuolaButtonTextActive: {
    color: '#FF9800',
  },
  classeButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  classeButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
  },
  classeButtonActive: {
    borderColor: '#1a472a',
    backgroundColor: '#e8f5e9',
  },
  classeButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#666',
  },
  classeButtonTextActive: {
    color: '#1a472a',
  },
  saveProfileButton: {
    backgroundColor: '#1a472a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 14,
    marginTop: 20,
    gap: 10,
  },
  saveProfileButtonDisabled: {
    opacity: 0.7,
  },
  saveProfileButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
