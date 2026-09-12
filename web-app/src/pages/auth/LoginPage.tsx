import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth, firebaseReady } from '../../firebaseConfig';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useAuth } from '../../hooks/useAuth';
import { PageTransition, PrimaryButton, Card } from '../../components/ui/kit';
import { Logo } from '../../components/brand';
import { Sprout, ShoppingBag, Users, AlertTriangle, ArrowRight } from 'lucide-react';
import { useTranslation } from '../../i18n';

const LoginPage = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { demoSignIn } = useAuth();
  const [demoError, setDemoError] = useState('');
  const [demoLoadingRole, setDemoLoadingRole] = useState<string | null>(null);

  const DEMO_ROLES = [
    { role: 'farmer', label: t('login.farmer'), Icon: Sprout, desc: t('login.farmerDesc') },
    { role: 'buyer', label: t('login.buyer'), Icon: ShoppingBag, desc: t('login.buyerDesc') },
    { role: 'fpo', label: t('login.fpo'), Icon: Users, desc: t('login.fpoDesc') },
  ];

  const handleDemoSignIn = async (role: string) => {
    if (demoLoadingRole) return;
    setDemoError('');
    setDemoLoadingRole(role);
    try {
      await demoSignIn(role);
      navigate('/dashboard');
    } catch (err: any) {
      setDemoError(err.message || t('login.error.demoFailed'));
    } finally {
      setDemoLoadingRole(null);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (!firebaseReady || !auth) {
        setError(t('login.firebaseNotConfigured'));
        return;
      }
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/dashboard');
    } catch (err: any) {
      const code = err?.code || '';
      const friendlyMessages: Record<string, string> = {
        'auth/invalid-credential': t('login.error.invalidCredential'),
        'auth/user-not-found': t('login.error.userNotFound'),
        'auth/wrong-password': t('login.error.wrongPassword'),
        'auth/too-many-requests': t('login.error.tooManyRequests'),
        'auth/network-request-failed': t('login.error.networkFailed'),
        'auth/invalid-email': t('login.error.invalidEmail'),
      };
      setError(friendlyMessages[code] || t('login.error.default'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageTransition className="min-h-screen bg-gradient-to-br from-stone-50 via-emerald-50/30 to-stone-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Logo />
          </div>
          <p className="text-stone-500 mt-1 text-sm">{t('login.subtitle')}</p>
        </div>

        <Card className="p-8">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-5 text-sm flex items-start gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">{t('login.email.label')}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="farmer@example.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">{t('login.password.label')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder="••••••••"
                required
              />
            </div>

            <PrimaryButton
              type="submit"
              disabled={loading}
              icon={loading ? undefined : ArrowRight}
              className="w-full justify-center"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {t('login.signingIn')}
                </span>
              ) : (
                t('login.signIn')
              )}
            </PrimaryButton>
          </form>

          {/* Demo sign-in divider */}
          <div className="mt-6">
            <div className="flex items-center gap-3">
              <div className="h-px bg-stone-200 flex-1" />
              <span className="text-xs text-stone-400 uppercase tracking-wider font-medium">{t('login.divider')}</span>
              <div className="h-px bg-stone-200 flex-1" />
            </div>
            <p className="text-xs text-stone-400 text-center mt-3">
              {t('login.demoNote')}
            </p>

            {/* Role buttons */}
            <div className="grid grid-cols-3 gap-2 mt-3">
              {DEMO_ROLES.map(({ role, label, Icon, desc }) => (
                <button
                  key={role}
                  onClick={() => handleDemoSignIn(role)}
                  disabled={!!demoLoadingRole}
                  className="border border-stone-200 hover:border-emerald-400 hover:bg-emerald-50/50 rounded-xl p-3 text-center transition-all duration-200 disabled:opacity-60 group"
                  aria-label={`Sign in as ${label}`}
                >
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center mx-auto group-hover:bg-emerald-100 transition-colors">
                    <Icon size={18} className="text-emerald-600" />
                  </div>
                  <div className="text-sm font-medium text-stone-800 mt-2">{label}</div>
                  <div className="text-[11px] text-stone-400 leading-tight mt-0.5">{desc}</div>
                </button>
              ))}
            </div>

            {demoError && (
              <p className="text-xs text-red-600 mt-3 text-center">{demoError}</p>
            )}
          </div>

          <p className="text-center mt-6 text-sm text-stone-500">
            {t('login.noAccount')}{' '}
            <Link to="/register" className="text-emerald-600 hover:text-emerald-700 font-medium">
              {t('login.createOne')}
            </Link>
          </p>
        </Card>
      </div>
    </PageTransition>
  );
};

export default LoginPage;
