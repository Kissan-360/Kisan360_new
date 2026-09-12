import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth, firebaseReady } from '../../firebaseConfig';
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { PageTransition, PrimaryButton, Card } from '../../components/ui/kit';
import { Logo } from '../../components/brand';
import { useTranslation } from '../../i18n';

const RegisterPage = () => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (!firebaseReady || !auth) {
        setError(t('register.firebaseNotConfigured'));
        return;
      }
      await createUserWithEmailAndPassword(auth, email, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message);
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
          <p className="text-stone-500 mt-1 text-sm">{t('register.subtitle')}</p>
        </div>

        <Card className="p-8">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label htmlFor="register-name" className="block text-sm font-medium text-stone-700 mb-1">{t('register.fullName')}</label>
              <input
                id="register-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field w-full"
                placeholder={t('register.namePlaceholder')}
              />
            </div>

            <div>
              <label htmlFor="register-email" className="block text-sm font-medium text-stone-700 mb-1">{t('register.email')}</label>
              <input
                id="register-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field w-full"
                placeholder={t('register.emailPlaceholder')}
                required
              />
            </div>

            <div>
              <label htmlFor="register-password" className="block text-sm font-medium text-stone-700 mb-1">{t('register.password')}</label>
              <input
                id="register-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field w-full"
                placeholder={t('register.passwordPlaceholder')}
                required
                minLength={6}
              />
            </div>

            <PrimaryButton type="submit" disabled={loading} className="w-full">
              {loading ? t('register.submitting') : t('register.submit')}
            </PrimaryButton>
          </form>

          <button
            onClick={async () => {
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
            }}
            disabled={loading}
            className="mt-4 w-full flex items-center justify-center gap-2 border border-stone-200 hover:border-stone-300 hover:bg-stone-50 rounded-xl py-2.5 text-sm font-medium text-stone-700 transition-colors disabled:opacity-60"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.61.35 3.14.98 4.53l3.86-2.43z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
            {t('login.googleSignIn')}
          </button>

          <p className="text-center mt-6 text-sm text-stone-600">
            {t('register.haveAccount')}{' '}
            <Link to="/login" className="text-emerald-700 hover:text-emerald-800 font-medium">
              {t('register.signIn')}
            </Link>
          </p>
        </Card>
      </div>
    </PageTransition>
  );
};

export default RegisterPage;
