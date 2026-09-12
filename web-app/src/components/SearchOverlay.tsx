import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, X, TrendingUp, Landmark, MessageSquare, Clock, CornerDownLeft,
  type LucideIcon,
} from 'lucide-react';
import { API_URL, apiFetch } from '../lib/api';
import { useTranslation } from '../i18n';

/* Global search overlay — Spotlight-style command palette.
   Queries three real backend endpoints in parallel (markets, schemes,
   community topics), groups results, and navigates on selection.
   Keyboard: Cmd/Ctrl+K opens (registered in Topbar), arrows move,
   Enter opens, Escape closes. */

const RECENTS_KEY = 'kisan360-recent-searches';
const MAX_RECENTS = 5;
const MIN_QUERY = 2;

interface MarketHit {
  crop: string;
  market: string;
  district?: string;
  variety?: string;
  modalPrice?: number;
}
interface SchemeHit {
  slug: string;
  shortName: string;
  name: string;
  category: string;
}
interface CommunityHit {
  id: string;
  title: string;
  category: string;
  commentCount?: number;
}

interface Hit {
  key: string;
  group: 'market' | 'scheme' | 'community';
  icon: LucideIcon;
  title: string;
  sub: string;
  to: string;
}

const GROUP_ORDER: Hit['group'][] = ['market', 'scheme', 'community'];

function readRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string').slice(0, MAX_RECENTS) : [];
  } catch { return []; }
}

