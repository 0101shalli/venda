import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { getDefaultFacingMode, selectBestCamera } from "../utils/device";

type CameraScannerProps = {
  isOpen: boolean;
  onScan: (barcode: string) => void;
  onClose: () => void;
  title?: string;
  multiScan?: boolean;
};

export default function CameraScanner({
  isOpen,
  onScan,
  onClose,
  title = "Scan Barcode",
  multiScan = false,
}: CameraScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = useRef(`scanner-${Math.random().toString(36).slice(2, 9)}`).current;
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  const startedRef = useRef(false);

  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [detected, setDetected] = useState(false);

  onScanRef.current = onScan;
  onCloseRef.current = onClose;

  const cleanup = () => {
    if (scannerRef.current) {
      try { scannerRef.current.stop(); } catch {}
      try { scannerRef.current.clear(); } catch {}
      scannerRef.current = null;
    }
    startedRef.current = false;
  };

  useEffect(() => {
    if (!isOpen) {
      cleanup();
      setError(null);
      setCameras([]);
      setSelectedCameraId("");
      setDetected(false);
      startedRef.current = false;
      return;
    }

    let alive = true;

    const init = async () => {
      try {
        const devices = await Html5Qrcode.getCameras();
        if (!alive) return;

        if (devices.length === 0) {
          setError("No cameras found. Connect a camera or use a USB barcode scanner.");
          return;
        }

        const cameraList = devices.map((d) => ({
          id: d.id,
          label: d.label || `Camera ${d.id.slice(0, 8)}`,
        }));
        setCameras(cameraList);

        const bestId = selectBestCamera(
          devices.map((d) => ({ id: d.id, label: d.label || "", facing: (d as any).facingMode }))
        );
        const camId = bestId || devices[0].id;
        setSelectedCameraId(camId);

        if (alive) {
          await startScanner(camId);
        }
      } catch (err: any) {
        if (!alive) return;
        const msg = err?.message || String(err);
        if (msg.includes("NotAllowedError") || msg.includes("Permission")) {
          setError("Camera permission denied. Allow camera access in your browser/device settings.");
        } else {
          setError(`Could not access camera: ${msg}`);
        }
      }
    };

    init();

    return () => {
      alive = false;
      cleanup();
    };
  }, [isOpen]);

  const startScanner = async (cameraId: string) => {
    setError(null);
    setIsStarting(true);
    setDetected(false);

    try {
      cleanup();

      const container = document.getElementById(containerId);
      if (!container) {
        setError("Scanner container not found.");
        setIsStarting(false);
        return;
      }
      container.innerHTML = "";

      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;
      startedRef.current = true;

      await scanner.start(
        cameraId || { facingMode: getDefaultFacingMode() },
        {
          fps: 10,
          qrbox: (vfW: number, vfH: number) => {
            const minDim = Math.min(vfW, vfH);
            return { width: Math.floor(minDim * 0.8), height: Math.floor(minDim * 0.36) };
          },
          aspectRatio: 1.0,
          disableFlip: false,
        },
        (decodedText) => {
          if (!startedRef.current) return;
          startedRef.current = false;

          if (multiScan) {
            onScanRef.current(decodedText);
            setDetected(true);
            try { scannerRef.current?.stop(); } catch {}
            scannerRef.current = null;
            setTimeout(() => {
              setDetected(false);
              if (alive) startScanner(cameraId);
            }, 1500);
          } else {
            setDetected(true);
            try { scannerRef.current?.stop(); } catch {}
            scannerRef.current = null;
            setTimeout(() => {
              onScanRef.current(decodedText);
              onCloseRef.current();
            }, 400);
          }
        },
        () => {}
      );

      setIsStarting(false);
    } catch (err: any) {
      setIsStarting(false);
      const msg = err?.message || String(err);
      if (msg.includes("NotAllowedError") || msg.includes("Permission")) {
        setError("Camera permission denied. Allow camera access and try again.");
      } else if (msg.includes("NotFound") || msg.includes("DevicesNotFound")) {
        setError("No camera found. Connect a camera or use a USB barcode scanner.");
      } else if (msg.includes("NotReadable") || msg.includes("TrackStart")) {
        setError("Camera is in use by another app. Close other camera apps and try again.");
      } else if (msg.includes("Overconstrained")) {
        setError("Camera does not meet requirements. Try selecting a different camera.");
      } else {
        setError(`Camera error: ${msg}`);
      }
    }
  };

  const switchCamera = async (newId: string) => {
    setSelectedCameraId(newId);
    await startScanner(newId);
  };

  const alive = isOpen;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative mx-4 w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 dark:bg-sky-900/30">
              <svg className="h-4 w-4 text-indigo-600 dark:text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.882V15.118a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
          </div>
          <button
            onClick={() => { cleanup(); onClose(); }}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="relative px-4 pt-3">
          <div
            id={containerId}
            className="relative overflow-hidden rounded-xl bg-black"
            style={{ minHeight: 200 }}
          />

          {detected && (
            <div className="absolute inset-x-4 top-1/2 z-10 -translate-y-1/2 rounded-xl bg-emerald-500 px-4 py-3 text-center text-sm font-bold text-white shadow-lg">
              <svg className="mx-auto mb-1 h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Barcode detected!
            </div>
          )}

          {isStarting && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-black/70">
              <div className="mb-2 h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
              <p className="text-xs text-white/80">Starting camera...</p>
            </div>
          )}
        </div>

        {error && (
          <div className="mx-4 mt-3 rounded-xl bg-rose-50 px-3 py-2.5 dark:bg-rose-900/20">
            <div className="flex items-start gap-2">
              <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
                <div className="mt-2 space-y-1 text-[11px] text-rose-500/80 dark:text-rose-400/70">
                  <p><b>Linux:</b> Grant camera permission. Check <code>chrome://settings/content/camera</code>.</p>
                  <p><b>Windows:</b> Ensure no other app has exclusive camera access. Check Privacy settings.</p>
                  <p><b>Android:</b> Grant camera permission. Use Chrome. HTTPS required for non-localhost.</p>
                  <p><b>iOS:</b> Grant camera permission in Safari/Chrome. HTTPS required.</p>
                  <p><b>USB scanner:</b> Plug in and scan directly — no camera needed.</p>
                </div>
                <button
                  onClick={() => {
                    setError(null);
                    if (selectedCameraId) startScanner(selectedCameraId);
                  }}
                  className="mt-2 rounded-lg bg-rose-100 px-3 py-1 text-xs font-medium text-rose-700 hover:bg-rose-200 dark:bg-rose-900/30 dark:text-rose-400"
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
        )}

        {cameras.length > 1 && !error && (
          <div className="px-4 pt-2">
            <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Camera
            </label>
            <select
              value={selectedCameraId}
              onChange={(e) => switchCamera(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
        )}

        <div className="px-4 pb-4 pt-3">
          <p className="text-center text-[11px] text-slate-400 dark:text-slate-500">
            Point camera at a barcode — Code128, EAN-13, UPC, QR and more
          </p>
          {multiScan && (
            <button
              onClick={() => { cleanup(); onClose(); }}
              className="mt-2 w-full rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 dark:bg-sky-500 dark:hover:bg-sky-600"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
