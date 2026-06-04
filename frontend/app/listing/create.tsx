import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Condition questions with icons and labels
const CONDITION_QUESTIONS = [
  {
    key: 'sottolineature',
    question: 'Il libro ha scritte o evidenziature?',
    icon: 'pencil',
    options: [
      { value: 0, label: 'Nessuna', emoji: '✨' },
      { value: 1, label: 'Poche', emoji: '✏️' },
      { value: 2, label: 'Molte', emoji: '🖊️' },
    ],
  },
  {
    key: 'copertina',
    question: 'La copertina è rovinata?',
    icon: 'book',
    options: [
      { value: 0, label: 'No', emoji: '✨' },
      { value: 1, label: 'Un po\'', emoji: '⚠️' },
      { value: 2, label: 'Molto', emoji: '📉' },
    ],
  },
  {
    key: 'pagine',
    question: 'Le pagine hanno pieghe o orecchie?',
    icon: 'document-text',
    options: [
      { value: 0, label: 'Nessuna', emoji: '✨' },
      { value: 1, label: 'Qualcuna', emoji: '📄' },
      { value: 2, label: 'Molte', emoji: '📚' },
    ],
  },
  {
    key: 'esercizi',
    question: 'Gli esercizi sono già compilati?',
    icon: 'create',
    options: [
      { value: 0, label: 'No', emoji: '✨' },
      { value: 1, label: 'Qualcuno', emoji: '📝' },
      { value: 2, label: 'Molti', emoji: '📋' },
    ],
  },
];

// Calculate condition from answers
const calculateCondition = (answers: Record<string, number>) => {
  const total = Object.values(answers).reduce((sum, val) => sum + val, 0);
  if (total <= 2) return { key: 'perfetto', label: '🟢 Perfetto', percentage: 70 };
  if (total <= 5) return { key: 'buono', label: '🟡 Buono', percentage: 50 };
  return { key: 'molto_usato', label: '🔴 Molto usato', percentage: 30 };
};

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
  // MIUR additional fields
  sottotitolo?: string;
  volume?: string;
  is_volume_unico?: boolean;
  tipi_scuola?: string[];
  anni_corso?: number[];
  perc_usato_disponibile?: number;
  motivo_usato?: string;
  editore?: string;
}

// Helper to get price from book (handles both formats)
const getBookPrice = (book: Book): number => {
  return book.prezzo_ministeriale || book.prezzo_copertina || 0;
};

// Helper to get author from book (handles both formats)
const getBookAuthor = (book: Book): string => {
  return book.autore || book.autori || 'Autore non specificato';
};

// Helper to get subject from book (handles both formats)
const getBookSubject = (book: Book): string => {
  return book.materia || book.disciplina || 'Materia non specificata';
};

interface Bookstore {
  id: string;
  nome: string;
  indirizzo: string;
}

