import React from 'react';
import { useAppStore, type ToastItem } from '../../store';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';

export function Toaster() {
  const { toasts, removeToast } = useAppStore();

  if (toasts.length === 0) return null;

  return (
    <div 
      role="region"
      aria-label="Notifications"
      className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] sm:bottom-6 right-4 left-4 sm:left-auto sm:w-96 z-[100] flex flex-col items-end gap-2.5 pointer-events-none"
    >
      {toasts.map((toast: ToastItem) => (
        <div
          key={toast.id}
          role="status"
          className={`flex items-start gap-3 w-full p-3.5 rounded-lg shadow-2xl border pointer-events-auto bg-surface-elevated transition-all animate-in slide-in-from-bottom-4 fade-in duration-200 ${
            toast.type === 'error'
              ? 'border-oxide/60 ring-1 ring-oxide/20 text-text'
              : toast.type === 'success'
              ? 'border-moss/60 ring-1 ring-moss/20 text-text'
              : 'border-accent/60 ring-1 ring-accent/20 text-text'
          }`}
        >
          <div className="shrink-0 mt-0.5">
            {toast.type === 'error' && <AlertCircle size={17} className="text-oxide" />}
            {toast.type === 'success' && <CheckCircle size={17} className="text-moss" />}
            {toast.type === 'info' && <Info size={17} className="text-accent" />}
          </div>
          <div className="flex-1 text-xs font-sans text-text leading-relaxed font-medium">
            {toast.message}
          </div>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => removeToast(toast.id)}
            className="shrink-0 p-1 text-muted hover:text-text rounded transition-colors cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
