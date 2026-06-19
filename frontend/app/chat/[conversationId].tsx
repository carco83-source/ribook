import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GlobalTabBar from '../../components/GlobalTabBar';

const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL 
  ? `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`
  : Constants.expoConfig?.extra?.apiUrl || '/api';

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_username: string;
  content: string;
  created_at: string;
  read: boolean;
}

interface ConversationInfo {
  id: string;
  listing_id: string;
  book_isbn: string;
  book_title: string;
  buyer_id: string;
  buyer_username: string;
  seller_id: string;
  seller_username: string;
}

export default function ChatScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [conversation, setConversation] = useState<ConversationInfo | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const loadChat = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      setUserId(storedUserId);

      // Load conversation info
      const convResponse = await fetch(`${API_BASE}/conversations/detail/${conversationId}`);
      if (convResponse.ok) {
        const convData = await convResponse.json();
        setConversation(convData);
      }

      // Load messages
      const msgResponse = await fetch(`${API_BASE}/conversations/${conversationId}/messages`);
      if (msgResponse.ok) {
        const msgData = await msgResponse.json();
        setMessages(msgData.messages || []);
        
        // Hide presets if there are already messages - RIMOSSO
      }

      // Mark messages as read
      if (storedUserId) {
        await fetch(`${API_BASE}/conversations/${conversationId}/read`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: storedUserId }),
        });
      }
    } catch (error) {
      console.error('Error loading chat:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChat();

    // Poll for new messages every 5 seconds
    const interval = setInterval(() => {
      loadNewMessages();
    }, 5000);

    return () => clearInterval(interval);
  }, [conversationId]);

  const loadNewMessages = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('user_id');
      const msgResponse = await fetch(`${API_BASE}/conversations/${conversationId}/messages`);
      if (msgResponse.ok) {
        const msgData = await msgResponse.json();
        setMessages(msgData.messages || []);
        
        // Mark as read
        if (storedUserId) {
          await fetch(`${API_BASE}/conversations/${conversationId}/read`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: storedUserId }),
          });
        }
      }
    } catch (error) {
      // Ignore errors during polling
    }
  };

  const sendMessage = async (content: string) => {
    if (!content.trim() || !userId) return;

    setSending(true);
    try {
      const response = await fetch(`${API_BASE}/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_id: userId,
          content: content.trim(),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setMessages((prev) => [...prev, data.message]);
        setNewMessage('');
        
        // Scroll to bottom
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      } else {
        // Gestisce l'errore dal server (es. filtro messaggi)
        const errorData = await response.json();
        const errorMessage = errorData.detail || 'Impossibile inviare il messaggio';
        Alert.alert('Messaggio non inviato', errorMessage);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Errore', 'Si è verificato un errore durante l\'invio del messaggio');
    } finally {
      setSending(false);
    }
  };

  const getOtherUserName = () => {
    if (!conversation) return 'Utente';
    return userId === conversation.buyer_id
      ? conversation.seller_username
      : conversation.buyer_username;
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  };

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isOwn = item.sender_id === userId;
    const showDate =
      index === 0 ||
      new Date(item.created_at).toDateString() !==
        new Date(messages[index - 1].created_at).toDateString();

    return (
      <>
        {showDate && (
          <Text style={styles.dateHeader}>
            {new Date(item.created_at).toLocaleDateString('it-IT', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </Text>
        )}
        <View style={[styles.messageRow, isOwn && styles.messageRowOwn]}>
          <View style={[styles.messageBubble, isOwn ? styles.ownBubble : styles.otherBubble]}>
            <Text style={[styles.messageText, isOwn && styles.ownMessageText]}>
              {item.content}
            </Text>
            <Text style={[styles.messageTime, isOwn && styles.ownMessageTime]}>
              {formatTime(item.created_at)}
              {isOwn && (
                <Ionicons
                  name={item.read ? 'checkmark-done' : 'checkmark'}
                  size={14}
                  color={item.read ? '#4CAF50' : '#fff'}
                  style={{ marginLeft: 4 }}
                />
              )}
            </Text>
          </View>
        </View>
      </>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen
          options={{
            title: 'Chat',
            headerShown: true,
            headerStyle: { backgroundColor: '#1a472a' },
            headerTintColor: '#fff',
          }}
        />
        <ActivityIndicator size="large" color="#1a472a" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <Stack.Screen
        options={{
          title: getOtherUserName(),
          headerShown: true,
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

      {/* Book Info Banner */}
      {conversation && (
        <View style={styles.bookBanner}>
          <Ionicons name="book" size={16} color="#1a472a" />
          <Text style={styles.bookBannerText} numberOfLines={1}>
            {conversation.book_title || 'Libro'}
          </Text>
        </View>
      )}

      {/* Messages List */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <Ionicons name="chatbubble-outline" size={48} color="#ccc" />
            <Text style={styles.emptyChatText}>Inizia la conversazione!</Text>
          </View>
        }
      />

      {/* Input Area */}
      <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 16) + 70 }]}>
        <TextInput
          style={styles.textInput}
          placeholder="Scrivi un messaggio..."
          placeholderTextColor="#999"
          value={newMessage}
          onChangeText={setNewMessage}
          multiline
          maxLength={1000}
        />
        <TouchableOpacity
          style={[styles.sendButton, !newMessage.trim() && styles.sendButtonDisabled]}
          onPress={() => sendMessage(newMessage)}
          disabled={!newMessage.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
      
      {/* Tab Bar Globale */}
      <GlobalTabBar currentTab="chats" />
    </KeyboardAvoidingView>
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
  bookBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    padding: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#c8e6c9',
  },
  bookBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#1a472a',
    fontWeight: '500',
  },
  messagesList: {
    padding: 16,
    flexGrow: 1,
  },
  dateHeader: {
    textAlign: 'center',
    fontSize: 12,
    color: '#888',
    marginVertical: 16,
    textTransform: 'capitalize',
  },
  messageRow: {
    marginBottom: 8,
    flexDirection: 'row',
  },
  messageRowOwn: {
    justifyContent: 'flex-end',
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
  },
  otherBubble: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 4,
  },
  ownBubble: {
    backgroundColor: '#1a472a',
    borderTopRightRadius: 4,
  },
  messageText: {
    fontSize: 15,
    color: '#333',
    lineHeight: 20,
  },
  ownMessageText: {
    color: '#fff',
  },
  messageTime: {
    fontSize: 10,
    color: '#999',
    marginTop: 4,
    textAlign: 'right',
  },
  ownMessageTime: {
    color: 'rgba(255,255,255,0.7)',
  },
  emptyChat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyChatText: {
    fontSize: 16,
    color: '#888',
    marginTop: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#fff',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 12,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    color: '#333',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1a472a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
});
