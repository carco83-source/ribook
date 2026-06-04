import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
  Platform,
  TextInput,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Stesse domande della creazione
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

// Calcola condizione dalle risposte (stesso algoritmo della creazione)
const calculateCondition = (answers: Record<string, number>) => {
  const total = Object.values(answers).reduce((sum, val) => sum + val, 0);
  if (total <= 2) return { key: 'perfetto', label: '🟢 Perfetto', percentage: 70 };
  if (total <= 5) return { key: 'buono', label: '🟡 Buono', percentage: 50 };
  return { key: 'molto_usato', label: '🔴 Molto usato', percentage: 30 };
};

interface Bookstore {
  id: string;
  nome: string;
  indirizzo: string;
}

export default function MyListingDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  
  const [loading, setLoading] = useState(true);
  const [listing, setListing] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null);
  
  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Editable fields - stessi della creazione
  const [conditionAnswers, setConditionAnswers] = useState<Record<string, number>>({
    sottolineature: 0,
    copertina: 0,
    pagine: 0,
    esercizi: 0,
  });
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  
  // Fascicoli
  const [hasFascicoli, setHasFascicoli] = useState(false);
  const [fascicoliTotali, setFascicoliTotali] = useState(0);
  const [fascicoliPresenti, setFascicoliPresenti] = useState(0);
  
  // Bookstores
  const [bookstores, setBookstores] = useState<Bookstore[]>([]);
  const [selectedBookstores, setSelectedBookstores] = useState<string[]>([]);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      setUserId(storedUserId);

      // Carica listing
      const response = await axios.get(`${API_URL}/api/listings/${id}`);
      const data = response.data;
      setListing(data);
      
      // Imposta valori dai dati salvati
      setNote(data.note || data.descrizione || '');
      setPhoto(data.foto_base64 || null);
      
      // Imposta risposte condizioni (se salvate)
      if (data.condition_answers) {
        setConditionAnswers(data.condition_answers);
      } else if (data.condition_details) {
        // Fallback: prova a ricostruire dalle condition_details
        setConditionAnswers({
          sottolineature: data.condition_details.sottolineature || 0,
          copertina: data.condition_details.copertina || 0,
          pagine: data.condition_details.pagine || 0,
          esercizi: data.condition_details.esercizi || 0,
        });
      }
      
      // Fascicoli
      setHasFascicoli(data.ha_fascicoli || false);
      setFascicoliTotali(data.fascicoli_totali || 0);
      setFascicoliPresenti(data.fascicoli_presenti || 0);
      
      // Bookstores selezionati
      setSelectedBookstores(data.bookstore_ids || []);
      
      // Carica lista bookstores
      const bsRes = await axios.get(`${API_URL}/api/bookstores`);
      setBookstores(bsRes.data);
      
    } catch (error) {
      console.error('Error loading listing:', error);
      if (Platform.OS === 'web') {
        window.alert('Impossibile caricare i dettagli dell\'annuncio');
      } else {
        Alert.alert('Errore', 'Impossibile caricare i dettagli dell\'annuncio');
      }
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const canEdit = () => {
    if (!listing) return false;
    const hasActiveOrder = listing.order_id || listing.stato === 'riservato' || listing.stato === 'venduto';
    return listing.stato === 'disponibile' && !hasActiveOrder;
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
    if (!listing) return 0;
    const condition = calculateCondition(conditionAnswers);
    const basePrice = listing.prezzo_ministeriale || listing.prezzo_copertina || 0;
    return (basePrice * condition.percentage) / 100;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const newPrice = calculatePrice();
      
      await axios.put(`${API_URL}/api/listings/${id}`, {
        seller_id: userId,
        condition_answers: conditionAnswers,
        prezzo_vendita: newPrice,
        note: note || null,
        descrizione: note || null,
        foto_base64: photo ? (photo.startsWith('data:') ? photo : `data:image/jpeg;base64,${photo}`) : null,
        ha_fascicoli: hasFascicoli,
        fascicoli_totali: fascicoliTotali,
        fascicoli_presenti: fascicoliPresenti,
        bookstore_ids: selectedBookstores,
      });

      if (Platform.OS === 'web') {
        window.alert('Annuncio aggiornato con successo!');
      } else {
        Alert.alert('Successo', 'Annuncio aggiornato con successo!');
      }
      setIsEditing(false);
      loadData();
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Errore durante il salvataggio';
      if (Platform.OS === 'web') {
        window.alert('Errore: ' + message);
      } else {
        Alert.alert('Errore', message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const confirmDelete = Platform.OS === 'web'
      ? window.confirm('Sei sicuro di voler eliminare questo annuncio? L\'azione è irreversibile.')
      : await new Promise((resolve) => {
          Alert.alert(
            'Elimina annuncio',
            'Sei sicuro di voler eliminare questo annuncio? L\'azione è irreversibile.',
            [
              { text: 'Annulla', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Elimina', style: 'destructive', onPress: () => resolve(true) },
            ]
          );
        });

    if (!confirmDelete) return;

    try {
      await axios.delete(`${API_URL}/api/listings/${id}?seller_id=${userId}`);
      if (Platform.OS === 'web') {
        window.alert('Annuncio eliminato');
      } else {
        Alert.alert('Successo', 'Annuncio eliminato');
      }
      router.back();
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Errore durante l\'eliminazione';
      if (Platform.OS === 'web') {
        window.alert('Errore: ' + message);
      } else {
        Alert.alert('Errore', message);
      }
    }
  };

  const getStatusInfo = () => {
    if (!listing) return { label: 'Sconosciuto', color: '#999', bg: '#f0f0f0' };
    
    switch (listing.stato) {
      case 'disponibile':
        return { label: 'In vendita', color: '#4CAF50', bg: '#E8F5E9' };
      case 'riservato':
        return { label: 'In trattativa', color: '#FF9800', bg: '#FFF3E0' };
      case 'venduto':
        return { label: 'Venduto', color: '#2196F3', bg: '#E3F2FD' };
      default:
        return { label: listing.stato, color: '#666', bg: '#f0f0f0' };
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#1a472a" />
        <Text style={styles.loadingText}>Caricamento...</Text>
      </View>
    );
  }

  if (!listing) {
    return (
      <View style={[styles.container, styles.centerContent, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle" size={64} color="#f44336" />
        <Text style={styles.errorText}>Annuncio non trovato</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Torna indietro</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusInfo = getStatusInfo();
  const currentCondition = calculateCondition(conditionAnswers);
  const coverUrl = listing.foto_base64 || `https://www.ibs.it/images/${listing.book_isbn}_0_0_0_180_50.jpg`;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Il mio annuncio</Text>
        {canEdit() && !isEditing && (
          <TouchableOpacity style={styles.headerBtn} onPress={() => setIsEditing(true)}>
            <Ionicons name="create-outline" size={24} color="#2196F3" />
          </TouchableOpacity>
        )}
        {isEditing && (
          <TouchableOpacity style={styles.headerBtn} onPress={() => { setIsEditing(false); loadData(); }}>
            <Ionicons name="close" size={24} color="#f44336" />
          </TouchableOpacity>
        )}
        {!isEditing && !canEdit() && <View style={{ width: 40 }} />}
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Status Badge */}
        <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
          <View style={[styles.statusDot, { backgroundColor: statusInfo.color }]} />
          <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
        </View>

        {/* Book Info Card */}
        <View style={styles.bookCard}>
          <Image source={{ uri: coverUrl }} style={styles.bookCover} resizeMode="cover" />
          <View style={styles.bookInfo}>
            <Text style={styles.bookTitle} numberOfLines={2}>{listing.book_titolo}</Text>
            {listing.book_autori && (
              <Text style={styles.bookAuthor}>{listing.book_autori}</Text>
            )}
            <Text style={styles.bookIsbn}>ISBN: {listing.book_isbn}</Text>
            <Text style={styles.bookOriginalPrice}>
              Prezzo listino: €{(listing.prezzo_ministeriale || listing.prezzo_copertina || 0).toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Condizioni - STESSO FORMATO DELLA CREAZIONE */}
        <Text style={styles.sectionTitle}>Condizione del libro</Text>
        {isEditing && (
          <Text style={styles.sectionSubtitle}>
            Rispondi a queste 4 domande - il prezzo viene calcolato automaticamente
          </Text>
        )}
        
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
                    !isEditing && styles.optionButtonDisabled,
                  ]}
                  onPress={() => {
                    if (isEditing) {
                      setConditionAnswers({ ...conditionAnswers, [q.key]: opt.value });
                    }
                  }}
                  disabled={!isEditing}
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

        {/* Risultato condizione e prezzo */}
        <View style={styles.conditionResult}>
          <Text style={styles.conditionResultLabel}>Condizione calcolata:</Text>
          <Text style={styles.conditionResultValue}>{currentCondition.label}</Text>
          <Text style={styles.conditionResultPrice}>
            Prezzo: €{calculatePrice().toFixed(2)}
          </Text>
        </View>

        {/* Fascicoli - STESSO FORMATO DELLA CREAZIONE */}
        <Text style={styles.sectionTitle}>Fascicoli allegati</Text>
        <View style={styles.fascicoliCard}>
          <TouchableOpacity
            style={styles.fascicoliToggle}
            onPress={() => isEditing && setHasFascicoli(!hasFascicoli)}
            disabled={!isEditing}
          >
            <Ionicons
              name={hasFascicoli ? 'checkbox' : 'square-outline'}
              size={24}
              color={isEditing ? '#1a472a' : '#999'}
            />
            <Text style={[styles.fascicoliToggleText, !isEditing && { color: '#666' }]}>
              Questo libro ha fascicoli/allegati
            </Text>
          </TouchableOpacity>

          {hasFascicoli && (
            <View style={styles.fascicoliInputs}>
              <View style={styles.fascicoliInputRow}>
                <Text style={styles.fascicoliInputLabel}>Fascicoli totali previsti:</Text>
                <View style={styles.counterContainer}>
                  <TouchableOpacity
                    style={[styles.counterButton, !isEditing && styles.counterButtonDisabled]}
                    onPress={() => isEditing && setFascicoliTotali(Math.max(0, fascicoliTotali - 1))}
                    disabled={!isEditing}
                  >
                    <Ionicons name="remove" size={20} color={isEditing ? '#1a472a' : '#999'} />
                  </TouchableOpacity>
                  <Text style={styles.counterValue}>{fascicoliTotali}</Text>
                  <TouchableOpacity
                    style={[styles.counterButton, !isEditing && styles.counterButtonDisabled]}
                    onPress={() => isEditing && setFascicoliTotali(fascicoliTotali + 1)}
                    disabled={!isEditing}
                  >
                    <Ionicons name="add" size={20} color={isEditing ? '#1a472a' : '#999'} />
                  </TouchableOpacity>
                </View>
              </View>
              
              <View style={styles.fascicoliInputRow}>
                <Text style={styles.fascicoliInputLabel}>Fascicoli che hai:</Text>
                <View style={styles.counterContainer}>
                  <TouchableOpacity
                    style={[styles.counterButton, !isEditing && styles.counterButtonDisabled]}
                    onPress={() => isEditing && setFascicoliPresenti(Math.max(0, fascicoliPresenti - 1))}
                    disabled={!isEditing}
                  >
                    <Ionicons name="remove" size={20} color={isEditing ? '#1a472a' : '#999'} />
                  </TouchableOpacity>
                  <Text style={styles.counterValue}>{fascicoliPresenti}</Text>
                  <TouchableOpacity
                    style={[styles.counterButton, !isEditing && styles.counterButtonDisabled]}
                    onPress={() => isEditing && setFascicoliPresenti(Math.min(fascicoliTotali, fascicoliPresenti + 1))}
                    disabled={!isEditing}
                  >
                    <Ionicons name="add" size={20} color={isEditing ? '#1a472a' : '#999'} />
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

        {/* Punto di ritiro - STESSO FORMATO DELLA CREAZIONE */}
        <Text style={styles.sectionTitle}>Punto di ritiro</Text>
        {isEditing && (
          <Text style={styles.sectionSubtitle}>
            Seleziona dove consegnerai il libro
          </Text>
        )}
        
        <View style={styles.bookstoreList}>
          {bookstores.map((store) => {
            const isSelected = selectedBookstores.includes(store.id);
            return (
              <TouchableOpacity
                key={store.id}
                style={[
                  styles.bookstoreItem,
                  isSelected && styles.bookstoreItemSelected,
                  !isEditing && styles.bookstoreItemDisabled,
                ]}
                onPress={() => {
                  if (!isEditing) return;
                  if (isSelected) {
                    setSelectedBookstores(selectedBookstores.filter(bsId => bsId !== store.id));
                  } else {
                    setSelectedBookstores([...selectedBookstores, store.id]);
                  }
                }}
                disabled={!isEditing}
              >
                <Ionicons
                  name={isSelected ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={isSelected ? '#1a472a' : '#999'}
                />
                <View style={styles.bookstoreInfo}>
                  <Text style={styles.bookstoreName}>{store.nome}</Text>
                  <Text style={styles.bookstoreAddress}>{store.indirizzo}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Foto */}
        <Text style={styles.sectionTitle}>Foto</Text>
        {isEditing && (
          <Text style={styles.sectionSubtitle}>
            Scatta una foto della pagina peggiore per aumentare la fiducia
          </Text>
        )}
        
        <View style={styles.photoSection}>
          {photo ? (
            <View style={styles.photoPreview}>
              <Image
                source={{ uri: photo.startsWith('data:') ? photo : `data:image/jpeg;base64,${photo}` }}
                style={styles.photoImage}
              />
              {isEditing && (
                <TouchableOpacity
                  style={styles.removePhotoButton}
                  onPress={() => setPhoto(null)}
                >
                  <Ionicons name="close-circle" size={28} color="#ff4444" />
                </TouchableOpacity>
              )}
            </View>
          ) : isEditing ? (
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
          ) : (
            <View style={styles.noPhotoPlaceholder}>
              <Ionicons name="image-outline" size={48} color="#ccc" />
              <Text style={styles.noPhotoText}>Nessuna foto</Text>
            </View>
          )}
        </View>

        {/* Note */}
        <Text style={styles.sectionTitle}>Note</Text>
        {isEditing ? (
          <TextInput
            style={styles.noteInput}
            placeholder="Aggiungi note sullo stato del libro..."
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={3}
          />
        ) : (
          <View style={styles.noteDisplay}>
            <Text style={styles.noteText}>{note || 'Nessuna nota'}</Text>
          </View>
        )}

        {/* Riepilogo */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Riepilogo</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Condizione:</Text>
            <Text style={styles.summaryValue}>{currentCondition.label}</Text>
          </View>
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
            <Text style={styles.summaryPrice}>€{calculatePrice().toFixed(2)}</Text>
          </View>
        </View>

        {/* Azioni */}
        {isEditing ? (
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Salva modifiche</Text>
            )}
          </TouchableOpacity>
        ) : canEdit() ? (
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => setIsEditing(true)}
            >
              <Ionicons name="create-outline" size={20} color="#fff" />
              <Text style={styles.editButtonText}>Modifica annuncio</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDelete}
            >
              <Ionicons name="trash-outline" size={20} color="#f44336" />
              <Text style={styles.deleteButtonText}>Elimina annuncio</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.notEditableNotice}>
            <Ionicons name="lock-closed" size={20} color="#FF9800" />
            <Text style={styles.notEditableText}>
              Questo annuncio non può essere modificato perché è in trattativa o venduto.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
    fontSize: 14,
  },
  errorText: {
    fontSize: 18,
    color: '#333',
    marginTop: 16,
  },
  backBtn: {
    marginTop: 20,
    padding: 12,
    backgroundColor: '#1a472a',
    borderRadius: 8,
  },
  backBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerBtn: {
    padding: 4,
    width: 40,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  bookCard: {
    flexDirection: 'row',
    backgroundColor: '#e8f5e9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#1a472a',
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
    fontSize: 16,
    fontWeight: '600',
    color: '#1a472a',
  },
  bookAuthor: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  bookIsbn: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  bookOriginalPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a472a',
    marginTop: 8,
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
  optionButtonDisabled: {
    opacity: 0.8,
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
    marginBottom: 8,
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
  counterButtonDisabled: {
    backgroundColor: '#f0f0f0',
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
  bookstoreItemDisabled: {
    opacity: 0.7,
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
  noPhotoPlaceholder: {
    alignItems: 'center',
    padding: 32,
  },
  noPhotoText: {
    marginTop: 8,
    color: '#999',
    fontSize: 14,
  },
  noteInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  noteDisplay: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  noteText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
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
  },
  summaryPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  actions: {
    gap: 12,
    marginTop: 16,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a472a',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  editButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFEBEE',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  deleteButtonText: {
    color: '#f44336',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#1a472a',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  notEditableNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    padding: 16,
    borderRadius: 12,
    gap: 10,
    marginTop: 16,
  },
  notEditableText: {
    flex: 1,
    fontSize: 14,
    color: '#FF9800',
    lineHeight: 20,
  },
});
