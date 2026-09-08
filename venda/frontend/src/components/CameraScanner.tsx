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

// The scan-line passes squash the frame horizontally, so 2D formats can never
// decode there. Restricting those passes to 1D keeps them fast and removes the
// occasional multi-second QR/DataMatrix scans on noisy frames. 2D codes are
// still reachable via the (small, TRY_HARDER) magnified crop pass.
const ONE_D_FORMATS = [
  ZXing.BarcodeFormat.CODE_128,
  ZXing.BarcodeFormat.CODE_39,
  ZXing.BarcodeFormat.CODE_93,
  ZXing.BarcodeFormat.EAN_13,
  ZXing.BarcodeFormat.EAN_8,
  ZXing.BarcodeFormat.UPC_A,
  ZXing.BarcodeFormat.UPC_E,
  // ITF deliberately excluded: its finder walks every row for long
  // interleaved-pair candidates, which turns a single textured crop into a
  // multi-second main-thread block on busy scenes. That is precisely the kind
  // of stall that starves the preview and makes browsers drop the camera
  // track. ITF is niche retail-plain packaging; losing it is far cheaper than
  // the camera restarts it caused.
  ZXing.BarcodeFormat.CODABAR,
];

// Detection timeout: an expensive decode pass on a hard frame is bounded to
// keep the preview smooth; the stuck-scan hint (below) covers silent misses.
const FRAME_GAP_MIN_MS = 25;
const FRAME_GAP_MAX_MS = 70;
// After this many unchanged frames the heavy passes run anyway, so a perfectly
// still, in-view barcode still gets the full treatment.
const MAX_STATIC_HEAVY_FRAMES = 5;
// The TRY_HARDER magnified crop costs ~0.5s even when capped, so on a static
// scene it is throttled to every this-many frames; only a held-steady aim
// needs it, and motion NEVER runs it (a moving scene would stack 0.5s blocks
// back-to-back, starving the preview).
const MAX_STATIC_MAGNIFY_FRAMES = 8;
// Even with constant motion, heavy passes must leave a beat between frames so
// the preview never freezes (a starved video pipeline makes browsers drop the
// camera track → endless "reconnecting camera" restarts). The cheap sweep
// passes still run on every frame.
const HEAVY_PASS_INTERVAL_MS = 80;
// TRY_HARDER magnified decodes are the most expensive single op (~0.5s); never
// let them launch more often than this even on a static hold.
const TRY_HARDER_INTERVAL_MS = 1500;
// Motion threshold on the 24×18 thumbnail. Camera sensor noise alone often
// exceeds ~5 units, which would mark every frame "moving" and run the heavy
// passes constantly. 8 leaves real hand/product motion detectable while the
// still-scene periodic fallback still covers a held-steady barcode.
const MOTION_THRESHOLD = 8;
// Toast throttling so repeated slow frames don't spam.
const SLOW_TOAST_COOLDOWN_MS = 4000;

// ---- Surround-resistant EAN/UPC row decoder ----
//
// Stock ZXing binarizes the WHOLE frame before decoding. A bright label on
// dark or coloured packaging (a box, a can, a bag) skews that histogram so
// badly that the quiet zones get swallowed and ZXing never starts — proven in
// a synthetic harness where clean module-7 codes fail whenever the backing
// tone drops below ~#ccc, no matter the crop, margins, or TRY_HARDER. This
// decoder sidesteps binarization entirely: each pixel is thresholded against a
// small local window, so what surrounds the code simply does not matter.
const EAN_L = [
  "0001101", "0011001", "0010011", "0111101", "0100011", "0110001",
  "0101111", "0111011", "0110111", "0001011",
];
const EAN_G = [
  "0100111", "0110011", "0011011", "0100001", "0011101", "0111001",
  "0000101", "0010001", "0001001", "0010111",
];
const EAN_R = [
  "1110010", "1100110", "1101100", "1000010", "1011100", "1001110",
  "1010000", "1000100", "1001000", "1110100",
];
const EAN_FIRST_PARITY = [
  "LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG",
  "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL",
];

const eanPatternRuns = (pat: string): number[] => {
  const runs: number[] = [];
  let cur = pat[0];
  let n = 1;
  for (let i = 1; i < pat.length; i++) {
    if (pat[i] === cur) n++;
    else {
      runs.push(n);
      cur = pat[i];
      n = 1;
    }
  }
  runs.push(n);
  return runs;
};

const EAN_LG_RUNS = EAN_L.concat(EAN_G).map(eanPatternRuns);
const EAN_R_RUNS = EAN_R.map(eanPatternRuns);

