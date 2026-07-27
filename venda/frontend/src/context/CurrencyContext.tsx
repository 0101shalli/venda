import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

interface CurrencyContextType {
  currencySymbol: string;
  formatPrice: (amount: number) => string;
  refresh: () => void;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currencySymbol, setCurrencySymbol] = useState("XAF");

  const loadSettings = useCallback(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.currency) setCurrencySymbol(data.currency);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const formatPrice = useCallback(
    (amount: number) => {
      return `${currencySymbol} ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    },
    [currencySymbol]
  );

  return (
    <CurrencyContext.Provider
      value={{
        currencySymbol,
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
