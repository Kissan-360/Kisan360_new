import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { getDemoUser } from '../lib/api';
import { Link } from 'react-router-dom';
import { useTranslation } from '../i18n';

const ProfilePage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const demoUser = getDemoUser();

  const ROLE_LABELS: Record<string, { label: string; icon: string; desc: string }> = {
    farmer: { label: t('profile.farmer'), icon: '🧑‍🌾', desc: t('profile.farmerDesc') },
    buyer: { label: t('profile.buyer'), icon: '🏭', desc: t('profile.buyerDesc') },
    fpo: { label: t('profile.fpo'), icon: '🤝', desc: t('profile.fpoDesc') },
  };

  if (!user) {
    return (
      <div className="p-6 lg:p-8">
        <div className="card p-12 text-center">
          <p className="text-stone-500">{t('profile.pleaseSignIn')}</p>
          <Link to="/login" className="btn-primary mt-4 inline-block">{t('profile.signIn')}</Link>
        </div>
      </div>
    );
  }

  const roleInfo = demoUser?.role ? ROLE_LABELS[demoUser.role] : null;

  const details = [
    { label: t('profile.email'), value: user.email || '—' },
    { label: t('profile.displayName'), value: user.displayName || '—' },
    { label: t('profile.role'), value: roleInfo ? `${roleInfo.icon} ${roleInfo.label}` : (demoUser?.role || '—') },
    ...(demoUser?.district ? [{ label: t('profile.district'), value: demoUser.district }] : []),
    { label: t('profile.emailVerified'), value: user.emailVerified ? '✅ Yes' : '❌ No' },
    { label: t('profile.accountCreated'), value: user.metadata?.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }) : '—' },
    { label: t('profile.lastSignIn'), value: user.metadata?.lastSignInTime ? new Date(user.metadata.lastSignInTime).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—' },
    { label: t('profile.userId'), value: user.uid.slice(0, 16) + '...', mono: true },
  ];

  const initials = (user.displayName || user.email || 'F').slice(0, 2).toUpperCase();

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-900 tracking-tight">{t('profile.title')}</h1>
        <p className="text-stone-500 text-sm mt-1">{t('profile.subtitle')}</p>
      </div>

      <div className="card p-6 lg:p-8">
        <div className="flex items-center gap-5 mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-md shadow-emerald-200/50">
            {initials}
          </div>
          <div>
            <h2 className="text-xl font-bold text-stone-900">{user.displayName || 'Farmer'}</h2>
            <p className="text-sm text-stone-500">{user.email}</p>
          </div>
        </div>

        <div className="space-y-0 divide-y divide-stone-100">
          {details.map((d) => (
            <div key={d.label} className="flex items-center justify-between py-3">
              <span className="text-sm text-stone-500">{d.label}</span>
              <span className={`text-sm font-medium text-stone-900 ${d.mono ? 'font-mono text-xs' : ''}`}>{d.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-6">
        <h2 className="font-semibold text-stone-800 mb-4">{t('profile.quickLinks')}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Link to="/dashboard" className="flex items-center gap-2 p-3 bg-stone-50 rounded-xl hover:bg-emerald-50 transition-colors">
            <span>📊</span> <span className="text-sm text-stone-700">{t('profile.dashboard')}</span>
          </Link>
          <Link to="/disease-detection" className="flex items-center gap-2 p-3 bg-stone-50 rounded-xl hover:bg-emerald-50 transition-colors">
            <span>🔬</span> <span className="text-sm text-stone-700">{t('profile.diseaseDetection')}</span>
          </Link>
          <Link to="/settings" className="flex items-center gap-2 p-3 bg-stone-50 rounded-xl hover:bg-emerald-50 transition-colors">
            <span>⚙️</span> <span className="text-sm text-stone-700">{t('profile.settings')}</span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
