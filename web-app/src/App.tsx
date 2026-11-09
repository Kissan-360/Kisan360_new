import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Layout from './components/Layout';
import LandingPage from './pages/LandingPage';
import ErrorBoundary from './components/ErrorBoundary';
import InstallPrompt from './components/InstallPrompt';
import { I18nProvider } from './i18n';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import NotFoundPage from './pages/NotFoundPage';

// Route-level code splitting: initial bundle stays small; heavy pages load on demand.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const DiseaseDetection = lazy(() => import('./pages/DiseaseDetection'));
const WeatherPage = lazy(() => import('./pages/WeatherPage'));
const CropAdvisory = lazy(() => import('./pages/CropAdvisory'));
const FarmManagement = lazy(() => import('./pages/FarmManagement'));
const MarketPlace = lazy(() => import('./pages/MarketPlace'));
const NetRealization = lazy(() => import('./pages/NetRealization'));
const TradePage = lazy(() => import('./pages/TradePage'));
const FpoPage = lazy(() => import('./pages/FpoPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const PathwayPage = lazy(() => import('./pages/PathwayPage'));
const DecisionWorkspace = lazy(() => import('./pages/DecisionWorkspace'));
const SchemesPage = lazy(() => import('./pages/SchemesPage'));
const CommunityPage = lazy(() => import('./pages/CommunityPage'));
const GradeCrop = lazy(() => import('./pages/GradeCrop'));
const BuyCrops = lazy(() => import('./pages/BuyCrops'));

const ProtectedRoute = () => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="flex items-center justify-center h-screen text-stone-400">Loading...</div>; // Note: This is outside I18nProvider, so it stays English
  // Remember where the judge was headed (e.g. a shared /net-realization link)
  // so Login can explain the bounce and send them straight there after login.
  // Existing state (e.g. sessionExpired from a dead-session redirect) is
  // preserved — otherwise the guard's own redirect would overwrite it and the
  // notice would never show (the cleared user re-renders mid-navigation).
  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ ...((location.state as Record<string, unknown> | null) || {}), from: location.pathname + location.search }}
      />
    );
  }
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
};

function App() {
  return (
    <Router>
      <ErrorBoundary>
      <I18nProvider>
      <AuthProvider>
        <InstallPrompt />
        <Suspense fallback={<div className="flex items-center justify-center h-screen text-stone-400">Loading…</div>}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/decision" element={<DecisionWorkspace />} />
            <Route path="/disease-detection" element={<DiseaseDetection />} />
            <Route path="/weather" element={<WeatherPage />} />
            <Route path="/advisory" element={<CropAdvisory />} />
            <Route path="/farms" element={<FarmManagement />} />
            <Route path="/market" element={<MarketPlace />} />
            <Route path="/net-realization" element={<NetRealization />} />
            <Route path="/pathways" element={<PathwayPage />} />
            <Route path="/trade" element={<TradePage />} />
            <Route path="/buy" element={<BuyCrops />} />
            <Route path="/fpo" element={<FpoPage />} />
            <Route path="/schemes" element={<SchemesPage />} />
            <Route path="/community" element={<CommunityPage />} />
            <Route path="/grade-crop" element={<GradeCrop />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </Suspense>
      </AuthProvider>
      </I18nProvider>
    </ErrorBoundary>
    </Router>
  );
}

export default App;
