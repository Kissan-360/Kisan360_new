import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Brain, Languages, MessageCircle, Minus, Trash2, Zap, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ChatInput from './ChatInput';
import ChatMessage, { ChatMessageItem } from './ChatMessage';
import { API_URL, apiFetch } from '../lib/api';
import { loadDecisionContext, DEFAULT_CONTEXT } from '../lib/decisionContext';
import { Lang, useTranslation } from '../i18n';

interface ChatResponse {
  text?: string;
  action?: { type: 'navigate'; path: string };
  suggestions?: string[];
  intent?: string;
  intents?: string[];
  toolResults?: ChatMessageItem['toolResults'];
  disease?: any;
}

const OPEN_KEY = 'kisan360-chat-open';
const MODE_KEY = 'kisan360-chat-mode';
const HISTORY_KEY = 'kisan360-chat-history';
const QUEUE_KEY = 'kisan360-chat-queue';
const HISTORY_LIMIT = 10;
type ChatMode = 'ask' | 'action';

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const ChatBot = () => {
  const navigate = useNavigate();
  const { t, language, setLanguage } = useTranslation();
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(OPEN_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [mode, setMode] = useState<ChatMode>(() => {
    try {
      return localStorage.getItem(MODE_KEY) === 'action' ? 'action' : 'ask';
    } catch {
      return 'ask';
    }
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasNewResponse, setHasNewResponse] = useState(false);
  const modeSuggestions = useMemo(() => {
    const prefix = mode === 'ask' ? 'chat.suggestions.ask' : 'chat.suggestions.action';
    return [t(`${prefix}.one`), t(`${prefix}.two`), t(`${prefix}.three`), t(`${prefix}.four`)];
  }, [mode, t]);
  const [suggestions, setSuggestions] = useState<string[]>(modeSuggestions);
  const [messages, setMessages] = useState<ChatMessageItem[]>(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed.slice(-HISTORY_LIMIT);
      }
    } catch { /* ignore */ }
    return [
      { id: makeId(), role: 'assistant', text: t('chat.welcome') },
      { id: `${makeId()}-system`, role: 'system', text: t('chat.systemHint') },
    ];
  });
  const [photo, setPhoto] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_KEY, String(open));
    } catch {
      // ignore storage errors
    }
    if (open) setHasNewResponse(false);
  }, [open]);

  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      // ignore storage errors
    }
  }, [mode]);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-HISTORY_LIMIT)));
    } catch { /* ignore */ }
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading, open]);

  useEffect(() => {
    setSuggestions(modeSuggestions);
  }, [modeSuggestions]);

  // Server history (cross-device) when online; localStorage remains the offline cache.
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch(`${API_URL}/chat/history`);
        if (!res.ok) return;
        const data = await res.json();
        const rows = data?.history || [];
        if (Array.isArray(rows) && rows.length) {
          setMessages(
            rows
              .slice(-HISTORY_LIMIT)
              .map((r: any, i: number) => ({
                id: `srv-${r.createdAt}-${i}`,
                role: r.role === 'user' ? 'user' : 'assistant',
                text: String(r.text || '').slice(0, 5000),
              })) as ChatMessageItem[],
          );
        }
      } catch { /* offline — keep localStorage */ }
    })();
  }, []);

  const languageLabel = useMemo(() => language.toUpperCase(), [language]);
  const cycleLanguage = () => {
    const next: Record<Lang, Lang> = { en: 'mr', mr: 'hi', hi: 'en' };
    setLanguage(next[language]);
  };

  const appendMessage = (message: ChatMessageItem) => {
    setMessages((current) => [...current, message].slice(-HISTORY_LIMIT));
  };

  const [queued, setQueued] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });

  const enqueue = (text: string) => {
    setQueued((q) => {
      const next = [...q, text].slice(-5);
      try { localStorage.setItem(QUEUE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const dequeue = () => {
    setQueued((q) => {
      const next = q.slice(1);
      try { localStorage.setItem(QUEUE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setInput('');
    appendMessage({ id: makeId(), role: 'user', text: trimmed });
    setLoading(true);

    try {
      const context = loadDecisionContext() || DEFAULT_CONTEXT;
      const response = await apiFetch(`${API_URL}/chat`, {
        method: 'POST',
        body: JSON.stringify({ message: trimmed, language, mode, context }),
      });

      if (!response.ok) throw new Error(`Chat failed: ${response.status}`);
      const data = (await response.json()) as ChatResponse;
      appendMessage({
        id: makeId(), role: 'assistant', text: data.text || t('chat.error'),
        intent: data.intent, intents: data.intents, toolResults: data.toolResults,
        disease: data.disease,
      });
      if (data.suggestions?.length) setSuggestions(data.suggestions);
      if (!open) setHasNewResponse(true);
      if (mode === 'action' && data.action?.type === 'navigate' && data.action.path) {
        setTimeout(() => navigate(data.action!.path), 450);
      }
    } catch (err: any) {
      // 401 (logged out) → one silent demo-login retry, then queue if still offline.
      if (err?.status === 401 || err?.message?.includes('401')) {
        try {
          const loginRes = await apiFetch(`${API_URL}/auth/demo-login`, {
            method: 'POST',
            body: JSON.stringify({ role: 'farmer', district: 'Nashik' }),
          });
          if (loginRes.ok) {
            const loginData = await loginRes.json();
            if (loginData.token && loginData.user) {
              const { setDemoAuth } = await import('../lib/api');
              setDemoAuth(loginData.token, loginData.user);
            }
            // Retry once
            const retry = await apiFetch(`${API_URL}/chat`, {
              method: 'POST',
              body: JSON.stringify({ message: trimmed, language, mode, context: loadDecisionContext() || DEFAULT_CONTEXT }),
            });
            if (retry.ok) {
              const retryData = await retry.json();
              appendMessage({
                id: makeId(), role: 'assistant', text: retryData.text || t('chat.error'),
                intent: retryData.intent, intents: retryData.intents, toolResults: retryData.toolResults,
                disease: retryData.disease,
              });
              setLoading(false);
              return;
            }
          }
        } catch { /* fall through to queue */ }
      }
      // Offline-tolerant: queue for retry when the browser goes back online.
      enqueue(trimmed);
      appendMessage({ id: makeId(), role: 'assistant', text: `${t('chat.error')} (queued — will retry when online)` });
      if (!open) setHasNewResponse(true);
    } finally {
      setLoading(false);
    }
  };

  // Retry queued messages when connectivity returns.
  useEffect(() => {
    const onOnline = () => {
      if (queued.length) {
        const next = queued[0];
        dequeue();
        sendMessage(next);
      }
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [queued, mode, language]);

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhoto(f);
    appendMessage({ id: makeId(), role: 'user', text: `📷 ${f.name}` });
    setTimeout(() => fileRef.current && (fileRef.current.value = ''), 50);
  };

  useEffect(() => {
    if (!photo) return;
    (async () => {
      setLoading(true);
      try {
        const form = new FormData();
        form.append('image', photo);
        const context = loadDecisionContext() || DEFAULT_CONTEXT;
        if (context?.crop) form.append('cropType', String(context.crop));
        const resp = await apiFetch(`${API_URL}/disease/detect`, { method: 'POST', body: form });
        const data = await resp.json();
        if (!resp.ok) {
          appendMessage({ id: makeId(), role: 'assistant', text: data.message || data.error || t('chat.error') });
          return;
        }
        appendMessage({
          id: makeId(), role: 'assistant',
          text: `${data.detectedDisease} — ${data.severity} · ${(data.confidence * 100).toFixed(0)}%`,
          disease: {
            detectedDisease: data.detectedDisease, confidence: data.confidence,
            severity: data.severity, treatment: data.treatment,
            recommendations: data.recommendations, mlLatency: data.mlLatency, cropType: data.cropType,
            top5Predictions: data.top5Predictions,
          },
        });
      } catch {
        appendMessage({ id: makeId(), role: 'assistant', text: t('chat.error') });
      } finally {
        setLoading(false);
        setPhoto(null);
      }
    })();
  }, [photo]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('chat.open')}
        title={t('chat.open')}
        className={`fixed bottom-20 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-2xl shadow-emerald-900/25 transition hover:bg-emerald-700 ${
          hasNewResponse ? 'animate-pulse ring-4 ring-emerald-200' : ''
        }`}
      >
        <MessageCircle className="h-7 w-7" aria-hidden="true" />
      </button>
    );
  }

  return (
    <section className="fixed bottom-16 right-4 z-50 flex h-[520px] w-[calc(100vw-2rem)] max-w-[380px] flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl shadow-stone-950/20 sm:bottom-16 sm:right-5">
      <header className="flex items-center justify-between border-b border-emerald-900/10 bg-emerald-700 px-4 py-3 text-white">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-semibold">{t('chat.title')}</div>
            {queued.length ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">{queued.length} queued</span> : null}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="inline-flex rounded-full bg-emerald-950/20 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setMode('ask')}
                className={`flex h-7 items-center gap-1 rounded-full px-2.5 font-medium transition ${
                  mode === 'ask' ? 'bg-white text-emerald-800 shadow-sm' : 'text-emerald-50 hover:bg-white/10'
                }`}
                aria-pressed={mode === 'ask'}
              >
                <Brain className="h-3.5 w-3.5" aria-hidden="true" />
                {t('chat.mode.ask')}
              </button>
              <button
                type="button"
                onClick={() => setMode('action')}
                className={`flex h-7 items-center gap-1 rounded-full px-2.5 font-medium transition ${
                  mode === 'action' ? 'bg-white text-emerald-800 shadow-sm' : 'text-emerald-50 hover:bg-white/10'
                }`}
                aria-pressed={mode === 'action'}
              >
                <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                {t('chat.mode.action')}
              </button>
            </div>
            <button
              type="button"
              onClick={cycleLanguage}
              className="flex h-8 items-center gap-1 rounded-full bg-white/10 px-2 text-xs font-semibold text-emerald-50 transition hover:bg-white/15"
              aria-label={t('chat.language')}
              title={t('chat.language')}
            >
              <Languages className="h-3.5 w-3.5" aria-hidden="true" />
              {languageLabel}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setMessages([
                { id: makeId(), role: 'assistant', text: t('chat.welcome') },
                { id: `${makeId()}-system`, role: 'system', text: t('chat.systemHint') },
              ]);
              try { localStorage.removeItem(HISTORY_KEY); } catch { /* ignore */ }
              apiFetch(`${API_URL}/chat/history`, { method: 'DELETE' }).catch(() => {});
              try { localStorage.removeItem(QUEUE_KEY); setQueued([]); } catch { /* ignore */ }
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full text-emerald-50 transition hover:bg-white/10"
            aria-label="Clear history"
            title="Clear history"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-emerald-50 transition hover:bg-white/10"
            aria-label={t('chat.minimize')}
            title={t('chat.minimize')}
          >
            <Minus className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-emerald-50 transition hover:bg-white/10"
            aria-label={t('chat.close')}
            title={t('chat.close')}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div ref={scrollerRef} className="k-scroll flex-1 space-y-4 overflow-y-auto bg-stone-50 p-4">
        {messages.map((message, index) => (
          <ChatMessage
            key={message.id}
            message={message}
            suggestions={index === 0 && message.role === 'assistant' ? suggestions : []}
            onSuggestion={sendMessage}
          />
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-xs font-medium text-stone-500">
            <span className="h-2 w-2 rounded-full bg-emerald-500 pulse-dot" />
            {t('chat.typing')}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-stone-100 bg-white px-3 py-2">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          className="flex h-9 items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-3 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
          title="Upload a leaf photo — disease check in chat"
        >
          📷 {loading ? '…' : 'Photo'}
        </button>
        <div className="flex-1">
          <ChatInput
            disabled={loading}
            language={language}
            placeholder={t('chat.placeholder')}
            value={input}
            voiceStartLabel={t('chat.voiceStart')}
            voiceStopLabel={t('chat.voiceStop')}
            voiceUnsupportedLabel={t('chat.voiceUnsupported')}
            voiceDeniedLabel={t('chat.voiceDenied')}
            voiceNoSpeechLabel={t('chat.voiceNoSpeech')}
            voiceNetworkErrorLabel={t('chat.voiceNetworkError')}
            voiceGenericErrorLabel={t('chat.voiceError')}
            sendLabel={t('common.send')}
            onChange={setInput}
            onSend={sendMessage}
          />
        </div>
      </div>
    </section>
  );
};

export default ChatBot;