// Best-match the 4 normalized run widths of one digit against a table of
// run-width patterns. The winner must (a) be within a tight tolerance and
// (b) clearly beat the runner-up — otherwise the digit is ambiguous and
// rejected. Being strict here is what keeps a wrong-but-checksum-valid barcode
// from surfacing: miss a frame, never misreport a product.
const eanMatchDigit = (norm: number[], table: number[][]): number => {
  let best = -1;
  let bestErr = Infinity;
  let secondErr = Infinity;
  for (let k = 0; k < table.length; k++) {
    const pat = table[k];
    let err = 0;
    for (let j = 0; j < norm.length; j++) {
      const dd = Math.abs(norm[j] - pat[j]);
      err += dd < 2 ? dd : 2;
    }
    if (err < bestErr) {
      secondErr = bestErr;
      bestErr = err;
      best = k;
    } else if (err < secondErr) {
      secondErr = err;
    }
  }
  if (bestErr > 2.2) return -1;
  if (secondErr - bestErr < 0.9) return -1;
  return best;
};

// Decode one horizontal grayscale row as an EAN-13/UPC-family code. Upside-up
// codes only (mirror/upside-down barcodes are not attempted — same as the
// component's other passes, which rely on re-detection).
const decodeEanRowPhase = (row: Float32Array, windowScale = 1): string | null => {
  const w = row.length;
  const WINDOW = 16 * windowScale;
  // Mild unsharp (gain < 1): a small item held close blurs its ~2px bars so a
  // "1px bar / 1px gap" pair collapses to nearly identical mid-grey pixels,
  // which no threshold can separate. The mask leans on SPATIAL context: the
  // gap pixel is locally bright against bar neighbours, the bar centre is
  // locally dark — so boosting each pixel against its 3-tap box pulls the gap
  // back up while driving the bar centre down, restoring the run structure.
  // Gain is set conservatively: too much overshoot widens crisp bars (and
  // reading errors on washed-out packs), so it is off by default and the
  // super-resolution fallback in decodeEanLocalRow does the sub-pixel heavy
  // lifting instead.
  const GAIN = 0;
  const lum = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    const a = Math.max(0, x - 1);
    const b = Math.min(w - 1, x + 1);
    const m = (row[a] + row[x] + row[b]) / (b - a + 1);
    const v = row[x] + GAIN * (row[x] - m);
    lum[x] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  // Local min/max over [x-WINDOW, x+WINDOW] (clamped). A naive per-pixel inner
  // loop over the window is O(w·WINDOW) — at the 4× super-resolution rows in
  // decodeEanLocalRow plus the tilt sweep's many sampled lines that is O(w²)
  // per row and blocks the main thread for SECONDS. That freeze starves the
  // video pipeline and makes browsers drop the camera track — the cause of the
  // endless reconnects. A monotonic-deque sliding window computes the exact
  // same values in O(w).
  const lmin = new Float32Array(w);
  const lmax = new Float32Array(w);
  const qMin = new Int32Array(w);
  const qMax = new Int32Array(w);
  let hMin = 0;
  let tMin = -1;
  let hMax = 0;
  let tMax = -1;
  let rEdge = -1;
  for (let x = 0; x < w; x++) {
    const rTarget = Math.min(w - 1, x + WINDOW);
    while (rEdge < rTarget) {
      rEdge++;
      const v = lum[rEdge];
      while (tMin >= hMin && lum[qMin[tMin]] >= v) tMin--;
      qMin[++tMin] = rEdge;
      while (tMax >= hMax && lum[qMax[tMax]] <= v) tMax--;
      qMax[++tMax] = rEdge;
    }
    const lTarget = Math.max(0, x - WINDOW);
    while (hMin <= tMin && qMin[hMin] < lTarget) hMin++;
    while (hMax <= tMax && qMax[hMax] < lTarget) hMax++;
    lmin[x] = lum[qMin[hMin]];
    lmax[x] = lum[qMax[hMax]];
  }
  const black = new Uint8Array(w);
  for (let x = 0; x < w; x++) {
    const t = (lmin[x] + lmax[x]) / 2;
    // Adaptive margin: crisp high-contrast rows keep ~8 (2px bars survive
    // intact); a small item held close blurs the bars into mid-grey, so their
    // local contrast collapses and the margin must fall to ~4 or thin bars
    // dissolve into the ground. Scaling it off local contrast adapts to both.
    const contrast = lmax[x] - lmin[x];
    const margin = Math.max(4, Math.min(8, Math.round(contrast * 0.1)));
    black[x] = lum[x] < t - margin ? 1 : 0;
  }
  const runs: { b: number; n: number; c: number }[] = [];
  let start = 0;
  for (let x = 1; x <= w; x++) {
    if (x === w || black[x] !== black[start]) {
      runs.push({ b: black[start], n: x - start, c: start });
      start = x;
    }
  }
  const nR = runs.length;
  if (nR < 22) return null;

  for (let i = 0; i + 2 < nR; i++) {
    const r0 = runs[i];
    const r1 = runs[i + 1];
    const r2 = runs[i + 2];
    if (!(r0.b && !r1.b && r2.b)) continue;
    const wide = Math.max(r0.n, r2.n);
    const narrow = Math.min(r0.n, r2.n);
    if (narrow * 2 < wide) continue;
    const M = (r0.n + r1.n + r2.n) / 3;
    if (M < 1.5) continue;
    // Guard bars must all be about one module wide — text/graphics "lookalike"
    // bars often are not.
    const minW = M * 0.55;
    const maxW = M * 1.6;
    if (
      r0.n < minW ||
      r0.n > maxW ||
      r1.n < minW ||
      r1.n > maxW ||
      r2.n < minW ||
      r2.n > maxW
    )
      continue;
    let quiet = 0;
    for (let x = r0.c - 1; x >= 0 && black[x] === 0; x--) quiet++;
    if (quiet < M * 4) continue;

    let pos = i + 3;
    const sides: string[] = [];
    const left: number[] = [];
    let ok = true;
    for (let d = 0; d < 6; d++) {
      if (pos + 3 >= nR) {
        ok = false;
        break;
      }
      const runs4 = runs.slice(pos, pos + 4);
      if (runs4[0].b !== 0) {
        ok = false;
        break;
      }
      const total = runs4.reduce((s, r) => s + r.n, 0);
      const m = total / 7;
      const norm = runs4.map((r) => Math.round(r.n / m));
      const best = eanMatchDigit(norm, EAN_LG_RUNS);
      if (best < 0) {
        ok = false;
        break;
      }
      left.push(best % 10);
      sides.push(best < 10 ? "L" : "G");
      pos += 4;
    }
    if (!ok) continue;

    if (pos + 4 >= nR) continue;
    const g0 = runs[pos];
    const g1 = runs[pos + 1];
    const g2 = runs[pos + 2];
    const g3 = runs[pos + 3];
    const g4 = runs[pos + 4];
    if (!(!g0.b && g1.b && !g2.b && g3.b && !g4.b)) continue;
    // Center guard is also five one-module runs; sizing it anchors the whole
    // right-half alignment.
    if (
      g0.n < minW ||
      g0.n > maxW ||
      g1.n < minW ||
      g1.n > maxW ||
      g2.n < minW ||
      g2.n > maxW ||
      g3.n < minW ||
      g3.n > maxW ||
      g4.n < minW ||
      g4.n > maxW
    )
      continue;
    pos += 5;

    const right: number[] = [];
    let rok = true;
    for (let d = 0; d < 6; d++) {
      if (pos + 3 >= nR) {
        rok = false;
        break;
      }
      const runs4 = runs.slice(pos, pos + 4);
      if (runs4[0].b !== 1) {
        rok = false;
        break;
      }
      const total = runs4.reduce((s, r) => s + r.n, 0);
      const m = total / 7;
      const norm = runs4.map((r) => Math.round(r.n / m));
      const best = eanMatchDigit(norm, EAN_R_RUNS);
      if (best < 0) {
        rok = false;
        break;
      }
      right.push(best);
      pos += 4;
    }
    if (!rok) continue;

    if (pos + 2 >= nR) continue;
    const tr = runs[pos];
    const ts = runs[pos + 1];
    const tq = runs[pos + 2];
    if (!(tr.b && !ts.b && tq.b)) continue;
    const endPx = tq.c + tq.n;
    let qAfter = 0;
    for (let x = endPx; x < w && black[x] === 0; x++) qAfter++;
    if (qAfter < M * 4) continue;
    // Whole-symbol consistency: guard-to-guard must span ~95 modules. Catches
    // decodes that saw a false guard but then "only just" fit a digit run.
    const spanModules = (endPx - r0.c) / M;
    if (spanModules < 82 || spanModules > 108) continue;

    const firstDigit = EAN_FIRST_PARITY.indexOf(sides.join(""));
    if (firstDigit < 0) continue;
    const num =
      String(firstDigit) + left.map(String).join("") + right.map(String).join("");
    const digs = num.split("").map(Number);
    let sum = 0;
    for (let k = 0; k < 12; k++) sum += (k % 2 === 0 ? 1 : 3) * digs[k];
    if ((10 - (sum % 10)) % 10 !== digs[12]) continue;
    return num;
  }
  return null;
};

