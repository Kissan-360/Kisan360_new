export interface MobileNotification {
  id: string;
  kind?: string;
  title?: string;
  message?: string;
  type?: string;
  category?: string;
  to?: string;
  createdAt?: string;
}

const ROUTE_MAP: Record<string, string> = {
  "/trade": "Trade",
  "/weather": "Decision",
  "/advisory": "Chat",
  "/lots": "Trade",
  "/offers": "Trade",
  "/payments": "Trade",
  "/grievances": "Trade",
};

export function notificationRoute(notification: MobileNotification): string | null {
  if (!notification.to) return null;
  return ROUTE_MAP[notification.to] || null;
}

export function parseSeenAt(raw: string | null): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function isUnread(notification: MobileNotification, seenAt: number): boolean {
  const created = Date.parse(notification.createdAt || "");
  if (!Number.isFinite(created)) return true;
  return created > seenAt;
}

export function unreadCount(notifications: MobileNotification[], seenAt: number): number {
  return notifications.filter((notification) => isUnread(notification, seenAt)).length;
}

export function sortNotifications(notifications: MobileNotification[]): MobileNotification[] {
  return [...notifications].sort(
    (a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""),
  );
}
