import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, Search, Globe } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTranslation, LANGUAGES, type Lang } from '../i18n';
import NotificationBell from './NotificationBell';
import SearchOverlay from './SearchOverlay';
import { AgmarkPill, DemoBadge } from './brand';

/* Enterprise topbar — reference: AGMARKNET status pill, demo badge, bell,
   farmer profile. `onMenu` opens the mobile drawer. The search field opens
   the global SearchOverlay (Cmd/Ctrl+K also works). */
export default function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user } = useAuth();
  const { language, setLanguage, t } = useTranslation();
  const [searchOpen, setSearchOpen] = useState(false);
  const displayName = user?.displayName || user?.email?.split('@')[0] || 'Farmer';

  // Cmd/Ctrl+K opens global search from anywhere inside the app shell.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-stone-200 px-4 md:px-6 py-2.5 flex items-center justify-between gap-3 shrink-0">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <button
          className="md:hidden text-stone-500 p-1"
          onClick={onMenu}
          aria-label="Open navigation menu"
        >
          <Menu size={20} />
        </button>
        <span className="hidden xl:block text-sm text-stone-400 tabular">
          {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
        {/* Global search — opens the SearchOverlay command palette */}
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="hidden sm:flex items-center gap-2.5 flex-1 max-w-md min-w-0 rounded-full border border-stone-200 bg-stone-50 px-4 py-2 text-left hover:border-emerald-200 hover:bg-white transition-colors"
          aria-label={t('topbar.searchPlaceholder')}
          aria-haspopup="dialog"
        >
          <Search size={15} className="text-stone-400 flex-shrink-0" />
          <span className="text-[13px] text-stone-400 truncate flex-1 min-w-0">{t('topbar.searchPlaceholder')}</span>
          <kbd className="hidden lg:inline-flex shrink-0 items-center rounded-md border border-stone-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-stone-400">Ctrl K</kbd>
        </button>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
        <div className="relative group">
          <button className="flex items-center gap-1 text-xs font-medium text-stone-600 hover:text-stone-900 border border-stone-200 rounded-lg px-2 py-1.5 hover:bg-stone-50 transition-colors" aria-label="Change language">
            <Globe size={13} />
            <span>{LANGUAGES.find(l => l.code === language)?.native || 'EN'}</span>
          </button>
          <div className="absolute right-0 top-full mt-1 bg-white border border-stone-200 rounded-xl shadow-lg py-1 z-50 hidden group-hover:block min-w-[100px]">
            {LANGUAGES.map((l) => (
              <button key={l.code} onClick={() => setLanguage(l.code)} className={`w-full text-left px-3 py-1.5 text-sm hover:bg-stone-50 transition-colors ${language === l.code ? 'text-emerald-700 font-semibold' : 'text-stone-600'}`}>{l.native}</button>
            ))}
          </div>
        </div>
        <AgmarkPill />
        <DemoBadge topbar />
        <NotificationBell />
        <Link
          to="/profile"
          className="flex items-center gap-2.5 pl-1 sm:pl-2 sm:border-l border-stone-200 hover:bg-stone-50 rounded-lg px-1.5 py-1 transition-colors"
        >
          <div className="text-right hidden lg:block">
            <p className="text-[13px] font-bold text-stone-900 leading-tight">{displayName}</p>
            <p className="text-[10px] text-stone-500 leading-tight">
              {user?.district ? `${user.district} District` : t('topbar.farmerAccount')}
            </p>
          </div>
          <img src="/farmer-ramesh.png" alt="" className="h-9 w-9 rounded-full object-cover ring-2 ring-emerald-100 shrink-0" />
        </Link>
      </div>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}