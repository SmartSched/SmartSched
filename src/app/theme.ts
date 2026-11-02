import { createTheme } from '@mui/material';
import type { TimeBlock } from './lib/planner';

// Colours from the SmartSched Design System (claude.ai artifact H26gba4SHVVFMc19hS5cWo, tokens.json).
// violet500 is 4.2:1 on white: only for text at 24px+ (wordmark, greeting, page titles). Smaller violet
// text and buttons with white labels use violet600.
export const colors = {
  surface: '#ffffff',
  surfaceMuted: '#f3f4f6',
  textPrimary: 'rgba(0, 0, 0, 0.87)',
  textSecondary: 'rgba(0, 0, 0, 0.6)',
  grey500: '#6b7280',
  grey200: '#e5e7eb',
  violet100: '#f3e8ff',
  violet200: '#e9d5ff',
  violet400: '#a78bfa',
  violet500: '#8b5cf6',
  violet600: '#7c3aed',
  violet800: '#5b21b6',
  pink500: '#ec4899',
  success: '#10b981',
  successBg: '#d1fae5',
  successInk: '#065f46',
  info: '#3b82f6',
  infoBg: '#dbeafe',
  infoBorder: '#bfdbfe',
  infoInk: '#1e40af',
  warning: '#fbbf24',
  amber500: '#f59e0b',
  warningBg: '#fef3c7',
  warningInk: '#92400e',
  error: '#dc2626',
};

// One colour per planner block type (cat-* tokens). Class, study and task are close in hue, so blocks
// always carry their title as text too.
export const CATEGORY_COLORS: Record<TimeBlock['type'], string> = {
  class: colors.info,
  study: colors.violet500,
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
  return CATEGORY_COLORS[type as TimeBlock['type']] ?? colors.grey500;
}

const fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif';

export const theme = createTheme({
  palette: {
    primary: { main: colors.violet600, light: colors.violet400, dark: colors.violet800, contrastText: '#ffffff' },
    secondary: { main: colors.pink500 },
    success: { main: colors.success, contrastText: '#ffffff' },
    info: { main: colors.info },
    warning: { main: colors.warning },
    error: { main: colors.error },
    text: { primary: colors.textPrimary, secondary: colors.textSecondary },
    divider: colors.grey200,
    background: { default: colors.surface, paper: colors.surface },
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
          border: `1px solid ${colors.grey200}`,
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
        },
      },
    },
    MuiPaper: { styleOverrides: { rounded: { borderRadius: 16 } } },
    MuiAlert: { styleOverrides: { root: { borderRadius: 12 } } },
    MuiChip: { styleOverrides: { root: { borderRadius: 12, fontWeight: 600 } } },
    MuiToggleButton: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } },
    // Toasts sit above the phone tab bar instead of covering it.
    MuiSnackbar: {
      styleOverrides: { root: { '@media (max-width: 599.95px)': { bottom: 88 } } },
    },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 16 } } },
    MuiMenu: { styleOverrides: { paper: { borderRadius: 12, border: `1px solid ${colors.grey200}` } } },
    MuiCssBaseline: {
      styleOverrides: {
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
