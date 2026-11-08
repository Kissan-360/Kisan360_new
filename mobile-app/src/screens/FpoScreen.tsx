import React, { useState } from "react";
import { ActivityIndicator, Button, ScrollView, Text, TextInput, View } from "react-native";
import { Endpoints } from "../services/api";

export default function FpoScreen() {
  const [crop, setCrop] = useState("Onion");
  const [district, setDistrict] = useState("Nashik");
  const [qty, setQty] = useState("40");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await Endpoints.fpoPool({ crop, district, quantity: Number(qty) });
      setResult(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message || "FPO pooling failed (needs DB)");
    } finally {
      setLoading(false);
    }
  };

  const styles = { input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12 } };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 20, fontWeight: "700" }}>FPO pooling</Text>
      <Text style={{ color: "#555", fontSize: 13 }}>
        Pool lots through an FPO to unlock bulk transport tier (≥40 q) and buyers who need minimum quantities. Compare pooled vs individual — economic rank stays buyer-blind.
      </Text>
      <TextInput value={crop} onChangeText={setCrop} placeholder="Crop" style={styles.input} />
      <TextInput value={district} onChangeText={setDistrict} placeholder="District" style={styles.input} />
      <TextInput value={qty} onChangeText={setQty} placeholder="Pooled qty (q)" keyboardType="numeric" style={styles.input} />
      <Button title={loading ? "Pooling..." : "Check pooling"} onPress={run} />
      {loading ? <ActivityIndicator /> : null}
      {!!error ? <Text style={{ color: "red" }}>{error}</Text> : null}
      {result ? (
        <View style={{ gap: 6, padding: 12, borderWidth: 1, borderColor: "#d1fae5", borderRadius: 12, backgroundColor: "#f0fdf4" }}>
          <Text style={{ fontWeight: "700" }}>
            Pooled: Rs {result.pooledNetPerQuintal ?? result?.uplift ?? "—"}/q net
          </Text>
          <Text style={{ color: "#555", fontSize: 12 }}>
            {JSON.stringify(result).slice(0, 400)}
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}
