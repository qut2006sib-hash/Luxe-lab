import type { Currency, Language } from "@/contexts/SettingsContext";

export function formatPrice(
  amount: number | null | undefined,
  currency: Currency,
  language: Language = "ar"
): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount))
    return "-";
  return new Intl.NumberFormat(language === "ar" ? "ar-SY" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatPriceRange(
  min: number | null | undefined,
  max: number | null | undefined,
  currency: Currency,
  language: Language = "ar"
): string {
  return `${formatPrice(min, currency, language)} - ${formatPrice(max, currency, language)}`;
}

export function formatPriceWithLabel(
  label: string,
  amount: number | null | undefined,
  currency: Currency,
  language: Language = "ar"
): string {
  return `${label}: ${formatPrice(amount, currency, language)}`;
}
