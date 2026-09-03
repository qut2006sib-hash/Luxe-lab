import { trpc } from "@/lib/trpc";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type Currency = "USD" | "SAR" | "AED" | "SYP";
export type Language = "ar" | "en";

interface SettingsContextType {
  currency: Currency;
  language: Language;
  setCurrency: (currency: Currency) => void;
  setLanguage: (language: Language) => void;
  currencySymbol: string;
}

const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined
);

function readStoredCurrency(): Currency {
  const saved = localStorage.getItem("currency");
  return saved === "SAR" ||
    saved === "AED" ||
    saved === "SYP" ||
    saved === "USD"
    ? saved
    : "USD";
}

function readStoredLanguage(): Language {
  return localStorage.getItem("language") === "en" ? "en" : "ar";
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>(readStoredCurrency);
  const [language, setLanguageState] = useState<Language>(readStoredLanguage);

  const { data: user } = trpc.auth.me.useQuery();
  const { data: persistedSettings } = trpc.settings.get.useQuery(undefined, {
    enabled: Boolean(user),
    retry: false,
  });

  const setCurrency = (newCurrency: Currency) => {
    setCurrencyState(newCurrency);
    localStorage.setItem("currency", newCurrency);
  };

  const setLanguage = (newLanguage: Language) => {
    setLanguageState(newLanguage);
    localStorage.setItem("language", newLanguage);
  };

  useEffect(() => {
    if (!persistedSettings) return;
    setCurrency(persistedSettings.currency);
    setLanguage(persistedSettings.language);
  }, [persistedSettings]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  }, [language]);

  const currencySymbol = useMemo(() => {
    const formatter = new Intl.NumberFormat(
      language === "ar" ? "ar-SY" : "en-US",
      {
        style: "currency",
        currency,
        currencyDisplay: "narrowSymbol",
      }
    );
    return (
      formatter.formatToParts(0).find(part => part.type === "currency")
        ?.value ?? currency
    );
  }, [currency, language]);

  return (
    <SettingsContext.Provider
      value={{
        currency,
        language,
        setCurrency,
        setLanguage,
        currencySymbol,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within SettingsProvider");
  }
  return context;
}
