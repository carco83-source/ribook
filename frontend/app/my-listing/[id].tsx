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

const CONDITIONS = [
  { value: 'come_nuovo', label: 'Come nuovo', description: 'Nessun segno di usura' },
  { value: 'ottime', label: 'Ottime', description: 'Minimi segni di usura' },
  { value: 'buone', label: 'Buone', description: 'Normali segni di usura' },
  { value: 'discrete', label: 'Discrete', description: 'Usura evidente ma leggibile' },
];

// Helper per colori percentuali
const getPercentageColor = (percentage: number): string => {
  if (percentage === 0) return '#4CAF50';
  if (percentage <= 25) return '#8BC34A';
  if (percentage <= 50) return '#FFC107';
  if (percentage <= 75) return '#FF9800';
  return '#f44336';
};

const getPercentageLabel = (percentage: number): string => {
  if (percentage === 0) return 'Nessuna';
  if (percentage <= 33) return 'Poche';
  if (percentage <= 66) return 'Diverse';
  return 'Molte';
};

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
  
  // Editable fields
  const [condizioni, setCondizioni] = useState('');
  const [descrizione, setDescrizione] = useState('');
  const [prezzoVendita, setPrezzoVendita] = useState('');
  const [foto, setFoto] = useState<string | null>(null);
  
  // Condition details (for editing)
  const [penna, setPenna] = useState(0);
  const [matita, setMatita] = useState(0);
  const [evidenziatore, setEvidenziatore] = useState(0);
  const [usuraLibro, setUsuraLibro] = useState(0);
  const [eserciziPenna, setEserciziPenna] = useState(false);
  const [eserciziMatita, setEserciziMatita] = useState(false);

  useEffect(() => {
    loadListing();
  }, [id]);

  const loadListing = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      setUserId(storedUserId);

      const response = await axios.get(`${API_URL}/api/listings/${id}`);
      const data = response.data;
      setListing(data);
      
      // Imposta valori editabili
      setCondizioni(data.condizioni || 'buone');
      setDescrizione(data.descrizione || data.note || '');
      setPrezzoVendita(data.prezzo_vendita?.toString() || '');
      setFoto(data.foto_base64 || null);
      
      // Imposta dettagli condizioni
      if (data.condition_details) {
        setPenna(data.condition_details.penna || 0);
        setMatita(data.condition_details.matita || 0);
        setEvidenziatore(data.condition_details.evidenziatore || 0);
        setUsuraLibro(data.condition_details.usura_libro || 0);
        setEserciziPenna(data.condition_details.esercizi_penna || false);
        setEserciziMatita(data.condition_details.esercizi_matita || false);
      }
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
      if (Platform.OS === 'web') {
        window.alert('Inserisci un prezzo valido');
      } else {
        Alert.alert('Errore', 'Inserisci un prezzo valido');
      }
      return;
    }

    setSaving(true);
    try {
      await axios.put(`${API_URL}/api/listings/${id}`, {
        condizioni,
        descrizione,
        prezzo_vendita: parseFloat(prezzoVendita),
        foto_base64: foto,
        seller_id: userId,
        condition_details: {
          penna,
          matita,
          evidenziatore,
          usura_libro: usuraLibro,
          esercizi_penna: eserciziPenna,
          esercizi_matita: eserciziMatita,
        },
      });

      if (Platform.OS === 'web') {
        window.alert('Annuncio aggiornato con successo!');
      } else {
        Alert.alert('Successo', 'Annuncio aggiornato con successo!');
      }
      setIsEditing(false);
      loadListing(); // Ricarica i dati aggiornati
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
  const coverUrl = listing.foto_base64 || `https://www.ibs.it/images/${listing.book_isbn}_0_0_0_180_50.jpg`;

  // Condizioni dettagliate dal listing
  const cd = listing.condition_details || {};

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
          <TouchableOpacity style={styles.headerBtn} onPress={() => setIsEditing(false)}>
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

        {/* Book Cover & Basic Info */}
        <View style={styles.bookCard}>
          {isEditing ? (
            <TouchableOpacity style={styles.editablePhoto} onPress={pickImage}>
              <Image source={{ uri: foto || coverUrl }} style={styles.bookCover} resizeMode="cover" />
              <View style={styles.editPhotoOverlay}>
                <Ionicons name="camera" size={24} color="#fff" />
                <Text style={styles.editPhotoText}>Cambia foto</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <Image source={{ uri: coverUrl }} style={styles.bookCover} resizeMode="cover" />
          )}
          
          <View style={styles.bookInfo}>
            <Text style={styles.bookTitle} numberOfLines={2}>{listing.book_titolo}</Text>
            {listing.book_autori && (
              <Text style={styles.bookAuthor}>{listing.book_autori}</Text>
            )}
            <Text style={styles.bookIsbn}>ISBN: {listing.book_isbn}</Text>
            
            {listing.book_materia && (
              <View style={styles.metaRow}>
                <Ionicons name="bookmark-outline" size={14} color="#666" />
                <Text style={styles.metaText}>{listing.book_materia}</Text>
              </View>
            )}
            {listing.book_classe && (
              <View style={styles.metaRow}>
                <Ionicons name="school-outline" size={14} color="#666" />
                <Text style={styles.metaText}>Classe {listing.book_classe}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Prezzo */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Prezzo di vendita</Text>
          {isEditing ? (
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
          ) : (
            <Text style={styles.priceDisplay}>€{listing.prezzo_vendita?.toFixed(2)}</Text>
          )}
          {listing.prezzo_copertina && (
            <Text style={styles.priceHint}>
              Prezzo di copertina: €{listing.prezzo_copertina.toFixed(2)}
            </Text>
          )}
        </View>

        {/* Condizioni Generali */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Condizioni generali</Text>
          {isEditing ? (
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
          ) : (
            <View style={styles.conditionDisplay}>
              <Text style={styles.conditionValue}>
                {CONDITIONS.find(c => c.value === listing.condizioni)?.label || listing.condizioni}
              </Text>
            </View>
          )}
        </View>

        {/* Dettagli Condizioni */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Stato dettagliato del libro</Text>
          
          {isEditing ? (
            <View style={styles.conditionDetailsEdit}>
              {/* Slider per Penna */}
              <View style={styles.sliderRow}>
                <View style={styles.sliderHeader}>
                  <Ionicons name="pencil" size={18} color="#666" />
                  <Text style={styles.sliderLabel}>Scritte a penna</Text>
                </View>
                <View style={styles.sliderButtons}>
                  {[0, 33, 66, 100].map((val) => (
                    <TouchableOpacity
                      key={val}
                      style={[styles.sliderBtn, penna === val && styles.sliderBtnActive]}
                      onPress={() => setPenna(val)}
                    >
                      <Text style={[styles.sliderBtnText, penna === val && styles.sliderBtnTextActive]}>
                        {getPercentageLabel(val)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Slider per Matita */}
              <View style={styles.sliderRow}>
                <View style={styles.sliderHeader}>
                  <Ionicons name="create-outline" size={18} color="#666" />
                  <Text style={styles.sliderLabel}>Scritte a matita</Text>
                </View>
                <View style={styles.sliderButtons}>
                  {[0, 33, 66, 100].map((val) => (
                    <TouchableOpacity
                      key={val}
                      style={[styles.sliderBtn, matita === val && styles.sliderBtnActive]}
                      onPress={() => setMatita(val)}
                    >
                      <Text style={[styles.sliderBtnText, matita === val && styles.sliderBtnTextActive]}>
                        {getPercentageLabel(val)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Slider per Evidenziatore */}
              <View style={styles.sliderRow}>
                <View style={styles.sliderHeader}>
                  <Ionicons name="color-fill" size={18} color="#666" />
                  <Text style={styles.sliderLabel}>Pagine evidenziate</Text>
                </View>
                <View style={styles.sliderButtons}>
                  {[0, 33, 66, 100].map((val) => (
                    <TouchableOpacity
                      key={val}
                      style={[styles.sliderBtn, evidenziatore === val && styles.sliderBtnActive]}
                      onPress={() => setEvidenziatore(val)}
                    >
                      <Text style={[styles.sliderBtnText, evidenziatore === val && styles.sliderBtnTextActive]}>
                        {getPercentageLabel(val)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Slider per Usura */}
              <View style={styles.sliderRow}>
                <View style={styles.sliderHeader}>
                  <Ionicons name="document-text" size={18} color="#666" />
                  <Text style={styles.sliderLabel}>Usura pagine</Text>
                </View>
                <View style={styles.sliderButtons}>
                  {[0, 33, 66, 100].map((val) => (
                    <TouchableOpacity
                      key={val}
                      style={[styles.sliderBtn, usuraLibro === val && styles.sliderBtnActive]}
                      onPress={() => setUsuraLibro(val)}
                    >
                      <Text style={[styles.sliderBtnText, usuraLibro === val && styles.sliderBtnTextActive]}>
                        {getPercentageLabel(val)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Checkbox Esercizi */}
              <View style={styles.checkboxRow}>
                <Text style={styles.checkboxGroupLabel}>Esercizi svolti:</Text>
                <View style={styles.checkboxGroup}>
                  <TouchableOpacity
                    style={styles.checkbox}
                    onPress={() => setEserciziPenna(!eserciziPenna)}
                  >
                    <View style={[styles.checkboxBox, eserciziPenna && styles.checkboxBoxChecked]}>
                      {eserciziPenna && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </View>
                    <Text style={styles.checkboxLabel}>A penna</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.checkbox}
                    onPress={() => setEserciziMatita(!eserciziMatita)}
                  >
                    <View style={[styles.checkboxBox, eserciziMatita && styles.checkboxBoxChecked]}>
                      {eserciziMatita && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </View>
                    <Text style={styles.checkboxLabel}>A matita</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.conditionDetailsDisplay}>
              {/* Scritte a penna */}
              <View style={styles.conditionDetailRow}>
                <View style={styles.conditionDetailHeader}>
                  <Ionicons name="pencil" size={18} color="#666" />
                  <Text style={styles.conditionDetailLabel}>Scritte a penna</Text>
                </View>
                <View style={[styles.conditionBadge, { backgroundColor: getPercentageColor(cd.penna || 0) }]}>
                  <Text style={styles.conditionBadgeText}>{getPercentageLabel(cd.penna || 0)}</Text>
                </View>
              </View>

              {/* Scritte a matita */}
              <View style={styles.conditionDetailRow}>
                <View style={styles.conditionDetailHeader}>
                  <Ionicons name="create-outline" size={18} color="#666" />
                  <Text style={styles.conditionDetailLabel}>Scritte a matita</Text>
                </View>
                <View style={[styles.conditionBadge, { backgroundColor: getPercentageColor(cd.matita || 0) }]}>
                  <Text style={styles.conditionBadgeText}>{getPercentageLabel(cd.matita || 0)}</Text>
                </View>
              </View>

              {/* Pagine evidenziate */}
              <View style={styles.conditionDetailRow}>
                <View style={styles.conditionDetailHeader}>
                  <Ionicons name="color-fill" size={18} color="#666" />
                  <Text style={styles.conditionDetailLabel}>Pagine evidenziate</Text>
                </View>
                <View style={[styles.conditionBadge, { backgroundColor: getPercentageColor(cd.evidenziatore || 0) }]}>
                  <Text style={styles.conditionBadgeText}>{getPercentageLabel(cd.evidenziatore || 0)}</Text>
                </View>
              </View>

              {/* Usura pagine */}
              <View style={styles.conditionDetailRow}>
                <View style={styles.conditionDetailHeader}>
                  <Ionicons name="document-text" size={18} color="#666" />
                  <Text style={styles.conditionDetailLabel}>Usura pagine</Text>
                </View>
                <View style={[styles.conditionBadge, { backgroundColor: getPercentageColor(cd.usura_libro || 0) }]}>
                  <Text style={styles.conditionBadgeText}>{getPercentageLabel(cd.usura_libro || 0)}</Text>
                </View>
              </View>

              {/* Esercizi svolti */}
              {(cd.esercizi_penna || cd.esercizi_matita) && (
                <View style={styles.eserciziDisplay}>
                  <Ionicons name="checkbox" size={18} color="#FF9800" />
                  <Text style={styles.eserciziLabel}>Esercizi svolti:</Text>
                  <View style={styles.eserciziTags}>
                    {cd.esercizi_penna && (
                      <View style={styles.eserciziTag}>
                        <Text style={styles.eserciziTagText}>A penna</Text>
                      </View>
                    )}
                    {cd.esercizi_matita && (
                      <View style={styles.eserciziTag}>
                        <Text style={styles.eserciziTagText}>A matita</Text>
                      </View>
                    )}
                  </View>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Descrizione */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Descrizione / Note</Text>
          {isEditing ? (
            <TextInput
              style={styles.descInput}
              multiline
              numberOfLines={4}
              placeholder="Descrivi eventuali difetti, sottolineature, note..."
              value={descrizione}
              onChangeText={setDescrizione}
              textAlignVertical="top"
            />
          ) : (
            <Text style={styles.descDisplay}>
              {listing.descrizione || listing.note || 'Nessuna descrizione'}
            </Text>
          )}
        </View>

        {/* Punti di ritiro */}
        {listing.bookstore_names && listing.bookstore_names.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Punti di ritiro</Text>
            {listing.bookstore_names.map((name: string, index: number) => (
              <View key={index} style={styles.bookstoreItem}>
                <Ionicons name="storefront-outline" size={18} color="#1a472a" />
                <Text style={styles.bookstoreName}>{name}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Azioni */}
        {isEditing ? (
          <View style={styles.editActions}>
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
          </View>
        ) : canEdit() ? (
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => setIsEditing(true)}
            >
              <Ionicons name="create-outline" size={20} color="#2196F3" />
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
    width: 90,
    height: 130,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  editablePhoto: {
    position: 'relative',
  },
  editPhotoOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 8,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    alignItems: 'center',
  },
  editPhotoText: {
    color: '#fff',
    fontSize: 10,
    marginTop: 2,
  },
  bookInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  bookTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  bookAuthor: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  bookIsbn: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  metaText: {
    fontSize: 12,
    color: '#666',
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
  priceDisplay: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1a472a',
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
  conditionDisplay: {
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  conditionValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a472a',
  },
  conditionDetailsEdit: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 20,
  },
  sliderRow: {
    gap: 10,
  },
  sliderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sliderLabel: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  sliderButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  sliderBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    alignItems: 'center',
  },
  sliderBtnActive: {
    backgroundColor: '#1a472a',
  },
  sliderBtnText: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
  },
  sliderBtnTextActive: {
    color: '#fff',
  },
  checkboxRow: {
    marginTop: 8,
  },
  checkboxGroupLabel: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    marginBottom: 10,
  },
  checkboxGroup: {
    flexDirection: 'row',
    gap: 20,
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#1a472a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxChecked: {
    backgroundColor: '#1a472a',
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#333',
  },
  conditionDetailsDisplay: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 16,
  },
  conditionDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  conditionDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  conditionDetailLabel: {
    fontSize: 14,
    color: '#666',
  },
  conditionBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  conditionBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  eserciziDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    flexWrap: 'wrap',
  },
  eserciziLabel: {
    fontSize: 14,
    color: '#FF9800',
    fontWeight: '600',
  },
  eserciziTags: {
    flexDirection: 'row',
    gap: 8,
  },
  eserciziTag: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF9800',
  },
  eserciziTagText: {
    fontSize: 12,
    color: '#FF9800',
    fontWeight: '500',
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
  descDisplay: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
  },
  bookstoreItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
  },
  bookstoreName: {
    fontSize: 14,
    color: '#333',
  },
  actions: {
    gap: 12,
    marginTop: 10,
  },
  editActions: {
    marginTop: 10,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E3F2FD',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  editButtonText: {
    color: '#2196F3',
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a472a',
    borderRadius: 12,
    paddingVertical: 16,
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
  notEditableNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    padding: 16,
    borderRadius: 12,
    gap: 10,
    marginTop: 10,
  },
  notEditableText: {
    flex: 1,
    fontSize: 14,
    color: '#FF9800',
    lineHeight: 20,
  },
});
