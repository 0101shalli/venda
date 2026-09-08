import JsBarcode from "jsbarcode";
import { Product } from "../components/ProductModal";
import { barcodeFormat } from "./barcode";

/**
 * Renders a crisp SVG barcode element for a product. Returns the SVG node,
 * which can either be dropped into HTML (for printing/preview) or rasterized
 * into a PNG data URL (for embedding in a PDF via jsPDF).
 *
 * The label only shows: category, name, barcode and selling price.
 */
export function buildBarcodeSvg(product: Product, opts: { height?: number; width?: number } = {}): SVGSVGElement {
  const { height = 80, width = 2 } = opts;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  try {
    JsBarcode(svg, product.barcode, {
      format: barcodeFormat(product.barcode),
      width,
      height,
      displayValue: true,
      fontSize: 16,
      margin: 5,
      background: "#ffffff",
      lineColor: "#000000",
    });
  } catch (err) {
    console.error("JsBarcode error for", product.barcode, err);
  }
  return svg;
}

/**
 * Rasterizes a JsBarcode SVG into an HTMLImageElement that has fully loaded,
 * so it can be drawn onto a canvas and embedded into a PDF.
 */
function loadSvgImage(svg: SVGSVGElement): Promise<HTMLImageElement> {
  const serialized = new XMLSerializer().serializeToString(svg);
  const encoded = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = encoded;
  });
}

/** Renders a product barcode image to a PNG data URL (300x160). */
export async function barcodeToPngDataUrl(product: Product): Promise<string | null> {
  try {
    const svg = buildBarcodeSvg(product, { height: 110, width: 3 });
    const img = await loadSvgImage(svg);
    const width = 300;
    const height = 160;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/png");
  } catch (err) {
    console.error("barcodeToPngDataUrl error", err);
    return null;
  }
}

/** Builds the full HTML for a set of printable barcode labels. */
export function buildLabelsHtml(
  products: Product[],
  priceText: (amount: number) => string,
  branding?: { storeName?: string; storeLogo?: string; contactHtml?: string },
): string {
  const labels = products
    .map((p) => {
      const svg = buildBarcodeSvg(p);
      const svgStr = svg.outerHTML;
      const name = escapeHtml(p.name);
      const category = escapeHtml(p.category);
      const barcode = escapeHtml(p.barcode);
      const price = escapeHtml(priceText(p.selling_price));
      return `
        <div class="label">
          <div class="cat">${category}</div>
          <div class="name">${name}</div>
          <div class="barcode">${svgStr}</div>
          <div class="price">${price}</div>
        </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Product Barcode Labels</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; background: #fff; }
    .brand-header { text-align:center; padding:6px 8px 8px; }
    .brand-header img { max-height:44px; max-width:110px; object-fit:contain; display:block; margin:0 auto 4px; }
    .brand-name { font-size:12px; color:#333; letter-spacing:0.5px; }
    .brand-contact { border-top:1px solid #ccc; margin-top:6px; padding-top:6px; font-size:8px; color:#555; text-align:center; line-height:1.5; }
    .page { display: flex; flex-wrap: wrap; justify-content: flex-start; padding: 8px; }
    .label {
      width: 70mm;
      min-height: 40mm;
      border: 1px solid #000;
      padding: 3mm;
      margin: 2mm;
      text-align: center;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      overflow: hidden;
    }
    .cat { font-size: 9px; text-transform: uppercase; color: #333; letter-spacing: 0.5px; }
    .name { font-size: 11px; font-weight: bold; color: #000; margin: 1mm 0; line-height: 1.1; max-width: 100%; }
    .barcode { margin: 1mm 0; }
    .barcode svg { max-width: 100%; height: auto; }
    .price { font-size: 12px; font-weight: bold; color: #000; margin-top: 1mm; }
    @media print {
      @page { size: auto; margin: 0; }
      .page { padding: 0; }
    }
  </style>
</head>
<body>
  ${branding ? `<div class="brand-header">${branding.storeLogo ? `<img src="${branding.storeLogo}" alt="logo" />` : ""}<div class="brand-name">${branding.storeName || "General Store"}</div>${branding.contactHtml || ""}</div>` : ""}
  <div class="page">${labels}</div>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
