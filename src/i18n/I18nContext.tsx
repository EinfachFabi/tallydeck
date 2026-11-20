import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import en from './en.json';
import de from './de.json';

/**
 * To add a language: create src/i18n/<code>.json (same keys as en.json)
 * and register it in LANGUAGES + DICTIONARIES below.
 */
export const LANGUAGES = [
  { code: 'en', label: 'EN', name: 'English' },
  { code: 'de', label: 'DE', name: 'Deutsch' },
] as const;

export type Language = (typeof LANGUAGES)[number]['code'];

type Dict = { [key: string]: string | Dict };
const DICTIONARIES: Record<Language, Dict> = { en, de };
const STORAGE_KEY = 'tallydeck.language';

function lookup(dict: Dict, key: string): string | undefined {
  let node: string | Dict | undefined = dict;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

export type TFunction = (key: string, params?: Record<string, string | number>) => string;

interface I18nValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: TFunction;
  /** BCP-47 locale for Intl formatting. */
  locale: string;
}

const I18nContext = createContext<I18nValue | null>(null);

function initialLanguage(): Language {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && stored in DICTIONARIES) return stored as Language;
  return 'en'; // English is the default
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);

  const setLanguage = useCallback((lang: Language) => {
    localStorage.setItem(STORAGE_KEY, lang);
    setLanguageState(lang);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const t = useCallback<TFunction>(
    (key, params) => {
      const template = lookup(DICTIONARIES[language], key) ?? lookup(DICTIONARIES.en, key) ?? key;
      if (!params) return template;
      return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
    },
    [language],
  );

  const value = useMemo<I18nValue>(
    () => ({ language, setLanguage, t, locale: language === 'de' ? 'de-DE' : 'en-US' }),
    [language, setLanguage, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