// Choose row-decimation factors for the wide-module path in decodeEanLocalRow.
// Fixes the "big barcode" case: a label held close to the camera puts each EAN
// module on 5-10px, which the strict digit matcher (tuned for ~2px modules)
// rejects in both the base and 4x subdivision paths. Decimating the row back
// to ~2px modules (box averaging below) turns the same pixels into the proven
// near-width case. The module size is estimated cheaply from the FIXED-threshold
// run widths (median ≈ 1.5 modules); a dense/textured row has sub-3px runs and
// returns no factors, so the heavy path is never wasted on fine noise. Only
// consulted after base and 4x have failed.
const pickDecimationFactors = (row: Float32Array): number[] => {
  const w = row.length;
  const widths: number[] = [];
  let prevBlack = row[0] < 128 ? 1 : 0;
  let start = 0;
  for (let x = 1; x <= w; x++) {
    const cur = x < w ? (row[x] < 128 ? 1 : 0) : 1 - prevBlack;
    if (cur !== prevBlack || x === w) {
      const n = x - start;
      if (n >= 3 && n < 40) widths.push(n);
      prevBlack = cur;
      start = x;
    }
  }
  if (!widths.length) return [];
  const sorted = widths.slice().sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  if (med < 3.2) return [];
  // Target ~2.2px modules: med ≈ 1.5 * modulePx, so k ≈ med / 3.3. Sweep one
  // factor either side to absorb the median's ±1-module variance.
  const kCore = Math.max(2, Math.min(8, Math.round(med / 3.3)));
  const out: number[] = [];
  for (const kk of new Set([kCore - 1, kCore, kCore + 1])) {
    if (kk < 2) continue;
    const dw = Math.floor(w / kk);
    if (dw >= 120 && dw <= 640) out.push(kk);
  }
  return out;
};

