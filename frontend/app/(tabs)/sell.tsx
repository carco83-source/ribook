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
  Switch,
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
  autori?: string;
  disciplina?: string;
  prezzo_copertina?: number;
  prezzo_suggerito?: number;
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

// Condition options with traffic light colors
const CONDITION_OPTIONS = [
  { value: 'perfetto', label: 'Perfetto', color: '#4CAF50', icon: 'checkmark-circle' },
  { value: 'buono', label: 'Buono', color: '#FF9800', icon: 'alert-circle' },
  { value: 'molto_usato', label: 'Molto Usato', color: '#f44336', icon: 'close-circle' },
];

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
  
  // Form fields
  const [listingCondition, setListingCondition] = useState('buono');
  const [listingPrice, setListingPrice] = useState('');
  const [listingPhotos, setListingPhotos] = useState<string[]>([]);
  const [hasWritings, setHasWritings] = useState(false);
  const [hasHighlights, setHasHighlights] = useState(false);
  const [hasFolds, setHasFolds] = useState(false);
  const [coverCondition, setCoverCondition] = useState('buona');
  const [pagesCondition, setPagesCondition] = useState('buone');
  const [selectedBookshop, setSelectedBookshop] = useState('');
  const [notes, setNotes] = useState('');
  const [creatingListing, setCreatingListing] = useState(false);

  // Bookshop options
  const bookshops = [
    { id: 'privato', name: 'Vendita Privata' },
    { id: 'cartoleria_centro', name: 'Cartolibreria Centro' },
    { id: 'libreria_scolastica', name: 'Libreria Scolastica' },
    { id: 'altro', name: 'Altra Cartolibreria' },
  ];

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
      // Use the new endpoint with compatibility logic
      const response = await axios.get(
        `${API_URL}/api/profiles/${userId}/children/${child.id}/books-to-sell`
      );
      
      if (response.data.books && response.data.books.length > 0) {
        setBooksToSell(response.data.books);
        setTargetClasse(response.data.classe_destinazione);
        setShowBookPicker(true);
      } else {
        Alert.alert(
          'Nessun libro vendibile',
          response.data.message || `${child.nome_figlio} non ha libri compatibili da vendere.`
        );
        setBooksToSell([]);
      }
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
    
    // Reset form
    setListingPrice((book.prezzo_suggerito || (book.prezzo_copertina || 0) * 0.5).toFixed(2));
    setListingCondition('buono');
    setListingPhotos([]);
    setHasWritings(false);
    setHasHighlights(false);
    setHasFolds(false);
    setCoverCondition('buona');
    setPagesCondition('buone');
    setSelectedBookshop('privato');
    setNotes('');
    
    setShowListingForm(true);
  };

  const pickImage = async () => {
    if (listingPhotos.length >= 4) {
      Alert.alert('Limite raggiunto', 'Puoi caricare massimo 4 foto');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setListingPhotos([...listingPhotos, result.assets[0].base64]);
    }
  };

  const takePhoto = async () => {
    if (listingPhotos.length >= 4) {
      Alert.alert('Limite raggiunto', 'Puoi caricare massimo 4 foto');
      return;
    }

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
      setListingPhotos([...listingPhotos, result.assets[0].base64]);
    }
  };

  const removePhoto = (index: number) => {
    setListingPhotos(listingPhotos.filter((_, i) => i !== index));
  };

  const createListing = async () => {
    if (!selectedBook || !userId) return;

    const price = parseFloat(listingPrice);
    if (isNaN(price) || price <= 0) {
      Alert.alert('Errore', 'Inserisci un prezzo valido');
      return;
    }

    if (listingPhotos.length === 0) {
      Alert.alert('Foto richiesta', 'Aggiungi almeno una foto del libro');
      return;
    }

    setCreatingListing(true);
    try {
      await axios.post(`${API_URL}/api/listings?user_id=${userId}`, {
        book_id: selectedBook.isbn || selectedBook.id,
        book_isbn: selectedBook.isbn,
        book_titolo: selectedBook.titolo,
        book_autori: selectedBook.autori,
        book_disciplina: selectedBook.disciplina,
        prezzo_copertina: selectedBook.prezzo_copertina,
        condizione: listingCondition,
        prezzo_vendita: price,
        foto_base64: listingPhotos[0], // Main photo
        foto_aggiuntive: listingPhotos.slice(1), // Additional photos
        has_writings: hasWritings,
        has_highlights: hasHighlights,
        has_folds: hasFolds,
        cover_condition: coverCondition,
        pages_condition: pagesCondition,
        bookshop: selectedBookshop,
        notes: notes,
        child_profile_id: selectedChild?.id,
        child_name: selectedChild?.nome_figlio,
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
            } catch (error: any) {
              Alert.alert('Errore', error.response?.data?.detail || 'Impossibile eliminare');
            }
          },
        },
      ]
    );
  };

  const getConditionConfig = (condition: string) => {
    return CONDITION_OPTIONS.find(c => c.value === condition) || CONDITION_OPTIONS[1];
  };

  const getStatoConfig = (stato: string) => {
    switch (stato) {
      case 'disponibile':
        return { color: '#4CAF50', label: 'In vendita', icon: 'pricetag' };
      case 'venduto':
        return { color: '#FF9800', label: 'Da consegnare', icon: 'time' };
      case 'consegnato':
        return { color: '#2196F3', label: 'Consegnato', icon: 'checkmark-circle' };
      default:
        return { color: '#666', label: stato, icon: 'ellipse' };
    }
  };

  const renderListing = ({ item }: { item: Listing }) => {
    const statoConfig = getStatoConfig(item.stato);
    const condConfig = getConditionConfig(item.condizione);
    
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
            <View style={[styles.statoBadge, { backgroundColor: statoConfig.color }]}>
              <Ionicons name={statoConfig.icon as any} size={12} color="#fff" />
              <Text style={styles.statoText}>{statoConfig.label}</Text>
            </View>
            <Text style={styles.listingPrice}>€{item.prezzo_vendita.toFixed(2)}</Text>
          </View>

          <Text style={styles.listingTitle} numberOfLines={2}>{item.book_titolo}</Text>

          <View style={styles.listingMeta}>
            <View style={[styles.conditionBadge, { borderColor: condConfig.color }]}>
              <Ionicons name={condConfig.icon as any} size={14} color={condConfig.color} />
              <Text style={[styles.conditionText, { color: condConfig.color }]}>
                {condConfig.label}
              </Text>
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
      {/* Header */}
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
                    <View style={[styles.childOptionIcon, { backgroundColor: canSell ? '#e8f5e9' : '#f0f0f0' }]}>
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
                Libri di {selectedChild.nome_figlio} vendibili alla {targetClasse}ª
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
                        {item.disciplina}
                      </Text>
                      <Text style={styles.bookOptionPrice}>
                        Prezzo suggerito: €{item.prezzo_suggerito?.toFixed(2) || ((item.prezzo_copertina || 0) * 0.5).toFixed(2)}
                      </Text>
                    </View>
                    <Ionicons name="add-circle" size={28} color="#1a472a" />
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={styles.emptyBooks}>
                    <Ionicons name="book-outline" size={48} color="#ccc" />
                    <Text style={styles.emptyBooksText}>Nessun libro vendibile</Text>
                    <Text style={styles.emptyBooksSubtext}>
                      I libri potrebbero avere edizione diversa
                    </Text>
                  </View>
                }
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Detailed Listing Form Modal */}
      <Modal
        visible={showListingForm}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowListingForm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '95%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Dettagli Annuncio</Text>
              <TouchableOpacity onPress={() => setShowListingForm(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Book Info */}
              {selectedBook && (
                <View style={styles.selectedBookInfo}>
                  <Text style={styles.selectedBookTitle}>{selectedBook.titolo}</Text>
                  <Text style={styles.selectedBookAuthor}>
                    {selectedBook.disciplina}
                  </Text>
                </View>
              )}

              {/* Photos Section */}
              <Text style={styles.formLabel}>Foto del libro *</Text>
              <View style={styles.photosGrid}>
                {listingPhotos.map((photo, index) => (
                  <View key={index} style={styles.photoItem}>
                    <Image
                      source={{ uri: `data:image/jpeg;base64,${photo}` }}
                      style={styles.photoThumbnail}
                    />
                    <TouchableOpacity
                      style={styles.removePhotoBtn}
                      onPress={() => removePhoto(index)}
                    >
                      <Ionicons name="close-circle" size={22} color="#ff4444" />
                    </TouchableOpacity>
                  </View>
                ))}
                {listingPhotos.length < 4 && (
                  <View style={styles.addPhotoButtons}>
                    <TouchableOpacity style={styles.addPhotoBtn} onPress={takePhoto}>
                      <Ionicons name="camera" size={24} color="#1a472a" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.addPhotoBtn} onPress={pickImage}>
                      <Ionicons name="images" size={24} color="#1a472a" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              <Text style={styles.photoHint}>Aggiungi fino a 4 foto</Text>

              {/* Condition - Traffic Light */}
              <Text style={styles.formLabel}>Condizione Generale</Text>
              <View style={styles.trafficLightContainer}>
                {CONDITION_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.trafficLightOption,
                      listingCondition === option.value && { borderColor: option.color, borderWidth: 3 }
                    ]}
                    onPress={() => setListingCondition(option.value)}
                  >
                    <View style={[styles.trafficLight, { backgroundColor: option.color }]}>
                      <Ionicons name={option.icon as any} size={24} color="#fff" />
                    </View>
                    <Text style={[styles.trafficLightLabel, { color: option.color }]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Detailed Conditions */}
              <Text style={styles.formLabel}>Dettagli Condizione</Text>
              <View style={styles.detailsContainer}>
                <View style={styles.detailRow}>
                  <View style={styles.detailInfo}>
                    <Ionicons name="pencil" size={20} color="#666" />
                    <Text style={styles.detailLabel}>Scritte a penna/matita</Text>
                  </View>
                  <Switch
                    value={hasWritings}
                    onValueChange={setHasWritings}
                    trackColor={{ false: '#e0e0e0', true: '#FF9800' }}
                    thumbColor={hasWritings ? '#fff' : '#fff'}
                  />
                </View>

                <View style={styles.detailRow}>
                  <View style={styles.detailInfo}>
                    <Ionicons name="color-fill" size={20} color="#666" />
                    <Text style={styles.detailLabel}>Evidenziature</Text>
                  </View>
                  <Switch
                    value={hasHighlights}
                    onValueChange={setHasHighlights}
                    trackColor={{ false: '#e0e0e0', true: '#FF9800' }}
                    thumbColor={hasHighlights ? '#fff' : '#fff'}
                  />
                </View>

                <View style={styles.detailRow}>
                  <View style={styles.detailInfo}>
                    <Ionicons name="document" size={20} color="#666" />
                    <Text style={styles.detailLabel}>Pieghe/Orecchie</Text>
                  </View>
                  <Switch
                    value={hasFolds}
                    onValueChange={setHasFolds}
                    trackColor={{ false: '#e0e0e0', true: '#FF9800' }}
                    thumbColor={hasFolds ? '#fff' : '#fff'}
                  />
                </View>
              </View>

              {/* Cover Condition */}
              <Text style={styles.formLabel}>Condizione Copertina</Text>
              <View style={styles.optionsRow}>
                {['perfetta', 'buona', 'usurata'].map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[
                      styles.optionChip,
                      coverCondition === opt && styles.optionChipActive
                    ]}
                    onPress={() => setCoverCondition(opt)}
                  >
                    <Text style={[
                      styles.optionChipText,
                      coverCondition === opt && styles.optionChipTextActive
                    ]}>
                      {opt.charAt(0).toUpperCase() + opt.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Pages Condition */}
              <Text style={styles.formLabel}>Condizione Pagine</Text>
              <View style={styles.optionsRow}>
                {['perfette', 'buone', 'ingiallite'].map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[
                      styles.optionChip,
                      pagesCondition === opt && styles.optionChipActive
                    ]}
                    onPress={() => setPagesCondition(opt)}
                  >
                    <Text style={[
                      styles.optionChipText,
                      pagesCondition === opt && styles.optionChipTextActive
                    ]}>
                      {opt.charAt(0).toUpperCase() + opt.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Bookshop Selection */}
              <Text style={styles.formLabel}>Punto di scambio</Text>
              <View style={styles.bookshopOptions}>
                {bookshops.map((shop) => (
                  <TouchableOpacity
                    key={shop.id}
                    style={[
                      styles.bookshopOption,
                      selectedBookshop === shop.id && styles.bookshopOptionActive
                    ]}
                    onPress={() => setSelectedBookshop(shop.id)}
                  >
                    <Ionicons 
                      name={selectedBookshop === shop.id ? "radio-button-on" : "radio-button-off"} 
                      size={20} 
                      color={selectedBookshop === shop.id ? "#1a472a" : "#666"} 
                    />
                    <Text style={[
                      styles.bookshopOptionText,
                      selectedBookshop === shop.id && styles.bookshopOptionTextActive
                    ]}>
                      {shop.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Price */}
              <Text style={styles.formLabel}>Prezzo di vendita</Text>
              <View style={styles.priceInputContainer}>
                <Text style={styles.euroSign}>€</Text>
                <TextInput
                  style={styles.priceInput}
                  value={listingPrice}
                  onChangeText={setListingPrice}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                />
              </View>
              {selectedBook && (
                <Text style={styles.priceSuggestion}>
                  Prezzo suggerito: €{selectedBook.prezzo_suggerito?.toFixed(2) || ((selectedBook.prezzo_copertina || 0) * 0.5).toFixed(2)} (50% del nuovo)
                </Text>
              )}

              {/* Notes */}
              <Text style={styles.formLabel}>Note aggiuntive (opzionale)</Text>
              <TextInput
                style={styles.notesInput}
                value={notes}
                onChangeText={setNotes}
                placeholder="Es: Alcune pagine sottolineate a matita..."
                multiline
                numberOfLines={3}
              />

              {/* Submit */}
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
    marginBottom: 8,
  },
  listingMeta: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  conditionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  conditionText: {
    fontSize: 12,
    fontWeight: '500',
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
  // Book picker
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
    fontSize: 16,
    color: '#666',
    marginTop: 12,
  },
  emptyBooksSubtext: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  // Form styles
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
    marginBottom: 10,
    marginTop: 16,
  },
  // Photos
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  photoItem: {
    position: 'relative',
  },
  photoThumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  removePhotoBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
  },
  addPhotoButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  addPhotoBtn: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ddd',
    borderStyle: 'dashed',
  },
  photoHint: {
    fontSize: 11,
    color: '#999',
    marginTop: 6,
  },
  // Traffic light
  trafficLightContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  trafficLightOption: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f8f9fa',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  trafficLight: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  trafficLightLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  // Details
  detailsContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  detailInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  detailLabel: {
    fontSize: 14,
    color: '#333',
  },
  // Options
  optionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  optionChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  optionChipActive: {
    backgroundColor: '#e8f5e9',
    borderWidth: 1,
    borderColor: '#1a472a',
  },
  optionChipText: {
    fontSize: 13,
    color: '#666',
  },
  optionChipTextActive: {
    color: '#1a472a',
    fontWeight: '600',
  },
  // Bookshop
  bookshopOptions: {
    gap: 8,
  },
  bookshopOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    gap: 10,
  },
  bookshopOptionActive: {
    backgroundColor: '#e8f5e9',
  },
  bookshopOptionText: {
    fontSize: 14,
    color: '#666',
  },
  bookshopOptionTextActive: {
    color: '#1a472a',
    fontWeight: '500',
  },
  // Price
  priceInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  euroSign: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  priceInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    padding: 16,
  },
  priceSuggestion: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
  },
  // Notes
  notesInput: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  // Submit
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
