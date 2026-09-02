import React from 'react';
import { Palette, Moon, Sun, Sliders, RotateCcw, Check, ToggleRight, ToggleLeft, Code2 } from 'lucide-react';
import { useAppStore } from '../../store';
import { 
  DEFAULT_CONTRAST, 
  MIN_CONTRAST, 
  MAX_CONTRAST, 
  getContrastLabel, 
  computeThemeVariables 
} from '../../services/theme/contrast';

export function SettingsAppearanceTab() {
  const {
    theme,
    setTheme,
    themeContrast,
    setThemeContrast,
    showLineNumbers,
    setShowLineNumbers
  } = useAppStore();

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Workspace Appearance & Theme Settings (Single Unified Panel) */}
      <div className="rounded-xl border border-border bg-surface/30 p-4 space-y-4">
        {/* Panel Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-surface-elevated border border-border flex items-center justify-center text-accent">
              <Palette size={15} />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-text tracking-tight">Workspace Appearance</h3>
              <p className="text-[11px] text-muted">Theme styling and display contrast calibration</p>
            </div>
          </div>
          <span className="font-mono text-[10px] px-2 py-0.5 rounded-md bg-surface-elevated border border-border text-muted font-medium">
            Active: <span className="text-accent font-bold">{theme === 'oled' ? 'OLED' : 'Paper'}</span>
          </span>
        </div>

        {/* Theme Cards Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* OLED Theme Option */}
          <button
            type="button"
            onClick={() => setTheme('oled')}
            aria-pressed={theme === 'oled'}
            className={`flex flex-col p-3.5 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden ${
              theme === 'oled'
                ? 'border-accent bg-[#0D0D10] text-[#F2F0EA] shadow-md ring-1 ring-accent/40'
                : 'border-border bg-surface/70 text-text hover:border-accent/60 hover:bg-surface-elevated/80'
            }`}
          >
            <div className="flex items-center justify-between w-full mb-1.5">
              <div className={`flex items-center gap-1.5 font-mono text-xs font-bold ${
                theme === 'oled' ? 'text-[#F2F0EA]' : 'text-text'
              }`}>
                <Moon size={13} className="text-accent" />
                <span>OLED / Vault</span>
              </div>
              {theme === 'oled' && (
                <div className="w-4 h-4 rounded-full bg-accent text-accent-text-on flex items-center justify-center">
                  <Check size={10} strokeWidth={3} />
                </div>
              )}
            </div>
            <p className={`text-[11px] leading-relaxed mb-2.5 font-sans ${
              theme === 'oled' ? 'text-[#A0A0A8]' : 'text-muted'
            }`}>
              True black instrument panel styling with high-contrast amber accents.
            </p>
            <div className="flex items-center gap-1.5 mt-auto pt-2 border-t border-border/60">
              <div className="w-2.5 h-2.5 rounded-xs bg-[#000000] border border-[#232326]" />
              <div className="w-2.5 h-2.5 rounded-xs bg-[#0D0D10] border border-[#232326]" />
              <div className="w-2.5 h-2.5 rounded-xs bg-[#E8A33D]" />
              <div className="w-2.5 h-2.5 rounded-xs bg-[#F2F0EA]" />
              <span className="font-mono text-[9px] text-muted ml-auto font-medium">TRUE BLACK</span>
            </div>
          </button>

          {/* Paper Theme Option */}
          <button
            type="button"
            onClick={() => setTheme('paper')}
            aria-pressed={theme === 'paper'}
            className={`flex flex-col p-3.5 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden ${
              theme === 'paper'
                ? 'border-accent bg-[#F7F9FB] text-[#1F2E3D] shadow-md ring-1 ring-accent/40'
                : 'border-border bg-surface/70 text-text hover:border-accent/60 hover:bg-surface-elevated/80'
            }`}
          >
            <div className="flex items-center justify-between w-full mb-1.5">
              <div className={`flex items-center gap-1.5 font-mono text-xs font-bold ${
                theme === 'paper' ? 'text-[#1F2E3D]' : 'text-text'
              }`}>
                <Sun size={13} className="text-accent" />
                <span>Paper / Blueprint</span>
              </div>
              {theme === 'paper' && (
                <div className="w-4 h-4 rounded-full bg-accent text-accent-text-on flex items-center justify-center">
                  <Check size={10} strokeWidth={3} />
                </div>
              )}
            </div>
            <p className={`text-[11px] leading-relaxed mb-2.5 font-sans ${
              theme === 'paper' ? 'text-[#3E4E5C]' : 'text-muted'
            }`}>
              Drafting-table blueprint styling with pale texture and clean ink lines.
            </p>
            <div className="flex items-center gap-1.5 mt-auto pt-2 border-t border-border/60">
              <div className="w-2.5 h-2.5 rounded-xs bg-[#EDF1F5] border border-[#B7C4CE]" />
              <div className="w-2.5 h-2.5 rounded-xs bg-[#F7F9FB] border border-[#B7C4CE]" />
              <div className="w-2.5 h-2.5 rounded-xs bg-[#E8A33D]" />
              <div className="w-2.5 h-2.5 rounded-xs bg-[#1F2E3D]" />
              <span className="font-mono text-[9px] text-muted ml-auto font-medium">BLUEPRINT</span>
            </div>
          </button>
        </div>

        {/* Contrast Fine-Tuning Section */}
        <div className="pt-3 border-t border-border/50 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sliders size={13} className="text-accent" />
              <span className="text-xs font-medium text-text">Display Contrast</span>
              <span className="text-[11px] text-muted">
                ({getContrastLabel(themeContrast ?? DEFAULT_CONTRAST).label})
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-medium px-2 py-0.5 rounded-md bg-surface-elevated border border-border text-text">
                {themeContrast ?? DEFAULT_CONTRAST}%
              </span>
              {(themeContrast ?? DEFAULT_CONTRAST) !== DEFAULT_CONTRAST && (
                <button
                  type="button"
                  onClick={() => setThemeContrast(DEFAULT_CONTRAST)}
                  className="p-1 rounded-md text-muted hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
                  title="Reset to 100% standard contrast"
                  aria-label="Reset theme contrast"
                >
                  <RotateCcw size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Range Slider Track */}
          <div className="space-y-1.5">
            <div className="relative flex items-center">
              <input
                type="range"
                min={MIN_CONTRAST}
                max={MAX_CONTRAST}
                step={1}
                value={themeContrast ?? DEFAULT_CONTRAST}
                onChange={(e) => setThemeContrast(Number(e.target.value))}
                aria-label="Theme contrast level"
                className="w-full h-1.5 bg-border/60 rounded-full appearance-none cursor-pointer accent-accent focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono text-muted/70 px-0.5">
              <span>{MIN_CONTRAST}% Soft</span>
              <span className="text-muted font-medium">100% Standard</span>
              <span>{MAX_CONTRAST}% High</span>
            </div>
          </div>

          {/* Segmented Preset Selector & Live Palette Preview */}
          <div className="pt-2 border-t border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Segmented Control */}
            <div className="inline-flex p-0.5 bg-bg/80 border border-border/70 rounded-lg">
              {[
                { label: 'Soft', value: 75 },
                { label: 'Standard', value: 100 },
                { label: 'High', value: 125 },
                { label: 'Ultra', value: 140 },
              ].map((preset) => {
                const isActive = (themeContrast ?? DEFAULT_CONTRAST) === preset.value;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setThemeContrast(preset.value)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-sans transition-all cursor-pointer ${
                      isActive
                        ? 'bg-surface-elevated text-text font-medium shadow-xs border border-border/80'
                        : 'text-muted hover:text-text'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {/* Live Dynamic Swatch */}
            <div className="flex items-center gap-2 mt-2 px-1">
              <span className="text-[10px] font-mono text-muted">Palette</span>
              {(() => {
                const liveVars = computeThemeVariables(theme, themeContrast ?? DEFAULT_CONTRAST);
                return (
                  <div className="flex items-center gap-1.5 bg-bg/60 p-1 px-1.5 rounded-md border border-border/60">
                    <div 
                      className="w-3 h-3 rounded-xs border border-black/10 transition-colors"
                      style={{ backgroundColor: liveVars['--bg'] }}
                      title={`Background: ${liveVars['--bg']}`}
                    />
                    <div 
                      className="w-3 h-3 rounded-xs border border-black/10 transition-colors"
                      style={{ backgroundColor: liveVars['--surface'] }}
                      title={`Surface: ${liveVars['--surface']}`}
                    />
                    <div 
                      className="w-3 h-3 rounded-xs border border-black/10 transition-colors"
                      style={{ backgroundColor: liveVars['--border'] }}
                      title={`Border: ${liveVars['--border']}`}
                    />
                    <div 
                      className="w-3 h-3 rounded-xs border border-black/10 transition-colors"
                      style={{ backgroundColor: liveVars['--text-primary'] }}
                      title={`Ink: ${liveVars['--text-primary']}`}
                    />
                    <div 
                      className="w-3 h-3 rounded-xs border border-black/10 transition-colors"
                      style={{ backgroundColor: liveVars['--accent'] }}
                      title={`Accent: ${liveVars['--accent']}`}
                    />
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Editor Settings (Gutter & Line Numbers) */}
      <div className="rounded-xl border border-border bg-surface/30 p-4 space-y-4">
        {/* Panel Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-surface-elevated border border-border flex items-center justify-center text-accent">
              <Code2 size={15} />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-text tracking-tight">Editor Settings</h3>
              <p className="text-[11px] text-muted">Code editor display and gutter preferences</p>
            </div>
          </div>
          <span className="font-mono text-[10px] px-2 py-0.5 rounded-md bg-surface-elevated border border-border text-muted font-medium">
            Gutter: <span className="text-accent font-bold">{showLineNumbers ? 'Line Numbers On' : 'Line Numbers Off'}</span>
          </span>
        </div>

        {/* Line Numbers Preference Item */}
        <div className="flex items-center justify-between p-3 rounded-xl border border-border/70 bg-surface/50">
          <div className="space-y-0.5 pr-3">
            <div className="text-xs font-semibold text-text">Line Numbers</div>
            <p className="text-[11px] text-muted leading-relaxed font-sans">
              Show or hide line numbers in the editor gutter.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={showLineNumbers}
            onClick={() => setShowLineNumbers(!showLineNumbers)}
            aria-label="Toggle line numbers in editor gutter"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-sans font-semibold transition-colors cursor-pointer border shrink-0 ${
              showLineNumbers
                ? 'bg-accent text-accent-text-on border-accent shadow-xs'
                : 'bg-surface-elevated text-muted border-border hover:text-text'
            }`}
          >
            {showLineNumbers ? (
              <>
                <ToggleRight size={16} />
                <span>Shown</span>
              </>
            ) : (
              <>
                <ToggleLeft size={16} />
                <span>Hidden</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
