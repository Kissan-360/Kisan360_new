import React, { useState } from "react";
import { ActivityIndicator, Button, ScrollView, Share, Text, TextInput, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { Endpoints } from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import { CROPS, DISTRICTS } from "../data/maharashtra";

export default function DecisionScreen({ navigation }: any) {
  const { token } = useAuth();
  const [impact, setImpact] = useState<any>(null);
  React.useEffect(() => {
    Endpoints.impact()
      .then((r) => setImpact(r.data))
      .catch(() => setImpact(null));
  }, []);
  const [crop, setCrop] = useState("Onion");
  const [district, setDistrict] = useState("Nashik");
  const [qty, setQty] = useState("10");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [msg, setMsg] = useState("");
  const run = async () => {
    setLoading(true);
    setError("");
    setMsg("");
    try {
      const res = await Endpoints.netRealization(crop, district, Number(qty));
      setResult(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message || "Failed");
    } finally {
      setLoading(false);
    }
  };

  const createLotFromBest = async () => {
    if (!result?.rankedMandis?.length) return;
    const best = result.rankedMandis[0];
    setLoading(true);
    setError("");
    try {
      const res = await Endpoints.createLot({
        crop, district, quantity: Number(qty), unit: "quintals",
        notes: `best=${best.market} net=${best.farmerNetPerQuintal} source=${result.marketSource}`,
      });
      setMsg(`Lot created (${res.data?.id || res.data?._id || "ok"}): ${crop} ${qty}q → ${best.market} at Rs ${best.farmerNetPerQuintal}/q net`);
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message || "Create failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 20, fontWeight: "700" }}>Decision — net realization</Text>
      {!token ? (
        <View>
          <Text style={{ color: "#b45309", fontSize: 13 }}>Price comparison works without sign-in. Chat / disease / lots need a demo token.</Text>
          <Button title="Sign in (demo)" onPress={() => navigation?.navigate?.("SignIn")} />
        </View>
      ) : null}
      <Text style={{ fontWeight: "600" }}>Crop</Text>
      <Picker selectedValue={crop} onValueChange={(v) => setCrop(v)} style={styles.input}>
        {CROPS.map((c) => (
          <Picker.Item key={c} label={c} value={c} />
        ))}
      </Picker>
      <Text style={{ fontWeight: "600" }}>District</Text>
      <Picker selectedValue={district} onValueChange={(v) => setDistrict(v)} style={styles.input}>
        {DISTRICTS.map((d) => (
          <Picker.Item key={d} label={d} value={d} />
        ))}
      </Picker>
      {impact?.milestones ? (
        <Text style={{ color: "#666", fontSize: 12 }}>
          Impact (30d): {Object.entries(impact.milestones).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(" · ")}
        </Text>
      ) : null}
      <TextInput value={qty} onChangeText={setQty} placeholder="Qty (q)" keyboardType="numeric" style={styles.input} />
      <Button title={loading ? "Ranking..." : "Compare mandis"} onPress={run} />
      {loading ? <ActivityIndicator /> : null}
      {!!error ? <Text style={{ color: "red" }}>{error}</Text> : null}
      {!!msg ? <Text style={{ color: "#006b2c" }}>{msg}</Text> : null}
      {result?.rankedMandis?.length ? (
        <View style={{ gap: 6 }}>
          {result.rankedMandis.slice(0, 5).map((m: any, i: number) => (
            <Text key={i}>
              {i + 1}. {m.market} — Rs {m.farmerNetPerQuintal}/q net
            </Text>
          ))}
          <Text style={{ color: "#666", fontSize: 12 }}>
            Source: {result.marketSource} · {result.servingMode}
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button title="Create lot from best mandi" onPress={createLotFromBest} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                title="Copy / Share"
                onPress={() => {
                  const lines = result.rankedMandis.slice(0, 5).map((m: any, i: number) => `${i + 1}. ${m.market} Rs ${m.farmerNetPerQuintal}/q net`);
                  Share.share({ message: `Kisan360 ${crop} ${district} ${qty}q:\n${lines.join("\n")}` }).catch(() => {});
                }}
              />
            </View>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = { input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12 } };
