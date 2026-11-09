import React, { useCallback, useState } from "react";
import { ActivityIndicator, Button, RefreshControl, ScrollView, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import {
  MobileNotification,
  fetchNotifications,
  loadSeenAt,
  markAllSeen,
  unreadCount,
} from "../services/notifications";
import { notificationRoute } from "../services/notificationState";

function typeColor(type?: string) {
  if (type === "danger") return "#b91c1c";
  if (type === "warning") return "#b45309";
  if (type === "success") return "#006b2c";
  return "#0369a1";
}

export default function NotificationsScreen({ navigation }: any) {
  const [items, setItems] = useState<MobileNotification[]>([]);
  const [seenAt, setSeenAt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const [seen, notifications] = await Promise.all([loadSeenAt(), fetchNotifications()]);
      setSeenAt(seen);
      setItems(notifications);
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message || "Could not load notifications");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const markSeen = async () => {
    const now = await markAllSeen();
    setSeenAt(now);
  };

  const open = (notification: MobileNotification) => {
    const route = notificationRoute(notification);
    if (route) navigation?.navigate?.(route);
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 12 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontSize: 20, fontWeight: "700" }}>
          Notifications {unreadCount(items, seenAt) ? `(${unreadCount(items, seenAt)} new)` : ""}
        </Text>
        <Button title="Mark all read" onPress={markSeen} />
      </View>
      {loading ? <ActivityIndicator /> : null}
      {!!error ? <Text style={{ color: "red" }}>{error}</Text> : null}
      {!loading && !error && items.length === 0 ? (
        <Text style={{ color: "#666" }}>No notifications yet. Deal events, weather alerts, and farm tips appear here.</Text>
      ) : null}
      {items.map((notification) => {
        const unread = Date.parse(notification.createdAt || "") > seenAt;
        return (
          <View
            key={notification.id}
            style={{
              borderWidth: 1,
              borderColor: unread ? "#f59e0b" : "#e5e7eb",
              borderRadius: 10,
              padding: 12,
              gap: 4,
              backgroundColor: unread ? "#fffbeb" : "#ffffff",
            }}
          >
            <Text style={{ fontWeight: "700", color: typeColor(notification.type) }}>
              {notification.title || "Notification"}
            </Text>
            {!!notification.message ? <Text>{notification.message}</Text> : null}
            <Text style={{ color: "#666", fontSize: 12 }}>
              {notification.category || "general"}
              {notification.createdAt ? ` · ${new Date(notification.createdAt).toLocaleString()}` : ""}
            </Text>
            {notificationRoute(notification) ? (
              <Button title="Open" onPress={() => open(notification)} />
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}
