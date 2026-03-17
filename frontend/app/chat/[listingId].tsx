import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Definizione degli step della chat guidata
type ChatStep = 'disponibilita' | 'condizione' | 'dettagli' | 'conferma' | 'completato';

interface Message {
  id: string;
  sender_id: string;
  sender_username: string;
  message: string | null;
  message_type?: 'system' | 'guided' | 'action';
  created_at: string;
}

// Opzioni predefinite per ogni step
const STEP_OPTIONS = {
  disponibilita: {
    title: 'Disponibilità',
    question: 'Il libro è ancora disponibile?',
    options: [
      { id: 'si_disponibile', text: 'Sì, il libro è disponibile', icon: 'checkmark-circle' },
      { id: 'no_disponibile', text: 'No, il libro non è più disponibile', icon: 'close-circle' },
      { id: 'riservato', text: 'Il libro è riservato per un altro utente', icon: 'time' },
    ]
  },
  condizione: {
    title: 'Condizione del libro',
    question: 'Puoi confermare lo stato del libro?',
    options: [
      { id: 'completo_perfetto', text: 'Completo e in ottime condizioni', icon: 'star' },
      { id: 'completo_usato', text: 'Completo con segni di usura', icon: 'checkmark' },
      { id: 'manca_fascicolo', text: 'Manca un fascicolo/allegato', icon: 'alert-circle' },
      { id: 'come_foto', text: 'Le condizioni sono come nelle foto', icon: 'camera' },
    ]
  },
  dettagli: {
    title: 'Dettagli per lo scambio',
    question: 'Quando e dove preferisci?',
    options: [
      { id: 'cartolibreria', text: 'Posso portarlo in cartolibreria questa settimana', icon: 'storefront' },
      { id: 'gia_cartolibreria', text: 'Il libro è già in cartolibreria', icon: 'location' },
      { id: 'settimana_prossima', text: 'Disponibile dalla settimana prossima', icon: 'calendar' },
      { id: 'contatto_cartolibreria', text: 'Ti contatterà la cartolibreria', icon: 'call' },
    ]
  },
  conferma: {
    title: 'Conferma scambio',
    question: 'Vuoi procedere con lo scambio?',
    options: [
      { id: 'conferma_scambio', text: 'Confermo, procediamo con lo scambio!', icon: 'checkmark-done-circle' },
      { id: 'aspetta', text: 'Aspetta, devo verificare', icon: 'pause-circle' },
      { id: 'annulla', text: 'Non sono più interessato', icon: 'close-circle' },
    ]
  }
};

// Risposte automatiche del sistema
const AUTO_RESPONSES: { [key: string]: string } = {
  'si_disponibile': 'Ottimo! Il libro è disponibile.',
  'no_disponibile': 'Mi dispiace, il libro non è più disponibile.',
  'riservato': 'Il libro è già riservato per un altro utente.',
  'completo_perfetto': 'Il libro è completo e in ottime condizioni.',
  'completo_usato': 'Il libro è completo con normali segni di usura.',
  'manca_fascicolo': 'Attenzione: manca un fascicolo o allegato.',
  'come_foto': 'Le condizioni sono esattamente come mostrato nelle foto.',
  'cartolibreria': 'Porterò il libro in cartolibreria questa settimana.',
  'gia_cartolibreria': 'Il libro è già depositato in cartolibreria.',
  'settimana_prossima': 'Sarò disponibile dalla settimana prossima.',
  'contatto_cartolibreria': 'La cartolibreria ti contatterà per il ritiro.',
  'conferma_scambio': 'Scambio confermato! Procediamo.',
  'aspetta': 'Ok, fammi sapere quando sei pronto.',
  'annulla': 'Va bene, scambio annullato.',
};

