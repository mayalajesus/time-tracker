import type { Locale } from "./i18n";

export const currencyOptions = ["BRL", "USD", "EUR", "GBP"] as const;
export type CurrencyCode = (typeof currencyOptions)[number];
export const clientCurrencyOptions: readonly CurrencyCode[] = ["BRL", "USD", "EUR"];

export type BillingPreference = {
  hourlyRate: number;
  currency: CurrencyCode;
};

export type BillableEntry = {
  billable: boolean;
  seconds: number;
  hourlyRate?: number;
  currency?: CurrencyCode;
};

export type MoneyTotals = Partial<Record<CurrencyCode, number>>;

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return currencyOptions.includes(value as CurrencyCode);
}

export function defaultCurrencyForLocale(locale: Locale): CurrencyCode {
  return locale === "pt-BR" ? "BRL" : "USD";
}

export function formatMoney(value: number, currency: CurrencyCode, locale: Locale): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function parseHourlyRateInput(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function billingForEntry(
  entry: BillableEntry,
  fallback: BillingPreference,
): BillingPreference {
  return {
    hourlyRate:
      typeof entry.hourlyRate === "number" && Number.isFinite(entry.hourlyRate)
        ? entry.hourlyRate
        : fallback.hourlyRate,
    currency: isCurrencyCode(entry.currency) ? entry.currency : fallback.currency,
  };
}

export function billableValue(entry: BillableEntry, fallback: BillingPreference): number {
  if (!entry.billable) return 0;
  return (Math.max(0, entry.seconds) / 3_600) * billingForEntry(entry, fallback).hourlyRate;
}

export function sumBillableValues<Entry extends BillableEntry>(
  entries: readonly Entry[],
  fallbackFor: (entry: Entry) => BillingPreference,
  emptyCurrency?: CurrencyCode,
): MoneyTotals {
  const totals: MoneyTotals = {};
  for (const entry of entries) {
    if (!entry.billable) continue;
    const billing = billingForEntry(entry, fallbackFor(entry));
    totals[billing.currency] = (totals[billing.currency] ?? 0) + billableValue(entry, billing);
  }
  if (Object.keys(totals).length === 0 && emptyCurrency) totals[emptyCurrency] = 0;
  return totals;
}

export function formatMoneyTotals(totals: MoneyTotals, locale: Locale): string {
  return currencyOptions
    .filter((currency) => totals[currency] !== undefined)
    .map((currency) => formatMoney(totals[currency] ?? 0, currency, locale))
    .join(" · ");
}
