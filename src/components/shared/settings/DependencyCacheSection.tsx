import React, { useState, useEffect } from 'react';
import { Layers, CheckCircle2, RefreshCw, Trash2 } from 'lucide-react';

export function DependencyCacheSection() {
  const [cachedDepCount, setCachedDepCount] = useState<number | null>(null);
  const [clearingCache, setClearingCache] = useState(false);
  const [cacheClearedMsg, setCacheClearedMsg] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchDepCache = async () => {
      try {
        if (typeof caches !== 'undefined') {
          const cache = await caches.open('laide-npm-cache-v1');
          const keys = await cache.keys();
          if (active) {
            setCachedDepCount(keys.length);
          }
        }
      } catch (err) {
        console.error('Failed to count cached dependencies', err);
      }
    };
    fetchDepCache();
    return () => {
      active = false;
    };
  }, []);

  const handleClearDepCache = async () => {
    setClearingCache(true);
    try {
      if (typeof caches !== 'undefined') {
        await caches.delete('laide-npm-cache-v1');
      }
      setCachedDepCount(0);
      setCacheClearedMsg(true);
      setTimeout(() => setCacheClearedMsg(false), 3000);
    } catch (err) {
      console.error('Failed to clear dependency cache', err);
    } finally {
      setClearingCache(false);
    }
  };

  return (
    <div className="bg-surface/50 border border-border p-4 sm:p-5 rounded">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-accent">
          <Layers size={18} />
          <h3 className="text-sm font-sans font-bold">Dependency Cache</h3>
        </div>
        {cachedDepCount !== null && (
          <span className="text-[11px] font-sans text-muted bg-bg/60 px-2 py-0.5 rounded border border-border">
            {cachedDepCount} module{cachedDepCount === 1 ? '' : 's'} cached
          </span>
        )}
      </div>

      <p className="text-xs text-muted font-sans mb-4 leading-relaxed">
        The in-browser bundler caches npm dependencies fetched from esm.sh into browser Cache Storage. This accelerates preview rebuilds and enables full offline preview for previously cached dependencies.
      </p>

      <button
        type="button"
        onClick={handleClearDepCache}
        disabled={clearingCache}
        className="w-full py-2.5 px-4 bg-surface hover:bg-black/5 border border-white/15 text-text font-sans text-xs rounded font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
      >
        {cacheClearedMsg ? (
          <CheckCircle2 size={15} className="text-moss" />
        ) : clearingCache ? (
          <RefreshCw size={15} className="animate-spin text-accent" />
        ) : (
          <Trash2 size={15} className="text-oxide" />
        )}
        <span>
          {cacheClearedMsg 
            ? 'Dependency Cache Cleared!' 
            : clearingCache 
              ? 'Clearing Cache...' 
              : 'Clear Dependency Cache'}
        </span>
      </button>
    </div>
  );
}
