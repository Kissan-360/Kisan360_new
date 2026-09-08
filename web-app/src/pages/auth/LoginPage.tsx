import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth } from '../../firebaseConfig';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useAuth } from '../../hooks/useAuth';

const DEMO_ROLES = [
  { role: 'farmer', label: 'Farmer', icon: '🧑‍🌾', desc: 'Check prices, list a lot, sell' },
  { role: 'buyer', label: 'Buyer', icon: '🏭', desc: 'Accept offers, release funds (simulated)' },
  { role: 'fpo', label: 'FPO', icon: '🤝', desc: 'Aggregate & buy for a producer group' },
];

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { demoSignIn } = useAuth();
  const [demoError, setDemoError] = useState('');
  const [demoLoadingRole, setDemoLoadingRole] = useState<string | null>(null);

  const handleDemoSignIn = async (role: string) => {
    setDemoError('');
    setDemoLoadingRole(role);
    try {
      await demoSignIn(role);
      navigate('/dashboard');
    } catch (err: any) {
      setDemoError(err.message || 'Demo login failed');
    } finally {
      setDemoLoadingRole(null);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message.replace('Firebase: ', '').replace(/\(.*\)/, ''));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-emerald-50/30 to-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-green-700 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4 shadow-lg shadow-emerald-200/50">
            K
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Kisan360</h1>
          <p className="text-gray-500 mt-1 text-sm">Sign in to your account</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-5 text-sm flex items-start gap-2">
              <span className="text-lg shrink-0">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-6">
            <div className="flex items-center gap-3">
              <div className="h-px bg-gray-200 flex-1" />
              <span className="text-xs text-gray-400 uppercase tracking-wider font-medium">Demo sign-in</span>
              <div className="h-px bg-gray-200 flex-1" />
            </div>
            <p className="text-xs text-gray-400 text-center mt-3">
              Simulated for the SIH demo — no real credentials. Choose a role.
            </p>
            <div className="grid grid-cols-3 gap-2 mt-3">
              {DEMO_ROLES.map(({ role, label, icon, desc }) => (
                <button
                  key={role}
                  onClick={() => handleDemoSignIn(role)}
                  disabled={!!demoLoadingRole}
                  className="border border-gray-200 hover:border-emerald-400 hover:bg-emerald-50/40 rounded-xl p-3 text-center transition-colors disabled:opacity-60"
                >
                  <div className="text-2xl">{icon}</div>
                  <div className="text-sm font-medium text-gray-800 mt-1">{label}</div>
                  <div className="text-[11px] text-gray-400 leading-tight mt-0.5">{desc}</div>
                </button>
              ))}
            </div>
            {demoError && <p className="text-xs text-red-600 mt-3 text-center">{demoError}</p>}
          </div>

          <p className="text-center mt-6 text-sm text-gray-500">
            Don't have an account?{' '}
            <Link to="/register" className="text-emerald-600 hover:text-emerald-700 font-medium">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
