import React, { useState } from 'react';
import {
  ExternalLink, ChevronDown, ChevronUp, CheckCircle2, Circle,
  IndianRupee, Percent, ShieldCheck, FileCheck, Sparkles,
  Share2, AlertTriangle, Landmark, Building,
} from 'lucide-react';
import { Card, Chip, PrimaryButton, GhostButton } from './ui/kit';
import { useTranslation } from '../i18n';

export interface SchemeData {
  slug: string;
  shortName: string;
  name: string;
  category: 'central' | 'state';
  state: string;
  benefitBucket: 'income' | 'insurance' | 'credit' | 'input' | 'market' | 'soil' | 'advisory';
  description: string;
  benefitAmount?: number | null;
  benefitPct?: number | null;
  benefitType: 'amount_per_year' | 'subsidy_pct' | 'interest_rate' | 'msp_guarantee' | 'free_service' | 'insurance_cover';
  benefitLabel: string;
  eligibility: string[];
  documents: string[];
  applySteps: string[];
  officialUrl: string;
  deadline: string;
  deadlineOpen: boolean;
  tags: string[];
}

interface Props {
  scheme: SchemeData;
  expanded?: boolean;
  onToggleExpand?: (slug: string) => void;
}

const bucketIcon: Record<string, React.ElementType> = {
  income: IndianRupee,
  insurance: ShieldCheck,
  credit: FileCheck,
  input: Sparkles,
  market: Building,
  soil: Landmark,
  advisory: Sparkles,
};

