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

// Detection timeout: an expensive decode pass (full frame / magnified crop)
// that fails after this long triggers the "could not detect in time" toast.
const SLOW_DETECT_MS = 60;
// Adaptive decode pacing: processFrame reports how long each frame took and
// the frame-to-frame gap adjusts in step — fast machines get many more decode
// attempts per second, slow ones get throttled so the UI never janks.
const FRAME_GAP_MIN_MS = 25;
const FRAME_GAP_MAX_MS = 70;
// After this many unchanged frames the heavy passes run anyway, so a perfectly
// still, in-view barcode still gets the full treatment.
const MAX_STATIC_HEAVY_FRAMES = 5;
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
  const tryHarderDecoderRef = useRef<Decoder | null>(null);
  const frameCounterRef = useRef(0);
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
  const cropIndexRef = useRef(0);
  const cameraIdRef = useRef("");
  const startTokenRef = useRef(0);
  const restartAtRef = useRef(0);
  const retryAttemptRef = useRef(0);
  const avgFrameMsRef = useRef(20);
  const frameGapMsRef = useRef(FRAME_GAP_MAX_MS);
  const framesSinceHeavyRef = useRef(0);
  const snapshotRef = useRef<Uint8ClampedArray | null>(null);
  const thumbCanvasRef = useRef<HTMLCanvasElement | null>(null);
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
      // NOTE: no TRY_HARDER here. On live webcam video it makes decoding roughly
      // an order of magnitude slower (1-3s per full frame), which starves the
      // video pipeline, stalls the preview, and can make the browser kill the
      // track — causing endless "reconnecting camera" restarts. The targeted
      // downsized scan-line passes below decode 1D barcodes reliably on time.
      decoderRef.current = {
        reader: new ZXing.MultiFormatReader(false, hints),
        hints,
      };
    }
    return decoderRef.current;
  };

  const getTryHarderDecoder = (): Decoder => {
    if (!tryHarderDecoderRef.current) {
      const hints = new Map<number, any>();
      hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, ZXING_FORMATS);
      // TRY_HARDER is an order of magnitude slower on full frames (see the
      // NOTE above), but on a small magnified crop it stays fast while
      // recovering small, rotated, or partially-distorted barcodes on curved
      // (non-uniform) surfaces.
      hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
      tryHarderDecoderRef.current = {
        reader: new ZXing.MultiFormatReader(false, hints),
        hints,
      };
    }
    return tryHarderDecoderRef.current;
  };

  const decodeCanvas = (
    canvas: HTMLCanvasElement,
    Binarizer: typeof ZXing.HybridBinarizer | typeof ZXing.GlobalHistogramBinarizer = ZXing.HybridBinarizer,
    decoder: Decoder = getDecoder()
  ): string | null => {
    const { reader } = decoder;
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

  // Try adaptive binarization first (handles uneven lighting on curved or
  // wrinkled surfaces), then fall back to a single global threshold which can
  // read hazy, low-contrast barcodes the adaptive pass gives up on.
  const decodeCanvasBest = (
    canvas: HTMLCanvasElement,
    decoder: Decoder = getDecoder()
  ): string | null => {
    const first = decodeCanvas(canvas, ZXing.HybridBinarizer, decoder);
    if (first) return first;
    return decodeCanvas(canvas, ZXing.GlobalHistogramBinarizer, decoder);
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
    // High-quality scaling keeps small barcode modules crisp after upscaling.
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return true;
  };

  // Rotate the centered region 90° and squash it back into a horizontal scan
  // line. A barcode being held sideways (bars horizontal) is invisible to the
  // horizontal passes above; after this rotation its bars are vertical again
  // and the fast row-scan decoder reads it like any other 1D code.
  const drawRotatedBand = (
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
    sx: number,
    sy: number,
    sw: number,
    sh: number
  ): boolean => {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;
    // Canvas dims are swapped: width becomes source height (bar detail, capped
    // at ~960) and height becomes the squashed source width (code length,
    // like Pass 1's ~96 rows).
    const dWidth = Math.min(960, Math.max(1, Math.round(sh)));
    const dHeight = Math.max(40, Math.min(96, Math.round(sw * 0.14)));
    canvas.width = dWidth;
    canvas.height = dHeight;
    ctx.save();
    ctx.imageSmoothingQuality = "high";
    ctx.translate(dWidth, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, dHeight, dWidth);
    ctx.restore();
    return true;
  };

  // Sample a tiny downscaled thumbnail of the current frame and compare it to
  // the previous sample. When nothing moved, the expensive passes are skipped
  // (idle scenes use almost no CPU and the loop paces itself faster) — but a
  // static barcode is still covered because the cheap orientation passes run
  // every frame and the heavy passes run periodically regardless of motion.
  const detectMotion = (video: HTMLVideoElement, vw: number, vh: number): boolean => {
    let canvas = thumbCanvasRef.current;
    if (!canvas) {
      canvas = document.createElement("canvas");
      thumbCanvasRef.current = canvas;
    }
    const w = 24;
    const h = 18;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return true;
    ctx.drawImage(video, 0, 0, vw, vh, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const prev = snapshotRef.current;
    if (!prev) {
      snapshotRef.current = new Uint8ClampedArray(data);
      return true;
    }
    let diff = 0;
    for (let i = 0; i < data.length; i += 4) {
      diff +=
        Math.abs(data[i] - prev[i]) +
        Math.abs(data[i + 1] - prev[i + 1]) +
        Math.abs(data[i + 2] - prev[i + 2]);
      prev[i] = data[i];
      prev[i + 1] = data[i + 1];
      prev[i + 2] = data[i + 2];
    }
    return diff / (w * h * 3) > 5;
  };

  // Crop regions used by the magnified pass. Rotating through center/left/
  // right covers barcodes that sit to one side of the frame or wrap around a
  // curved surface (can / bottle) where only a portion faces the camera.
  const ZOOM_REGIONS = [
    { x: 0.25, y: 0.18, w: 0.5, h: 0.64 }, // center
    { x: 0.0, y: 0.2, w: 0.5, h: 0.6 }, // left
    { x: 0.5, y: 0.2, w: 0.5, h: 0.6 }, // right
  ];

  const runMagnifiedPass = (
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
    vw: number,
    vh: number
  ): string | null => {
    const region = ZOOM_REGIONS[cropIndexRef.current % ZOOM_REGIONS.length];
    cropIndexRef.current += 1;
    const sx = Math.max(0, Math.round(vw * region.x));
    const sy = Math.max(0, Math.round(vh * region.y));
    const sw = Math.min(vw, Math.max(1, Math.round(vw * region.w)));
    const sh = Math.min(vh, Math.max(1, Math.round(vh * region.h)));
    // Upscale the crop 2-3x so barcode modules are several pixels wide — small
    // barcodes and tight/module-heavy codes on curved surfaces then decode via
    // row scanning that would otherwise be below the minimum module width.
    const targetW = Math.min(960, Math.round(sw * 3));
    const targetH = Math.max(1, Math.round((targetW * sh) / sw));
    if (!drawSource(canvas, video, sx, sy, sw, sh, targetW, targetH)) return null;
    return decodeCanvasBest(canvas, getTryHarderDecoder());
  };

  const processFrame = (): number => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth < 16) return 0;
    lastFrameAtRef.current = performance.now();
    const start = performance.now();

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const canvas = getCanvas();
    if (!canvas) return 0;

    let code: string | null = null;
    let heavyElapsed = 0;

    // Pass 1 — scan line. Keep FULL horizontal resolution (1D barcodes only
    // care about width), squash height to ~96 rows. This single pass decodes
    // EAN/Code128 in a few milliseconds without stressing the main thread.
    const bandSh = vh * 0.6;
    const bandSy = vh * 0.2;
    const dh1 = Math.max(40, Math.min(96, Math.round(bandSh)));
    if (drawSource(canvas, video, 0, bandSy, vw, bandSh, vw, dh1)) {
      code = decodeCanvasBest(canvas);
    }

    // Pass 2 — centered band, aspect preserved (catches off-center/tilted).
    if (!code) {
      const sh2 = vh * 0.5;
      const sy2 = vh * 0.25;
      const dw2 = Math.min(vw, 1024);
      const dh2 = Math.round((sh2 * dw2) / vw);
      if (drawSource(canvas, video, 0, sy2, vw, sh2, dw2, dh2)) {
        code = decodeCanvasBest(canvas);
      }
    }

    // Pass 3 — rotated scan line: catches barcodes being held sideways (bars
    // horizontal), which the horizontal passes above can't see.
    if (!code) {
      const rx = vw * 0.15;
      const rw = vw * 0.7;
      if (drawRotatedBand(canvas, video, Math.round(rx), 0, Math.round(rw), vh)) {
        code = decodeCanvasBest(canvas);
      }
    }

    // Heavy passes (full frame / magnified crop) alternate, but only on frames
    // where the scene changed — or at least every MAX_STATIC_HEAVY_FRAMES
    // frames so a still, in-view barcode never goes unhandled.
    if (!code) {
      framesSinceHeavyRef.current += 1;
      const tHeavy = performance.now();
      if (
        detectMotion(video, vw, vh) ||
        framesSinceHeavyRef.current >= MAX_STATIC_HEAVY_FRAMES
      ) {
        framesSinceHeavyRef.current = 0;
        if (frameCounterRef.current % 2 === 0) {
          // Pass 4 — full frame, both binarizers (large / oddly placed
          // barcodes, uneven lighting).
          const dw4 = Math.min(vw, 720);
          const dh4 = Math.round((vh * dw4) / vw);
          if (drawSource(canvas, video, 0, 0, vw, vh, dw4, dh4)) {
            code = decodeCanvasBest(canvas);
          }
        } else {
          // Pass 5 — magnified region crop, TRY_HARDER (small / curved codes).
          code = runMagnifiedPass(canvas, video, vw, vh);
        }
        heavyElapsed = performance.now() - tHeavy;
      }
    }
    frameCounterRef.current += 1;

    if (code) {
      handleScan(code);
      return performance.now() - start;
    }

    // Slow-detection watchdog: when an expensive pass runs long without
    // decoding, the scene likely holds barcode-like content that is too small,
    // warped, or poorly lit — surface guidance (throttled, with a warm-up grace
    // after opening the scanner or a successful scan).
    if (heavyElapsed > SLOW_DETECT_MS) {
      const nowP = performance.now();
      if (
        nowP >= slowToastGraceUntilRef.current &&
        nowP - slowToastAtRef.current > SLOW_TOAST_COOLDOWN_MS
      ) {
        slowToastAtRef.current = nowP;
        onErrorRef.current?.(
          `Barcode not detected (took ${Math.round(heavyElapsed)} ms). Move the barcode closer, flatten the surface, and hold steady.`
        );
      }
    }

    return performance.now() - start;
  };

  const startScanning = () => {
    if (!isOpenRef.current) return;
    scanningRef.current = true;
    lastFrameAtRef.current = performance.now();
    avgFrameMsRef.current = 20;
    frameGapMsRef.current = FRAME_GAP_MAX_MS;
    framesSinceHeavyRef.current = 0;

    let lastFrame = 0;
    const tick = (now: number) => {
      if (!scanningRef.current) return;
      rafRef.current = requestAnimationFrame(tick);
      if (now - lastFrame < frameGapMsRef.current) return;
      lastFrame = now;
      const elapsed = processFrame();
      // Pace decode attempts to measured capacity: gap ≈ 2× frame cost plus a
      // small margin, clamped. Cheap/idle frames → 25ms gap (~40 attempts/s);
      // heavy frames auto-throttle so the main thread and preview stay smooth.
      avgFrameMsRef.current = avgFrameMsRef.current * 0.85 + elapsed * 0.15;
      frameGapMsRef.current = Math.max(
        FRAME_GAP_MIN_MS,
        Math.min(FRAME_GAP_MAX_MS, Math.round(avgFrameMsRef.current * 2 + 8))
      );
    };
    rafRef.current = requestAnimationFrame(tick);

    // Stall watchdog: if the video stops producing frames AND the capture loop
    // is genuinely frozen, reconnect. A 4s threshold plus a 2.5s reconnect
    // backoff prevents endless restart loops while the user is scanning.
    stallTimerRef.current = window.setInterval(() => {
      if (!scanningRef.current) return;
      const video = videoRef.current;
      const frozen =
        video &&
        video.videoWidth > 0 &&
        performance.now() - lastFrameAtRef.current > 4000;
      if (!frozen) return;
      if (performance.now() - restartAtRef.current < 2500) return;
      restartAtRef.current = performance.now();
      const msg = "Camera preview is not updating — reconnecting camera...";
      onErrorRef.current?.(msg);
      window.setTimeout(() => {
        if (!isOpenRef.current) return;
        startScanner(cameraIdRef.current || undefined);
      }, 500);
    }, 2000);
  };

  const describeCameraError = (err: any): string => {
    const name = err?.name || "";
    const msg = err?.message || String(err);
    if (
      name === "NotReadableError" ||
      name === "TrackStartError" ||
      msg.includes("in use") ||
      msg.includes("Failed to allocate resources") ||
      msg.includes("allocate resources")
    ) {
      return "Camera is busy or its resources are unavailable. Close any other app using the camera, then press Retry.";
    }
    if (name === "NotAllowedError" || msg.includes("Permission")) {
      return "Camera permission denied. Allow camera access in your browser/device settings and try again.";
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError" || msg.includes("NotFound")) {
      return "No camera found. Connect a camera or use a USB barcode scanner.";
    }
    if (name === "OverconstrainedError" || msg.includes("Overconstrained")) {
      return "Camera does not meet requirements. Try selecting a different camera.";
    }
    return `Camera error: ${msg}`;
  };

  const startScanner = async (cameraId?: string) => {
    if (!isOpenRef.current) return;
    // Guard against overlapping/concurrent restarts: each start takes a token;
    // any earlier async start that resolves after this one bails out.
    const token = ++startTokenRef.current;
    restartAtRef.current = performance.now();
    setError(null);
    setDetected(false);
    setIsStarting(true);
    stopScanning();
    const videoConstraints: MediaTrackConstraints = cameraId
      ? { deviceId: { exact: cameraId } }
      : { facingMode: getDefaultFacingMode() };

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          ...videoConstraints,
          // Ask for 720p so small barcodes keep enough native pixels to be
          // magnified and decoded successfully on the crop pass below.
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      retryAttemptRef.current = 0;
      if (!isOpenRef.current || token !== startTokenRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      streamRef.current = stream;

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        video.muted = true;
        await video.play().catch(() => {});
      }
      if (!isOpenRef.current || token !== startTokenRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        return;
      }

      const track = stream.getVideoTracks()[0];
      track?.addEventListener("ended", handleTrackEnded, { once: true });

      slowToastGraceUntilRef.current = performance.now() + 1500;
      slowToastAtRef.current = 0;
      setIsStarting(false);
      startScanning();
    } catch (err: any) {
      if (!isOpenRef.current || token !== startTokenRef.current) return;
      setIsStarting(false);
      const msg = describeCameraError(err);
      setError(msg);
      onErrorRef.current?.(msg);

      // "Failed to allocate resources" (NotReadableError) is frequently
      // transient — the OS often frees the camera moments later. Auto-retry
      // a couple of times with a short pause before giving up, so the scanner
      // starts on its own instead of dead-ending with a manual Retry.
      const raw = `${err?.name || ""} ${err?.message || ""}`;
      const transientResource =
        err?.name === "NotReadableError" ||
        err?.name === "TrackStartError" ||
        raw.includes("Failed to allocate resources") ||
        raw.includes("allocate resources");
      if (transientResource && isOpenRef.current) {
        const attempt = retryAttemptRef.current;
        if (attempt < 2 && token === startTokenRef.current) {
          retryAttemptRef.current = attempt + 1;
          window.setTimeout(() => {
            if (!isOpenRef.current || token !== startTokenRef.current) return;
            startScanner(cameraIdRef.current || undefined);
          }, 800 * (attempt + 1));
        }
      }
    }
  };

  const handleTrackEnded = () => {
    if (!isOpenRef.current) return;
    // Backoff: never reconnect in a tight loop. If the previous restart was
    // less than 2.5s ago, wait instead of immediately relaunching.
    const now = performance.now();
    const canRestart = now - restartAtRef.current >= 2500;
    restartAtRef.current = now;
    stopScanning();
    if (!canRestart || !isOpenRef.current) return;
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
            Point camera at a barcode — flat, curved, small, or sideways labels all work.
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
