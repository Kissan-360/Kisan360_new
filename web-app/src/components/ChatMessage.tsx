import React from 'react';
import { Leaf } from 'lucide-react';

export type ChatMessageRole = 'user' | 'assistant' | 'system';

export interface ToolNetRealization {
  tool?: string;
  crop?: string;
  district?: string;
  quantityQuintals?: number;
  topMandis?: Array<{
    market: string;
    farmerNetPerQuintal: number;
    farmerNetTotal: number;
    distanceKm?: number;
    modalPrice?: number;
  }>;
  provenance?: { source?: string; retrievedAt?: string | null; freshness?: string; marketSource?: string };
}

export interface ToolSchemes { tool?: string; count?: number; schemes?: Array<{ slug: string; shortName: string; name: string; benefitLabel?: string }> }

export interface ToolWeather { tool?: string; district?: string; current?: { temperature?: number; humidity?: number; condition?: string; description?: string }; source?: string; retrievedAt?: string }

export interface ToolDisease {
  detectedDisease: string;
  confidence: number;
  severity: string;
  treatment?: string;
  recommendations?: string[];
  mlLatency?: number;
  cropType?: string;
  top5Predictions?: Array<{ label?: string; class?: any; confidence: number } | { disease?: string; confidence: number }>;
}

export interface ToolFpo { tool?: string; crop?: string; district?: string; quantity?: number; note?: string }
export interface ToolFpoFull { tool?: string; crop?: string; district?: string; quantity?: number; pooledNetPerQuintal?: number; individualNetPerQuintal?: number; note?: string }

export interface ChatMessageItem {
  id: string;
  role: ChatMessageRole;
  text: string;
  intent?: string;
  intents?: string[];
  toolResults?: { netRealization?: ToolNetRealization; schemes?: ToolSchemes; weather?: ToolWeather; fpo?: ToolFpoFull };
  disease?: ToolDisease | string;
}

interface ChatMessageProps {
  message: ChatMessageItem;
  suggestions?: string[];
  onSuggestion?: (suggestion: string) => void;
}

