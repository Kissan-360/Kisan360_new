import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Send, CheckCircle2, Banknote, XCircle, Package, FileText,
  CloudSun, CloudRain, Zap, Thermometer, Snowflake, Droplets, Lightbulb,
  Bell, type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTranslation } from '../i18n';
import { API_URL, apiFetch, getDemoToken } from '../lib/api';

// Proper notification inbox:
// - items come from GET /api/notifications: the farmer's OWN deal events
//   (offer sent / accepted / money received / failed, waiting lots, issue
//   updates) plus weather alerts and a tip — each with a STABLE id, a real
//   timestamp, and a `to` route, so every row is tappable and goes somewhere.
// - read-state is derived from a local last-seen timestamp (no backend
//   storage): opening the panel or "Mark all read" sets it, and it can never
//   silently revert on the next poll.
// - text renders from `notif.<kind>.*` keys with the server's English
//   title/message as fallback, so an unknown kind still reads fine.

const SEEN_KEY = 'kisan360-notif-seen';

const KIND_ICONS: Record<string, LucideIcon> = {
  offer_sent: Send,
  offer_accepted: CheckCircle2,
  payment_released: Banknote,
  payment_failed: XCircle,
  lot_waiting: Package,
  grievance_update: FileText,
  wx_heat: Thermometer,
  wx_warm: CloudSun,
  wx_humid_high: Droplets,
  wx_humid_low: CloudSun,
  wx_rain: CloudRain,
  wx_storm: Zap,
  wx_frost: Snowflake,
  tip: Lightbulb,
};

interface Notif {
  id: string;
  kind?: string;
  params?: Record<string, string | number>;
  title?: string;
  message?: string;
  type?: string;
  to?: string;
  createdAt?: string;
}

function readSeen(): number {
  try {
    const v = Number(localStorage.getItem(SEEN_KEY));
    return Number.isFinite(v) ? v : 0;
  } catch { return 0; }
}

const NotificationBell = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState<Notif[]>([]);
  const [seenAt, setSeenAt] = useState<number>(readSeen);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Respect the Settings toggle: when off, the bell neither fetches nor
  // shows an unread count. The stored value is read live so flipping the
  // toggle takes effect without a reload.
  const notificationsEnabled = (() => {
    try {
      const raw = localStorage.getItem('kisan_settings');
      const settings = raw ? JSON.parse(raw) : null;
      return settings ? settings.notifications !== false : true;
    } catch { return true; }
  })();

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const fetchNotifications = useCallback(async () => {
    // Demo sessions carry the token via apiFetch; a pure-Firebase session sends
    // its ID token explicitly.
    const headers: Record<string, string> = {};
    if (!getDemoToken() && user && typeof (user as any).getIdToken === 'function') {
      try {
        headers.Authorization = `Bearer ${await (user as any).getIdToken()}`;
      } catch {}
    }

    try {
      setError('');
      const resp = await apiFetch(`${API_URL}/notifications`, { headers });
      const data = await resp.json();
      if (data.success && Array.isArray(data.notifications)) {
        setItems(data.notifications);
      } else if (!data.success) {
        setError(data.error || 'Could not load notifications.');
      }
    } catch {
      setError('Could not reach the server.');
    }
  }, [user]);

  useEffect(() => {
    if (user && notificationsEnabled) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 300000);
      return () => clearInterval(interval);
    }
    if (!notificationsEnabled) {
      setItems([]);
    }
  }, [user, notificationsEnabled, fetchNotifications]);

  const markSeen = () => {
    const now = Date.now();
    setSeenAt(now);
    try { localStorage.setItem(SEEN_KEY, String(now)); } catch { /* ignore */ }
  };

  const toggleOpen = () => {
    if (!open) {
      fetchNotifications();
      markSeen();
    }
    setOpen(!open);
  };

  const openItem = (n: Notif) => {
    setOpen(false);
    navigate(n.to || '/dashboard');
  };

  const textFor = (n: Notif, field: 'title' | 'message'): string => {
    if (n.kind) {
      const key = `notif.${n.kind}.${field}`;
      const v = t(key, n.params || {});
      if (v !== key) return v;
    }
    return field === 'title' ? (n.title || '') : (n.message || '');
  };

  const timeFor = (n: Notif): string => {
    if (!n.createdAt) return '';
    const d = new Date(n.createdAt);
    if (Number.isNaN(+d)) return '';
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    return sameDay
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  if (!user || !notificationsEnabled) return null;

  const unread = items.filter((n) => {
    const ts = n.createdAt ? +new Date(n.createdAt) : 0;
    return ts > seenAt;
  }).length;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggleOpen}
        aria-label={`${t('notif.title')}${unread > 0 ? ` (${unread} unread)` : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        className="relative p-2 rounded-lg hover:bg-stone-100 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
      >
        <Bell size={18} className="text-stone-600" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full min-w-5 h-5 px-1 flex items-center justify-center font-bold">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Responsive width: fixed w-96 overflows mobile viewports */}
      {open && (
        <div className="absolute right-0 mt-2 w-[min(24rem,calc(100vw-2rem))] bg-white rounded-xl shadow-xl border border-stone-200 z-50 max-h-[500px] flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
            <h3 className="font-semibold text-stone-800 text-sm">{t('notif.title')}</h3>
            {items.length > 0 && (
              <button
                onClick={markSeen}
                className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 min-h-[32px] px-2"
              >
                {t('notif.markRead')}
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1">
            {error && items.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-xs text-stone-500">{error}</p>
                <button
                  onClick={fetchNotifications}
                  className="mt-2 text-xs font-semibold text-emerald-700 hover:text-emerald-800 min-h-[36px] px-3"
                >
                  {t('common.retry')}
                </button>
              </div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center text-stone-400 text-sm">{t('notif.empty')}</div>
            ) : (
              items.map((n) => {
                const Icon = (n.kind && KIND_ICONS[n.kind]) || Lightbulb;
                const isNew = n.createdAt ? +new Date(n.createdAt) > seenAt : false;
                return (
                  <button
                    key={n.id}
                    onClick={() => openItem(n)}
                    className={`w-full text-left px-4 py-3 border-b border-stone-50 hover:bg-stone-50 transition-colors ${
                      isNew ? 'bg-emerald-50/60' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <span className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${isNew ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-500'}`}>
                        <Icon size={15} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13px] font-semibold text-stone-800 truncate">{textFor(n, 'title')}</span>
                          <span className="text-[11px] text-stone-400 shrink-0">{timeFor(n)}</span>
                        </div>
                        <p className="text-xs text-stone-600 mt-0.5 leading-relaxed">{textFor(n, 'message')}</p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
