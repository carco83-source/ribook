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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const CONDITIONS = [
  { key: 'nuovo', label: 'Nuovo', percentage: 85, description: '-15% dal prezzo' },
  { key: 'come_nuovo', label: 'Come Nuovo', percentage: 60, description: '60% del prezzo' },
  { key: 'ottime_condizioni', label: 'Ottime Condizioni', percentage: 50, description: '50% del prezzo' },
  { key: 'buono', label: 'Buono', percentage: 40, description: '40% del prezzo' },
  { key: 'scarso', label: 'Scarso', percentage: 30, description: '30% del prezzo' },
];

interface Book {
  id: string;
  titolo: string;
  autore: string;
  isbn: string;
  materia: string;
  prezzo_ministeriale: number;
  classe: string;
}

export default function CreateListingScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [books, setBooks] = useState<Book[]>([]);
  const [filteredBooks, setFilteredBooks] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [selectedCondition, setSelectedCondition] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredBooks([]);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredBooks(
        books.filter(
          (book) =>
            book.titolo.toLowerCase().includes(query) ||
            book.isbn.includes(query)
        ).slice(0, 5)
      );
    }
  }, [searchQuery, books]);

  const loadData = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      setUserId(storedUserId);

      const response = await axios.get(`${API_URL}/api/books`);
      setBooks(response.data);
    } catch (error) {
      console.error('Error loading books:', error);
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permesso negato', 'Serve il permesso per accedere alla galleria');
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
      setPhoto(result.assets[0].base64);
    }
  };

  const calculatePrice = () => {
    if (!selectedBook || !selectedCondition) return 0;
    const condition = CONDITIONS.find((c) => c.key === selectedCondition);
    if (!condition) return 0;
    return (selectedBook.prezzo_ministeriale * condition.percentage) / 100;
  };

  const handleSubmit = async () => {
    if (!selectedBook) {
      Alert.alert('Errore', 'Seleziona un libro');
      return;
    }
    if (!selectedCondition) {
      Alert.alert('Errore', 'Seleziona la condizione del libro');
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API_URL}/api/listings?user_id=${userId}`, {
        book_id: selectedBook.id,
        condizione: selectedCondition,
        note: note || null,
        foto_base64: photo || null,
      });

      Alert.alert(
        'Annuncio creato!',
        `Il tuo libro è ora in vendita a €${calculatePrice().toFixed(2)}`,
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error: any) {
      console.error('Error creating listing:', error);
      Alert.alert(
        'Errore',
        error.response?.data?.detail || 'Impossibile creare l\'annuncio'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Book Selection */}
        <Text style={styles.sectionTitle}>1. Seleziona il libro</Text>
        
        {selectedBook ? (
          <View style={styles.selectedBookCard}>
            <View style={styles.selectedBookInfo}>
              <Text style={styles.selectedBookTitle}>{selectedBook.titolo}</Text>
              <Text style={styles.selectedBookAuthor}>{selectedBook.autore}</Text>
              <Text style={styles.selectedBookPrice}>
                Prezzo listino: €{selectedBook.prezzo_ministeriale.toFixed(2)}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.changeBookButton}
              onPress={() => setSelectedBook(null)}
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

            {filteredBooks.length > 0 && (
              <View style={styles.searchResults}>
                {filteredBooks.map((book) => (
                  <TouchableOpacity
                    key={book.id}
                    style={styles.searchResultItem}
                    onPress={() => {
                      setSelectedBook(book);
                      setSearchQuery('');
                      setFilteredBooks([]);
                    }}
                  >
                    <Text style={styles.searchResultTitle}>{book.titolo}</Text>
                    <Text style={styles.searchResultAuthor}>{book.autore}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Condition Selection */}
        {selectedBook && (
          <>
            <Text style={styles.sectionTitle}>2. Condizione del libro</Text>
            <View style={styles.conditionsContainer}>
              {CONDITIONS.map((condition) => (
                <TouchableOpacity
                  key={condition.key}
                  style={[
                    styles.conditionItem,
                    selectedCondition === condition.key && styles.conditionItemSelected,
                  ]}
                  onPress={() => setSelectedCondition(condition.key)}
                >
                  <View style={styles.conditionHeader}>
                    <Text
                      style={[
                        styles.conditionLabel,
                        selectedCondition === condition.key && styles.conditionLabelSelected,
                      ]}
                    >
                      {condition.label}
                    </Text>
                    {selectedCondition === condition.key && (
                      <Ionicons name="checkmark-circle" size={20} color="#1a472a" />
                    )}
                  </View>
                  <Text style={styles.conditionDescription}>{condition.description}</Text>
                  <Text style={styles.conditionPrice}>
                    €{((selectedBook.prezzo_ministeriale * condition.percentage) / 100).toFixed(2)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Photo */}
        {selectedBook && selectedCondition && (
          <>
            <Text style={styles.sectionTitle}>3. Foto (opzionale)</Text>
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

            {/* Note */}
            <Text style={styles.sectionTitle}>4. Note (opzionale)</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="Aggiungi note sullo stato del libro..."
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={3}
            />

            {/* Summary */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Riepilogo</Text>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Libro:</Text>
                <Text style={styles.summaryValue}>{selectedBook.titolo}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Condizione:</Text>
                <Text style={styles.summaryValue}>
                  {CONDITIONS.find((c) => c.key === selectedCondition)?.label}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Prezzo di vendita:</Text>
                <Text style={styles.summaryPrice}>€{calculatePrice().toFixed(2)}</Text>
              </View>
            </View>

            {/* Submit */}
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
          </>
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
    color: '#333',
    marginTop: 16,
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
  selectedBookPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a472a',
    marginTop: 8,
  },
  changeBookButton: {
    justifyContent: 'center',
  },
  conditionsContainer: {
    gap: 8,
  },
  conditionItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  conditionItemSelected: {
    borderColor: '#1a472a',
    backgroundColor: '#f0f8f0',
  },
  conditionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  conditionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  conditionLabelSelected: {
    color: '#1a472a',
  },
  conditionDescription: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  conditionPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a472a',
    marginTop: 8,
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
});
