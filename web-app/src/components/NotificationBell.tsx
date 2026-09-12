import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';

import { API_URL, apiFetch, getDemoToken } from '../lib/api';

const typeStyles: Record<string, string> = {
  danger: 'bg-red-50 border-red-200 text-red-700',
  warning: 'bg-yellow-50 border-yellow-200 text-yellow-700',
  info: 'bg-blue-50 border-blue-200 text-blue-700',
};

const typeIcons: Record<string, string> = {
  danger: '🔴',
  warning: '🟡',
  info: 'ℹ️',
};

const NotificationBell = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
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

  const fetchNotifications = async () => {
    // Demo sessions carry the token via apiFetch; a pure-Firebase session sends
    // its ID token explicitly.
    const headers: Record<string, string> = {};
    if (!getDemoToken() && user && typeof (user as any).getIdToken === 'function') {
      try {
        headers.Authorization = `Bearer ${await (user as any).getIdToken()}`;
      } catch {}
    }

    try {
      const resp = await apiFetch(`${API_URL}/notifications`, { headers });
      const data = await resp.json();
      if (data.success) {
        setNotifications(data.notifications);
        setUnread(data.unreadCount);
      }
    } catch {}
  };

  useEffect(() => {
    if (user && notificationsEnabled) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 300000);
      return () => clearInterval(interval);
    }
    if (!notificationsEnabled) {
      setNotifications([]);
      setUnread(0);
    }
  }, [user, notificationsEnabled]);

  // NOTE: there is deliberately no "mark all read" button. The notifications
  // API exposes no mark-read endpoint, so a local-only clear would silently
  // revert on the next poll — a button that lies. Unread badges here are
  // informational for the demo.

  if (!user || !notificationsEnabled) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          setOpen(!open);
          if (!open) fetchNotifications();
        }}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
      >
        <span className="text-xl">🔔</span>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Responsive width: fixed w-96 overflows mobile viewports */}
      {open && (
        <div className="absolute right-0 mt-2 w-[min(24rem,calc(100vw-2rem))] bg-white rounded-xl shadow-xl border border-gray-200 z-50 max-h-[500px] flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">Notifications</h3>
          </div>

          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">No notifications yet</div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                    !n.read ? 'bg-green-50/50' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-base mt-0.5">{typeIcons[n.type] || 'ℹ️'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-gray-800 truncate">{n.title}</span>
                        <span className="text-xs text-gray-400 shrink-0">
                          {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{n.message}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