function pushRecent(q: string): string[] {
  const next = [q, ...readRecents().filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, MAX_RECENTS);
  try { localStorage.setItem(RECENTS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}

const SearchOverlay = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const [searched, setSearched] = useState('');
  const [active, setActive] = useState(0);
  const [recents, setRecents] = useState<string[]>(readRecents);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Reset + focus on open; abort in-flight searches on close.
  useEffect(() => {
    if (open) {
      setRecents(readRecents());
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    } else if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, [open]);

  // Escape closes — input-level handler covers most cases, window-level
  // covers the case where focus sits on the backdrop/list.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Debounced parallel search across the three sources.
  useEffect(() => {
    const query = q.trim();
    if (!open || query.length < MIN_QUERY) {
      setHits([]);
      setSearched('');
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(async () => {
      const [marketsRes, schemesRes, communityRes] = await Promise.allSettled([
        apiFetch(`${API_URL}/market/prices?search=${encodeURIComponent(query)}&limit=12`, { signal: controller.signal }),
        apiFetch(`${API_URL}/schemes?q=${encodeURIComponent(query)}&limit=6`, { signal: controller.signal }),
        apiFetch(`${API_URL}/community/topics?q=${encodeURIComponent(query)}&limit=6`, { signal: controller.signal }),
      ]);
      if (controller.signal.aborted) return;

      const found: Hit[] = [];
      if (marketsRes.status === 'fulfilled' && marketsRes.value.ok) {
        try {
          const j = await marketsRes.value.json();
          (j.prices || []).slice(0, 4).forEach((p: MarketHit, i: number) => {
            found.push({
              key: `m-${i}`,
              group: 'market',
              icon: TrendingUp,
              title: `${p.market} · ${p.crop}`,
              sub: p.modalPrice != null ? `₹${p.modalPrice.toLocaleString('en-IN')}/q${p.district ? ` · ${p.district}` : ''}` : p.district || '',
              to: '/market',
            });
          });
        } catch { /* source unavailable — skip */ }
      }
      if (schemesRes.status === 'fulfilled' && schemesRes.value.ok) {
        try {
          const j = await schemesRes.value.json();
          (j.schemes || []).slice(0, 4).forEach((s: SchemeHit) => {
            found.push({
              key: `s-${s.slug}`,
              group: 'scheme',
              icon: Landmark,
              title: s.shortName || s.name,
              sub: s.name,
              to: `/schemes?slug=${encodeURIComponent(s.slug)}`,
            });
          });
        } catch { /* source unavailable — skip */ }
      }
      if (communityRes.status === 'fulfilled' && communityRes.value.ok) {
        try {
          const j = await communityRes.value.json();
          (j.topics || []).slice(0, 4).forEach((c: CommunityHit) => {
            found.push({
              key: `c-${c.id}`,
              group: 'community',
              icon: MessageSquare,
              title: c.title,
              sub: `${c.commentCount || 0} ${t('community.statReplies').toLowerCase()}`,
              to: '/community',
            });
          });
        } catch { /* source unavailable — skip */ }
      }

      if (!controller.signal.aborted) {
        setHits(found);
        setSearched(query);
        setActive(0);
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [q, open, t]);

  const openHit = (hit: Hit) => {
    pushRecent(q.trim());
    onClose();
    navigate(hit.to);
  };

  const groupLabel = (g: Hit['group']) =>
    g === 'market' ? t('nav.market') : g === 'scheme' ? t('nav.schemes') : t('nav.community');

  const grouped = GROUP_ORDER
    .map((g) => ({ g, items: hits.filter((h) => h.group === g) }))
    .filter(({ items }) => items.length > 0);

  let flatIndex = -1;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (hits[active]) openHit(hits[active]);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={t('topbar.searchPlaceholder')}>
      <div className="absolute inset-0 bg-stone-950/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative mx-auto mt-[8vh] w-[min(640px,calc(100vw-2rem))] rounded-2xl bg-white shadow-2xl border border-stone-200 overflow-hidden">
        {/* Input row */}
        <div className="flex items-center gap-3 border-b border-stone-100 px-4 py-3.5">
          <Search size={18} className="text-stone-400 shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('topbar.searchPlaceholder')}
            className="flex-1 bg-transparent text-[15px] text-stone-900 placeholder:text-stone-400 outline-none"
            aria-label={t('topbar.searchPlaceholder')}
          />
          <button
            onClick={onClose}
            className="shrink-0 rounded-md border border-stone-200 px-1.5 py-0.5 text-[10px] font-bold text-stone-400 hover:bg-stone-50"
            aria-label="Close search"
          >
            ESC
          </button>
        </div>

        {/* Results body */}
        <div className="max-h-[55vh] overflow-y-auto k-scroll">
          {/* Recent searches when the query is empty */}
          {q.trim().length < MIN_QUERY && recents.length > 0 && (
            <div className="p-2">
              <p className="px-2 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-400 flex items-center gap-1.5">
                <Clock size={11} /> {t('search.recent')}
              </p>
              {recents.map((r) => (
                <button
                  key={r}
                  onClick={() => setQ(r)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[13px] text-stone-700 hover:bg-stone-50"
                >
                  <Clock size={13} className="text-stone-300 shrink-0" />
                  <span className="truncate">{r}</span>
                </button>
              ))}
            </div>
          )}

          {loading && (
            <div className="space-y-2 p-4" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-stone-100" />
              ))}
            </div>
          )}

          {!loading && hits.length === 0 && searched.length >= MIN_QUERY && (
            <div className="px-6 py-10 text-center">
              <Search size={22} className="mx-auto text-stone-300" />
              <p className="mt-2.5 text-sm font-semibold text-stone-700">{t('search.noResults')}</p>
              <p className="mt-1 text-xs text-stone-400">{t('search.noResultsDesc')}</p>
            </div>
          )}

          {!loading && grouped.map(({ g, items }) => (
            <div key={g} className="p-2">
              <p className="px-2 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-400">
                {groupLabel(g)}
              </p>
              {items.map((hit) => {
                flatIndex += 1;
                const idx = flatIndex;
                const Icon = hit.icon;
                return (
                  <button
                    key={hit.key}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => openHit(hit)}
                    className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors ${
                      active === idx ? 'bg-emerald-50' : 'hover:bg-stone-50'
                    }`}
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      hit.group === 'market' ? 'bg-amber-50 text-amber-700'
                        : hit.group === 'scheme' ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-sky-50 text-sky-700'
                    }`}>
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-stone-900">{hit.title}</span>
                      {hit.sub && <span className="block truncate text-[11px] text-stone-400">{hit.sub}</span>}
                    </span>
                    {active === idx && <CornerDownLeft size={13} className="shrink-0 text-stone-300" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-3 border-t border-stone-100 bg-stone-50/60 px-4 py-2 text-[10px] font-medium text-stone-400">
          <span>↑↓ {t('search.navigate')}</span>
          <span>↵ {t('search.open')}</span>
          <span className="ml-auto">Esc {t('search.close')}</span>
        </div>
      </div>
    </div>
  );
};

export default SearchOverlay;
