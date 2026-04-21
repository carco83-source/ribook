import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as ScreenOrientation from 'expo-screen-orientation';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

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
  stato?: string; // 'comprare_nuovo', 'comprare_usato', 'vendere', 'gia_posseduto'
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
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  
  const [loading, setLoading] = useState(true);
  const [childData, setChildData] = useState<ChildData | null>(null);
  const [books, setBooks] = useState<BookData[]>([]);
  const [analysis, setAnalysis] = useState<any>(null);

  // Sblocca rotazione schermo quando si entra in questa pagina
  useEffect(() => {
    const unlockOrientation = async () => {
      try {
        await ScreenOrientation.unlockAsync();
        console.log('Screen orientation unlocked');
      } catch (e) {
        console.log('Could not unlock orientation:', e);
      }
    };
    
    unlockOrientation();
    
    // Quando si esce, riporta a portrait
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []);

  useEffect(() => {
    loadData();
  }, [childId]);

  const loadData = async () => {
    try {
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId || !childId) {
        router.back();
        return;
      }

      // Carica dati utente per ottenere info figlio
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
      setAnalysis(analysisRes.data);

      // Combina tutti i libri in un'unica lista
      const allBooks: BookData[] = [];
      const seenIsbns = new Set<string>();

      // Libri da comprare nuovi
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
            });
          }
        });
      }

      // Libri da comprare usati
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
            });
          }
        });
      }

      // Libri da vendere (già posseduti)
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
            });
          }
        });
      }

      // Libri già posseduti (compatibili)
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
            });
          }
        });
      }

      // Ordina per disciplina
      allBooks.sort((a, b) => (a.disciplina || '').localeCompare(b.disciplina || ''));
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
      'secondaria': 'SCUOLA SECONDARIA DI I GRADO',
      'secondaria_primo': 'SCUOLA SECONDARIA DI I GRADO',
      'secondaria_secondo': 'SCUOLA SECONDARIA DI II GRADO',
      'superiore': 'SCUOLA SECONDARIA DI II GRADO',
    };
    return tipi[tipo] || 'SCUOLA SECONDARIA';
  };

  const getClasseLabel = (classe: number): string => {
    const nomi: { [key: number]: string } = {
      1: 'Prima', 2: 'Seconda', 3: 'Terza', 4: 'Quarta', 5: 'Quinta',
    };
    return nomi[classe] || `${classe}ª`;
  };

  const copyToClipboard = (text: string) => {
    if (Platform.OS === 'web') {
      navigator.clipboard.writeText(text);
    }
    // Su mobile, il testo è già selezionabile
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a472a" />
        <Text style={styles.loadingText}>Caricamento lista libri...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header con tasto indietro */}
      <View style={styles.headerNav}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1a472a" />
          <Text style={styles.backButtonText}>Indietro</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.printButton} 
          onPress={() => {
            if (Platform.OS === 'web') {
              window.print();
            }
          }}
        >
          <Ionicons name="print" size={20} color="#fff" />
          <Text style={styles.printButtonText}>Stampa</Text>
        </TouchableOpacity>
      </View>

      {/* ========== INTESTAZIONE RILIBRO ========== */}
      <View style={styles.headerSection}>
        <Text style={styles.riLibroTitle}>RiLiBro</Text>
        <Text style={styles.subtitle}>Elenco dei libri di testo adottati e consigliati</Text>
      </View>

      {/* ========== INFO SCUOLA E CLASSE ========== */}
      <View style={styles.schoolInfoSection}>
        <View style={styles.schoolInfoRow}>
          <Text style={styles.schoolInfoLabel}>{getTipoScuolaLabel(childData?.tipo_scuola || '')}</Text>
          <Text style={styles.schoolInfoSeparator}>•</Text>
          <Text style={styles.schoolInfoValue}>
            Classe {childData?.classe}{childData?.sezione?.toUpperCase()}
          </Text>
          <Text style={styles.schoolInfoSeparator}>•</Text>
          <Text style={styles.schoolInfoValue}>A.S. {childData?.anno_scolastico}</Text>
        </View>
        
        <View style={styles.schoolDataRow}>
          <Text style={styles.schoolName}>{childData?.scuola_nome?.toUpperCase()}</Text>
        </View>
        <View style={styles.schoolDataRow}>
          <Text style={styles.schoolCode}>Cod. {childData?.scuola_codice}</Text>
          <Text style={styles.schoolLocation}>
            {childData?.scuola_comune} {childData?.scuola_cap ? `(${childData?.scuola_cap})` : ''} 
            {childData?.scuola_provincia ? ` - ${childData?.scuola_provincia}` : ''}
          </Text>
        </View>
      </View>

      {/* ========== LISTA LIBRI ========== */}
      <View style={styles.booksSection}>
        {books.map((book, index) => (
          <View key={book.isbn || index} style={styles.bookCard}>
            {/* Disciplina */}
            <Text style={styles.bookDisciplina}>{book.disciplina?.toUpperCase()}</Text>
            
            {/* Titolo e Volume */}
            <Text style={styles.bookTitolo}>
              {book.titolo}
              {book.volume ? ` - Vol. ${book.volume}` : ''}
            </Text>
            
            {/* Autore e Editore */}
            <View style={styles.bookAuthorRow}>
              <Text style={styles.bookAutori}>{book.autori}</Text>
              <Text style={styles.bookEditore}>{book.editore}</Text>
            </View>
            
            {/* ISBN e Prezzo */}
            <View style={styles.bookIsbnPriceRow}>
              <TouchableOpacity 
                style={styles.isbnContainer}
                onPress={() => copyToClipboard(book.isbn)}
              >
                <Text style={styles.isbnLabel}>ISBN:</Text>
                <Text style={styles.isbnValue} selectable={true}>{book.isbn}</Text>
                <Ionicons name="copy-outline" size={14} color="#666" />
              </TouchableOpacity>
              <Text style={styles.bookPrezzo}>€ {book.prezzo_copertina?.toFixed(2)}</Text>
            </View>
            
            {/* Tre riquadri: Nuova Adoz. | Da Acqui. | Consig. */}
            <View style={styles.bookStatusRow}>
              <View style={[
                styles.statusBox,
                book.nuova_adozione && styles.statusBoxActive
              ]}>
                <Text style={[
                  styles.statusBoxLabel,
                  book.nuova_adozione && styles.statusBoxLabelActive
                ]}>NUOVA ADOZ.</Text>
                <View style={[
                  styles.statusCheckbox,
                  book.nuova_adozione && styles.statusCheckboxChecked
                ]}>
                  {book.nuova_adozione && <Ionicons name="checkmark" size={12} color="#fff" />}
                </View>
              </View>
              
              <View style={[
                styles.statusBox,
                book.da_acquistare && styles.statusBoxActive
              ]}>
                <Text style={[
                  styles.statusBoxLabel,
                  book.da_acquistare && styles.statusBoxLabelActive
                ]}>DA ACQUI.</Text>
                <View style={[
                  styles.statusCheckbox,
                  book.da_acquistare && styles.statusCheckboxChecked
                ]}>
                  {book.da_acquistare && <Ionicons name="checkmark" size={12} color="#fff" />}
                </View>
              </View>
              
              <View style={[
                styles.statusBox,
                book.consigliato && styles.statusBoxActiveBlue
              ]}>
                <Text style={[
                  styles.statusBoxLabel,
                  book.consigliato && styles.statusBoxLabelActiveBlue
                ]}>CONSIG.</Text>
                <View style={[
                  styles.statusCheckbox,
                  book.consigliato && styles.statusCheckboxCheckedBlue
                ]}>
                  {book.consigliato && <Ionicons name="checkmark" size={12} color="#fff" />}
                </View>
              </View>
            </View>
          </View>
        ))}
      </View>

      {/* ========== FOOTER ========== */}
      <View style={styles.footerSection}>
        <Text style={styles.footerText}>
          Totale libri: {books.length} • Generato da RiLiBro
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  contentContainer: {
    paddingBottom: 40,
    width: '100%',
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
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backButtonText: {
    color: '#1a472a',
    fontSize: 16,
    fontWeight: '500',
  },
  printButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a472a',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  printButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  // Header RiLiBro
  headerSection: {
    alignItems: 'center',
    paddingVertical: 24,
    borderBottomWidth: 2,
    borderBottomColor: '#1a472a',
    marginHorizontal: 16,
  },
  riLibroTitle: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#1a472a',
    letterSpacing: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },

  // School Info
  schoolInfoSection: {
    padding: 16,
    backgroundColor: '#f8f9fa',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 8,
  },
  schoolInfoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  schoolInfoLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a472a',
  },
  schoolInfoSeparator: {
    fontSize: 13,
    color: '#999',
    marginHorizontal: 8,
  },
  schoolInfoValue: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
  },
  schoolDataRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
    marginTop: 4,
  },
  schoolName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  schoolCode: {
    fontSize: 12,
    color: '#666',
  },
  schoolLocation: {
    fontSize: 12,
    color: '#666',
  },

  // Books Section
  booksSection: {
    padding: 16,
  },
  bookCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  bookDisciplina: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1a472a',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  bookTitolo: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
    lineHeight: 20,
  },
  bookAuthorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  bookAutori: {
    fontSize: 13,
    color: '#555',
  },
  bookEditore: {
    fontSize: 13,
    color: '#888',
    fontStyle: 'italic',
  },
  bookIsbnPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  isbnContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  isbnLabel: {
    fontSize: 11,
    color: '#888',
  },
  isbnValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  bookPrezzo: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  
  // Status Row (3 boxes)
  bookStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  statusBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  statusBoxActive: {
    backgroundColor: '#e8f5e9',
    borderColor: '#4CAF50',
  },
  statusBoxActiveBlue: {
    backgroundColor: '#e3f2fd',
    borderColor: '#2196F3',
  },
  statusBoxLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#888',
  },
  statusBoxLabelActive: {
    color: '#4CAF50',
  },
  statusBoxLabelActiveBlue: {
    color: '#2196F3',
  },
  statusCheckbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusCheckboxChecked: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  statusCheckboxCheckedBlue: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },

  // Footer
  footerSection: {
    padding: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    marginTop: 16,
  },
  footerText: {
    fontSize: 12,
    color: '#888',
  },
});
