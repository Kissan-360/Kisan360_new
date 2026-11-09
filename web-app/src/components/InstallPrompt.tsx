import React, { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

/**
 * PWA install prompt — shown only when the browser offers it
 * (desktop Chrome / Android). iOS Safari handles it via Share → Add to Home.
 */
const InstallPrompt = () => {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!deferred) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-50 sm:w-80 rounded-xl border border-emerald-100 bg-white p-4 shadow-xl shadow-stone-950/10">
      <p className="text-sm font-semibold text-stone-900">Install Kisan360</p>
      <p className="mt-1 text-xs text-stone-500">Add to home screen for offline chat + disease checks in the field.</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={async () => {
            await deferred.prompt();
            const choice = await deferred.userChoice;
            if (choice.outcome === 'accepted') setDeferred(null);
          }}
          className="flex-1 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800"
        >
          Install
        </button>
        <button
          type="button"
          onClick={() => setDeferred(null)}
          className="flex-1 rounded-lg border border-stone-200 px-3 py-2 text-xs font-bold text-stone-600 hover:bg-stone-50"
        >
          Later
        </button>
      </div>
    </div>
  );
};

export default InstallPrompt;
