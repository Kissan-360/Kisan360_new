import React from 'react';
import { Link } from 'react-router-dom';
import { PageTransition, Card, PrimaryButton, GradientText } from '../components/ui/kit';
import { Logo } from '../components/brand';
import { Scale, Search, Handshake, ArrowRight, ShieldCheck } from 'lucide-react';
import { useTranslation } from '../i18n';

// Landing page — the first human touchpoint. States what the product actually
// does (net realization + market linkage for SIH26132) and is honest that this
// is a prototype with simulated payments/verification.
const LandingPage: React.FC = () => {
  const { t } = useTranslation();

  return (
    <PageTransition className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-stone-50">
      {/* Top bar */}
      <header className="bg-white/80 backdrop-blur-md border-b border-stone-100 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <Logo />
            <nav className="flex items-center gap-3">
              <Link
                to="/login"
                className="text-stone-600 hover:text-emerald-700 text-sm font-medium transition-colors"
              >
                {t('landing.hero.signIn')}
              </Link>
              <PrimaryButton onClick={() => window.location.href = '/login'} icon={ArrowRight}>
                {t('landing.hero.tryDemo')}
              </PrimaryButton>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        {/* Hero */}
        <div className="text-center">
          <p className="text-xs font-bold text-emerald-700 uppercase tracking-[0.18em]">
            {t('landing.hero.eyebrow')}
          </p>
          <h1 className="text-3xl sm:text-5xl font-extrabold text-stone-900 mt-5 mb-6 tracking-tight leading-tight">
            {t('landing.hero.title')}<br />
            <GradientText>{t('landing.hero.gradientTitle')}</GradientText>
          </h1>
          <p className="text-lg text-stone-600 max-w-3xl mx-auto leading-relaxed">
            {t('landing.hero.subtitle')}
          </p>
          <p className="text-base text-stone-500 mt-3 max-w-3xl mx-auto leading-relaxed">
            Kisan360 compares markets by <strong className="text-stone-800">net realization</strong> — the
            headline price minus the costs<em> you</em> bear as a farmer: transport,
            storage and loading. Then it helps you create a lot, find buyers with
            transparent trust tiers, send an offer and track the payment — in one place.
          </p>
          <div className="flex flex-wrap justify-center gap-3 mt-8">
            <PrimaryButton onClick={() => window.location.href = '/login'} icon={ArrowRight} className="text-base px-7 py-3">
              {t('landing.hero.cta')}
            </PrimaryButton>
          </div>
          <p className="text-xs text-stone-400 mt-4">
            {t('landing.hero.demoNote')}
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mt-20">
          <Card className="p-6 hover:shadow-md transition-shadow">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mb-3">
              <Scale size={20} className="text-emerald-600" />
            </div>
            <h2 className="font-semibold text-stone-900">{t('landing.feature1.title')}</h2>
            <p className="text-sm text-stone-500 mt-1.5 leading-relaxed">
              {t('landing.feature1.desc')}
            </p>
          </Card>

          <Card className="p-6 hover:shadow-md transition-shadow">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mb-3">
              <Search size={20} className="text-blue-600" />
            </div>
            <h2 className="font-semibold text-stone-900">{t('landing.feature2.title')}</h2>
            <p className="text-sm text-stone-500 mt-1.5 leading-relaxed">
              {t('landing.feature2.desc')}
            </p>
          </Card>

          <Card className="p-6 hover:shadow-md transition-shadow">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center mb-3">
              <Handshake size={20} className="text-amber-600" />
            </div>
            <h2 className="font-semibold text-stone-900">{t('landing.feature3.title')}</h2>
            <p className="text-sm text-stone-500 mt-1.5 leading-relaxed">
              {t('landing.feature3.desc')}
            </p>
          </Card>
        </div>

        {/* Product pillars */}
        <div className="mt-16">
          <Card className="p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5">
                <ShieldCheck size={20} className="text-emerald-600" />
              </div>
              <div>
                <h2 className="font-semibold text-stone-900">
                  {t('landing.pillar.title')}
                </h2>
                <p className="text-sm text-stone-500 mt-2 leading-relaxed">
                  {t('landing.pillar.desc')}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Farm context band — a field with mandi stakes, not a stat grid */}
        <div className="mt-14 rounded-2xl overflow-hidden border border-stone-200 relative">
          <svg viewBox="0 0 1200 180" className="w-full h-auto block" role="img" aria-label="Illustration of a field with crop rows and a market in the distance">
            <defs>
              <linearGradient id="field-sky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ecfdf5" />
                <stop offset="100%" stopColor="#f8fafc" />
              </linearGradient>
              <linearGradient id="field-ground" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#d1fae5" />
                <stop offset="100%" stopColor="#a7f3d0" />
              </linearGradient>
            </defs>
            <rect width="1200" height="180" fill="url(#field-sky)" />
            {/* sun */}
            <circle cx="1060" cy="42" r="22" fill="#fbbf24" opacity="0.85" />
            {/* market stakes in the distance */}
            <g stroke="#065f46" strokeWidth="5" strokeLinecap="round">
              <line x1="140" y1="118" x2="140" y2="74" /><rect x="126" y="58" width="28" height="18" rx="3" fill="#10b981" />
              <line x1="220" y1="118" x2="220" y2="78" /><rect x="206" y="62" width="28" height="18" rx="3" fill="#34d399" />
              <line x1="300" y1="118" x2="300" y2="70" /><rect x="286" y="54" width="28" height="18" rx="3" fill="#059669" />
            </g>
            {/* ground */}
            <rect y="118" width="1200" height="62" fill="url(#field-ground)" />
            {/* crop rows */}
            <g stroke="#047857" strokeWidth="3" strokeLinecap="round">
              {Array.from({ length: 24 }).map((_, i) => (
                <line key={i} x1={40 + i * 50} y1="150" x2={40 + i * 50} y2="132" opacity={0.5 + (i % 3) * 0.15} />
              ))}
            </g>
            {/* trowel / cart silhouette */}
            <g fill="#b45309">
              <circle cx="820" cy="142" r="10" />
              <rect x="806" y="152" width="28" height="5" rx="2" />
            </g>
          </svg>
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-white/90 to-transparent px-5 py-3">
            <p className="text-xs text-stone-600 max-w-2xl">
              {t('landing.band.text')}
            </p>
          </div>
        </div>
      </main>

      <footer className="max-w-5xl mx-auto px-4 pb-10 text-center">
        <p className="text-xs text-stone-400">
          {t('landing.footer')}
        </p>
      </footer>
    </PageTransition>
  );
};

export default LandingPage;
