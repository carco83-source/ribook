import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Ordine di importanza delle materie
const MATERIE_ORDINE: { [key: string]: number } = {
  'italiano': 1,
  'matematica': 2,
  'inglese': 3,
  'storia': 4,
  'geografia': 5,
  'scienze': 6,
  'tecnologia': 7,
  'musica': 8,
  'arte': 9,
  'arte e immagine': 9,
  'educazione fisica': 10,
  'scienze motorie': 10,
  'religione': 11,
  'religione cattolica': 11,
};

interface BookData {
  isbn: string;
  titolo: string;
  autori: string;
  editore: string;
  disciplina: string;
  volume?: string;
  prezzo_copertina: number;
  nuova_adozione?: boolean;
  da_acquistare?: boolean;
  consigliato?: boolean;
  stato?: string;
  priorita?: number; // 1 = da acquistare nuovo, 2 = da acquistare usato, 3 = vendibile, 4 = già posseduto
}

interface ChildData {
  id: string;
  nome_figlio: string;
  classe: number;
  sezione: string;
  tipo_scuola: string;
  anno_scolastico: string;
  scuola_nome: string;
  scuola_codice: string;
  scuola_comune: string;
  scuola_cap: string;
  scuola_provincia: string;
}

export default function BookListScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const childId = params.childId as string;
  
  const [loading, setLoading] = useState(true);
  const [childData, setChildData] = useState<ChildData | null>(null);
  const [books, setBooks] = useState<BookData[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [viewMode, setViewMode] = useState<'portrait' | 'landscape'>('portrait');

  useEffect(() => {
    loadData();
  }, [childId]);

  const getMateriaPriority = (disciplina: string): number => {
    const normalized = disciplina?.toLowerCase().trim() || '';
    for (const [key, value] of Object.entries(MATERIE_ORDINE)) {
      if (normalized.includes(key)) return value;
    }
    return 50; // Default per materie non riconosciute
  };

  const loadData = async () => {
    try {
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId || !childId) {
        router.back();
        return;
      }

      // Carica dati utente
      const userRes = await axios.get(`${API_URL}/api/users/${userId}`);
      const profili = userRes.data.profili_figli || [];
      const child = profili.find((p: any) => p.id === childId);
      
      if (child) {
        setChildData({
          id: child.id,
          nome_figlio: child.nome_figlio,
          classe: child.classe,
          sezione: child.sezione || '',
          tipo_scuola: child.tipo_scuola || 'secondaria',
          anno_scolastico: child.anno_scolastico || '2025/2026',
          scuola_nome: child.scuola_nome || child.school_name || '',
          scuola_codice: child.scuola_codice || child.school_code || '',
          scuola_comune: child.scuola_comune || child.school_city || '',
          scuola_cap: child.scuola_cap || '',
          scuola_provincia: child.scuola_provincia || '',
        });
      }

      // Carica analisi libri
      const analysisRes = await axios.get(
        `${API_URL}/api/profiles/${userId}/children/${childId}/analysis`
      );

      const allBooks: BookData[] = [];
      const seenIsbns = new Set<string>();

      // 1. Libri da comprare NUOVI (priorità 1)
      if (analysisRes.data.nuovi?.libri) {
        analysisRes.data.nuovi.libri.forEach((libro: any) => {
          if (!seenIsbns.has(libro.isbn)) {
            seenIsbns.add(libro.isbn);
            allBooks.push({
              ...libro,
              stato: 'comprare_nuovo',
              da_acquistare: true,
              nuova_adozione: libro.nuova_adozione || false,
              consigliato: libro.consigliato || false,
              priorita: 1,
            });
          }
        });
      }

      // 2. Libri da comprare USATI (priorità 2)
      if (analysisRes.data.comprare?.libri_usati) {
        analysisRes.data.comprare.libri_usati.forEach((libro: any) => {
          if (!seenIsbns.has(libro.isbn)) {
            seenIsbns.add(libro.isbn);
            allBooks.push({
              ...libro,
              stato: 'comprare_usato',
              da_acquistare: true,
              nuova_adozione: libro.nuova_adozione || false,
              consigliato: libro.consigliato || false,
              priorita: 2,
            });
          }
        });
      }

      // 3. Libri già posseduti (priorità 3)
      if (analysisRes.data.gia_posseduti?.libri) {
        analysisRes.data.gia_posseduti.libri.forEach((libro: any) => {
          if (!seenIsbns.has(libro.isbn)) {
            seenIsbns.add(libro.isbn);
            allBooks.push({
              ...libro,
              stato: 'gia_posseduto',
              da_acquistare: false,
              nuova_adozione: false,
              consigliato: false,
              priorita: 3,
            });
          }
        });
      }

      // 4. Libri vendibili (priorità 4)
      if (analysisRes.data.vendere?.libri_vendibili) {
        analysisRes.data.vendere.libri_vendibili.forEach((libro: any) => {
          if (!seenIsbns.has(libro.isbn)) {
            seenIsbns.add(libro.isbn);
            allBooks.push({
              ...libro,
              stato: 'vendere',
              da_acquistare: false,
              nuova_adozione: false,
              consigliato: false,
              priorita: 4,
            });
          }
        });
      }

      // Ordina: prima per priorità (da acquistare prima), poi per importanza materia
      allBooks.sort((a, b) => {
        if (a.priorita !== b.priorita) return (a.priorita || 99) - (b.priorita || 99);
        return getMateriaPriority(a.disciplina) - getMateriaPriority(b.disciplina);
      });

      setBooks(allBooks);
    } catch (error) {
      console.error('Error loading book list:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTipoScuolaLabel = (tipo: string): string => {
    const tipi: { [key: string]: string } = {
      'primaria': 'SCUOLA PRIMARIA',
      'secondaria': 'SCUOLA SEC. I GRADO',
      'secondaria_primo': 'SCUOLA SEC. I GRADO',
      'secondaria_secondo': 'SCUOLA SEC. II GRADO',
      'superiore': 'SCUOLA SEC. II GRADO',
    };
    return tipi[tipo] || 'SCUOLA SECONDARIA';
  };

  const getStatoLabel = (book: BookData): { text: string; color: string } => {
    if (book.priorita === 1) return { text: 'DA ACQUISTARE NUOVO', color: '#f44336' };
    if (book.priorita === 2) return { text: 'DA ACQUISTARE USATO', color: '#FF9800' };
    if (book.priorita === 3) return { text: 'GIÀ POSSEDUTO', color: '#4CAF50' };
    if (book.priorita === 4) return { text: 'VENDIBILE', color: '#2196F3' };
    return { text: '', color: '#666' };
  };

  // Calcola pagine (10 libri per pagina)
  const LIBRI_PER_PAGINA = 10;
  const totalPages = Math.ceil(books.length / LIBRI_PER_PAGINA);
  const currentBooks = books.slice(currentPage * LIBRI_PER_PAGINA, (currentPage + 1) * LIBRI_PER_PAGINA);

  // Riempi con slot vuoti se necessario
  while (currentBooks.length < LIBRI_PER_PAGINA) {
    currentBooks.push({} as BookData);
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a472a" />
        <Text style={styles.loadingText}>Caricamento lista libri...</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      horizontal={viewMode === 'landscape'}
      contentContainerStyle={viewMode === 'landscape' ? styles.landscapeContent : undefined}
    >
      <View style={viewMode === 'landscape' ? styles.landscapeWrapper : styles.portraitWrapper}>
        {/* Header Navigation */}
        <View style={styles.headerNav}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#1a472a" />
          </TouchableOpacity>
          
          {/* Pulsante cambio vista */}
          <TouchableOpacity 
            style={styles.viewModeButton}
            onPress={() => setViewMode(viewMode === 'portrait' ? 'landscape' : 'portrait')}
          >
            <Ionicons 
              name={viewMode === 'portrait' ? 'phone-landscape' : 'phone-portrait'} 
              size={18} 
              color="#1a472a" 
            />
            <Text style={styles.viewModeText}>
              {viewMode === 'portrait' ? 'Orizzontale' : 'Verticale'}
            </Text>
          </TouchableOpacity>
          
          <View style={styles.pageIndicator}>
            <Text style={styles.pageText}>Pag. {currentPage + 1}/{totalPages || 1}</Text>
          </View>
          
          <TouchableOpacity 
            style={styles.printButton} 
            onPress={() => { if (Platform.OS === 'web') window.print(); }}
          >
            <Ionicons name="print" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Contenuto */}
        <View style={[styles.a4Container, viewMode === 'landscape' && styles.a4ContainerLandscape]}>
          {/* INTESTAZIONE */}
          <View style={styles.headerSection}>
            <Text style={[styles.riLibroTitle, viewMode === 'landscape' && styles.riLibroTitleLandscape]}>RiLiBro</Text>
            <View style={styles.schoolInfoRow}>
              <Text style={styles.schoolInfoText}>
                {getTipoScuolaLabel(childData?.tipo_scuola || '')} • Classe {childData?.classe}{childData?.sezione?.toUpperCase()} • A.S. {childData?.anno_scolastico}
              </Text>
            </View>
            <Text style={styles.schoolName}>{childData?.scuola_nome?.toUpperCase()}</Text>
            <Text style={styles.schoolDetails}>
              Cod. {childData?.scuola_codice} • {childData?.scuola_comune} {childData?.scuola_cap && `(${childData?.scuola_cap})`}
            </Text>
          </View>

          {/* GRIGLIA - in landscape mostra più colonne */}
          <View style={[styles.booksGrid, viewMode === 'landscape' && styles.booksGridLandscape]}>
            {currentBooks.map((book, index) => (
              <View key={book.isbn || `empty-${index}`} style={[styles.bookCell, viewMode === 'landscape' && styles.bookCellLandscape]}>
              {book.isbn ? (
                <>
                  {/* Stato libro */}
                  <View style={[styles.bookStatoBadge, { backgroundColor: getStatoLabel(book).color }]}>
                    <Text style={styles.bookStatoText}>{getStatoLabel(book).text}</Text>
                  </View>
                  
                  {/* Materia */}
                  <Text style={styles.bookMateria} numberOfLines={1}>
                    {book.disciplina?.toUpperCase()}
                  </Text>
                  
                  {/* Titolo */}
                  <Text style={styles.bookTitolo} numberOfLines={2}>
                    {book.titolo}{book.volume ? ` Vol.${book.volume}` : ''}
                  </Text>
                  
                  {/* Autore/Editore */}
                  <Text style={styles.bookAutore} numberOfLines={1}>
                    {book.autori} - {book.editore}
                  </Text>
                  
                  {/* ISBN e Prezzo */}
                  <View style={styles.bookIsbnRow}>
                    <Text style={styles.bookIsbn} selectable>{book.isbn}</Text>
                    <Text style={styles.bookPrezzo}>€{book.prezzo_copertina?.toFixed(2)}</Text>
                  </View>
                  
                  {/* Adozione badges */}
                  <View style={styles.bookBadgesRow}>
                    {book.nuova_adozione && (
                      <View style={[styles.badge, styles.badgeNuova]}>
                        <Text style={styles.badgeText}>N.ADOZ</Text>
                      </View>
                    )}
                    {book.da_acquistare && (
                      <View style={[styles.badge, styles.badgeAcquista]}>
                        <Text style={styles.badgeText}>ACQUISTA</Text>
                      </View>
                    )}
                    {book.consigliato && (
                      <View style={[styles.badge, styles.badgeConsigliato]}>
                        <Text style={styles.badgeText}>CONSIG.</Text>
                      </View>
                    )}
                  </View>
                </>
              ) : (
                <View style={styles.emptyCell}>
                  <Text style={styles.emptyCellText}>-</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      </View>

      {/* Navigazione pagine */}
      {totalPages > 1 && (
        <View style={styles.pagination}>
          <TouchableOpacity 
            style={[styles.pageButton, currentPage === 0 && styles.pageButtonDisabled]}
            onPress={() => setCurrentPage(p => Math.max(0, p - 1))}
            disabled={currentPage === 0}
          >
            <Ionicons name="chevron-back" size={24} color={currentPage === 0 ? '#ccc' : '#1a472a'} />
          </TouchableOpacity>
          
          <Text style={styles.paginationText}>
            {currentPage + 1} / {totalPages}
          </Text>
          
          <TouchableOpacity 
            style={[styles.pageButton, currentPage >= totalPages - 1 && styles.pageButtonDisabled]}
            onPress={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage >= totalPages - 1}
          >
            <Ionicons name="chevron-forward" size={24} color={currentPage >= totalPages - 1 ? '#ccc' : '#1a472a'} />
          </TouchableOpacity>
        </View>
      )}
      </View>
    </ScrollView>
  );
}

const { width, height } = Dimensions.get('window');
const isLandscape = width > height;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
    fontSize: 14,
  },
  
  // Header Navigation
  headerNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  backButton: {
    padding: 8,
  },
  pageIndicator: {
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pageText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a472a',
  },
  printButton: {
    backgroundColor: '#1a472a',
    padding: 8,
    borderRadius: 6,
  },

  // A4 Container - proporzioni 21:29.7
  a4Container: {
    flex: 1,
    backgroundColor: '#fff',
    margin: 4,
    borderRadius: 4,
    overflow: 'hidden',
    aspectRatio: 21 / 29.7,
    maxHeight: '100%',
    alignSelf: 'center',
  },

  // Header Section
  headerSection: {
    backgroundColor: '#1a472a',
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  riLibroTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 3,
  },
  schoolInfoRow: {
    marginTop: 4,
  },
  schoolInfoText: {
    fontSize: 10,
    color: '#c8e6c9',
  },
  schoolName: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 2,
    textAlign: 'center',
  },
  schoolDetails: {
    fontSize: 9,
    color: '#a5d6a7',
    marginTop: 1,
  },

  // Books Grid - 2 colonne x 5 righe
  booksGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 4,
  },
  bookCell: {
    width: '50%',
    height: '20%',
    padding: 3,
    borderWidth: 0.5,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  emptyCell: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  emptyCellText: {
    color: '#ddd',
    fontSize: 20,
  },

  // Book content
  bookStatoBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
    marginBottom: 2,
  },
  bookStatoText: {
    color: '#fff',
    fontSize: 7,
    fontWeight: 'bold',
  },
  bookMateria: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#1a472a',
    marginBottom: 1,
  },
  bookTitolo: {
    fontSize: 9,
    fontWeight: '600',
    color: '#333',
    lineHeight: 11,
    marginBottom: 1,
  },
  bookAutore: {
    fontSize: 7,
    color: '#666',
    marginBottom: 2,
  },
  bookIsbnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  bookIsbn: {
    fontSize: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#555',
  },
  bookPrezzo: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  bookBadgesRow: {
    flexDirection: 'row',
    gap: 3,
    flexWrap: 'wrap',
  },
  badge: {
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 2,
  },
  badgeNuova: {
    backgroundColor: '#e3f2fd',
  },
  badgeAcquista: {
    backgroundColor: '#ffebee',
  },
  badgeConsigliato: {
    backgroundColor: '#fff3e0',
  },
  badgeText: {
    fontSize: 6,
    fontWeight: '600',
    color: '#333',
  },

  // Pagination
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    gap: 20,
  },
  pageButton: {
    padding: 8,
  },
  pageButtonDisabled: {
    opacity: 0.3,
  },
  paginationText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a472a',
  },
  // Stili per cambio vista
  viewModeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  viewModeText: {
    fontSize: 12,
    color: '#1a472a',
    fontWeight: '500',
  },
  // Layout portrait/landscape
  portraitWrapper: {
    flex: 1,
  },
  landscapeWrapper: {
    width: 900,
    minHeight: '100%',
  },
  landscapeContent: {
    flexGrow: 1,
  },
  a4ContainerLandscape: {
    aspectRatio: 29.7 / 21,
    width: 850,
  },
  riLibroTitleLandscape: {
    fontSize: 36,
  },
  booksGridLandscape: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  bookCellLandscape: {
    width: '20%',
    height: '50%',
  },
});
