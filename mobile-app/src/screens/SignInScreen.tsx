import React, { useState } from "react";
import { ActivityIndicator, Button, ScrollView, Text, TextInput, View } from "react-native";
import { useAuth } from "../contexts/AuthContext";

export default function SignInScreen({ navigation }: any) {
  const { user, token, isLoading, loginDemo, logout } = useAuth();
  const [role, setRole] = useState<"farmer" | "buyer" | "fpo">("farmer");
  const [district, setDistrict] = useState("Nashik");
  const [error, setError] = useState("");

  const signIn = async () => {
    setError("");
    try {
      await loginDemo(role, district || "Nashik");
      navigation?.goBack?.();
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message || "Sign-in failed");
    }
  };

  if (token) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={{ fontSize: 20, fontWeight: "700" }}>Signed in</Text>
        <Text>Role: {user?.role || role} · District: {user?.district || district}</Text>
        <Text style={{ color: "#666", fontSize: 12 }}>Token is wired to all API calls (Authorization: Bearer …).</Text>
        <Button title="Sign out" onPress={async () => { await logout(); }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 20, fontWeight: "700" }}>Sign in (demo)</Text>
      <Text style={{ color: "#555", fontSize: 13 }}>
        Backend `POST /api/auth/demo-login` issues a signed JWT. No password — role + district only.
      </Text>
      <Text style={{ fontWeight: "600" }}>Role</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["farmer", "buyer", "fpo"] as const).map((r) => (
          <View key={r} style={{ flex: 1, opacity: role === r ? 1 : 0.6 }}>
            <Button title={r} onPress={() => setRole(r)} />
          </View>
        ))}
      </View>
      <TextInput value={district} onChangeText={setDistrict} placeholder="District" style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12 }} />
      <Button title={isLoading ? "Signing in..." : "Sign in"} onPress={signIn} />
      {isLoading ? <ActivityIndicator /> : null}
      {!!error ? <Text style={{ color: "red" }}>{error}</Text> : null}
    </ScrollView>
  );
}
