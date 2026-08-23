import { useEffect, useRef } from "react";

type KeyboardScannerOptions = {
  onBarcode: (code: string) => void;
  onNoBarcode?: () => void;
  enabled?: boolean;
  gapMs?: number;
  minLength?: number;
  waitMs?: number;
  /** The dedicated scanner input, if any. Keystrokes in OTHER editable
   *  fields are never treated as a scanner burst, so normal typing works. */
  captureRef?: React.RefObject<HTMLElement | null>;
};

const isEditable = (el: Element | null): boolean =>
  !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");

export function useKeyboardScanner({
  onBarcode,
  onNoBarcode,
  enabled = true,
  gapMs = 50,
  minLength = 4,
  waitMs = 50,
  captureRef,
}: KeyboardScannerOptions) {
  const bufferRef = useRef("");
  const lastKeyTimeRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const burstRef = useRef(false);
  const focusElRef = useRef<Element | null>(null);
  const focusValueRef = useRef<string | null>(null);

  const cbRef = useRef({ onBarcode, onNoBarcode });
  cbRef.current = { onBarcode, onNoBarcode };
  const cfgRef = useRef({ enabled, gapMs, minLength, waitMs, captureRef });
  cfgRef.current = { enabled, gapMs, minLength, waitMs, captureRef };

  const reset = () => {
    bufferRef.current = "";
    lastKeyTimeRef.current = 0;
    burstRef.current = false;
    focusElRef.current = null;
    focusValueRef.current = null;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const finish = (fromEnter: boolean) => {
    const code = bufferRef.current;
    const ok = code.length >= cfgRef.current.minLength;
    const el = focusElRef.current as HTMLElement | null;
    const savedValue = focusValueRef.current;
    const wasBurst = burstRef.current;
    reset();
    if (ok) {
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) {
        const input = el as HTMLInputElement | HTMLTextAreaElement;
        if (savedValue !== null && input.value !== savedValue) {
          input.value = savedValue;
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
      cbRef.current.onBarcode(code.trim());
    } else if (fromEnter && wasBurst && code.length > 0) {
      cbRef.current.onNoBarcode?.();
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const cfg = cfgRef.current;
      if (!cfg.enabled) return;

      const active = document.activeElement;
      const targetEl = cfg.captureRef?.current ?? null;

      // Never hijack keystrokes typed into an unrelated editable field.
      if (isEditable(active) && active !== targetEl) {
        if (bufferRef.current.length > 0) {
          reset();
        }
        return;
      }

      const now = Date.now();

      if (e.key === "Enter") {
        const len = bufferRef.current.length;
        if (len > 0) {
          if (len >= cfg.minLength) {
            e.preventDefault();
            e.stopPropagation();
            finish(true);
          } else {
            const wasBurst = burstRef.current;
            reset();
            if (wasBurst) {
              e.preventDefault();
              e.stopPropagation();
              cbRef.current.onNoBarcode?.();
            }
          }
        }
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const sinceLast = now - lastKeyTimeRef.current;
        const continuing = sinceLast <= cfg.gapMs && lastKeyTimeRef.current !== 0;

        if (continuing) {
          e.preventDefault();
          e.stopPropagation();
          burstRef.current = true;
          bufferRef.current += e.key;
        } else {
          focusElRef.current = active;
          focusValueRef.current =
            active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")
              ? (active as HTMLInputElement).value
              : null;
          bufferRef.current = e.key;
          burstRef.current = false;
        }
        lastKeyTimeRef.current = now;

        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current);
        }
        timerRef.current = window.setTimeout(() => {
          finish(false);
        }, cfg.waitMs);
      } else if (
        e.key !== "Shift" &&
        e.key !== "Control" &&
        e.key !== "Alt" &&
        e.key !== "Meta"
      ) {
        if (bufferRef.current.length > 0) {
          reset();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!enabled) reset();
  }, [enabled]);
}
