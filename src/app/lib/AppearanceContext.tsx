import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CssBaseline, ThemeProvider, useMediaQuery } from '@mui/material';
import { ACCENTS, createAppTheme, type Accent, type ColorMode } from '../theme';
import { useProfile } from './ProfileContext';

export type ThemeSetting = 'light' | 'dark' | 'system';

interface AppearanceValue {
  setting: ThemeSetting; // what the user picked
  mode: ColorMode; // what that means right now (system follows the device)
  accent: Accent;
  setSetting: (setting: ThemeSetting) => Promise<void>;
  setAccent: (accent: Accent) => Promise<void>;
}

const AppearanceContext = createContext<AppearanceValue | undefined>(undefined);
const CACHE_KEY = 'smartsched.appearance';

// The last appearance this browser used, so the page doesn't flash the default look while the profile loads
// (and the login page matches). Storage can be unavailable, so every access is guarded.
function readCache(): { setting: ThemeSetting; accent: Accent } {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}');
    return {
      setting: ['light', 'dark', 'system'].includes(cached.setting) ? cached.setting : 'system',
      accent: ACCENTS.includes(cached.accent) ? cached.accent : 'violet',
    };
  } catch {
    return { setting: 'system', accent: 'violet' };
  }
}

function writeCache(value: { setting: ThemeSetting; accent: Accent }) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(value));
  } catch {
    // Just falls back to the default look before the profile loads.
  }
}

// Light/dark/system and the accent: from the profile once it loads (so they follow the account to other
// devices), changed instantly when picked, then saved.
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const { profile, saveAppearance } = useProfile();
  const [local, setLocal] = useState(readCache);
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)', { noSsr: true });

  useEffect(() => {
    if (!profile) return;
    const next = {
      setting: (profile.theme_mode ?? 'system') as ThemeSetting,
      accent: (ACCENTS.includes(profile.accent as Accent) ? profile.accent : 'violet') as Accent,
    };
    setLocal(next);
    writeCache(next);
  }, [profile?.theme_mode, profile?.accent]);

  const mode: ColorMode = local.setting === 'system' ? (prefersDark ? 'dark' : 'light') : local.setting;
  const muiTheme = useMemo(() => createAppTheme(mode, local.accent), [mode, local.accent]);

  // Shown straight away; if saving fails it stays for this visit and the caller says so.
  const change = async (changes: Partial<{ setting: ThemeSetting; accent: Accent }>) => {
    const next = { ...local, ...changes };
    setLocal(next);
    writeCache(next);
    await saveAppearance({
      ...(changes.setting ? { theme_mode: changes.setting } : {}),
      ...(changes.accent ? { accent: changes.accent } : {}),
    });
  };

  return (
    <AppearanceContext.Provider
      value={{
        setting: local.setting,
        mode,
        accent: local.accent,
        setSetting: (setting) => change({ setting }),
        setAccent: (accent) => change({ accent }),
      }}
    >
      <ThemeProvider theme={muiTheme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error('useAppearance must be used within an AppearanceProvider');
  return ctx;
}
