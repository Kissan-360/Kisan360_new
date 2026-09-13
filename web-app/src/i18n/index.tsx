import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

// Import translation files
import en from './en.json';
import mr from './mr.json';
import hi from './hi.json';

export type Lang = 'en' | 'mr' | 'hi';

export const LANGUAGES: { code: Lang; label: string; native: string }[] = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'mr', label: 'Marathi', native: 'मराठी' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
];

const translations: Record<Lang, Record<string, string>> = { en, mr, hi };

const STORAGE_KEY = 'kisan360-lang';

function detectLanguage(): Lang {
  // 1. localStorage
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'mr' || stored === 'hi') return stored;
  } catch { /* SSR or storage error */ }

  // 2. Browser language
  const browserLang = navigator.language?.toLowerCase() || '';
  if (browserLang.startsWith('mr')) return 'mr';
  if (browserLang.startsWith('hi')) return 'hi';

  // 3. Default
  return 'en';
}

interface I18nContextValue {
  language: Lang;
  setLanguage: (lang: Lang) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  language: 'en',
  setLanguage: () => {},
  t: (key) => key,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLangState] = useState<Lang>(detectLanguage);

  const setLanguage = useCallback((lang: Lang) => {
    setLangState(lang);
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
  }, []);

  /* Keep <html lang> honest. It was hard-coded to "en" in index.html, so a
     screen reader announced Marathi and Hindi content with English phonetics
     and the browser picked Latin font fallbacks for Devanagari text. */
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    const dict = translations[language] || translations.en;
    let value = dict[key] || translations.en[key] || key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      });
    }
    return value;
  }, [language]);

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  return useContext(I18nContext);
}

export default I18nContext;
