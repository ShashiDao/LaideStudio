// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { 
  hexToRgb, 
  rgbToHex, 
  interpolateRgb, 
  computeThemeVariables, 
  applyThemeAndContrast,
  getContrastLabel,
  DEFAULT_CONTRAST,
  MIN_CONTRAST,
  MAX_CONTRAST
} from './contrast';

describe('Theme Contrast Utility', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('style');
  });

  describe('Color Math Helpers', () => {
    it('converts hex to rgb and back accurately', () => {
      expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
      expect(hexToRgb('#FFFFFF')).toEqual([255, 255, 255]);
      expect(hexToRgb('#E8A33D')).toEqual([232, 163, 61]);
      expect(hexToRgb('#FFF')).toEqual([255, 255, 255]);

      expect(rgbToHex(0, 0, 0)).toBe('#000000');
      expect(rgbToHex(255, 255, 255)).toBe('#FFFFFF');
      expect(rgbToHex(232, 163, 61)).toBe('#E8A33D');
    });

    it('interpolates RGB colors linearly and clamps bounds', () => {
      const black: [number, number, number] = [0, 0, 0];
      const white: [number, number, number] = [200, 200, 200];

      expect(interpolateRgb(black, white, 0)).toEqual([0, 0, 0]);
      expect(interpolateRgb(black, white, 0.5)).toEqual([100, 100, 100]);
      expect(interpolateRgb(black, white, 1)).toEqual([200, 200, 200]);
      expect(interpolateRgb(black, white, 1.5)).toEqual([200, 200, 200]);
    });
  });

  describe('Contrast Labels & Presets', () => {
    it('returns appropriate human labels for contrast levels', () => {
      expect(getContrastLabel(65).label).toBe('Soft / Low');
      expect(getContrastLabel(85).label).toBe('Subtle');
      expect(getContrastLabel(100).label).toBe('Standard');
      expect(getContrastLabel(115).label).toBe('High');
      expect(getContrastLabel(135).label).toBe('Ultra High');
    });
  });

  describe('computeThemeVariables', () => {
    it('returns pristine default variables at DEFAULT_CONTRAST (100%) for OLED', () => {
      const vars = computeThemeVariables('oled', DEFAULT_CONTRAST);
      expect(vars['--bg']).toBe('#000000');
      expect(vars['--surface']).toBe('#0D0D10');
      expect(vars['--border']).toBe('#232326');
      expect(vars['--text-primary']).toBe('#F2F0EA');
    });

    it('returns pristine default variables at DEFAULT_CONTRAST (100%) for Paper', () => {
      const vars = computeThemeVariables('paper', DEFAULT_CONTRAST);
      expect(vars['--bg']).toBe('#EDF1F5');
      expect(vars['--surface']).toBe('#F7F9FB');
      expect(vars['--border']).toBe('#B7C4CE');
      expect(vars['--text-primary']).toBe('#1F2E3D');
    });

    it('produces higher contrast text and sharper borders when contrast > 100%', () => {
      const oledHigh = computeThemeVariables('oled', 140);
      expect(oledHigh['--bg']).toBe('#000000');
      expect(oledHigh['--text-primary']).toBe('#FFFFFF'); // stark pure white
      // Borders in high contrast should have higher RGB than baseline #232326 (35,35,38)
      const borderRgb = hexToRgb(oledHigh['--border']);
      expect(borderRgb[0]).toBeGreaterThan(35);

      const paperHigh = computeThemeVariables('paper', 140);
      expect(paperHigh['--text-primary']).toBe('#000000'); // deep ink black
      const paperBorderRgb = hexToRgb(paperHigh['--border']);
      expect(paperBorderRgb[0]).toBeLessThan(183); // darker border
    });

    it('produces softer text and warmer surfaces when contrast < 100%', () => {
      const oledSoft = computeThemeVariables('oled', 60);
      const bgRgb = hexToRgb(oledSoft['--bg']);
      expect(bgRgb[0]).toBeGreaterThan(0); // slightly lifted dark background

      const paperSoft = computeThemeVariables('paper', 60);
      const textRgb = hexToRgb(paperSoft['--text-primary']);
      expect(textRgb[0]).toBeGreaterThan(31); // slightly softer ink
    });

    it('clamps contrast between MIN_CONTRAST and MAX_CONTRAST', () => {
      const belowMin = computeThemeVariables('oled', 10);
      const atMin = computeThemeVariables('oled', MIN_CONTRAST);
      expect(belowMin).toEqual(atMin);

      const aboveMax = computeThemeVariables('paper', 300);
      const atMax = computeThemeVariables('paper', MAX_CONTRAST);
      expect(aboveMax).toEqual(atMax);
    });
  });

  describe('applyThemeAndContrast', () => {
    it('sets data-theme and custom CSS properties directly on documentElement', () => {
      applyThemeAndContrast('oled', 120);

      expect(document.documentElement.getAttribute('data-theme')).toBe('oled');
      expect(document.documentElement.style.getPropertyValue('--bg')).toBe('#000000');
      expect(document.documentElement.style.getPropertyValue('--text-primary')).toBeTruthy();
      expect(document.documentElement.style.getPropertyValue('--border')).toBeTruthy();

      applyThemeAndContrast('paper', 90);
      expect(document.documentElement.getAttribute('data-theme')).toBe('paper');
      expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#E8A33D');
    });
  });
});
