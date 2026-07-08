import { useState, useEffect, useRef, useCallback } from "react";
import BarcodeScanner, { ProductInfo } from "../components/BarcodeScanner";

type CartItem = ProductInfo & { quantity: number };

function SearchBar({ onSelect }: { onSelect: (p: ProductInfo) => void }) {
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

  // Close dropdown on outside click
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
              <span className="ml-4 font-bold text-indigo-700 dark:text-sky-400">${p.selling_price.toFixed(2)}</span>
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

function CartRow({
  item,
  onQtyChange,
  onRemove,
}: {
  item: CartItem;
  onQtyChange: (id: number, qty: number) => void;
  onRemove: (id: number) => void;
}) {
  const subtotal = item.selling_price * item.quantity;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3">
      {/* Product info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-800 dark:text-white">{item.name}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500">${item.selling_price.toFixed(2)} each</p>
      </div>

      {/* Quantity stepper */}
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

      {/* Subtotal */}
      <span className="w-20 text-right text-sm font-bold text-slate-800 dark:text-white">${subtotal.toFixed(2)}</span>

      {/* Remove */}
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

export default function SalesTerminal() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkoutStatus, setCheckoutStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  const changeQty = (id: number, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((i) => i.id !== id));
    } else {
      setCart((prev) => prev.map((i) => (i.id === id ? { ...i, quantity: qty } : i)));
    }
  };

  const removeItem = (id: number) => setCart((prev) => prev.filter((i) => i.id !== id));

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
      const response = await fetch("/api/sales", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payment_method: paymentMethod,
          items: cart.map((item) => ({
            product_id: item.id,
            quantity: item.quantity,
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Checkout failed");
      }

      setCheckoutStatus("success");
      setCart([]);
      setTimeout(() => setCheckoutStatus("idle"), 3000);
    } catch (err: any) {
      setCheckoutStatus("error");
      setErrorMessage(err.message || "An unknown error occurred during checkout");
    }
  };

  const total = cart.reduce((sum, i) => sum + i.selling_price * i.quantity, 0);
  const itemCount = cart.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div className="flex h-full min-h-screen flex-col gap-4 p-1 lg:flex-row lg:gap-6">

      {/* ── LEFT COLUMN: Search + Barcode ── */}
      <div className="flex flex-col gap-4 lg:w-[55%]">

        {/* Page header */}
        <div className="rounded-3xl bg-gradient-to-br from-indigo-600 dark:from-sky-500 to-violet-600 dark:to-sky-600 px-6 py-5 text-white shadow-md">
          <h1 className="text-2xl font-bold tracking-tight">Sales Terminal</h1>
          <p className="mt-0.5 text-sm text-indigo-200 dark:text-sky-200">Search or scan products to build your cart</p>
        </div>

        {/* Product search */}
        <div className="rounded-3xl bg-white dark:bg-slate-900 p-5 shadow-sm border border-slate-200 dark:border-slate-700">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            🔍 Product Search
          </h2>
          <SearchBar onSelect={addToCart} />
        </div>

        {/* Barcode scanner */}
        <div className="rounded-3xl bg-white dark:bg-slate-900 p-5 shadow-sm border border-slate-200 dark:border-slate-700">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            📷 Barcode Scanner
          </h2>
          <BarcodeScanner onProductScanned={addToCart} />
        </div>
      </div>

      {/* ── RIGHT COLUMN: Checkout ── */}
      <div className="flex flex-col gap-4 lg:w-[45%]">
        <div className="sticky top-4 flex flex-col gap-4">

          {/* Cart header */}
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

          {/* Cart items */}
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
                    onQtyChange={changeQty}
                    onRemove={removeItem}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Order summary + checkout */}
          {cart.length > 0 && (
            <div className="rounded-3xl bg-white dark:bg-slate-900 p-5 shadow-sm border border-slate-200 dark:border-slate-700">
              <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>${total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500">
                  <span>Tax (0%)</span>
                  <span>$0.00</span>
                </div>
                <div className="mt-2 border-t border-slate-100 dark:border-slate-700 pt-2 flex justify-between text-base font-bold text-slate-800 dark:text-white">
                  <span>Total</span>
                  <span className="text-indigo-700 dark:text-sky-400">${total.toFixed(2)}</span>
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
                  disabled={checkoutStatus === "loading"}
                  onClick={() => handleCheckout("Card")}
                  className="rounded-2xl bg-indigo-600 dark:bg-sky-500 py-3 text-sm font-bold text-white hover:bg-indigo-700 dark:hover:bg-sky-600 active:scale-95 transition-all disabled:opacity-50"
                >
                  {checkoutStatus === "loading" ? "..." : "💳 Card"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
