import { createTheme } from '@mui/material';
import type { TimeBlock } from './lib/planner';

// Colours from the SmartSched Design System (claude.ai artifact H26gba4SHVVFMc19hS5cWo, tokens.json), plus a dark
// version of each and a choice of accent. Pages use `colors.*`, which are CSS variables, so switching light/dark
// or the accent repaints everything at once; the actual values are set on :root by AppearanceProvider.
//
// accent500 is only for text at 24px+ (wordmark, greeting, page titles); smaller accent text and buttons use
// accent600. Text on an accent600 background uses `surface`, which flips to dark in dark mode.

export const ACCENTS = ['violet', 'blue', 'teal', 'green', 'rose', 'orange'] as const;
export type Accent = (typeof ACCENTS)[number];
export type ColorMode = 'light' | 'dark';

export const ACCENT_LABELS: Record<Accent, string> = {
  violet: 'Violet',
  blue: 'Blue',
  teal: 'Teal',
  green: 'Green',
  rose: 'Rose',
  orange: 'Orange',
};

// Per accent: soft tint, tint border, fill (progress), title (3:1 on white), strong (4.5:1 on white, and under
// white text), ink (text on the soft tint), and the light shades dark mode uses for text.
const SCALES: Record<Accent, { s100: string; s200: string; s400: string; title: string; strong: string; ink: string; l300: string; l200: string }> = {
  violet: { s100: '#f3e8ff', s200: '#e9d5ff', s400: '#a78bfa', title: '#8b5cf6', strong: '#7c3aed', ink: '#5b21b6', l300: '#c4b5fd', l200: '#ddd6fe' },
  blue: { s100: '#dbeafe', s200: '#bfdbfe', s400: '#60a5fa', title: '#3b82f6', strong: '#2563eb', ink: '#1e40af', l300: '#93c5fd', l200: '#bfdbfe' },
  teal: { s100: '#ccfbf1', s200: '#99f6e4', s400: '#2dd4bf', title: '#0d9488', strong: '#0f766e', ink: '#134e4a', l300: '#5eead4', l200: '#99f6e4' },
  green: { s100: '#dcfce7', s200: '#bbf7d0', s400: '#4ade80', title: '#16a34a', strong: '#15803d', ink: '#14532d', l300: '#86efac', l200: '#bbf7d0' },
  rose: { s100: '#ffe4e6', s200: '#fecdd3', s400: '#fb7185', title: '#f43f5e', strong: '#e11d48', ink: '#9f1239', l300: '#fda4af', l200: '#fecdd3' },
  orange: { s100: '#ffedd5', s200: '#fed7aa', s400: '#fb923c', title: '#ea580c', strong: '#c2410c', ink: '#9a3412', l300: '#fdba74', l200: '#fed7aa' },
};

const LIGHT_NEUTRALS = {
  surface: '#ffffff',
  surfaceMuted: '#f3f4f6',
  textPrimary: 'rgba(0, 0, 0, 0.87)',
  textSecondary: 'rgba(0, 0, 0, 0.6)',
  grey500: '#6b7280',
  grey200: '#e5e7eb',
  successBg: '#d1fae5',
  successInk: '#065f46',
  infoBg: '#dbeafe',
  infoBorder: '#bfdbfe',
  infoInk: '#1e40af',
  warningBg: '#fef3c7',
  warningInk: '#92400e',
  error: '#dc2626',
  shadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
};

const NEUTRALS: Record<ColorMode, typeof LIGHT_NEUTRALS> = {
  light: LIGHT_NEUTRALS,
  dark: {
    surface: '#17151c',
    surfaceMuted: '#221f2a',
    textPrimary: 'rgba(255, 255, 255, 0.92)',
    textSecondary: 'rgba(255, 255, 255, 0.66)',
    grey500: '#9ca3af',
    grey200: '#322e3b',
    successBg: '#052e16',
    successInk: '#86efac',
    infoBg: '#172554',
    infoBorder: '#1e3a8a',
    infoInk: '#bfdbfe',
    warningBg: '#422006',
    warningInk: '#fde68a',
    error: '#f87171',
    shadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
  },
};

