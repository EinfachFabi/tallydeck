import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useLocalStorage } from '../utils/useLocalStorage';

export type ColorMode = 'dark' | 'light';
export type ThemeId = 'monokai' | 'dracula' | 'nord' | 'catppuccin' | 'gruvbox';
export type ViewDensity = 'comfortable' | 'compact';

export interface ThemeDefinition {
  id: ThemeId;
  labelKey: string;
  preview: {
    dark: { bg: string; surface: string; accent: string; success: string; danger: string };
    light: { bg: string; surface: string; accent: string; success: string; danger: string };
  };
}

export const THEMES: readonly ThemeDefinition[] = [
  {
    id: 'monokai',
    labelKey: 'settings.themes.monokai',
    preview: {
      dark: { bg: '#272822', surface: '#2f3129', accent: '#66d9ef', success: '#a6e22e', danger: '#f92672' },
      light: { bg: '#faf8f2', surface: '#ffffff', accent: '#0089a7', success: '#5a8f00', danger: '#d81b60' },
    },
  },
  {
    id: 'dracula',
    labelKey: 'settings.themes.dracula',
    preview: {
      dark: { bg: '#282a36', surface: '#303341', accent: '#bd93f9', success: '#50fa7b', danger: '#ff5555' },
      light: { bg: '#f8f7fc', surface: '#ffffff', accent: '#7c4dff', success: '#169c42', danger: '#e02d3c' },
    },
  },
  {
    id: 'nord',
    labelKey: 'settings.themes.nord',
    preview: {
      dark: { bg: '#2e3440', surface: '#3b4252', accent: '#88c0d0', success: '#a3be8c', danger: '#bf616a' },
      light: { bg: '#eceff4', surface: '#ffffff', accent: '#3b7ea1', success: '#4f7d3a', danger: '#b5404b' },
    },
  },
  {
    id: 'catppuccin',
    labelKey: 'settings.themes.catppuccin',
    preview: {
      dark: { bg: '#1e1e2e', surface: '#262639', accent: '#89b4fa', success: '#a6e3a1', danger: '#f38ba8' },
      light: { bg: '#eff1f5', surface: '#ffffff', accent: '#1e66f5', success: '#40a02b', danger: '#d20f39' },
    },
  },
  {
    id: 'gruvbox',
    labelKey: 'settings.themes.gruvbox',
    preview: {
      dark: { bg: '#282828', surface: '#32302f', accent: '#83a598', success: '#b8bb26', danger: '#fb4934' },
      light: { bg: '#fbf1c7', surface: '#fff9df', accent: '#076678', success: '#79740e', danger: '#9d0006' },
    },
  },
] as const;

export const DEFAULT_COLOR_MODE: ColorMode = 'dark';
export const DEFAULT_THEME: ThemeId = 'monokai';
export const DEFAULT_VIEW_DENSITY: ViewDensity = 'comfortable';
export const DEFAULT_INBOX_LIMIT = 100;
export const DEFAULT_COMPLETED_DAYS = 7;
export const MIN_COMPLETED_DAYS = 1;
export const MAX_COMPLETED_DAYS = 30;
export const MIN_INBOX_LIMIT = 10;
export const MAX_INBOX_LIMIT = 1000;

export interface SettingsContextValue {
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  viewDensity: ViewDensity;
  setViewDensity: (density: ViewDensity) => void;
  inboxLimit: number;
  setInboxLimit: (limit: number) => void;
  completedDays: number;
  setCompletedDays: (days: number) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function clamp(val: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(val)) return fallback;
  return Math.min(Math.max(Math.round(val), min), max);
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [colorMode, setColorMode] = useLocalStorage<ColorMode>('tallydeck.settings.colorMode', DEFAULT_COLOR_MODE);
  const [theme, setTheme] = useLocalStorage<ThemeId>('tallydeck.settings.theme', DEFAULT_THEME);
  const [viewDensity, setViewDensity] = useLocalStorage<ViewDensity>(
    'tallydeck.settings.viewDensity',
    DEFAULT_VIEW_DENSITY,
  );
  const [rawInboxLimit, setRawInboxLimit] = useLocalStorage<number>('tallydeck.settings.inboxLimit', DEFAULT_INBOX_LIMIT);
  const [rawCompletedDays, setRawCompletedDays] = useLocalStorage<number>(
    'tallydeck.settings.completedDays',
    DEFAULT_COMPLETED_DAYS,
  );

  const inboxLimit = clamp(rawInboxLimit, MIN_INBOX_LIMIT, MAX_INBOX_LIMIT, DEFAULT_INBOX_LIMIT);
  const completedDays = clamp(rawCompletedDays, MIN_COMPLETED_DAYS, MAX_COMPLETED_DAYS, DEFAULT_COMPLETED_DAYS);

  const setInboxLimit = useCallback(
    (limit: number) => {
      setRawInboxLimit(clamp(limit, MIN_INBOX_LIMIT, MAX_INBOX_LIMIT, DEFAULT_INBOX_LIMIT));
    },
    [setRawInboxLimit],
  );

  const setCompletedDays = useCallback(
    (days: number) => {
      setRawCompletedDays(clamp(days, MIN_COMPLETED_DAYS, MAX_COMPLETED_DAYS, DEFAULT_COMPLETED_DAYS));
    },
    [setRawCompletedDays],
  );

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = THEMES.some((t) => t.id === theme) ? theme : DEFAULT_THEME;
    root.dataset.mode = colorMode === 'light' ? 'light' : 'dark';
    root.classList.toggle('dark', colorMode !== 'light');
  }, [theme, colorMode]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      colorMode: colorMode === 'light' ? 'light' : 'dark',
      setColorMode,
      theme: THEMES.some((t) => t.id === theme) ? theme : DEFAULT_THEME,
      setTheme,
      viewDensity: viewDensity === 'compact' ? 'compact' : 'comfortable',
      setViewDensity,
      inboxLimit,
      setInboxLimit,
      completedDays,
      setCompletedDays,
    }),
    [
      colorMode,
      setColorMode,
      theme,
      setTheme,
      viewDensity,
      setViewDensity,
      inboxLimit,
      setInboxLimit,
      completedDays,
      setCompletedDays,
    ],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}
