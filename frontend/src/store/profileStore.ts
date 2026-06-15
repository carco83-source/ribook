import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ProfileState {
  // ID del profilo figlio attualmente selezionato
  selectedChildId: string | null;
  
  // Setta il profilo selezionato
  setSelectedChildId: (id: string | null) => void;
  
  // Reset dello store (per logout)
  reset: () => void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      selectedChildId: null,
      
      setSelectedChildId: (id) => set({ selectedChildId: id }),
      
      reset: () => set({ selectedChildId: null }),
    }),
    {
      name: 'profile-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