// a mixed toward b by t (0..1), for dark tints of an accent.
function mix(a: string, b: string, t: number) {
  const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [ca, cb] = [channels(a), channels(b)];
  return `#${ca.map((v, i) => Math.round(v + (cb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

// Every token's real value for one mode and accent.
export function resolveColors(mode: ColorMode, accent: Accent) {
  const n = NEUTRALS[mode];
  const a = SCALES[accent] ?? SCALES.violet;
  const accentTokens =
    mode === 'light'
      ? { accent100: a.s100, accent200: a.s200, accent400: a.s400, accent500: a.title, accent600: a.strong, accent800: a.ink }
      : {
          accent100: mix(n.surface, a.title, 0.2),
          accent200: mix(n.surface, a.title, 0.4),
          accent400: a.s400,
          accent500: a.l300,
          accent600: a.l300,
          accent800: a.l200,
        };
  return { ...n, ...accentTokens };
}

type Token = keyof ReturnType<typeof resolveColors>;
const variable = (token: Token) => `var(--ss-${token})`;

// The CSS variables, as set on :root.
export function cssVariables(mode: ColorMode, accent: Accent) {
  return Object.fromEntries(Object.entries(resolveColors(mode, accent)).map(([k, v]) => [`--ss-${k}`, v]));
}

export const colors = {
  surface: variable('surface'),
  surfaceMuted: variable('surfaceMuted'),
  textPrimary: variable('textPrimary'),
  textSecondary: variable('textSecondary'),
  grey500: variable('grey500'),
  grey200: variable('grey200'),
  accent100: variable('accent100'),
  accent200: variable('accent200'),
  accent400: variable('accent400'),
  accent500: variable('accent500'),
  accent600: variable('accent600'),
  accent800: variable('accent800'),
  successBg: variable('successBg'),
  successInk: variable('successInk'),
  infoBg: variable('infoBg'),
  infoBorder: variable('infoBorder'),
  infoInk: variable('infoInk'),
  warningBg: variable('warningBg'),
  warningInk: variable('warningInk'),
  error: variable('error'),
  shadow: variable('shadow'),
  // The same in both modes, so these stay plain hex (and can take an alpha suffix).
  pink500: '#ec4899',
  success: '#10b981',
  info: '#3b82f6',
  warning: '#fbbf24',
  amber500: '#f59e0b',
};

// `color` at `percent` opacity; works on the CSS variables above as well as hex.
export function withAlpha(color: string, percent: number) {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

// One colour per planner block type (cat-* tokens). Class, study and task are close in hue, so blocks
// always carry their title as text too. These stay fixed whatever the accent.
export const CATEGORY_COLORS: Record<TimeBlock['type'], string> = {
  class: colors.info,
  study: '#8b5cf6',
  break: colors.success,
  personal: colors.pink500,
  commute: colors.amber500,
  meal: '#06b6d4',
  work: '#64748b',
  task: '#4f46e5',
};

export const CATEGORY_LABELS: Record<TimeBlock['type'], string> = {
  class: 'Class',
  study: 'Study',
  task: 'Task',
  work: 'Work',
  meal: 'Meal',
  break: 'Break',
  personal: 'Personal',
  commute: 'Commute',
};

export function categoryColor(type: string) {
  return CATEGORY_COLORS[type as TimeBlock['type']] ?? '#6b7280';
}

const fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif';

// MUI needs real colour values for its palette (it works out hover and contrast shades from them).
export function createAppTheme(mode: ColorMode, accent: Accent) {
  const c = resolveColors(mode, accent);
  return createTheme({
    palette: {
      mode,
      primary: {
        main: c.accent600,
        light: c.accent400,
        dark: mode === 'light' ? c.accent800 : c.accent200,
        contrastText: c.surface,
      },
      secondary: { main: colors.pink500 },
      success: { main: colors.success, contrastText: '#ffffff' },
      info: { main: colors.info },
      warning: { main: colors.warning },
      error: { main: c.error },
      text: { primary: c.textPrimary, secondary: c.textSecondary },
      divider: c.grey200,
      background: { default: c.surface, paper: c.surface },
    },
    typography: {
      fontFamily,
      // display: the Home greeting
      h3: { fontSize: '3rem', fontWeight: 700, lineHeight: 1.167 },
      // title-lg: survey title
      h4: { fontSize: '2.125rem', fontWeight: 700, lineHeight: 1.235 },
      // title: page titles
      h5: { fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.334 },
      // subtitle: date lines and panel headings
      h6: { fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.6 },
      button: { fontSize: '0.875rem', fontWeight: 600, textTransform: 'none' },
    },
    shape: { borderRadius: 12 },
    components: {
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { borderRadius: 12 } },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 16,
            border: `1px solid ${c.grey200}`,
            boxShadow: c.shadow,
            backgroundImage: 'none',
          },
        },
      },
      MuiPaper: { styleOverrides: { rounded: { borderRadius: 16 }, root: { backgroundImage: 'none' } } },
      MuiAlert: { styleOverrides: { root: { borderRadius: 12 } } },
      MuiChip: { styleOverrides: { root: { borderRadius: 12, fontWeight: 600 } } },
      MuiToggleButton: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } },
      // Toasts sit above the phone tab bar instead of covering it.
      MuiSnackbar: {
        styleOverrides: { root: { '@media (max-width: 599.95px)': { bottom: 88 } } },
      },
      MuiDialog: { styleOverrides: { paper: { borderRadius: 16 } } },
      MuiMenu: { styleOverrides: { paper: { borderRadius: 12, border: `1px solid ${c.grey200}` } } },
      MuiCssBaseline: {
        styleOverrides: {
          ':root': { ...cssVariables(mode, accent), colorScheme: mode },
          body: { transition: 'background-color 0.2s ease, color 0.2s ease' },
          '@media (prefers-reduced-motion: reduce)': {
            '*, *::before, *::after': { animationDuration: '0.01ms !important', transitionDuration: '0.01ms !important' },
          },
          '@keyframes pageIn': {
            from: { opacity: 0, transform: 'translateY(6px)' },
            to: { opacity: 1, transform: 'none' },
          },
        },
      },
    },
  });
}

// The default look, for code that only needs breakpoints or the like outside a provider.
export const theme = createAppTheme('light', 'violet');
