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

  const goToBookSellers = (book: BookResult) => {
    // Naviga sempre alla pagina venditori (mostrerà "nessuna copia" se vuota)
    router.push(`/book-sellers/${book.isbn}`);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Risultati Ricerca',
          headerStyle: { backgroundColor: '#1a472a' },
          headerTintColor: '#fff',
          headerBackTitle: 'Indietro',
          headerLeft: () => (
            <TouchableOpacity 
              onPress={() => {
                // Usa canGoBack per verificare se possiamo tornare indietro
                if (router.canGoBack()) {
                  router.back();
                } else {
                  // Fallback: torna alla tab search
                  router.replace('/(tabs)/search');
                }
              }} 
              style={{ paddingHorizontal: 16, paddingVertical: 8 }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
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
            <TouchableOpacity
              key={`${book.isbn}-${index}`}
              style={styles.bookCard}
              onPress={() => goToBookSellers(book)}
              activeOpacity={0.7}
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
                          <Text style={styles.schoolName} numberOfLines={1}>{scuola.nome}</Text>
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
                
                {/* Prezzo nuovo */}
                <View style={styles.priceRow}>
                  <Ionicons name="pricetag-outline" size={14} color="#888" />
                  <Text style={styles.newPriceLabel}>Nuovo:</Text>
                  <Text style={styles.newPriceValue}>€{book.prezzo_copertina?.toFixed(2) || 'N/D'}</Text>
                </View>
                
                {/* Copie usate disponibili - ben visibile */}
                {book.copie_disponibili > 0 ? (
                  <View style={styles.usedAvailableBox}>
                    <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
                    <View style={styles.usedAvailableInfo}>
                      <Text style={styles.usedAvailableLabel}>
                        {book.copie_disponibili} {book.copie_disponibili === 1 ? 'copia usata' : 'copie usate'} disponibili
                      </Text>
                      <Text style={styles.usedAvailablePrice}>
                        da €{book.prezzo_minimo?.toFixed(2) || '---'}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.noUsedBox}>
                    <Ionicons name="search-outline" size={16} color="#999" />
                    <Text style={styles.noUsedText}>Nessuna copia usata al momento</Text>
                  </View>
                )}
              </View>
              
              {/* Freccia */}
              <View style={styles.arrowContainer}>
                <Ionicons name="chevron-forward" size={20} color="#999" />
              </View>
            </TouchableOpacity>
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
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
    alignItems: 'center',
  },
  bookCover: {
    width: 70,
    height: 100,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
  },
  bookInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'flex-start',
  },
  bookTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#222',
    marginBottom: 3,
    lineHeight: 20,
  },
  bookAuthor: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  volumeBadge: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  volumeText: {
    fontSize: 11,
    color: '#1565C0',
    fontWeight: '600',
  },
  bookIsbn: {
    fontSize: 10,
    color: '#999',
    fontFamily: 'monospace',
  },
  schoolsContainer: {
    marginBottom: 8,
  },
  schoolItem: {
    marginBottom: 4,
  },
  schoolHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  schoolName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a472a',
    flex: 1,
  },
  classesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginLeft: 18,
    marginTop: 2,
  },
  classBadge: {
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  classText: {
    fontSize: 10,
    color: '#2E7D32',
    fontWeight: '600',
  },
  moreClasses: {
    fontSize: 10,
    color: '#888',
    alignSelf: 'center',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  newPriceLabel: {
    fontSize: 12,
    color: '#888',
  },
  newPriceValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    textDecorationLine: 'line-through',
  },
  // Box copie usate disponibili
  usedAvailableBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  usedAvailableInfo: {
    flex: 1,
  },
  usedAvailableLabel: {
    fontSize: 12,
    color: '#2E7D32',
    fontWeight: '600',
  },
  usedAvailablePrice: {
    fontSize: 16,
    color: '#1B5E20',
    fontWeight: '700',
  },
  // Box nessuna copia usata
  noUsedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  noUsedText: {
    fontSize: 12,
    color: '#999',
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
