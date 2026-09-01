import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X, Check, Cpu, Sparkles, RefreshCw, Layers, ArrowRight } from 'lucide-react';
import type { DiscoveredModel } from '../../services/llm/modelDiscovery';
import { getModelContextWindow } from '../../services/llm/modelDiscovery';

export interface ModelPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  models: DiscoveredModel[];
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  provider?: string;
  loading?: boolean;
  onRefresh?: () => void;
}

export function formatContextWindow(tokens?: number): string {
  if (!tokens || tokens <= 0) return '32k ctx';
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000;
    return `${m % 1 === 0 ? m : m.toFixed(1)}M ctx`;
  }
  return `${Math.round(tokens / 1000)}k ctx`;
}

export function isExperimentalModel(modelId: string): boolean {
  if (!modelId) return false;
  const lower = modelId.toLowerCase();
  return lower.includes('-exp') || lower.includes('exp-');
}

export function ModelPickerModal({
  isOpen,
  onClose,
  models,
  selectedModel,
  onSelectModel,
  provider,
  loading = false,
  onRefresh
}: ModelPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);

  // Focus search input when modal opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        setSearchQuery('');
        setSelectedIndex(0);
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }, 10);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Filtered models
  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) return models;
    const q = searchQuery.toLowerCase().trim();
    return models.filter(m => 
      m.id.toLowerCase().includes(q) || 
      (m.name && m.name.toLowerCase().includes(q)) ||
      (m.description && m.description.toLowerCase().includes(q))
    );
  }, [models, searchQuery]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filteredModels.length > 0) {
        setSelectedIndex(prev => (prev + 1) % filteredModels.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredModels.length > 0) {
        setSelectedIndex(prev => (prev - 1 + filteredModels.length) % filteredModels.length);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredModels.length > 0) {
        const item = filteredModels[selectedIndex] || filteredModels[0];
        if (item) {
          onSelectModel(item.id);
          onClose();
        }
      } else if (searchQuery.trim()) {
        // Allow choosing the typed query as a custom model name
        onSelectModel(searchQuery.trim());
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="model-picker-title"
    >
      <div 
        className="w-full sm:max-w-lg bg-surface border-t sm:border border-border/90 rounded-t-2xl sm:rounded-xl shadow-2xl overflow-hidden font-sans text-xs flex flex-col max-h-[85vh] sm:max-h-[80vh] relative pt-3 sm:pt-0 corner-ticks animate-in slide-in-from-bottom-6 sm:slide-in-from-bottom-2 duration-200"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Mobile Drag Handle */}
        <div className="w-8 h-1 bg-border rounded-full mx-auto my-1 sm:hidden shrink-0 pointer-events-none" />

        {/* Header */}
        <div className="px-4 py-3 border-b border-border/80 bg-surface-elevated/40 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded-lg bg-accent/15 text-accent border border-accent/30 shrink-0 shadow-xs">
              <Cpu size={16} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 id="model-picker-title" className="text-xs font-bold text-text uppercase tracking-wider truncate">
                  Select Model
                </h2>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface border border-border text-muted font-mono capitalize">
                  {provider}
                </span>
              </div>
              <p className="text-[10px] text-muted truncate">
                Discovered live provider models and context limits
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={loading}
                aria-label="Refresh models"
                title="Refresh model list"
                className="p-1 text-muted hover:text-accent rounded-md hover:bg-surface-elevated transition-colors cursor-pointer disabled:opacity-40"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin text-accent' : ''} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close model picker"
              className="p-1 text-muted hover:text-text rounded-md hover:bg-surface-elevated transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Search Input Bar */}
        <div className="p-3 border-b border-border/70 bg-bg/50 shrink-0">
          {(provider === 'webllm' || provider === 'offline') && (
            <div className="mb-2.5 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[11px] leading-relaxed flex items-start gap-2">
              <span className="shrink-0 text-sm">⚠️</span>
              <div>
                <strong className="font-semibold block">Offline WebGPU Model Notice</strong>
                <span>Runs entirely inside your browser via WebGPU with zero network calls after download. Noticeably lower reasoning capacity and slower token generation than cloud models (Claude 3.7 / GPT-4o). Best for basic edits and offline privacy.</span>
              </div>
            </div>
          )}

          <div className="relative flex items-center">
            <Search size={14} className="absolute left-2.5 text-muted pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setSelectedIndex(0);
              }}
              placeholder="Filter models (e.g. claude-3-7, gpt-4o, gemini-2.0, deepseek)..."
              className="w-full bg-surface border border-border rounded-lg pl-8 pr-8 py-2 text-text font-mono text-xs focus:border-accent focus:ring-1 focus:ring-accent/30 focus:outline-none transition-colors placeholder:text-muted/60"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  searchInputRef.current?.focus();
                }}
                className="absolute right-2.5 text-muted hover:text-text p-0.5 cursor-pointer transition-colors"
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Result Count and Quick Info */}
          <div className="flex items-center justify-between mt-2 px-1 text-[10px] font-mono text-muted">
            <span className="flex items-center gap-1">
              <Sparkles size={10} className="text-accent" />
              <span>{filteredModels.length} of {models.length} model{models.length === 1 ? '' : 's'}</span>
            </span>
            {selectedModel && (
              <span className="truncate max-w-[200px]">
                Current: <span className="text-accent font-semibold">{selectedModel}</span>
              </span>
            )}
          </div>
        </div>

        {/* Model List Container */}
        <div ref={listContainerRef} className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-1.5 scrollbar-thin">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2.5 text-muted">
              <RefreshCw size={22} className="animate-spin text-accent" />
              <p className="font-mono text-xs">Discovering available provider models...</p>
            </div>
          ) : filteredModels.length === 0 ? (
            <div className="py-8 px-4 text-center space-y-3">
              <div className="p-2.5 rounded-full bg-surface-elevated text-muted inline-flex border border-border">
                <Layers size={20} />
              </div>
              <div>
                <p className="font-mono text-xs font-semibold text-text">No matching models found</p>
                <p className="text-[11px] text-muted mt-0.5">
                  {searchQuery ? `No models matched "${searchQuery}"` : 'No models discovered for this connection.'}
                </p>
              </div>
              {searchQuery.trim() && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectModel(searchQuery.trim());
                    onClose();
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent text-accent-text-on font-mono text-xs font-bold rounded-lg shadow-xs cursor-pointer hover:brightness-105 active:scale-95 transition-all"
                >
                  <span>Use &quot;{searchQuery.trim()}&quot; as custom model</span>
                  <ArrowRight size={12} />
                </button>
              )}
            </div>
          ) : (
            filteredModels.map((m, idx) => {
              const isSelected = selectedModel === m.id;
              const isHighlighted = idx === selectedIndex;
              const ctx = m.contextWindow || getModelContextWindow(provider, m.id);
              const ctxFormatted = formatContextWindow(ctx);
              const isExperimental = isExperimentalModel(m.id);

              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    onSelectModel(m.id);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full p-2.5 rounded-lg border text-left flex items-center justify-between gap-2.5 transition-all cursor-pointer ${
                    isSelected
                      ? 'border-accent bg-accent/15 text-accent font-semibold shadow-xs ring-1 ring-accent/30'
                      : isHighlighted
                      ? 'border-accent/40 bg-surface-elevated text-text'
                      : 'border-border/70 bg-surface hover:border-accent/40 hover:bg-surface-elevated text-text/90'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="font-mono font-bold text-xs truncate text-text">
                        {m.id}
                      </span>
                      {isExperimental && (
                        <span
                          title="Experimental models may have limited provider availability."
                          className="px-1.5 py-0.2 rounded bg-amber-500/15 border border-amber-500/30 text-[9.5px] font-sans font-semibold text-amber-500 shrink-0"
                        >
                          Experimental
                        </span>
                      )}
                      <span className="px-1.5 py-0.2 rounded bg-surface-elevated border border-border text-[9.5px] font-mono text-muted shrink-0">
                        {ctxFormatted}
                      </span>
                    </div>
                    {m.name && m.name !== m.id && (
                      <p className="text-[10.5px] text-muted truncate mt-0.5 font-sans">
                        {m.name}
                      </p>
                    )}
                    {m.description && (
                      <p className="text-[10px] text-muted/80 truncate mt-0.5 font-sans">
                        {m.description}
                      </p>
                    )}
                  </div>

                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-accent text-accent-text-on flex items-center justify-center shrink-0 shadow-xs">
                      <Check size={12} strokeWidth={3} />
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-border/80 bg-surface-elevated/30 flex items-center justify-between text-[10px] font-mono text-muted shrink-0">
          <span className="hidden sm:inline">Use ↑↓ to navigate • ↵ to select • Esc to close</span>
          <span className="sm:hidden">Tap any model to select</span>
          <span>{filteredModels.length} models</span>
        </div>
      </div>
    </div>
  );
}
