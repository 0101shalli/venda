import { useCallback, useRef, useState } from "react";
import CameraScanner from "./CameraScanner";
import ScanToast from "./ScanToast";
import { useKeyboardScanner } from "../hooks/useKeyboardScanner";
import { useCurrency } from "../context/CurrencyContext";
import { StoreCredit, CreditBarcode } from "./creditsShared";

interface Props {
  onClose: () => void;
  onClaimed: () => void;
  refreshKey?: number;
}

const STATUS_LABEL: Record<StoreCredit["status"], string> = {
  unclaimed: "Unclaimed",
  unavailable: "Unavailable",
  claimed: "Claimed",
  cancelled: "Cancelled",
};

export default function CreditProcessModal({ onClose, onClaimed }: Props) {
  const { formatPrice } = useCurrency();
  const [barcode, setBarcode] = useState("");
  const [credit, setCredit] = useState<StoreCredit | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
  }, []);

  const lookup = async (code: string) => {
    if (!code.trim()) return;
    setLookingUp(true);
    setToast(null);
    try {
      const res = await fetch(`/api/credits/lookup?barcode=${encodeURIComponent(code.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Credit not found");
      setCredit(data);
      if (data.status === "unavailable") {
        showToast("error", "This credit has expired and can no longer be claimed.");
      } else if (data.status === "cancelled") {
        showToast("error", "This credit has been cancelled and can no longer be claimed.");
      } else if (data.status === "claimed") {
        showToast("error", "This credit has already been claimed.");
      } else if (data.status === "unclaimed") {
        showToast("success", `Credit found — ${data.product_name} (${formatPrice(data.amount)})`);
      }
    } catch (err) {
      setCredit(null);
      showToast("error", err instanceof Error ? err.message : "Credit not found");
    } finally {
      setLookingUp(false);
    }
  };

  useKeyboardScanner({
    enabled: true,
    captureRef: inputRef,
    onBarcode: (code) => {
      setBarcode(code);
      lookup(code);
    },
    onNoBarcode: () => showToast("error", "No barcode detected — please scan again."),
  });

  const handleCameraScan = (code: string) => {
    setCameraOpen(false);
    setBarcode(code);
    lookup(code);
  };

  const handleProcess = async () => {
    if (!credit || credit.status !== "unclaimed") return;
    setProcessing(true);
    setToast(null);
    try {
      const res = await fetch(`/api/credits/${credit.id}/claim`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Claim failed");
      setCredit(data);
      showToast("success", "Credit processed successfully!");
      onClaimed();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Claim failed");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Process Store Credit</h3>
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

        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          Scan the credit card barcode to look up and claim the credit.
        </p>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <button
            type="button"
            onClick={() => setCameraOpen(true)}
            className="rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-medium py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            📷 Camera Scanner
          </button>
          <button
            type="button"
            onClick={() => {
              setCameraOpen(false);
              setTimeout(() => {
                setToast(null);
                inputRef.current?.focus();
              }, 50);
            }}
            className="rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-medium py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            🔫 Laser Scanner
          </button>
        </div>

        <div className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  lookup(barcode);
                }
              }}
              placeholder="Credit barcode..."
              className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 pr-24 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
            />
            <button
              type="button"
              onClick={() => lookup(barcode)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-xl bg-slate-100 dark:bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              {lookingUp ? "..." : "Search"}
            </button>
          </div>
        </div>

        {credit && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-4 space-y-2 mb-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{credit.product_name}</div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                credit.status === "unclaimed"
                  ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
                  : credit.status === "claimed"
                  ? "bg-sky-100 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400"
                  : "bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400"
              }`}>
                {STATUS_LABEL[credit.status]}
              </span>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">{credit.credit_code}</div>
            <div className="flex items-center justify-between text-sm">
              <div className="space-y-0.5 text-slate-500 dark:text-slate-400">
                <div>Client: <span className="text-slate-700 dark:text-slate-300">{credit.client_name}</span></div>
                <div>Expiry: <span className="text-slate-700 dark:text-slate-300">{credit.expiry_date?.split("T")[0] ?? "—"}</span></div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400 dark:text-slate-500">AMOUNT</div>
                <div className="text-xl font-bold text-slate-800 dark:text-slate-100">{formatPrice(credit.amount)}</div>
              </div>
            </div>
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
            disabled={!credit || credit.status !== "unclaimed" || processing}
            className="flex-1 rounded-2xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 transition-colors"
          >
            {processing ? "Processing..." : "Process Credit"}
          </button>
        </div>

        {cameraOpen && (
          <CameraScanner
            isOpen={cameraOpen}
            onScan={handleCameraScan}
            onClose={() => setCameraOpen(false)}
            onError={(msg) => showToast("error", msg)}
            title="Scan Credit Barcode"
          />
        )}

        {toast && (
          <ScanToast
            message={toast.message}
            type={toast.type}
            onDismiss={() => setToast(null)}
          />
        )}
      </div>
    </div>
  );
}