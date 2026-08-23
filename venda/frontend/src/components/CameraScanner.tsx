import { useEffect, useRef, useState } from "react";
// The UMD exposes its API as module.exports. Bundle interop differs per mode:
// - Vite dev pre-bundle: namespace has only `.default` (which itself carries a
//   `__esModule: true` marker but no `.default`), so Vite's `mod.__esModule ?
//   mod.default : mod` interop on a default import yields `undefined`.
// - Rollup prod: `default` = module.exports directly.
// Unwrapping `.default ?? namespace` covers both, so never use a bare default
// or namespace import here.
import * as ZXingModule from "html5-qrcode/third_party/zxing-js.umd";
const ZXing: typeof ZXingModule = (ZXingModule as any).default ?? ZXingModule;
import {
  getDefaultFacingMode,
  checkCameraSupport,
  listCameras,
  selectBestCamera,
} from "../utils/device";

declare module "html5-qrcode/third_party/zxing-js.umd" {
  export const GlobalHistogramBinarizer: new (source: any) => any;
}

type CameraScannerProps = {
  isOpen: boolean;
  onScan: (barcode: string) => void;
  onClose: () => void;
  onError?: (message: string) => void;
  title?: string;
  multiScan?: boolean;
};

// All 1D retail formats plus QR/DataMatrix for flexibility.
const ZXING_FORMATS = [
  ZXing.BarcodeFormat.CODE_128,
  ZXing.BarcodeFormat.CODE_39,
  ZXing.BarcodeFormat.CODE_93,
  ZXing.BarcodeFormat.EAN_13,
  ZXing.BarcodeFormat.EAN_8,
  ZXing.BarcodeFormat.UPC_A,
  ZXing.BarcodeFormat.UPC_E,
  ZXing.BarcodeFormat.ITF,
  ZXing.BarcodeFormat.CODABAR,
  ZXing.BarcodeFormat.QR_CODE,
  ZXing.BarcodeFormat.DATA_MATRIX,
];

// Detection timeout: a single frame decode attempt that fails after this long
// triggers the "could not detect in time" error toast.
const SLOW_DETECT_MS = 50;
// Decode pacing between frames.
const FRAME_GAP_MS = 55;
// Toast throttling so repeated slow frames don't spam.
const SLOW_TOAST_COOLDOWN_MS = 2000;

type Decoder = {
  reader: InstanceType<typeof ZXing.MultiFormatReader>;
  hints: Map<number, any>;
};

