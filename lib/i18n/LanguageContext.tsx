"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { en } from "./en";
import { hi } from "./hi";

export type Language = "en" | "hi";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (keyPath: string) => string;
}

const translations: Record<Language, any> = { en, hi };

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>("en");

  // Load language preference from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedLang = localStorage.getItem("palmpay_lang") as Language;
      if (savedLang === "en" || savedLang === "hi") {
        setLanguageState(savedLang);
      }
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    if (typeof window !== "undefined") {
      localStorage.setItem("palmpay_lang", lang);
    }
  };

  const toggleLanguage = () => {
    const nextLang = language === "en" ? "hi" : "en";
    setLanguage(nextLang);
  };

  /**
   * Format fallback title string from missing key path (e.g., 'scan.biometricTerminal' -> 'Biometric Terminal')
   */
  const formatKeyFallback = (keyPath: string): string => {
    const lastKey = keyPath.split(".").pop() || keyPath;
    return lastKey
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  };

  // Nested dot-notation key lookup helper (e.g. t('scan.statusPosition'))
  const t = (keyPath: string): string => {
    if (!keyPath) return "";
    const keys = keyPath.split(".");
    
    // Primary language lookup
    let current: any = translations[language];
    let foundPrimary = true;
    for (const k of keys) {
      if (current && current[k] !== undefined) {
        current = current[k];
      } else {
        foundPrimary = false;
        break;
      }
    }

    if (foundPrimary && typeof current === "string") {
      return current;
    }

    // Fallback to English dictionary if key missing in target language
    let fallback: any = en;
    let foundFallback = true;
    for (const fk of keys) {
      if (fallback && fallback[fk] !== undefined) {
        fallback = fallback[fk];
      } else {
        foundFallback = false;
        break;
      }
    }

    if (foundFallback && typeof fallback === "string") {
      return fallback;
    }

    // Missing key in both target language and English fallback
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[i18n] Missing translation key for path: "${keyPath}"`);
    }

    return formatKeyFallback(keyPath);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
