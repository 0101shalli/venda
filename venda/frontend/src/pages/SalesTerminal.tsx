import { useState, useEffect, useRef, useCallback } from "react";
import BarcodeScanner, { ProductInfo } from "../components/BarcodeScanner";
import ScanToast from "../components/ScanToast";
import { useCurrency } from "../context/CurrencyContext";
import { getAuth } from "../services/auth";
import { useKeyboardScanner } from "../hooks/useKeyboardScanner";

type CartItem = ProductInfo & { quantity: number; bargainPrice?: number; bargainType?: "auto" | "manual" };

type ReceiptLine = {
  name: string;
  quantity: number;
  price: number;
  totalPrice: number;
  bulk: boolean;
};

function receiptLinesFor(cart: CartItem[]): ReceiptLine[] {
  return cart.map((item) => {
    const packs = bulkUnits(item);
    if (packs > 0) {
      const bp = Number(item.bulk_price) || 0;
      return { name: item.name, quantity: packs, price: bp, totalPrice: bp * packs, bulk: true };
    }
    return {
      name: item.name,
      quantity: item.quantity,
      price: cartUnitPrice(item),
      totalPrice: cartSubtotal(item),
      bulk: false,
    };
  });
}

function isBulkQty(qty: number, bulkQty: number | undefined): boolean {
  const bq = Number(bulkQty) || 0;
  return bq > 0 && qty >= bq && qty % bq === 0;
}

// Effective per-unit price for a cart line. When bulk qualifies, this is the
// price per single unit (bulk pack price divided by pack size), so that
// unit price x total quantity equals the bulk pack total. A manual bargain
// price (if set) always takes precedence.
function cartUnitPrice(item: CartItem): number {
  if (item.bargainPrice != null) return item.bargainPrice;
  const packs = bulkUnits(item);
  if (packs > 0) {
    const bp = Number(item.bulk_price) || 0;
    const bq = Number(item.bulk_quantity) || 0;
    if (bp > 0 && bq > 0) return bp / bq;
  }
  return item.selling_price;
}

// Line subtotal. Bulk items are priced as bulk pack price x number of packs.
function cartSubtotal(item: CartItem): number {
  if (item.bargainPrice != null) return item.bargainPrice * item.quantity;
  const packs = bulkUnits(item);
  if (packs > 0) {
    const bp = Number(item.bulk_price) || 0;
    if (bp > 0) return bp * packs;
  }
  return item.selling_price * item.quantity;
}

function bulkUnits(item: CartItem): number {
  if (!item.bulk_enabled) return 0;
  const bq = Number(item.bulk_quantity) || 0;
  if (bq > 0 && isBulkQty(item.quantity, bq)) return Math.floor(item.quantity / bq);
  return 0;
}

