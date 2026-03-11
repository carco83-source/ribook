import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Image,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Listing {
  id: string;
  book_titolo: string;
  book_autore?: string;
  book_autori?: string;
  book_materia?: string;
  book_disciplina?: string;
  condizione: string;
  prezzo_vendita: number;
  prezzo_ministeriale?: number;
  prezzo_copertina?: number;
  stato: string;
  foto_base64?: string;
  created_at: string;
}

interface Book {
  id: string;
  isbn: string;
  titolo: string;
  autore?: string;
  autori?: string;
  disciplina?: string;
  prezzo_copertina?: number;
  editore?: string;
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
const getListingAuthor = (item: Listing): string => item.book_autore || item.book_autori || 'N/A';
const getListingPrice = (item: Listing): number => item.prezzo_ministeriale || item.prezzo_copertina || 0;
const getBookAuthor = (book: Book): string => book.autore || book.autori || 'N/A';
const getBookPrice = (book: Book): number => book.prezzo_copertina || 0;

export default function SellScreen() {
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  
  // Child profiles
  const [childProfiles, setChildProfiles] = useState<ChildProfile[]>([]);
  const [selectedChild, setSelectedChild] = useState<ChildProfile | null>(null);
  const [showChildPicker, setShowChildPicker] = useState(false);
  
  // Books to sell
  const [booksToSell, setBooksToSell] = useState<Book[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(false);
  const [showBookPicker, setShowBookPicker] = useState(false);
  const [targetClasse, setTargetClasse] = useState<number | null>(null);
  
  // Selected book for listing
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [showListingForm, setShowListingForm] = useState(false);
  const [listingCondition, setListingCondition] = useState('buono');
  const [listingPrice, setListingPrice] = useState('');
  const [listingPhoto, setListingPhoto] = useState<string | null>(null);
  const [creatingListing, setCreatingListing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      if (!storedUserId) {
        router.replace('/');
        return;
      }
      setUserId(storedUserId);

      // Load user listings
      const response = await axios.get(
        `${API_URL}/api/listings/user/${storedUserId}`
      );
      setListings(response.data);

      // Load child profiles
      const userResponse = await axios.get(`${API_URL}/api/users/${storedUserId}`);
      setChildProfiles(userResponse.data.profili_figli || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const selectChildForSelling = async (child: ChildProfile) => {
    setSelectedChild(child);
    setShowChildPicker(false);
    setLoadingBooks(true);

    try {
      const childClasse = parseInt(child.classe);
      const isMedia = child.tipo_scuola === 'primo_grado';
      
      // Calculate target class (classe precedente per vendere)
      let minClasse = isMedia ? 1 : (childClasse <= 2 ? 1 : 3);
      let prevClasse = childClasse - 1;
      
      if (prevClasse < minClasse) {
        Alert.alert(
          'Inizio Ciclo',
          `${child.nome_figlio} è al primo anno del ciclo, non ha libri da vendere alla classe precedente.`
        );
        setBooksToSell([]);
        setTargetClasse(null);
        setLoadingBooks(false);
        return;
      }

      setTargetClasse(prevClasse);

      // Load books from PREVIOUS class (the books the child used last year)
      const booksResponse = await axios.get(
        `${API_URL}/api/books?codice_scuola=${child.codice_scuola}&classe=${prevClasse}&limit=100`
      );
      
      // Filter out volume unici (books used for multiple years - not sellable)
      const annualBooks = booksResponse.data.filter((book: any) => !book.is_volume_unico);
      
      setBooksToSell(annualBooks);
      setShowBookPicker(true);
    } catch (error) {
      console.error('Error loading books:', error);
      Alert.alert('Errore', 'Impossibile caricare i libri');
    } finally {
      setLoadingBooks(false);
    }
  };

  const selectBookToSell = (book: Book) => {
    setSelectedBook(book);
    setShowBookPicker(false);
    setListingPrice((getBookPrice(book) * 0.5).toFixed(2));
    setListingCondition('buono');
    setListingPhoto(null);
    setShowListingForm(true);
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setListingPhoto(result.assets[0].base64);
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permesso negato', 'Serve il permesso per usare la fotocamera');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setListingPhoto(result.assets[0].base64);
    }
  };

  const createListing = async () => {
    if (!selectedBook || !userId) return;

    const price = parseFloat(listingPrice);
    if (isNaN(price) || price <= 0) {
      Alert.alert('Errore', 'Inserisci un prezzo valido');
      return;
    }

    setCreatingListing(true);
    try {
      await axios.post(`${API_URL}/api/listings?user_id=${userId}`, {
        book_id: selectedBook.isbn || selectedBook.id,
        book_isbn: selectedBook.isbn,
        book_titolo: selectedBook.titolo,
        book_autori: getBookAuthor(selectedBook),
        book_disciplina: selectedBook.disciplina,
        prezzo_copertina: getBookPrice(selectedBook),
        condizione: listingCondition,
        prezzo_vendita: price,
        foto_base64: listingPhoto,
        child_profile_id: selectedChild?.id,
      });

      Alert.alert('Successo!', 'Annuncio creato con successo');
      setShowListingForm(false);
      setSelectedBook(null);
      loadData();
    } catch (error: any) {
      Alert.alert('Errore', error.response?.data?.detail || 'Impossibile creare annuncio');
    } finally {
      setCreatingListing(false);
    }
  };

  const handleDeleteListing = async (listingId: string) => {
    Alert.alert(
      'Elimina annuncio',
      'Sei sicuro di voler eliminare questo annuncio?',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(
                `${API_URL}/api/listings/${listingId}?user_id=${userId}`
              );
              setListings(listings.filter((l) => l.id !== listingId));
              Alert.alert('Eliminato', 'Annuncio eliminato con successo');
            } catch (error: any) {
              Alert.alert(
                'Errore',
                error.response?.data?.detail || 'Impossibile eliminare'
              );
            }
          },
        },
      ]
    );
  };

  const getConditionLabel = (condition: string) => {
    const labels: { [key: string]: string } = {
      nuovo: 'Nuovo',
      come_nuovo: 'Come Nuovo',
      ottime_condizioni: 'Ottime',
      buono: 'Buono',
      scarso: 'Scarso',
      perfetto: 'Perfetto',
      molto_usato: 'Molto usato',
    };
    return labels[condition] || condition;
  };

  const getStatoConfig = (stato: string) => {
    switch (stato) {
      case 'disponibile':
        return { color: '#4CAF50', label: 'In vendita', icon: 'pricetag' };
      case 'venduto':
        return { color: '#FF9800', label: 'Da consegnare', icon: 'time' };
      case 'consegnato':
        return { color: '#2196F3', label: 'Consegnato', icon: 'checkmark-circle' };
      case 'ritirato':
        return { color: '#9C27B0', label: 'Completato', icon: 'trophy' };
      default:
        return { color: '#666', label: stato, icon: 'ellipse' };
    }
  };

  const renderListing = ({ item }: { item: Listing }) => {
    const statoConfig = getStatoConfig(item.stato);
    
    return (
      <View style={styles.listingCard}>
        {item.foto_base64 && (
          <Image
            source={{ uri: `data:image/jpeg;base64,${item.foto_base64}` }}
            style={styles.listingImage}
          />
        )}
        
        <View style={styles.listingContent}>
          <View style={styles.listingHeader}>
            <View
              style={[styles.statoBadge, { backgroundColor: statoConfig.color }]}
            >
              <Ionicons name={statoConfig.icon as any} size={12} color="#fff" />
              <Text style={styles.statoText}>{statoConfig.label}</Text>
            </View>
            <Text style={styles.listingPrice}>€{item.prezzo_vendita.toFixed(2)}</Text>
          </View>

          <Text style={styles.listingTitle} numberOfLines={2}>{item.book_titolo}</Text>
          <Text style={styles.listingAuthor}>{getListingAuthor(item)}</Text>

          <View style={styles.listingMeta}>
            <View style={styles.conditionBadge}>
              <Text style={styles.conditionText}>{getConditionLabel(item.condizione)}</Text>
            </View>
          </View>

          {item.stato === 'disponibile' && (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDeleteListing(item.id)}
            >
              <Ionicons name="trash-outline" size={16} color="#ff4444" />
              <Text style={styles.deleteButtonText}>Elimina</Text>
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
      {/* Header with Add Button */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>I tuoi annunci</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowChildPicker(true)}
        >
          <Ionicons name="add-circle" size={24} color="#fff" />
          <Text style={styles.addButtonText}>Vendi Libro</Text>
        </TouchableOpacity>
      </View>

      {/* Listings */}
      {listings.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="pricetags-outline" size={64} color="#ccc" />
          <Text style={styles.emptyText}>Nessun annuncio</Text>
          <Text style={styles.emptySubtext}>
            Tocca "Vendi Libro" per mettere in vendita i libri usati
          </Text>
        </View>
      ) : (
        <FlatList
          data={listings}
          renderItem={renderListing}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}

      {/* Child Picker Modal */}
      <Modal
        visible={showChildPicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowChildPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowChildPicker(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Vendi Libro</Text>
              <TouchableOpacity onPress={() => setShowChildPicker(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Per quale figlio vuoi vendere i libri?
            </Text>

            {childProfiles.length === 0 ? (
              <View style={styles.noChildrenContainer}>
                <Ionicons name="person-add-outline" size={48} color="#ccc" />
                <Text style={styles.noChildrenText}>Nessun profilo figlio</Text>
                <TouchableOpacity
                  style={styles.goToProfileButton}
                  onPress={() => {
                    setShowChildPicker(false);
                    router.push('/(tabs)/profile');
                  }}
                >
                  <Text style={styles.goToProfileButtonText}>Vai al Profilo</Text>
                </TouchableOpacity>
              </View>
            ) : (
              childProfiles.map((child) => {
                const isMedia = child.tipo_scuola === 'primo_grado';
                const childClasse = parseInt(child.classe);
                const minClasse = isMedia ? 1 : (childClasse <= 2 ? 1 : 3);
                const canSell = childClasse > minClasse;

                return (
                  <TouchableOpacity
                    key={child.id}
                    style={[styles.childOption, !canSell && styles.childOptionDisabled]}
                    onPress={() => canSell && selectChildForSelling(child)}
                    disabled={!canSell}
                  >
                    <View style={styles.childOptionIcon}>
                      <Ionicons name="person" size={24} color={canSell ? "#1a472a" : "#999"} />
                    </View>
                    <View style={styles.childOptionInfo}>
                      <Text style={[styles.childOptionName, !canSell && styles.childOptionNameDisabled]}>
                        {child.nome_figlio}
                      </Text>
                      <Text style={styles.childOptionSchool}>
                        {child.classe}ª {isMedia ? 'Media' : 'Superiore'}
                      </Text>
                      {canSell ? (
                        <Text style={styles.childOptionHint}>
                          → Vendi libri della {childClasse - 1}ª
                        </Text>
                      ) : (
                        <Text style={[styles.childOptionHint, { color: '#f44336' }]}>
                          Primo anno - niente da vendere
                        </Text>
                      )}
                    </View>
                    {canSell && <Ionicons name="chevron-forward" size={20} color="#666" />}
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Book Picker Modal */}
      <Modal
        visible={showBookPicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowBookPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '80%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Seleziona Libro</Text>
              <TouchableOpacity onPress={() => setShowBookPicker(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            {selectedChild && targetClasse && (
              <Text style={styles.modalSubtitle}>
                Libri di {selectedChild.nome_figlio} della {targetClasse}ª da vendere
              </Text>
            )}

            {loadingBooks ? (
              <ActivityIndicator size="large" color="#1a472a" style={{ marginTop: 40 }} />
            ) : (
              <FlatList
                data={booksToSell}
                keyExtractor={(item) => item.isbn || item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.bookOption}
                    onPress={() => selectBookToSell(item)}
                  >
                    <View style={styles.bookOptionInfo}>
                      <Text style={styles.bookOptionTitle} numberOfLines={2}>
                        {item.titolo}
                      </Text>
                      <Text style={styles.bookOptionAuthor}>
                        {item.disciplina} - {getBookAuthor(item)}
                      </Text>
                      <Text style={styles.bookOptionPrice}>
                        Prezzo suggerito: €{(getBookPrice(item) * 0.5).toFixed(2)}
                      </Text>
                    </View>
                    <Ionicons name="add-circle" size={28} color="#1a472a" />
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={styles.emptyBooks}>
                    <Text style={styles.emptyBooksText}>Nessun libro trovato</Text>
                  </View>
                }
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Listing Form Modal */}
      <Modal
        visible={showListingForm}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowListingForm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Dettagli Annuncio</Text>
              <TouchableOpacity onPress={() => setShowListingForm(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {selectedBook && (
                <View style={styles.selectedBookInfo}>
                  <Text style={styles.selectedBookTitle}>{selectedBook.titolo}</Text>
                  <Text style={styles.selectedBookAuthor}>
                    {selectedBook.disciplina} - {getBookAuthor(selectedBook)}
                  </Text>
                </View>
              )}

              {/* Photo Section */}
              <Text style={styles.formLabel}>Foto del libro</Text>
              <View style={styles.photoSection}>
                {listingPhoto ? (
                  <View style={styles.photoPreview}>
                    <Image
                      source={{ uri: `data:image/jpeg;base64,${listingPhoto}` }}
                      style={styles.previewImage}
                    />
                    <TouchableOpacity
                      style={styles.removePhotoButton}
                      onPress={() => setListingPhoto(null)}
                    >
                      <Ionicons name="close-circle" size={24} color="#ff4444" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.photoButtons}>
                    <TouchableOpacity style={styles.photoButton} onPress={takePhoto}>
                      <Ionicons name="camera" size={24} color="#1a472a" />
                      <Text style={styles.photoButtonText}>Scatta</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.photoButton} onPress={pickImage}>
                      <Ionicons name="images" size={24} color="#1a472a" />
                      <Text style={styles.photoButtonText}>Galleria</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Condition Section */}
              <Text style={styles.formLabel}>Condizione</Text>
              <View style={styles.conditionOptions}>
                {['perfetto', 'buono', 'molto_usato'].map((cond) => (
                  <TouchableOpacity
                    key={cond}
                    style={[
                      styles.conditionOption,
                      listingCondition === cond && styles.conditionOptionActive,
                    ]}
                    onPress={() => setListingCondition(cond)}
                  >
                    <Text style={[
                      styles.conditionOptionText,
                      listingCondition === cond && styles.conditionOptionTextActive,
                    ]}>
                      {getConditionLabel(cond)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Price Section */}
              <Text style={styles.formLabel}>Prezzo di vendita</Text>
              <View style={styles.priceInput}>
                <Text style={styles.euroSign}>€</Text>
                <TextInput
                  style={styles.priceTextInput}
                  value={listingPrice}
                  onChangeText={setListingPrice}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                />
              </View>
              {selectedBook && (
                <Text style={styles.priceSuggestion}>
                  Prezzo suggerito: €{(getBookPrice(selectedBook) * 0.5).toFixed(2)} (50% del nuovo)
                </Text>
              )}

              {/* Submit Button */}
              <TouchableOpacity
                style={[styles.submitButton, creatingListing && styles.submitButtonDisabled]}
                onPress={createListing}
                disabled={creatingListing}
              >
                {creatingListing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="pricetag" size={20} color="#fff" />
                    <Text style={styles.submitButtonText}>Pubblica Annuncio</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a472a',
    padding: 16,
    paddingTop: 60,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
  },
  listingCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  listingImage: {
    width: '100%',
    height: 150,
    backgroundColor: '#f0f0f0',
  },
  listingContent: {
    padding: 16,
  },
  listingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statoText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  listingPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  listingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  listingAuthor: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
  },
  listingMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
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
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  deleteButtonText: {
    color: '#ff4444',
    fontSize: 13,
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
    color: '#2196F3',
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
  goToProfileButton: {
    marginTop: 16,
    backgroundColor: '#1a472a',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  goToProfileButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  // Book picker styles
  bookOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    marginBottom: 12,
  },
  bookOptionInfo: {
    flex: 1,
  },
  bookOptionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  bookOptionAuthor: {
    fontSize: 12,
    color: '#666',
  },
  bookOptionPrice: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '500',
    marginTop: 4,
  },
  emptyBooks: {
    alignItems: 'center',
    padding: 40,
  },
  emptyBooksText: {
    color: '#999',
  },
  // Listing form styles
  selectedBookInfo: {
    backgroundColor: '#e8f5e9',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  selectedBookTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a472a',
    marginBottom: 4,
  },
  selectedBookAuthor: {
    fontSize: 13,
    color: '#666',
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 16,
  },
  photoSection: {
    marginBottom: 8,
  },
  photoButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  photoButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f0f0',
    padding: 20,
    borderRadius: 12,
    gap: 8,
  },
  photoButtonText: {
    fontSize: 13,
    color: '#1a472a',
    fontWeight: '500',
  },
  photoPreview: {
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
  },
  removePhotoButton: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  conditionOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  conditionOption: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  conditionOptionActive: {
    borderColor: '#1a472a',
    backgroundColor: '#e8f5e9',
  },
  conditionOptionText: {
    fontSize: 12,
    color: '#666',
  },
  conditionOptionTextActive: {
    color: '#1a472a',
    fontWeight: 'bold',
  },
  priceInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  euroSign: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  priceTextInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    padding: 16,
  },
  priceSuggestion: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a472a',
    padding: 16,
    borderRadius: 12,
    marginTop: 24,
    marginBottom: 24,
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
