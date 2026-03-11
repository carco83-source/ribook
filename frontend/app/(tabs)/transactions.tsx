import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Transaction {
  id: string;
  book_titolo: string;
  buyer_username: string;
  seller_username: string;
  bookstore_nome: string;
  prezzo_totale: number;
  commissione_app: number;
  importo_venditore: number;
  stato: string;
  buyer_is_premium: boolean;
  created_at: string;
}

export default function TransactionsScreen() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<{
    acquisti: Transaction[];
    vendite: Transaction[];
  }>({ acquisti: [], vendite: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'acquisti' | 'vendite'>('acquisti');
  const [userId, setUserId] = useState<string | null>(null);

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

      const response = await axios.get(
        `${API_URL}/api/transactions/user/${storedUserId}`
      );
      setTransactions(response.data);
    } catch (error) {
      console.error('Error loading transactions:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const getStatoLabel = (stato: string) => {
    const labels: { [key: string]: { text: string; color: string } } = {
      in_attesa_consegna: { text: 'In attesa consegna', color: '#FFC107' },
      in_custodia: { text: 'In custodia', color: '#2196F3' },
      completato: { text: 'Completato', color: '#4CAF50' },
      annullato: { text: 'Annullato', color: '#f44336' },
    };
    return labels[stato] || { text: stato, color: '#666' };
  };

  const renderTransaction = ({ item }: { item: Transaction }) => {
    const statoInfo = getStatoLabel(item.stato);
    const isAcquisto = activeTab === 'acquisti';

    return (
      <View style={styles.transactionCard}>
        <View style={styles.transactionHeader}>
          <View
            style={[styles.statoBadge, { backgroundColor: statoInfo.color }]}
          >
            <Text style={styles.statoText}>{statoInfo.text}</Text>
          </View>
          <Text style={styles.transactionPrice}>
            €{item.prezzo_totale.toFixed(2)}
          </Text>
        </View>

        <Text style={styles.transactionTitle}>{item.book_titolo}</Text>

        <View style={styles.transactionDetails}>
          <View style={styles.detailRow}>
            <Ionicons name="person-outline" size={16} color="#666" />
            <Text style={styles.detailText}>
              {isAcquisto ? `Venditore: ${item.seller_username}` : `Acquirente: ${item.buyer_username}`}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="storefront-outline" size={16} color="#666" />
            <Text style={styles.detailText}>{item.bookstore_nome}</Text>
          </View>
        </View>

        {!isAcquisto && (
          <View style={styles.earningsBox}>
            <Text style={styles.earningsLabel}>Guadagno netto:</Text>
            <Text style={styles.earningsValue}>
              €{item.importo_venditore.toFixed(2)}
            </Text>
            {item.commissione_app > 0 && (
              <Text style={styles.commissionText}>
                (Commissione: €{item.commissione_app.toFixed(2)})
              </Text>
            )}
          </View>
        )}

        {item.stato === 'in_custodia' && isAcquisto && (
          <View style={styles.actionBox}>
            <Ionicons name="information-circle" size={20} color="#2196F3" />
            <Text style={styles.actionText}>
              Il libro è pronto per il ritiro presso {item.bookstore_nome}
            </Text>
          </View>
        )}

        {item.stato === 'in_attesa_consegna' && !isAcquisto && (
          <View style={styles.actionBox}>
            <Ionicons name="alert-circle" size={20} color="#FFC107" />
            <Text style={styles.actionText}>
              Consegna il libro presso {item.bookstore_nome} entro 5 giorni
            </Text>
          </View>
        )}
      </View>
    );
  };

  const activeTransactions =
    activeTab === 'acquisti' ? transactions.acquisti : transactions.vendite;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a472a" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Quick Links */}
      <View style={styles.quickLinksContainer}>
        <TouchableOpacity
          style={styles.quickLinkButton}
          onPress={() => router.push('/my-purchases')}
        >
          <Ionicons name="cart" size={20} color="#1a472a" />
          <Text style={styles.quickLinkText}>I miei acquisti</Text>
          <Ionicons name="chevron-forward" size={16} color="#999" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickLinkButton}
          onPress={() => router.push('/my-sales')}
        >
          <Ionicons name="pricetag" size={20} color="#1a472a" />
          <Text style={styles.quickLinkText}>Le mie vendite</Text>
          <Ionicons name="chevron-forward" size={16} color="#999" />
        </TouchableOpacity>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'acquisti' && styles.activeTab]}
          onPress={() => setActiveTab('acquisti')}
        >
          <Ionicons
            name="cart-outline"
            size={20}
            color={activeTab === 'acquisti' ? '#1a472a' : '#666'}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === 'acquisti' && styles.activeTabText,
            ]}
          >
            Acquisti ({transactions.acquisti.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'vendite' && styles.activeTab]}
          onPress={() => setActiveTab('vendite')}
        >
          <Ionicons
            name="pricetag-outline"
            size={20}
            color={activeTab === 'vendite' ? '#1a472a' : '#666'}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === 'vendite' && styles.activeTabText,
            ]}
          >
            Vendite ({transactions.vendite.length})
          </Text>
        </TouchableOpacity>
      </View>

      {activeTransactions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons
            name={activeTab === 'acquisti' ? 'cart-outline' : 'pricetag-outline'}
            size={48}
            color="#ccc"
          />
          <Text style={styles.emptyText}>
            Nessun {activeTab === 'acquisti' ? 'acquisto' : 'a vendita'}
          </Text>
          <Text style={styles.emptySubtext}>
            {activeTab === 'acquisti'
              ? 'Cerca libri e acquista!'
              : 'Metti in vendita i tuoi libri!'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={activeTransactions}
          renderItem={renderTransaction}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
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
  quickLinksContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 8,
  },
  quickLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    gap: 12,
  },
  quickLinkText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  activeTab: {
    backgroundColor: '#e8f5e9',
  },
  tabText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#1a472a',
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
  },
  transactionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statoBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statoText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  transactionPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  transactionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  transactionDetails: {
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 14,
    color: '#666',
  },
  earningsBox: {
    backgroundColor: '#e8f5e9',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  earningsLabel: {
    fontSize: 12,
    color: '#666',
  },
  earningsValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  commissionText: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  actionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    gap: 8,
  },
  actionText: {
    flex: 1,
    fontSize: 13,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 100,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
});