export const SchemeCard: React.FC<Props> = ({ scheme, expanded = false, onToggleExpand }) => {
  const { t } = useTranslation();
  const [showApply, setShowApply] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [verdict, setVerdict] = useState<null | 'eligible' | 'partial' | 'not_eligible'>(null);

  const CategoryIcon = scheme.category === 'central' ? Landmark : Building;
  const BucketIcon = bucketIcon[scheme.benefitBucket] || Sparkles;
  const catColor = scheme.category === 'central' ? 'emerald' : 'amber';

  const first3 = scheme.eligibility.slice(0, 3);
  const restCount = scheme.eligibility.length - 3;

  const onCheck = () => {
    const bucket = scheme.benefitBucket;
    if (bucket === 'income' || bucket === 'advisory') setVerdict('eligible');
    else if (bucket === 'soil' || bucket === 'market') setVerdict('eligible');
    else if (scheme.category === 'state') setVerdict('partial');
    else setVerdict('partial');
  };

  const openOfficial = () => {
    if (scheme.officialUrl) window.open(scheme.officialUrl, '_blank', 'noopener,noreferrer');
  };

  const onShare = async () => {
    try {
      const url = `${window.location.origin}/schemes?slug=${encodeURIComponent(scheme.slug)}`;
      if (navigator.share) {
        await navigator.share({ title: `${scheme.shortName} — Kisan360`, text: scheme.description.slice(0, 180), url });
      } else {
        await navigator.clipboard.writeText(url);
      }
    } catch { /* ignore cancel */ }
  };

  const verdictTone =
    verdict === 'eligible' ? 'emerald' :
    verdict === 'partial' ? 'amber' :
    verdict === 'not_eligible' ? 'red' : 'stone';

  return (
    <Card className="p-5 flex flex-col h-full" spotlight>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <Chip color={catColor as 'emerald' | 'amber'}>
              <CategoryIcon size={11} />
              {scheme.category === 'central' ? t('schemes.categoryCentral') : t('schemes.categoryState')}
            </Chip>
            <Chip color="stone">
              <BucketIcon size={11} />
              {scheme.shortName}
            </Chip>
            {scheme.deadlineOpen && (
              <Chip color="sky">
                <CheckCircle2 size={11} />
                {t('schemes.deadlineOpen')}
              </Chip>
            )}
          </div>
          <h3 className="font-display text-lg font-bold text-stone-900 leading-snug">{scheme.name}</h3>
          <p className="text-[13px] text-stone-500 mt-1.5 line-clamp-3">{scheme.description}</p>
        </div>
        <button
          onClick={() => onToggleExpand?.(scheme.slug)}
          className="shrink-0 h-8 w-8 rounded-lg border border-stone-200 bg-stone-50 text-stone-500 hover:bg-stone-100 flex items-center justify-center"
          aria-label={expanded ? 'Collapse' : 'Expand'}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      <div className="mt-4 rounded-xl bg-gradient-to-br from-emerald-50 via-teal-50 to-white border border-emerald-100 p-3.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700 mb-1">
          {t('schemes.benefitAmount')}
        </p>
        <p className="font-display font-extrabold text-lg text-stone-900 leading-tight">
          {scheme.benefitLabel}
        </p>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">
            {t('schemes.eligibility')}
          </p>
          {restCount > 0 && (
            <span className="text-[10px] text-stone-400">+{restCount} more</span>
          )}
        </div>
        <ul className="space-y-1">
          {first3.map((line, idx) => (
            <li key={idx} className="flex items-start gap-2 text-[12px] text-stone-700">
              <CheckCircle2 size={13} className="text-emerald-600 mt-0.5 shrink-0" />
              <span className="min-w-0">{line}</span>
            </li>
          ))}
        </ul>
      </div>

      {verdict && (
        <div className="mt-4 rounded-xl border p-3" style={{ borderColor: `var(--tw-border-opacity, 1)` }}>
          <div className={`rounded-xl border p-3 ${
            verdict === 'eligible' ? 'bg-emerald-50 border-emerald-200' :
            verdict === 'partial' ? 'bg-amber-50 border-amber-200' :
            'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-center gap-2">
              {verdict === 'eligible'
                ? <CheckCircle2 size={16} className="text-emerald-600" />
                : verdict === 'partial'
                  ? <AlertTriangle size={16} className="text-amber-600" />
                  : <Circle size={16} className="text-red-500" />}
              <p className={`text-sm font-bold ${
                verdict === 'eligible' ? 'text-emerald-800' :
                verdict === 'partial' ? 'text-amber-800' :
                'text-red-700'
              }`}>
                {verdict === 'eligible' ? t('schemes.eligible') :
                 verdict === 'partial' ? t('schemes.partial') :
                 t('schemes.notEligible')}
              </p>
            </div>
            <p className={`text-[12px] mt-1 ${
              verdict === 'eligible' ? 'text-emerald-700' :
              verdict === 'partial' ? 'text-amber-700' :
              'text-red-600'
            }`}>
              {verdict === 'eligible' ? t('schemes.eligibleDesc') :
               verdict === 'partial' ? t('schemes.partialDesc') :
               t('schemes.notEligibleDesc')}
            </p>
          </div>
        </div>
      )}

      {expanded && (
        <div className="mt-4 space-y-3 border-t border-stone-100 pt-4">
          <button
            onClick={() => setShowDocs((v) => !v)}
            aria-expanded={showDocs}
            className="w-full text-left flex items-center justify-between px-3 py-2 rounded-lg border border-stone-200 hover:bg-stone-50"
          >
            <span className="text-[13px] font-semibold text-stone-800">{t('schemes.documents')} · {scheme.documents.length}</span>
            {showDocs ? <ChevronUp size={16} className="text-stone-500" /> : <ChevronDown size={16} className="text-stone-500" />}
          </button>
          {showDocs && (
            <ul className="px-2 space-y-1">
              {scheme.documents.map((d, i) => (
                <li key={i} className="flex items-start gap-2 text-[12px] text-stone-700 py-1">
                  <FileCheck size={13} className="text-sky-600 mt-0.5 shrink-0" />
                  <span>{d}</span>
                </li>
              ))}
              <li className="flex items-start gap-2 text-[11px] text-stone-500 pt-1">
                <Sparkles size={12} className="text-stone-400 mt-0.5 shrink-0" />
                <span>{t('schemes.formsAvailableAt')}</span>
              </li>
            </ul>
          )}

          <button
            onClick={() => setShowApply((v) => !v)}
            aria-expanded={showApply}
            className="w-full text-left flex items-center justify-between px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50/60 hover:bg-emerald-50"
          >
            <span className="text-[13px] font-semibold text-emerald-900">{t('schemes.howToApply')} · {scheme.applySteps.length} steps</span>
            {showApply ? <ChevronUp size={16} className="text-emerald-700" /> : <ChevronDown size={16} className="text-emerald-700" />}
          </button>
          {showApply && (
            <ol className="px-2 space-y-2">
              {scheme.applySteps.map((step, i) => (
                <li key={i} className="flex gap-2.5 text-[12px] text-stone-700">
                  <span className="flex shrink-0 items-center justify-center h-5 w-5 rounded-full bg-emerald-600 text-white text-[10px] font-bold">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          )}

          {scheme.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-2">
              {scheme.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full bg-stone-100 border border-stone-200 text-[10px] font-semibold text-stone-600 px-2 py-0.5"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-auto pt-4 flex flex-wrap items-center gap-2">
        <GhostButton className="!px-3 !py-2 !min-h-[38px] text-[12px]" onClick={onCheck}>
          {t('schemes.checkEligibility')}
        </GhostButton>
        <PrimaryButton className="!px-3 !py-2 !min-h-[38px] text-[12px]" onClick={openOfficial} icon={ExternalLink}>
          {t('schemes.applyNow')}
        </PrimaryButton>
        <button
          onClick={onShare}
          className="ml-auto shrink-0 h-9 w-9 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-stone-500 flex items-center justify-center"
          aria-label="Share scheme"
          title={t('schemes.share')}
        >
          <Share2 size={15} />
        </button>
      </div>
    </Card>
  );
};

export default SchemeCard;
