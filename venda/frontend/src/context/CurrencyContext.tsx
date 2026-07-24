import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

interface CurrencyContextType {
  currencySymbol: string;
  currencyCode: string;
  exchangeRate: number;
  convert: (amountInUSD: number) => number;
  formatPrice: (amountInUSD: number) => string;
  refresh: () => void;
}

const DEFAULT_RATES: Record<string, number> = {
  USD: 1, EUR: 0.85, GBP: 0.73, JPY: 149.5, INR: 83.1,
  ZAR: 18.6, ZMW: 25.5, NGN: 1540, PHP: 56.2, BRL: 4.97,
  CHF: 0.88, CAD: 1.36, AUD: 1.53, NZD: 1.67, SGD: 1.34,
  MYR: 4.68, KES: 153, TZS: 2510, UGX: 3780, GHS: 14.9,
  XAF: 615.8, XOF: 615.8, ETB: 55.3, MAD: 10.1, DZD: 135.5,
  MGA: 4630, CDF: 2540, RWF: 1300, BIF: 2830, SOS: 568,
  SDG: 600, EGP: 48.4, LYD: 4.87, TND: 3.12, AOA: 832,
  MZN: 63.8, BWP: 13.6, SZL: 18.6, LSL: 18.6, NAD: 18.6,
  MWK: 1620, ZWL: 3220, SCR: 14.4, DJF: 177.5, KMF: 436.5,
};

const SYMBOL_TO_CODE: Record<string, string> = {
  "$": "USD", "€": "EUR", "£": "GBP", "¥": "JPY", "₹": "INR",
  "R": "ZAR", "K": "ZMW", "₦": "NGN", "₱": "PHP", "R$": "BRL",
  "CHF": "CHF", "C$": "CAD", "A$": "AUD", "NZ$": "NZD", "S$": "SGD",
  "RM": "MYR", "KSh": "KES", "TSh": "TZS", "USh": "UGX", "GH₵": "GHS",
  "FCFA": "XAF", "CFA": "XOF", "Br": "ETB", "MAD": "MAD", "DA": "DZD",
  "Ar": "MGA", "FC": "CDF", "FRw": "RWF", "FBu": "BIF", "Sh": "SOS",
  "SDG": "SDG", "E£": "EGP", "LD": "LYD", "DT": "TND", "Kz": "AOA",
  "MT": "MZN", "P": "BWP", "L": "SZL", "M": "MZN", "MK": "MWK",
  "$Z": "ZWL", "SRe": "SCR",
};

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currencySymbol, setCurrencySymbol] = useState("$");
  const [exchangeRate, setExchangeRate] = useState(1);
  const [rates, setRates] = useState<Record<string, number>>(DEFAULT_RATES);

  const loadSettings = useCallback(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.currency) setCurrencySymbol(data.currency);
        if (data.currency_rates) {
          try {
            const parsed = JSON.parse(data.currency_rates);
            setRates(parsed);
          } catch { /* keep defaults */ }
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    const code = SYMBOL_TO_CODE[currencySymbol] || "USD";
    setExchangeRate(rates[code] || 1);
  }, [currencySymbol, rates]);

  const convert = useCallback(
    (amountInUSD: number) => {
      return parseFloat((amountInUSD * exchangeRate).toFixed(2));
    },
    [exchangeRate]
  );

  const formatPrice = useCallback(
    (amountInUSD: number) => {
      const converted = amountInUSD * exchangeRate;
      return `${currencySymbol}${converted.toFixed(2)}`;
    },
    [currencySymbol, exchangeRate]
  );

  return (
    <CurrencyContext.Provider
      value={{
        currencySymbol,
        currencyCode: SYMBOL_TO_CODE[currencySymbol] || "USD",
        exchangeRate,
        convert,
        formatPrice,
        refresh: loadSettings,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error("useCurrency must be used within a CurrencyProvider");
  }
  return context;
}