export default function GuidedChatScreen() {
  const router = useRouter();
  const { listingId, otherUserId, otherUsername, title, isSeller } = useLocalSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<ChatStep>('disponibilita');
  const [isSellerUser, setIsSellerUser] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    loadMessages();
    setIsSellerUser(isSeller === 'true');
    const interval = setInterval(loadMessages, 5000);
    return () => clearInterval(interval);
  }, [listingId, otherUserId]);

  const loadMessages = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      if (!storedUserId) {
        router.replace('/');
        return;
      }
      setUserId(storedUserId);

      const response = await axios.get(
        `${API_URL}/api/chat/messages/${listingId}/${otherUserId}?user_id=${storedUserId}`
      );
      setMessages(response.data);
      
      // Determina lo step corrente basato sui messaggi
      determineCurrentStep(response.data);
    } catch (error) {
      console.error('Error loading messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const determineCurrentStep = (msgs: Message[]) => {
    // Analizza i messaggi per capire a che step siamo
    const lastMessages = msgs.slice(-5).map(m => m.message?.toLowerCase() || '');
    
    if (lastMessages.some(m => m.includes('confermato') || m.includes('annullato'))) {
      setCurrentStep('completato');
    } else if (lastMessages.some(m => m.includes('cartolibreria') || m.includes('settimana'))) {
      setCurrentStep('conferma');
    } else if (lastMessages.some(m => m.includes('completo') || m.includes('condizioni'))) {
      setCurrentStep('dettagli');
    } else if (lastMessages.some(m => m.includes('disponibile'))) {
      setCurrentStep('condizione');
    } else {
      setCurrentStep('disponibilita');
    }
  };

  const sendGuidedMessage = async (optionId: string, messageText: string) => {
    if (sending || !userId) return;
    
    setSending(true);
    try {
      await axios.post(`${API_URL}/api/chat/messages`, {
        listing_id: listingId,
        sender_id: userId,
        receiver_id: otherUserId,
        message: messageText,
      });

      // Avanza allo step successivo
      advanceToNextStep(optionId);
      
      // Ricarica messaggi
      loadMessages();
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSending(false);
    }
  };

  const advanceToNextStep = (optionId: string) => {
    // Logica per avanzare agli step
    if (optionId === 'no_disponibile' || optionId === 'riservato' || optionId === 'annulla') {
      setCurrentStep('completato');
    } else if (optionId === 'conferma_scambio') {
      setCurrentStep('completato');
    } else if (currentStep === 'disponibilita') {
      setCurrentStep('condizione');
    } else if (currentStep === 'condizione') {
      setCurrentStep('dettagli');
    } else if (currentStep === 'dettagli') {
      setCurrentStep('conferma');
    }
  };

  const formatTime = (timeString: string) => {
    const date = new Date(timeString);
    return date.toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === userId;

    return (
      <View style={[
        styles.messageContainer,
        isMe ? styles.myMessage : styles.theirMessage,
      ]}>
        <Text style={[
          styles.messageText,
          isMe ? styles.myMessageText : styles.theirMessageText,
        ]}>
          {item.message}
        </Text>
        <Text style={[
          styles.messageTime,
          isMe ? styles.myMessageTime : styles.theirMessageTime,
        ]}>
          {formatTime(item.created_at)}
        </Text>
      </View>
    );
  };

  const renderStepOptions = () => {
    if (currentStep === 'completato') {
      return (
        <View style={styles.completedContainer}>
          <Ionicons name="checkmark-done-circle" size={48} color="#4CAF50" />
          <Text style={styles.completedTitle}>Conversazione completata</Text>
          <Text style={styles.completedText}>
            Lo scambio è stato gestito. Controlla le tue notifiche per aggiornamenti.
          </Text>
          <TouchableOpacity 
            style={styles.backHomeButton}
            onPress={() => router.push('/(tabs)')}
          >
            <Text style={styles.backHomeButtonText}>Torna alla Home</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const stepConfig = STEP_OPTIONS[currentStep];
    if (!stepConfig) return null;

    return (
      <View style={styles.optionsContainer}>
        <View style={styles.stepHeader}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>{stepConfig.title}</Text>
          </View>
          <Text style={styles.stepQuestion}>{stepConfig.question}</Text>
        </View>

        <ScrollView style={styles.optionsScroll} showsVerticalScrollIndicator={false}>
          {stepConfig.options.map((option) => (
            <TouchableOpacity
              key={option.id}
              style={styles.optionButton}
              onPress={() => sendGuidedMessage(option.id, AUTO_RESPONSES[option.id])}
              disabled={sending}
            >
              <Ionicons 
                name={option.icon as any} 
                size={24} 
                color="#1a472a" 
                style={styles.optionIcon}
              />
              <Text style={styles.optionText}>{option.text}</Text>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>
          ))}
        </ScrollView>

        {sending && (
          <View style={styles.sendingOverlay}>
            <ActivityIndicator size="small" color="#1a472a" />
            <Text style={styles.sendingText}>Invio in corso...</Text>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen
          options={{
            title: 'Chat',
            headerStyle: { backgroundColor: '#1a472a' },
            headerTintColor: '#fff',
            headerLeft: () => (
              <TouchableOpacity 
                onPress={() => router.canGoBack() ? router.back() : router.push('/(tabs)')} 
                style={{ marginLeft: 16, padding: 8 }}
              >
                <Ionicons name="arrow-back" size={24} color="#fff" />
              </TouchableOpacity>
            ),
          }}
        />
        <ActivityIndicator size="large" color="#1a472a" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: otherUsername ? decodeURIComponent(otherUsername as string) : 'Chat',
          headerStyle: { backgroundColor: '#1a472a' },
          headerTintColor: '#fff',
          headerLeft: () => (
            <TouchableOpacity 
              onPress={() => router.canGoBack() ? router.back() : router.push('/(tabs)')} 
              style={{ marginLeft: 16, padding: 8 }}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
          ),
        }}
      />

      {/* Book Info Header */}
      <View style={styles.bookInfoHeader}>
        <Ionicons name="book" size={20} color="#1a472a" />
        <Text style={styles.bookInfoTitle} numberOfLines={1}>
          {title ? decodeURIComponent(title as string) : 'Libro'}
        </Text>
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="shield-checkmark" size={16} color="#1a472a" />
        <Text style={styles.infoBannerText}>
          Chat guidata - Seleziona una risposta per procedere
        </Text>
      </View>

      {/* Messages List */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>Inizia la conversazione</Text>
            <Text style={styles.emptySubtext}>
              Seleziona un'opzione qui sotto per comunicare
            </Text>
          </View>
        }
      />

      {/* Guided Options - NO FREE INPUT */}
      {renderStepOptions()}
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
    backgroundColor: '#f5f5f5',
  },
  bookInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  bookInfoTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#1a472a',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff3e0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 12,
    color: '#e65100',
  },
  messagesList: {
    padding: 16,
    flexGrow: 1,
  },
  messageContainer: {
    maxWidth: '80%',
    marginVertical: 4,
    padding: 12,
    borderRadius: 16,
  },
  myMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#1a472a',
    borderBottomRightRadius: 4,
  },
  theirMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  myMessageText: {
    color: '#fff',
  },
  theirMessageText: {
    color: '#333',
  },
  messageTime: {
    fontSize: 10,
    marginTop: 4,
  },
  myMessageTime: {
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'right',
  },
  theirMessageTime: {
    color: '#999',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  optionsContainer: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingBottom: 20,
  },
  stepHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  stepBadge: {
    backgroundColor: '#1a472a',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
  },
  stepBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  stepQuestion: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  optionsScroll: {
    maxHeight: 250,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  optionIcon: {
    marginRight: 12,
  },
  optionText: {
    flex: 1,
    fontSize: 15,
    color: '#333',
  },
  sendingOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: '#f5f5f5',
    gap: 8,
  },
  sendingText: {
    fontSize: 14,
    color: '#666',
  },
  completedContainer: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    padding: 24,
    alignItems: 'center',
  },
  completedTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 12,
  },
  completedText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
  backHomeButton: {
    backgroundColor: '#1a472a',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  backHomeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