// Decode one grayscale row at a chosen sampling phase (see below).
const decodeEanLocalRow = (
  row: Float32Array,
  depth = 0
): string | null => {
  const w = row.length;
  if (w < 80) return null;
  const base = decodeEanRowPhase(row);
  if (base) return base;
  // Sub-pixel misalignment — the real small-code killer: at ~2px modules the
  // bar grid rarely lands on pixel boundaries, so pixels straddle edges and
  // every run comes out 1/2/3px at random. More importantly, normalising a
  // digit's run widths by its own module M QUANTISES each width to whole M
  // units — at M≈2px that quantum is half a module per edge and exceeds the
  // strict digit-matcher tolerance, so no phase shift can ever match the
  // pattern. Re-sampling the SAME row at 4× via linear interpolation makes the
  // effective module ~8px, the rounding quantum ~0.12 units, and edges land on
  // quarter-pixel boundaries — the same proven decoder then fits the pattern.
  // The threshold window must scale with M (16px at 1× ≈ 16 units of ~2px M;
  // at 4× each px is 0.25 units), hence windowScale = 4.
  const R = 4;
  const hr = new Float32Array(w * R);
  for (let i = 0; i < w * R; i++) {
    const p = i / R;
    const lo0 = Math.floor(p);
    const frac = p - lo0;
    const lo = Math.min(w - 1, lo0);
    const hi = Math.min(w - 1, lo0 + 1);
    hr[i] = row[lo] * (1 - frac) + row[hi] * frac;
  }
  const wide = decodeEanRowPhase(hr, R);
  if (wide) return wide;
  // Wide modules (see pickDecimationFactors): box-average decimate to ~2px
  // modules and re-run the full row path. Box averaging (unlike bilinear)
  // preserves bar/slot edges, and re-running the 4x subdivision on the
  // decimated row supplies the same sub-pixel alignment that helps small
  // codes. Bounded to one recursion level so a decimated row can never
  // decimate again.
  if (depth >= 1) return null;
  for (const k of pickDecimationFactors(row)) {
    const dw = Math.floor(w / k);
    const dr = new Float32Array(dw);
    for (let i = 0; i < dw; i++) {
      let s = 0;
      for (let j = 0; j < k; j++) s += row[i * k + j];
      dr[i] = s / k;
    }
    const dec = decodeEanLocalRow(dr, depth + 1);
    if (dec) return dec;
  }
  return null;
};

// Exhaustively sample rows from a canvas and try the local-threshold decode on
// each. Unlike a handful of fixed row fractions, this walks every `stride`-th
// row across the full height, so a barcode with a very short bar height (tiny
// print / product labels) is caught no matter which rows it occupies. Rows are
// cheaply screened first by counting luminance transitions — barcode rows have
// dozens of them, smooth rows have none — so most rows never reach the
// (heavier) run-length decoder.
// Resumable sweep cursor. The EAN row sweep can cost seconds on textured
// scenes, so every call is given a strict wall-clock budget and records which
// sampled row it reached; the next call continues from there and wraps, so ALL
// rows still get scanned across frames while no single frame ever blocks the
// main thread (blocking is what starves the video pipeline → browsers drop the
// camera track → the endless "reconnecting camera" restarts).
type EanSweepState = {
  next: number;
  rows: number;
};

