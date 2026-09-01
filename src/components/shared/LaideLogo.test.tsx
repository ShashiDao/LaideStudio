// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { LaideLogo } from './LaideLogo';

describe('LaideLogo component', () => {
  it('renders SVG with default attributes and accessibility label', () => {
    render(<LaideLogo data-testid="laide-logo" />);
    const svg = screen.getByTestId('laide-logo');
    expect(svg).toBeDefined();
    expect(svg.getAttribute('viewBox')).toBe('0 0 512 512');
    expect(svg.getAttribute('aria-label')).toBe('LAIDE Studio Logo');
  });

  it('supports custom dimensions and classNames', () => {
    render(<LaideLogo size={36} className="custom-test-class" data-testid="custom-logo" />);
    const svg = screen.getByTestId('custom-logo');
    expect(svg.getAttribute('width')).toBe('36');
    expect(svg.getAttribute('height')).toBe('36');
    expect(svg.getAttribute('class')).toContain('custom-test-class');
  });

  it('renders without outer dark background when withBackground is false', () => {
    const { container } = render(<LaideLogo withBackground={false} />);
    const rects = container.querySelectorAll('rect');
    expect(rects.length).toBe(0); // no background rect
  });
});
