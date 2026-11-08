import React, { useCallback, useState } from "react";
import { ActivityIndicator, Button, FlatList, ScrollView, Text, TextInput, View } from "react-native";
import { Endpoints } from "../services/api";

export default function TradeScreen() {
  const [lots, setLots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [crop, setCrop] = useState("Onion");
  const [district, setDistrict] = useState("Nashik");
  const [qty, setQty] = useState("10");

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

  const create = async () => {
    setLoading(true);
    setError("");
    setMsg("");
    try {
      const res = await Endpoints.createLot({
        crop, district, quantity: Number(qty), unit: "quintals",
      });
      setMsg(`Lot created: ${res.data?.id || res.data?._id || "ok"} — ${crop} ${qty}q ${district}`);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message || "Create failed");
    } finally {
      setLoading(false);
    }
  };

  const styles = { input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10 } };

  return (
    <View style={{ flex: 1, padding: 16, gap: 10 }}>
      <Text style={{ fontSize: 20, fontWeight: "700" }}>Trade — lots</Text>
      <ScrollView style={{ gap: 8 }}>
        <TextInput value={crop} onChangeText={setCrop} placeholder="Crop" style={styles.input} />
        <TextInput value={district} onChangeText={setDistrict} placeholder="District" style={styles.input} />
        <TextInput value={qty} onChangeText={setQty} placeholder="Qty (q)" keyboardType="numeric" style={styles.input} />
        <Button title={loading ? "Working..." : "Create lot"} onPress={create} />
        <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
          <View style={{ flex: 1 }}>
            <Button title={loading ? "Loading..." : "Refresh lots"} onPress={load} />
          </View>
        </View>
      </ScrollView>
      {loading ? <ActivityIndicator /> : null}
      {!!error ? <Text style={{ color: "red" }}>{error}</Text> : null}
      {!!msg ? <Text style={{ color: "#006b2c" }}>{msg}</Text> : null}
      <FlatList
        data={lots}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <Text>
            {item.crop || "lot"} · {item.quantity ?? item.quantityQuintals ?? "?"}q · {item.district || ""} · {item.status || ""}
          </Text>
        )}
        ListEmptyComponent={<Text style={{ color: "#666" }}>No lots yet. Create one above.</Text>}
      />
      <Text style={{ color: "#888", fontSize: 12 }}>
        Payments are simulated in the demo — no real money moves.
      </Text>
    </View>
  );
}
