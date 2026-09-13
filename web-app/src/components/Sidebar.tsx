import React from 'react';
import { NavLink, useNavigate, Link } from 'react-router-dom';
import {
  LayoutDashboard, Target, TrendingUp, Calculator, Route, Handshake, ShoppingCart,
  CloudSun, Microscope, Sprout, Home, User, Settings, X, LogOut, Landmark, Users,
  PanelLeftClose, PanelLeftOpen, Award, Store,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTranslation, LANGUAGES } from '../i18n';
import { useFlow } from './FlowContext';
import { Logo, MandiDirect } from './brand';
import { isBuyerSideRole } from '../lib/roles';

/* `audience` answers a real usability bug a phone tester hit: a buyer demo-login
   landed on the producer's workspace (`/trade` manages YOUR lots and offer
   inbox) so "Sell My Crop" showed a buyer a page where nothing was buyable.
   Producer-only entries are now hidden from buyer-side roles, and the buy-side
   entry is hidden from producers, so the two workspaces read differently.
   Anything genuinely useful to both (mandi prices, community) stays 'both'.
   `farmer` here means "producer side" — it includes the FPO role, which is a
   producer group (see lib/roles.ts). */
export type NavAudience = 'farmer' | 'buyer' | 'both';

export interface NavEntry {
  to: string;
  label: string;
  icon: LucideIcon;
  group: 'buy' | 'sell' | 'market' | 'farm' | 'account';
  audience: NavAudience;
  /** Optional explicit i18n key when the derived one does not match. */
  labelKey?: string;
}

export const NAV: NavEntry[] = [
  { to: '/buy', label: 'Buy Crops', icon: Store, group: 'buy', audience: 'buyer' },
  { to: '/decision', label: 'Sell My Crop', icon: Target, group: 'sell', audience: 'farmer' },
  { to: '/grade-crop', label: 'Grade My Crop', icon: Award, group: 'sell', audience: 'farmer' },
  { to: '/net-realization', label: 'Net Realization', icon: Calculator, group: 'sell', audience: 'farmer' },
  { to: '/trade', label: 'My Lots', icon: Handshake, group: 'sell', audience: 'farmer' },
  { to: '/fpo', label: 'Sell as Group', icon: ShoppingCart, group: 'sell', audience: 'farmer' },
  { to: '/market', label: 'Mandi Prices', icon: TrendingUp, group: 'market', audience: 'both' },
  { to: '/pathways', label: 'Selling Guide', icon: Route, group: 'market', audience: 'farmer' },
  { to: '/farms', label: 'My Land', icon: Home, group: 'farm', audience: 'farmer' },
  { to: '/weather', label: 'Weather', icon: CloudSun, group: 'farm', audience: 'both' },
  { to: '/disease-detection', label: 'Check My Crop', icon: Microscope, group: 'farm', audience: 'farmer' },
  { to: '/advisory', label: 'Advice', icon: Sprout, group: 'farm', audience: 'farmer' },
  { to: '/schemes', label: 'Govt Help', icon: Landmark, group: 'farm', audience: 'farmer' },
  { to: '/community', label: 'Ask Farmers', icon: Users, group: 'farm', audience: 'both' },
  { to: '/profile', label: 'Profile', icon: User, group: 'account', audience: 'both' },
  { to: '/settings', label: 'Settings', icon: Settings, group: 'account', audience: 'both' },
];

const GROUP_ORDER: NavEntry['group'][] = ['buy', 'sell', 'market', 'farm', 'account'];

/* Per-audience section headings — "Sell" is meaningless in a buyer's sidebar. */
const GROUP_TITLES: Record<NavEntry['group'], { farmer: string; buyer: string }> = {
  buy: { farmer: 'Buy', buyer: 'Buy' },
  sell: { farmer: 'Sell', buyer: 'Sell' },
  market: { farmer: 'Market', buyer: 'Market' },
  farm: { farmer: 'Farm', buyer: 'Farm' },
  account: { farmer: '', buyer: '' },
};

/* Re-exported so existing imports keep working; the mapping itself lives in
   lib/roles.ts so every screen agrees on which side a role is on. */
