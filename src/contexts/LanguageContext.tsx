import { createContext, useContext, useState, ReactNode } from 'react';
import { dictionaries, Lang, TranslationKey } from '../locales';

const STORAGE_KEY = 'gist_language';

function detectInitialLang(): Lang {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'en' || saved === 'da') return saved;
  if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('da')) {
    return 'da';
  }
  return 'en';
}

interface LanguageContextType {
  lang: Lang;
  switchLang: (next: Lang) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(detectInitialLang);

  const switchLang = (next: Lang) => {
    setLang(next);
    localStorage.setItem(STORAGE_KEY, next);
  };

  const t = (key: TranslationKey, params?: Record<string, string | number>) => {
    const raw = dictionaries[lang][key] ?? dictionaries.en[key] ?? key;
    if (!params) return raw;
    return raw.replace(/\{(\w+)\}/g, (_, k) =>
      params[k] !== undefined ? String(params[k]) : `{${k}}`
    );
  };

  return (
    <LanguageContext.Provider value={{ lang, switchLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
