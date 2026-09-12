import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth, firebaseReady } from '../../firebaseConfig';
import { createUserWithEmailAndPassword } from 'firebase/auth';
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
