import React from 'react';
import { 
  FileText, 
  MessageSquare, 
  MonitorPlay, 
  Terminal as TerminalIcon, 
  Settings as SettingsIcon 
} from 'lucide-react';
import type { TabId } from '../store';

interface ActivityRailProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  unreadCount?: number;
}

export function ActivityRail({ activeTab, onSelectTab }: ActivityRailProps) {
  const navItems: { id: TabId; label: string; icon: React.ReactNode; shortcut: string }[] = [
    { id: 'files', label: 'Files', icon: <FileText size={18} strokeWidth={2} />, shortcut: 'Ctrl+1' },
    { id: 'chat', label: 'Chat', icon: <MessageSquare size={18} strokeWidth={2} />, shortcut: 'Ctrl+2' },
    { id: 'preview', label: 'Preview', icon: <MonitorPlay size={18} strokeWidth={2} />, shortcut: 'Ctrl+3' },
    { id: 'terminal', label: 'Terminal', icon: <TerminalIcon size={18} strokeWidth={2} />, shortcut: 'Ctrl+4' },
    { id: 'settings', label: 'Settings', icon: <SettingsIcon size={18} strokeWidth={2} />, shortcut: 'Ctrl+5' },
  ];

  return (
    <nav 
      aria-label="Activity Rail"
      className="w-[46px] shrink-0 bg-surface border-r border-border flex flex-col items-center py-2 select-none z-10"
    >
      <div className="flex flex-col items-center gap-1.5 w-full">
        {navItems.map(item => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-label={`${item.label} (${item.shortcut})`}
              aria-selected={isActive}
              title={`${item.label} (${item.shortcut})`}
              className={`relative flex items-center justify-center w-8 h-8 rounded-md transition-colors cursor-pointer active:scale-95 ${
                isActive 
                  ? 'bg-accent/15 text-accent border border-accent/40 font-medium' 
                  : 'text-muted hover:text-text hover:bg-surface-elevated border border-transparent'
              }`}
            >
              {isActive && (
                <div className="absolute -left-[7px] top-1.5 bottom-1.5 w-[3px] bg-accent rounded-r" />
              )}
              {item.icon}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
