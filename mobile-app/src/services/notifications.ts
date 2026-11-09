import AsyncStorage from '@react-native-async-storage/async-storage';
import { Endpoints } from './api';
import {
  MobileNotification,
  parseSeenAt,
  sortNotifications,
  unreadCount,
} from './notificationState';

export type { MobileNotification };

const SEEN_KEY = 'kisan360-notif-seen';

export const initializeNotifications = async () => {
  try {
    await AsyncStorage.setItem('kisan360:notifications:probe', '1');
    await AsyncStorage.removeItem('kisan360:notifications:probe');
    return true;
  } catch (error) {
    console.error('Notifications initialization error:', error);
    throw error;
  }
};

export async function loadSeenAt(): Promise<number> {
  const raw = await AsyncStorage.getItem(SEEN_KEY).catch(() => null);
  return parseSeenAt(raw);
}

export async function markAllSeen(now = Date.now()): Promise<number> {
  await AsyncStorage.setItem(SEEN_KEY, String(now)).catch(() => {});
  return now;
}

export async function fetchNotifications(): Promise<MobileNotification[]> {
  const res = await Endpoints.notifications();
  const items = Array.isArray(res.data?.notifications) ? res.data.notifications : [];
  return sortNotifications(items);
}

export { unreadCount };
