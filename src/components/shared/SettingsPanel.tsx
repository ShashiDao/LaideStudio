import React, { useState, useEffect, useRef } from 'react';
import { 
  Lock, Cpu, Layers, Sliders, Palette, ChevronLeft, ChevronRight 
} from 'lucide-react';
import { LaideLogo } from './LaideLogo';
import { ThemeSection } from './settings/ThemeSection';
import { ProviderProfilesSection, PROVIDERS, API_KEY_HINTS, DEFAULT_MODELS } from './settings/ProviderProfilesSection';
import { DeploySection } from './settings/DeploySection';
import { McpServersSection } from './settings/McpServersSection';
import { SecuritySection } from './settings/SecuritySection';
import { UsageSection } from './settings/UsageSection';
import { DependencyCacheSection } from './settings/DependencyCacheSection';
import { ShortcutsSection } from './settings/ShortcutsSection';

export { PROVIDERS, API_KEY_HINTS, DEFAULT_MODELS };

export const SETTINGS_CATEGORIES = [
  { id: 'appearance', label: 'Appearance', icon: Palette, description: 'Workspace themes, palette swatches, and display contrast' },
  { id: 'ai-providers', label: 'AI & Providers', icon: Cpu, description: 'Connection profiles, API keys, models, and custom instructions' },
  { id: 'integrations', label: 'Integrations', icon: Layers, description: 'GitHub PAT, 1-Click live deploy tokens, and MCP servers' },
  { id: 'security-vault', label: 'Security & Vault', icon: Lock, description: 'Vault locking, memory purge, and encrypted backup export/restore' },
  { id: 'advanced', label: 'Advanced', icon: Sliders, description: 'System diagnostics, token spend, cache, and keyboard accelerators' },
] as const;

export type SettingsCategoryId = typeof SETTINGS_CATEGORIES[number]['id'];

interface SettingsPanelProps {
  onOpenShortcuts?: () => void;
}

export function SettingsPanel({ onOpenShortcuts }: SettingsPanelProps) {
  // Container width tracking for responsive layout (<700px = single column drilldown, >=700px = two column)
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(() => {
    return typeof window !== 'undefined' ? window.innerWidth : 800;
  });

  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>('appearance');
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');

  // Track container width via ResizeObserver with getBoundingClientRect fallback
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateWidth = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) {
        setContainerWidth(rect.width);
      }
    };

    updateWidth();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const w = entry.contentRect.width || entry.target.getBoundingClientRect().width;
          if (w > 0) {
            setContainerWidth(w);
          }
        }
      });
      observer.observe(el);
      return () => observer.disconnect();
    } else {
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
    }
  }, []);

  const isWide = containerWidth >= 700;

  const handleSelectCategory = (catId: SettingsCategoryId) => {
    setActiveCategory(catId);
    setMobileView('detail');
  };

  const renderCategoryContent = (catId: SettingsCategoryId) => {
    switch (catId) {
      case 'appearance':
        return <ThemeSection />;

      case 'ai-providers':
        return <ProviderProfilesSection />;

      case 'integrations':
        return (
          <div className="space-y-4 animate-in fade-in duration-200">
            <DeploySection />
            <McpServersSection />
          </div>
        );

      case 'security-vault':
        return <SecuritySection />;

      case 'advanced':
        return (
          <div className="space-y-4 animate-in fade-in duration-200">
            <UsageSection />
            <DependencyCacheSection />
            <ShortcutsSection onOpenShortcuts={onOpenShortcuts} />
          </div>
        );
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
