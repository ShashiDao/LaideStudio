import React from 'react';
import { useAppStore } from '../store';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';

export function Toaster() {
  const { toasts, removeToast } = useAppStore();

  if (toasts.length === 0) return null;

  return (
    <div className="absolute top-10 left-0 right-0 z-[100] flex flex-col items-center gap-2 p-4 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-start gap-3 w-full max-w-sm p-3 rounded-lg shadow-xl border pointer-events-auto transition-all animate-in slide-in-from-top-4 fade-in duration-300 ${
            toast.type === 'error'
              ? 'bg-oxide/10 border-oxide/30 text-oxide'
              : toast.type === 'success'
              ? 'bg-moss/10 border-moss/30 text-moss'
              : 'bg-surface border-border text-text'
          }`}
        >
          <div className="shrink-0 mt-0.5">
            {toast.type === 'error' && <AlertCircle size={16} />}
            {toast.type === 'success' && <CheckCircle size={16} />}
            {toast.type === 'info' && <Info size={16} className="text-accent" />}
          </div>
          <div className="flex-1 text-sm font-sans leading-tight">
            {toast.message}
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            className="shrink-0 p-1 opacity-50 hover:opacity-100 transition-opacity"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
