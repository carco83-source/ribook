import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { SafeAreaView } from 'react-native-safe-area-context';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface Receipt {
  id: string;
  receipt_number: string;
  type: 'vendita' | 'acquisto' | 'piattaforma';
  book_titolo: string;
  amount: number;
  created_at: string;
  order_code?: string;
}

export default function DocumentsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    loadReceipts();
  }, []);

  const loadReceipts = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      if (!storedUserId) {
        router.replace('/(auth)/login');
        return;
      }
      setUserId(storedUserId);

      const response = await axios.get(`${API_URL}/api/receipts/${storedUserId}`);
      setReceipts(response.data);
    } catch (error) {
      console.error('Error loading receipts:', error);
    } finally {
      setLoading(false);
    }
  };

  const downloadReceipt = async (receipt: Receipt) => {
    if (!userId) return;
    
    setDownloading(receipt.id);
    try {
      const downloadUrl = `${API_URL}/api/receipts/${userId}/${receipt.id}/download`;
      
      if (Platform.OS === 'web') {
        // Su web, apri in una nuova tab
        window.open(downloadUrl, '_blank');
      } else {
        // Su mobile, usa Linking
        const supported = await Linking.canOpenURL(downloadUrl);
        if (supported) {
          await Linking.openURL(downloadUrl);
        } else {
          Alert.alert('Errore', 'Impossibile aprire il documento');
        }
      }
    } catch (error) {
      console.error('Error downloading receipt:', error);
      Alert.alert('Errore', 'Impossibile scaricare il documento');
    } finally {
      setDownloading(null);
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'vendita':
        return { label: 'Vendita', color: '#22c55e', icon: 'arrow-up-circle' };
      case 'acquisto':
        return { label: 'Acquisto', color: '#3b82f6', icon: 'arrow-down-circle' };
      default:
        return { label: type, color: '#666', icon: 'document' };
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderReceipt = ({ item }: { item: Receipt }) => {
    const typeInfo = getTypeLabel(item.type);
    const isDownloading = downloading === item.id;

    return (
      <TouchableOpacity
        style={styles.receiptCard}
        onPress={() => downloadReceipt(item)}
        disabled={isDownloading}
      >
        <View style={styles.receiptHeader}>
          <View style={[styles.typeBadge, { backgroundColor: typeInfo.color + '20' }]}>
            <Ionicons name={typeInfo.icon as any} size={16} color={typeInfo.color} />
            <Text style={[styles.typeLabel, { color: typeInfo.color }]}>{typeInfo.label}</Text>
          </View>
          <Text style={styles.receiptNumber}>{item.receipt_number}</Text>
        </View>

        <Text style={styles.bookTitle} numberOfLines={2}>
          {item.book_titolo}
        </Text>

        <View style={styles.receiptFooter}>
          <Text style={styles.date}>{formatDate(item.created_at)}</Text>
          <Text style={styles.amount}>€{item.amount.toFixed(2)}</Text>
        </View>

        <View style={styles.downloadButton}>
          {isDownloading ? (
            <ActivityIndicator size="small" color="#1a472a" />
          ) : (
            <>
              <Ionicons name="download-outline" size={18} color="#1a472a" />
              <Text style={styles.downloadText}>Scarica PDF</Text>
            </>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyList = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="document-text-outline" size={80} color="#ccc" />
      <Text style={styles.emptyTitle}>Nessun documento</Text>
      <Text style={styles.emptySubtitle}>
        Le ricevute delle tue vendite e acquisti appariranno qui dopo il ritiro dei libri.
      </Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Documenti</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1a472a" />
        </View>
      </SafeAreaView>
    );
  }

  // Dividi per tipo
  const venditeReceipts = receipts.filter(r => r.type === 'vendita');
  const acquistiReceipts = receipts.filter(r => r.type === 'acquisto');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Documenti</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={receipts}
        renderItem={renderReceipt}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmptyList}
        ListHeaderComponent={
          receipts.length > 0 ? (
            <View style={styles.summaryContainer}>
              <View style={styles.summaryCard}>
                <Ionicons name="arrow-up-circle" size={24} color="#22c55e" />
                <Text style={styles.summaryNumber}>{venditeReceipts.length}</Text>
                <Text style={styles.summaryLabel}>Vendite</Text>
              </View>
              <View style={styles.summaryCard}>
                <Ionicons name="arrow-down-circle" size={24} color="#3b82f6" />
                <Text style={styles.summaryNumber}>{acquistiReceipts.length}</Text>
                <Text style={styles.summaryLabel}>Acquisti</Text>
              </View>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#1a472a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  summaryContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a472a',
    marginTop: 8,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  receiptCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  receiptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  typeLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  receiptNumber: {
    fontSize: 11,
    color: '#999',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  bookTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
    marginBottom: 12,
  },
  receiptFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 12,
  },
  date: {
    fontSize: 13,
    color: '#666',
  },
  amount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    paddingVertical: 10,
    marginTop: 12,
  },
  downloadText: {
    color: '#1a472a',
    fontWeight: '600',
    marginLeft: 6,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    marginTop: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
});