function SearchBar({ onSelect }: { onSelect: (p: ProductInfo) => void }) {
  const { formatPrice } = useCurrency();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/products/search?q=${encodeURIComponent(query)}`);
        const data: ProductInfo[] = await res.json();
        setResults(data);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
  }, [query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (p: ProductInfo) => {
    onSelect(p);
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative flex items-center">
        <svg className="absolute left-3.5 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M16.5 10.5a6 6 0 11-12 0 6 6 0 0112 0z" />
        </svg>
        <input
          id="product-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search products by name or barcode…"
          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-2.5 pl-10 pr-4 text-sm text-slate-800 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 outline-none ring-inset focus:border-indigo-400 dark:focus:border-sky-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-sky-900"
          autoComplete="off"
        />
        {loading && (
          <div className="absolute right-3 h-4 w-4 animate-spin rounded-full border-2 border-indigo-400 dark:border-sky-400 border-t-transparent" />
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl">
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleSelect(p)}
              className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-indigo-50 dark:hover:bg-slate-800"
            >
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-white">{p.name}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">{p.barcode}</p>
              </div>
              <span className="ml-4 font-bold text-indigo-700 dark:text-sky-400">{formatPrice(p.selling_price)}</span>
            </button>
          ))}
        </div>
      )}

      {open && results.length === 0 && !loading && query.trim() && (
        <div className="absolute z-50 mt-1 w-full rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm text-slate-400 dark:text-slate-500 shadow-xl">
          No products found for "<span className="font-medium text-slate-600 dark:text-slate-400">{query}</span>"
        </div>
      )}
    </div>
  );
}

function BargainModal({
  item,
  isManager,
  onClose,
  onApply,
}: {
  item: CartItem;
  isManager: boolean;
  onClose: () => void;
  onApply: (itemId: number, unitPrice: number, bargainType: "auto" | "manual") => void;
}) {
  const { formatPrice } = useCurrency();
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [autoPrice, setAutoPrice] = useState(item.selling_price);
  const [manualPrice, setManualPrice] = useState(item.selling_price);
  const [selectedSteps, setSelectedSteps] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cost = item.cost_price;
  const autoFloor = Math.ceil(cost * 1.15 * 100) / 100;
  const manualFloor = cost;
  const minSelling = item.min_selling_price ?? null;
  const effectiveAutoFloor = minSelling != null ? Math.max(autoFloor, minSelling) : autoFloor;
  const effectiveManualFloor = minSelling != null ? Math.max(manualFloor, minSelling) : manualFloor;

  const steps = item.bargain_steps || [];
  const stepSum = selectedSteps.reduce((a, b) => a + b, 0);
  const autoReduction = item.selling_price - autoPrice;
  const manualReduction = item.selling_price - manualPrice;

  const handleStepToggle = (step: number) => {
    const next = selectedSteps.includes(step)
      ? selectedSteps.filter((s) => s !== step)
      : [...selectedSteps, step];
    setSelectedSteps(next);
    setManualPrice(item.selling_price - next.reduce((a, b) => a + b, 0));
    setError(null);
  };

  const handleManualPriceChange = (value: number) => {
    setManualPrice(value);
    setSelectedSteps([]);
    setError(null);
  };

  const handleApply = () => {
    if (mode === "auto") {
      if (effectiveAutoFloor >= item.selling_price) {
        setError("This product cannot be auto-bargained below its selling price.");
        return;
      }
      onApply(item.id, autoPrice, "auto");
    } else {
      if (manualPrice < effectiveManualFloor || manualPrice > item.selling_price) {
        setError(`Price must be between ${formatPrice(effectiveManualFloor)} and ${formatPrice(item.selling_price)}.`);
        return;
      }
      onApply(item.id, manualPrice, "manual");
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Bargain</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          {item.name} · Barcode {item.barcode}
        </p>

        <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-4 grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Selling Price</p>
            <p className="mt-1 font-bold text-slate-800 dark:text-white">{formatPrice(item.selling_price)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Cost Price</p>
            <p className="mt-1 font-bold text-slate-800 dark:text-white">{formatPrice(item.cost_price)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Min Selling</p>
            <p className="mt-1 font-bold text-slate-800 dark:text-white">
              {minSelling != null ? formatPrice(minSelling) : "—"}
            </p>
          </div>
        </div>

        {/* Mode switcher */}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setMode("auto")}
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
              mode === "auto"
                ? "bg-indigo-600 text-white dark:bg-sky-500"
                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
            }`}
          >
            Automatic (All users)
          </button>
          {isManager && (
            <button
              type="button"
              onClick={() => setMode("manual")}
              className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                mode === "manual"
                  ? "bg-indigo-600 text-white dark:bg-sky-500"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
              }`}
            >
              Manual (Managers)
            </button>
          )}
        </div>

        {mode === "auto" ? (
          <div className="mt-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Bargained Price</p>
              <p className="text-xl font-black text-indigo-700 dark:text-sky-400">{formatPrice(autoPrice)}</p>
            </div>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Floor {formatPrice(effectiveAutoFloor)} (cost + 15%) · Reduced by {formatPrice(autoReduction)}
            </p>
            <input
              type="range"
              min={Math.min(effectiveAutoFloor, item.selling_price)}
              max={item.selling_price}
              step={1}
              value={Math.max(autoPrice, Math.min(effectiveAutoFloor, item.selling_price))}
              onChange={(e) => setAutoPrice(parseFloat(e.target.value))}
              disabled={effectiveAutoFloor >= item.selling_price}
              className="mt-4 w-full accent-indigo-600 dark:accent-sky-500"
            />
            {effectiveAutoFloor >= item.selling_price && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                Auto bargaining is not possible for this product — the floor is above the selling price.
              </p>
            )}
          </div>
        ) : (
          <div className="mt-5">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Selling Price for this Customer
            </label>
            <input
              type="number"
              step="0.01"
              min={effectiveManualFloor}
              max={item.selling_price}
              value={manualPrice}
              onChange={(e) => handleManualPriceChange(parseFloat(e.target.value) || 0)}
              className="mt-1 block w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-indigo-500 dark:focus:border-sky-400 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-sky-900 outline-none"
            />
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Cannot go below {formatPrice(effectiveManualFloor)} (cost price) or above {formatPrice(item.selling_price)}.
            </p>

            {steps.length > 0 && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Bargain Steps</label>
                <div className="flex flex-wrap gap-2">
                  {steps.map((step) => {
                    const selected = selectedSteps.includes(step);
                    return (
                      <button
                        key={step}
                        type="button"
                        onClick={() => handleStepToggle(step)}
                        className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all active:scale-95 ${
                          selected
                            ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-sky-500 dark:bg-sky-900/30 dark:text-sky-400"
                            : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        -{formatPrice(step)}
                      </button>
                    );
                  })}
                </div>
                {selectedSteps.length > 0 && (
                  <div className="mt-3 rounded-xl border border-indigo-200 dark:border-sky-900 bg-indigo-50 dark:bg-sky-900/20 px-4 py-3">
                    <p className="text-xs text-indigo-600 dark:text-sky-400">Total reduction: {formatPrice(stepSum)}</p>
                    <p className="text-sm font-bold text-indigo-700 dark:text-sky-400 mt-0.5">
                      New price: {formatPrice(item.selling_price - stepSum)}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-xl bg-rose-50 dark:bg-rose-900/20 px-4 py-2.5 text-sm font-medium text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition-transform"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="rounded-xl bg-indigo-600 dark:bg-sky-500 px-6 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 dark:hover:bg-sky-600 active:scale-95 transition-transform"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

function CartRow({
  item,
  bargainEnabled,
  onQtyChange,
  onRemove,
  onBargain,
}: {
  item: CartItem;
  bargainEnabled: boolean;
  onQtyChange: (id: number, qty: number) => void;
  onRemove: (id: number) => void;
  onBargain: (item: CartItem) => void;
}) {
  const { formatPrice } = useCurrency();
  const unitPrice = cartUnitPrice(item);
  const subtotal = cartSubtotal(item);
  const packs = bulkUnits(item);
  const showBulk = item.bulk_enabled && packs > 0;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-slate-800 dark:text-white">{item.name}</p>
          {showBulk && (
            <span className="shrink-0 rounded-md bg-sky-100 dark:bg-sky-950/50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-600 dark:text-sky-400">
              Bulk {packs}×
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {item.bargainPrice != null ? (
            <>
              <span className="line-through">{formatPrice(item.selling_price)}</span>{" "}
              <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatPrice(unitPrice)} each</span>
            </>
          ) : showBulk ? (
            <>
              <span className="line-through">{formatPrice(item.selling_price * item.quantity)}</span>{" "}
              <span className="font-bold text-sky-600 dark:text-sky-400">
                {formatPrice(item.bulk_price ?? 0)} × {packs} pack{packs > 1 ? "s" : ""}
              </span>
            </>
          ) : (
            <>{formatPrice(item.selling_price)} each</>
          )}
        </p>
      </div>

      <div className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1">
        <button
          id={`qty-down-${item.id}`}
          type="button"
          onClick={() => onQtyChange(item.id, item.quantity - 1)}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-transform"
          aria-label="Decrease quantity"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5" />
          </svg>
        </button>
        <span className="w-8 text-center text-sm font-bold text-slate-800 dark:text-white">{item.quantity}</span>
        <button
          id={`qty-up-${item.id}`}
          type="button"
          onClick={() => onQtyChange(item.id, item.quantity + 1)}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-transform"
          aria-label="Increase quantity"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M19 12H5" />
          </svg>
        </button>
      </div>

      <span className="w-20 text-right text-sm font-bold text-slate-800 dark:text-white">{formatPrice(subtotal)}</span>

      {bargainEnabled && item.bargain_enabled && (
        <button
          id={`bargain-${item.id}`}
          type="button"
          onClick={() => onBargain(item)}
          className="flex h-7 items-center gap-1 rounded-xl bg-amber-50 dark:bg-amber-900/20 px-2 text-xs font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
          title="Bargain this item"
        >
          {item.bargainPrice != null ? "🔄" : "🪙"}
        </button>
      )}

      <button
        id={`remove-${item.id}`}
        type="button"
        onClick={() => onRemove(item.id)}
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl text-slate-300 dark:text-slate-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:text-rose-500 transition-colors"
        aria-label="Remove item"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

interface BorrowerOption {
  id: number;
  barcode: string;
  full_name: string;
  government_id_number: string;
  max_lending_amount: number;
  outstanding_amount?: number;
}

function BorrowCardModal({
  cart,
  onClose,
  onComplete,
}: {
  cart: CartItem[];
  onClose: () => void;
  onComplete: () => void;
}) {
  const { formatPrice } = useCurrency();
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<BorrowerOption[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<BorrowerOption | null>(null);
  const [borrowType, setBorrowType] = useState<"sales_credit" | "layaway">("sales_credit");
  const [durationType, setDurationType] = useState<"day" | "month" | "year">("month");
  const [durationValue, setDurationValue] = useState(1);
  const [installmentInterval, setInstallmentInterval] = useState<"none" | "day" | "month" | "year">("none");
  const [installmentValue, setInstallmentValue] = useState(1);
  const [downpaymentPct, setDownpaymentPct] = useState(0);
  const [lateFee, setLateFee] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [limitToast, setLimitToast] = useState(false);
  const [items, setItems] = useState<{ id: number; quantity: number }[]>(
    () => cart.map((c) => ({ id: c.id, quantity: c.quantity }))
  );
  const debounceRef = useRef<number | null>(null);

  const lineTotal = (id: number) => {
    const item = cart.find((c) => c.id === id);
    if (!item) return 0;
    const qty = items.find((i) => i.id === id)?.quantity ?? 0;
    return cartSubtotal({ ...item, quantity: qty });
  };
  const total = items.reduce((sum, it) => sum + lineTotal(it.id), 0);
  const downpaymentAmount = (total * downpaymentPct) / 100;

  const maxLendingExceeded =
    !!selectedAccount &&
    Number(selectedAccount.max_lending_amount) > 0 &&
    total + Number(selectedAccount.outstanding_amount || 0) > Number(selectedAccount.max_lending_amount);

  const prevExceeded = useRef(false);
  useEffect(() => {
    if (maxLendingExceeded && !prevExceeded.current) setLimitToast(true);
    prevExceeded.current = maxLendingExceeded;
  }, [maxLendingExceeded]);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!selectedAccount) {
      setSearchResults([]);
      return;
    }
  }, [selectedAccount]);

  useEffect(() => {
    if (!search.trim()) {
      setSearchResults([]);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/lending/accounts/search?q=${encodeURIComponent(search)}`);
        const data = await res.json();
        setSearchResults(data);
      } catch {
        setSearchResults([]);
      }
    }, 250);
  }, [search]);

  const layaway = borrowType === "layaway";
  const downpaymentOptions = layaway ? [20, 30, 40] : [30, 50, 60];

  const handleProcess = async () => {
    if (!selectedAccount) {
      setError("Please select a borrower account.");
      return;
    }
    if (items.length === 0) {
      setError("No items in the borrow card.");
      return;
    }
    if (downpaymentPct <= 0) {
      setError("Please select a downpayment percentage.");
      return;
    }
    if (maxLendingExceeded) {
      setError(
        `Borrow total (${formatPrice(total)}) exceeds this borrower's max lending amount (${formatPrice(Number(selectedAccount.max_lending_amount))}).`
      );
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/lending/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lending_account_id: selectedAccount.id,
          borrow_type: borrowType,
          duration_type: durationType,
          duration_value: durationValue,
          installment_interval: installmentInterval,
          installment_value: installmentValue,
          downpayment_percentage: downpaymentPct,
          late_fee: Number(lateFee) || 0,
          items: items
            .filter((it) => it.quantity > 0)
            .map((it) => {
              const item = cart.find((c) => c.id === it.id);
              return {
                product_id: it.id,
                quantity: it.quantity,
                unit_price: item ? cartUnitPrice(item) : 0,
              };
            }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to create borrow card");
      setSuccess(`Borrow card ${data.card_code} created successfully! Downpayment of ${formatPrice(data.downpayment_amount ?? downpaymentAmount)} deducted; balance of ${formatPrice(data.amount_due ?? (total - downpaymentAmount))} remains.`);
      setTimeout(() => {
        onComplete();
      }, 1500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Create Borrow Card</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 dark:bg-red-950/20 p-3 text-sm text-red-600 dark:text-red-400 border border-red-200 dark:border-red-950">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 p-3 text-sm text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-950">
            {success}
          </div>
        )}

        {/* Account selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Select Borrower Account</label>
          {selectedAccount ? (
            <div className="mt-1 flex items-center justify-between rounded-xl border border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/20 px-4 py-2.5">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-white">{selectedAccount.full_name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedAccount.government_id_number || "—"} · {selectedAccount.barcode}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAccount(null)}
                className="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => searchResults.length > 0 && setSearchResults(searchResults)}
                placeholder="Search by name, government ID, or barcode…"
                className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
              />
              {searchResults.length > 0 && (
                <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl">
                  {searchResults.map((acc) => (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => { setSelectedAccount(acc); setSearch(""); setSearchResults([]); }}
                      className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-sky-50 dark:hover:bg-slate-800"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-white">{acc.full_name}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          {acc.government_id_number || "—"} · {acc.barcode}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Borrow type */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Type of Borrow</label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: "sales_credit", label: "Sales Credit" },
              { value: "layaway", label: "Layaway" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { setBorrowType(opt.value as any); setDownpaymentPct(0); }}
                className={`rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-colors ${
                  borrowType === opt.value
                    ? "border-sky-500 bg-sky-50 dark:bg-sky-950/20 text-sky-700 dark:text-sky-400"
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Duration of Lending</label>
          <div className="flex gap-3 mb-2">
            {[
              { value: "day", label: "Day" },
              { value: "month", label: "Month" },
              { value: "year", label: "Year" },
            ].map((opt) => (
              <label key={opt.value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="duration_type"
                  checked={durationType === opt.value}
                  onChange={() => setDurationType(opt.value as any)}
                  className="accent-sky-600"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">{opt.label}</span>
              </label>
            ))}
          </div>
          <input
            type="number"
            min={1}
            value={durationValue}
            onChange={(e) => setDurationValue(Math.max(1, parseInt(e.target.value) || 1))}
            className="block w-32 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
          />
        </div>

        {/* Downpayment */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Downpayment Percentage</label>
          <div className="flex gap-3">
            {downpaymentOptions.map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => setDownpaymentPct(pct)}
                className={`rounded-xl border-2 px-4 py-2 text-sm font-semibold transition-colors ${
                  downpaymentPct === pct
                    ? "border-sky-500 bg-sky-50 dark:bg-sky-950/20 text-sky-700 dark:text-sky-400"
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                }`}
              >
                {pct}%
              </button>
            ))}
          </div>
          <div className="mt-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-4 py-3 flex justify-between text-sm">
            <span className="text-slate-500 dark:text-slate-400">Calculated Downpayment ({downpaymentPct}%) — deducted at creation</span>
            <span className="font-bold text-slate-800 dark:text-white">{formatPrice(downpaymentAmount)}</span>
          </div>
          <div className="mt-1 rounded-xl bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900 px-4 py-3 flex justify-between text-sm">
            <span className="text-slate-500 dark:text-slate-400">Amount Due (remaining balance)</span>
            <span className="font-bold text-indigo-700 dark:text-sky-400">{formatPrice(total - downpaymentAmount)}</span>
          </div>
        </div>

        {/* Installment interval */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Installment Interval</label>
          <div className="flex gap-3 mb-2">
            {(
              [
                { value: "none", label: "None" },
                { value: "day", label: "Day" },
                { value: "month", label: "Month" },
                { value: "year", label: "Year" },
              ] as const
            ).map((opt) => (
              <label key={opt.value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="installment_interval"
                  checked={installmentInterval === opt.value}
                  onChange={() => setInstallmentInterval(opt.value as any)}
                  className="accent-sky-600"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">{opt.label}</span>
              </label>
            ))}
          </div>
          {installmentInterval !== "none" && (
            <div className="flex items-center gap-3">
              <label className="text-xs text-slate-500 dark:text-slate-400">Every</label>
              <input
                type="number"
                min={1}
                value={installmentValue}
                onChange={(e) => setInstallmentValue(Math.max(1, parseInt(e.target.value) || 1))}
                className="block w-32 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
              />
              <label className="text-xs text-slate-500 dark:text-slate-400">{installmentInterval}</label>
            </div>
          )}
        </div>

        {/* Late fee */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Late Fee</label>
          <input
            type="number"
            value={lateFee}
            onChange={(e) => setLateFee(parseFloat(e.target.value) || 0)}
            className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
          />
        </div>

        {/* Items */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Items ({items.length})</label>
          <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
            {items.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-slate-400 dark:text-slate-500">No items in the borrow card.</div>
            ) : (
              items.map((li) => {
                const item = cart.find((c) => c.id === li.id);
                if (!item) return null;
                const qty = li.quantity;
                return (
                  <div key={li.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-white">{item.name}</p>
                      <p className="text-xs text-slate-400">{formatPrice(cartUnitPrice(item))} each</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700">
                        <button
                          type="button"
                          onClick={() =>
                            setItems((prev) =>
                              prev.map((rv) =>
                                rv.id === li.id ? { ...rv, quantity: Math.max(1, rv.quantity - 1) } : rv
                              )
                            )
                          }
                          className="px-2 py-1 text-slate-500 hover:text-slate-800 dark:hover:text-white"
                        >
                          −
                        </button>
                        <span className="w-8 text-center text-sm font-semibold text-slate-800 dark:text-white">{qty}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setItems((prev) =>
                              prev.map((rv) =>
                                rv.id === li.id ? { ...rv, quantity: rv.quantity + 1 } : rv
                              )
                            )
                          }
                          className="px-2 py-1 text-slate-500 hover:text-slate-800 dark:hover:text-white"
                        >
                          +
                        </button>
                      </div>
                      <span className="w-20 text-right font-bold text-slate-800 dark:text-white text-sm">{formatPrice(lineTotal(li.id))}</span>
                      <button
                        type="button"
                        onClick={() => setItems((prev) => prev.filter((rv) => rv.id !== li.id))}
                        className="rounded-full px-2 py-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                        title="Remove item"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="mt-2 flex justify-between text-sm font-bold text-slate-800 dark:text-white">
            <span>Card Total</span>
            <span>{formatPrice(total)}</span>
          </div>
          {maxLendingExceeded && (
            <div className="mt-2 rounded-xl bg-rose-50 dark:bg-rose-950/20 p-3 text-sm text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-950">
              This borrower has reached or passed their borrow limit. Total incl. outstanding ({formatPrice(total + Number(selectedAccount?.outstanding_amount || 0))}) exceeds the max lending amount ({formatPrice(Number(selectedAccount?.max_lending_amount))}). Reduce items or choose a different borrower.
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleProcess}
            disabled={loading || success != null || maxLendingExceeded || items.length === 0}
            className="rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white px-6 py-2.5 text-sm font-bold transition-colors"
          >
            {loading ? "Processing..." : "Process"}
          </button>
        </div>
      </div>

      {limitToast && selectedAccount && (
        <ScanToast
          message={`Borrow total (${formatPrice(total)}) plus outstanding balance (${formatPrice(Number(selectedAccount.outstanding_amount || 0))}) has reached or passed this borrower's borrow limit (${formatPrice(Number(selectedAccount.max_lending_amount))}). Reduce items or choose a different borrower.`}
          type="error"
          onDismiss={() => setLimitToast(false)}
          duration={5000}
        />
      )}
    </div>
  );
}

