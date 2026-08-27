import React from 'react';
import { Keyboard, X, Command } from 'lucide-react';

export interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  keys: string[];
  description: string;
  category: 'Navigation & Views' | 'Files & Search' | 'Terminal & Actions';
}

const SHORTCUTS: ShortcutItem[] = [
  // Navigation & Views
  { keys: ['Ctrl', 'B'], description: 'Toggle / Switch to Files (FileTree) tab', category: 'Navigation & Views' },
  { keys: ['Ctrl', '`'], description: 'Toggle / Switch to Terminal tab', category: 'Navigation & Views' },
  { keys: ['Ctrl', '1'], description: 'Switch to Files tab', category: 'Navigation & Views' },
  { keys: ['Ctrl', '2'], description: 'Switch to Chat tab', category: 'Navigation & Views' },
  { keys: ['Ctrl', '3'], description: 'Switch to Preview tab', category: 'Navigation & Views' },
  { keys: ['Ctrl', '4'], description: 'Switch to Terminal tab', category: 'Navigation & Views' },
  { keys: ['Ctrl', '5'], description: 'Switch to Settings tab', category: 'Navigation & Views' },
  { keys: ['Ctrl', 'Shift', 'P'], description: 'Switch to Preview tab', category: 'Navigation & Views' },

  // Files & Search
  { keys: ['Ctrl', 'Shift', 'F'], description: 'Project-wide search (Find in files)', category: 'Files & Search' },
  { keys: ['Ctrl', 'P'], description: 'Quick open & focus file search', category: 'Files & Search' },
  { keys: ['/'], description: 'Focus file search (when not editing text)', category: 'Files & Search' },
  { keys: ['Ctrl', 'F'], description: 'Find text in currently open file', category: 'Files & Search' },
  { keys: ['Ctrl', 'H'], description: 'Find & Replace in currently open file', category: 'Files & Search' },
  { keys: ['Ctrl', 'S'], description: 'Save current active file in editor', category: 'Files & Search' },
  { keys: ['Esc'], description: 'Close editor / clear search filter / dismiss modal', category: 'Files & Search' },

  // Terminal & Actions
  { keys: ['Ctrl', 'L'], description: 'Clear terminal screen (in Terminal)', category: 'Terminal & Actions' },
  { keys: ['Ctrl', 'T'], description: 'Toggle OLED / Paper theme', category: 'Terminal & Actions' },
  { keys: ['Ctrl', 'Shift', 'L'], description: 'Lock workspace vault', category: 'Terminal & Actions' },
  { keys: ['Ctrl', '?'], description: 'Show keyboard shortcuts cheat sheet', category: 'Terminal & Actions' },
];

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  if (!isOpen) return null;

  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  const categories: Array<ShortcutItem['category']> = [
    'Navigation & Views',
    'Files & Search',
    'Terminal & Actions'
  ];

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-modal-title"
    >
      <div 
        className="bg-surface border border-border rounded-xl max-w-md w-full p-5 shadow-2xl flex flex-col gap-4 font-sans text-left corner-ticks overflow-hidden max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div className="flex items-center gap-2.5 text-accent">
            <div className="p-1.5 bg-surface-elevated border border-accent/40 rounded-lg text-accent shadow-xs">
              <Keyboard size={18} />
            </div>
            <div>
              <h2 id="shortcuts-modal-title" className="text-sm font-mono font-bold text-text flex items-center gap-1.5">
                Keyboard Shortcuts
              </h2>
              <p className="text-[10px] font-mono text-muted">
                {isMac ? 'Use ⌘ (Cmd) or Ctrl interchangeably' : 'Global accelerator hotkeys'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close shortcuts dialog"
            className="p-1 text-muted hover:text-text rounded-md hover:bg-surface-elevated transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Shortcut Groups */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-4 font-mono text-xs scrollbar-thin">
          {categories.map((cat) => {
            const items = SHORTCUTS.filter(s => s.category === cat);
            return (
              <div key={cat} className="space-y-1.5">
                <div className="text-[10px] font-bold text-accent/80 uppercase tracking-wider px-1">
                  {cat}
                </div>
                <div className="bg-bg/60 border border-border/70 rounded-lg divide-y divide-border/40 overflow-hidden">
                  {items.map((item, idx) => (
                    <div 
                      key={idx} 
                      className="px-3 py-2 flex items-center justify-between gap-3 hover:bg-surface-elevated/40 transition-colors"
                    >
                      <span className="text-text/90 text-[11px] min-w-0 flex-1 leading-snug">
                        {item.description}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        {item.keys.map((k, kIdx) => (
                          <React.Fragment key={kIdx}>
                            <kbd className="px-1.5 py-0.5 min-w-[20px] text-center font-mono text-[10px] font-bold bg-surface-elevated border border-border text-accent rounded shadow-xs">
                              {k === 'Ctrl' && isMac ? '⌘' : k}
                            </kbd>
                            {kIdx < item.keys.length - 1 && (
                              <span className="text-muted/60 text-[10px]">+</span>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer info note */}
        <div className="pt-2 border-t border-border flex items-center justify-between text-[10px] font-mono text-muted">
          <div className="flex items-center gap-1.5">
            <Command size={12} className="text-accent" />
            <span>Press <kbd className="px-1 bg-surface-elevated rounded border border-border text-text">Esc</kbd> or <kbd className="px-1 bg-surface-elevated rounded border border-border text-text">Ctrl+?</kbd> anytime to toggle</span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-accent text-accent-text-on rounded font-bold font-mono text-[10px] hover:bg-accent/90 transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
