import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Book {
  id: string;
  titolo: string;
  autore?: string;
  autori?: string;
  isbn: string;
  materia?: string;
  disciplina?: string;
  prezzo_ministeriale?: number;
  prezzo_copertina?: number;
  classe?: string;
  editore?: string;
  perc_usato_disponibile?: number;
}

// Helper functions for book data
const getBookAuthor = (book: Book): string => book.autore || book.autori || 'N/A';
const getBookSubject = (book: Book): string => book.materia || book.disciplina || 'N/A';
const getBookPrice = (book: Book): number => book.prezzo_ministeriale || book.prezzo_copertina || 0;

export default function SearchScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [books, setBooks] = useState<Book[]>([]);
  const [filteredBooks, setFilteredBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRequests, setUserRequests] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [userClasse, setUserClasse] = useState<string | null>(null);
  const [selectedClasse, setSelectedClasse] = useState<string>('');
  const [tipoScuola, setTipoScuola] = useState<string>('');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredBooks(books);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredBooks(
        books.filter(
          (book) =>
            book.titolo.toLowerCase().includes(query) ||
            getBookAuthor(book).toLowerCase().includes(query) ||
            book.isbn.includes(query) ||
            getBookSubject(book).toLowerCase().includes(query)
        )
      );
    }
  }, [searchQuery, books]);

  // Reload books when classe filter changes
  useEffect(() => {
    if (selectedClasse && tipoScuola) {
      loadBooks(selectedClasse, tipoScuola);
    }
  }, [selectedClasse]);

  const loadBooks = async (classe: string, tipo: string) => {
    try {
      setLoading(true);
      const booksResponse = await axios.get(
        `${API_URL}/api/books?classe=${classe}&tipo_scuola=${tipo}&limit=500`
      );
      setBooks(booksResponse.data);
      setFilteredBooks(booksResponse.data);
    } catch (error) {
      console.error('Error loading books:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadData = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      setUserId(storedUserId);

      // Get user info to know their classe
      if (storedUserId) {
        const userResponse = await axios.get(`${API_URL}/api/users/${storedUserId}`);
        const userClasse = userResponse.data.classe;
        setUserClasse(userClasse);
        setSelectedClasse(userClasse);
        
        // Determine tipo_scuola based on classe (1-3 = medie, 1-5 = superiori)
        // We need to store this info, for now assume based on scuola name
        const scuola = userResponse.data.scuola?.toLowerCase() || '';
        const tipo = scuola.includes('media') || scuola.includes('i.c.') ? 'primo_grado' : 'secondo_grado';
        setTipoScuola(tipo);
        
        // Load books for user's classe
        await loadBooks(userClasse, tipo);

        // Load user's requests
        const requestsResponse = await axios.get(
          `${API_URL}/api/requests/user/${storedUserId}`
        );
        setUserRequests(requestsResponse.data.map((r: any) => r.book_id));
      }
    } catch (error) {
      console.error('Error loading data:', error);
      // Fallback: load all books
      const booksResponse = await axios.get(`${API_URL}/api/books?limit=500`);
      setBooks(booksResponse.data);
      setFilteredBooks(booksResponse.data);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRequest = async (book: Book) => {
    if (!userId) return;

    if (userRequests.includes(book.id)) {
      Alert.alert('Info', 'Stai già cercando questo libro');
      return;
    }

    try {
      await axios.post(`${API_URL}/api/requests?user_id=${userId}`, {
        book_id: book.id,
      });

      setUserRequests([...userRequests, book.id]);
      Alert.alert(
        'Aggiunto!',
        `"${book.titolo}" è stato aggiunto alla tua lista di ricerca. Controlla il Radar per le compatibilità!`
      );
    } catch (error) {
      console.error('Error adding request:', error);
      Alert.alert('Errore', 'Impossibile aggiungere la richiesta');
    }
  };

  const renderBook = ({ item }: { item: Book }) => {
    const isSearching = userRequests.includes(item.id);

    return (
      <View style={styles.bookCard}>
        <View style={styles.bookInfo}>
          <Text style={styles.bookTitle} numberOfLines={2}>{item.titolo}</Text>
          <Text style={styles.bookAuthor}>{getBookAuthor(item)}</Text>
          <View style={styles.bookMeta}>
            <View style={styles.metaBadge}>
              <Text style={styles.metaText}>{getBookSubject(item)}</Text>
            </View>
            {item.classe && (
              <View style={styles.metaBadge}>
                <Text style={styles.metaText}>Classe {item.classe}</Text>
              </View>
            )}
          </View>
          <View style={styles.priceRow}>
            <Text style={styles.bookPrice}>
              €{getBookPrice(item).toFixed(2)}
            </Text>
            <Text style={styles.bookIsbn}>ISBN: {item.isbn}</Text>
          </View>
        </View>

        <View style={styles.bookActions}>
          <TouchableOpacity
            style={[
              styles.addButton,
              isSearching && styles.addButtonActive,
            ]}
            onPress={() => handleAddRequest(item)}
          >
            <Ionicons
              name={isSearching ? 'checkmark-circle' : 'add-circle'}
              size={28}
              color={isSearching ? '#4CAF50' : '#1a472a'}
            />
            <Text style={[
              styles.addButtonText,
              isSearching && styles.addButtonTextActive
            ]}>
              {isSearching ? 'Cercando' : 'Cerca'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a472a" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Class Filter */}
      {tipoScuola && (
        <View style={styles.classeFilterContainer}>
          <Text style={styles.classeFilterLabel}>Classe:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.classeScroll}>
            {(tipoScuola === 'primo_grado' ? ['1', '2', '3'] : ['1', '2', '3', '4', '5']).map((c) => (
              <TouchableOpacity
                key={c}
                style={[
                  styles.classeButton,
                  selectedClasse === c && styles.classeButtonActive,
                ]}
                onPress={() => setSelectedClasse(c)}
              >
                <Text
                  style={[
                    styles.classeButtonText,
                    selectedClasse === c && styles.classeButtonTextActive,
                  ]}
                >
                  {c}°
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#666" />
        <TextInput
          style={styles.searchInput}
          placeholder="Cerca per titolo, autore, ISBN o materia..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color="#666" />
          </TouchableOpacity>
        )}
      </View>

      {userRequests.length > 0 && (
        <View style={styles.activeSearchBanner}>
          <Ionicons name="radio" size={16} color="#1a472a" />
          <Text style={styles.activeSearchText}>
            Stai cercando {userRequests.length} libri
          </Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)')}>
            <Text style={styles.viewRadarLink}>Vedi Radar</Text>
          </TouchableOpacity>
        </View>
      )}

      {filteredBooks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="book-outline" size={48} color="#ccc" />
          <Text style={styles.emptyText}>Nessun libro trovato</Text>
          <Text style={styles.emptySubtext}>
            Prova a cercare con un altro termine
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredBooks}
          renderItem={renderBook}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
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
  classeFilterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  classeFilterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginRight: 12,
  },
  classeScroll: {
    flexDirection: 'row',
  },
  classeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    marginRight: 8,
  },
  classeButtonActive: {
    backgroundColor: '#1a472a',
  },
  classeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  classeButtonTextActive: {
    color: '#fff',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  activeSearchBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 8,
  },
  activeSearchText: {
    flex: 1,
    marginLeft: 8,
    color: '#1a472a',
    fontWeight: '500',
  },
  viewRadarLink: {
    color: '#1a472a',
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  bookCard: {
    flexDirection: 'row',
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
  bookInfo: {
    flex: 1,
  },
  bookTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  bookAuthor: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  bookMeta: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
  },
  metaBadge: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  metaText: {
    fontSize: 12,
    color: '#666',
  },
  bookPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  bookIsbn: {
    fontSize: 11,
    color: '#999',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  bookActions: {
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  addButton: {
    alignItems: 'center',
    padding: 8,
  },
  addButtonActive: {
    opacity: 1,
  },
  addButtonText: {
    fontSize: 11,
    color: '#1a472a',
    marginTop: 2,
    fontWeight: '500',
  },
  addButtonTextActive: {
    color: '#4CAF50',
  },
  addButtonDisabled: {
    backgroundColor: '#4CAF50',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 100,
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
    marginTop: 4,
  },
});
