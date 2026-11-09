import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Button, FlatList, ScrollView, Share, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Endpoints } from "../services/api";

const HISTORY_KEY = "kisan360-mobile-chat";
const QUEUE_KEY = "kisan360-mobile-chat-queue";

interface Msg { id: string; role: "user" | "assistant"; text: string }

export default function ChatScreen() {
  const [msg, setMsg] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [reply, setReply] = useState<any>(null);
  const [queued, setQueued] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const qraw = await AsyncStorage.getItem(QUEUE_KEY);
        if (qraw) setQueued(JSON.parse(qraw));
      } catch {}
    })();
  }, []);

  const enqueue = async (text: string) => {
    const next = [...queued, text].slice(-5);
    setQueued(next);
    try { await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(next)); } catch {}
  };

  const dequeue = async () => {
    const next = queued.slice(1);
    setQueued(next);
    try { await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(next)); } catch {}
    return queued[0];
  };

  const retryQueued = async () => {
    if (!queued.length) return;
    const nextQueued = queued[0];
    await dequeue();
    // Reuse send path: put text in box and send
    setMsg(nextQueued);
    // Avoid setState timing issues: call API directly via the same logic as send()
    const userMsg: Msg = { id: `${Date.now()}`, role: "user", text: nextQueued };
    await persist([...messages, userMsg]);
    setLoading(true);
    setError("");
    try {
      const res = await Endpoints.chat(nextQueued, {}, "en", "action");
      setReply(res.data);
      await persist([...messages, userMsg, { id: `${Date.now()}-a`, role: "assistant", text: res.data?.text || "…" }]);
    } catch (e: any) {
      // Still offline — re-enqueue at front
      await enqueue(nextQueued);
      setError("Still offline — kept in queue");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(HISTORY_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setMessages(parsed.slice(-10));
        }
      } catch {}
      // Server history (cross-device) when online — local stays as offline cache
      try {
        const res = await Endpoints.chatHistory();
        const rows = (res.data as any)?.history || [];
        if (Array.isArray(rows) && rows.length) {
          const serverMsgs: Msg[] = rows.slice(-10).map((r: any, i: number) => ({
            id: `srv-${r.createdAt || i}`,
            role: r.role === "user" ? "user" : "assistant",
            text: String(r.text || "").slice(0, 5000),
          }));
          setMessages(serverMsgs);
          try { await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(serverMsgs)); } catch {}
        }
      } catch { /* offline — keep localStorage */ }
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
      const offline = !e?.response; // network error vs server error
      if (offline) {
        await enqueue(userMsg.text);
        await persist([...next, { id: `${Date.now()}-a`, role: "assistant", text: "Queued — will retry when online." }]);
        setError("");
      } else {
        setError(e?.response?.data?.error || e.message || "Chat failed");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 20, fontWeight: "700" }}>Ask Kisan360 {queued.length ? `(${queued.length} queued)` : ""}</Text>
      <TextInput value={msg} onChangeText={setMsg} placeholder="e.g. Compare mandis for onion in Nashik" style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12 }} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button title={loading ? "Asking..." : "Send"} onPress={send} />
        </View>
        <View>
          <Button title="Clear" onPress={async () => { await AsyncStorage.removeItem(HISTORY_KEY); try { await Endpoints.clearChatHistory(); } catch {} setMessages([]); setReply(null); }} />
        </View>
        {queued.length ? (
          <View style={{ flex: 1 }}>
            <Button title={`Retry (${queued.length})`} onPress={retryQueued} />
          </View>
        ) : null}
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
          <Button
            title="Share best mandi (WhatsApp)"
            onPress={() => {
              const best = reply.toolResults.netRealization.topMandis[0];
              const text = `Kisan360: ${reply.toolResults.netRealization.crop} in ${reply.toolResults.netRealization.district} — best net ${best.market} at Rs ${best.farmerNetPerQuintal}/q. Compare your mandis by net, not headline.`;
              Share.share({ message: text }).catch(() => {});
            }}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}
