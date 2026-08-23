import { useEffect } from "react";

type ScanToastProps = {
  message: string;
  type: "success" | "error";
  onDismiss: () => void;
  duration?: number;
};

export default function ScanToast({ message, type, onDismiss, duration = 3000 }: ScanToastProps) {
  useEffect(() => {
    const t = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(t);
  }, [duration, onDismiss]);

  return (
    <div className="fixed bottom-6 left-1/2 z-[120] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2">
      <div
        role="status"
        className={`flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-xl animate-[fadeUp_0.25s_ease-out] ${
          type === "success"
            ? "border-emerald-300 bg-white text-emerald-700 dark:border-emerald-800 dark:bg-slate-800 dark:text-emerald-400"
            : "border-rose-300 bg-white text-rose-600 dark:border-rose-800 dark:bg-slate-800 dark:text-rose-400"
        }`}
      >
        <span className="text-lg">{type === "success" ? "✅" : "❌"}</span>
        <p className="flex-1 text-sm font-semibold">{message}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="flex-shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          aria-label="Dismiss"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
