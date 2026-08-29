import React from 'react';
import { useAppStore } from '../../store';
import { Download, Sparkles, X } from 'lucide-react';
import { LaideLogo } from './LaideLogo';

export function InstallPrompt() {
  const {
    deferredInstallPrompt,
    setDeferredInstallPrompt,
    showInstallPrompt,
    setShowInstallPrompt
  } = useAppStore();

  if (!showInstallPrompt || !deferredInstallPrompt) {
    return null;
  }

  const handleInstall = async () => {
    try {
      await deferredInstallPrompt.prompt();
      const choiceResult = await deferredInstallPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        localStorage.setItem('xiom_pwa_install_dismissed', 'true');
      }
    } catch (err) {
      console.warn('Error during install prompt:', err);
    } finally {
      setDeferredInstallPrompt(null);
      setShowInstallPrompt(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem('xiom_pwa_install_dismissed', 'true');
    setShowInstallPrompt(false);
  };

  return (
    <aside 
      aria-label="Install LAIDE Studio prompt"
      className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-50 animate-in fade-in slide-in-from-bottom-5 duration-300 pointer-events-auto"
    >
      <div className="bg-surface border border-accent/40 shadow-2xl rounded-lg p-3.5 flex flex-col gap-2.5 backdrop-blur-md relative overflow-hidden">
        {/* Subtle decorative token strip header accent */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-accent/60" />

        <div className="flex items-start justify-between gap-2 pt-0.5">
          <div className="flex items-center gap-2.5">
            <LaideLogo size={32} className="rounded-md shrink-0 shadow-xs" />
            <div>
              <div className="flex items-center gap-1.5">
                <h4 className="text-xs font-sans font-bold  text-text ">
                  Install LAIDE Studio
                </h4>
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 bg-accent/20 text-accent text-[9px] font-sans rounded">
                  <Sparkles size={9} /> APP
                </span>
              </div>
              <p className="text-[11px] font-sans text-muted mt-0.5 leading-relaxed">
                Run natively with offline VFS workspace support and instant launch.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="text-muted hover:text-text p-1 rounded transition-colors cursor-pointer"
            aria-label="Dismiss install prompt"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1 border-t border-border">
          <button
            type="button"
            onClick={handleDismiss}
            className="px-2.5 py-1 text-[11px] font-sans text-muted hover:text-text rounded transition-colors cursor-pointer"
          >
            Not Now
          </button>
          <button
            type="button"
            onClick={handleInstall}
            className="px-3 py-1 bg-accent text-accent-text-on font-sans font-bold text-xs rounded hover:bg-accent/90 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Download size={12} /> Install App
          </button>
        </div>
      </div>
    </aside>
  );
}
