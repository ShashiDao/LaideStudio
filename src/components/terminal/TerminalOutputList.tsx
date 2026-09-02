import React, { forwardRef } from 'react';
import type { TerminalOutputItem } from './terminalTypes';

interface TerminalOutputListProps {
  history: TerminalOutputItem[];
}

export const TerminalOutputList = forwardRef<HTMLDivElement, TerminalOutputListProps>(
  function TerminalOutputList({ history }, ref) {
    return (
      <div 
        className="flex-1 p-3 overflow-y-auto overflow-x-hidden space-y-1.5 scrollbar-thin text-xs"
        role="log"
        aria-live="polite"
      >
        {history.map((item) => {
          if (item.type === 'cmd') {
            return (
              <div key={item.id} className="flex items-start gap-1.5 pt-1 text-xs">
                <span className="text-moss font-semibold shrink-0">dev@laide</span>
                <span className="text-muted shrink-0">:</span>
                <span className="text-accent font-semibold shrink-0">{item.cwd || '~'}$</span>
                <span className="text-text font-bold break-all">{item.text}</span>
              </div>
            );
          }

          if (item.type === 'stderr') {
            return (
              <div key={item.id} className="text-oxide/90 whitespace-pre-wrap font-mono text-[11px] pl-2 border-l-2 border-oxide/40 break-words">
                {item.text}
              </div>
            );
          }

          if (item.type === 'success') {
            return (
              <div key={item.id} className="text-moss whitespace-pre-wrap font-mono text-[11px] pl-2 border-l-2 border-moss/50 break-words">
                {item.text}
              </div>
            );
          }

          if (item.type === 'info') {
            return (
              <div key={item.id} className="text-accent/90 whitespace-pre-wrap font-mono text-[11px] pl-2 border-l-2 border-accent/40 break-words">
                {item.text}
              </div>
            );
          }

          if (item.type === 'system') {
            return (
              <div key={item.id} className="p-2.5 rounded bg-surface border border-border/80 text-muted text-[11px] whitespace-pre-wrap font-mono leading-relaxed">
                {item.text}
              </div>
            );
          }

          return (
            <div key={item.id} className="text-text/90 whitespace-pre-wrap font-mono text-[11px] break-words">
              {item.text}
            </div>
          );
        })}
        <div ref={ref} />
      </div>
    );
  }
);