export default function SalesTerminal() {
  const { formatPrice } = useCurrency();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkoutStatus, setCheckoutStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<{
    invoice: string;
    lines: ReceiptLine[];
    total: number;
    payment: string;
    date: string;
    cashierName: string;
  } | null>(null);
  const [storeName, setStoreName] = useState("GENERAL STORE");
  const [storeLogo, setStoreLogo] = useState("");
  const [storeContact1, setStoreContact1] = useState("");
  const [storeContact2, setStoreContact2] = useState("");
  const [storeEmail, setStoreEmail] = useState("");
  const [storeWebsite, setStoreWebsite] = useState("");
  const [storeLocation, setStoreLocation] = useState("");

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 5000);
  };
  const [cardDisabled, setCardDisabled] = useState(false);
  const [barcodeScannerDisabled, setBarcodeScannerDisabled] = useState(false);
  const [bargainEnabled, setBargainEnabled] = useState(false);
  const [bargainItem, setBargainItem] = useState<CartItem | null>(null);
  const [hasManager1, setHasManager1] = useState<boolean | null>(null);
  const [lendingEnabled, setLendingEnabled] = useState(false);
  const [showLendModal, setShowLendModal] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const auth = getAuth();
  const isManager = auth ? ["admin", "manager1", "manager2"].includes(auth.role) : false;

  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then((res) => res.json()),
      fetch("/api/users/has-manager1").then((res) => res.json()),
    ])
      .then(([settings, managerCheck]) => {
        setCardDisabled(settings.card_button_disabled === "true");
        setBarcodeScannerDisabled(settings.barcode_scanner_disabled === "true");
        setBargainEnabled(settings.bargain_enabled === "true");
        setLendingEnabled(settings.lending_enabled === "true");
        if (settings.store_name && settings.store_name.trim()) setStoreName(settings.store_name.trim());
        if (settings.store_logo) setStoreLogo(settings.store_logo);
        if (settings.store_contact1) setStoreContact1(settings.store_contact1);
        if (settings.store_contact2) setStoreContact2(settings.store_contact2);
        if (settings.store_email) setStoreEmail(settings.store_email);
        if (settings.store_website) setStoreWebsite(settings.store_website);
        if (settings.store_location) setStoreLocation(settings.store_location);
        setHasManager1(managerCheck.exists);
      })
      .catch(() => {
        setHasManager1(false);
      })
      .finally(() => setLoadingConfig(false));
  }, []);

  useEffect(() => {
    if (!receiptPreview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setReceiptPreview(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [receiptPreview]);

  const addToCart = useCallback((product: ProductInfo) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  }, []);

  const scanBarcode = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return;
      try {
        const res = await fetch(`/api/products/lookup?barcode=${encodeURIComponent(trimmed)}`);
        if (!res.ok) {
          showToast("error", `No product found for barcode: ${trimmed}`);
          return;
        }
        const product: ProductInfo = await res.json();
        addToCart(product);
      } catch {
        showToast("error", "Network error. Could not look up barcode.");
      }
    },
    [addToCart, showToast]
  );

  // Hardware (USB / Bluetooth / laser) scanners are keyboard-wedge devices:
  // listen for their fast key bursts for as long as the sales page is open.
  useKeyboardScanner({
    onBarcode: scanBarcode,
    onNoBarcode: () => showToast("error", "No barcode detected — please scan again."),
    captureRef: barcodeInputRef,
  });

  const changeQty = (id: number, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((i) => i.id !== id));
    } else {
      setCart((prev) => prev.map((i) => (i.id === id ? { ...i, quantity: qty } : i)));
    }
  };

  const removeItem = (id: number) => setCart((prev) => prev.filter((i) => i.id !== id));

  const applyBargain = (itemId: number, unitPrice: number, bargainType: "auto" | "manual") => {
    setCart((prev) => prev.map((i) => (i.id === itemId ? { ...i, bargainPrice: unitPrice, bargainType } : i)));
    setBargainItem(null);
  };

  const clearCart = () => {
    setCart([]);
    setCheckoutStatus("idle");
    setErrorMessage(null);
  };

  const handleCheckout = async (paymentMethod: "Cash" | "Card") => {
    if (cart.length === 0) return;
    setCheckoutStatus("loading");
    setErrorMessage(null);
    try {
      const auth = getAuth();
      const response = await fetch("/api/sales", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payment_method: paymentMethod,
          cashier_username: auth?.username || "",
          items: cart.map((item) => ({
            product_id: item.id,
            quantity: item.quantity,
            ...(item.bargainPrice != null
              ? { unit_price: item.bargainPrice, bargain_type: item.bargainType || "auto" }
              : {}),
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Checkout failed");
      }

      const data = await response.json();
      setCheckoutStatus("success");
      const cartSnapshot = receiptLinesFor(cart);
      setCart([]);

      if (data.receipt_printed === true) {
        showToast("success", `Receipt printed successfully (${data.invoice_number})`);
        setReceiptPreview({
          invoice: data.invoice_number,
          lines: cartSnapshot,
          total: data.total_amount ?? cartSnapshot.reduce((s, l) => s + l.totalPrice, 0),
          payment: paymentMethod,
          date: new Date().toLocaleString(),
          cashierName: auth?.username || "",
        });
      } else if (data.receipt_printed === false) {
        showToast("error", `Receipt not printed: ${data.receipt_error || "printer not connected or unavailable"}`);
      }

      setTimeout(() => setCheckoutStatus("idle"), 3000);
    } catch (err: any) {
      setCheckoutStatus("error");
      setErrorMessage(err.message || "An unknown error occurred during checkout");
    }
  };

  const total = cart.reduce((sum, i) => sum + cartSubtotal(i), 0);
  const itemCount = cart.reduce((sum, i) => sum + i.quantity, 0);

  if (loadingConfig) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-sky-500"></div>
      </div>
    );
  }

  if (!hasManager1) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="rounded-3xl bg-white dark:bg-slate-900 p-12 text-center border border-slate-200 dark:border-slate-800 shadow-sm max-w-md">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">System Not Configured</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-4">
            A Manager 1 user must be created and the system currency configured before sales can be made.
          </p>
          <p className="text-sm text-slate-400 dark:text-slate-500">
            Please ask an administrator to create a Manager 1 account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-screen flex-col gap-4 p-1 lg:flex-row lg:gap-6">

      {/* Print status toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-[100] flex items-center gap-3 rounded-2xl px-5 py-4 shadow-xl border max-w-sm animate-[slideIn_0.3s_ease-out]"
          style={{
            backgroundColor: toast.type === "success" ? "var(--color-card)" : "var(--color-card)",
            borderColor: toast.type === "success" ? "#10B981" : "#F43F5E",
            color: "var(--color-text)",
          }}
        >
          <span className="text-2xl">{toast.type === "success" ? "✅" : "❌"}</span>
          <div>
            <p className={`text-sm font-bold ${toast.type === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
              {toast.type === "success" ? "Receipt Printed" : "Print Failed"}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{toast.message}</p>
          </div>
          <button
            onClick={() => setToast(null)}
            className="ml-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* Receipt preview toast (dismiss with Esc / X) */}
      {receiptPreview && (
        <div className="fixed top-4 right-4 z-[110] w-80 max-w-[calc(100vw-2rem)] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-[slideIn_0.3s_ease-out]"
          style={{ backgroundColor: "var(--color-card)", color: "var(--color-text)" }}
        >
          <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-slate-100 dark:border-slate-800">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Receipt Preview</p>
            <button
              onClick={() => setReceiptPreview(null)}
              aria-label="Close receipt preview"
              className="rounded-full p-1.5 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
            <div className="mx-auto font-mono text-[11px] leading-relaxed text-slate-800 dark:text-slate-200">
              <div className="text-center">
                {storeLogo ? (
                  <img src={storeLogo} alt="logo" className="mx-auto mb-1 max-h-10 max-w-[90px] object-contain" />
                ) : (
                  <div className="text-sm font-bold">{storeName}</div>
                )}
                {!storeLogo && <div>&nbsp;</div>}
                <div style={{ color: "var(--color-text-muted)" }}>{storeName}</div>
                <div style={{ color: "var(--color-text-muted)" }}>
                  {[storeContact1, storeContact2, storeEmail, storeWebsite, storeLocation].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className="my-2 text-center">{"=".repeat(34)}</div>
              <div style={{ color: "var(--color-text-muted)" }}>
                <div>Invoice: {receiptPreview.invoice}</div>
                <div>Date: {receiptPreview.date}</div>
                <div>Cashier: {receiptPreview.cashierName || "N/A"}</div>
                <div>Payment: {receiptPreview.payment}</div>
              </div>
              <div className="my-2">{"-".repeat(34)}</div>
              {receiptPreview.lines.map((l, i) => (
                <div key={i}>
                  <div className="flex justify-between">
                    <span className="truncate pr-2">{l.bulk ? `${l.name} (BULK)` : l.name}</span>
                    <span className="shrink-0">{l.quantity} × {formatPrice(l.price)}</span>
                  </div>
                  <div className="flex justify-end">
                    <span>{formatPrice(l.totalPrice)}</span>
                  </div>
                </div>
              ))}
              <div className="my-2">{"-".repeat(34)}</div>
              <div className="flex justify-between font-bold">
                <span>TOTAL</span>
                <span>{formatPrice(receiptPreview.total)}</span>
              </div>
              <div className="my-2 text-center">{"=".repeat(34)}</div>
              <div className="text-center font-bold">THANK YOU!</div>
            </div>
          </div>
          <div className="px-4 py-2 text-center text-[10px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800">
            Press <kbd className="rounded bg-slate-100 dark:bg-slate-800 px-1">Esc</kbd> or click ✕ to close
          </div>
        </div>
      )}

      {/* LEFT COLUMN: Search + Barcode */}
      <div className="flex flex-col gap-4 lg:w-[55%]">

        <div className="rounded-3xl bg-gradient-to-br from-indigo-600 dark:from-sky-500 to-violet-600 dark:to-sky-600 px-6 py-5 text-white shadow-md">
          <h1 className="text-2xl font-bold tracking-tight">Sales Terminal</h1>
          <p className="mt-0.5 text-sm text-indigo-200 dark:text-sky-200">Search or scan products to build your cart</p>
        </div>

        <div className="rounded-3xl bg-white dark:bg-slate-900 p-5 shadow-sm border border-slate-200 dark:border-slate-700">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            🔍 Product Search
          </h2>
          <SearchBar onSelect={addToCart} />
        </div>

        {!barcodeScannerDisabled && (
          <div className="rounded-3xl bg-white dark:bg-slate-900 p-5 shadow-sm border border-slate-200 dark:border-slate-700">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              📷 Barcode Scanner
            </h2>
            <BarcodeScanner onProductScanned={addToCart} inputRef={barcodeInputRef} />
          </div>
        )}
      </div>

      {/* RIGHT COLUMN: Checkout */}
      <div className="flex flex-col gap-4 lg:w-[45%]">
        <div className="sticky top-4 flex flex-col gap-4">

          <div className="flex items-center justify-between rounded-3xl bg-white dark:bg-slate-900 px-5 py-4 shadow-sm border border-slate-200 dark:border-slate-700">
            <div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-white">Checkout</h2>
              <p className="text-xs text-slate-400 dark:text-slate-500">{itemCount} item{itemCount !== 1 ? "s" : ""} in cart</p>
            </div>
            {cart.length > 0 && (
              <button
                id="clear-cart"
                type="button"
                onClick={clearCart}
                className="rounded-xl bg-rose-50 dark:bg-rose-900/20 px-3 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 p-4 shadow-sm border border-slate-200 dark:border-slate-700">
            {checkoutStatus === "success" && (
              <div className="mb-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 p-4 text-sm font-medium text-emerald-600 dark:text-emerald-400 text-center border border-emerald-200 dark:border-emerald-950">
                🎉 Checkout completed successfully!
              </div>
            )}
            {checkoutStatus === "error" && errorMessage && (
              <div className="mb-3 rounded-2xl bg-rose-50 dark:bg-rose-950/20 p-4 text-sm font-medium text-rose-600 dark:text-rose-400 text-center border border-rose-200 dark:border-rose-950">
                ❌ {errorMessage}
              </div>
            )}
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-3 text-5xl">🛒</div>
                <p className="text-sm font-medium text-slate-400 dark:text-slate-500">Cart is empty</p>
                <p className="mt-1 text-xs text-slate-300 dark:text-slate-600">Search a product or scan a barcode to get started</p>
              </div>
            ) : (
              <div className="space-y-2">
                {cart.map((item) => (
                  <CartRow
                    key={item.id}
                    item={item}
                    bargainEnabled={bargainEnabled}
                    onQtyChange={changeQty}
                    onRemove={removeItem}
                    onBargain={setBargainItem}
                  />
                ))}
              </div>
            )}
          </div>

          {cart.length > 0 && (
            <div className="rounded-3xl bg-white dark:bg-slate-900 p-5 shadow-sm border border-slate-200 dark:border-slate-700">
              <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatPrice(total)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500">
                  <span>Tax (0%)</span>
                  <span>{formatPrice(0)}</span>
                </div>
                <div className="mt-2 border-t border-slate-100 dark:border-slate-700 pt-2 flex justify-between text-base font-bold text-slate-800 dark:text-white">
                  <span>Total</span>
                  <span className="text-indigo-700 dark:text-sky-400">{formatPrice(total)}</span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  id="checkout-cash"
                  type="button"
                  disabled={checkoutStatus === "loading"}
                  onClick={() => handleCheckout("Cash")}
                  className="rounded-2xl border-2 border-indigo-200 dark:border-sky-900 bg-indigo-50 dark:bg-sky-900/20 py-3 text-sm font-bold text-indigo-700 dark:text-sky-400 hover:bg-indigo-100 dark:hover:bg-sky-900/30 active:scale-95 transition-all disabled:opacity-50"
                >
                  {checkoutStatus === "loading" ? "..." : "💵 Cash"}
                </button>
                <button
                  id="checkout-card"
                  type="button"
                  disabled={checkoutStatus === "loading" || cardDisabled}
                  onClick={() => handleCheckout("Card")}
                  className={`rounded-2xl py-3 text-sm font-bold active:scale-95 transition-all disabled:opacity-50 ${
                    cardDisabled
                      ? "bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed"
                      : "bg-indigo-600 dark:bg-sky-500 text-white hover:bg-indigo-700 dark:hover:bg-sky-600"
                  }`}
                >
                  {checkoutStatus === "loading" ? "..." : cardDisabled ? "🚫 Card" : "💳 Card"}
                </button>
                {lendingEnabled && isManager && (
                  <button
                    id="checkout-lend"
                    type="button"
                    disabled={checkoutStatus === "loading"}
                    onClick={() => setShowLendModal(true)}
                    className="col-span-2 rounded-2xl border-2 border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-900/20 py-3 text-sm font-bold text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 active:scale-95 transition-all disabled:opacity-50"
                  >
                    🏦 Lend
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {bargainItem && (
        <BargainModal
          item={bargainItem}
          isManager={isManager}
          onClose={() => setBargainItem(null)}
          onApply={applyBargain}
        />
      )}
      {showLendModal && (
        <BorrowCardModal
          cart={cart}
          onClose={() => setShowLendModal(false)}
          onComplete={() => { setCart([]); setShowLendModal(false); }}
        />
      )}
    </div>
  );
}
