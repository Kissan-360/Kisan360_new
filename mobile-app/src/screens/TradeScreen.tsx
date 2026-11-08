import React, { useCallback, useState } from "react";
import { ActivityIndicator, Button, FlatList, Text, View } from "react-native";
import { Endpoints } from "../services/api";

export default function TradeScreen() {
  const [lots, setLots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await Endpoints.listLots();
      const data = res.data;
      setLots(Array.isArray(data) ? data : data.lots || data.data || []);
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message || "Failed to load lots");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 20, fontWeight: "700" }}>Trade — lots</Text>
      <Button title={loading ? "Loading..." : "Refresh lots"} onPress={load} />
      {loading ? <ActivityIndicator /> : null}
      {!!error ? <Text style={{ color: "red" }}>{error}</Text> : null}
      <FlatList
        data={lots}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <Text>
            {item.crop || "lot"} · {item.quantity ?? item.quantityQuintals ?? "?"}q · {item.district || ""}
          </Text>
        )}
        ListEmptyComponent={<Text style={{ color: "#666" }}>No lots yet. Create one from the web app or Decision screen.</Text>}
      />
      <Text style={{ color: "#888", fontSize: 12 }}>
        Payments are simulated in the demo — no real money moves.
      </Text>
    </View>
  );
}
