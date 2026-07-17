import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Tipi di badge per le categorie
const BADGE_STYLES: Record<string, { bg: string; label: string }> = {
  'DA_ACQUISTARE': { bg: '#f44336', label: 'DA ACQUISTARE' },
  'DA_ACQUISTARE_USATO': { bg: '#FF9800', label: 'COMPRARE USATO' },
  'ANCORA_IN_USO': { bg: '#2196F3', label: 'ANCORA IN USO' },
  'VENDIBILE': { bg: '#4CAF50', label: 'VENDIBILE' },
  'CONSIGLIATO': { bg: '#9C27B0', label: 'CONSIGLIATO' },
  'FUORI_CORSO': { bg: '#607D8B', label: 'FUORI CORSO' },
};

export default function BookListScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const childId = params.childId as string;
  
  const [loading, setLoading] = useState(true);
  const [books, setBooks] = useState<any[]>([]);
  const [childData, setChildData] = useState<any>(null);
  const [isHorizontal, setIsHorizontal] = useState(false);

  useEffect(() => {
    loadData();
  }, [childId]);

  const loadData = async () => {
    try {
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId || !childId) { router.back(); return; }

      const userRes = await axios.get(`${API_URL}/api/users/${userId}`);
      const child = userRes.data.profili_figli?.find((p: any) => p.id === childId);
      if (child) setChildData(child);

      // Usa la nuova struttura dell'API v2
      const analysisRes = await axios.get(`${API_URL}/api/profiles/${userId}/children/${childId}/analysis`);
      
      const allBooks: any[] = [];
      
      // Da acquistare nuovi (obbligatori - devono comprare nuovo)
      analysisRes.data.da_acquistare_nuovi?.forEach((l: any) => {
        allBooks.push({ 
          ...l, 
          tipo: l.consigliato ? 'CONSIGLIATO' : 'DA_ACQUISTARE',
          prezzo_display: l.prezzo || l.prezzo_copertina
        });
      });
      
      // Da acquistare usati (possono trovare usato)
      analysisRes.data.da_acquistare_usati?.forEach((l: any) => {
        allBooks.push({ 
          ...l, 
          tipo: l.consigliato ? 'CONSIGLIATO' : 'DA_ACQUISTARE_USATO',
          prezzo_display: l.prezzo_suggerito || l.prezzo || l.prezzo_copertina
        });
      });
      
      // Ancora in uso (non devono comprare, li hanno già)
      analysisRes.data.ancora_in_uso?.forEach((l: any) => {
        allBooks.push({ 
          ...l, 
          tipo: 'ANCORA_IN_USO',
          prezzo_display: l.prezzo || l.prezzo_copertina
        });
      });
      
      // Vendibili (possono vendere)
      analysisRes.data.vendibili_usati?.forEach((l: any) => {
        allBooks.push({ 
          ...l, 
          tipo: 'VENDIBILE',
          prezzo_display: l.prezzo_suggerito || l.prezzo || l.prezzo_copertina
        });
      });
      
      // Fuori corso (non più adottati)
      analysisRes.data.fuori_corso?.forEach((l: any) => {
        allBooks.push({ 
          ...l, 
          tipo: 'FUORI_CORSO',
          prezzo_display: l.prezzo || l.prezzo_copertina
        });
      });
      
      setBooks(allBooks);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1a472a" />
      </View>
    );
  }

  const getBadgeStyle = (tipo: string) => {
    return BADGE_STYLES[tipo] || { bg: '#999', label: tipo };
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1a472a" />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.toggleBtn}
          onPress={() => setIsHorizontal(!isHorizontal)}
        >
          <Ionicons name={isHorizontal ? "phone-portrait" : "phone-landscape"} size={20} color="#fff" />
          <Text style={styles.toggleText}>{isHorizontal ? "Verticale" : "Orizzontale"}</Text>
        </TouchableOpacity>
        
        {Platform.OS === 'web' && (
          <TouchableOpacity onPress={() => window.print()}>
            <Ionicons name="print" size={24} color="#1a472a" />
          </TouchableOpacity>
        )}
      </View>

      {/* Titolo */}
      <View style={styles.titleSection}>
        <Text style={styles.title}>RiBook</Text>
        <Text style={styles.subtitle}>
          {childData?.nome_figlio || childData?.nome} - Classe {childData?.classe}{childData?.sezione} - {childData?.scuola_nome || childData?.scuola || childData?.school_name}
        </Text>
      </View>

      {/* Legenda */}
      <View style={styles.legendContainer}>
        <View style={styles.legendRow}>
          <View style={[styles.legendBadge, { backgroundColor: '#f44336' }]} />
          <Text style={styles.legendText}>Da acquistare (nuovo)</Text>
          <View style={[styles.legendBadge, { backgroundColor: '#FF9800' }]} />
          <Text style={styles.legendText}>Comprare usato</Text>
        </View>
        <View style={styles.legendRow}>
          <View style={[styles.legendBadge, { backgroundColor: '#2196F3' }]} />
          <Text style={styles.legendText}>Ancora in uso</Text>
          <View style={[styles.legendBadge, { backgroundColor: '#4CAF50' }]} />
          <Text style={styles.legendText}>Vendibile</Text>
          <View style={[styles.legendBadge, { backgroundColor: '#9C27B0' }]} />
          <Text style={styles.legendText}>Consigliato</Text>
        </View>
      </View>

      {/* Lista Libri */}
      <ScrollView 
        style={styles.scrollView}
        horizontal={isHorizontal}
        contentContainerStyle={isHorizontal ? styles.horizontalContent : styles.verticalContent}
      >
        {books.map((book, i) => {
          const badge = getBadgeStyle(book.tipo);
          return (
            <View key={book.isbn || i} style={[styles.bookCard, isHorizontal && styles.bookCardHorizontal]}>
              <View style={[styles.tipoBadge, { backgroundColor: badge.bg }]}>
                <Text style={styles.tipoText}>{badge.label}</Text>
              </View>
              <Text style={styles.disciplina}>{book.disciplina}</Text>
              <Text style={styles.titolo} numberOfLines={2}>{book.titolo}</Text>
              <Text style={styles.autore}>{book.autori}</Text>
              <View style={styles.isbnRow}>
                <Text style={styles.isbn} selectable>{book.isbn}</Text>
                <Text style={styles.prezzo}>
                  €{(book.prezzo_display || 0).toFixed(2)}
                </Text>
              </View>
              {book.potenziali_venditori > 0 && (
                <Text style={styles.venditori}>
                  {book.potenziali_venditori} potenziali venditori
                </Text>
              )}
            </View>
          );
        })}
      </ScrollView>

      <Text style={styles.footer}>Totale: {books.length} libri</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#ddd' },
  toggleBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a472a', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, gap: 6 },
  toggleText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  titleSection: { backgroundColor: '#1a472a', padding: 16, alignItems: 'center' },
  title: { fontSize: 32, fontWeight: 'bold', color: '#fff', letterSpacing: 2 },
  subtitle: { fontSize: 12, color: '#c8e6c9', marginTop: 4 },
  legendContainer: { backgroundColor: '#fff', padding: 10, borderBottomWidth: 1, borderBottomColor: '#ddd' },
  legendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 6, marginVertical: 2 },
  legendBadge: { width: 12, height: 12, borderRadius: 3 },
  legendText: { fontSize: 10, color: '#666', marginRight: 12 },
  scrollView: { flex: 1 },
  verticalContent: { padding: 12 },
  horizontalContent: { padding: 12, flexDirection: 'row', alignItems: 'flex-start' },
  bookCard: { backgroundColor: '#fff', padding: 12, marginBottom: 10, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: '#1a472a' },
  bookCardHorizontal: { width: 280, marginRight: 10, marginBottom: 0 },
  tipoBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginBottom: 6 },
  tipoText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  disciplina: { fontSize: 11, fontWeight: 'bold', color: '#1a472a', marginBottom: 4 },
  titolo: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 4 },
  autore: { fontSize: 11, color: '#666', marginBottom: 6 },
  isbnRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 6 },
  isbn: { fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: '#555' },
  prezzo: { fontSize: 14, fontWeight: 'bold', color: '#1a472a' },
  venditori: { fontSize: 10, color: '#FF9800', marginTop: 4, fontStyle: 'italic' },
  footer: { padding: 12, textAlign: 'center', color: '#666', fontSize: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#ddd' },
});