export default function CreateListingScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [conditionAnswers, setConditionAnswers] = useState<Record<string, number>>({
    sottolineature: 0,
    copertina: 0,
    pagine: 0,
    esercizi: 0,
  });
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  
  // Fascicoli state
  const [hasFascicoli, setHasFascicoli] = useState(false);
  const [fascicoliTotali, setFascicoliTotali] = useState(0);
  const [fascicoliPresenti, setFascicoliPresenti] = useState(0);
  
  // Bookstores - MULTIPLE selection
  const [bookstores, setBookstores] = useState<Bookstore[]>([]);
  const [selectedBookstores, setSelectedBookstores] = useState<string[]>([]);
  
  // Custom price option
  const [useCustomPrice, setUseCustomPrice] = useState(false);
  const [customPrice, setCustomPrice] = useState('');

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      setUserId(storedUserId);
      
      // Load bookstores
      const res = await axios.get(`${API_URL}/api/bookstores`);
      setBookstores(res.data);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  // Search books by query (title or ISBN)
  const searchBooks = async (query: string) => {
    if (query.length < 3) {
      setSearchResults([]);
      return;
    }
    
    try {
      // Get user info for class filtering
      const userInfo = await AsyncStorage.getItem('user_info');
      const user = userInfo ? JSON.parse(userInfo) : null;
      
      // Search with class filter
      const params: any = { search: query, limit: 10 };
      if (user) {
        params.classe = user.classe;
        params.tipo_scuola = user.tipo_scuola;
      }
      
      const response = await axios.get(`${API_URL}/api/books`, { params });
      setSearchResults(response.data);
    } catch (error) {
      console.error('Error searching books:', error);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      searchBooks(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      if (Platform.OS === 'web') {
        window.alert('Serve il permesso per accedere alla galleria');
      } else {
        Alert.alert('Permesso negato', 'Serve il permesso per accedere alla galleria');
      }
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
      setPhoto(result.assets[0].base64);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      if (Platform.OS === 'web') {
        window.alert('Serve il permesso per usare la fotocamera');
      } else {
        Alert.alert('Permesso negato', 'Serve il permesso per usare la fotocamera');
      }
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setPhoto(result.assets[0].base64);
    }
  };

  const calculatePrice = () => {
    if (!selectedBook) return 0;
    if (useCustomPrice && customPrice) {
      return parseFloat(customPrice) || 0;
    }
    const condition = calculateCondition(conditionAnswers);
    return (getBookPrice(selectedBook) * condition.percentage) / 100;
  };

  const getFinalPrice = () => {
    if (useCustomPrice && customPrice) {
      return parseFloat(customPrice) || 0;
    }
    return calculatePrice();
  };

  const handleSubmit = async () => {
    if (!selectedBook) {
      if (Platform.OS === 'web') {
        window.alert('Seleziona un libro');
      } else {
        Alert.alert('Errore', 'Seleziona un libro');
      }
      return;
    }

    setLoading(true);
    try {
      const finalPrice = getFinalPrice();
      await axios.post(`${API_URL}/api/listings?user_id=${userId}`, {
        book_id: selectedBook.id,
        condition_answers: useCustomPrice ? null : conditionAnswers,
        prezzo_vendita: useCustomPrice ? finalPrice : null,
        ha_fascicoli: hasFascicoli,
        fascicoli_totali: fascicoliTotali,
        fascicoli_presenti: fascicoliPresenti,
        bookstore_ids: selectedBookstores,
        note: note || null,
        foto_base64: photo || null,
      });

      if (Platform.OS === 'web') {
        window.alert(`Annuncio creato! Il tuo libro è ora in vendita a €${finalPrice.toFixed(2)}`);
        router.back();
      } else {
        Alert.alert(
          'Annuncio creato!',
          `Il tuo libro è ora in vendita a €${finalPrice.toFixed(2)}`,
          [{ text: 'OK', onPress: () => router.back() }]
        );
      }
    } catch (error: any) {
      console.error('Error creating listing:', error);
      const message = error.response?.data?.detail || 'Impossibile creare l\'annuncio';
      if (Platform.OS === 'web') {
        window.alert('Errore: ' + message);
      } else {
        Alert.alert('Errore', message);
      }
    } finally {
      setLoading(false);
    }
  };

  const currentCondition = calculateCondition(conditionAnswers);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <Stack.Screen 
        options={{ 
          title: 'Vendi un libro',
          headerStyle: { backgroundColor: '#1a472a' },
          headerTintColor: '#fff',
          headerLeft: () => (
            <TouchableOpacity 
              onPress={() => router.canGoBack() ? router.back() : router.push('/(tabs)/search')} 
              style={{ marginLeft: 16, padding: 8 }}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
          ),
        }} 
      />
      
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Step 1: Book Selection */}
        <Text style={styles.sectionTitle}>1. Seleziona il libro</Text>
        
        {selectedBook ? (
          <View style={styles.selectedBookCard}>
            <View style={styles.selectedBookInfo}>
              <Text style={styles.selectedBookTitle}>{selectedBook.titolo}</Text>
              <Text style={styles.selectedBookAuthor}>{getBookAuthor(selectedBook)}</Text>
              <Text style={styles.selectedBookISBN}>ISBN: {selectedBook.isbn}</Text>
              <Text style={styles.selectedBookPrice}>
                Prezzo listino: €{getBookPrice(selectedBook).toFixed(2)}
              </Text>
              {selectedBook.perc_usato_disponibile !== undefined && (
                <Text style={[
                  styles.selectedBookUsato,
                  { color: selectedBook.perc_usato_disponibile >= 50 ? '#4CAF50' : 
                           selectedBook.perc_usato_disponibile >= 30 ? '#FF9800' : '#f44336' }
                ]}>
                  Disponibilità usato: {selectedBook.perc_usato_disponibile}%
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.changeBookButton}
              onPress={() => {
                setSelectedBook(null);
                setSearchQuery('');
              }}
            >
              <Ionicons name="close-circle" size={24} color="#ff4444" />
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color="#666" />
              <TextInput
                style={styles.searchInput}
                placeholder="Cerca per titolo o ISBN..."
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {searchResults.length > 0 && (
              <View style={styles.searchResults}>
                {searchResults.map((book) => (
                  <TouchableOpacity
                    key={book.id || book.isbn}
                    style={styles.searchResultItem}
                    onPress={() => {
                      setSelectedBook(book);
                      setSearchQuery('');
                      setSearchResults([]);
                    }}
                  >
                    <Text style={styles.searchResultTitle}>{book.titolo}</Text>
                    <Text style={styles.searchResultAuthor}>{getBookAuthor(book)}</Text>
                    <Text style={styles.searchResultISBN}>ISBN: {book.isbn}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Step 2: Condition Questions */}
        {selectedBook && (
          <>
            <Text style={styles.sectionTitle}>2. Prezzo di vendita</Text>
            
            {/* Toggle prezzo automatico/personalizzato */}
            <View style={styles.priceToggleContainer}>
              <TouchableOpacity
                style={[
                  styles.priceToggleOption,
                  !useCustomPrice && styles.priceToggleOptionSelected
                ]}
                onPress={() => setUseCustomPrice(false)}
              >
                <Ionicons 
                  name={!useCustomPrice ? "radio-button-on" : "radio-button-off"} 
                  size={20} 
                  color={!useCustomPrice ? "#1a472a" : "#999"} 
                />
                <Text style={[
                  styles.priceToggleText,
                  !useCustomPrice && styles.priceToggleTextSelected
                ]}>
                  Prezzo automatico
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.priceToggleOption,
                  useCustomPrice && styles.priceToggleOptionSelected
                ]}
                onPress={() => setUseCustomPrice(true)}
              >
                <Ionicons 
                  name={useCustomPrice ? "radio-button-on" : "radio-button-off"} 
                  size={20} 
                  color={useCustomPrice ? "#1a472a" : "#999"} 
                />
                <Text style={[
                  styles.priceToggleText,
                  useCustomPrice && styles.priceToggleTextSelected
                ]}>
                  Prezzo personalizzato
                </Text>
              </TouchableOpacity>
            </View>

            {/* Prezzo personalizzato */}
            {useCustomPrice ? (
              <View style={styles.customPriceCard}>
                <Text style={styles.customPriceLabel}>Inserisci il prezzo desiderato:</Text>
                <View style={styles.customPriceInputContainer}>
                  <Text style={styles.currencySymbol}>€</Text>
                  <TextInput
                    style={styles.customPriceInput}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    value={customPrice}
                    onChangeText={setCustomPrice}
                  />
                </View>
                <Text style={styles.customPriceHint}>
                  Prezzo di copertina: €{getBookPrice(selectedBook).toFixed(2)}
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.sectionSubtitle}>
                  Rispondi a queste 4 domande - il prezzo viene calcolato automaticamente
                </Text>
                
                {CONDITION_QUESTIONS.map((q) => (
                  <View key={q.key} style={styles.questionCard}>
                    <View style={styles.questionHeader}>
                      <Ionicons name={q.icon as any} size={20} color="#1a472a" />
                      <Text style={styles.questionText}>{q.question}</Text>
                    </View>
                    <View style={styles.optionsRow}>
                      {q.options.map((opt) => (
                        <TouchableOpacity
                          key={opt.value}
                          style={[
                            styles.optionButton,
                            conditionAnswers[q.key] === opt.value && styles.optionButtonSelected,
                          ]}
                          onPress={() =>
                            setConditionAnswers({ ...conditionAnswers, [q.key]: opt.value })
                          }
                        >
                          <Text style={styles.optionEmoji}>{opt.emoji}</Text>
                          <Text
                            style={[
                              styles.optionLabel,
                              conditionAnswers[q.key] === opt.value && styles.optionLabelSelected,
                            ]}
                          >
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ))}

                {/* Condition Result */}
                <View style={styles.conditionResult}>
                  <Text style={styles.conditionResultLabel}>Condizione calcolata:</Text>
                  <Text style={styles.conditionResultValue}>{currentCondition.label}</Text>
                  <Text style={styles.conditionResultPrice}>
                    Prezzo: €{calculatePrice().toFixed(2)}
                  </Text>
                </View>
              </>
            )}
          </>
        )}

        {/* Step 3: Fascicoli */}
        {selectedBook && (
          <>
            <Text style={styles.sectionTitle}>3. Fascicoli allegati</Text>
            <View style={styles.fascicoliCard}>
              <TouchableOpacity
                style={styles.fascicoliToggle}
                onPress={() => setHasFascicoli(!hasFascicoli)}
              >
                <Ionicons
                  name={hasFascicoli ? 'checkbox' : 'square-outline'}
                  size={24}
                  color="#1a472a"
                />
                <Text style={styles.fascicoliToggleText}>
                  Questo libro ha fascicoli/allegati
                </Text>
              </TouchableOpacity>

              {hasFascicoli && (
                <View style={styles.fascicoliInputs}>
                  <View style={styles.fascicoliInputRow}>
                    <Text style={styles.fascicoliInputLabel}>Fascicoli totali previsti:</Text>
                    <View style={styles.counterContainer}>
                      <TouchableOpacity
                        style={styles.counterButton}
                        onPress={() => setFascicoliTotali(Math.max(0, fascicoliTotali - 1))}
                      >
                        <Ionicons name="remove" size={20} color="#1a472a" />
                      </TouchableOpacity>
                      <Text style={styles.counterValue}>{fascicoliTotali}</Text>
                      <TouchableOpacity
                        style={styles.counterButton}
                        onPress={() => setFascicoliTotali(fascicoliTotali + 1)}
                      >
                        <Ionicons name="add" size={20} color="#1a472a" />
                      </TouchableOpacity>
                    </View>
                  </View>
                  
                  <View style={styles.fascicoliInputRow}>
                    <Text style={styles.fascicoliInputLabel}>Fascicoli che hai:</Text>
                    <View style={styles.counterContainer}>
                      <TouchableOpacity
                        style={styles.counterButton}
                        onPress={() => setFascicoliPresenti(Math.max(0, fascicoliPresenti - 1))}
                      >
                        <Ionicons name="remove" size={20} color="#1a472a" />
                      </TouchableOpacity>
                      <Text style={styles.counterValue}>{fascicoliPresenti}</Text>
                      <TouchableOpacity
                        style={styles.counterButton}
                        onPress={() => setFascicoliPresenti(Math.min(fascicoliTotali, fascicoliPresenti + 1))}
                      >
                        <Ionicons name="add" size={20} color="#1a472a" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {fascicoliTotali > 0 && fascicoliPresenti < fascicoliTotali && (
                    <View style={styles.fascicoliWarning}>
                      <Ionicons name="warning" size={16} color="#e65100" />
                      <Text style={styles.fascicoliWarningText}>
                        Fascicoli mancanti: la condizione sarà "Molto usato"
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          </>
        )}

        {/* Step 4: Bookstore Selection */}
        {selectedBook && (
          <>
            <Text style={styles.sectionTitle}>4. Punto di ritiro</Text>
            <Text style={styles.sectionSubtitle}>
              Seleziona dove consegnerai il libro
            </Text>
            
            {bookstores.length > 0 ? (
              <View style={styles.bookstoreList}>
                {bookstores.map((store) => {
                  const isSelected = selectedBookstores.includes(store.id);
                  return (
                    <TouchableOpacity
                      key={store.id}
                      style={[
                        styles.bookstoreItem,
                        isSelected && styles.bookstoreItemSelected,
                      ]}
                      onPress={() => {
                        if (isSelected) {
                          setSelectedBookstores(selectedBookstores.filter(id => id !== store.id));
                        } else {
                          setSelectedBookstores([...selectedBookstores, store.id]);
                        }
                      }}
                    >
                      <Ionicons
                        name={isSelected ? 'checkbox' : 'square-outline'}
                        size={24}
                        color="#1a472a"
                      />
                      <View style={styles.bookstoreInfo}>
                        <Text style={styles.bookstoreName}>{store.nome}</Text>
                        <Text style={styles.bookstoreAddress}>{store.indirizzo}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
                {selectedBookstores.length > 0 && (
                  <View style={styles.selectedBookstoresInfo}>
                    <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                    <Text style={styles.selectedBookstoresText}>
                      {selectedBookstores.length} cartolibreri{selectedBookstores.length === 1 ? 'a' : 'e'} selezionat{selectedBookstores.length === 1 ? 'a' : 'e'}
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              <Text style={styles.noBookstoresText}>
                Nessuna cartolibreria disponibile al momento
              </Text>
            )}
          </>
        )}

        {/* Step 5: Photo */}
        {selectedBook && (
          <>
            <Text style={styles.sectionTitle}>5. Foto (consigliata)</Text>
            <Text style={styles.sectionSubtitle}>
              📸 Scatta una foto della pagina peggiore per aumentare la fiducia
            </Text>
            
            <View style={styles.photoSection}>
              {photo ? (
                <View style={styles.photoPreview}>
                  <Image
                    source={{ uri: `data:image/jpeg;base64,${photo}` }}
                    style={styles.photoImage}
                  />
                  <TouchableOpacity
                    style={styles.removePhotoButton}
                    onPress={() => setPhoto(null)}
                  >
                    <Ionicons name="close-circle" size={28} color="#ff4444" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.photoButtons}>
                  <TouchableOpacity style={styles.photoButton} onPress={takePhoto}>
                    <Ionicons name="camera" size={32} color="#1a472a" />
                    <Text style={styles.photoButtonText}>Scatta foto</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.photoButton} onPress={pickImage}>
                    <Ionicons name="images" size={32} color="#1a472a" />
                    <Text style={styles.photoButtonText}>Galleria</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </>
        )}

        {/* Step 6: Notes */}
        {selectedBook && (
          <>
            <Text style={styles.sectionTitle}>6. Note (opzionale)</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="Aggiungi note sullo stato del libro..."
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={3}
            />
          </>
        )}

        {/* Summary */}
        {selectedBook && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Riepilogo</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Libro:</Text>
              <Text style={styles.summaryValue}>{selectedBook.titolo}</Text>
            </View>
            {!useCustomPrice && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Condizione:</Text>
                <Text style={styles.summaryValue}>{currentCondition.label}</Text>
              </View>
            )}
            {useCustomPrice && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Tipo prezzo:</Text>
                <Text style={styles.summaryValue}>Personalizzato</Text>
              </View>
            )}
            {hasFascicoli && fascicoliTotali > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Fascicoli:</Text>
                <Text style={styles.summaryValue}>
                  {fascicoliPresenti}/{fascicoliTotali}
                </Text>
              </View>
            )}
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Prezzo di vendita:</Text>
              <Text style={styles.summaryPrice}>€{getFinalPrice().toFixed(2)}</Text>
            </View>
          </View>
        )}

        {/* Submit */}
        {selectedBook && (
          <TouchableOpacity
            style={styles.submitButton}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>Pubblica Annuncio</Text>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a472a',
    marginTop: 20,
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
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
  searchResults: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    overflow: 'hidden',
  },
  searchResultItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  searchResultTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  searchResultAuthor: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  searchResultISBN: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  selectedBookCard: {
    flexDirection: 'row',
    backgroundColor: '#e8f5e9',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1a472a',
  },
  selectedBookInfo: {
    flex: 1,
  },
  selectedBookTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a472a',
  },
  selectedBookAuthor: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  selectedBookISBN: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  selectedBookPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a472a',
    marginTop: 8,
  },
  selectedBookUsato: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
  },
  changeBookButton: {
    justifyContent: 'center',
  },
  questionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  questionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    flex: 1,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  optionButton: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    backgroundColor: '#fafafa',
  },
  optionButtonSelected: {
    borderColor: '#1a472a',
    backgroundColor: '#e8f5e9',
  },
  optionEmoji: {
    fontSize: 20,
    marginBottom: 4,
  },
  optionLabel: {
    fontSize: 12,
    color: '#666',
  },
  optionLabelSelected: {
    color: '#1a472a',
    fontWeight: '600',
  },
  conditionResult: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1a472a',
  },
  conditionResultLabel: {
    fontSize: 12,
    color: '#666',
  },
  conditionResultValue: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 4,
  },
  conditionResultPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a472a',
    marginTop: 8,
  },
  fascicoliCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  fascicoliToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fascicoliToggleText: {
    fontSize: 14,
    color: '#333',
  },
  fascicoliInputs: {
    marginTop: 16,
    gap: 12,
  },
  fascicoliInputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fascicoliInputLabel: {
    fontSize: 14,
    color: '#666',
  },
  counterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  counterButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e8f5e9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  counterValue: {
    fontSize: 18,
    fontWeight: '600',
    minWidth: 24,
    textAlign: 'center',
  },
  fascicoliWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff3e0',
    padding: 12,
    borderRadius: 8,
  },
  fascicoliWarningText: {
    fontSize: 12,
    color: '#e65100',
    flex: 1,
  },
  bookstoreList: {
    gap: 8,
  },
  bookstoreItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  bookstoreItemSelected: {
    backgroundColor: '#e8f5e9',
    borderWidth: 1,
    borderColor: '#1a472a',
  },
  bookstoreInfo: {
    flex: 1,
  },
  bookstoreName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  bookstoreAddress: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  noBookstoresText: {
    textAlign: 'center',
    color: '#999',
    padding: 20,
  },
  photoSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  photoButtons: {
    flexDirection: 'row',
    gap: 16,
  },
  photoButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
    borderRadius: 12,
  },
  photoButtonText: {
    marginTop: 8,
    color: '#1a472a',
    fontWeight: '500',
  },
  photoPreview: {
    position: 'relative',
  },
  photoImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  removePhotoButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#fff',
    borderRadius: 14,
  },
  noteInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#666',
  },
  summaryValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
    marginLeft: 8,
  },
  summaryPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  submitButton: {
    backgroundColor: '#1a472a',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  selectedBookstoresInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
  },
  selectedBookstoresText: {
    fontSize: 13,
    color: '#2e7d32',
    fontWeight: '500',
  },
  priceToggleContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  priceToggleOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  priceToggleOptionSelected: {
    borderColor: '#1a472a',
    backgroundColor: '#e8f5e9',
  },
  priceToggleText: {
    fontSize: 14,
    color: '#666',
  },
  priceToggleTextSelected: {
    color: '#1a472a',
    fontWeight: '600',
  },
  customPriceCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    borderWidth: 2,
    borderColor: '#1a472a',
  },
  customPriceLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  customPriceInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  currencySymbol: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a472a',
    marginRight: 8,
  },
  customPriceInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a472a',
    paddingVertical: 16,
  },
  customPriceHint: {
    fontSize: 12,
    color: '#888',
    marginTop: 12,
    textAlign: 'center',
  },
});
