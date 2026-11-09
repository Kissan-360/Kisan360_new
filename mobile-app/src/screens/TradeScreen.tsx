import React, { useCallback, useState } from "react";
import { ActivityIndicator, Button, FlatList, ScrollView, Text, TextInput, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { Endpoints } from "../services/api";
import { CROPS, DISTRICTS } from "../data/maharashtra";

export default function TradeScreen() {
  const [lots, setLots] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [crop, setCrop] = useState("Onion");
  const [district, setDistrict] = useState("Nashik");
  const [qty, setQty] = useState("10");

  const loadLots = useCallback(async () => {
    try {
      const res = await Endpoints.listLots();
      const data = res.data;
      setLots(Array.isArray(data) ? data : data.lots || data.data || []);
    } catch (e: any) {
      throw e;
    }
  }, []);

  const loadPayments = useCallback(async () => {
    try {
      const res = await Endpoints.listPayments();
      const data = res.data;
      setPayments(Array.isArray(data) ? data : data.payments || data.data || []);
    } catch {
      // payments list may be empty before any offer; keep silent
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await loadLots();
      await loadPayments();
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [loadLots, loadPayments]);

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

  const simulate = async (id: string, release: boolean) => {
    setLoading(true);
    setError("");
    try {
      const fn = release ? Endpoints.releasePayment : Endpoints.failPayment;
      await fn(id);
      setMsg(release ? `Simulated release: ${id}` : `Simulated failure: ${id}`);
      await loadPayments();
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message || "Payment simulation failed");
    } finally {
      setLoading(false);
    }
  };

  const styles = { input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10 } };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
      <Text style={{ fontSize: 20, fontWeight: "700" }}>Trade — lots & payments</Text>
      <Text style={{ fontWeight: "600" }}>Crop</Text>
      <Picker selectedValue={crop} onValueChange={(v) => setCrop(v)} style={styles.input}>
        {CROPS.map((c) => <Picker.Item key={c} label={c} value={c} />)}
      </Picker>
      <Text style={{ fontWeight: "600" }}>District</Text>
      <Picker selectedValue={district} onValueChange={(v) => setDistrict(v)} style={styles.input}>
        {DISTRICTS.map((d) => <Picker.Item key={d} label={d} value={d} />)}
      </Picker>
      <TextInput value={qty} onChangeText={setQty} placeholder="Qty (q)" keyboardType="numeric" style={styles.input} />
      <Button title={loading ? "Working..." : "Create lot"} onPress={create} />
      <Button title={loading ? "Loading..." : "Refresh"} onPress={load} />
      {loading ? <ActivityIndicator /> : null}
      {!!error ? <Text style={{ color: "red" }}>{error}</Text> : null}
      {!!msg ? <Text style={{ color: "#006b2c" }}>{msg}</Text> : null}

      <FlatList
        data={lots}
        keyExtractor={(_, i) => `lot-${i}`}
        renderItem={({ item }) => (
          <Text style={{ paddingVertical: 4 }}>
            {item.crop || "lot"} · {item.quantity ?? item.quantityQuintals ?? "?"}q · {item.district || ""} · {item.status || ""}
          </Text>
        )}
        ListEmptyComponent={<Text style={{ color: "#666" }}>No lots yet. Create one above.</Text>}
        scrollEnabled={false}
      />

      <Text style={{ fontWeight: "700", marginTop: 8 }}>Payments (simulated)</Text>
      {payments.length ? (
        payments.map((p, i) => (
          <View key={i} style={{ gap: 4, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#eee" }}>
            <Text>
              {(p.id || p._id || "")} · Rs {p.amount ?? p.amountTotal ?? "?"} · {p.status || "pending"}
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Button title="Release" onPress={() => simulate(p.id || p._id, true)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Fail" onPress={() => simulate(p.id || p._id, false)} />
              </View>
            </View>
          </View>
        ))
      ) : (
        <Text style={{ color: "#666" }}>No payments yet — accept an offer in the web app first.</Text>
      )}
      <Text style={{ color: "#888", fontSize: 12 }}>
        Payments are simulated in the demo — no real money moves. For Razorpay test checkout, use the web app (Trade → Payment → Pay via Razorpay TEST).
      </Text>
    </ScrollView>
  );
}
