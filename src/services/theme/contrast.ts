import type { ThemeMode } from '../../store';

export interface ThemeColors {
  '--bg': string;
  '--surface': string;
  '--surface-elevated': string;
  '--border': string;
  '--accent': string;
  '--accent-text-on': string;
  '--text-primary': string;
  '--text-secondary': string;
  '--success': string;
  '--error': string;
  '--code-bg': string;
  '--grid-line': string;
  '--scanline-color': string;
}

export const CONTRAST_STORAGE_KEY = 'laide_theme_contrast';
export const DEFAULT_CONTRAST = 100;
export const MIN_CONTRAST = 60;
export const MAX_CONTRAST = 140;

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return [r, g, b];
  }
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return [r, g, b];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clampR = Math.min(255, Math.max(0, Math.round(r)));
  const clampG = Math.min(255, Math.max(0, Math.round(g)));
  const clampB = Math.min(255, Math.max(0, Math.round(b)));
  return `#${clampR.toString(16).padStart(2, '0')}${clampG.toString(16).padStart(2, '0')}${clampB.toString(16).padStart(2, '0')}`.toUpperCase();
}

export function interpolateRgb(c1: [number, number, number], c2: [number, number, number], t: number): [number, number, number] {
  const clampedT = Math.min(1, Math.max(0, t));
  return [
    c1[0] + (c2[0] - c1[0]) * clampedT,
    c1[1] + (c2[1] - c1[1]) * clampedT,
    c1[2] + (c2[2] - c1[2]) * clampedT,
  ];
}

export function getContrastLabel(contrast: number): { label: string; description: string } {
  if (contrast <= 75) {
    return { label: 'Soft / Low', description: 'Gentle, low eye-strain contrast with muted borders and relaxed ink.' };
  }
  if (contrast < 95) {
    return { label: 'Subtle', description: 'Slightly softened contrast for dimly lit environments.' };
  }
  if (contrast <= 105) {
    return { label: 'Standard', description: 'Balanced baseline contrast calibrated for OLED and Paper themes.' };
  }
  if (contrast <= 125) {
    return { label: 'High', description: 'Crisper typography and punchier border definition.' };
  }
  return { label: 'Ultra High', description: 'Maximum legibility and stark delineation between surfaces and ink.' };
}

