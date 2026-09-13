import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Layout from './components/Layout';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import DiseaseDetection from './pages/DiseaseDetection';
import WeatherPage from './pages/WeatherPage';
import CropAdvisory from './pages/CropAdvisory';
import FarmManagement from './pages/FarmManagement';
import MarketPlace from './pages/MarketPlace';
import NetRealization from './pages/NetRealization';
import TradePage from './pages/TradePage';
import FpoPage from './pages/FpoPage';
import ErrorBoundary from './components/ErrorBoundary';
import { I18nProvider } from './i18n';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';
import NotFoundPage from './pages/NotFoundPage';
import PathwayPage from './pages/PathwayPage';
import DecisionWorkspace from './pages/DecisionWorkspace';
import SchemesPage from './pages/SchemesPage';
import CommunityPage from './pages/CommunityPage';
import GradeCrop from './pages/GradeCrop';
import BuyCrops from './pages/BuyCrops';

const ProtectedRoute = () => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="flex items-center justify-center h-screen text-stone-400">Loading...</div>; // Note: This is outside I18nProvider, so it stays English
  // Remember where the judge was headed (e.g. a shared /net-realization link)
  // so Login can explain the bounce and send them straight there after login.
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
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
      </AuthProvider>
      </I18nProvider>
    </ErrorBoundary>
    </Router>
  );
}

export default App;
