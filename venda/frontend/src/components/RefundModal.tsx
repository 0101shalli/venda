import { useState } from "react";
import { useCurrency } from "../context/CurrencyContext";
import { generateBarcode } from "../utils/barcode";
import { StoreCredit, CreditBarcode, printCreditCard } from "./creditsShared";

export interface RefundOrderItem {
  sku: string;
  name: string;
  category: string;
  unit_price: number;
  quantity: number;
  total_price: number;
  sale_item_id?: number | null;
  product_id?: number | null;
  refundable?: boolean;
  credit_discount_percentage?: number | null;
  credit_duration_days?: number | null;
  expiry_date?: string | null;
}

interface Props {
  item: RefundOrderItem;
  orderId: number;
  onClose: () => void;
  onRefunded: () => void;
}

export default function RefundModal({ item, orderId, onClose, onRefunded }: Props) {
  const { formatPrice } = useCurrency();
  const [quantity, setQuantity] = useState(item.quantity);
  const [clientName, setClientName] = useState("");
  const [clientAge, setClientAge] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [creditCode] = useState(() => generateBarcode());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCredit, setSavedCredit] = useState<StoreCredit | null>(null);
  const [printToast, setPrintToast] = useState<string | null>(null);

  const discount = Math.min(Math.max(item.credit_discount_percentage ?? 0, 0), 100);
  const unitCredit = item.unit_price * (1 - discount / 100);
  const creditAmount = unitCredit * quantity;
  const expiryDate = item.expiry_date?.split("T")[0] ?? "—";

  const handleProcess = async () => {
    if (!clientName.trim()) {
      setError("Client name is required.");
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      setError("Quantity must be at least 1.");
      return;
    }
    if (quantity > item.quantity) {
      setError(`You can only refund up to ${item.quantity} item(s).`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sale_id: orderId,
          sale_item_id: item.sale_item_id,
          product_id: item.product_id,
          quantity,
          client_name: clientName.trim(),
          client_age: clientAge.trim(),
          client_address: clientAddress.trim(),
          credit_code: creditCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Refund failed");
      setSavedCredit(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refund failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = async () => {
    if (!savedCredit) return;
    const result = await printCreditCard(savedCredit, formatPrice(savedCredit.amount));
    setPrintToast(result.success ? result.message : `⚠️ ${result.message}`);
  };

  const handleDone = () => {
    onRefunded();
    onClose();
  };

  if (savedCredit) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
        <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Store Credit Created</h3>
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

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                <div className="text-lg font-bold text-slate-800 dark:text-slate-100">STORE CREDIT</div>
                <div>Client: <span className="font-medium text-slate-700 dark:text-slate-300">{savedCredit.client_name}</span></div>
                <div>Address: <span className="font-medium text-slate-700 dark:text-slate-300">{savedCredit.client_address || "—"}</span></div>
                <div>Product: <span className="font-medium text-slate-700 dark:text-slate-300">{savedCredit.product_name}</span></div>
                <div>Expiry: <span className="font-medium text-slate-700 dark:text-slate-300">{savedCredit.expiry_date?.split("T")[0] ?? "—"}</span></div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400 dark:text-slate-500">CREDIT VALUE</div>
                <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{formatPrice(savedCredit.amount)}</div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col items-center gap-1">
              <CreditBarcode value={savedCredit.credit_code} />
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-2">
            {printToast && (
              <div className={`rounded-xl px-4 py-3 text-sm text-center border ${
                printToast.startsWith("⚠️")
                  ? "bg-goldle-50 dark:bg-goldle-950/20 text-goldle-600 dark:text-goldle-400 border-goldle-200 dark:border-goldle-900"
                  : "bg-green-50 dark:bg-green-950/20 text-green-600 dark:text-green-400 border-green-200 dark:border-green-900"
              }`}>
                {printToast.replace("⚠️ ", "")}
              </div>
            )}
            <button
              type="button"
              onClick={handlePrint}
              className="w-full rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 transition-colors"
            >
              🖨️ Print Credit Card
            </button>
            <button
              type="button"
              onClick={handleDone}
              className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-medium py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Refund Item</h3>
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

        <div className="space-y-4">
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4 space-y-2">
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{item.name}</div>
              <div className="text-xs font-mono text-slate-500 dark:text-slate-400">{item.sku}</div>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Category: {item.category}</div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 dark:text-slate-400">
                Unit price <span className="line-through">{formatPrice(item.unit_price)}</span>
                {discount > 0 && (
                  <span className="ml-2 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-xs px-2 py-0.5 font-semibold">
                    {discount}% credit
                  </span>
                )}
              </span>
              <span className="font-semibold text-slate-800 dark:text-slate-100">{formatPrice(unitCredit)}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
              <span>Quantity sold</span>
              <span className="font-medium text-slate-700 dark:text-slate-300">{item.quantity}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
              <span>Total price</span>
              <span className="font-medium text-slate-700 dark:text-slate-300">{formatPrice(item.total_price)}</span>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Expiry date: {expiryDate}</div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
              Quantity to Refund (max {item.quantity})
            </label>
            <input
              type="number"
              min={1}
              max={item.quantity}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
              className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
              Client Name *
            </label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Full name of client"
              className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                Age
              </label>
              <input
                type="text"
                value={clientAge}
                onChange={(e) => setClientAge(e.target.value)}
                placeholder="e.g. 30"
                className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                Address
              </label>
              <input
                type="text"
                value={clientAddress}
                onChange={(e) => setClientAddress(e.target.value)}
                placeholder="Home / Delivery address"
                className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Total Credit Value</div>
              <div className="text-lg font-bold text-slate-800 dark:text-slate-100">{formatPrice(creditAmount)}</div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <CreditBarcode value={creditCode} />
              <span className="text-[10px] text-slate-500 dark:text-slate-400">Credit code</span>
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 dark:bg-red-950/20 text-red-500 dark:text-red-400 text-sm px-4 py-3 text-center border border-red-200 dark:border-red-950">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-medium py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleProcess}
              disabled={submitting}
              className="flex-1 rounded-2xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 transition-colors"
            >
              {submitting ? "Processing..." : "Process Refund"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}