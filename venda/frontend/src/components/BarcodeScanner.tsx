import { useEffect, useRef, useState, useCallback } from "react";

export type ProductInfo = {
  id: number;
  barcode: string;
  name: string;
  cost_price: number;
  selling_price: number;
  min_stock_level: number;
};

type BarcodeScannerProps = {
  onProductScanned: (product: ProductInfo) => void;
};

export default function BarcodeScanner({ onProductScanned }: BarcodeScannerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Scanner burst detection
  const lastKeyTimeRef = useRef<number>(0);
  const keystrokeCountRef = useRef<number>(0);
  const BURST_THRESHOLD_MS = 50; // hardware scanners fire keys < 50ms apart
  const MIN_BURST_KEYS = 4;      // treat as scanner if ≥4 fast keystrokes before Enter

  const [barcode, setBarcode] = useState("");
  const [scannedProduct, setScannedProduct] = useState<ProductInfo | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [addedFlash, setAddedFlash] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Keep the input focused at all times so hardware scanners always land here
  useEffect(() => {
    const refocus = () => {
      // Don't steal focus from other inputs (e.g. quantity edit, search bar)
      const active = document.activeElement;
      if (
        active &&
        active !== inputRef.current &&
        (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "BUTTON")
      ) return;
      inputRef.current?.focus();
    };
    // Focus on mount
    inputRef.current?.focus();
    // Re-focus whenever the page is clicked on a non-interactive area
    document.addEventListener("click", refocus);
    return () => document.removeEventListener("click", refocus);
  }, []);

  const lookupBarcode = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return;
      setIsLookingUp(true);
      setScanError(null);
      setAddedFlash(false);
      try {
        const res = await fetch(`/api/products/lookup?barcode=${encodeURIComponent(trimmed)}`);
        if (!res.ok) {
          setScanError(`No product found for barcode: ${trimmed}`);
          setScannedProduct(null);
          return;
        }
        const product: ProductInfo = await res.json();
        setScannedProduct(product);
        setScanError(null);
        onProductScanned(product);          // ← auto-add to cart
        setAddedFlash(true);
        setTimeout(() => setAddedFlash(false), 2000);
      } catch {
        setScanError("Network error. Could not look up product.");
        setScannedProduct(null);
      } finally {
        setIsLookingUp(false);
        setBarcode("");
        // Re-focus so next scan lands immediately
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    },
    [onProductScanned]
  );

  // Detect scanner burst vs. manual typing in the input
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const now = Date.now();
    const gap = now - lastKeyTimeRef.current;
    lastKeyTimeRef.current = now;

    if (e.key === "Enter") {
      e.preventDefault();
      const isScannerBurst = keystrokeCountRef.current >= MIN_BURST_KEYS;
      const hasValue = barcode.trim().length >= 4;
      if (hasValue || isScannerBurst) {
        lookupBarcode(barcode);
      }
      keystrokeCountRef.current = 0;
      return;
    }

    if (gap < BURST_THRESHOLD_MS) {
      keystrokeCountRef.current += 1;
    } else {
      // Slow typing — reset burst counter
      keystrokeCountRef.current = 0;
    }
  };

  // Manual form submit (button click or Enter when NOT scanner)
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (barcode.trim().length >= 1) {
      lookupBarcode(barcode);
    }
  };

  // Camera
  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Wait for video metadata to be loaded before playing
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch((err) => {
            console.error("Failed to play video:", err);
            setCameraError("Failed to start video playback. Please reload and try again.");
          });
        };
      }
      setCameraActive(true);
    } catch (err: unknown) {
      if (err instanceof DOMException) {
        if (err.name === "NotAllowedError") {
          setCameraError("Camera access was denied. Please enable camera permissions in your browser settings.");
        } else if (err.name === "NotFoundError") {
          setCameraError("No camera device found on this device.");
        } else {
          setCameraError(`Camera error: ${err.message}`);
        }
      } else {
        setCameraError("Camera access denied or unavailable on this device.");
      }
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  };

  useEffect(() => () => stopCamera(), []);

  return (
    <div className="space-y-4">
      {/* Status row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={`h-2.5 w-2.5 rounded-full transition-colors ${
              isLookingUp
                ? "animate-pulse bg-amber-400 dark:bg-amber-500"
                : addedFlash
                ? "bg-emerald-400 dark:bg-emerald-500 animate-ping"
                : "bg-emerald-400 dark:bg-emerald-500"
            }`}
          />
          <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
            {isLookingUp ? "Looking up product…" : addedFlash ? "Added to cart!" : "Scanner ready — waiting for scan"}
          </span>
        </div>
        <button
          type="button"
          onClick={cameraActive ? stopCamera : startCamera}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
            cameraActive
              ? "bg-rose-100 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 hover:bg-rose-200 dark:hover:bg-rose-900/30"
              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
          }`}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.882V15.118a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
          </svg>
          {cameraActive ? "Stop Camera" : "Use Camera"}
        </button>
      </div>

      {/* Camera feed */}
      {cameraActive && (
        <div className="relative overflow-hidden rounded-2xl bg-black">
          <video 
            ref={videoRef} 
            className="w-full rounded-2xl dark:bg-black" 
            autoPlay 
            playsInline 
            muted 
            controls={false}
            style={{ transform: 'scaleX(1)' }}
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-32 w-64 rounded-xl border-2 border-emerald-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
          </div>
          <p className="absolute bottom-2 left-0 right-0 text-center text-xs text-white/70">
            Point camera at barcode · or use a scanner device
          </p>
        </div>
      )}
      {cameraError && (
        <p className="rounded-xl bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">{cameraError}</p>
      )}

      {/* Barcode input — always auto-focused, receives hardware scanner input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          ref={inputRef}
          id="barcode-input"
          type="text"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Scan barcode or type it here…"
          className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-800 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 outline-none ring-inset focus:border-indigo-400 dark:focus:border-sky-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-sky-900"
          autoComplete="off"
        />
        <button
          type="submit"
          id="barcode-add-btn"
          className="rounded-xl bg-indigo-600 dark:bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 dark:hover:bg-sky-600 active:scale-95 transition-transform"
        >
          Add
        </button>
      </form>

      {/* Error */}
      {scanError && (
        <div className="flex items-center gap-2 rounded-xl bg-rose-50 dark:bg-rose-900/20 px-4 py-3 text-sm text-rose-700 dark:text-rose-400">
          <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {scanError}
        </div>
      )}

      {/* Last scanned product card */}
      {scannedProduct && !scanError && (
        <div
          className={`rounded-2xl border px-4 py-3 transition-all duration-300 ${
            addedFlash
              ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 shadow-md shadow-emerald-100 dark:shadow-emerald-900/20"
              : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Last Scan</p>
                {addedFlash && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 dark:bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white dark:text-white">
                    ✓ Added to cart
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate font-semibold text-slate-800 dark:text-white">{scannedProduct.name}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Barcode: {scannedProduct.barcode}</p>
            </div>
            <div className="flex-shrink-0 text-right">
              <p className="text-lg font-bold text-indigo-700 dark:text-sky-400">${scannedProduct.selling_price.toFixed(2)}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Cost ${scannedProduct.cost_price.toFixed(2)}</p>
            </div>
          </div>
        </div>
      )}

      {!scannedProduct && !scanError && !isLookingUp && (
        <p className="text-center text-xs text-slate-400 dark:text-slate-500">
          USB / Bluetooth / mobile scanners work automatically · just scan any barcode
        </p>
      )}
    </div>
  );
}
