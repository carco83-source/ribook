import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

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

      const analysisRes = await axios.get(`${API_URL}/api/profiles/${userId}/children/${childId}/analysis`);
      
      const allBooks: any[] = [];
      analysisRes.data.nuovi?.libri?.forEach((l: any) => allBooks.push({ ...l, tipo: 'NUOVO' }));
      analysisRes.data.comprare?.libri_usati?.forEach((l: any) => allBooks.push({ ...l, tipo: 'USATO' }));
      analysisRes.data.gia_posseduti?.libri?.forEach((l: any) => allBooks.push({ ...l, tipo: 'POSSEDUTO' }));
      
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
        <Text style={styles.title}>RiLiBro</Text>
        <Text style={styles.subtitle}>
          {childData?.nome_figlio} - Classe {childData?.classe} - {childData?.scuola_nome || childData?.school_name}
        </Text>
      </View>

      {/* Lista Libri */}
      <ScrollView 
        style={styles.scrollView}
        horizontal={isHorizontal}
        contentContainerStyle={isHorizontal ? styles.horizontalContent : styles.verticalContent}
      >
        {books.map((book, i) => (
          <View key={book.isbn || i} style={[styles.bookCard, isHorizontal && styles.bookCardHorizontal]}>
            <View style={[styles.tipoBadge, { backgroundColor: book.tipo === 'NUOVO' ? '#f44336' : book.tipo === 'USATO' ? '#FF9800' : '#4CAF50' }]}>
              <Text style={styles.tipoText}>{book.tipo}</Text>
            </View>
            <Text style={styles.disciplina}>{book.disciplina}</Text>
            <Text style={styles.titolo} numberOfLines={2}>{book.titolo}</Text>
            <Text style={styles.autore}>{book.autori}</Text>
            <View style={styles.isbnRow}>
              <Text style={styles.isbn} selectable>{book.isbn}</Text>
              <Text style={styles.prezzo}>€{book.prezzo_copertina?.toFixed(2)}</Text>
            </View>
          </View>
        ))}
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
  footer: { padding: 12, textAlign: 'center', color: '#666', fontSize: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#ddd' },
});
