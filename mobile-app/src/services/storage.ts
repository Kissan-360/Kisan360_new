import AsyncStorage from '@react-native-async-storage/async-storage';

const PROBE_KEY = 'kisan360:storage:probe';

export const initializeStorage = async () => {
  try {
    await AsyncStorage.setItem(PROBE_KEY, '1');
    await AsyncStorage.removeItem(PROBE_KEY);
    return true;
  } catch (error) {
    console.error('Storage initialization error:', error);
    throw error;
  }
};

export const storage = {
  setItem: async (key: string, value: string) => {
    try {
      await AsyncStorage.setItem(key, value);
    } catch (error) {
      console.error('Storage setItem error:', error);
      throw error;
    }
  },

  getItem: async (key: string) => {
    try {
      return await AsyncStorage.getItem(key);
    } catch (error) {
      console.error('Storage getItem error:', error);
      throw error;
    }
  },

  removeItem: async (key: string) => {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error('Storage removeItem error:', error);
      throw error;
    }
  },

  setJson: async <T,>(key: string, value: T) => {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  },

  getJson: async <T,>(key: string): Promise<T | null> => {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
};
