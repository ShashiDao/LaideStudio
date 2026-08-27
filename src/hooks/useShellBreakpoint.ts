import { useState, useEffect, useRef } from 'react';

export type ShellBreakpoint = 'phone' | 'tablet' | 'desktop';

const getBreakpointForWidth = (width: number, current?: ShellBreakpoint): ShellBreakpoint => {
  // Hysteresis dead-band (±8px) to prevent rapid oscillation when resizing right around boundaries
  if (current === 'phone') {
    if (width >= 708) {
      return width >= 1208 ? 'desktop' : 'tablet';
    }
    return 'phone';
  }
  if (current === 'tablet') {
    if (width < 692) return 'phone';
    if (width >= 1208) return 'desktop';
    return 'tablet';
  }
  if (current === 'desktop') {
    if (width < 692) return 'phone';
    if (width < 1192) return 'tablet';
    return 'desktop';
  }

  // Initial calculation
  if (width < 700) return 'phone';
  if (width < 1200) return 'tablet';
  return 'desktop';
};

/**
 * Measures the shell container's own width and returns 'phone' (<700px), 'tablet' (700-1199px), or 'desktop' (>=1200px).
 * Lazily initialized from window.innerWidth on first paint.
 */
export function useShellBreakpoint(containerRef?: React.RefObject<HTMLElement | null>) {
  const [breakpoint, setBreakpoint] = useState<ShellBreakpoint>(() => {
    if (typeof window !== 'undefined') {
      const initialWidth = window.innerWidth;
      return getBreakpointForWidth(initialWidth);
    }
    return 'phone';
  });

  const currentBpRef = useRef<ShellBreakpoint>(breakpoint);

  useEffect(() => {
    currentBpRef.current = breakpoint;
  }, [breakpoint]);

  useEffect(() => {
    const targetElement = containerRef?.current || (typeof document !== 'undefined' ? document.documentElement : null);
    if (!targetElement) return;

    let rafId: number | null = null;

    const updateBreakpoint = (width: number) => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const nextBp = getBreakpointForWidth(width, currentBpRef.current);
        if (nextBp !== currentBpRef.current) {
          setBreakpoint(nextBp);
        }
      });
    };

    // Initial measure
    const rect = targetElement.getBoundingClientRect();
    if (rect.width > 0) {
      updateBreakpoint(rect.width);
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width || entry.target.getBoundingClientRect().width;
        if (width > 0) {
          updateBreakpoint(width);
        }
      }
    });

    observer.observe(targetElement);

    return () => {
      observer.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [containerRef]);

  return breakpoint;
}
