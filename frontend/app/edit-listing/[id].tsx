import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Alert,
  Image,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const CONDITIONS = [
  { value: 'come_nuovo', label: 'Come nuovo', description: 'Nessun segno di usura' },
  { value: 'ottime', label: 'Ottime', description: 'Minimi segni di usura' },
  { value: 'buone', label: 'Buone', description: 'Normali segni di usura' },
  { value: 'discrete', label: 'Discrete', description: 'Usura evidente ma leggibile' },
];

export default function EditListingScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [listing, setListing] = useState<any>(null);
  
  // Form fields
  const [condizioni, setCondizioni] = useState('');
  const [descrizione, setDescrizione] = useState('');
  const [prezzoVendita, setPrezzoVendita] = useState('');
  const [foto, setFoto] = useState<string | null>(null);

  useEffect(() => {
    loadListing();
  }, [id]);

  const loadListing = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/listings/${id}`);
      const data = response.data;
      setListing(data);
      setCondizioni(data.condizioni || 'buone');
      setDescrizione(data.descrizione || '');
      setPrezzoVendita(data.prezzo_vendita?.toString() || '');
      setFoto(data.foto_base64 || null);
    } catch (error) {
      console.error('Error loading listing:', error);
      Alert.alert('Errore', 'Impossibile caricare i dati dell\'annuncio');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64) {
        setFoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
      }
    } catch (error) {
      console.error('Error picking image:', error);
    }
  };

  const handleSave = async () => {
    if (!prezzoVendita || parseFloat(prezzoVendita) <= 0) {
      Alert.alert('Errore', 'Inserisci un prezzo valido');
      return;
    }

    setSaving(true);
    try {
      const userId = await AsyncStorage.getItem('user_id');
      
      await axios.put(`${API_URL}/api/listings/${id}`, {
        condizioni,
        descrizione,
        prezzo_vendita: parseFloat(prezzoVendita),
        foto_base64: foto,
        seller_id: userId,
      });

      if (Platform.OS === 'web') {
        window.alert('Annuncio aggiornato con successo!');
      } else {
        Alert.alert('Successo', 'Annuncio aggiornato con successo!');
      }
      router.back();
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Errore durante il salvataggio';
      Alert.alert('Errore', message);
    } finally {
      setSaving(false);
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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Modifica annuncio</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Book Info */}
        <View style={styles.bookInfoCard}>
          <Image 
            source={{ uri: listing?.foto_base64 || `https://www.ibs.it/images/${listing?.book_isbn}_0_0_0_180_50.jpg` }}
            style={styles.bookCover}
            resizeMode="cover"
          />
          <View style={styles.bookDetails}>
            <Text style={styles.bookTitle} numberOfLines={2}>{listing?.book_titolo}</Text>
            {listing?.book_autori && (
              <Text style={styles.bookAuthor}>{listing?.book_autori}</Text>
            )}
            <Text style={styles.bookIsbn}>ISBN: {listing?.book_isbn}</Text>
          </View>
        </View>

        {/* Foto */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Foto del libro</Text>
          <TouchableOpacity style={styles.photoButton} onPress={pickImage}>
            {foto ? (
              <Image source={{ uri: foto }} style={styles.photoPreview} resizeMode="cover" />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Ionicons name="camera" size={40} color="#999" />
                <Text style={styles.photoPlaceholderText}>Aggiungi foto</Text>
              </View>
            )}
          </TouchableOpacity>
          <Text style={styles.photoHint}>Tocca per cambiare la foto</Text>
        </View>

        {/* Condizioni */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Condizioni</Text>
          <View style={styles.conditionsGrid}>
            {CONDITIONS.map((cond) => (
              <TouchableOpacity
                key={cond.value}
                style={[
                  styles.conditionOption,
                  condizioni === cond.value && styles.conditionOptionSelected
                ]}
                onPress={() => setCondizioni(cond.value)}
              >
                <Text style={[
                  styles.conditionLabel,
                  condizioni === cond.value && styles.conditionLabelSelected
                ]}>
                  {cond.label}
                </Text>
                <Text style={styles.conditionDesc}>{cond.description}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Descrizione */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Descrizione (opzionale)</Text>
          <TextInput
            style={styles.descInput}
            multiline
            numberOfLines={4}
            placeholder="Descrivi eventuali difetti, sottolineature, note..."
            value={descrizione}
            onChangeText={setDescrizione}
            textAlignVertical="top"
          />
        </View>

        {/* Prezzo */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Prezzo di vendita</Text>
          <View style={styles.priceInputContainer}>
            <Text style={styles.currencySymbol}>€</Text>
            <TextInput
              style={styles.priceInput}
              keyboardType="decimal-pad"
              placeholder="0.00"
              value={prezzoVendita}
              onChangeText={setPrezzoVendita}
            />
          </View>
          {listing?.prezzo_copertina && (
            <Text style={styles.priceHint}>
              Prezzo di copertina: €{listing.prezzo_copertina.toFixed(2)} - 
              Consigliato usato: €{(listing.prezzo_copertina * 0.6).toFixed(2)}
            </Text>
          )}
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark" size={22} color="#fff" />
              <Text style={styles.saveButtonText}>Salva modifiche</Text>
            </>
          )}
        </TouchableOpacity>
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
  backButton: {
    padding: 4,
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
  bookInfoCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  bookCover: {
    width: 70,
    height: 100,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
  },
  bookDetails: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  bookTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  bookAuthor: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  bookIsbn: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  photoButton: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
  },
  photoPreview: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoPlaceholderText: {
    marginTop: 8,
    color: '#999',
    fontSize: 14,
  },
  photoHint: {
    textAlign: 'center',
    color: '#888',
    fontSize: 12,
    marginTop: 8,
  },
  conditionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  conditionOption: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  conditionOptionSelected: {
    borderColor: '#1a472a',
    backgroundColor: '#e8f5e9',
  },
  conditionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  conditionLabelSelected: {
    color: '#1a472a',
  },
  conditionDesc: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
  },
  descInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    minHeight: 100,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  priceInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  currencySymbol: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a472a',
    marginRight: 8,
  },
  priceInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a472a',
    paddingVertical: 14,
  },
  priceHint: {
    fontSize: 12,
    color: '#888',
    marginTop: 8,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a472a',
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 20,
    gap: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
