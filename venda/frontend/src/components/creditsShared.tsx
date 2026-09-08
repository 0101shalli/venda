import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { barcodeFormat } from "../utils/barcode";

export type StoreCredit = {
  id: number;
  credit_code: string;
  product_id: number;
  product_barcode: string;
  product_name: string;
  sale_id: number | null;
  sale_item_id?: number | null;
  quantity: number;
  unit_price: number;
  discount_percentage: number;
  amount: number;
  client_name: string;
  client_age?: string | null;
  client_address?: string | null;
  expiry_date?: string | null;
  status: "unclaimed" | "unavailable" | "claimed" | "cancelled";
  claimed_amount: number | null;
  claimed_at?: string | null;
  cancelled_at?: string | null;
  created_at: string;
};

export function CreditBarcode({ value, label }: { value: string; label?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, {
        format: barcodeFormat(value),
        width: 1.6,
        height: 42,
        displayValue: false,
        background: "#FFFFFF",
        lineColor: "#000000",
      });
    } catch (err) {
      console.error("JsBarcode error:", err);
    }
  }, [value]);
  return (
    <div className="flex flex-col items-center gap-1">
      <svg ref={ref} />
      {label && <span className="font-mono text-[10px] text-slate-600 dark:text-slate-400">{label}</span>}
    </div>
  );
}

export type StoreBranding = {
  storeName: string;
  storeLogo: string;
  storeContact1: string;
  storeContact2: string;
  storeEmail: string;
  storeWebsite: string;
  storeLocation: string;
};

export const DEFAULT_BRANDING: StoreBranding = {
  storeName: "GENERAL STORE",
  storeLogo: "",
  storeContact1: "",
  storeContact2: "",
  storeEmail: "",
  storeWebsite: "",
  storeLocation: "",
};

export async function fetchStoreBranding(): Promise<StoreBranding> {
  const branding: StoreBranding = { ...DEFAULT_BRANDING };
  try {
    const res = await fetch("/api/settings");
    if (res.ok) {
      const data = await res.json();
      if (data.store_name && data.store_name.trim()) branding.storeName = data.store_name.trim();
      branding.storeLogo = data.store_logo || "";
      branding.storeContact1 = data.store_contact1 || "";
      branding.storeContact2 = data.store_contact2 || "";
      branding.storeEmail = data.store_email || "";
      branding.storeWebsite = data.store_website || "";
      branding.storeLocation = data.store_location || "";
    }
  } catch {
    // fall back to default branding
  }
  return branding;
}

export function printBrandingHeaderHtml(storeLogo: string): string {
  return storeLogo
    ? `<img src="${storeLogo}" alt="logo" style="max-height:44px;max-width:110px;object-fit:contain;display:block;margin-bottom:6px;" />`
    : "";
}

export function brandingContactLines(b: StoreBranding): string[] {
  const lines: string[] = [];
  if (b.storeContact1) lines.push(b.storeContact1);
  if (b.storeContact2) lines.push(b.storeContact2);
  if (b.storeEmail) lines.push(b.storeEmail);
  if (b.storeWebsite) lines.push(b.storeWebsite);
  if (b.storeLocation) lines.push(b.storeLocation);
  return lines;
}

/** Footer contact block for print windows. Empty when no contact info set. */
export function printBrandingFooterHtml(b: StoreBranding): string {
  const lines = brandingContactLines(b);
  if (!lines.length) return "";
  return `<div style="border-top:1px solid #cbd5e1;margin-top:12px;padding-top:8px;font-size:9px;color:#64748b;text-align:center;line-height:1.6;">${lines.join(" · ")}</div>`;
}

export const CREDIT_STATUS_LABEL: Record<StoreCredit["status"], string> = {
  unclaimed: "UNCLAIMED",
  unavailable: "UNAVAILABLE",
  claimed: "CLAIMED",
  cancelled: "CANCELLED",
};

export async function printCreditCard(credit: StoreCredit, amountText: string): Promise<{ success: boolean; message: string }> {
  try {
    const branding = await fetchStoreBranding();
    const exp = credit.expiry_date || "";
    const win = window.open("", "_blank", "width=420,height=400");
    if (!win) {
      return { success: false, message: "Could not open the print window. Please allow pop-ups." };
    }
    const logoHtml = printBrandingHeaderHtml(branding.storeLogo);
    const footerHtml = printBrandingFooterHtml(branding);
    const status = CREDIT_STATUS_LABEL[credit.status] || credit.status;
    win.document.write(`<!DOCTYPE html><html><head><title>Store Credit Card</title></head>
      <body style="margin:0;padding:16px;font-family:Arial,Helvetica,sans-serif;">
        <div style="border:2px solid #111;border-radius:16px;padding:20px 24px;max-width:340px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:8px;">
            <div>
              ${logoHtml}
            </div>
            <div style="text-align:right;">
              <div style="font-size:16px;font-weight:bold;color:#111;">STORE CREDIT</div>
              <div style="font-size:9px;color:#555;">${branding.storeName}</div>
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:flex-end;padding-top:14px;">
            <div style="font-size:11px;color:#333;line-height:1.6;">
              <div><strong>Client:</strong> ${credit.client_name}</div>
              <div><strong>Address:</strong> ${credit.client_address || "—"}</div>
              <div><strong>Product:</strong> ${credit.product_name}</div>
              <div><strong>Status:</strong> <span style="font-weight:bold;color:${
                credit.status === "claimed" ? "#059669" : credit.status === "cancelled" ? "#dc2626" : "#0f172a"
              };">${status}</span></div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:9px;color:#888;">CREDIT VALUE</div>
              <div style="font-size:24px;font-weight:bold;color:#111;">${amountText}</div>
            </div>
          </div>
          <div style="margin-top:14px;text-align:center;">
            <svg id="credit-barcode"></svg>
            <div style="font-size:10px;font-family:monospace;letter-spacing:2px;">${credit.credit_code}</div>
          </div>
          <div style="margin-top:10px;font-size:8px;color:#888;text-align:center;">${exp ? `Expires ${exp} · ` : ""}Present this card at the counter to claim your credit before expiry.</div>
          ${footerHtml}
        </div>
      </body></html>`);
    win.document.close();
    const svg = win.document.getElementById("credit-barcode") as unknown as SVGSVGElement;
    if (svg) {
      JsBarcode(svg, credit.credit_code, {
        format: barcodeFormat(credit.credit_code),
        width: 1.6,
        height: 46,
        displayValue: false,
        background: "#FFFFFF",
        lineColor: "#000000",
      });
    }
    win.print();
    return { success: true, message: "Credit card sent to printer." };
  } catch {
    return { success: false, message: "Printing failed. Please try again." };
  }
}