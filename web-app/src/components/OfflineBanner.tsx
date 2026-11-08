/**
 * OfflineBanner — tells the farmer the truth about what they are looking at.
 *
 * The audience is a smallholder in a Maharashtra village on a patchy connection,
 * not a laptop in a demo hall. With the service worker installed the app shell
 * and the last market reads stay available offline — which is only honest if the
 * screen also says so. A cached ₹3,809/q with no timestamp is a lie by omission;
 * a cached ₹3,809/q stamped "as of 09:35 today" is useful information.
 *
 * Deliberately quiet when online: it renders nothing at all, so it costs no
 * layout and no attention until it has something to say.
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from '../i18n';
import { WifiOff } from 'lucide-react';

const STORAGE_KEY = 'kisan360.lastOnlineAt';

const readLastOnline = (): string | null => {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
};

const OfflineBanner: React.FC = () => {
  const { t } = useTranslation();
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine);
  const [lastOnlineAt, setLastOnlineAt] = useState<string | null>(readLastOnline);

  useEffect(() => {
    const remember = () => {
      const now = new Date().toISOString();
      try { localStorage.setItem(STORAGE_KEY, now); } catch { /* private mode */ }
      setLastOnlineAt(now);
    };

    const goOnline = () => { setOnline(true); remember(); };
    const goOffline = () => setOnline(false);

    // Seed the timestamp on first mount while online, so the offline message
    // has something truthful to show the first time the connection drops.
    if (navigator.onLine) remember();

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (online) return null;

  const when = lastOnlineAt
    ? new Date(lastOnlineAt).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    })
    : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-900"
    >
      <WifiOff size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <p className="text-xs leading-snug">
        <span className="font-semibold">{t('offline.title')}</span>{' '}
        <span>{t('offline.detail')}</span>
        {when && <span> {t('offline.asOf')} {when}.</span>}
      </p>
    </div>
  );
};

export default OfflineBanner;
