import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { Product } from "./ProductModal";

type BarcodeModalProps = {
  isOpen: boolean;
  product: Product | null;
  onClose: () => void;
};

export default function BarcodeModal({ isOpen, product, onClose }: BarcodeModalProps) {
  const barcodeRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (isOpen && product && barcodeRef.current) {
      try {
        JsBarcode(barcodeRef.current, product.barcode, {
          format: "CODE128",
          width: 2,
          height: 60,
          displayValue: false, // We render the readable code text separately
          background: "transparent",
          lineColor: "#000000" // Always black on white background card
        });
      } catch (err) {
        console.error("JsBarcode preview error:", err);
      }
    }
  }, [isOpen, product]);

  if (!isOpen || !product) return null;

  const handlePrint = () => {
    const printWindow = window.open("", "", "height=450,width=600");
    if (!printWindow) return;

    // Generate crisp vector barcode SVG for printing
    const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    try {
      JsBarcode(svgEl, product.barcode, {
        format: "CODE128",
        width: 2.5,
        height: 80,
        displayValue: true,
        fontSize: 16
      });
    } catch (err) {
      console.error("JsBarcode print error:", err);
    }
    const barcodeSVGString = svgEl.outerHTML;

    const barcodeHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Print Barcode - ${product.name}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; display: flex; justify-content: center; }
          .barcode-container { 
            border: 2px solid #000; 
            padding: 20px; 
            width: 4in;
            text-align: center;
            border-radius: 10px;
          }
          .barcode-image { 
            margin: 15px 0;
            display: flex;
            justify-content: center;
          }
          .product-info { font-size: 14px; text-transform: uppercase; color: #666; }
          .product-name { font-weight: bold; font-size: 18px; margin-top: 10px; }
          .product-price { font-size: 20px; font-weight: bold; color: #000; margin-top: 10px; }
        </style>
      </head>
      <body>
        <div class="barcode-container">
          <div class="product-info">${product.category}</div>
          <div class="product-name">${product.name}</div>
          <div class="barcode-image">${barcodeSVGString}</div>
          <div class="product-price">$${product.selling_price.toFixed(2)}</div>
        </div>
        <script>
          window.onload = function() {
            window.print();
            window.onafterprint = () => window.close();
          }
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(barcodeHTML);
    printWindow.document.close();
  };

  const handleDownload = () => {
    const canvas = document.createElement("canvas");
    try {
      JsBarcode(canvas, product.barcode, {
        format: "CODE128",
        width: 3,
        height: 100,
        displayValue: true,
        fontSize: 16,
        background: "#FFFFFF",
        lineColor: "#000000"
      });
      
      const url = canvas.toDataURL("image/png");
      const element = document.createElement("a");
      element.setAttribute("href", url);
      element.setAttribute("download", `barcode-${product.barcode}-${product.name}.png`);
      element.style.display = "none";
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    } catch (err) {
      console.error("JsBarcode download error:", err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Print Barcode</h2>
          <button
            onClick={onClose}
            type="button"
            className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Barcode Preview (Always white card style for hardware compatibility scanner contrast) */}
        <div className="bg-white rounded-xl border border-slate-200 dark:border-slate-800 p-8 mb-6 text-center shadow-inner">
          <div className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">
            {product.category}
          </div>
          <div className="text-lg font-bold text-slate-900 mb-4">
            {product.name}
          </div>
          <div className="flex justify-center my-4 p-2 bg-white">
            <svg ref={barcodeRef} className="mx-auto" />
          </div>
          <div className="text-sm font-mono text-slate-600 mb-2">
            {product.barcode}
          </div>
          <div className="text-2xl font-black text-sky-600">
            ${product.selling_price.toFixed(2)}
          </div>
        </div>

        {/* Product Details */}
        <div className="grid grid-cols-2 gap-3 mb-6 bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 uppercase">Cost</p>
            <p className="font-bold text-slate-900 dark:text-white">${product.cost_price.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 uppercase">Stock</p>
            <p className="font-bold text-slate-900 dark:text-white">{product.current_stock}</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-slate-500 dark:text-slate-400 uppercase">Supplier</p>
            <p className="font-bold text-slate-900 dark:text-white text-sm">{product.supplier || "N/A"}</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-slate-500 dark:text-slate-400 uppercase">Warehouse</p>
            <p className="font-bold text-slate-900 dark:text-white text-sm">{product.warehouse_location || "N/A"}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handlePrint}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-indigo-600 dark:bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 dark:hover:bg-sky-600 active:scale-95 transition-transform"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4" />
            </svg>
            Print
          </button>
          <button
            onClick={handleDownload}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg border-2 border-indigo-600 dark:border-sky-500 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-indigo-600 dark:text-sky-400 hover:bg-indigo-50 dark:hover:bg-slate-700 active:scale-95 transition-transform"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Label
          </button>
        </div>
      </div>
    </div>
  );
}