export default function CameraScanner({
  isOpen,
  onScan,
  onClose,
  onError,
  title = "Scan Barcode",
  multiScan = false,
}: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const decoderRef = useRef<Decoder | null>(null);
  const rafRef = useRef(0);
  const scanningRef = useRef(false);
  const stallTimerRef = useRef(0);
  const rescanTimerRef = useRef(0);
  const closeTimerRef = useRef(0);
  const lastFrameAtRef = useRef(0);
  const slowToastAtRef = useRef(0);
  const slowToastGraceUntilRef = useRef(0);
  const lastScanAtRef = useRef(0);
  const lastScanCodeRef = useRef("");
  const cameraIdRef = useRef("");
  const isOpenRef = useRef(isOpen);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  const onErrorRef = useRef(onError);

  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [detected, setDetected] = useState(false);

  onScanRef.current = onScan;
  onCloseRef.current = onClose;
  onErrorRef.current = onError;
  isOpenRef.current = isOpen;

  const getCanvas = (): HTMLCanvasElement | null => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }
    return canvasRef.current;
  };

  const getDecoder = (): Decoder => {
    if (!decoderRef.current) {
      const hints = new Map<number, any>();
      hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, ZXING_FORMATS);
      // TRY_HARDER makes ZXing retry rotated/small/defocused barcodes —
      // critical for reliable 1D decoding from a live webcam.
      hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
      decoderRef.current = {
        reader: new ZXing.MultiFormatReader(false, hints),
        hints,
      };
    }
    return decoderRef.current;
  };

  const decodeCanvas = (
    canvas: HTMLCanvasElement,
    Binarizer: typeof ZXing.HybridBinarizer | typeof ZXing.GlobalHistogramBinarizer = ZXing.HybridBinarizer
  ): string | null => {
    const { reader } = getDecoder();
    const source = new ZXing.HTMLCanvasElementLuminanceSource(canvas);
    const bitmap = new ZXing.BinaryBitmap(new Binarizer(source));
    try {
      const result = reader.decode(bitmap);
      const text = result?.text ? String(result.text).trim() : "";
      return text || null;
    } catch {
      return null;
    }
  };

  const stopScanning = () => {
    scanningRef.current = false;
    cancelAnimationFrame(rafRef.current);
    if (stallTimerRef.current) {
      clearInterval(stallTimerRef.current);
      stallTimerRef.current = 0;
    }
    if (rescanTimerRef.current) {
      clearTimeout(rescanTimerRef.current);
      rescanTimerRef.current = 0;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = 0;
    }
  };

  const stopEverything = () => {
    stopScanning();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const handleScan = (code: string) => {
    const now = Date.now();
    const lastScanAt = lastScanAtRef.current;
    const lastCode = lastScanCodeRef.current;
    if (code === lastCode && now - lastScanAt < 2500) return;
    lastScanCodeRef.current = code;
    lastScanAtRef.current = now;

    stopScanning();
    setDetected(true);
    // Rest the slow-detection watchdog right after a successful scan.
    slowToastGraceUntilRef.current = performance.now() + 2000;

    if (multiScan) {
      onScanRef.current(code);
      rescanTimerRef.current = window.setTimeout(() => {
        if (!isOpenRef.current) return;
        setDetected(false);
        startScanning();
      }, 1400);
    } else {
      closeTimerRef.current = window.setTimeout(() => {
        if (!isOpenRef.current) return;
        onScanRef.current(code);
        onCloseRef.current();
      }, 400);
    }
  };

  const drawSource = (
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dw: number,
    dh: number
  ): boolean => {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;
    canvas.width = Math.max(1, Math.round(dw));
    canvas.height = Math.max(1, Math.round(dh));
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return true;
  };

  const processFrame = () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth < 16) return;
    lastFrameAtRef.current = performance.now();

    const t0 = performance.now();
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const canvas = getCanvas();
    if (!canvas) return;

    let code: string | null = null;

    // Pass 1 — scan line. Keep FULL horizontal resolution (1D barcodes only
    // care about width), squash height to ~96 rows. ZXing scans rows, so this
    // decodes in a few milliseconds while keeping module fidelity.
    const bandSh = vh * 0.6;
    const bandSy = vh * 0.2;
    const dh1 = Math.max(40, Math.min(96, Math.round(bandSh)));
    if (drawSource(canvas, video, 0, bandSy, vw, bandSh, vw, dh1)) {
      code = decodeCanvas(canvas);
    }

    // Pass 2 — centered band, aspect preserved (catches off-center/tilted).
    if (!code) {
      const sh2 = vh * 0.5;
      const sy2 = vh * 0.25;
      const dw2 = Math.min(vw, 1024);
      const dh2 = Math.round((sh2 * dw2) / vw);
      if (drawSource(canvas, video, 0, sy2, vw, sh2, dw2, dh2)) {
        code = decodeCanvas(canvas);
      }
    }

    // Pass 3 — full frame, aspect preserved, both binarizers as fallback.
    if (!code) {
      const dw3 = Math.min(vw, 1280);
      const dh3 = Math.round((vh * dw3) / vw);
      if (drawSource(canvas, video, 0, 0, vw, vh, dw3, dh3)) {
        code = decodeCanvas(canvas, ZXing.HybridBinarizer);
        if (!code) {
          code = decodeCanvas(canvas, ZXing.GlobalHistogramBinarizer);
        }
      }
    }

    if (code) {
      handleScan(code);
      return;
    }

    // Slow-detection watchdog: if a full frame attempt failed and took longer
    // than 50ms, surface an error toast (throttled, with warm-up grace).
    const elapsed = performance.now() - t0;
    if (elapsed > SLOW_DETECT_MS) {
      const nowP = performance.now();
      if (
        nowP >= slowToastGraceUntilRef.current &&
        nowP - slowToastAtRef.current > SLOW_TOAST_COOLDOWN_MS
      ) {
        slowToastAtRef.current = nowP;
        onErrorRef.current?.(
          `Barcode not detected within 50 ms (took ${Math.round(elapsed)} ms). Move the barcode closer, keep it flat and steady, and try again.`
        );
      }
    }
  };

  const startScanning = () => {
    if (!isOpenRef.current) return;
    scanningRef.current = true;
    lastFrameAtRef.current = performance.now();

    let lastFrame = 0;
    const tick = (now: number) => {
      if (!scanningRef.current) return;
      rafRef.current = requestAnimationFrame(tick);
      if (now - lastFrame < FRAME_GAP_MS) return;
      lastFrame = now;
      processFrame();
    };
    rafRef.current = requestAnimationFrame(tick);

    // Stall watchdog: if the video stops producing frames, tell the user and
    // reconnect.
    stallTimerRef.current = window.setInterval(() => {
      if (!scanningRef.current) return;
      if (performance.now() - lastFrameAtRef.current > 3000) {
        const msg = "Camera preview is not updating — reconnecting camera...";
        onErrorRef.current?.(msg);
        stopEverything();
        window.setTimeout(() => {
          if (!isOpenRef.current) return;
          startScanner(cameraIdRef.current || undefined);
        }, 500);
      }
    }, 2000);
  };

  const describeCameraError = (err: any): string => {
    const name = err?.name || "";
    const msg = err?.message || String(err);
    if (name === "NotAllowedError" || msg.includes("Permission")) {
      return "Camera permission denied. Allow camera access in your browser/device settings and try again.";
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError" || msg.includes("NotFound")) {
      return "No camera found. Connect a camera or use a USB barcode scanner.";
    }
    if (name === "NotReadableError" || name === "TrackStartError" || msg.includes("in use")) {
      return "Camera is in use by another app. Close other camera apps and try again.";
    }
    if (name === "OverconstrainedError" || msg.includes("Overconstrained")) {
      return "Camera does not meet requirements. Try selecting a different camera.";
    }
    return `Camera error: ${msg}`;
  };

  const startScanner = async (cameraId?: string) => {
    if (!isOpenRef.current) return;
    setError(null);
    setDetected(false);
    setIsStarting(true);
    stopEverything();

    const videoConstraints: MediaTrackConstraints = cameraId
      ? { deviceId: { exact: cameraId } }
      : { facingMode: getDefaultFacingMode() };

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          ...videoConstraints,
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });
      if (!isOpenRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        video.muted = true;
        await video.play().catch(() => {});
      }

      const track = stream.getVideoTracks()[0];
      track?.addEventListener("ended", handleTrackEnded, { once: true });

      slowToastGraceUntilRef.current = performance.now() + 1500;
      slowToastAtRef.current = 0;
      setIsStarting(false);
      startScanning();
    } catch (err: any) {
      setIsStarting(false);
      const msg = describeCameraError(err);
      setError(msg);
      onErrorRef.current?.(msg);
    }
  };

  const handleTrackEnded = () => {
    if (!scanningRef.current) return;
    stopScanning();
    if (!isOpenRef.current) return;
    const msg = "Camera connection lost. Reconnecting...";
    setError(msg);
    onErrorRef.current?.(msg);
    window.setTimeout(() => {
      if (!isOpenRef.current) return;
      startScanner(cameraIdRef.current || undefined);
    }, 900);
  };

  const switchCamera = async (newId: string) => {
    setSelectedCameraId(newId);
    cameraIdRef.current = newId;
    await startScanner(newId);
  };

  useEffect(() => {
    if (!isOpen) {
      stopEverything();
      setError(null);
      setCameras([]);
      setSelectedCameraId("");
      setDetected(false);
      setIsStarting(false);
      lastScanCodeRef.current = "";
      lastScanAtRef.current = 0;
      return;
    }

    let alive = true;

    const init = async () => {
      try {
        const support = await checkCameraSupport();
        if (!alive) return;
        if (!support.supported) {
          const msg = support.reason || "Camera not available on this device.";
          setError(msg);
          onErrorRef.current?.(msg);
          return;
        }

        let camList = await listCameras();
        if (camList.length === 0) {
          const msg = "No cameras found. Connect a camera or use a USB barcode scanner.";
          setError(msg);
          onErrorRef.current?.(msg);
          return;
        }
        if (!alive) return;

        setCameras(camList);
        const camId = selectBestCamera(camList) || camList[0].id;
        setSelectedCameraId(camId);
        cameraIdRef.current = camId;
        await startScanner(camId);
      } catch (err: any) {
        if (!alive) return;
        const msg = `Could not access camera: ${err?.message || String(err)}`;
        setError(msg);
        onErrorRef.current?.(msg);
      }
    };

    init();

    return () => {
      alive = false;
      stopEverything();
    };
  }, [isOpen]);

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
            onClick={() => { stopEverything(); onClose(); }}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="relative px-4 pt-3">
          <div
            className="camera-scanner relative overflow-hidden rounded-xl bg-black"
            style={{ width: "100%", height: 280 }}
          >
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="h-full w-full object-cover"
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
        </div>

        {error && (
          <div className="mx-4 mt-3 rounded-xl bg-rose-50 px-3 py-2.5 dark:bg-rose-900/20">
            <div className="flex items-start gap-2">
              <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
                <button
                  onClick={() => {
                    setError(null);
                    startScanner(cameraIdRef.current || undefined);
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
              onClick={() => { stopEverything(); onClose(); }}
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
