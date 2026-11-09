import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Button, FlatList, ScrollView, Share, Text, TextInput, View } from "react-native";
import { Audio } from "expo-av";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Speech from "expo-speech";
import { Endpoints } from "../services/api";

async function copyText(text: string) {
  try { await Share.share({ message: text }); } catch {}
}

const HISTORY_KEY = "kisan360-mobile-chat";
const QUEUE_KEY = "kisan360-mobile-chat-queue";

interface Msg { id: string; role: "user" | "assistant"; text: string }

const I18N: Record<string, { placeholder: string; send: string; title: string }> = {
  en: { placeholder: "Compare mandis for onion in Nashik", send: "Send", title: "Ask Kisan360" },
  mr: { placeholder: "नाशिकमध्ये कांद्यासाठी बाजार तुलना करा", send: "पाठवा", title: "Kisan360 ला विचारा" },
  hi: { placeholder: "नाशिक में प्याज के लिए मंडी तुलना करें", send: "भेजें", title: "Kisan360 से पूछें" },
};

export default function ChatScreen() {
  const [msg, setMsg] = useState("");
  const [lang, setLang] = useState<"en" | "mr" | "hi">("en");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [reply, setReply] = useState<any>(null);
  const [queued, setQueued] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const recRef = React.useRef<Audio.Recording | null>(null);

  const toggleVoice = async () => {
    if (recording) {
      setRecording(false);
      try {
        await recRef.current?.stopAndUnloadAsync();
        const uri = recRef.current?.getURI?.();
        if (!uri) return;
        // Transcribe the recording via backend Whisper (Groq)
        const form = new FormData();
        form.append('audio', {
          uri,
          name: 'voice.m4a',
          type: 'audio/m4a',
        } as any);
        form.append('language', lang);
        setLoading(true);
        const res = await Endpoints.transcribe(form);
        const text = (res.data as any)?.text;
        if (text) {
          setMsg(text);
          // Auto-send so the farmer hears and sees the answer in one tap
          const userMsg: Msg = { id: `${Date.now()}`, role: 'user', text };
          const next = [...messages, userMsg];
          await persist(next);
          setMsg('');
          try {
            const chatRes = await Endpoints.chat(text, {}, lang, 'action');
            setReply(chatRes.data);
            await persist([...next, { id: `${Date.now()}-a`, role: 'assistant', text: chatRes.data?.text || '…' }]);
          } catch (e: any) {
            setError(e?.response?.data?.error || e.message || 'Chat failed');
          }
        } else {
          setError((res.data as any)?.error || 'Transcription empty');
        }
      } catch (e: any) {
        setError(e?.response?.data?.error || e.message || 'Voice failed');
      } finally {
        setLoading(false);
      }
      return;
    }
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) return setError("Microphone permission denied");
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      recRef.current = rec;
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.DEFAULT_RECORDING);
      await rec.startAsync();
      setRecording(true);
    } catch (e: any) {
      setError(e?.message || "Voice failed");
    }
  };
  const [summarizing, setSummarizing] = useState(false);

  const summarize = async () => {
    setSummarizing(true);
    try {
      const res = await Endpoints.chatSummarize();
      const summary = (res.data as any)?.summary;
      if (summary) {
        const next = [...messages, { id: `${Date.now()}-s`, role: "assistant" as const, text: `📌 ${summary}` }];
        await persist(next);
      } else {
        setError((res.data as any)?.error || "Not enough history to summarize");
      }
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message || "Summarize failed");
    } finally {
      setSummarizing(false);
    }
  };

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
      const res = await Endpoints.chat(nextQueued, {}, lang, "action");
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
      const res = await Endpoints.chat(userMsg.text, {}, lang, "action");
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

  const labels = I18N[lang] || I18N.en;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontSize: 20, fontWeight: "700" }}>{labels.title} {queued.length ? `(${queued.length} queued)` : ""}</Text>
        <Button title={lang.toUpperCase()} onPress={() => setLang((l) => (l === "en" ? "mr" : l === "mr" ? "hi" : "en"))} />
      </View>
      <TextInput value={msg} onChangeText={setMsg} placeholder={labels.placeholder} style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12 }} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button title={loading ? "Asking..." : labels.send} onPress={send} />
        </View>
        <View>
          <Button title={recording ? "⏹ Stop" : "🎤 Voice"} onPress={toggleVoice} />
        </View>
        <View>
          <Button title="Clear" onPress={async () => { await AsyncStorage.removeItem(HISTORY_KEY); try { await Endpoints.clearChatHistory(); } catch {} setMessages([]); setReply(null); }} />
        </View>
        <View>
          <Button title={summarizing ? "…" : "✨ Summary"} onPress={summarize} />
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
          <View style={{ paddingVertical: 4, flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ flex: 1, color: item.role === "user" ? "#006b2c" : "#333" }}>
              {item.role === "user" ? "You: " : "Kisan: "}{item.text}
            </Text>
            {item.role === "assistant" ? (
              <View style={{ flexDirection: "row", gap: 4 }}>
                <Button title="Copy" onPress={() => copyText(item.text)} />
                <Button title="🔊" onPress={() => Speech.speak(item.text, { language: "mr-IN" })} />
              </View>
            ) : null}
          </View>
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
