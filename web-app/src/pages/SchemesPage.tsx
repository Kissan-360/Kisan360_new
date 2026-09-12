import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Landmark, ArrowLeft, FilterX } from 'lucide-react';
import {
  PageHeader, Card, Chip, PrimaryButton, GhostButton, EmptyState,
  SkeletonLines, StaggerList, StaggerItem,
} from '../components/ui/kit';
import { SchemeCard, type SchemeData } from '../components/SchemeCard';
import { useTranslation } from '../i18n';
import { apiFetch, API_URL } from '../lib/api';

const FILTERS: { key: string; labelKey: string; query?: Record<string, string> }[] = [
  { key: 'all', labelKey: 'schemes.filterAll' },
  { key: 'central', labelKey: 'schemes.filterCentral', query: { category: 'central' } },
  { key: 'state', labelKey: 'schemes.filterState', query: { category: 'state' } },
  { key: 'income', labelKey: 'schemes.filterIncome', query: { bucket: 'income' } },
  { key: 'insurance', labelKey: 'schemes.filterInsurance', query: { bucket: 'insurance' } },
  { key: 'credit', labelKey: 'schemes.filterCredit', query: { bucket: 'credit' } },
  { key: 'input', labelKey: 'schemes.filterInput', query: { bucket: 'input' } },
  { key: 'market', labelKey: 'schemes.filterMarket', query: { bucket: 'market' } },
];

const SchemesPage: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [schemes, setSchemes] = useState<SchemeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [query, setQuery] = useState<string>(searchParams.get('q') || '');
  const [expandedSlug, setExpandedSlug] = useState<string | null>(searchParams.get('slug'));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams();
        const current = FILTERS.find((f) => f.key === filter);
        if (current?.query) Object.entries(current.query).forEach(([k, v]) => params.set(k, v));
        if (query) params.set('q', query);
        const res = await apiFetch(`${API_URL}/schemes?${params.toString()}`);
        if (!res.ok) throw new Error('schemes_unavailable');
        const data = await res.json();
        if (!cancelled) setSchemes(Array.isArray(data?.schemes) ? data.schemes : []);
      } catch {
        if (!cancelled) setError(t('schemes.fetchError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [filter, query, t]);

  useEffect(() => {
    const slug = searchParams.get('slug');
    if (slug) {
      setExpandedSlug(slug);
      const el = document.getElementById(`scheme-${slug}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [searchParams]);

  const stats = useMemo(() => {
    const total = schemes.length;
    const central = schemes.filter((s) => s.category === 'central').length;
    const state = schemes.filter((s) => s.category === 'state').length;
    const income = schemes.filter((s) => s.benefitBucket === 'income').reduce((acc, s) => acc + (s.benefitAmount || 0), 0);
    return { total, central, state, income };
  }, [schemes]);

  const onToggleExpand = (slug: string) => {
    const next = expandedSlug === slug ? null : slug;
    setExpandedSlug(next);
    const nextParams = new URLSearchParams(searchParams);
    if (next) nextParams.set('slug', next); else nextParams.delete('slug');
    if (query) nextParams.set('q', query); else nextParams.delete('q');
    setSearchParams(nextParams, { replace: true });
  };

  const onClear = () => {
    setFilter('all');
    setQuery('');
    const next = new URLSearchParams();
    const slug = searchParams.get('slug');
    if (slug) next.set('slug', slug);
    setSearchParams(next, { replace: true });
  };

  const showDeepLinkBack = !!searchParams.get('slug');

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow={t('schemes.eyebrow')}
        title={t('schemes.title')}
        subtitle={t('schemes.subtitle')}
        actions={
          showDeepLinkBack ? (
            <GhostButton onClick={() => {
              const p = new URLSearchParams(searchParams);
              p.delete('slug');
              setSearchParams(p, { replace: true });
              setExpandedSlug(null);
            }} icon={ArrowLeft}>
              {t('schemes.backToList')}
            </GhostButton>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card className="p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-400">{t('schemes.statTotal')}</p>
          <p className="mt-1 font-display text-2xl font-extrabold text-stone-900 tabular">{loading ? '—' : stats.total}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">{t('schemes.statCentral')}</p>
          <p className="mt-1 font-display text-2xl font-extrabold text-emerald-800 tabular">{loading ? '—' : stats.central}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700 break-words">{t('schemes.statState')}</p>
          <p className="mt-1 font-display text-2xl font-extrabold text-amber-800 tabular">{loading ? '—' : stats.state}</p>
        </Card>
        <Card className="p-4 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-700 break-words">{t('schemes.statIncome')}</p>
          <p className="mt-1 font-display text-2xl font-extrabold text-sky-800 tabular whitespace-nowrap">
            {loading ? '—' : `₹${stats.income.toLocaleString('en-IN')}`}
          </p>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('schemes.searchPlaceholder')}
            className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-stone-200 bg-white text-[13px] text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 min-h-[44px]"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-2 rounded-full text-[12px] font-semibold min-h-[40px] transition-colors border ${
                  active
                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm shadow-emerald-600/20'
                    : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
                }`}
              >
                {t(f.labelKey)}
              </button>
            );
          })}
        </div>
        {(filter !== 'all' || query) && (
          <GhostButton className="!px-3 !py-2 !min-h-[40px] text-[12px]" onClick={onClear} icon={FilterX}>
            {t('common.clear')}
          </GhostButton>
        )}
      </div>

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-5">
              <SkeletonLines rows={7} />
            </Card>
          ))}
        </div>
      )}

      {!loading && error && (
        <Card className="p-6 border-red-200 bg-red-50/60">
          <EmptyState
            icon={Landmark}
            title={t('schemes.noMatches')}
            description="Double-check the spelling, or remove filters to see all available schemes."
            action={<PrimaryButton onClick={onClear}>{t('schemes.showAll')}</PrimaryButton>}
          />
        </Card>
      )}

      {!loading && !error && schemes.length === 0 && (
        <Card className="p-6">
          <EmptyState
            icon={Landmark}
            title={t('schemes.noMatches')}
            description="Try a different filter combination or search term."
            action={<PrimaryButton onClick={onClear}>{t('schemes.resetFilters')}</PrimaryButton>}
          />
        </Card>
      )}

      {!loading && !error && schemes.length > 0 && (
        <StaggerList className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {schemes.map((s) => (
            <StaggerItem key={s.slug} id={`scheme-${s.slug}`}>
              <SchemeCard
                scheme={s}
                expanded={expandedSlug === s.slug}
                onToggleExpand={onToggleExpand}
              />
            </StaggerItem>
          ))}
        </StaggerList>
      )}

      <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-[12px] text-amber-900 flex items-start gap-2">
        <Landmark size={16} className="mt-0.5 shrink-0 text-amber-700" />
        <p>{t('schemes.note')}</p>
      </div>
    </div>
  );
};

export default SchemesPage;
