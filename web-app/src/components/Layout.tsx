import React, { useState } from 'react';
import Sidebar from './Sidebar';
import NotificationBell from './NotificationBell';
import { useAuth } from '../hooks/useAuth';
import { Link } from 'react-router-dom';

const Layout = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  if (!user) return <>{children}</>;

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400 hidden sm:block">
              {new Date().toLocaleDateString('en-IN', {
                weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
              })}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 border border-amber-200 text-[11px] font-medium text-amber-700 whitespace-nowrap"
              title="Payments, buyer verification and FPO data are simulated for the Smart India Hackathon demo. No real money moves."
            >
              🧪 SIH Prototype · simulated
            </span>
            <NotificationBell />
            <Link
              to="/profile"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors text-sm text-gray-600 hover:text-gray-800"
            >
              <div className="w-6 h-6 bg-gradient-to-br from-emerald-500 to-green-600 rounded-full flex items-center justify-center text-white text-[10px] font-bold">
                {(user?.displayName || user?.email || 'F').slice(0, 1).toUpperCase()}
              </div>
              <span className="hidden sm:inline">{user?.email}</span>
            </Link>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-gray-50">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