const ChatMessage = ({ message, suggestions = [], onSuggestion }: ChatMessageProps) => {
  if (message.role === 'system') {
    return (
      <div className="px-6 text-center text-xs italic leading-relaxed text-stone-400">
        {message.text}
      </div>
    );
  }

  const isUser = message.role === 'user';

  return (
    <div className={`flex w-full gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
          <Leaf className="h-4 w-4" aria-hidden="true" />
        </div>
      )}
      <div className={`max-w-[78%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={[
            'whitespace-pre-wrap break-words px-4 py-3 text-sm leading-relaxed shadow-sm',
            isUser
              ? 'rounded-2xl rounded-tr-sm bg-emerald-600 text-white'
              : 'rounded-2xl rounded-tl-sm border border-stone-100 bg-white text-stone-700',
          ].join(' ')}
        >
          {message.text}
        </div>
        {!isUser && message.toolResults?.netRealization?.topMandis?.length ? (
          <div className="mt-2 w-full max-w-sm rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-xs leading-relaxed text-stone-700">
            <div className="font-semibold text-emerald-900">
              Top mandis by net ({message.toolResults.netRealization.crop} · {message.toolResults.netRealization.district} · {message.toolResults.netRealization.quantityQuintals}q)
            </div>
            <ul className="mt-1 space-y-1">
              {message.toolResults.netRealization.topMandis.map((m, i) => (
                <li key={`${m.market}-${i}`} className="flex justify-between gap-2">
                  <span className="truncate">{i + 1}. {m.market}</span>
                  <span className="font-semibold text-emerald-800">Rs {m.farmerNetPerQuintal}/q net</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-1 text-[10px] leading-tight text-stone-500">
              <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-stone-200">source: {message.toolResults.netRealization.provenance?.source || 'agmarknet'}</span>
              <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-stone-200">{message.toolResults.netRealization.provenance?.freshness === 'live' ? 'live' : 'cached'}</span>
              {message.toolResults.netRealization.provenance?.retrievedAt ? <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-stone-200">{String(message.toolResults.netRealization.provenance.retrievedAt).slice(0, 10)}</span> : null}
            </div>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`Kisan360: ${message.toolResults.netRealization.crop} in ${message.toolResults.netRealization.district} (${message.toolResults.netRealization.quantityQuintals}q) — best net ${message.toolResults.netRealization.best?.market} at Rs ${message.toolResults.netRealization.best?.farmerNetPerQuintal}/q. Compare your mandis by net, not headline.`)}`}
              target="_blank" rel="noopener noreferrer"
              className="mt-2 inline-block rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white"
            >
              Share on WhatsApp →
            </a>
          </div>
        ) : null}
        {!isUser && typeof message.disease === "object" && message.disease ? (
          <div className="mt-2 w-full max-w-sm rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs leading-relaxed text-stone-700">
            <div className="font-semibold text-stone-900">{(message.disease as ToolDisease).detectedDisease}</div>
            <div className="mt-0.5">Severity: {(message.disease as ToolDisease).severity} · Confidence: {(((message.disease as ToolDisease).confidence || 0) * 100).toFixed(0)}%{typeof (message.disease as ToolDisease).mlLatency === "number" ? ` · ${(message.disease as ToolDisease).mlLatency}s` : ""}</div>
            {(message.disease as ToolDisease).treatment ? <div className="mt-1">Treatment: {(message.disease as ToolDisease).treatment}</div> : null}
            {(message.disease as ToolDisease).recommendations?.length ? (
              <ul className="mt-1 space-y-0.5">{(message.disease as ToolDisease).recommendations!.map((r, i) => <li key={i}>• {r}</li>)}</ul>
            ) : null}
            {(message.disease as ToolDisease).top5Predictions?.length ? (
              <ul className="mt-1 space-y-0.5 text-[11px] text-stone-500">
                {(message.disease as ToolDisease).top5Predictions!.slice(0, 3).map((p: any, i: number) => (
                  <li key={i}>#{i + 1} {p.label || p.disease || p.class} — {((p.confidence || 0) * 100).toFixed(0)}%</li>
                ))}
              </ul>
            ) : null}
            <div className="mt-1 text-[10px] text-stone-500">MobileNetV2 via FastAPI · OOD-gated</div>
          </div>
        ) : null}
        {!isUser && message.toolResults?.fpo ? (
          <div className="mt-2 w-full max-w-sm rounded-xl border border-emerald-100 bg-white p-3 text-xs leading-relaxed text-stone-700">
            <div className="font-semibold text-emerald-900">FPO pooling — {message.toolResults.fpo.crop} · {message.toolResults.fpo.district} · {message.toolResults.fpo.quantity}q</div>
            <div className="mt-0.5">{message.toolResults.fpo.note || "Pooled vs individual comparison"}</div>
            {message.toolResults.fpo.pooledNetPerQuintal != null ? (
              <div className="mt-1 font-semibold text-emerald-800">Pooled net: Rs {message.toolResults.fpo.pooledNetPerQuintal}/q</div>
            ) : null}
          </div>
        ) : null}
        {!isUser && message.toolResults?.weather?.current ? (
          <div className="mt-2 w-full max-w-sm rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs leading-relaxed text-stone-700">
            <div className="font-semibold text-blue-900">
              {message.toolResults.weather.district || "Weather"} — {message.toolResults.weather.current.temperature}°C · {message.toolResults.weather.current.humidity}% · {message.toolResults.weather.current.condition}
            </div>
            <div className="mt-1 flex flex-wrap gap-1 text-[10px] leading-tight text-stone-500">
              <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-stone-200">source: {message.toolResults.weather.source || "context"}</span>
              {message.toolResults.weather.retrievedAt ? <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-stone-200">{String(message.toolResults.weather.retrievedAt).slice(0, 10)}</span> : null}
            </div>
          </div>
        ) : null}
        {!isUser && message.toolResults?.schemes?.schemes?.length ? (
          <div className="mt-2 w-full max-w-sm rounded-xl border border-stone-100 bg-stone-50 p-3 text-xs leading-relaxed text-stone-700">
            <div className="font-semibold text-stone-900">Matching schemes</div>
            <ul className="mt-1 space-y-1">
              {message.toolResults.schemes.schemes.map((s) => (
                <li key={s.slug}>• {s.shortName} — {s.benefitLabel || s.name}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {!isUser && suggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onSuggestion?.(suggestion)}
                className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-left text-xs font-medium text-emerald-800 transition hover:border-emerald-200 hover:bg-emerald-100"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;
