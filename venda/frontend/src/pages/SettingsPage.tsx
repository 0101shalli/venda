import { useEffect, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useCurrency } from "../context/CurrencyContext";
import { getAuth } from "../services/auth";

interface ProfileData {
  id: number;
  username: string;
  role: string;
  full_name: string;
  email: string;
  bio: string;
  profile_image: string;
  social_twitter: string;
  social_facebook: string;
  social_linkedin: string;
  social_instagram: string;
}

const CURRENCIES = [
  { symbol: "$", name: "US Dollar ($)", code: "USD" },
  { symbol: "€", name: "Euro (€)", code: "EUR" },
  { symbol: "£", name: "British Pound (£)", code: "GBP" },
  { symbol: "¥", name: "Japanese Yen (¥)", code: "JPY" },
  { symbol: "₹", name: "Indian Rupee (₹)", code: "INR" },
  { symbol: "R", name: "South African Rand (R)", code: "ZAR" },
  { symbol: "K", name: "Zambian Kwacha (K)", code: "ZMW" },
  { symbol: "₦", name: "Nigerian Naira (₦)", code: "NGN" },
  { symbol: "₱", name: "Philippine Peso (₱)", code: "PHP" },
  { symbol: "R$", name: "Brazilian Real (R$)", code: "BRL" },
  { symbol: "CHF", name: "Swiss Franc (CHF)", code: "CHF" },
  { symbol: "C$", name: "Canadian Dollar (C$)", code: "CAD" },
  { symbol: "A$", name: "Australian Dollar (A$)", code: "AUD" },
  { symbol: "NZ$", name: "New Zealand Dollar (NZ$)", code: "NZD" },
  { symbol: "S$", name: "Singapore Dollar (S$)", code: "SGD" },
  { symbol: "RM", name: "Malaysian Ringgit (RM)", code: "MYR" },
  { symbol: "KSh", name: "Kenyan Shilling (KSh)", code: "KES" },
  { symbol: "TSh", name: "Tanzanian Shilling (TSh)", code: "TZS" },
  { symbol: "USh", name: "Ugandan Shilling (USh)", code: "UGX" },
  { symbol: "GH₵", name: "Ghanaian Cedi (GH₵)", code: "GHS" },
  { symbol: "FCFA", name: "Central African CFA Franc (FCFA)", code: "XAF" },
  { symbol: "CFA", name: "West African CFA Franc (CFA)", code: "XOF" },
  { symbol: "Br", name: "Ethiopian Birr (Br)", code: "ETB" },
  { symbol: "MAD", name: "Moroccan Dirham (MAD)", code: "MAD" },
  { symbol: "DA", name: "Algerian Dinar (DA)", code: "DZD" },
  { symbol: "Ar", name: "Malagasy Ariary (Ar)", code: "MGA" },
  { symbol: "FC", name: "Congolese Franc (FC)", code: "CDF" },
  { symbol: "FRw", name: "Rwandan Franc (FRw)", code: "RWF" },
  { symbol: "FBu", name: "Burundian Franc (FBu)", code: "BIF" },
  { symbol: "Sh", name: "Somali Shilling (Sh)", code: "SOS" },
  { symbol: "SDG", name: "Sudanese Pound (SDG)", code: "SDG" },
  { symbol: "E£", name: "Egyptian Pound (E£)", code: "EGP" },
  { symbol: "LD", name: "Libyan Dinar (LD)", code: "LYD" },
  { symbol: "DT", name: "Tunisian Dinar (DT)", code: "TND" },
  { symbol: "Kz", name: "Angolan Kwanza (Kz)", code: "AOA" },
  { symbol: "MT", name: "Mozambican Metical (MT)", code: "MZN" },
  { symbol: "P", name: "Botswana Pula (P)", code: "BWP" },
  { symbol: "L", name: "Swazi Lilangeni (L)", code: "SZL" },
  { symbol: "N$", name: "Namibian Dollar (N$)", code: "NAD" },
  { symbol: "MK", name: "Malawian Kwacha (MK)", code: "MWK" },
  { symbol: "$Z", name: "Zimbabwean Dollar ($Z)", code: "ZWL" },
  { symbol: "SRe", name: "Seychellois Rupee (SRe)", code: "SCR" },
];

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

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const { refresh: refreshCurrency, formatPrice } = useCurrency();
  const auth = getAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [profile, setProfile] = useState<ProfileData>({
    id: 0,
    username: "",
    role: "",
    full_name: "",
    email: "",
    bio: "",
    profile_image: "",
    social_twitter: "",
    social_facebook: "",
    social_linkedin: "",
    social_instagram: "",
  });

  const [currency, setCurrency] = useState("$");
  const [currencySaving, setCurrencySaving] = useState(false);
  const [currencyRates, setCurrencyRates] = useState<Record<string, number>>(DEFAULT_RATES);
  const [ratesSaving, setRatesSaving] = useState(false);

  const [defaultProfit, setDefaultProfit] = useState(0);
  const [profitSaving, setProfitSaving] = useState(false);
  const [profitSearchQuery, setProfitSearchQuery] = useState("");
  const [profitSearchResults, setProfitSearchResults] = useState<any[]>([]);
  const [profitSearchLoading, setProfitSearchLoading] = useState(false);
  const [bulkProfit, setBulkProfit] = useState(0);
  const [bulkProfitSaving, setBulkProfitSaving] = useState(false);
  const [profitMessage, setProfitMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!auth?.username) return;
    setLoading(true);
    fetch(`/api/profile?username=${encodeURIComponent(auth.username)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch profile");
        return res.json();
      })
      .then((data) => {
        setProfile({
          id: data.id,
          username: data.username,
          role: data.role,
          full_name: data.full_name || "",
          email: data.email || "",
          bio: data.bio || "",
          profile_image: data.profile_image || "",
          social_twitter: data.social_twitter || "",
          social_facebook: data.social_facebook || "",
          social_linkedin: data.social_linkedin || "",
          social_instagram: data.social_instagram || "",
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.currency) setCurrency(data.currency);
        if (data.currency_rates) {
          try {
            const parsed = JSON.parse(data.currency_rates);
            setCurrencyRates({ ...DEFAULT_RATES, ...parsed });
          } catch { /* keep defaults */ }
        }
      })
      .catch(() => {});

    fetch("/api/settings/profit-default")
      .then((res) => res.json())
      .then((data) => {
        if (data.value !== undefined) setDefaultProfit(data.value);
        setBulkProfit(data.value || 0);
      })
      .catch(() => {});
  }, []);

  const handleCurrencySave = async () => {
    setCurrencySaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency, currency_rates: JSON.stringify(currencyRates) }),
      });
      if (!res.ok) throw new Error("Failed to save currency");
      refreshCurrency();
      setSaveMessage({ type: "success", text: "Currency updated successfully!" });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err: any) {
      setSaveMessage({ type: "error", text: err.message });
    } finally {
      setCurrencySaving(false);
    }
  };

  const handleRateChange = (code: string, value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num) && num > 0) {
      setCurrencyRates((prev) => ({ ...prev, [code]: num }));
    }
  };

  const handleDefaultProfitSave = async () => {
    setProfitSaving(true);
    try {
      const res = await fetch("/api/settings/profit-default", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: defaultProfit }),
      });
      if (!res.ok) throw new Error("Failed to save default profit");
      setSaveMessage({ type: "success", text: "Default profit percentage saved!" });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err: any) {
      setSaveMessage({ type: "error", text: err.message });
    } finally {
      setProfitSaving(false);
    }
  };

  const handleProfitSearch = async () => {
    setProfitSearchLoading(true);
    try {
      const res = await fetch(`/api/products/search-profit?q=${encodeURIComponent(profitSearchQuery)}`);
      if (!res.ok) throw new Error("Failed to search products");
      const data = await res.json();
      setProfitSearchResults(data);
    } catch (err: any) {
      setProfitMessage({ type: "error", text: err.message });
    } finally {
      setProfitSearchLoading(false);
    }
  };

  const handleIndividualProfitUpdate = async (productId: number, newProfit: number) => {
    try {
      const res = await fetch(`/api/products/${productId}/profit`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profit_percentage: newProfit }),
      });
      if (!res.ok) throw new Error("Failed to update profit");
      const updated = await res.json();
      setProfitSearchResults((prev) =>
        prev.map((p) =>
          p.id === productId
            ? { ...p, profit_percentage: updated.profit_percentage, selling_price: updated.selling_price }
            : p
        )
      );
      setProfitMessage({ type: "success", text: `Updated ${updated.name}` });
      setTimeout(() => setProfitMessage(null), 2000);
    } catch (err: any) {
      setProfitMessage({ type: "error", text: err.message });
    }
  };

  const handleBulkProfitUpdate = async () => {
    setBulkProfitSaving(true);
    try {
      const res = await fetch("/api/products/bulk-profit", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profit_percentage: bulkProfit }),
      });
      if (!res.ok) throw new Error("Failed to update bulk profit");
      const data = await res.json();
      setProfitMessage({ type: "success", text: data.message });
      setTimeout(() => setProfitMessage(null), 3000);
      if (profitSearchQuery) handleProfitSearch();
    } catch (err: any) {
      setProfitMessage({ type: "error", text: err.message });
    } finally {
      setBulkProfitSaving(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_SIZE = 256;
        let w = img.width;
        let h = img.height;

        if (w > h) {
          if (w > MAX_SIZE) { h = Math.round((h * MAX_SIZE) / w); w = MAX_SIZE; }
        } else {
          if (h > MAX_SIZE) { w = Math.round((w * MAX_SIZE) / h); h = MAX_SIZE; }
        }

        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL("image/jpeg", 0.8);
        setProfile((prev) => ({ ...prev, profile_image: compressed }));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setProfile((prev) => ({ ...prev, profile_image: "" }));
  };

  const handleSave = async () => {
    if (!auth?.username) return;
    setSaving(true);
    setSaveMessage(null);

    try {
      const res = await fetch(`/api/profile?username=${encodeURIComponent(auth.username)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: profile.full_name || null,
          email: profile.email || null,
          bio: profile.bio || null,
          profile_image: profile.profile_image || null,
          social_twitter: profile.social_twitter || null,
          social_facebook: profile.social_facebook || null,
          social_linkedin: profile.social_linkedin || null,
          social_instagram: profile.social_instagram || null,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to save profile");
      }

      setSaveMessage({ type: "success", text: "Profile saved successfully!" });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err: any) {
      setSaveMessage({ type: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const canManageSettings = auth?.role === "admin" || auth?.role === "manager";

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm border border-slate-200 dark:border-slate-800">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Settings</h1>
        <p className="mt-1 text-slate-500 dark:text-slate-400">Manage your profile and application preferences.</p>
      </div>

      {/* Appearance / Theme Toggle */}
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Appearance</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Toggle between light and dark mode</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {theme === "light" ? "☀️ Light" : "🌙 Dark"}
            </span>
            <button
              onClick={toggleTheme}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                theme === "dark" ? "bg-sky-500" : "bg-slate-300"
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-sm transition-transform ${
                  theme === "dark" ? "translate-x-7" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Currency Settings */}
      {canManageSettings && (
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Currency</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Select the display currency and edit exchange rates (1 USD = X foreign currency)</p>

          <div className="flex items-center gap-3 mb-6">
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.symbol}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleCurrencySave}
              disabled={currencySaving}
              className="rounded-xl bg-indigo-600 dark:bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 dark:hover:bg-sky-600 active:scale-95 transition-all disabled:opacity-50 shadow-sm"
            >
              {currencySaving ? "Saving..." : "Save"}
            </button>
          </div>

          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Exchange Rates (1 USD =)</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 max-h-64 overflow-y-auto">
            {CURRENCIES.map((c) => (
              <div key={c.code} className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 w-8 shrink-0">{c.code}</span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={currencyRates[c.code] ?? ""}
                  onChange={(e) => handleRateChange(c.code, e.target.value)}
                  className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-slate-900 dark:text-white focus:border-indigo-400 dark:focus:border-sky-400 focus:ring-1 focus:ring-indigo-400 dark:focus:ring-sky-900 outline-none"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Profit Percentage Settings */}
      {canManageSettings && (
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Profit Percentage Markup</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            Set the profit percentage added to cost price to calculate selling price
          </p>

          {/* Default Profit Percentage */}
          <div className="mb-6 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Default Profit %</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Applied to new products by default</p>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={defaultProfit}
                  onChange={(e) => setDefaultProfit(parseFloat(e.target.value) || 0)}
                  className="w-24 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-indigo-500 dark:focus:border-sky-400 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-sky-900 outline-none"
                />
                <span className="text-sm text-slate-500 dark:text-slate-400">%</span>
                <button
                  onClick={handleDefaultProfitSave}
                  disabled={profitSaving}
                  className="rounded-lg bg-indigo-600 dark:bg-sky-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 dark:hover:bg-sky-600 active:scale-95 transition-transform disabled:opacity-50"
                >
                  {profitSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>

          {/* Bulk Profit Update */}
          <div className="mb-6 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Apply to All Products</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Update profit % for every product in inventory</p>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={bulkProfit}
                  onChange={(e) => setBulkProfit(parseFloat(e.target.value) || 0)}
                  className="w-24 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-indigo-500 dark:focus:border-sky-400 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-sky-900 outline-none"
                />
                <span className="text-sm text-slate-500 dark:text-slate-400">%</span>
                <button
                  onClick={handleBulkProfitUpdate}
                  disabled={bulkProfitSaving}
                  className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600 active:scale-95 transition-transform disabled:opacity-50"
                >
                  {bulkProfitSaving ? "Updating..." : "Update All"}
                </button>
              </div>
            </div>
          </div>

          {/* Search & Individual Profit Edit */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Search & Edit Individual Products</h3>
            <div className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search by name or barcode..."
                  value={profitSearchQuery}
                  onChange={(e) => setProfitSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleProfitSearch()}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 pl-9 pr-4 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:border-indigo-500 dark:focus:border-sky-400 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-sky-900 outline-none"
                />
              </div>
              <button
                onClick={handleProfitSearch}
                disabled={profitSearchLoading}
                className="rounded-lg bg-indigo-600 dark:bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 dark:hover:bg-sky-600 active:scale-95 transition-transform disabled:opacity-50"
              >
                {profitSearchLoading ? "Searching..." : "Search"}
              </button>
            </div>

            {profitSearchResults.length > 0 && (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {profitSearchResults.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{item.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Cost: {formatPrice(item.cost_price)} | Selling: {formatPrice(item.selling_price)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={item.profit_percentage}
                        onBlur={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          if (val !== item.profit_percentage) {
                            handleIndividualProfitUpdate(item.id, val);
                          }
                        }}
                        className="w-20 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm text-center text-slate-900 dark:text-white focus:border-indigo-500 dark:focus:border-sky-400 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-sky-900 outline-none"
                      />
                      <span className="text-xs text-slate-500 dark:text-slate-400">%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {profitSearchQuery && profitSearchResults.length === 0 && !profitSearchLoading && (
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">No products found</p>
            )}
          </div>

          {profitMessage && (
            <div className={`mt-4 p-3 rounded-lg text-sm font-medium ${
              profitMessage.type === "success"
                ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800"
            }`}>
              {profitMessage.type === "success" ? "✓" : "✗"} {profitMessage.text}
            </div>
          )}
        </div>
      )}

      {/* Profile Section */}
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-6">My Profile</h2>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-slate-200 border-t-sky-500"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Avatar Section */}
            <div className="flex items-center gap-6">
              <div className="relative group">
                {profile.profile_image ? (
                  <img
                    src={profile.profile_image}
                    alt="Profile"
                    className="h-24 w-24 rounded-full object-cover border-3 border-slate-200 dark:border-slate-700 shadow-md"
                  />
                ) : (
                  <div className="h-24 w-24 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 dark:from-sky-400 dark:to-cyan-500 flex items-center justify-center text-white text-3xl font-bold uppercase shadow-md">
                    {profile.full_name ? profile.full_name[0] : profile.username[0]}
                  </div>
                )}
                {/* Hover overlay */}
                <label className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                  <span className="text-white text-xs font-semibold">Change</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </label>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{profile.full_name || profile.username}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">@{profile.username} · {profile.role}</p>
                <div className="flex gap-2 mt-2">
                  <label className="cursor-pointer text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline">
                    Upload new photo
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  </label>
                  {profile.profile_image && (
                    <button
                      onClick={handleRemoveImage}
                      className="text-xs font-semibold text-rose-500 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Profile Form Fields */}
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1.5">Full Name</label>
                <input
                  type="text"
                  value={profile.full_name}
                  onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                  placeholder="Your full name"
                  className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1.5">Email Address</label>
                <input
                  type="email"
                  value={profile.email}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  placeholder="your.email@example.com"
                  className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none transition-all"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1.5">Bio</label>
                <textarea
                  value={profile.bio}
                  onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                  placeholder="Tell us about yourself..."
                  rows={3}
                  className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none transition-all resize-none"
                />
              </div>
            </div>

            {/* Social Links */}
            <div>
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">Social Profiles</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-3">
                  <span className="text-lg">🐦</span>
                  <input
                    type="text"
                    value={profile.social_twitter}
                    onChange={(e) => setProfile({ ...profile, social_twitter: e.target.value })}
                    placeholder="Twitter profile URL"
                    className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none"
                  />
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-3">
                  <span className="text-lg">📘</span>
                  <input
                    type="text"
                    value={profile.social_facebook}
                    onChange={(e) => setProfile({ ...profile, social_facebook: e.target.value })}
                    placeholder="Facebook profile URL"
                    className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none"
                  />
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-3">
                  <span className="text-lg">🔗</span>
                  <input
                    type="text"
                    value={profile.social_linkedin}
                    onChange={(e) => setProfile({ ...profile, social_linkedin: e.target.value })}
                    placeholder="LinkedIn profile URL"
                    className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none"
                  />
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-3">
                  <span className="text-lg">📷</span>
                  <input
                    type="text"
                    value={profile.social_instagram}
                    onChange={(e) => setProfile({ ...profile, social_instagram: e.target.value })}
                    placeholder="Instagram profile URL"
                    className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Save Button & Status */}
            <div className="flex items-center gap-4 pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-xl bg-indigo-600 dark:bg-sky-500 px-8 py-3 text-sm font-semibold text-white hover:bg-indigo-700 dark:hover:bg-sky-600 active:scale-95 transition-all disabled:opacity-50 shadow-sm"
              >
                {saving ? "Saving..." : "Save Profile"}
              </button>

              {saveMessage && (
                <p className={`text-sm font-medium ${
                  saveMessage.type === "success"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}>
                  {saveMessage.type === "success" ? "✓" : "✗"} {saveMessage.text}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Account Info */}
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-6">
        <h3 className="font-semibold text-slate-700 dark:text-slate-300 mb-2">Account Information</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Your theme preference is automatically saved and will be restored when you return to the application.
          Profile changes are stored on the server and visible to other administrators.
        </p>
      </div>
    </div>
  );
}
