import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getDemoUser } from '../lib/api';
import { auth } from '../firebaseConfig';
import { updateProfile } from 'firebase/auth';
import { Link } from 'react-router-dom';
import { useTranslation } from '../i18n';
import { FarmerPhoto } from '../components/FarmerAvatar';

const ProfilePage = () => {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const demoUser = getDemoUser();
  // Demo identities are fixed by design — name editing is for real accounts.
  const isDemo = (user as any)?.demo === true;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [phone, setPhone] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);

  const savePhone = async () => {
    const clean = phone.trim();
    if (!/^\d{10,15}$/.test(clean.replace(/^\+/, ''))) {
      setNotice('Phone must be 10–15 digits (E.164, e.g. 919999999999)');
      return;
    }
    setSavingPhone(true);
    try {
      const { apiFetch, API_URL } = await import('../lib/api');
      const res = await apiFetch(`${API_URL}/auth/phone`, { method: 'PUT', body: JSON.stringify({ phone: clean }) });
      const data = await res.json();
      setNotice(res.ok ? 'WhatsApp alerts opted in — daily 07:00 IST weather.' : (data.error || 'Save failed'));
    } catch {
      setNotice('Save failed — try again when online.');
    } finally {
      setSavingPhone(false);
    }
  };

  const startEdit = () => {
    setDraft(user?.displayName || '');
    setNotice('');
    setEditing(true);
  };

  const saveName = async () => {
    const next = draft.trim();
    if (!next) {
      setNotice(t('profile.nameRequired'));
      return;
    }
    if (!auth?.currentUser) {
      setNotice(t('profile.saveFailed'));
      return;
    }
    setSaving(true);
    setNotice('');
    try {
      await updateProfile(auth.currentUser, { displayName: next });
      await refreshUser();
      setEditing(false);
      setNotice(t('profile.nameSaved'));
    } catch {
      setNotice(t('profile.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

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

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-900 tracking-tight">{t('profile.title')}</h1>
        <p className="text-stone-500 text-sm mt-1">{t('profile.subtitle')}</p>
      </div>

      <div className="card p-6 lg:p-8">
        <div className="flex items-center gap-5 mb-8">
          <FarmerPhoto size={64} square className="shadow-md shadow-emerald-200/50" />
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-stone-900">{user.displayName || user.email?.split('@')[0] || '—'}</h2>
            <p className="text-sm text-stone-500">{user.email}</p>
            {!isDemo && !editing && (
              <button onClick={startEdit} className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 mt-1">
                {t('profile.editName')}
              </button>
            )}
            {!isDemo && editing && (
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="input-field !w-52 !py-1.5 text-sm"
                  placeholder={t('register.fullName')}
                  maxLength={60}
                />
                <button onClick={saveName} disabled={saving} className="btn-primary text-xs !py-1.5 disabled:opacity-60">
                  {t('profile.save')}
                </button>
                <button onClick={() => setEditing(false)} disabled={saving} className="btn-secondary text-xs !py-1.5">
                  {t('profile.cancel')}
                </button>
              </div>
            )}
            {notice && <p className="text-xs text-emerald-700 mt-1.5">{notice}</p>}
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
        <h2 className="font-semibold text-stone-800 mb-3">📱 WhatsApp weather alerts</h2>
        <p className="text-xs text-stone-500 mb-3">Daily 07:00 IST severe-weather alerts (heat / humidity / rain) via WhatsApp. Opt-in with your E.164 mobile number.</p>
        <div className="flex flex-wrap items-center gap-2">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="919999999999" inputMode="tel" className="input-field !w-52 !py-1.5 text-sm" maxLength={16} />
          <button onClick={savePhone} disabled={savingPhone} className="btn-primary text-xs !py-1.5 disabled:opacity-60">
            {savingPhone ? 'Saving…' : 'Opt in'}
          </button>
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
