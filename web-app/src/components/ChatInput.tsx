import React, { FormEvent, useEffect, useRef, useState } from 'react';
import { Mic, Send, Square } from 'lucide-react';
import type { Lang } from '../i18n';

type SpeechRecognitionConstructor = new () => SpeechRecognition;

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionErrorEvent extends Event {
  error?: string;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

interface ChatInputProps {
  disabled?: boolean;
  language: Lang;
  placeholder: string;
  value: string;
  voiceStartLabel: string;
  voiceStopLabel: string;
  voiceUnsupportedLabel: string;
  voiceDeniedLabel: string;
  voiceNoSpeechLabel: string;
  voiceNetworkErrorLabel: string;
  voiceGenericErrorLabel: string;
  sendLabel: string;
  onChange: (value: string) => void;
  onSend: (value: string) => void;
}

const langMap: Record<Lang, string> = {
  en: 'en-US',
  mr: 'mr-IN',
  hi: 'hi-IN',
};

const ChatInput = ({
  disabled = false,
  language,
  placeholder,
  value,
  voiceStartLabel,
  voiceStopLabel,
  voiceUnsupportedLabel,
  voiceDeniedLabel,
  voiceNoSpeechLabel,
  voiceNetworkErrorLabel,
  voiceGenericErrorLabel,
  sendLabel,
  onChange,
  onSend,
}: ChatInputProps) => {
  const [recording, setRecording] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const onSendRef = useRef(onSend);
  const onChangeRef = useRef(onChange);

  // Keep refs fresh so recognition callbacks never use stale props
  useEffect(() => { onSendRef.current = onSend; }, [onSend]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  useEffect(() => {
    if (!voiceError) return undefined;
    const timer = window.setTimeout(() => setVoiceError(null), 4000);
    return () => window.clearTimeout(timer);
  }, [voiceError]);

  const showVoiceError = (message: string) => {
    setRecording(false);
    setVoiceError(message);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
  };

  const toggleVoice = () => {
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      showVoiceError(voiceUnsupportedLabel);
      return;
    }

    try {
      const recognition = new Recognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = langMap[language];
      recognition.onstart = () => {
        setVoiceError(null);
        setRecording(true);
      };
      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript;
        if (transcript) {
          // Use refs so we never call stale callbacks
          onChangeRef.current(transcript);
          setTimeout(() => onSendRef.current(transcript), 300);
        }
      };
      recognition.onerror = (event) => {
        const error = event.error || 'default';
        if (error === 'not-allowed' || error === 'service-not-allowed') showVoiceError(voiceDeniedLabel);
        else if (error === 'no-speech') showVoiceError(voiceNoSpeechLabel);
        else if (error === 'network') showVoiceError(voiceNetworkErrorLabel);
        else if (error !== 'aborted') showVoiceError(voiceGenericErrorLabel);
      };
      recognition.onend = () => setRecording(false);
      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      showVoiceError(voiceGenericErrorLabel);
    }
  };

  return (
    <div className="border-t border-stone-100 bg-white">
      {voiceError && (
        <div className="mx-3 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium leading-relaxed text-amber-800">
          {voiceError}
        </div>
      )}
      <form onSubmit={submit} className="flex items-center gap-2 p-3">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          aria-label={placeholder}
          className="min-h-11 flex-1 rounded-full border border-stone-200 bg-stone-50 px-4 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-70"
        />
        <button
          type="button"
          onClick={toggleVoice}
          disabled={disabled}
          title={recording ? voiceStopLabel : voiceStartLabel}
          aria-label={recording ? voiceStopLabel : voiceStartLabel}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-60 ${
            recording
              ? 'animate-pulse border-red-200 bg-red-50 text-red-600 shadow-[0_0_0_6px_rgba(220,38,38,0.08)]'
              : 'border-stone-200 bg-white text-stone-500 hover:border-emerald-200 hover:text-emerald-700'
          }`}
        >
          {recording ? <Square className="h-4 w-4 fill-current" aria-hidden="true" /> : <Mic className="h-5 w-5" aria-hidden="true" />}
        </button>
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          title={sendLabel}
          aria-label={sendLabel}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-900/15 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:shadow-none"
        >
          <Send className="h-5 w-5" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
};

export default ChatInput;
