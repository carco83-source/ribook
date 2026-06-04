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
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Condition questions with icons and labels - IDENTICO A CREATE
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

// Calculate condition from answers - IDENTICO A CREATE
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

export default function EditListingScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [listing, setListing] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null);
  
  // Stessi state di create.tsx
  const [conditionAnswers, setConditionAnswers] = useState<Record<string, number>>({
    sottolineature: 0,
    copertina: 0,
    pagine: 0,
    esercizi: 0,
  });
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  
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
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      setUserId(storedUserId);

      // Load listing
      const response = await axios.get(`${API_URL}/api/listings/${id}`);
      const data = response.data;
      setListing(data);
      
      // Load bookstores
      const bsRes = await axios.get(`${API_URL}/api/bookstores`);
      setBookstores(bsRes.data);
      
      // Imposta valori dai dati salvati
      setNote(data.note || data.descrizione || '');
      
      // Foto
      if (data.foto_base64) {
        setPhoto(data.foto_base64.replace(/^data:image\/\w+;base64,/, ''));
      }
      
      // Condizioni
      if (data.condition_answers) {
        setConditionAnswers(data.condition_answers);
        setUseCustomPrice(false);
      } else {
        // Se non ci sono condition_answers, usa prezzo personalizzato
        setUseCustomPrice(true);
        setCustomPrice(data.prezzo_vendita?.toString() || '');
      }
      
      // Fascicoli
      setHasFascicoli(data.ha_fascicoli || false);
      setFascicoliTotali(data.fascicoli_totali || 0);
      setFascicoliPresenti(data.fascicoli_presenti || 0);
      
      // Bookstores selezionati
      setSelectedBookstores(data.bookstore_ids || []);
      
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

  const getBookPrice = () => {
    if (!listing) return 0;
    return listing.prezzo_ministeriale || listing.prezzo_copertina || 0;
  };

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
    if (!listing) return 0;
    if (useCustomPrice && customPrice) {
      return parseFloat(customPrice) || 0;
    }
    const condition = calculateCondition(conditionAnswers);
    return (getBookPrice() * condition.percentage) / 100;
  };

  const getFinalPrice = () => {
    if (useCustomPrice && customPrice) {
      return parseFloat(customPrice) || 0;
    }
    return calculatePrice();
  };

  const handleSubmit = async () => {
    if (!canEdit()) {
      if (Platform.OS === 'web') {
        window.alert('Questo annuncio non può essere modificato');
      } else {
        Alert.alert('Errore', 'Questo annuncio non può essere modificato');
      }
      return;
    }

    setSaving(true);
    try {
      const finalPrice = getFinalPrice();
      await axios.put(`${API_URL}/api/listings/${id}`, {
        seller_id: userId,
        condition_answers: useCustomPrice ? null : conditionAnswers,
        prezzo_vendita: finalPrice,
        ha_fascicoli: hasFascicoli,
        fascicoli_totali: fascicoliTotali,
        fascicoli_presenti: fascicoliPresenti,
        bookstore_ids: selectedBookstores,
        note: note || null,
        descrizione: note || null,
        foto_base64: photo ? `data:image/jpeg;base64,${photo}` : null,
      });

      if (Platform.OS === 'web') {
        window.alert(`Annuncio aggiornato! Prezzo: €${finalPrice.toFixed(2)}`);
        router.back();
      } else {
        Alert.alert(
          'Annuncio aggiornato!',
          `Il tuo libro è ora in vendita a €${finalPrice.toFixed(2)}`,
          [{ text: 'OK', onPress: () => router.back() }]
        );
      }
    } catch (error: any) {
      console.error('Error updating listing:', error);
      const message = error.response?.data?.detail || 'Impossibile aggiornare l\'annuncio';
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
      ? window.confirm('Sei sicuro di voler eliminare questo annuncio?')
      : await new Promise((resolve) => {
          Alert.alert(
            'Elimina annuncio',
            'Sei sicuro di voler eliminare questo annuncio?',
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
        Alert.alert('Fatto', 'Annuncio eliminato');
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

  const currentCondition = calculateCondition(conditionAnswers);

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#1a472a" />
        <Text style={{ marginTop: 12, color: '#666' }}>Caricamento...</Text>
      </View>
    );
  }

  if (!listing) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Ionicons name="alert-circle" size={64} color="#f44336" />
        <Text style={{ fontSize: 18, marginTop: 16 }}>Annuncio non trovato</Text>
        <TouchableOpacity style={styles.submitButton} onPress={() => router.back()}>
          <Text style={styles.submitButtonText}>Torna indietro</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const editable = canEdit();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <Stack.Screen 
        options={{ 
          title: 'Modifica annuncio',
          headerStyle: { backgroundColor: '#1a472a' },
          headerTintColor: '#fff',
          headerLeft: () => (
            <TouchableOpacity 
              onPress={() => router.back()} 
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
        {/* Non modificabile warning */}
        {!editable && (
          <View style={styles.warningCard}>
            <Ionicons name="lock-closed" size={24} color="#FF9800" />
            <Text style={styles.warningText}>
              Questo annuncio non può essere modificato perché è in trattativa o venduto.
            </Text>
          </View>
        )}

        {/* Step 1: Book Info (non modificabile) */}
        <Text style={styles.sectionTitle}>1. Libro selezionato</Text>
        <View style={styles.selectedBookCard}>
          <View style={styles.selectedBookInfo}>
            <Text style={styles.selectedBookTitle}>{listing.book_titolo}</Text>
            <Text style={styles.selectedBookAuthor}>{listing.book_autori || 'Autore non specificato'}</Text>
            <Text style={styles.selectedBookISBN}>ISBN: {listing.book_isbn}</Text>
            <Text style={styles.selectedBookPrice}>
              Prezzo listino: €{getBookPrice().toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Step 2: Condition Questions - IDENTICO A CREATE */}
        <Text style={styles.sectionTitle}>2. Prezzo di vendita</Text>
        
        {/* Toggle prezzo automatico/personalizzato */}
        <View style={styles.priceToggleContainer}>
          <TouchableOpacity
            style={[
              styles.priceToggleOption,
              !useCustomPrice && styles.priceToggleOptionSelected,
              !editable && styles.disabledOption
            ]}
            onPress={() => editable && setUseCustomPrice(false)}
            disabled={!editable}
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
              useCustomPrice && styles.priceToggleOptionSelected,
              !editable && styles.disabledOption
            ]}
            onPress={() => editable && setUseCustomPrice(true)}
            disabled={!editable}
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
                editable={editable}
              />
            </View>
            <Text style={styles.customPriceHint}>
              Prezzo di copertina: €{getBookPrice().toFixed(2)}
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
                        !editable && styles.disabledOption
                      ]}
                      onPress={() => editable && setConditionAnswers({ ...conditionAnswers, [q.key]: opt.value })}
                      disabled={!editable}
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

        {/* Step 3: Fascicoli - IDENTICO A CREATE */}
        <Text style={styles.sectionTitle}>3. Fascicoli allegati</Text>
        <View style={styles.fascicoliCard}>
          <TouchableOpacity
            style={[styles.fascicoliToggle, !editable && styles.disabledOption]}
            onPress={() => editable && setHasFascicoli(!hasFascicoli)}
            disabled={!editable}
          >
            <Ionicons
              name={hasFascicoli ? 'checkbox' : 'square-outline'}
              size={24}
              color={editable ? "#1a472a" : "#999"}
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
                    style={[styles.counterButton, !editable && styles.counterButtonDisabled]}
                    onPress={() => editable && setFascicoliTotali(Math.max(0, fascicoliTotali - 1))}
                    disabled={!editable}
                  >
                    <Ionicons name="remove" size={20} color={editable ? "#1a472a" : "#999"} />
                  </TouchableOpacity>
                  <Text style={styles.counterValue}>{fascicoliTotali}</Text>
                  <TouchableOpacity
                    style={[styles.counterButton, !editable && styles.counterButtonDisabled]}
                    onPress={() => editable && setFascicoliTotali(fascicoliTotali + 1)}
                    disabled={!editable}
                  >
                    <Ionicons name="add" size={20} color={editable ? "#1a472a" : "#999"} />
                  </TouchableOpacity>
                </View>
              </View>
              
              <View style={styles.fascicoliInputRow}>
                <Text style={styles.fascicoliInputLabel}>Fascicoli che hai:</Text>
                <View style={styles.counterContainer}>
                  <TouchableOpacity
                    style={[styles.counterButton, !editable && styles.counterButtonDisabled]}
                    onPress={() => editable && setFascicoliPresenti(Math.max(0, fascicoliPresenti - 1))}
                    disabled={!editable}
                  >
                    <Ionicons name="remove" size={20} color={editable ? "#1a472a" : "#999"} />
                  </TouchableOpacity>
                  <Text style={styles.counterValue}>{fascicoliPresenti}</Text>
                  <TouchableOpacity
                    style={[styles.counterButton, !editable && styles.counterButtonDisabled]}
                    onPress={() => editable && setFascicoliPresenti(Math.min(fascicoliTotali, fascicoliPresenti + 1))}
                    disabled={!editable}
                  >
                    <Ionicons name="add" size={20} color={editable ? "#1a472a" : "#999"} />
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

        {/* Step 4: Bookstore Selection - IDENTICO A CREATE */}
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
                    !editable && styles.disabledOption
                  ]}
                  onPress={() => {
                    if (!editable) return;
                    if (isSelected) {
                      setSelectedBookstores(selectedBookstores.filter(bsId => bsId !== store.id));
                    } else {
                      setSelectedBookstores([...selectedBookstores, store.id]);
                    }
                  }}
                  disabled={!editable}
                >
                  <Ionicons
                    name={isSelected ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={editable ? "#1a472a" : "#999"}
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

        {/* Step 5: Photo - IDENTICO A CREATE */}
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
              {editable && (
                <TouchableOpacity
                  style={styles.removePhotoButton}
                  onPress={() => setPhoto(null)}
                >
                  <Ionicons name="close-circle" size={28} color="#ff4444" />
                </TouchableOpacity>
              )}
            </View>
          ) : editable ? (
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
              <Text style={{ color: '#999', marginTop: 8 }}>Nessuna foto</Text>
            </View>
          )}
        </View>

        {/* Step 6: Notes - IDENTICO A CREATE */}
        <Text style={styles.sectionTitle}>6. Note (opzionale)</Text>
        <TextInput
          style={styles.noteInput}
          placeholder="Aggiungi note sullo stato del libro..."
          value={note}
          onChangeText={setNote}
          multiline
          numberOfLines={3}
          editable={editable}
        />

        {/* Summary - IDENTICO A CREATE */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Riepilogo</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Libro:</Text>
            <Text style={styles.summaryValue}>{listing.book_titolo}</Text>
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

        {/* Submit & Delete */}
        {editable && (
          <>
            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleSubmit}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>Salva Modifiche</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDelete}
            >
              <Ionicons name="trash-outline" size={20} color="#f44336" />
              <Text style={styles.deleteButtonText}>Elimina annuncio</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// STILI IDENTICI A CREATE.TSX
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    padding: 16,
    borderRadius: 12,
    gap: 12,
    marginBottom: 16,
  },
  warningText: {
    flex: 1,
    color: '#FF9800',
    fontSize: 14,
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
  disabledOption: {
    opacity: 0.6,
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
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFEBEE',
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 12,
    gap: 8,
  },
  deleteButtonText: {
    color: '#f44336',
    fontSize: 16,
    fontWeight: '600',
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
