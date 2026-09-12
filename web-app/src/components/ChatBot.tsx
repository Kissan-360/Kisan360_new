import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Brain, Languages, MessageCircle, Minus, Zap, X } from 'lucide-react';
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
}

const OPEN_KEY = 'kisan360-chat-open';
const MODE_KEY = 'kisan360-chat-mode';
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
  const [messages, setMessages] = useState<ChatMessageItem[]>(() => [
    { id: makeId(), role: 'assistant', text: t('chat.welcome') },
    { id: `${makeId()}-system`, role: 'system', text: t('chat.systemHint') },
  ]);
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
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading, open]);

  useEffect(() => {
    setSuggestions(modeSuggestions);
  }, [modeSuggestions]);

  const languageLabel = useMemo(() => language.toUpperCase(), [language]);
  const cycleLanguage = () => {
    const next: Record<Lang, Lang> = { en: 'mr', mr: 'hi', hi: 'en' };
    setLanguage(next[language]);
  };

  const appendMessage = (message: ChatMessageItem) => {
    setMessages((current) => [...current, message].slice(-HISTORY_LIMIT));
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
      appendMessage({ id: makeId(), role: 'assistant', text: data.text || t('chat.error') });
      if (data.suggestions?.length) setSuggestions(data.suggestions);
      if (!open) setHasNewResponse(true);
      if (mode === 'action' && data.action?.type === 'navigate' && data.action.path) {
        setTimeout(() => navigate(data.action!.path), 450);
      }
    } catch {
      appendMessage({ id: makeId(), role: 'assistant', text: t('chat.error') });
      if (!open) setHasNewResponse(true);
    } finally {
      setLoading(false);
    }
  };

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
          <div className="truncate text-sm font-semibold">{t('chat.title')}</div>
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
    </section>
  );
};

export default ChatBot;