const decodeEanLocalCanvas = (
  canvas: HTMLCanvasElement,
  opts: {
    stride?: number;
    maxMs?: number;
    maxHeavy?: number;
    resume?: EanSweepState;
  } = {}
): string | null => {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || canvas.width < 100 || canvas.height < 20) return null;
  const w = canvas.width;
  const h = canvas.height;
  const img = ctx.getImageData(0, 0, w, h).data;
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    g[i] =
      0.299 * img[4 * i] + 0.587 * img[4 * i + 1] + 0.114 * img[4 * i + 2];
  }
  const stride = opts.stride ?? 2;
  const maxMs = opts.maxMs ?? Infinity;
  const maxHeavy = opts.maxHeavy ?? Infinity;
  const resume = opts.resume ?? null;
  const row = new Float32Array(w);
  const MIN_TRANSITIONS = 24;
  const votes = new Map<string, number>();

  const totalRows = Math.ceil(h / stride);
  let next = 0;
  if (resume) {
    if (resume.rows !== totalRows) {
      resume.rows = totalRows;
      resume.next = 0;
    }
    next = resume.next;
    if (next >= totalRows) next = 0;
  }

  const start = performance.now();
  let heavyProcessed = 0;
  for (let s = 0; s < totalRows; s++) {
    const y = next * stride;
    if (y >= h) {
      if (resume) resume.next = 0;
      next = 0;
      continue;
    }
    const base = y * w;
    let transitions = 0;
    let prev = g[base];
    for (let x = 1; x < w; x++) {
      const v = g[base + x];
      if (Math.abs(v - prev) > 18) transitions++;
      prev = v;
    }
    if (transitions >= MIN_TRANSITIONS) {
      // A single heavy row's run-length decode can cost 20-200ms on textured
      // scenes; processing several in one frame stacks those road-bumps into a
      // multicam-stalling block. Cap heavy rows per call so each budget slice
      // never does more than one expensive decode (the resume cursor still
      // makes forward progress every frame).
      if (heavyProcessed >= maxHeavy) break;
      heavyProcessed++;
      for (let x = 0; x < w; x++) row[x] = g[base + x];
      const result = decodeEanLocalRow(row);
      if (result) {
        votes.set(result, (votes.get(result) ?? 0) + 1);
      }
    }
    next = (next + 1) % totalRows;
    if (resume) resume.next = next;
    if (heavyProcessed >= maxHeavy) break;
    if (performance.now() - start > maxMs) break;
  }
  // A single row can fluke a wrong-but-checksum-valid result (noise, glare,
  // diverging runs); real barcodes produce the same number across many rows.
  // But requiring two rows strands tiny codes whose SHORT bars only cross 1-2
  // of the sampled rows. Accepting a single-row read is safe here because
  // processFrame still requires the SAME code to decode again on a later
  // candidate frame (cross-frame confirmation) before reporting it — a fluke
  // essentially never reproduces, a real barcode always does.
  let best = null as string | null;
  let bestVotes = 0;
  for (const [code, n] of votes) {
    if (n > bestVotes) {
      bestVotes = n;
      best = code;
    }
  }
  return best !== null ? best : null;
};

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
  const oneDDecoderRef = useRef<Decoder | null>(null);
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
  const framesSinceMagnifyRef = useRef(0);
  const lastHeavyAtRef = useRef(0);
  const lastTryHarderAtRef = useRef(0);
  const snapshotRef = useRef<Uint8ClampedArray | null>(null);
  const thumbCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pendingCodeRef = useRef<{ code: string; at: number } | null>(null);
  // Resumable cursors for the budgeted EAN sweeps (see EanSweepState). Each
  // pass keeps one so its full row range gets covered across frames.
  const resumeBandRef = useRef<EanSweepState>({ next: 0, rows: -1 });
  const resumeCenterRef = useRef<EanSweepState>({ next: 0, rows: -1 });
  const resumeRotatedRef = useRef<EanSweepState>({ next: 0, rows: -1 });
  const resumeFullRef = useRef<EanSweepState>({ next: 0, rows: -1 });
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

  // Decoder used by the scan-line and full-frame passes: 1D only (see the
  // ONE_D_FORMATS note above).
  const getOneDDecoder = (): Decoder => {
    if (!oneDDecoderRef.current) {
      const hints = new Map<number, any>();
      hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, ONE_D_FORMATS);
      oneDDecoderRef.current = {
        reader: new ZXing.MultiFormatReader(false, hints),
        hints,
      };
    }
    return oneDDecoderRef.current;
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
    pendingCodeRef.current = null;
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
    return diff / (w * h * 3) > MOTION_THRESHOLD;
  };

  // Crop regions used by the magnified-pass fallback. Rotating through
  // center/left/right covers barcodes that sit to one side of the frame or wrap
  // around a curved surface (can / bottle) where only a portion faces the
  // camera.
  const ZOOM_REGIONS = [
    { x: 0.25, y: 0.18, w: 0.5, h: 0.64 }, // center
    { x: 0.0, y: 0.2, w: 0.5, h: 0.6 }, // left
    { x: 0.5, y: 0.2, w: 0.5, h: 0.6 }, // right
  ];

  // Focus-and-magnify: profile the frame's central band with a coarse
  // vertical-edge map to find where a small barcode actually is, then crop
  // just that region and upscale it into the standard ~96-row scan canvas.
  // The whole-width Pass 1 only reads codes that already span much of the
  // frame; a tight crop here buys back pixels-per-module for small labels, and
  // unlike a fixed 50%-wide crop it never shrinks the code it found.
  const runFocusPass = (
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
    vw: number,
    vh: number,
    useTryHarder: boolean
  ): string | null => {
    const bandSy = vh * 0.15;
    const bandSh = vh * 0.7;
    const sy = Math.round(bandSy);
    // Row resolution matters as much as column resolution for SMALL codes with
    // SHORT bars: if the band is squashed into too few rows, only 1-2 sample
    // rows actually cross the bars and the row-agreement vote starves. Keep up
    // to ~160 rows (short bars then span ~8-12 sample rows).
    const dh = Math.max(48, Math.min(160, Math.round(bandSh * 0.45)));

    // Localization probe at NATIVE horizontal resolution. Downsampling the x
    // axis (as a 192-col probe did) box-averages every ~6.7px so the interior
    // of a small-module barcode falls to mid-gray and only the guard edges
    // survive — the crop then lops off the code. Drawing the band at vw:1 keeps
    // one pixel per column; vertically it is still expanded into ~160 rows so
    // even short bars are crossed by several sample rows.
    const probeW = vw;
    const probeH = 160;
    if (!drawSource(canvas, video, 0, bandSy, vw, bandSh, probeW, probeH)) return null;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    const data = ctx.getImageData(0, 0, probeW, probeH).data;
    // Per-column vertical-edge density: barcode bars produce strong, sustained
    // horizontal transitions; label text / surface edges produce sparse ones.
    const dens = new Array<number>(probeW).fill(0);
    for (let y = 0; y < probeH; y++) {
      const base = y * probeW * 4;
      let prevLum =
        data[base] * 0.3 + data[base + 1] * 0.59 + data[base + 2] * 0.11;
      for (let x = 1; x < probeW; x++) {
        const i = base + x * 4;
        const lum = data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11;
        dens[x] += Math.abs(lum - prevLum) > 18 ? 1 : 0;
        prevLum = lum;
      }
    }
    // Smooth the profile, then pick the longest contiguous run of high edge
    // density (bar code) over short spikes (text/graphics).
    const smooth = new Array<number>(probeW).fill(0);
    for (let x = 0; x < probeW; x++) {
      let s = 0;
      let n = 0;
      for (let k = -3; k <= 3; k++) {
        const xi = x + k;
        if (xi >= 0 && xi < probeW) {
          s += dens[xi];
          n++;
        }
      }
      smooth[x] = s / n;
    }
    let maxD = 0;
    for (let x = 0; x < probeW; x++) if (smooth[x] > maxD) maxD = smooth[x];

    const attempt = (sx: number, sw: number): string | null => {
      const targetW = Math.max(1, Math.min(512, Math.round(sw * 4)));
      if (!drawSource(canvas, video, sx, sy, sw, bandSh, targetW, dh)) return null;
      // 1) Local-threshold EAN sweep on the MAGNIFIED raster. ZXing's
      // whole-frame binarizer is defeated by coloured/dark packaging while
      // this decoder is surround-immune, and running it on the magnified crop
      // (not the native pixels) is what makes SMALL dark labels readable — the
      // crop buys back pixels-per-module. Bounded by a wall-clock budget so a
      // textured crop can never stall the frame.
      const ean = decodeEanLocalCanvas(canvas, { stride: 1, maxMs: 6, maxHeavy: 1 });
      if (ean) return ean;
      // 2) ZXing 1D (no ITF): Code128/39/93 plus light-surround small codes
      // that the EAN sweep does not model. Crops stay ≤512 wide so this stays
      // cheap; ITF was dropped because its finder blows up on textured scenes.
      const zx = decodeCanvasBest(canvas, getOneDDecoder());
      if (zx) return zx;
      // 3) TRY_HARDER last-resort only (static scene, throttled in processFrame).
      return useTryHarder ? decodeCanvasBest(canvas, getTryHarderDecoder()) : null;
    };

    if (!(maxD > 0)) {
      const region = ZOOM_REGIONS[cropIndexRef.current % ZOOM_REGIONS.length];
      cropIndexRef.current += 1;
      const fx = Math.max(0, Math.round(vw * region.x));
      const fw = Math.min(vw, Math.max(1, Math.round(vw * region.w)));
      return attempt(fx, fw);
    }

    const thr = maxD * 0.4;
    let bestStart = -1;
    let bestLen = 0;
    let bestAvg = 0;
    let runStart = -1;
    let runScore = 0;
    let runCount = 0;
    for (let x = 0; x <= probeW; x++) {
      const active = x < probeW && smooth[x] > thr;
      if (active && runStart < 0) {
        runStart = x;
        runScore = 0;
        runCount = 0;
      }
      if (active) {
        runScore += smooth[x];
        runCount++;
      }
      if (runStart >= 0 && (!active || x === probeW)) {
        const len = x - runStart;
        const avg = runCount ? runScore / runCount : 0;
        const better =
          len > bestLen || (len === bestLen && len > 0 && avg > bestAvg);
        if (len >= 3 && better) {
          bestStart = runStart;
          bestLen = len;
          bestAvg = avg;
        }
        runStart = -1;
        runScore = 0;
        runCount = 0;
      }
    }
    if (bestStart < 0) {
      const region = ZOOM_REGIONS[cropIndexRef.current % ZOOM_REGIONS.length];
      cropIndexRef.current += 1;
      const fx = Math.max(0, Math.round(vw * region.x));
      const fw = Math.min(vw, Math.max(1, Math.round(vw * region.w)));
      return attempt(fx, fw);
    }

    // The best run is usually the code's DENSE CENTER — on a tilted, short-bar
    // code the end bars produce roughly half the edge-density, so the run stops
    // well short of the code's true span. A crop of just the center contains no
    // start/end guards and can never decode. Expand the span outward along much
    // lower edge density (code-edge bars still exceed it; the quiet zone beyond
    // falls far below), allowing a 3-column dip for texture.
    const lowThr = maxD * 0.08;
    let p0 = bestStart;
    let p1 = bestStart + bestLen - 1;
    let grace = 3;
    while (p0 > 0) {
      const active = smooth[p0 - 1] > lowThr;
      if (active) {
        grace = 3;
        p0--;
      } else if (grace > 0) {
        grace--;
        p0--;
      } else break;
    }
    grace = 3;
    while (p1 < probeW - 1) {
      const active = smooth[p1 + 1] > lowThr;
      if (active) {
        grace = 3;
        p1++;
      } else if (grace > 0) {
        grace--;
        p1++;
      } else break;
    }

    // Convert the expanded span back to video pixels with quiet-zone padding,
    // plus a small minimum-width floor so the crop never collapses.
    const probePx = vw / probeW;
    const pad = Math.round((p1 - p0 + 1) * probePx * 0.12);
    let x0 = Math.max(0, Math.round(p0 * probePx) - pad);
    let x1 = Math.min(vw, Math.round((p1 + 1) * probePx) + pad);
    if (x1 - x0 < 24) {
      const c = Math.round((x0 + x1) / 2);
      x0 = Math.max(0, c - 12);
      x1 = Math.min(vw, c + 12);
    }
    return attempt(x0, x1 - x0);
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

    // Pass 1 — scan line. Keep FULL horizontal resolution (1D barcodes only
    // care about width), squash height to ~96 rows, and run the surround-immune
    // EAN sweep. This runs EVERY frame, but under a wall-clock budget with a
    // resumable cursor: a textured scene that would previously spawn a ~2s
    // main-thread block now spends at most ~5ms per frame (the sweep resumes
    // where it stopped on the next frame and still covers every row). The old
    // per-frame ZXing decode is gone from here because even a "fast" ZXing run
    // on a busy frame could take hundreds of ms every frame — that starvation
    // is what makes browsers kill the camera track.
    const bandSh = vh * 0.6;
    const bandSy = vh * 0.2;
    const dh1 = Math.max(40, Math.min(96, Math.round(bandSh)));
    if (drawSource(canvas, video, 0, bandSy, vw, bandSh, vw, dh1)) {
      code = decodeEanLocalCanvas(canvas, {
        stride: 2,
        maxMs: 5,
        maxHeavy: 1,
        resume: resumeBandRef.current,
      });
    }

    // Pass 2 — centered band, aspect preserved (catches off-center / codes in
    // the outer band margins). Budgeted EAN sweep, same reasoning as Pass 1.
    if (!code) {
      const sh2 = vh * 0.5;
      const sy2 = vh * 0.25;
      const dw2 = Math.min(vw, 960);
      const dh2 = Math.round((sh2 * dw2) / vw);
      if (drawSource(canvas, video, 0, sy2, vw, sh2, dw2, dh2)) {
        code = decodeEanLocalCanvas(canvas, {
          stride: 2,
          maxMs: 5,
          maxHeavy: 1,
          resume: resumeCenterRef.current,
        });
      }
    }

    // Pass 3 — rotated scan line: catches barcodes being held sideways (bars
    // horizontal), which the horizontal passes above can't see. Also EAN-only
    // and budgeted for the same reasons as Pass 1/2.
    if (!code) {
      const rx = vw * 0.15;
      const rw = vw * 0.7;
      if (drawRotatedBand(canvas, video, Math.round(rx), 0, Math.round(rw), vh)) {
        code = decodeEanLocalCanvas(canvas, {
          stride: 1,
          maxMs: 5,
          maxHeavy: 1,
          resume: resumeRotatedRef.current,
        });
      }
    }

    // Heavy passes (full frame / magnified crop) alternate, but only on frames
    // where the scene changed — or at least every MAX_STATIC_HEAVY_FRAMES
    // frames so a still, in-view barcode never goes unhandled. These are the
    // ONLY places ZXing runs (the every-frame passes above are EAN-only), so a
    // ZXing hit is heavy-gated AND the scenes it chokes on get the cheap,
    // bounded EAN sweep instead.
    if (!code) {
      framesSinceHeavyRef.current += 1;
      const nowH = performance.now();
      const motion = detectMotion(video, vw, vh);
      const intervalReady = nowH - lastHeavyAtRef.current >= HEAVY_PASS_INTERVAL_MS;
      if (motion) framesSinceMagnifyRef.current = 0;
      if (
        (motion || framesSinceHeavyRef.current >= MAX_STATIC_HEAVY_FRAMES) &&
        intervalReady
      ) {
        framesSinceHeavyRef.current = 0;
        lastHeavyAtRef.current = nowH;
        if (frameCounterRef.current % 2 === 0) {
          // Pass 4 — band ZXing + full-frame EAN. First a narrowed (~786px)
          // ZXing pass over the horizontal band catches Code128/39/93 and
          // plain light-surround codes that the EAN-only passes above never
          // model; 786px keeps it cheap and it is already heavy-gated. Then
          // the full-frame EAN sweep covers rows outside every band (top /
          // bottom of frame), budgeted+resumed like Pass 1.
          const dwz = Math.min(vw, 786);
          const dhz = Math.max(40, Math.round((bandSh * dwz) / vw));
          if (drawSource(canvas, video, 0, bandSy, vw, bandSh, dwz, dhz)) {
            code = decodeCanvasBest(canvas, getOneDDecoder());
          }
          if (!code) {
            const dw4 = Math.min(vw, 1280);
            const dh4 = Math.round((vh * dw4) / vw);
            if (drawSource(canvas, video, 0, 0, vw, vh, dw4, dh4)) {
              code = decodeEanLocalCanvas(canvas, {
                stride: 2,
                maxMs: 10,
                maxHeavy: 1,
                resume: resumeFullRef.current,
              });
            }
          }
        } else {
          // Pass 5 — focus-and-magnify (small / curved / off-center codes).
          // Small codes span too few pixels for any full-width pass, so this
          // probes where the dense vertical edges are, crops just that region
          // and upscales it ~4x, then decodes the magnified raster with the
          // budgeted EAN sweep and (heavy-gated) ZXing. TRY_HARDER is the
          // single most expensive op in the scanner (~0.5s), so it only runs
          // on a HELD-STEADY scene — never during motion — and at most every
          // TRY_HARDER_INTERVAL_MS; a lone 0.5s hit between smooth frames
          // keeps the preview and the camera track alive.
          framesSinceMagnifyRef.current += 1;
          let useTryHarder = false;
          if (
            !motion &&
            framesSinceMagnifyRef.current >= MAX_STATIC_MAGNIFY_FRAMES &&
            nowH - lastTryHarderAtRef.current >= TRY_HARDER_INTERVAL_MS
          ) {
            framesSinceMagnifyRef.current = 0;
            lastTryHarderAtRef.current = nowH;
            useTryHarder = true;
          }
          code = runFocusPass(canvas, video, vw, vh, useTryHarder);
        }
      }
    }
    frameCounterRef.current += 1;

    if (code) {
      // Canonical form: an EAN-13 whose leading digit is 0 IS a UPC-A code —
      // ZXing reports those as 12 digits while the local EAN decode reports 13
      // (leading zero). Different passes can thus report the SAME physical
      // label in two strings, which would defeat cross-frame confirmation.
      // Normalising to the printed UPC-A form (drop the leading 0) makes all
      // passes agree, and matches databases populated from the printed code.
      if (/^0\d{12}$/.test(code)) code = code.slice(1);
      const pending = pendingCodeRef.current;
      // Cross-frame confirmation: report a code only once the SAME number
      // decodes again on the next frame that yields a candidate. Image-noise,
      // glare, and finger-angle flukes are frame-specific — they essentially
      // never reproduce one candidate later. A real barcode decodes on every
      // frame, so this adds one decode cycle (~ms) of latency while being the
      // strongest single guard against wrong reads. Being event-count based
      // (not wall-clock based) it works at any framerate, including throttled
      // or slow devices.
      if (pending && pending.code === code) {
        pendingCodeRef.current = null;
        handleScan(code);
        return performance.now() - start;
      }
      pendingCodeRef.current = { code, at: performance.now() };
      return performance.now() - start;
    }

    // Stuck-scan guidance: after the opening grace period, if no barcode has
    // been read, surface a (throttled) tip so the scanner never looks silently
    // dead. This runs every frame and costs nothing when throttled.
    const nowP = performance.now();
    if (
      nowP >= slowToastGraceUntilRef.current &&
      nowP - slowToastAtRef.current > SLOW_TOAST_COOLDOWN_MS
    ) {
      slowToastAtRef.current = nowP;
      onErrorRef.current?.(
        "No barcode read yet — move the product closer, flatten the label, and hold steady."
      );
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
    framesSinceMagnifyRef.current = 0;

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
