import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Sprout } from 'lucide-react';
import Sidebar, { MobileNav, isBuyerRole } from './Sidebar';
import Topbar from './Topbar';
import ChatBot from './ChatBot';
import FlowGuidanceBar from './FlowGuidanceBar';
import { FlowProvider, useFlow } from './FlowContext';
import { useAuth } from '../hooks/useAuth';
import { useTranslation } from '../i18n';

const SIDEBAR_COLLAPSED_KEY = 'kisan360-sidebar-collapsed';

const readCollapsedPref = (): boolean => {
  try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'; } catch { return false; }
};

/* Routes whose page already owns a sticky primary-action bar at the bottom.
   The FAB floats in the same bottom-right corner, and at tablet width it was
   measured sitting ON TOP of that bar (FAB 581–732 × 604–652 vs the FPO bar
   40–705 × 562–656) — two competing CTAs overlapping. On those routes the
   page's own action bar is the action, so the global shortcut steps aside. */
const ROUTES_WITH_OWN_ACTION_BAR = ['/fpo'];

/* Floating "Sell My Crop" button — visible on all pages when not in flow mode.
   Hidden in the buyer's workspace: a floating "Sell My Crop" over a page of
   lots to buy is the same role confusion the sidebar now avoids. */
function SellFab() {
  const { inFlow, startFlow } = useFlow();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const { user } = useAuth();

  if (inFlow || isBuyerRole(user?.role)) return null;
  if (ROUTES_WITH_OWN_ACTION_BAR.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  const handleClick = () => {
    startFlow();
    navigate('/decision');
  };

  return (
    <button
      onClick={handleClick}
      className="fixed bottom-5 right-6 z-40 flex items-center gap-2 rounded-full bg-emerald-800 px-5 py-3.5 text-sm font-bold text-white shadow-xl hover:bg-emerald-900 hover:shadow-2xl transition-all active:scale-95 md:bottom-5 md:right-8"
      aria-label={t('flow.sellMyCrop')}
    >
      <Sprout size={18} />
      <span className="hidden sm:inline">{t('flow.sellMyCrop')}</span>
    </button>
  );
}

/* App shell — reference layout: white sidebar + enterprise topbar over a
   stone-50 content canvas. When in flow mode, the sidebar is replaced by
   a stepper bar at the top. A floating "Sell My Crop" button appears on
   all pages when not in flow mode. */
const LayoutInner = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const { inFlow } = useFlow();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsedPref);
  // A buyer never enters the selling flow, but the flow flag persists in
  // localStorage — so a producer who was mid-flow and then switched to the
  // buyer demo account would otherwise get the selling stepper on the buy page.
  const flowActive = inFlow && !isBuyerRole(user?.role);

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };

  if (!user) return <>{children}</>;

  return (
    <div className="flex h-screen bg-[#faf8ff] overflow-hidden">
      {/* Sidebar: hidden in flow mode on desktop, always hidden on mobile (MobileNav handles it) */}
      {!flowActive && <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapse} />}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Flow stepper: replaces sidebar header when in flow mode */}
        {flowActive && <FlowGuidanceBar />}

        <Topbar onMenu={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto k-scroll">
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 lg:py-8">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile nav: only shows when NOT in flow mode */}
      {!flowActive && <MobileNav open={mobileOpen} onClose={() => setMobileOpen(false)} />}

      <ChatBot />
      <SellFab />
    </div>
  );
};

const Layout = ({ children }: { children: React.ReactNode }) => (
  <FlowProvider>
    <LayoutInner>{children}</LayoutInner>
  </FlowProvider>
);

export default Layout;
