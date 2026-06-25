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
  useWindowDimensions,
} from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import CustomPicker from '../../src/components/CustomPicker';
import { SCUOLE_PRIMO_GRADO, SCUOLE_SECONDO_GRADO, getClassiByType, SEZIONI } from '../../src/constants/schools';
import { useProfileStore } from '../../src/store/profileStore';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Colori per le scuole - assegna un colore unico ad ogni scuola
const SCHOOL_COLORS: { [key: string]: string } = {};
const COLOR_PALETTE = [
  '#FF6B6B', // Rosso corallo
  '#4ECDC4', // Turchese
  '#45B7D1', // Azzurro
  '#96CEB4', // Verde menta
  '#FFEAA7', // Giallo pastello
  '#DDA0DD', // Viola chiaro
  '#98D8C8', // Verde acqua
  '#F7DC6F', // Giallo oro
  '#BB8FCE', // Lilla
  '#85C1E9', // Celeste
  '#F8B500', // Arancione
  '#00CED1', // Ciano scuro
  '#FF7F50', // Corallo
  '#9B59B6', // Viola
  '#1ABC9C', // Smeraldo
];

const getSchoolColor = (codiceScuola: string): string => {
  if (!codiceScuola) return '#FF9800'; // Default arancione
  
  if (!SCHOOL_COLORS[codiceScuola]) {
    const colorIndex = Object.keys(SCHOOL_COLORS).length % COLOR_PALETTE.length;
    SCHOOL_COLORS[codiceScuola] = COLOR_PALETTE[colorIndex];
  }
  return SCHOOL_COLORS[codiceScuola];
};

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

// Strumenti musicali da nascondere nella Home (ma restano vendibili)
const STRUMENTI_MUSICALI = ['chitarra', 'flauto', 'violino', 'pianoforte', 'pianistica', 'piano'];

// Filtra libri di strumenti musicali dalla visualizzazione
const filterOutStrumentiMusicali = (books: any[]): any[] => {
  if (!books || !Array.isArray(books)) return [];
  return books.filter(book => {
    const disciplina = (book.disciplina || '').toLowerCase();
    const titolo = (book.titolo || '').toLowerCase();
    // Nascondi se disciplina O titolo contiene uno strumento musicale
    const isStrumentoMusicale = STRUMENTI_MUSICALI.some(strumento => 
      disciplina.includes(strumento) || titolo.includes(strumento)
    );
    return !isStrumentoMusicale;
  });
};

