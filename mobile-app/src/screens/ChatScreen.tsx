import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Button, FlatList, ScrollView, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Endpoints } from "../services/api";

const HISTORY_KEY = "kisan360-mobile-chat";

interface Msg { id: string; role: "user" | "assistant"; text: string }

export default function ChatScreen() {
  const [msg, setMsg] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [reply, setReply] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(HISTORY_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setMessages(parsed.slice(-10));
        }
      } catch {}
    })();
  }, []);

  const persist = useCallback(async (next: Msg[]) => {
    setMessages(next.slice(-10));
    try { await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next.slice(-10))); } catch {}
  }, []);

  const send = async () => {
    if (!msg.trim()) return;
    const userMsg: Msg = { id: `${Date.now()}`, role: "user", text: msg };
    const next = [...messages, userMsg];
    await persist(next);
    setMsg("");
    setLoading(true);
    setError("");
    try {
      const res = await Endpoints.chat(userMsg.text, {}, "en", "action");
      setReply(res.data);
      await persist([...next, { id: `${Date.now()}-a`, role: "assistant", text: res.data?.text || "…" }]);
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
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button title={loading ? "Asking..." : "Send"} onPress={send} />
        </View>
        <View>
          <Button title="Clear" onPress={async () => { await AsyncStorage.removeItem(HISTORY_KEY); setMessages([]); setReply(null); }} />
        </View>
      </View>
      {loading ? <ActivityIndicator /> : null}
      {!!error ? <Text style={{ color: "red" }}>{error}</Text> : null}
      <FlatList
        data={messages}
        keyExtractor={(m) => m.id}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <Text style={{ paddingVertical: 4, color: item.role === "user" ? "#006b2c" : "#333" }}>
            {item.role === "user" ? "You: " : "Kisan: "}{item.text}
          </Text>
        )}
      />
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
