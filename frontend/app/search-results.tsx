import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  TextInput,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';

interface BookResult {
  id: string;
  isbn: string;
  titolo: string;
  autori?: string;
  editore?: string;
  disciplina?: string;
  prezzo_copertina?: number;
  volume?: number | string;
  scuole?: { nome: string; codice: string; classi: string[] }[];
  copie_disponibili: number;
  prezzo_minimo?: number;
  da_comprare_nuovo: boolean;
  solo_nuovo?: boolean;
  is_reperibile_usato?: boolean;
  nuova_adozione?: boolean;
  da_acquistare?: boolean;
}

export default function SearchResultsScreen() {
  const router = useRouter();
  const { q } = useLocalSearchParams<{ q: string }>();
  
  const [searchQuery, setSearchQuery] = useState(q || '');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<BookResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    if (q && q.length >= 3) {
      performSearch(q);
    }
  }, [q]);

  const performSearch = async (query: string) => {
    if (!query || query.length < 3) return;
    
    setLoading(true);
    setHasSearched(true);
    
    try {
      const response = await axios.get(`${API_URL}/api/books/search`, {
        params: { q: query, limit: 50 }
      });
      
      if (response.data?.books) {
        setResults(response.data.books);
      } else {
        setResults([]);
      }
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    if (searchQuery.length >= 3) {
      performSearch(searchQuery);
    }
  };

  const goToBookDetail = (book: BookResult) => {
    if (book.copie_disponibili > 0) {
      // Vai ai venditori
      router.push(`/book-sellers/${book.isbn}`);
    } else {
      // Libro da comprare nuovo - mostra alert o vai a pagina info
      router.push(`/book-sellers/${book.isbn}`);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Risultati Ricerca',
          headerStyle: { backgroundColor: '#1a472a' },
          headerTintColor: '#fff',
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ paddingHorizontal: 16 }}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
          ),
        }}
      />

      {/* Barra di ricerca */}
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Cerca per titolo..."
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          onSubmitEditing={handleSearch}
        />
        <TouchableOpacity 
          style={styles.searchButton} 
          onPress={handleSearch}
          disabled={searchQuery.length < 3}
        >
          <Ionicons name="search" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1a472a" />
          <Text style={styles.loadingText}>Ricerca in corso...</Text>
        </View>
      ) : (
        <ScrollView style={styles.resultsContainer} showsVerticalScrollIndicator={false}>
          {hasSearched && (
            <Text style={styles.resultsCount}>
              {results.length} {results.length === 1 ? 'libro trovato' : 'libri trovati'}
            </Text>
          )}
          
          {results.map((book, index) => (
            <View
              key={`${book.isbn}-${index}`}
              style={styles.bookCard}
            >
              {/* Copertina */}
              <Image
                source={{ uri: `https://www.ibs.it/images/${book.isbn}_0_0_0_536_0.jpg` }}
                style={styles.bookCover}
                resizeMode="cover"
              />
              
              {/* Info libro */}
              <View style={styles.bookInfo}>
                <Text style={styles.bookTitle} numberOfLines={2}>{book.titolo}</Text>
                {book.autori && (
                  <Text style={styles.bookAuthor} numberOfLines={1}>{book.autori}</Text>
                )}
                
                {/* Volume e ISBN */}
                <View style={styles.metaRow}>
                  {book.volume && (
                    <View style={styles.volumeBadge}>
                      <Text style={styles.volumeText}>Vol. {book.volume}</Text>
                    </View>
                  )}
                  <Text style={styles.bookIsbn}>ISBN: {book.isbn}</Text>
                </View>
                
                {/* Scuole con Classi raggruppate */}
                {book.scuole && book.scuole.length > 0 && (
                  <View style={styles.schoolsContainer}>
                    {book.scuole.map((scuola, idx) => (
                      <View key={idx} style={styles.schoolItem}>
                        <View style={styles.schoolHeader}>
                          <Ionicons name="school" size={14} color="#1a472a" />
                          <Text style={styles.schoolName}>{scuola.nome}</Text>
                        </View>
                        <View style={styles.classesRow}>
                          {scuola.classi.slice(0, 6).map((classe, cIdx) => (
                            <View key={cIdx} style={styles.classBadge}>
                              <Text style={styles.classText}>{classe}</Text>
                            </View>
                          ))}
                          {scuola.classi.length > 6 && (
                            <Text style={styles.moreClasses}>+{scuola.classi.length - 6}</Text>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                )}
                
                {/* Prezzo nuovo - sempre visibile */}
                <View style={styles.newPriceContainer}>
                  <Ionicons name="pricetag" size={14} color="#FF9800" />
                  <Text style={styles.newPriceLabel}>Nuovo:</Text>
                  <Text style={styles.newPriceValue}>€{book.prezzo_copertina?.toFixed(2) || 'N/D'}</Text>
                </View>
                
                {/* Badge: REPERIBILE USATO o DA ACQUISTARE NUOVO */}
                {book.solo_nuovo || book.da_comprare_nuovo ? (
                  // Libro che DEVE essere comprato nuovo
                  <View style={styles.newOnlyBadge}>
                    <Ionicons name="alert-circle" size={16} color="#fff" />
                    <Text style={styles.newOnlyBadgeText}>DA ACQUISTARE NUOVO</Text>
                    <Text style={styles.newOnlyBadgeDesc}>
                      {book.nuova_adozione ? 'Nuova adozione' : 'Adottato da meno di 4 anni'}
                    </Text>
                  </View>
                ) : (
                  // Libro REPERIBILE USATO
                  <TouchableOpacity 
                    style={[
                      styles.usedBadge,
                      book.copie_disponibili === 0 && styles.usedBadgeEmpty
                    ]}
                    onPress={() => goToBookDetail(book)}
                  >
                    <Ionicons 
                      name={book.copie_disponibili > 0 ? "checkmark-circle" : "search"} 
                      size={16} 
                      color="#fff" 
                    />
                    <Text style={styles.usedBadgeText}>REPERIBILE USATO</Text>
                    {book.copie_disponibili > 0 ? (
                      <Text style={styles.usedBadgeCount}>
                        {book.copie_disponibili} {book.copie_disponibili === 1 ? 'copia' : 'copie'} da €{book.prezzo_minimo?.toFixed(2)}
                      </Text>
                    ) : (
                      <Text style={styles.usedBadgeCount}>Cerca copie</Text>
                    )}
                    <Ionicons name="chevron-forward" size={16} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
          
          {hasSearched && results.length === 0 && (
            <View style={styles.emptyContainer}>
              <Ionicons name="book-outline" size={64} color="#ccc" />
              <Text style={styles.emptyTitle}>Nessun libro trovato</Text>
              <Text style={styles.emptyText}>Prova a cercare con termini diversi</Text>
            </View>
          )}
          
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  searchBar: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    height: 44,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  searchButton: {
    width: 44,
    height: 44,
    backgroundColor: '#1a472a',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  resultsContainer: {
    flex: 1,
    padding: 12,
  },
  resultsCount: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  bookCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  bookCover: {
    width: 90,
    height: 130,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  bookInfo: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'flex-start',
  },
  bookTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#222',
    marginBottom: 4,
    lineHeight: 22,
  },
  bookAuthor: {
    fontSize: 13,
    color: '#555',
    marginBottom: 4,
  },
  bookIsbn: {
    fontSize: 11,
    color: '#888',
    fontFamily: 'monospace',
    marginBottom: 10,
  },
  // Scuole con classi
  schoolsContainer: {
    marginBottom: 10,
  },
  schoolItem: {
    marginBottom: 8,
  },
  schoolHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  schoolName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a472a',
    flex: 1,
  },
  classesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginLeft: 20,
  },
  classBadge: {
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  classText: {
    fontSize: 11,
    color: '#2E7D32',
    fontWeight: '600',
  },
  moreClasses: {
    fontSize: 11,
    color: '#888',
    alignSelf: 'center',
  },
  // Prezzo nuovo - sempre visibile
  newPriceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 6,
  },
  newPriceLabel: {
    fontSize: 13,
    color: '#666',
  },
  newPriceValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FF9800',
  },
  usedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    alignSelf: 'flex-start',
    gap: 6,
    flexWrap: 'wrap',
  },
  usedBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  usedBadgeCount: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.9)',
  },
  usedBadgeEmpty: {
    backgroundColor: '#78909C',
  },
  // Badge DA ACQUISTARE NUOVO (rosso/arancione)
  newOnlyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E65100',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    alignSelf: 'flex-start',
    gap: 6,
    flexWrap: 'wrap',
  },
  newOnlyBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  newOnlyBadgeDesc: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.85)',
  },
  arrowContainer: {
    justifyContent: 'center',
    paddingLeft: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
});
