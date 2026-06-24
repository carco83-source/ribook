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
  scuole?: { nome: string; codice: string }[];
  classi?: string[];
  copie_disponibili: number;
  prezzo_minimo?: number;
  da_comprare_nuovo: boolean;
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
            <TouchableOpacity
              key={`${book.isbn}-${index}`}
              style={styles.bookCard}
              onPress={() => goToBookDetail(book)}
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
                <Text style={styles.bookIsbn}>ISBN: {book.isbn}</Text>
                
                {/* Scuole e Classi */}
                {book.scuole && book.scuole.length > 0 && (
                  <View style={styles.schoolInfo}>
                    <Ionicons name="school-outline" size={12} color="#666" />
                    <Text style={styles.schoolText} numberOfLines={1}>
                      {book.scuole.map(s => s.nome).join(', ')}
                    </Text>
                  </View>
                )}
                {book.classi && book.classi.length > 0 && (
                  <View style={styles.classInfo}>
                    <Ionicons name="people-outline" size={12} color="#666" />
                    <Text style={styles.classText}>
                      Classi: {book.classi.slice(0, 5).join(', ')}{book.classi.length > 5 ? '...' : ''}
                    </Text>
                  </View>
                )}
                
                {/* Prezzo nuovo */}
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Prezzo nuovo:</Text>
                  <Text style={styles.priceValue}>€{book.prezzo_copertina?.toFixed(2) || 'N/D'}</Text>
                </View>
                
                {/* Disponibilità */}
                {book.da_comprare_nuovo ? (
                  <View style={styles.newBadge}>
                    <Ionicons name="pricetag" size={14} color="#fff" />
                    <Text style={styles.newBadgeText}>DA ACQUISTARE NUOVO</Text>
                  </View>
                ) : (
                  <View style={styles.availableBadge}>
                    <Text style={styles.availableText}>
                      {book.copie_disponibili} {book.copie_disponibili === 1 ? 'copia' : 'copie'} usate
                    </Text>
                    {book.prezzo_minimo && (
                      <Text style={styles.minPriceText}>da €{book.prezzo_minimo.toFixed(2)}</Text>
                    )}
                  </View>
                )}
              </View>
              
              {/* Freccia */}
              <View style={styles.arrowContainer}>
                <Ionicons name="chevron-forward" size={24} color="#ccc" />
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
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
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
    justifyContent: 'center',
  },
  bookTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
    lineHeight: 20,
  },
  bookAuthor: {
    fontSize: 13,
    color: '#666',
    marginBottom: 2,
  },
  bookIsbn: {
    fontSize: 11,
    color: '#999',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  schoolInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  schoolText: {
    fontSize: 11,
    color: '#666',
    flex: 1,
  },
  classInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  classText: {
    fontSize: 11,
    color: '#666',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  priceLabel: {
    fontSize: 12,
    color: '#666',
    marginRight: 4,
  },
  priceValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a472a',
  },
  newBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF9800',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    gap: 4,
  },
  newBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  availableBadge: {
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  availableText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2E7D32',
  },
  minPriceText: {
    fontSize: 11,
    color: '#388E3C',
    marginTop: 2,
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
