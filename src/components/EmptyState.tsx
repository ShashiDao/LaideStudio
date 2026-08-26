import React from 'react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  badge?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  variant?: 'default' | 'card' | 'subtle';
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  badge,
  children,
  className = '',
  variant = 'default'
}: EmptyStateProps) {
  const containerClasses = {
    default: 'border border-border bg-surface/70 rounded-xl p-6 max-w-sm w-full shadow-xs corner-ticks',
    card: 'border border-border/80 bg-surface-elevated/40 rounded-lg p-5 max-w-sm w-full shadow-xs',
    subtle: 'border border-dashed border-border/70 bg-surface/30 rounded-lg p-5 max-w-sm w-full'
  }[variant];

  return (
    <div className={`flex flex-col items-center justify-center text-center p-4 w-full ${className}`}>
      <div className={`${containerClasses} flex flex-col items-center text-center`}>
        {icon && (
          <div className="w-10 h-10 rounded-lg bg-surface-elevated border border-accent/40 flex items-center justify-center text-accent mb-3 shadow-xs shrink-0">
            {icon}
          </div>
        )}

        {badge && (
          <div className="font-mono text-[10px] text-accent tracking-wider uppercase mb-1.5 font-semibold">
            {badge}
          </div>
        )}

        <h3 className="text-text font-mono text-xs font-bold mb-1 leading-snug">
          {title}
        </h3>

        {description && (
          <div className="text-muted font-sans text-xs max-w-[280px] leading-relaxed mb-0 text-center">
            {description}
          </div>
        )}

        {action && (
          <div className="mt-4 w-full flex flex-col sm:flex-row items-center justify-center gap-2">
            {action}
          </div>
        )}

        {children && (
          <div className="mt-4 w-full">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
