import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth, firebaseReady } from '../../firebaseConfig';
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
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
      // Buyers get their own workspace: /trade is the producer's lot manager,
      // so sending a buyer there was the "buyers page leads to seller" bug.
      navigate(role === 'buyer' ? '/buy' : role === 'fpo' ? '/fpo' : '/dashboard');
    } catch (err: any) {
      setDemoError(err.message || t('login.error.demoFailed'));
    } finally {
      setDemoLoadingRole(null);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!firebaseReady || !auth) {
      setError(t('register.firebaseNotConfigured'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      navigate('/dashboard');
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        setError(err.message);
      }
    } finally {
      setLoading(false);
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

          {/* Google sign-in — real account (farmer-side); demo roles below stay for judges */}
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="mt-4 w-full flex items-center justify-center gap-2 border border-stone-200 hover:border-stone-300 hover:bg-stone-50 rounded-xl py-2.5 text-sm font-medium text-stone-700 transition-colors disabled:opacity-60"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.61.35 3.14.98 4.53l3.86-2.43z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
            {t('login.googleSignIn')}
          </button>

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
