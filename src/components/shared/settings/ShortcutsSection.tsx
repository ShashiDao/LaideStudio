import React, { useState } from 'react';
import { Keyboard, ExternalLink, ChevronDown } from 'lucide-react';

interface ShortcutsSectionProps {
  onOpenShortcuts?: () => void;
}

export function ShortcutsSection({ onOpenShortcuts }: ShortcutsSectionProps) {
  const [isShortcutsDropdownOpen, setIsShortcutsDropdownOpen] = useState(false);

  return (
    <div className="bg-surface/50 border border-border rounded-xl overflow-hidden transition-all">
      <button
        type="button"
        onClick={() => setIsShortcutsDropdownOpen(!isShortcutsDropdownOpen)}
        aria-expanded={isShortcutsDropdownOpen}
        aria-controls="keyboard-shortcuts-dropdown"
        className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-surface-elevated/40 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-surface-elevated border border-border flex items-center justify-center text-accent shrink-0">
            <Keyboard size={16} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-text tracking-tight">Keyboard Shortcuts</h3>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-elevated border border-border text-muted">
                6 hotkeys
              </span>
            </div>
            <p className="text-[11px] text-muted truncate">
              {isShortcutsDropdownOpen ? 'Global accelerator hotkeys & keybindings' : 'Click to view accelerator shortcuts'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {onOpenShortcuts && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onOpenShortcuts();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  onOpenShortcuts();
                }
              }}
              className="hidden xs:flex text-[11px] font-sans text-accent hover:underline items-center gap-1 cursor-pointer p-1"
              title="Open full shortcuts cheat sheet modal"
            >
              <span>View All</span>
              <ExternalLink size={11} />
            </span>
          )}
          <div className={`p-1 rounded-md text-muted hover:text-text transition-transform duration-200 ${isShortcutsDropdownOpen ? 'rotate-180 text-accent' : ''}`}>
            <ChevronDown size={16} />
          </div>
        </div>
      </button>

      {/* Dropdown Content */}
      {isShortcutsDropdownOpen && (
        <div id="keyboard-shortcuts-dropdown" className="px-4 pb-4 sm:px-5 sm:pb-5 pt-0 border-t border-border/40 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center justify-between pt-3 mb-3 text-xs text-muted font-sans leading-relaxed">
            <p className="text-[11px]">
              Speed up your workflow with global accelerator hotkeys. On macOS, use <kbd className="px-1 py-0.2 rounded bg-surface border border-border text-[10px] font-mono text-text">⌘ Command</kbd> instead of <kbd className="px-1 py-0.2 rounded bg-surface border border-border text-[10px] font-mono text-text">Ctrl</kbd>.
            </p>
            {onOpenShortcuts && (
              <button
                type="button"
                onClick={onOpenShortcuts}
                className="xs:hidden text-[11px] font-sans text-accent hover:underline flex items-center gap-1 cursor-pointer shrink-0 ml-2"
              >
                <span>View All</span>
                <ExternalLink size={11} />
              </button>
            )}
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="flex items-center justify-between bg-bg/80 border border-border/80 px-2.5 py-1.5 rounded-lg">
                <span className="text-muted text-[11px]">Toggle Files tab</span>
                <kbd className="px-1.5 py-0.5 text-[10px] font-bold bg-surface border border-border text-accent rounded">Ctrl+B</kbd>
              </div>
              <div className="flex items-center justify-between bg-bg/80 border border-border/80 px-2.5 py-1.5 rounded-lg">
                <span className="text-muted text-[11px]">Toggle Terminal</span>
                <kbd className="px-1.5 py-0.5 text-[10px] font-bold bg-surface border border-border text-accent rounded">Ctrl+`</kbd>
              </div>
              <div className="flex items-center justify-between bg-bg/80 border border-border/80 px-2.5 py-1.5 rounded-lg">
                <span className="text-muted text-[11px]">Quick Open & Search</span>
                <kbd className="px-1.5 py-0.5 text-[10px] font-bold bg-surface border border-border text-accent rounded">Ctrl+P</kbd>
              </div>
              <div className="flex items-center justify-between bg-bg/80 border border-border/80 px-2.5 py-1.5 rounded-lg">
                <span className="text-muted text-[11px]">Find in File</span>
                <kbd className="px-1.5 py-0.5 text-[10px] font-bold bg-surface border border-border text-accent rounded">Ctrl+F</kbd>
              </div>
              <div className="flex items-center justify-between bg-bg/80 border border-border/80 px-2.5 py-1.5 rounded-lg">
                <span className="text-muted text-[11px]">Open Preview</span>
                <kbd className="px-1.5 py-0.5 text-[10px] font-bold bg-surface border border-border text-accent rounded">Ctrl+Shift+P</kbd>
              </div>
              <div className="flex items-center justify-between bg-bg/80 border border-border/80 px-2.5 py-1.5 rounded-lg">
                <span className="text-muted text-[11px]">Lock Vault</span>
                <kbd className="px-1.5 py-0.5 text-[10px] font-bold bg-surface border border-border text-accent rounded">Ctrl+Shift+L</kbd>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