export { isBuyerSideRole as isBuyerRole, isFpoRole } from '../lib/roles';

/** Entries visible to a role. Buyers never see the producer's workspace. */
export function navForRole(role?: string): NavEntry[] {
  const buyer = isBuyerSideRole(role);
  return NAV.filter((e) => e.audience === 'both' || e.audience === (buyer ? 'buyer' : 'farmer'));
}

/* Hover tooltip for the collapsed rail — CSS-only, no portal needed. */
function RailTooltip({ label }: { label: string }) {
  return (
    <span
      className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-stone-900 px-2 py-1 text-[11px] font-semibold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
      role="tooltip"
    >
      {label}
    </span>
  );
}

function NavItem({ entry, onNavigate, collapsed }: { entry: NavEntry; onNavigate?: () => void; collapsed: boolean }) {
  const Icon = entry.icon;
  const { t } = useTranslation();
  const { startFlow } = useFlow();
  const labelKey = entry.labelKey || `nav.${entry.to.replace('/', '').replace(/-/g, '')}`;
  // t() returns the key itself when a translation is missing (truthy), so a
  // plain `||` fallback never fires — compare explicitly to keep raw `nav.*`
  // keys off screen in every language, now and for future entries.
  const translated = t(labelKey);
  const label = translated === labelKey ? entry.label : translated;
  // ONE front door: the sidebar "Sell My Crop" behaves exactly like the
  // floating button — guided flow from step 1, every tap. Without this the
  // same label opened a different (free-tab, stepper-less) mode.
  const handleClick = () => {
    if (entry.to === '/decision') startFlow();
    onNavigate?.();
  };

  if (collapsed) {
    return (
      <NavLink
        to={entry.to}
        onClick={handleClick}
        title={label}
        className={({ isActive }) =>
          `group relative flex h-[42px] w-full items-center justify-center rounded-lg transition-colors ${
            isActive
              ? 'bg-emerald-800 text-white shadow-sm'
              : 'text-stone-500 hover:bg-stone-100 hover:text-stone-900'
          }`
        }
      >
        {({ isActive }) => (
          <>
            <Icon size={17} className={isActive ? 'text-white' : 'text-stone-400'} />
            <RailTooltip label={label} />
          </>
        )}
      </NavLink>
    );
  }

  return (
    <NavLink
      to={entry.to}
      onClick={handleClick}
      className={({ isActive }) =>
        `w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-[13px] transition-colors min-h-[42px] ${
          isActive
            ? 'bg-emerald-800 text-white font-semibold shadow-sm'
            : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={16} className={isActive ? 'text-white' : 'text-stone-400'} />
          <span className="flex-1 text-left truncate">{label}</span>
        </>
      )}
    </NavLink>
  );
}

function NavList({ onNavigate, collapsed }: { onNavigate?: () => void; collapsed: boolean }) {
  const { user } = useAuth();
  const buyer = isBuyerSideRole(user?.role);
  const entries = navForRole(user?.role);

  return (
    <nav className="flex-1 px-2.5 py-3 space-y-1 overflow-y-auto k-scroll" aria-label="Main navigation">
      {GROUP_ORDER.map((key, gi) => {
        const group = { key, title: GROUP_TITLES[key][buyer ? 'buyer' : 'farmer'] };
        const items = entries.filter((e) => e.group === key);
        // A producer has no buy-side entries and a buyer no sell-side ones —
        // rendering the divider alone would leave an empty band in the rail.
        if (items.length === 0) return null;
        return (
        <div key={group.key}>
          {gi > 0 && (
            collapsed
              ? <div className="mx-1 my-2 border-t border-stone-100" aria-hidden="true" />
              : <div className="mx-2 my-2 border-t border-stone-100" aria-hidden="true" />
          )}
          {group.title && !collapsed && (
            <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-stone-400">
              {group.title}
            </div>
          )}
          <div className="space-y-0.5">
            {items.map((entry) => (
              <NavItem key={entry.to} entry={entry} onNavigate={onNavigate} collapsed={collapsed} />
            ))}
          </div>
        </div>
        );
      })}
    </nav>
  );
}

function UserFooter({ collapsed }: { collapsed: boolean }) {
  const { user, logout } = useAuth();
  const { language, setLanguage, t } = useTranslation();
  const navigate = useNavigate();
  const displayName = user?.displayName || user?.email?.split('@')[0] || 'Farmer';
  const initials = displayName.slice(0, 2).toUpperCase();

  const handleLogout = async () => {
    try { await logout(); } finally { navigate('/'); }
  };

  if (collapsed) {
    return (
      <div className="border-t border-stone-100 py-3 flex flex-col items-center gap-2.5">
        <div
          className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm"
          title={displayName}
        >
          {initials}
        </div>
        <button
          onClick={handleLogout}
          className="text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg p-2.5 transition-colors"
          title={t('topbar.signOut')}
          aria-label={t('topbar.signOut')}
        >
          <LogOut size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-stone-100 px-3.5 py-3.5 space-y-3">
      <MandiDirect />
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-stone-800 truncate leading-tight">{displayName}</p>
          <p className="text-[11px] text-stone-400 truncate leading-tight mt-0.5">
            {user?.district ? `${user.district} District` : user?.email || t('topbar.farmerAccount')}
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg p-2.5 transition-colors shrink-0"
          title={t('topbar.signOut')}
          aria-label={t('topbar.signOut')}
        >
          <LogOut size={16} />
        </button>
      </div>
      {/* Language selector — 36px tall so the three chips are comfortable taps
          (they were 25px, the smallest controls in the app). */}
      <div className="flex items-center gap-1 px-1">
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            onClick={() => setLanguage(l.code)}
            aria-pressed={language === l.code}
            className={`flex-1 min-h-[36px] flex items-center justify-center text-center rounded-md text-[11px] transition-colors ${language === l.code ? 'bg-emerald-100 text-emerald-700 font-semibold' : 'text-stone-400 hover:text-stone-600 hover:bg-stone-50'}`}
          >
            {l.native}
          </button>
        ))}
      </div>
    </div>
  );
}

/* Desktop sidebar — reference: clean white sidebar, green active pill.
   `collapsed` renders a 68px icon rail with hover tooltips; the state is
   owned by Layout and persisted in localStorage. */
export default function Sidebar({ collapsed = false, onToggleCollapse }: { collapsed?: boolean; onToggleCollapse?: () => void }) {
  const collapseBtn = onToggleCollapse && (
    <button
      onClick={onToggleCollapse}
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      aria-expanded={!collapsed}
      title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      className="text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg p-2.5 transition-colors shrink-0"
    >
      {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
    </button>
  );

  return (
    <aside
      className={`hidden md:flex flex-col bg-white border-r border-stone-200 h-screen sticky top-0 flex-shrink-0 transition-all duration-200 overflow-hidden ${
        collapsed ? 'w-[68px]' : 'w-[240px]'
      }`}
    >
      <div className={`flex items-center border-b border-stone-100 ${collapsed ? 'flex-col gap-1.5 py-3 px-2' : 'justify-between px-4 py-4'}`}>
        <Link to="/dashboard" className={collapsed ? 'block' : 'block min-w-0'} aria-label="Go to dashboard">
          {collapsed ? (
            <img src="/kisan360-mark.png" alt="" className="h-7 w-7 object-contain" />
          ) : (
            <Logo />
          )}
        </Link>
        {collapseBtn}
      </div>
      <NavList collapsed={collapsed} />
      <UserFooter collapsed={collapsed} />
    </aside>
  );
}

/* Mobile drawer — same navigation, slide-in panel. Escape closes it.
   Always full-width; collapse does not apply to mobile. */
export function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
      <div className="absolute inset-0 bg-stone-900/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="absolute left-0 top-0 h-full w-72 bg-white p-4 flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between mb-2 shrink-0">
          <Link to="/dashboard" onClick={onClose} aria-label="Go to dashboard">
            <Logo />
          </Link>
          <button onClick={onClose} className="text-stone-400 p-2" aria-label="Close menu">
            <X size={20} />
          </button>
        </div>
        <NavList onNavigate={onClose} collapsed={false} />
        <UserFooter collapsed={false} />
      </div>
    </div>
  );
}
