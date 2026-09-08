import { useEffect, useState } from "react";
import { useCurrency } from "../context/CurrencyContext";
import { StoreCredit, CreditBarcode, printCreditCard } from "./creditsShared";

interface Props {
  refreshKey: number;
  onClose: () => void;
}

type StatusFilter = "all" | StoreCredit["status"];

const STATUS_LABEL: Record<StoreCredit["status"], string> = {
  unclaimed: "Unclaimed",
  unavailable: "Unavailable",
  claimed: "Claimed",
  cancelled: "Cancelled",
};

const STATUS_STYLE: Record<StoreCredit["status"], string> = {
  unclaimed: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400",
  unavailable: "bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400",
  claimed: "bg-sky-100 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400",
  cancelled: "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 line-through",
};

export default function ViewCreditsModal({ refreshKey, onClose }: Props) {
  const { formatPrice } = useCurrency();
  const [credits, setCredits] = useState<StoreCredit[]>([]);
  const [summary, setSummary] = useState({ unclaimed: 0, unavailable: 0, claimed: 0, cancelled: 0 });
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [printingId, setPrintingId] = useState<number | null>(null);
  const [printNotice, setPrintNotice] = useState<string | null>(null);

  const loadCredits = () => {
    fetch("/api/credits")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch credits");
        return res.json();
      })
      .then((data) => {
        setCredits(data.credits ?? []);
        setSummary(data.summary ?? { unclaimed: 0, unavailable: 0, claimed: 0, cancelled: 0 });
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    setLoading(true);
    setError(null);
    loadCredits();
  }, [refreshKey]);

  const filtered =
    filter === "all" ? credits : credits.filter((c) => c.status === filter);

  const handleCancel = (credit: StoreCredit) => {
    if (!window.confirm(`Cancel this store credit (${formatPrice(credit.amount)}) for ${credit.client_name}?`)) return;
    setCancellingId(credit.id);
    setCancelError(null);
    fetch(`/api/credits/${credit.id}/cancel`, { method: "POST" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.detail || "Failed to cancel credit");
        loadCredits();
      })
      .catch((err) => {
        setCancelError(err.message);
      })
      .finally(() => setCancellingId(null));
  };

  const handlePrint = async (credit: StoreCredit) => {
    setPrintingId(credit.id);
    setPrintNotice(null);
    const result = await printCreditCard(credit, formatPrice(credit.amount));
    setPrintingId(null);
    setPrintNotice(result.message);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Store Credits</h3>
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

        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 p-3 text-center">
            <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Unclaimed</div>
            <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{formatPrice(summary.unclaimed)}</div>
          </div>
          <div className="rounded-2xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 p-3 text-center">
            <div className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider">Unavailable</div>
            <div className="text-lg font-bold text-red-700 dark:text-red-300">{formatPrice(summary.unavailable)}</div>
          </div>
          <div className="rounded-2xl bg-sky-50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-900 p-3 text-center">
            <div className="text-xs font-semibold text-sky-600 dark:text-sky-400 uppercase tracking-wider">Claimed</div>
            <div className="text-lg font-bold text-sky-700 dark:text-sky-300">{formatPrice(summary.claimed)}</div>
          </div>
          <div className="rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 text-center">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Cancelled</div>
            <div className="text-lg font-bold text-slate-600 dark:text-slate-300 line-through">{formatPrice(summary.cancelled)}</div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-3">
          <div>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as StatusFilter)}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
            >
              <option value="all">All statuses</option>
              <option value="unclaimed">Unclaimed</option>
              <option value="unavailable">Unavailable</option>
              <option value="claimed">Claimed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {cancelError && (
          <div className="mb-3 rounded-xl bg-red-50 dark:bg-red-950/20 p-3 text-sm text-red-600 dark:text-red-400 border border-red-200 dark:border-red-950">
            {cancelError}
          </div>
        )}

        {printNotice && (
          <div className="mb-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 p-3 text-sm text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-950">
            {printNotice}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-sky-500"></div>
          </div>
        ) : error ? (
          <div className="rounded-2xl bg-red-50 dark:bg-red-950/20 p-6 text-red-500 dark:text-red-400 text-center border border-red-200 dark:border-red-950">
            Error: {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-10 text-center text-slate-500 dark:text-slate-400">
            No credits found.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {filtered.map((c) => {
              const expired = c.status === "unavailable";
              const cancellable = c.status === "unclaimed" || expired;
              return (
                <div
                  key={c.id}
                  className={`rounded-2xl border p-4 flex flex-col gap-3 sm:flex-row sm:items-center justify-between ${
                    c.status === "cancelled"
                      ? "border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 opacity-70"
                      : expired
                      ? "border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/10"
                      : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                  }`}
                >
                  <div className={`flex-1 min-w-0 ${c.status === "cancelled" ? "line-through" : ""}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{c.credit_code}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[c.status]}`}>
                        {STATUS_LABEL[c.status]}
                      </span>
                    </div>
                    <div className="mt-1 font-semibold text-slate-800 dark:text-slate-200">{c.client_name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{c.product_name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Expiry: {c.expiry_date?.split("T")[0] ?? "—"}
                    </div>
                    <div className="mt-1 font-bold text-slate-800 dark:text-slate-100">{formatPrice(c.amount)}</div>
                  </div>
                  {cancellable && (
                    <button
                      type="button"
                      onClick={() => handleCancel(c)}
                      disabled={cancellingId === c.id}
                      className="shrink-0 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white px-4 py-2 text-sm font-semibold transition-colors"
                    >
                      {cancellingId === c.id ? "Cancelling..." : "Cancel"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handlePrint(c)}
                    disabled={printingId === c.id}
                    className="shrink-0 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-semibold transition-colors"
                  >
                    {printingId === c.id ? "Printing..." : "🖨️ Print"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
