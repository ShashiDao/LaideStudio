import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { LaideLogo } from './LaideLogo';
import { 
  SETTINGS_CATEGORIES, 
  type SettingsCategoryId, 
  type SettingsCategoryDef,
  PROVIDERS,
  API_KEY_HINTS,
  DEFAULT_MODELS,
  formatTokens
} from './settingsConstants';
import { SettingsAppearanceTab } from './SettingsAppearanceTab';
import { SettingsAIProvidersTab } from './SettingsAIProvidersTab';
import { SettingsIntegrationsTab } from './SettingsIntegrationsTab';
import { SettingsSecurityTab } from './SettingsSecurityTab';
import { SettingsAdvancedTab } from './SettingsAdvancedTab';

// Re-export constants and types for backward compatibility
export { 
  SETTINGS_CATEGORIES, 
  PROVIDERS, 
  API_KEY_HINTS, 
  DEFAULT_MODELS, 
  formatTokens 
};
export type { SettingsCategoryId, SettingsCategoryDef };

interface SettingsPanelProps {
  onOpenShortcuts?: () => void;
}

export function SettingsPanel({ onOpenShortcuts }: SettingsPanelProps) {
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>('appearance');
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');
  const [isWide, setIsWide] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && typeof window.innerWidth === 'number') {
      return window.innerWidth >= 700;
    }
    return true;
  });
  const containerRef = useRef<HTMLDivElement>(null);

  // ResizeObserver and mount check for clean responsive width breakdown at 700px
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (typeof el.getBoundingClientRect === 'function') {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) {
        setIsWide(rect.width >= 700);
      }
    }

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const width = entry.contentRect.width;
          setIsWide(width >= 700);
        }
      });

      observer.observe(el);
      return () => observer.disconnect();
    }
  }, []);

  const handleSelectCategory = (catId: SettingsCategoryId) => {
    setActiveCategory(catId);
    setMobileView('detail');
  };

  const renderCategoryContent = (categoryId: SettingsCategoryId) => {
    switch (categoryId) {
      case 'appearance':
        return <SettingsAppearanceTab />;
      case 'ai-providers':
        return <SettingsAIProvidersTab />;
      case 'integrations':
        return <SettingsIntegrationsTab />;
      case 'security-vault':
        return <SettingsSecurityTab />;
      case 'advanced':
        return <SettingsAdvancedTab onOpenShortcuts={onOpenShortcuts} />;
      default:
        return null;
    }
  };

  return (
    <div ref={containerRef} className="flex-1 overflow-hidden flex flex-col h-full bg-bg">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/70 text-accent font-sans shrink-0 bg-surface/20">
        <div className="flex items-center gap-2.5">
          {!isWide && mobileView === 'detail' ? (
            <button
              type="button"
              onClick={() => setMobileView('list')}
              className="flex items-center gap-1.5 h-full py-1 text-muted hover:text-text rounded-md hover:bg-surface transition-colors cursor-pointer"
              aria-label="Back to Settings categories"
            >
              <ChevronLeft size={18} className="shrink-0" />
              <span className="text-xs font-semibold leading-none">Categories</span>
            </button>
          ) : (
            <div className="flex items-center gap-2.5">
              <LaideLogo size={18} className="shrink-0 rounded-xs shadow-xs" />
              <h2 className="text-sm font-semibold text-text">Settings</h2>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area: Responsive Layout */}
      <div className="flex-1 overflow-hidden flex relative">
        {isWide ? (
          /* Persistent Two-Column Layout (>= 700px) */
          <div className="flex w-full h-full divide-x divide-border/60" data-testid="settings-wide-layout">
            {/* Left Rail (~200px) */}
            <div className="w-52 shrink-0 overflow-y-auto p-3 flex flex-col justify-between bg-surface/20" data-testid="settings-category-rail">
              <div className="flex flex-col gap-1">
                <span className="px-2.5 py-1 text-[10px] font-mono text-muted uppercase tracking-wider">
                  Categories
                </span>
                {SETTINGS_CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const isActive = activeCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setActiveCategory(cat.id)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`w-full px-3 py-2.5 rounded-lg text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                        isActive
                          ? 'bg-accent/15 border border-accent/30 text-accent font-semibold shadow-xs'
                          : 'text-muted hover:text-text hover:bg-surface/50 border border-transparent'
                      }`}
                    >
                      <Icon size={16} className={isActive ? 'text-accent' : 'text-muted'} />
                      <span className="text-xs truncate">{cat.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Brand Footer in Sidebar */}
              <div className="mt-4 pt-3 border-t border-border/50 px-1 flex items-center gap-2">
                <LaideLogo size={16} className="rounded-xs shrink-0" />
                <div className="flex flex-col">
                  <span className="text-[10px] font-mono font-bold text-text">LAIDE Studio</span>
                  <span className="text-[9px] font-mono text-muted">Local-First Sandbox</span>
                </div>
              </div>
            </div>

            {/* Right Main Pane */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col gap-4 min-w-0" data-testid="settings-category-pane">
              {renderCategoryContent(activeCategory)}
            </div>
          </div>
        ) : (
          /* Single-Column Drill-Down (< 700px) */
          <div className="w-full h-full overflow-hidden relative" data-testid="settings-narrow-layout">
            {mobileView === 'list' ? (
              /* Category List View */
              <div className="h-full overflow-y-auto p-4 flex flex-col gap-2.5" data-testid="settings-category-list">
                <p className="text-xs text-muted font-sans mb-1.5 px-0.5">
                  Select a settings category to configure preferences and integrations:
                </p>
                {SETTINGS_CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => handleSelectCategory(cat.id)}
                      className="w-full p-3.5 rounded-xl border border-border bg-surface/40 hover:bg-surface hover:border-accent/40 text-left flex items-center justify-between gap-3 transition-all cursor-pointer group shadow-2xs"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-lg bg-surface-elevated border border-border flex items-center justify-center text-accent group-hover:scale-105 transition-transform shrink-0">
                          <Icon size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-xs font-semibold text-text tracking-tight group-hover:text-accent transition-colors">
                            {cat.label}
                          </h3>
                          <p className="text-[11px] text-muted mt-0.5 font-sans leading-snug break-words">
                            {cat.description}
                          </p>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-muted group-hover:text-accent shrink-0 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  );
                })}
              </div>
            ) : (
              /* Category Detail View */
              <div className="h-full overflow-y-auto p-4 flex flex-col gap-4 animate-in slide-in-from-right duration-200" data-testid="settings-category-detail">
                {renderCategoryContent(activeCategory)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
