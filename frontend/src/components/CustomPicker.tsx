import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  Dimensions,
  StatusBar,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface PickerOption {
  label: string;
  value: string;
}

interface CustomPickerProps {
  selectedValue: string;
  onValueChange: (value: string) => void;
  options: PickerOption[];
  placeholder?: string;
  enabled?: boolean;
  loading?: boolean;
}

export default function CustomPicker({
  selectedValue,
  onValueChange,
  options,
  placeholder = 'Seleziona...',
  enabled = true,
  loading = false,
}: CustomPickerProps) {
  const [modalVisible, setModalVisible] = useState(false);

  const selectedOption = options.find(opt => opt.value === selectedValue);
  const displayText = loading 
    ? 'Caricamento...' 
    : selectedOption?.label || placeholder;

  const handleSelect = (value: string) => {
    onValueChange(value);
    setModalVisible(false);
  };

  return (
    <>
      <TouchableOpacity
        style={[
          styles.pickerButton,
          !enabled && styles.pickerButtonDisabled
        ]}
        onPress={() => enabled && !loading && setModalVisible(true)}
        disabled={!enabled || loading}
        activeOpacity={0.7}
      >
        <Text 
          style={[
            styles.pickerButtonText,
            !selectedValue && styles.pickerButtonPlaceholder
          ]}
          numberOfLines={1}
        >
          {displayText}
        </Text>
        <Ionicons 
          name="chevron-down" 
          size={20} 
          color={enabled ? '#666' : '#ccc'} 
        />
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
        statusBarTranslucent={true}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <TouchableOpacity 
            activeOpacity={1} 
            style={styles.modalContent}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <View style={styles.modalHeader}>
              <View style={styles.handleBar} />
              <View style={styles.headerRow}>
                <Text style={styles.modalTitle}>Seleziona</Text>
                <TouchableOpacity 
                  onPress={() => setModalVisible(false)}
                  style={styles.closeButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close-circle" size={32} color="#999" />
                </TouchableOpacity>
              </View>
            </View>
            
            {/* Options List */}
            <FlatList
              data={options}
              keyExtractor={(item, index) => `${item.value}-${index}`}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.optionItem,
                    item.value === selectedValue && styles.optionItemSelected
                  ]}
                  onPress={() => handleSelect(item.value)}
                  activeOpacity={0.6}
                >
                  <Text 
                    style={[
                      styles.optionText,
                      item.value === selectedValue && styles.optionTextSelected
                    ]}
                    numberOfLines={2}
                  >
                    {item.label}
                  </Text>
                  {item.value === selectedValue && (
                    <Ionicons name="checkmark-circle" size={24} color="#1a472a" />
                  )}
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              showsVerticalScrollIndicator={true}
              style={styles.flatList}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>Nessuna opzione disponibile</Text>
                </View>
              }
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  pickerButtonDisabled: {
    opacity: 0.5,
  },
  pickerButtonText: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  pickerButtonPlaceholder: {
    color: '#999',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: 300,
    maxHeight: SCREEN_HEIGHT * 0.7,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  modalHeader: {
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eeeeee',
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: '#dddddd',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333333',
  },
  closeButton: {
    padding: 4,
  },
  flatList: {
    backgroundColor: '#ffffff',
  },
  listContent: {
    paddingBottom: 20,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#ffffff',
    minHeight: 56,
  },
  optionItemSelected: {
    backgroundColor: '#e8f5e9',
  },
  optionText: {
    fontSize: 16,
    color: '#333333',
    flex: 1,
    marginRight: 12,
  },
  optionTextSelected: {
    color: '#1a472a',
    fontWeight: '600',
  },
  separator: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginLeft: 20,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999999',
  },
});
