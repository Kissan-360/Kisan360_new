import React, { useState } from "react";
import { ActivityIndicator, Button, ScrollView, Text, TextInput, View } from "react-native";
import { Endpoints } from "../services/api";

export default function ChatScreen() {
  const [msg, setMsg] = useState("");
  const [reply, setReply] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const send = async () => {
    if (!msg.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await Endpoints.chat(msg, {}, "en", "action");
      setReply(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message || "Chat failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 20, fontWeight: "700" }}>Ask Kisan360</Text>
      <TextInput value={msg} onChangeText={setMsg} placeholder="e.g. Compare mandis for onion in Nashik" style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12 }} />
      <Button title={loading ? "Asking..." : "Send"} onPress={send} />
      {loading ? <ActivityIndicator /> : null}
      {!!error ? <Text style={{ color: "red" }}>{error}</Text> : null}
      {reply?.text ? <Text>{reply.text}</Text> : null}
      {reply?.toolResults?.netRealization?.topMandis?.length ? (
        <View>
          {reply.toolResults.netRealization.topMandis.map((m: any, i: number) => (
            <Text key={i}>
              {i + 1}. {m.market} — Rs {m.farmerNetPerQuintal}/q net
            </Text>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}