export function computeThemeVariables(theme: ThemeMode, contrastPercent: number): ThemeColors {
  const contrast = Math.min(MAX_CONTRAST, Math.max(MIN_CONTRAST, contrastPercent));
  
  if (theme === 'oled') {
    // OLED Dark Theme Baseline
    const baseBg: [number, number, number] = [0, 0, 0]; // #000000
    const baseSurface: [number, number, number] = [13, 13, 16]; // #0D0D10
    const baseSurfaceElevated: [number, number, number] = [19, 19, 22]; // #131316
    const baseBorder: [number, number, number] = [35, 35, 38]; // #232326
    const baseTextPrimary: [number, number, number] = [242, 240, 234]; // #F2F0EA
    const baseTextSecondary: [number, number, number] = [138, 138, 143]; // #8A8A8F
    const baseCodeBg: [number, number, number] = [7, 7, 9]; // #070709

    if (contrast === 100) {
      return {
        '--bg': '#000000',
        '--surface': '#0D0D10',
        '--surface-elevated': '#131316',
        '--border': '#232326',
        '--accent': '#E8A33D',
        '--accent-text-on': '#1A1200',
        '--text-primary': '#F2F0EA',
        '--text-secondary': '#8A8A8F',
        '--success': '#3FAE68',
        '--error': '#D9584F',
        '--code-bg': '#070709',
        '--grid-line': 'rgba(35, 35, 38, 0.4)',
        '--scanline-color': 'rgba(232, 163, 61, 0.02)',
      };
    }

    if (contrast > 100) {
      // High contrast scaling (100 -> 140)
      const t = (contrast - 100) / (MAX_CONTRAST - 100);
      const surface = interpolateRgb(baseSurface, [4, 4, 6], t);
      const surfaceElevated = interpolateRgb(baseSurfaceElevated, [10, 10, 13], t);
      const border = interpolateRgb(baseBorder, [75, 75, 84], t);
      const textPrimary = interpolateRgb(baseTextPrimary, [255, 255, 255], t);
      const textSecondary = interpolateRgb(baseTextSecondary, [185, 185, 195], t);
      const codeBg = interpolateRgb(baseCodeBg, [2, 2, 4], t);

      return {
        '--bg': '#000000',
        '--surface': rgbToHex(...surface),
        '--surface-elevated': rgbToHex(...surfaceElevated),
        '--border': rgbToHex(...border),
        '--accent': '#E8A33D',
        '--accent-text-on': '#1A1200',
        '--text-primary': rgbToHex(...textPrimary),
        '--text-secondary': rgbToHex(...textSecondary),
        '--success': '#3FAE68',
        '--error': '#D9584F',
        '--code-bg': rgbToHex(...codeBg),
        '--grid-line': `rgba(45, 45, 52, ${(0.4 + t * 0.25).toFixed(2)})`,
        '--scanline-color': 'rgba(232, 163, 61, 0.02)',
      };
    } else {
      // Soft / Low contrast scaling (60 <- 100)
      const t = (100 - contrast) / (100 - MIN_CONTRAST);
      const bg = interpolateRgb(baseBg, [16, 16, 20], t);
      const surface = interpolateRgb(baseSurface, [24, 24, 29], t);
      const surfaceElevated = interpolateRgb(baseSurfaceElevated, [32, 32, 38], t);
      const border = interpolateRgb(baseBorder, [26, 26, 29], t);
      const textPrimary = interpolateRgb(baseTextPrimary, [198, 196, 190], t);
      const textSecondary = interpolateRgb(baseTextSecondary, [105, 105, 110], t);
      const codeBg = interpolateRgb(baseCodeBg, [14, 14, 18], t);

      return {
        '--bg': rgbToHex(...bg),
        '--surface': rgbToHex(...surface),
        '--surface-elevated': rgbToHex(...surfaceElevated),
        '--border': rgbToHex(...border),
        '--accent': '#E8A33D',
        '--accent-text-on': '#1A1200',
        '--text-primary': rgbToHex(...textPrimary),
        '--text-secondary': rgbToHex(...textSecondary),
        '--success': '#3FAE68',
        '--error': '#D9584F',
        '--code-bg': rgbToHex(...codeBg),
        '--grid-line': `rgba(30, 30, 34, ${(0.4 - t * 0.2).toFixed(2)})`,
        '--scanline-color': 'rgba(232, 163, 61, 0.015)',
      };
    }
  } else {
    // Paper Light Theme Baseline
    const baseBg: [number, number, number] = [237, 241, 245]; // #EDF1F5
    const baseSurface: [number, number, number] = [247, 249, 251]; // #F7F9FB
    const baseSurfaceElevated: [number, number, number] = [255, 255, 255]; // #FFFFFF
    const baseBorder: [number, number, number] = [183, 196, 206]; // #B7C4CE
    const baseTextPrimary: [number, number, number] = [31, 46, 61]; // #1F2E3D
    const baseTextSecondary: [number, number, number] = [92, 107, 120]; // #5C6B78
    const baseCodeBg: [number, number, number] = [226, 232, 238]; // #E2E8EE

    if (contrast === 100) {
      return {
        '--bg': '#EDF1F5',
        '--surface': '#F7F9FB',
        '--surface-elevated': '#FFFFFF',
        '--border': '#B7C4CE',
        '--accent': '#E8A33D',
        '--accent-text-on': '#1A1200',
        '--text-primary': '#1F2E3D',
        '--text-secondary': '#5C6B78',
        '--success': '#2A8550',
        '--error': '#C8463E',
        '--code-bg': '#E2E8EE',
        '--grid-line': '#C7D3DC',
        '--scanline-color': 'transparent',
      };
    }

    if (contrast > 100) {
      // High contrast scaling (100 -> 140)
      const t = (contrast - 100) / (MAX_CONTRAST - 100);
      const bg = interpolateRgb(baseBg, [255, 255, 255], t);
      const surface = interpolateRgb(baseSurface, [255, 255, 255], t);
      const border = interpolateRgb(baseBorder, [85, 105, 120], t);
      const textPrimary = interpolateRgb(baseTextPrimary, [0, 0, 0], t);
      const textSecondary = interpolateRgb(baseTextSecondary, [45, 56, 68], t);
      const codeBg = interpolateRgb(baseCodeBg, [242, 246, 250], t);

      return {
        '--bg': rgbToHex(...bg),
        '--surface': rgbToHex(...surface),
        '--surface-elevated': '#FFFFFF',
        '--border': rgbToHex(...border),
        '--accent': '#E8A33D',
        '--accent-text-on': '#1A1200',
        '--text-primary': rgbToHex(...textPrimary),
        '--text-secondary': rgbToHex(...textSecondary),
        '--success': '#2A8550',
        '--error': '#C8463E',
        '--code-bg': rgbToHex(...codeBg),
        '--grid-line': '#A5B7C4',
        '--scanline-color': 'transparent',
      };
    } else {
      // Soft / Low contrast scaling (60 <- 100)
      const t = (100 - contrast) / (100 - MIN_CONTRAST);
      const bg = interpolateRgb(baseBg, [222, 227, 232], t);
      const surface = interpolateRgb(baseSurface, [232, 237, 242], t);
      const surfaceElevated = interpolateRgb(baseSurfaceElevated, [242, 246, 250], t);
      const border = interpolateRgb(baseBorder, [204, 214, 222], t);
      const textPrimary = interpolateRgb(baseTextPrimary, [68, 85, 102], t);
      const textSecondary = interpolateRgb(baseTextSecondary, [120, 135, 148], t);
      const codeBg = interpolateRgb(baseCodeBg, [214, 220, 227], t);

      return {
        '--bg': rgbToHex(...bg),
        '--surface': rgbToHex(...surface),
        '--surface-elevated': rgbToHex(...surfaceElevated),
        '--border': rgbToHex(...border),
        '--accent': '#E8A33D',
        '--accent-text-on': '#1A1200',
        '--text-primary': rgbToHex(...textPrimary),
        '--text-secondary': rgbToHex(...textSecondary),
        '--success': '#2A8550',
        '--error': '#C8463E',
        '--code-bg': rgbToHex(...codeBg),
        '--grid-line': '#D8E2E9',
        '--scanline-color': 'transparent',
      };
    }
  }
}

export function applyThemeAndContrast(theme: ThemeMode, contrast: number = DEFAULT_CONTRAST): void {
  if (typeof document === 'undefined') return;

  const docEl = document.documentElement;
  docEl.setAttribute('data-theme', theme);

  const variables = computeThemeVariables(theme, contrast);
  for (const [key, value] of Object.entries(variables)) {
    docEl.style.setProperty(key, value);
  }
}
