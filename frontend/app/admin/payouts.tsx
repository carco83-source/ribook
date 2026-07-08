import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import axios from 'axios';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.apiUrl || 
                process.env.EXPO_PUBLIC_BACKEND_URL || 
                'https://language-check-10.preview.emergentagent.com';

interface Payout {
  id: string;
  order_id: string;
  order_code: string;
  recipient_type: 'seller' | 'platform' | 'cartolibreria';
  recipient_id: string;
  recipient_name: string;
  recipient_iban: string;
  gross_amount: number;
  stripe_fee: number;
  net_amount: number;
  description: string;
  pickup_date?: string;
  payable_from?: string;
  status: string;
  created_at: string;
  completed_at?: string;
  book_title?: string;
  buyer_name?: string;
}

interface PlatformConfig {
  id: string;
  platform_iban: string | null;
  platform_name: string;
  seller_percentage: number;
  platform_percentage: number;
  foderazione_cost: number;
  stripe_fee_percentage: number;
  stripe_fee_fixed: number;
}

export default function AdminPayoutsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [config, setConfig] = useState<PlatformConfig | null>(null);
  const [totals, setTotals] = useState({ pending: { count: 0, amount: 0 }, completed: { count: 0, amount: 0 } });
  
  // Form states
  const [platformIban, setPlatformIban] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [checkingDeadlines, setCheckingDeadlines] = useState(false);
  const [deadlineResults, setDeadlineResults] = useState<any>(null);
  
  // Filter
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('pending');

  const loadData = useCallback(async () => {
    try {
      // Load config
      const configRes = await axios.get(`${API_URL}/api/admin/platform-config`);
      setConfig(configRes.data);
      setPlatformIban(configRes.data.platform_iban || '');
      
      // Load payouts
      const payoutsRes = await axios.get(`${API_URL}/api/admin/payouts`);
      setPayouts(payoutsRes.data.payouts || []);
      setTotals(payoutsRes.data.totals || { pending: { count: 0, amount: 0 }, completed: { count: 0, amount: 0 } });
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const saveConfig = async () => {
    if (!platformIban.trim()) {
      Alert.alert('Errore', 'Inserisci un IBAN valido');
      return;
    }
    
    setSavingConfig(true);
    try {
      await axios.put(`${API_URL}/api/admin/platform-config`, {
        ...config,
        platform_iban: platformIban.replace(/\s/g, '').toUpperCase(),
      });
      Alert.alert('Successo', 'Configurazione salvata!');
      loadData();
    } catch (error) {
      Alert.alert('Errore', 'Impossibile salvare la configurazione');
    } finally {
      setSavingConfig(false);
    }
  };

  const checkDeadlines = async () => {
    setCheckingDeadlines(true);
    setDeadlineResults(null);
    try {
      const res = await axios.post(`${API_URL}/api/admin/check-deadlines`);
      setDeadlineResults(res.data);
      
      const expConf = res.data.expired_confirmations?.length || 0;
      const expDel = res.data.expired_deliveries?.length || 0;
      
      if (expConf === 0 && expDel === 0) {
        Alert.alert('Controllo Scadenze', 'Nessun ordine scaduto trovato.');
      } else {
        Alert.alert(
          'Ordini Scaduti Processati',
          `${expConf} ordini annullati (conferma scaduta)\n${expDel} ordini annullati e rimborsati (consegna scaduta)`
        );
      }
      loadData();
    } catch (error) {
      Alert.alert('Errore', 'Impossibile controllare le scadenze');
    } finally {
      setCheckingDeadlines(false);
    }
  };

  const completePayout = async (payout: Payout) => {
    const message = `Confermi di aver effettuato il bonifico di €${payout.net_amount.toFixed(2)} a ${payout.recipient_name}?\n\nIBAN: ${payout.recipient_iban}`;
    
    if (Platform.OS === 'web') {
      const ref = window.prompt(`${message}\n\nInserisci riferimento bonifico (opzionale):`);
      if (ref !== null) {
        await doCompletePayout(payout.id, ref || undefined);
      }
    } else {
      Alert.alert(
        'Conferma Bonifico',
        message,
        [
          { text: 'Annulla', style: 'cancel' },
          { 
            text: 'Confermo', 
            onPress: () => doCompletePayout(payout.id)
          }
        ]
      );
    }
  };

  const doCompletePayout = async (payoutId: string, reference?: string) => {
    try {
      let url = `${API_URL}/api/admin/payouts/${payoutId}/complete`;
      if (reference) {
        url += `?transaction_reference=${encodeURIComponent(reference)}`;
      }
      await axios.post(url);
      Alert.alert('Successo', 'Payout segnato come completato!');
      loadData();
    } catch (error) {
      Alert.alert('Errore', 'Impossibile completare il payout');
    }
  };

  const filteredPayouts = payouts.filter(p => {
    if (filter === 'all') return true;
    if (filter === 'pending') return p.status === 'pending' || p.status === 'awaiting_iban';
    if (filter === 'completed') return p.status === 'completed';
    return true;
  });

  const getRecipientIcon = (type: string) => {
    switch (type) {
      case 'seller': return 'person';
      case 'platform': return 'business';
      case 'cartolibreria': return 'storefront';
      default: return 'help';
    }
  };

  const getRecipientColor = (type: string) => {
    switch (type) {
      case 'seller': return '#4CAF50';
      case 'platform': return '#2196F3';
      case 'cartolibreria': return '#FF9800';
      default: return '#666';
    }
  };

  const getStatusBadge = (payout: Payout) => {
    const now = new Date();
    const payableFrom = payout.payable_from ? new Date(payout.payable_from) : null;
    const isReady = payableFrom ? now >= payableFrom : true;
    
    if (payout.status === 'completed') {
      return { label: 'Completato', color: '#4CAF50', bg: '#E8F5E9', icon: 'checkmark-circle' };
    }
    if (payout.status === 'awaiting_iban') {
      return { label: 'IBAN mancante', color: '#f44336', bg: '#FFEBEE', icon: 'alert-circle' };
    }
    if (!isReady) {
      const daysLeft = Math.ceil((payableFrom!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return { label: `Tra ${daysLeft}g`, color: '#9E9E9E', bg: '#F5F5F5', icon: 'time' };
    }
    return { label: 'Pronto', color: '#FF9800', bg: '#FFF3E0', icon: 'wallet' };
  };
  
  const isPayoutReady = (payout: Payout) => {
    if (payout.status !== 'pending') return false;
    const now = new Date();
    const payableFrom = payout.payable_from ? new Date(payout.payable_from) : null;
    return payableFrom ? now >= payableFrom : true;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Gestione Payout', headerShown: true }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1a472a" />
          <Text style={styles.loadingText}>Caricamento...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen 
        options={{ 
          title: 'Gestione Payout',
          headerShown: true,
          headerStyle: { backgroundColor: '#1a472a' },
          headerTintColor: '#fff',
        }} 
      />
      
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Configurazione Piattaforma */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="settings" size={24} color="#1a472a" />
            <Text style={styles.sectionTitle}>Configurazione Piattaforma</Text>
          </View>
          
          <View style={styles.configCard}>
            <Text style={styles.configLabel}>IBAN Piattaforma (per ricevere il 20%)</Text>
            <TextInput
              style={styles.ibanInput}
              value={platformIban}
              onChangeText={setPlatformIban}
              placeholder="IT60X0542811101000000123456"
              autoCapitalize="characters"
            />
            
            <View style={styles.configInfo}>
              <View style={styles.configRow}>
                <Text style={styles.configKey}>Venditore:</Text>
                <Text style={styles.configValue}>{config?.seller_percentage}%</Text>
              </View>
              <View style={styles.configRow}>
                <Text style={styles.configKey}>Piattaforma:</Text>
                <Text style={styles.configValue}>{config?.platform_percentage}% - Stripe fees</Text>
              </View>
              <View style={styles.configRow}>
                <Text style={styles.configKey}>Foderazione:</Text>
                <Text style={styles.configValue}>€{config?.foderazione_cost?.toFixed(2)} - Stripe fees</Text>
              </View>
            </View>
            
            <TouchableOpacity
              style={[styles.saveButton, savingConfig && styles.buttonDisabled]}
              onPress={saveConfig}
              disabled={savingConfig}
            >
              {savingConfig ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="save" size={18} color="#fff" />
                  <Text style={styles.saveButtonText}>Salva IBAN</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Controllo Scadenze */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="timer" size={24} color="#FF9800" />
            <Text style={styles.sectionTitle}>Controllo Scadenze</Text>
          </View>
          
          <TouchableOpacity
            style={[styles.checkDeadlinesButton, checkingDeadlines && styles.buttonDisabled]}
            onPress={checkDeadlines}
            disabled={checkingDeadlines}
          >
            {checkingDeadlines ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="refresh" size={20} color="#fff" />
                <Text style={styles.checkDeadlinesText}>Esegui Controllo Scadenze</Text>
              </>
            )}
          </TouchableOpacity>
          
          <Text style={styles.checkDeadlinesNote}>
            Annulla ordini con conferma/consegna scaduta e processa rimborsi automatici
          </Text>
        </View>

        {/* Riepilogo Totali */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="stats-chart" size={24} color="#2196F3" />
            <Text style={styles.sectionTitle}>Riepilogo</Text>
          </View>
          
          <View style={styles.totalsContainer}>
            <View style={[styles.totalCard, { backgroundColor: '#FFF3E0' }]}>
              <Text style={styles.totalLabel}>Da Pagare</Text>
              <Text style={[styles.totalAmount, { color: '#FF9800' }]}>
                €{totals.pending.amount.toFixed(2)}
              </Text>
              <Text style={styles.totalCount}>{totals.pending.count} bonifici</Text>
            </View>
            
            <View style={[styles.totalCard, { backgroundColor: '#E8F5E9' }]}>
              <Text style={styles.totalLabel}>Completati</Text>
              <Text style={[styles.totalAmount, { color: '#4CAF50' }]}>
                €{totals.completed.amount.toFixed(2)}
              </Text>
              <Text style={styles.totalCount}>{totals.completed.count} bonifici</Text>
            </View>
          </View>
        </View>

        {/* Filtri */}
        <View style={styles.filterContainer}>
          <TouchableOpacity
            style={[styles.filterButton, filter === 'pending' && styles.filterButtonActive]}
            onPress={() => setFilter('pending')}
          >
            <Text style={[styles.filterText, filter === 'pending' && styles.filterTextActive]}>
              Da pagare ({totals.pending.count})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, filter === 'completed' && styles.filterButtonActive]}
            onPress={() => setFilter('completed')}
          >
            <Text style={[styles.filterText, filter === 'completed' && styles.filterTextActive]}>
              Completati ({totals.completed.count})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, filter === 'all' && styles.filterButtonActive]}
            onPress={() => setFilter('all')}
          >
            <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
              Tutti
            </Text>
          </TouchableOpacity>
        </View>

        {/* Lista Payout */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="list" size={24} color="#1a472a" />
            <Text style={styles.sectionTitle}>Payout ({filteredPayouts.length})</Text>
          </View>
          
          {filteredPayouts.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-circle" size={48} color="#4CAF50" />
              <Text style={styles.emptyText}>Nessun payout da visualizzare</Text>
            </View>
          ) : (
            filteredPayouts.map((payout) => {
              const statusBadge = getStatusBadge(payout.status);
              return (
                <View key={payout.id} style={styles.payoutCard}>
                  <View style={styles.payoutHeader}>
                    <View style={[styles.recipientBadge, { backgroundColor: getRecipientColor(payout.recipient_type) }]}>
                      <Ionicons name={getRecipientIcon(payout.recipient_type) as any} size={16} color="#fff" />
                      <Text style={styles.recipientType}>
                        {payout.recipient_type === 'seller' ? 'Venditore' : 
                         payout.recipient_type === 'platform' ? 'Piattaforma' : 'Cartolibreria'}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusBadge.bg }]}>
                      <Text style={[styles.statusText, { color: statusBadge.color }]}>
                        {statusBadge.label}
                      </Text>
                    </View>
                  </View>
                  
                  <Text style={styles.payoutRecipient}>{payout.recipient_name}</Text>
                  <Text style={styles.payoutDescription}>{payout.description}</Text>
                  
                  <View style={styles.payoutDetails}>
                    <View style={styles.payoutDetailRow}>
                      <Text style={styles.payoutDetailLabel}>IBAN:</Text>
                      <Text style={styles.payoutDetailValue} numberOfLines={1}>
                        {payout.recipient_iban}
                      </Text>
                    </View>
                    <View style={styles.payoutDetailRow}>
                      <Text style={styles.payoutDetailLabel}>Ordine:</Text>
                      <Text style={styles.payoutDetailValue}>#{payout.order_code}</Text>
                    </View>
                    {payout.stripe_fee > 0 && (
                      <View style={styles.payoutDetailRow}>
                        <Text style={styles.payoutDetailLabel}>Comm. Stripe:</Text>
                        <Text style={styles.payoutDetailValue}>-€{payout.stripe_fee.toFixed(2)}</Text>
                      </View>
                    )}
                  </View>
                  
                  <View style={styles.payoutFooter}>
                    <View>
                      <Text style={styles.payoutAmountLabel}>Da bonificare</Text>
                      <Text style={styles.payoutAmount}>€{payout.net_amount.toFixed(2)}</Text>
                    </View>
                    
                    {payout.status === 'pending' && (
                      <TouchableOpacity
                        style={styles.completeButton}
                        onPress={() => completePayout(payout)}
                      >
                        <Ionicons name="checkmark-circle" size={18} color="#fff" />
                        <Text style={styles.completeButtonText}>Bonifico Fatto</Text>
                      </TouchableOpacity>
                    )}
                    
                    {payout.status === 'completed' && payout.completed_at && (
                      <Text style={styles.completedDate}>
                        Completato il {new Date(payout.completed_at).toLocaleDateString('it-IT')}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>
        
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  section: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  configCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  configLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  ibanInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 1,
  },
  configInfo: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  configRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  configKey: {
    fontSize: 14,
    color: '#666',
  },
  configValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a472a',
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
    gap: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  checkDeadlinesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF9800',
    borderRadius: 8,
    padding: 14,
    gap: 8,
  },
  checkDeadlinesText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  checkDeadlinesNote: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
  totalsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  totalCard: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  totalCount: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
  },
  filterButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#e0e0e0',
  },
  filterButtonActive: {
    backgroundColor: '#1a472a',
  },
  filterText: {
    fontSize: 13,
    color: '#666',
  },
  filterTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginTop: 12,
  },
  payoutCard: {
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
  payoutHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  recipientBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    gap: 6,
  },
  recipientType: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  payoutRecipient: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  payoutDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  payoutDetails: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  payoutDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  payoutDetailLabel: {
    fontSize: 13,
    color: '#666',
  },
  payoutDetailValue: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  payoutFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  payoutAmountLabel: {
    fontSize: 12,
    color: '#666',
  },
  payoutAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a472a',
  },
  completeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
  },
  completeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  completedDate: {
    fontSize: 12,
    color: '#4CAF50',
    fontStyle: 'italic',
  },
});