// Semplifica i nomi delle lingue
const semplificaLingua = (disciplina: string): string => {
  if (!disciplina) return disciplina;
  const d = disciplina.toUpperCase();
  
  // Estrai la lingua principale
  if (d.includes('FRANCESE')) return 'FRANCESE';
  if (d.includes('INGLESE')) return 'INGLESE';
  if (d.includes('SPAGNOLO')) return 'SPAGNOLO';
  if (d.includes('TEDESCO')) return 'TEDESCO';
  if (d.includes('PORTOGHESE')) return 'PORTOGHESE';
  if (d.includes('CINESE')) return 'CINESE';
  if (d.includes('RUSSO')) return 'RUSSO';
  if (d.includes('ARABO')) return 'ARABO';
  if (d.includes('GIAPPONESE')) return 'GIAPPONESE';
  
  return disciplina;
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
  const { scrollTo, childId, ts, t } = useLocalSearchParams<{ scrollTo?: string; childId?: string; ts?: string; t?: string }>();
  const { width } = useWindowDimensions();
  const isDesktop = width > 768; // Desktop se larghezza > 768px
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [radarData, setRadarData] = useState<RadarData | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [childProfiles, setChildProfiles] = useState<any[]>([]);
  const [childrenCompatibility, setChildrenCompatibility] = useState<{[key: string]: any}>({});
  
  // Usa Zustand per persistere selectedChildId tra navigazioni
  const { selectedChildId, setSelectedChildId } = useProfileStore();
  
  // New state for purchasable books
  const [totalePiattaforma, setTotalePiattaforma] = useState(0);
  const [libriPerProfilo, setLibriPerProfilo] = useState<{[key: string]: any}>({});
  
  // Cart state
  const [cartData, setCartData] = useState<CartData | null>(null);
  
  // Navigazione anonima
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  
  // Modal informativo per Libri Vendibili
  const [showVendibiliInfo, setShowVendibiliInfo] = useState(false);
  
  // Tab categoria libri selezionata
  const [selectedBookCategory, setSelectedBookCategory] = useState<string>('vendibili');

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

  // Effetto per reagire al cambio di childId dall'URL
  useEffect(() => {
    if (childId && childProfiles.length > 0) {
      const profileExists = childProfiles.some((p: any) => p.id === childId);
      if (profileExists) {
        setSelectedChildId(childId);
      }
    }
  }, [childId, t, childProfiles]);

  const loadData = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      const storedPremium = await AsyncStorage.getItem('is_premium');
      
      // NAVIGAZIONE ANONIMA: Se non c'è user_id, carica profili temporanei da localStorage
      if (!storedUserId) {
        setIsAnonymous(true);
        // Carica profili temporanei salvati localmente
        const tempProfiles = await AsyncStorage.getItem('temp_profiles');
        if (tempProfiles) {
          const profiles = JSON.parse(tempProfiles);
          setChildProfiles(profiles);
          
          // Carica compatibility per profili temporanei
          const compatibilityData: {[key: string]: any} = {};
          for (const child of profiles) {
            try {
              // Usa endpoint pubblico per profili anonimi
              console.log(`Loading analysis for ${child.nome_figlio}: ${child.codice_scuola}/${child.classe}/${child.sezione}`);
              const compRes = await axios.get(
                `${API_URL}/api/public/analysis/${child.codice_scuola}/${child.classe}/${child.sezione}`
              );
              console.log(`Analysis loaded for ${child.nome_figlio}, fuori_corso:`, compRes.data.fuori_corso?.length || 0);
              compatibilityData[child.id] = compRes.data;
            } catch (e) {
              console.log(`Failed to load analysis for temp profile ${child.nome_figlio}:`, e);
            }
          }
          setChildrenCompatibility(compatibilityData);
          
          // Seleziona primo profilo se non c'è selezione
          if (profiles.length > 0 && !selectedChildId) {
            setSelectedChildId(profiles[0].id);
          }
        }
        setLoading(false);
        return;
      }
      
      setIsAnonymous(false);
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
      
      // Select child - PRIORITÀ: childId dall'URL (letto direttamente)
      if (profili.length > 0) {
        // Leggi childId direttamente dall'URL in questo momento
        const urlParams = new URLSearchParams(window?.location?.search || '');
        const urlChildId = urlParams.get('childId');
        
        if (urlChildId) {
          const profileExists = profili.some((p: any) => p.id === urlChildId);
          if (profileExists) {
            setSelectedChildId(urlChildId);
          } else {
            setSelectedChildId(profili[0].id);
          }
        } else if (!selectedChildId || !profili.some((p: any) => p.id === selectedChildId)) {
          // Solo se non c'è un selectedChildId valido, usa il primo
          setSelectedChildId(profili[0].id);
        }
        // Altrimenti mantieni il selectedChildId corrente
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
    // BLOCCO SECONDO PROFILO PER UTENTI ANONIMI
    if (isAnonymous && childProfiles.length >= 1) {
      setShowAddProfileModal(false);
      setShowRegisterModal(true);
      return;
    }
    
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
      // Se utente anonimo, salva in localStorage invece che nel backend
      if (isAnonymous) {
        const profileToSave = {
          id: Date.now().toString(),
          nome_figlio: newProfile.nome_figlio,
          tipo_scuola: newProfile.tipo_scuola,
          scuola: newProfile.scuola,
          codice_scuola: newProfile.codice_scuola,
          classe: newProfile.classe,
          sezione: newProfile.sezione,
        };
        
        const existingProfiles = await AsyncStorage.getItem('temp_profiles');
        const profiles = existingProfiles ? JSON.parse(existingProfiles) : [];
        profiles.push(profileToSave);
        await AsyncStorage.setItem('temp_profiles', JSON.stringify(profiles));
        
        // Aggiorna lo stato locale
        setChildProfiles(profiles);
        setSelectedChildId(profileToSave.id);
        
        // Carica l'analisi per il nuovo profilo
        try {
          const compRes = await axios.get(
            `${API_URL}/api/public/analysis/${newProfile.codice_scuola}/${newProfile.classe}/${newProfile.sezione}`
          );
          setChildrenCompatibility(prev => ({
            ...prev,
            [profileToSave.id]: compRes.data
          }));
        } catch (e) {
          console.log('Failed to load analysis for temp profile');
        }
        
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
        
        if (Platform.OS === 'web') {
          window.alert('Profilo aggiunto! Registrati per salvarlo definitivamente.');
        } else {
          Alert.alert('Successo', 'Profilo aggiunto! Registrati per salvarlo definitivamente.');
        }
        return;
      }
      
      await axios.post(`${API_URL}/api/users/${userId}/profiles`, newProfile);
      
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
      {/* Sezione Alunni con sfondo arancione - COMPATTA */}
      <View style={styles.profileSelectorCardCompact}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.childTabsCompact}>
            {/* Rettangolo + per aggiungere profilo */}
            <TouchableOpacity
              style={styles.addProfileRectCompact}
              onPress={() => setShowAddProfileModal(true)}
            >
              <Ionicons name="add" size={24} color="#1a472a" />
              <Text style={styles.addProfileRectTextCompact}>Aggiungi</Text>
            </TouchableOpacity>
            
            {/* Profili esistenti - Rettangoli compatti */}
            {childProfiles.map((child) => {
              const isSelected = selectedChildId === child.id;
              const schoolColor = getSchoolColor(child.codice_scuola);
              const classeLabel = child.classe ? `${child.classe}ª` : '';
              const sezioneLabel = child.sezione || '';
              
              return (
                <TouchableOpacity
                  key={child.id}
                  style={[
                    styles.childRectCompact,
                    { borderColor: schoolColor, borderWidth: 3 },
                    isSelected && styles.childRectSelectedCompact
                  ]}
                  onPress={() => setSelectedChildId(child.id)}
                >
                  <Text style={styles.childRectNameCompact}>{child.nome_figlio}</Text>
                  <Text style={styles.childRectClasseCompact}>{classeLabel} {sezioneLabel}</Text>
                  <Text style={styles.childRectSchoolCompact} numberOfLines={2}>
                    {child.scuola}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </View>

      {/* Barra Dettagli Scuola e Spesa - Con nome profilo */}
      {selectedChildId && (() => {
        const selectedChild = childProfiles.find(c => c.id === selectedChildId);
        return (
          <TouchableOpacity 
            style={styles.detailsBar}
            onPress={() => router.push(`/student/${selectedChildId}`)}
            activeOpacity={0.7}
          >
            <Ionicons name="school-outline" size={20} color="#1a472a" />
            <Text style={styles.detailsBarText}>
              <Text style={styles.detailsBarName}>{selectedChild?.nome_figlio}</Text> - Lista dei libri
            </Text>
            <Ionicons name="chevron-forward" size={20} color="#1a472a" />
          </TouchableOpacity>
        );
      })()}

      {/* Sezione Libri per il profilo selezionato */}
      {selectedChildId && childrenCompatibility[selectedChildId] && (() => {
        const compatibility = childrenCompatibility[selectedChildId];
        const child = childProfiles.find(c => c.id === selectedChildId);
        const isMedia = child?.tipo_scuola === 'primo_grado';
        const tipoLabel = isMedia ? 'MEDIA' : 'SUP';
        const tipoScuolaLabel = isMedia ? 'Scuola Media' : 'Scuola Superiore';
        
        return (
          <View style={styles.classCompatSection}>

            {/* TABS CATEGORIE LIBRI - Riga orizzontale scorrevole */}
            {(() => {
              const vendibiliFiltered = filterOutStrumentiMusicali(compatibility.vendibili_usati || []);
              const usatiFiltered = filterOutStrumentiMusicali(compatibility.da_acquistare_usati || []);
              const nuoviFiltered = filterOutStrumentiMusicali(compatibility.da_acquistare_nuovi || []);
              const inUsoFiltered = filterOutStrumentiMusicali(compatibility.ancora_in_uso || []);
              const fuoriCorsoFiltered = filterOutStrumentiMusicali(compatibility.fuori_corso || []);
              
              const categories = [
                { id: 'vendibili', label: 'Vendibili', count: vendibiliFiltered.length, color: '#2196F3', books: vendibiliFiltered },
                { id: 'usati', label: 'Comprare Usati', count: usatiFiltered.length, color: '#4CAF50', books: usatiFiltered },
                { id: 'nuovi', label: 'Comprare Nuovi', count: nuoviFiltered.length, color: '#FF9800', books: nuoviFiltered },
                { id: 'inuso', label: 'Ancora in Uso', count: inUsoFiltered.length, color: '#9C27B0', books: inUsoFiltered },
                { id: 'fuoricorso', label: 'Fuori Corso', count: fuoriCorsoFiltered.length, color: '#795548', books: fuoriCorsoFiltered },
              ].filter(cat => cat.count > 0);
              
              const currentCategory = categories.find(c => c.id === selectedBookCategory) || categories[0];
              
              return (
                <>
                  {/* Barra tabs scorrevole */}
                  <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false}
                    style={styles.categoryTabsContainer}
                    contentContainerStyle={styles.categoryTabsContent}
                  >
                    {categories.map((cat) => (
                      <TouchableOpacity
                        key={cat.id}
                        style={[
                          styles.categoryTab,
                          selectedBookCategory === cat.id && styles.categoryTabSelected,
                          selectedBookCategory === cat.id && { borderBottomColor: cat.color }
                        ]}
                        onPress={() => setSelectedBookCategory(cat.id)}
                      >
                        <Text style={[
                          styles.categoryTabText,
                          selectedBookCategory === cat.id && styles.categoryTabTextSelected,
                          selectedBookCategory === cat.id && { color: cat.color }
                        ]}>
                          {cat.label} ({cat.count})
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  
                  {/* Contenuto della categoria selezionata */}
                  <View style={[styles.booksGrid, isDesktop && styles.booksGridDesktop]}>
                    {currentCategory && currentCategory.books.map((book: any, idx: number) => {
                      const coverUrl = book.isbn ? `https://www.ibs.it/images/${book.isbn}_0_0_0_536_0.jpg` : null;
                      const prezzoNuovo = Number(book.prezzo) || Number(book.prezzo_copertina) || 0;
                      const prezzoUsato = Number(book.prezzo_usato) || Number(book.prezzo_vendita_consigliato) || (prezzoNuovo * 0.5);
                      const copieDisponibili = book.venditori_disponibili || 0;
                      const risparmio = Number(book.risparmio) || (prezzoNuovo - prezzoUsato);
                      
                      // Determina azione e stile in base alla categoria
                      const isVendibile = currentCategory.id === 'vendibili';
                      const isUsato = currentCategory.id === 'usati';
                      const isNuovo = currentCategory.id === 'nuovi';
                      const isInUso = currentCategory.id === 'inuso';
                      const isFuoriCorso = currentCategory.id === 'fuoricorso';
                      
                      const handlePress = () => {
                        // Se utente anonimo e azione protetta, vai alla registrazione
                        if (isAnonymous && (isVendibile || isUsato)) {
                          router.push('/(auth)/register');
                          return;
                        }
                        
                        if (isVendibile) {
                          router.push(`/sell-form?isbn=${book.isbn}&titolo=${encodeURIComponent(book.titolo || '')}&prezzo=${prezzoNuovo}`);
                        } else if (isUsato) {
                          router.push(`/book-sellers/${book.isbn}`);
                        }
                        // nuovi, inuso e fuoricorso non hanno azione
                      };
                      
                      return (
                        <TouchableOpacity 
                          key={idx} 
                          style={[
                            styles.sampleBookItem, 
                            isDesktop && styles.sampleBookItemDesktop,
                            (isVendibile || isUsato) && styles.sampleBookItemClickable,
                            (isInUso || isFuoriCorso) && { opacity: 0.7 }
                          ]}
                          onPress={handlePress}
                          disabled={isNuovo || isInUso || isFuoriCorso}
                        >
                          {/* NUOVA STRUTTURA: Materia + Badge in alto sulla stessa riga */}
                          <View style={styles.bookCardContent}>
                            {/* Riga superiore: solo MATERIA */}
                            <Text style={styles.bookSubjectTop}>{semplificaLingua(book.disciplina)}</Text>
                            
                            {/* Riga centrale: Copertina GRANDE + Info */}
                            <View style={styles.bookMainRow}>
                              {/* Copertina a sinistra - INGRANDITA */}
                              <View style={styles.bookCoverColumn}>
                                {coverUrl ? (
                                  <Image source={{ uri: coverUrl }} style={styles.bookCoverImageBig} resizeMode="contain" />
                                ) : (
                                  <Image source={require('../../assets/images/ribook-logo.png')} style={styles.bookCoverImageBig} resizeMode="contain" />
                                )}
                              </View>
                              
                              {/* Info a destra della copertina - senza badge, tutto in alto */}
                              <View style={styles.bookInfoColumn}>
                                <Text style={styles.bookTitleCompact} numberOfLines={2}>{book.titolo}</Text>
                                {book.autori && <Text style={styles.bookMetaText} numberOfLines={1}>{book.autori}</Text>}
                                {book.editore && <Text style={styles.bookMetaLabel}>{book.editore}</Text>}
                                {book.volume && (
                                  <Text style={styles.bookVolumeText}>
                                    Volume: {book.volume === 'U' ? 'Unico' : book.volume}
                                  </Text>
                                )}
                                <Text style={styles.bookIsbnText}>ISBN: {book.isbn}</Text>
                              </View>
                            </View>
                            
                            {/* Riga inferiore: Copie + Prezzi */}
                            <View style={styles.priceRowBottom}>
                              {/* Badge copie a sinistra - con ECCEZIONALMENTE se applicabile */}
                              {isUsato && (
                                <View style={[
                                  styles.copieInlineGreen, 
                                  copieDisponibili === 0 && styles.copieInlineGray,
                                  book.eccezionale && styles.copieInlineOrange
                                ]}>
                                  <Ionicons name={book.eccezionale ? "star" : "people"} size={14} color="#fff" />
                                  <Text style={styles.copieInlineText}>
                                    {book.eccezionale ? 'ECCEZ. ' : ''}{copieDisponibili} {copieDisponibili === 1 ? 'copia' : 'copie'}
                                  </Text>
                                </View>
                              )}
                              {/* Spacer per spingere i prezzi a destra */}
                              <View style={{ flex: 1 }} />
                              {/* Prezzi a destra */}
                              {isVendibile && (
                                <>
                                  <Text style={styles.priceNewBig}>€{prezzoNuovo.toFixed(2)}</Text>
                                  <Text style={styles.priceTagSell}>Vendi €{prezzoUsato.toFixed(2)}</Text>
                                </>
                              )}
                              {isUsato && (
                                <>
                                  <Text style={styles.priceStrikethrough}>€{prezzoNuovo.toFixed(2)}</Text>
                                  <Text style={styles.priceUsedBig}>€{prezzoUsato.toFixed(2)}</Text>
                                  <Text style={styles.priceSaving}>-€{risparmio.toFixed(2)}</Text>
                                </>
                              )}
                              {isNuovo && (
                                <>
                                  <Text style={styles.priceNewBig}>€{prezzoNuovo.toFixed(2)}</Text>
                                </>
                              )}
                              {(isInUso || isFuoriCorso) && (
                                <Text style={styles.bookMetaLabel}>{isFuoriCorso ? 'Non più richiesto' : 'Ancora in uso'}</Text>
                              )}
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
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
                <CustomPicker
                  selectedValue={newProfile.tipo_scuola}
                  onValueChange={(value) => setNewProfile({ 
                    ...newProfile, 
                    tipo_scuola: value, 
                    scuola: '',
                    codice_scuola: '',
                    classe: '',
                    sezione: ''
                  })}
                  options={[
                    { label: 'Scuola Media', value: 'primo_grado' },
                    { label: 'Scuola Superiore', value: 'secondo_grado' },
                  ]}
                  placeholder="Seleziona tipo scuola..."
                />
              </View>

              {/* Scuola */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabelLarge}>Scuola *</Text>
                <CustomPicker
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
                  options={getScuoleByTipo().map((scuola) => ({
                    label: scuola.nome,
                    value: scuola.nome
                  }))}
                  placeholder="Seleziona scuola..."
                />
              </View>

              {/* Classe */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabelLarge}>Classe *</Text>
                <CustomPicker
                  selectedValue={newProfile.classe}
                  onValueChange={(value) => {
                    setNewProfile({ ...newProfile, classe: value, sezione: '' });
                    // Aggiorna sezioni disponibili per questa classe
                    const sezioniPerClasse = sectionsByClass[value] || SEZIONI;
                    setAvailableSections(sezioniPerClasse);
                  }}
                  enabled={!!newProfile.codice_scuola}
                  options={getClassi().map((c) => ({
                    label: `${c}°`,
                    value: c
                  }))}
                  placeholder="Seleziona classe..."
                />
              </View>

              {/* Sezione */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabelLarge}>
                  Sezione * {loadingSections && '(caricamento...)'}
                </Text>
                <CustomPicker
                  selectedValue={newProfile.sezione}
                  onValueChange={(value) => setNewProfile({ ...newProfile, sezione: value })}
                  enabled={!loadingSections && !!newProfile.classe}
                  loading={loadingSections}
                  options={(availableSections.length > 0 ? availableSections : SEZIONI).map((s) => ({
                    label: s,
                    value: s
                  }))}
                  placeholder={
                    loadingSections 
                      ? "Caricamento..." 
                      : !newProfile.classe
                        ? "Seleziona prima la classe"
                        : "Seleziona sezione..."
                  }
                />
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

      {/* Modal Informativo Libri Vendibili */}
      <Modal
        visible={showVendibiliInfo}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowVendibiliInfo(false)}
      >
        <View style={styles.infoModalOverlay}>
          <View style={styles.infoModalContent}>
            <View style={styles.infoModalHeader}>
              <Ionicons name="information-circle" size={32} color="#2196F3" />
              <Text style={styles.infoModalTitle}>Libri Vendibili</Text>
            </View>
            <Text style={styles.infoModalText}>
              LIBRI PRESUMIBILMENTE GIÀ IN TUO POSSESSO, NON UTILIZZABILI QUEST'ANNO.
            </Text>
            <Text style={styles.infoModalSubtext}>
              I testi sono aggiornati con i dati forniti dal MIUR, potrebbe comunque esserci un margine d'errore. Se qualche dato non ti sembra attendibile utilizza la sezione VENDI e carica i testi in sicurezza.
            </Text>
            <TouchableOpacity 
              style={styles.infoModalButton}
              onPress={() => setShowVendibiliInfo(false)}
            >
              <Text style={styles.infoModalButtonText}>Ho capito</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal Richiesta Registrazione per utenti anonimi */}
      <Modal
        visible={showRegisterModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowRegisterModal(false)}
      >
        <View style={styles.registerModalOverlay}>
          <View style={styles.registerModalContent}>
            <TouchableOpacity 
              style={styles.registerModalClose}
              onPress={() => setShowRegisterModal(false)}
            >
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
            
            <View style={styles.registerModalIcon}>
              <Ionicons name="person-add" size={48} color="#1a472a" />
            </View>
            
            <Text style={styles.registerModalTitle}>Registrati per continuare</Text>
            
            <Text style={styles.registerModalText}>
              Per vendere o acquistare libri usati devi creare un account gratuito.
            </Text>
            
            <Text style={styles.registerModalBenefits}>
              ✓ Vendi i tuoi libri e guadagna{'\n'}
              ✓ Acquista libri usati a metà prezzo{'\n'}
              ✓ Ricevi pagamenti sul tuo IBAN
            </Text>
            
            <TouchableOpacity
              style={styles.registerModalButton}
              onPress={() => {
                setShowRegisterModal(false);
                router.push('/(auth)/register');
              }}
            >
              <Ionicons name="person-add-outline" size={20} color="#fff" />
              <Text style={styles.registerModalButtonText}>Registrati ora</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.registerModalLoginLink}
              onPress={() => {
                setShowRegisterModal(false);
                router.push('/(auth)/login');
              }}
            >
              <Text style={styles.registerModalLoginText}>
                Hai già un account? <Text style={styles.registerModalLoginBold}>Accedi</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </View>
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
  // Stili per tabs categorie libri
  categoryTabsContainer: {
    marginBottom: 12,
  },
  categoryTabsContent: {
    paddingRight: 16,
    gap: 8,
  },
  categoryTab: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  categoryTabSelected: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  categoryTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  categoryTabTextSelected: {
    fontWeight: 'bold',
  },
  infoIconTab: {
    paddingHorizontal: 8,
    justifyContent: 'center',
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
    flexDirection: 'column',  // Mobile: 1 colonna
  },
  booksGridDesktop: {
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
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a472a',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionTitleOrange: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FF9800',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionTitlePurple: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#9C27B0',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionTitleBlue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2196F3',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitleRed: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#f44336',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Nuova struttura card libro compatta per mobile
  sampleBookItem: {
    width: '100%',  // Mobile: 1 colonna
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    flexDirection: 'row',
  },
  sampleBookItemDesktop: {
    width: '48%',  // Desktop: 2 colonne
    padding: 14,
  },
  sampleBookItemClickable: {
    borderColor: '#1a472a',
    borderWidth: 1.5,
  },
  // NUOVO LAYOUT CARD
  bookCardContent: {
    flex: 1,
  },
  // Materia in alto a sinistra - senza badge
  bookSubjectTop: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1a472a',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  // Riga principale: copertina + info
  bookMainRow: {
    flexDirection: 'row',
  },
  // Colonna copertina - INGRANDITA
  bookCoverColumn: {
    alignItems: 'center',
    marginRight: 12,
  },
  bookCoverImageBig: {
    width: 95,
    height: 130,
    borderRadius: 4,
    backgroundColor: '#f5f5f5',
  },
  // Colonna info a destra
  bookInfoColumn: {
    flex: 1,
  },
  bookTitleCompact: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    lineHeight: 17,
    marginBottom: 2,
  },
  bookMetaText: {
    fontSize: 11,
    color: '#555',
  },
  bookMetaLabel: {
    fontSize: 11,
    color: '#777',
  },
  bookVolumeText: {
    fontSize: 11,
    color: '#555',
  },
  bookIsbnText: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
  },
  // Riga prezzi in basso - con copie a sinistra e prezzi a destra
  priceRowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  // Badge copie inline (verde, a sinistra nella riga prezzi)
  copieInlineGreen: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  copieInlineGray: {
    backgroundColor: '#999',
  },
  copieInlineOrange: {
    backgroundColor: '#FF8C00',
  },
  copieInlineText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  priceStrikethrough: {
    fontSize: 12,
    color: '#999',
    textDecorationLine: 'line-through',
  },
  priceUsedBig: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  priceNewBig: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  priceSaving: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  priceTagSell: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  sampleBookUsable: {
    backgroundColor: '#e8f5e9',
    borderColor: '#4CAF50',
  },
  // Riga superiore: copertina + materia + prezzi
  bookTopRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  // Copertina più grande
  bookCoverSection: {
    alignItems: 'center',
    marginRight: 12,
  },
  bookCoverImage: {
    width: 70,
    height: 95,
    borderRadius: 4,
    backgroundColor: '#f5f5f5',
  },
  // Container prezzi sotto copertina
  priceUnderCover: {
    marginTop: 4,
    alignItems: 'center',
  },
  priceTagNew: {
    fontSize: 10,
    color: '#666',
  },
  priceTagUsed: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  priceTagSell: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  vendorsCount: {
    fontSize: 11,
    color: '#FF9800',
    marginTop: 2,
  },
  // Sezione destra: materia + dettagli libro - compatta
  bookInfoSection: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  // Materia in alto - più visibile
  bookSubjectBig: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1a472a',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  // Badge categoria - più compatto
  bookCategoryBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 4,
  },
  bookCategoryText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  // Dettagli libro compatti - senza margini inutili
  bookDetailsCompact: {
    marginTop: 0,
  },
  bookTitleCompact: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    lineHeight: 17,
    marginBottom: 2,
  },
  bookMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 2,
  },
  bookMetaText: {
    fontSize: 11,
    color: '#555',
  },
  bookMetaLabel: {
    fontSize: 11,
    color: '#777',
  },
  bookIsbnText: {
    fontSize: 10,
    color: '#888',
    marginTop: 1,
  },
  bookVolumeText: {
    fontSize: 11,
    color: '#1a472a',
    fontWeight: '600',
    marginTop: 2,
  },
  // Stili per riga prezzi compatta - inline con il contenuto
  priceRowCompact: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  priceStrikethrough: {
    fontSize: 13,
    color: '#999',
    textDecorationLine: 'line-through',
  },
  priceUsedBig: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4CAF50',
  },
  priceSaving: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
  },
  priceNewBig: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FF9800',
  },
  // Badge copie disponibili sotto copertina
  copieDisponibiliBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 4,
    gap: 3,
  },
  copieDisponibiliText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
  copieZeroBadge: {
    backgroundColor: '#9e9e9e',
  },
  // Vecchi stili mantenuti per compatibilità
  bookCoverContainer: {
    alignItems: 'center',
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
    fontSize: 14,
    fontWeight: '700',
    color: '#1a472a',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  sampleBookTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
    lineHeight: 16,
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
  // Nuovo design rettangoli Alunni
  addProfileRect: {
    width: 80,
    height: 140,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ccc',
    borderStyle: 'dashed',
    marginRight: 12,
  },
  addProfileRectText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1a472a',
    marginTop: 6,
  },
  childRect: {
    width: 150,
    height: 140,
    borderRadius: 12,
    backgroundColor: '#fff',
    padding: 12,
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    justifyContent: 'space-between',
  },
  childRectSelected: {
    backgroundColor: '#f0fff0',
    shadowOpacity: 0.25,
  },
  childRectName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a472a',
  },
  childRectClasse: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  childRectSezione: {
    fontSize: 14,
    fontWeight: '500',
    color: '#444',
  },
  childRectInfo: {
    fontSize: 13,
    fontWeight: '500',
    color: '#333',
  },
  childRectSchool: {
    fontSize: 11,
    fontWeight: '500',
    color: '#666',
    lineHeight: 14,
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
  // Barra Dettagli Scuola e Spesa
  detailsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e8f5e9',
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  detailsBarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a472a',
    flex: 1,
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
    fontSize: 20,
    fontWeight: '700',
    color: '#1a472a',
    marginBottom: 12,
    textShadowColor: 'rgba(255,255,255,0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
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
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  bookCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  bookDiscipline: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1a472a',
    textTransform: 'uppercase',
  },
  conditionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: '#666',
  },
  conditionText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
  bookTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  bookPublisher: {
    fontSize: 11,
    color: '#666',
    marginBottom: 6,
  },
  bookPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  bookPriceOld: {
    fontSize: 11,
    color: '#999',
    textDecorationLine: 'line-through',
  },
  bookPrice: {
    fontSize: 18,
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
    backgroundColor: '#FFE4C4',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    borderRadius: 16,
    padding: 16,
    paddingBottom: 20,
    overflow: 'hidden',
    minHeight: 200,
    position: 'relative',
  },
  profileSelectorBgLogo: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    bottom: 20,
    opacity: 0.2,
  },
  profileSelectorBgImage: {
    opacity: 1,
    borderRadius: 16,
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
  // Modal Informativo
  infoModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  infoModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  infoModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  infoModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  infoModalText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  infoModalSubtext: {
    fontSize: 13,
    color: '#666',
    lineHeight: 20,
    marginBottom: 20,
  },
  infoModalButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  infoModalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // === NUOVI STILI COMPATTI ===
  // Barra profili compatta
  profileSelectorCardCompact: {
    backgroundColor: '#FFE4C4',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  childTabsCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addProfileRectCompact: {
    width: 70,
    height: 70,
    backgroundColor: '#fff',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#1a472a',
    borderStyle: 'dashed',
  },
  addProfileRectTextCompact: {
    fontSize: 10,
    color: '#1a472a',
    fontWeight: '600',
    marginTop: 2,
  },
  childRectCompact: {
    width: 110,
    height: 85,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  childRectSelectedCompact: {
    backgroundColor: '#e8f5e9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  childRectNameCompact: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1a472a',
    textAlign: 'center',
  },
  childRectClasseCompact: {
    fontSize: 13,
    color: '#333',
    fontWeight: 'bold',
  },
  childRectSchoolCompact: {
    fontSize: 10,
    color: '#555',
    textAlign: 'center',
    lineHeight: 12,
    marginTop: 3,
  },
  // Nome del profilo evidenziato nella barra dettagli
  detailsBarName: {
    fontWeight: 'bold',
    color: '#1a472a',
    textTransform: 'uppercase',
  },
  // Container per copertina libro con badge sotto
  bookCoverContainer: {
    alignItems: 'center',
  },
  // Badge sotto la copertina
  badgeUnderCover: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    alignItems: 'center',
  },
  badgeUnderCoverBlue: {
    backgroundColor: '#e3f2fd',
  },
  badgeUnderCoverGreen: {
    backgroundColor: '#c8e6c9',
  },
  badgeUnderCoverGray: {
    backgroundColor: '#f5f5f5',
  },
  badgeUnderCoverRed: {
    backgroundColor: '#ffebee',
  },
  badgeUnderCoverPurple: {
    backgroundColor: '#f3e5f5',
  },
  badgeUnderCoverText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#666',
  },
  badgeUnderCoverTextBlue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  badgeUnderCoverTextGreen: {
    fontSize: 16,
    color: '#2e7d32',
    fontWeight: 'bold',
  },
  badgeUnderCoverTextRed: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#F44336',
  },
  badgeUnderCoverTextPurple: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#9C27B0',
  },
  // Prezzi compatti
  priceContainerCompact: {
    marginTop: 4,
  },
  nuovaEdizioneNote: {
    fontSize: 10,
    color: '#F44336',
    fontStyle: 'italic',
    marginTop: 2,
  },
  // Modal Registrazione
  registerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  registerModalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  registerModalClose: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: 8,
  },
  registerModalIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#e8f5e9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  registerModalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1a472a',
    marginBottom: 12,
    textAlign: 'center',
  },
  registerModalText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 22,
  },
  registerModalBenefits: {
    fontSize: 14,
    color: '#333',
    lineHeight: 24,
    marginBottom: 24,
    backgroundColor: '#f5f5f5',
    padding: 16,
    borderRadius: 12,
    width: '100%',
  },
  registerModalButton: {
    backgroundColor: '#1a472a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 25,
    width: '100%',
    gap: 8,
  },
  registerModalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  registerModalLoginLink: {
    marginTop: 16,
  },
  registerModalLoginText: {
    color: '#666',
    fontSize: 14,
  },
  registerModalLoginBold: {
    color: '#1a472a',
    fontWeight: 'bold',
  },
});
