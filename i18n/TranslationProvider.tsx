import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { fr, type Translations } from './fr';
import { en } from './en';

export type Language = 'fr' | 'en';

const translations: Record<Language, Translations> = {
  fr,
  en,
};

const STORAGE_KEY = 'vk_language';

const getInitialLanguage = (): Language => {
  if (typeof window === 'undefined') return 'fr';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'en' || stored === 'fr') return stored;
  return 'fr';
};

interface TranslationContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const TranslationContext = createContext<TranslationContextValue>({
  language: 'fr',
  setLanguage: () => {},
  t: fr,
});

export const TranslationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLang] = useState<Language>(getInitialLanguage);

  const setLanguage = useCallback((lang: Language) => {
    setLang(lang);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, lang);
    }
  }, []);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t: translations[language] ?? fr,
    }),
    [language, setLanguage],
  );

  return <TranslationContext.Provider value={value}>{children}</TranslationContext.Provider>;
};

export const useTranslation = () => useContext(TranslationContext);

export const availableLanguages = translations;
