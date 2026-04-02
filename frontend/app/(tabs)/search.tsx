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
  Modal,
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
  copie_disponibili?: number;
}

interface ChildProfile {
  id: string;
  nome_figlio: string;
  scuola: string;
  codice_scuola: string;
  classe: string;
  tipo_scuola: string;
}

// Helper functions
const getBookAuthor = (book: Book): string => book.autore || book.autori || 'N/A';
const getBookSubject = (book: Book): string => book.materia || book.disciplina || 'N/A';
const getBookPrice = (book: Book): number => book.prezzo_ministeriale || book.prezzo_copertina || 0;

interface Listing {
  id: string;
  book_titolo: string;
  prezzo: number;
  condizione: string;
  seller_name?: string;
  seller_rating?: number;
  created_at?: string;
  note?: string;
  punto_scambio?: string;
}

export default function SearchScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [books, setBooks] = useState<Book[]>([]);
  const [filteredBooks, setFilteredBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingBooks, setLoadingBooks] = useState(false);
  const [userRequests, setUserRequests] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  
  // Child profiles
  const [childProfiles, setChildProfiles] = useState<ChildProfile[]>([]);
  const [selectedChild, setSelectedChild] = useState<ChildProfile | null>(null);
  const [showChildPicker, setShowChildPicker] = useState(false);
  const [targetClasse, setTargetClasse] = useState<number | null>(null);

  // Listings modal
  const [showListingsModal, setShowListingsModal] = useState(false);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [bookListings, setBookListings] = useState<Listing[]>([]);
  const [loadingListings, setLoadingListings] = useState(false);

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

  const loadData = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      setUserId(storedUserId);

      if (storedUserId) {
        // Get user with child profiles
        const userResponse = await axios.get(`${API_URL}/api/users/${storedUserId}`);
        const profili = userResponse.data.profili_figli || [];
        setChildProfiles(profili);

        // Load user's requests
        try {
          const requestsResponse = await axios.get(
            `${API_URL}/api/requests/user/${storedUserId}`
          );
          setUserRequests(requestsResponse.data.map((r: any) => r.book_id));
        } catch (e) {
          console.log('No requests found');
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectChildProfile = async (child: ChildProfile) => {
    setSelectedChild(child);
    setShowChildPicker(false);
    setLoadingBooks(true);
    setSearchQuery('');

    try {
      // Use the new endpoint with compatibility logic
      const response = await axios.get(
        `${API_URL}/api/profiles/${userId}/children/${child.id}/books-to-buy`
      );
      
      if (response.data.books && response.data.books.length > 0) {
        setBooks(response.data.books);
        setFilteredBooks(response.data.books);
        setTargetClasse(response.data.classe_origine);
      } else {
        Alert.alert(
          'Fine Ciclo',
          response.data.message || `${child.nome_figlio} è all'ultimo anno del ciclo, non ci sono libri da comprare usati.`
        );
        setBooks([]);
        setFilteredBooks([]);
        setTargetClasse(null);
      }
    } catch (error) {
      console.error('Error loading books:', error);
      Alert.alert('Errore', 'Impossibile caricare i libri');
    } finally {
      setLoadingBooks(false);
    }
  };

  // State per tracciare richieste in corso (per disabilitare il pulsante durante la creazione)
  const [creatingRequest, setCreatingRequest] = useState<string | null>(null);

  const handleCreateRequestInline = async (book: Book) => {
    if (!userId) return;

    // Check if already searching
    if (userRequests.includes(book.id)) {
      return;
    }

    setCreatingRequest(book.id);

    try {
      await axios.post(`${API_URL}/api/requests?user_id=${userId}`, {
        book_id: book.id,
      });

      // Aggiorna lo stato locale immediatamente
      setUserRequests([...userRequests, book.id]);
    } catch (error) {
      console.error('Error adding request:', error);
      Alert.alert('Errore', 'Impossibile creare la richiesta');
    } finally {
      setCreatingRequest(null);
    }
  };

  // Funzione legacy per aprire modal con listings (usata quando ci sono copie disponibili)
  const handleViewListings = async (book: Book) => {
    if (!userId) return;

    setSelectedBook(book);
    setShowListingsModal(true);
    setLoadingListings(true);

    try {
      const response = await axios.get(`${API_URL}/api/listings/book/${book.isbn || book.id}`);
      setBookListings(response.data.listings || []);
    } catch (error) {
      console.error('Error loading listings:', error);
      setBookListings([]);
    } finally {
      setLoadingListings(false);
    }
  };

  const handleSelectListing = (listing: Listing) => {
    // Navigate to listing detail page
    setShowListingsModal(false);
    router.push(`/listing/${listing.id}`);
  };

  const getConditionColor = (condizione: string): string => {
    switch (condizione?.toLowerCase()) {
      case 'perfetto':
        return '#4CAF50';
      case 'buono':
        return '#FF9800';
      case 'usato':
      case 'molto_usato':
        return '#f44336';
      default:
        return '#666';
    }
  };

  const renderBook = ({ item }: { item: Book }) => {
    const isSearching = userRequests.includes(item.id);
    const isCreating = creatingRequest === item.id;
    const copieDisponibili = item.copie_disponibili || 0;
    const hasAvailableCopies = copieDisponibili > 0;

    return (
      <View style={styles.bookCard}>
        <View style={styles.bookInfo}>
          <Text style={styles.bookTitle} numberOfLines={2}>{item.titolo}</Text>
          <Text style={styles.bookAuthor}>{getBookAuthor(item)}</Text>
          <View style={styles.bookMeta}>
            <View style={styles.metaBadge}>
              <Text style={styles.metaText}>{getBookSubject(item)}</Text>
            </View>
          </View>
          <View style={styles.priceRow}>
            <Text style={styles.bookPrice}>
              Nuovo: €{getBookPrice(item).toFixed(2)}
            </Text>
            <Text style={styles.usedPrice}>
              Usato: ~€{(getBookPrice(item) * 0.5).toFixed(2)}
            </Text>
          </View>
        </View>

        <View style={styles.bookActions}>
          {hasAvailableCopies ? (
            /* Caso 1: Ci sono copie disponibili - mostra numero */
            <TouchableOpacity
              style={styles.availableButton}
              onPress={() => {
                if (item.isbn) {
                  router.push(`/book-sellers/${item.isbn}`);
                }
              }}
            >
              <View style={styles.availableBadge}>
                <Text style={styles.availableBadgeText}>{copieDisponibili}</Text>
              </View>
              <Text style={styles.availableButtonText}>
                disponibil{copieDisponibili === 1 ? 'e' : 'i'}
              </Text>
            </TouchableOpacity>
          ) : isSearching ? (
            /* Caso 2: Nessuna copia + richiesta attiva - mostra R */
            <View style={styles.requestActiveContainer}>
              <View style={styles.requestActiveBadge}>
                <Text style={styles.requestActiveBadgeText}>R</Text>
              </View>
              <Text style={styles.requestActiveText}>in attesa</Text>
            </View>
          ) : (
            /* Caso 3: Nessuna copia + nessuna richiesta - mostra pulsante Crea */
            <TouchableOpacity
              style={[
                styles.createRequestButton,
                isCreating && styles.createRequestButtonDisabled,
              ]}
              onPress={() => handleCreateRequestInline(item)}
              disabled={isCreating}
            >
              {isCreating ? (
                <ActivityIndicator size="small" color="#1a472a" />
              ) : (
                <Text style={styles.createRequestButtonText}>Crea richiesta</Text>
              )}
            </TouchableOpacity>
          )}
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
      {/* Profile Selector */}
      <TouchableOpacity
        style={styles.profileSelector}
        onPress={() => setShowChildPicker(true)}
      >
        <View style={styles.profileSelectorContent}>
          <Ionicons name="person-circle" size={24} color="#1a472a" />
          <View style={styles.profileSelectorText}>
            {selectedChild ? (
              <>
                <Text style={styles.profileName}>{selectedChild.nome_figlio}</Text>
                <Text style={styles.profileSchool}>
                  {selectedChild.classe}ª - {selectedChild.scuola.substring(0, 30)}...
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.profileName}>Seleziona Profilo</Text>
                <Text style={styles.profileSchool}>Scegli per chi cercare i libri</Text>
              </>
            )}
          </View>
        </View>
        <Ionicons name="chevron-down" size={24} color="#666" />
      </TouchableOpacity>

      {/* Target Class Info */}
      {selectedChild && targetClasse && (
        <View style={styles.targetInfo}>
          <Ionicons name="cart" size={20} color="#4CAF50" />
          <Text style={styles.targetText}>
            Libri da comprare per {selectedChild.nome_figlio} dalla {targetClasse}ª classe
          </Text>
        </View>
      )}

      {/* Search Box */}
      {selectedChild && (
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#666" />
          <TextInput
            style={styles.searchInput}
            placeholder="Filtra per titolo, autore, materia..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color="#666" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Active Searches Banner */}
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

      {/* Content */}
      {!selectedChild ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="person-add" size={64} color="#ccc" />
          <Text style={styles.emptyText}>Seleziona un profilo</Text>
          <Text style={styles.emptySubtext}>
            Tocca sopra per scegliere per quale figlio cercare i libri da comprare
          </Text>
        </View>
      ) : loadingBooks ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1a472a" />
          <Text style={styles.loadingText}>Caricamento libri...</Text>
        </View>
      ) : filteredBooks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="book-outline" size={48} color="#ccc" />
          <Text style={styles.emptyText}>Nessun libro trovato</Text>
          <Text style={styles.emptySubtext}>
            {targetClasse ? 'Nessun libro disponibile per questa classe' : 'Fine ciclo scolastico'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredBooks}
          renderItem={renderBook}
          keyExtractor={(item) => item.id || item.isbn}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Child Picker Modal */}
      <Modal
        visible={showChildPicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowChildPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setShowChildPicker(false)}
          />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Seleziona Profilo</Text>
              <TouchableOpacity onPress={() => setShowChildPicker(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Per chi vuoi cercare i libri da comprare?
            </Text>

            <ScrollView 
              style={{ maxHeight: 300 }} 
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
            >
              {childProfiles.length === 0 ? (
                <View style={styles.noChildrenContainer}>
                  <Ionicons name="person-add-outline" size={48} color="#ccc" />
                  <Text style={styles.noChildrenText}>Nessun profilo figlio</Text>
                  <Text style={styles.noChildrenSubtext}>
                    Vai al Profilo per aggiungere i tuoi figli
                  </Text>
                  <TouchableOpacity
                    style={styles.addChildButton}
                    onPress={() => {
                      setShowChildPicker(false);
                      router.push('/(tabs)/profile');
                    }}
                  >
                    <Text style={styles.addChildButtonText}>Vai al Profilo</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                childProfiles.map((child) => {
                  const isMedia = child.tipo_scuola === 'primo_grado';
                  const childClasse = parseInt(child.classe);
                  const maxClasse = isMedia ? 3 : (childClasse <= 2 ? 2 : 5);
                  const canBuy = childClasse < maxClasse;

                  return (
                    <TouchableOpacity
                      key={child.id}
                      style={styles.childOption}
                      onPress={() => selectChildProfile(child)}
                    >
                      <View style={styles.childOptionIcon}>
                        <Ionicons 
                          name="person" 
                          size={24} 
                          color="#1a472a" 
                        />
                      </View>
                      <View style={styles.childOptionInfo}>
                        <Text style={styles.childOptionName}>
                          {child.nome_figlio}
                        </Text>
                        <Text style={styles.childOptionSchool}>
                          {child.classe}ª {isMedia ? 'Media' : 'Superiore'} - {child.scuola.substring(0, 25)}...
                        </Text>
                        <Text style={styles.childOptionHint}>
                          → Cerca libri per {child.nome_figlio}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color="#666" />
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Listings Modal */}
      <Modal
        visible={showListingsModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowListingsModal(false)}
      >
        <View style={styles.listingsModalOverlay}>
          <View style={styles.listingsModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Annunci Disponibili</Text>
              <TouchableOpacity onPress={() => setShowListingsModal(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            {selectedBook && (
              <View style={styles.selectedBookHeader}>
                <Text style={styles.selectedBookTitle} numberOfLines={2}>
                  {selectedBook.titolo}
                </Text>
                <Text style={styles.selectedBookSubject}>
                  {getBookSubject(selectedBook)}
                </Text>
                <Text style={styles.selectedBookNewPrice}>
                  Prezzo nuovo: €{getBookPrice(selectedBook).toFixed(2)}
                </Text>
              </View>
            )}

            {loadingListings ? (
              <View style={styles.listingsLoading}>
                <ActivityIndicator size="large" color="#1a472a" />
                <Text style={styles.listingsLoadingText}>Cercando annunci...</Text>
              </View>
            ) : bookListings.length > 0 ? (
              <FlatList
                data={bookListings}
                keyExtractor={(item) => item.id}
                style={styles.listingsList}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.listingCard}
                    onPress={() => handleSelectListing(item)}
                  >
                    <View style={styles.listingHeader}>
                      <View style={styles.listingSellerInfo}>
                        <Ionicons name="person-circle" size={32} color="#1a472a" />
                        <View>
                          <Text style={styles.listingSellerName}>
                            {item.seller_name || 'Venditore'}
                          </Text>
                          <View style={styles.listingRating}>
                            <Ionicons name="star" size={12} color="#FFD700" />
                            <Text style={styles.listingRatingText}>
                              {(item.seller_rating || 5).toFixed(1)}
                            </Text>
                          </View>
                        </View>
                      </View>
                      <View style={styles.listingPriceContainer}>
                        <Text style={styles.listingPrice}>€{item.prezzo?.toFixed(2)}</Text>
                        <View style={[
                          styles.listingConditionBadge,
                          { backgroundColor: getConditionColor(item.condizione) }
                        ]}>
                          <Text style={styles.listingConditionText}>
                            {item.condizione?.charAt(0).toUpperCase() + item.condizione?.slice(1)}
                          </Text>
                        </View>
                      </View>
                    </View>
                    {item.punto_scambio && (
                      <View style={styles.listingLocation}>
                        <Ionicons name="location-outline" size={14} color="#666" />
                        <Text style={styles.listingLocationText}>{item.punto_scambio}</Text>
                      </View>
                    )}
                    {item.note && (
                      <Text style={styles.listingNote} numberOfLines={2}>
                        "{item.note}"
                      </Text>
                    )}
                    <View style={styles.listingAction}>
                      <Text style={styles.listingActionText}>Vedi dettagli</Text>
                      <Ionicons name="chevron-forward" size={16} color="#1a472a" />
                    </View>
                  </TouchableOpacity>
                )}
              />
            ) : (
              <View style={styles.noListingsContainer}>
                <Ionicons name="book-outline" size={64} color="#ccc" />
                <Text style={styles.noListingsTitle}>Nessun annuncio disponibile</Text>
                <Text style={styles.noListingsSubtext}>
                  Al momento non ci sono venditori per questo libro.
                  Puoi creare una richiesta e verrai notificato quando sarà disponibile.
                </Text>
                <TouchableOpacity
                  style={styles.createRequestButtonModal}
                  onPress={() => {
                    if (selectedBook) {
                      handleCreateRequestInline(selectedBook);
                      setShowListingsModal(false);
                    }
                  }}
                >
                  <Ionicons name="notifications-outline" size={20} color="#fff" />
                  <Text style={styles.createRequestButtonModalText}>Crea Richiesta</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
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
  loadingText: {
    marginTop: 12,
    color: '#666',
    fontSize: 14,
  },
  profileSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    margin: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  profileSelectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  profileSelectorText: {
    marginLeft: 12,
    flex: 1,
  },
  profileName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  profileSchool: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  targetInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  targetText: {
    fontSize: 13,
    color: '#2e7d32',
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    height: 48,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#333',
  },
  activeSearchBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  activeSearchText: {
    flex: 1,
    fontSize: 13,
    color: '#1a472a',
  },
  viewRadarLink: {
    fontSize: 13,
    color: '#1a472a',
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
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
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  bookAuthor: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
  },
  bookMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  metaBadge: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  metaText: {
    fontSize: 11,
    color: '#666',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bookPrice: {
    fontSize: 14,
    color: '#666',
  },
  usedPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4CAF50',
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
    opacity: 0.7,
  },
  addButtonText: {
    fontSize: 11,
    color: '#1a472a',
    marginTop: 4,
  },
  addButtonTextActive: {
    color: '#4CAF50',
  },
  // Disponibile button
  availableButton: {
    alignItems: 'center',
    padding: 8,
  },
  availableBadge: {
    backgroundColor: '#4CAF50',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  availableBadgeText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  availableButtonText: {
    fontSize: 11,
    color: '#4CAF50',
    marginTop: 4,
    fontWeight: '600',
  },
  // Crea richiesta button
  createRequestButton: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    minWidth: 80,
    alignItems: 'center',
  },
  createRequestButtonDisabled: {
    opacity: 0.6,
  },
  createRequestButtonText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  // Richiesta attiva badge (R)
  requestActiveContainer: {
    alignItems: 'center',
    padding: 8,
  },
  requestActiveBadge: {
    backgroundColor: '#FF9800',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  requestActiveBadgeText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  requestActiveText: {
    fontSize: 11,
    color: '#FF9800',
    marginTop: 4,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
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
    padding: 24,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  childOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    marginBottom: 12,
  },
  childOptionDisabled: {
    opacity: 0.5,
  },
  childOptionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e8f5e9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  childOptionInfo: {
    flex: 1,
    marginLeft: 12,
  },
  childOptionName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  childOptionNameDisabled: {
    color: '#999',
  },
  childOptionSchool: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  childOptionHint: {
    fontSize: 11,
    color: '#4CAF50',
    marginTop: 4,
    fontWeight: '500',
  },
  noChildrenContainer: {
    alignItems: 'center',
    padding: 24,
  },
  noChildrenText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginTop: 12,
  },
  noChildrenSubtext: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    marginTop: 4,
  },
  addChildButton: {
    marginTop: 16,
    backgroundColor: '#1a472a',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  addChildButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  // Listings Modal Styles
  listingsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  listingsModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: 40,
  },
  selectedBookHeader: {
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  selectedBookTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  selectedBookSubject: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  selectedBookNewPrice: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  listingsLoading: {
    padding: 48,
    alignItems: 'center',
  },
  listingsLoadingText: {
    marginTop: 12,
    color: '#666',
    fontSize: 14,
  },
  listingsList: {
    maxHeight: 400,
  },
  listingCard: {
    margin: 12,
    marginBottom: 0,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  listingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  listingSellerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  listingSellerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
  },
  listingRating: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  listingRatingText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 2,
  },
  listingPriceContainer: {
    alignItems: 'flex-end',
  },
  listingPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  listingConditionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginTop: 4,
  },
  listingConditionText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
  },
  listingLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  listingLocationText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4,
  },
  listingNote: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 8,
  },
  listingAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  listingActionText: {
    fontSize: 13,
    color: '#1a472a',
    fontWeight: '600',
  },
  noListingsContainer: {
    padding: 32,
    alignItems: 'center',
  },
  noListingsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
  },
  noListingsSubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  createRequestButtonModal: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a472a',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 24,
    gap: 8,
  },
  createRequestButtonModalText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
