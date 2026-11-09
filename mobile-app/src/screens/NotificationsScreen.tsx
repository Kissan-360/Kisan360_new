import React, { useCallback, useState } from "react";
import { ActivityIndicator, Button, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import {
  MobileNotification,
  PriceAlert,
  createPriceAlert,
  deletePriceAlert,
  fetchNotifications,
  fetchPriceAlerts,
  loadSeenAt,
  markAllSeen,
  unreadCount,
  updatePriceAlert,
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
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [alertError, setAlertError] = useState("");
  const [crop, setCrop] = useState("Onion");
  const [market, setMarket] = useState("APMC Lasalgaon");
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [target, setTarget] = useState("");

  const loadAlerts = useCallback(async () => {
    try {
      setAlerts(await fetchPriceAlerts());
    } catch {
      setAlertError("Price alerts unavailable while offline.");
    }
  }, []);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const [seen, notifications] = await Promise.all([loadSeenAt(), fetchNotifications()]);
      setSeenAt(seen);
      setItems(notifications);
      await loadAlerts();
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message || "Could not load notifications");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadAlerts]);

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

  const addAlert = async () => {
    setAlertError("");
    try {
      await createPriceAlert({ crop, market, direction, targetPrice: Number(target) });
      setTarget("");
      await loadAlerts();
      await load(true);
    } catch (e: any) {
      setAlertError(e?.response?.data?.error || e.message || "Could not add alert");
    }
  };

  const toggleAlert = async (alert: PriceAlert) => {
    setAlertError("");
    try {
      await updatePriceAlert(alert._id, !alert.active);
      await loadAlerts();
    } catch (e: any) {
      setAlertError(e?.response?.data?.error || e.message || "Could not update alert");
    }
  };

  const removeAlert = async (alert: PriceAlert) => {
    setAlertError("");
    try {
      await deletePriceAlert(alert._id);
      await loadAlerts();
    } catch (e: any) {
      setAlertError(e?.response?.data?.error || e.message || "Could not delete alert");
    }
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

      <View style={{ borderTopWidth: 1, borderTopColor: "#e5e7eb", paddingTop: 12, gap: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: "700" }}>Price alerts</Text>
        <Text style={{ color: "#666", fontSize: 12 }}>
          Observed modal only — alerts fire here when the target is crossed.
        </Text>
        {!!alertError ? <Text style={{ color: "red" }}>{alertError}</Text> : null}
        {alerts.map((alert) => (
          <View key={alert._id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <Text style={{ flex: 1, opacity: alert.active ? 1 : 0.5, textDecorationLine: alert.active ? "none" : "line-through" }}>
              {alert.crop} · {alert.market} · {alert.direction} ₹{Number(alert.targetPrice).toLocaleString("en-IN")}/q
            </Text>
            <Button title={alert.active ? "Pause" : "Resume"} onPress={() => toggleAlert(alert)} />
            <Button title="Delete" onPress={() => removeAlert(alert)} />
          </View>
        ))}
        <TextInput value={crop} onChangeText={setCrop} placeholder="Crop" style={styles.input} />
        <TextInput value={market} onChangeText={setMarket} placeholder="Market" style={styles.input} />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1, opacity: direction === "above" ? 1 : 0.5 }}>
            <Button title="At/above" onPress={() => setDirection("above")} />
          </View>
          <View style={{ flex: 1, opacity: direction === "below" ? 1 : 0.5 }}>
            <Button title="At/below" onPress={() => setDirection("below")} />
          </View>
        </View>
        <TextInput value={target} onChangeText={setTarget} placeholder="Target ₹/q" keyboardType="numeric" style={styles.input} />
        <Button title="Add alert" onPress={addAlert} />
      </View>
    </ScrollView>
  );
}

const styles = { input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12 } };
