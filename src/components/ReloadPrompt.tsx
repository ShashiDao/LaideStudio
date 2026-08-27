import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, DownloadCloud, X } from 'lucide-react';

export function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered() {
      // SW successfully registered
    },
    onRegisterError(error) {
      console.error('SW registration error', error);
    },
  });

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  if (!offlineReady && !needRefresh) {
    return null;
  }

  return (
    <aside 
      aria-label="PWA status notification"
      className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] right-4 left-4 sm:left-auto sm:w-96 z-50 animate-in fade-in slide-in-from-bottom-5 duration-300 pointer-events-auto"
    >
      <div className="bg-surface border border-accent/40 shadow-2xl rounded-lg p-3.5 flex flex-col gap-2.5 backdrop-blur-md">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {needRefresh ? (
              <RefreshCw className="text-accent animate-spin-slow shrink-0" size={18} />
            ) : (
              <DownloadCloud className="text-moss shrink-0" size={18} />
            )}
            <div>
              <h4 className="text-xs font-sans font-bold  text-text ">
                {needRefresh ? 'Update Available' : 'Ready to work offline'}
              </h4>
              <p className="text-[11px] font-sans text-muted mt-0.5 leading-relaxed">
                {needRefresh 
                  ? 'A new version of LAIDE Studio is available. Reload to apply.' 
                  : 'App cached locally. You can edit files and use VFS completely offline.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            className="text-muted hover:text-text p-1 rounded transition-colors cursor-pointer"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1 border-t border-border">
          <button
            type="button"
            onClick={close}
            className="px-2.5 py-1 text-[11px] font-sans text-muted hover:text-text rounded transition-colors cursor-pointer"
          >
            Dismiss
          </button>
          {needRefresh && (
            <button
              type="button"
              onClick={() => updateServiceWorker(true)}
              className="px-3 py-1 bg-accent text-accent-text-on font-sans font-bold text-xs rounded hover:bg-accent/90 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <RefreshCw size={12} /> Reload Now
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
