import { Product } from "./ProductModal";

type BarcodeModalProps = {
  isOpen: boolean;
  product: Product | null;
  onClose: () => void;
};

export default function BarcodeModal({ isOpen, product, onClose }: BarcodeModalProps) {
  if (!isOpen || !product) return null;

  const handlePrint = () => {
    const printWindow = window.open("", "", "height=400,width=600");
    if (!printWindow) return;

    const barcodeHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Print Barcode - ${product.name}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .barcode-container { 
            border: 2px solid #000; 
            padding: 20px; 
            max-width: 4in;
            text-align: center;
          }
          .barcode-image { 
            font-size: 48px; 
            letter-spacing: 8px; 
            font-weight: bold; 
            margin: 10px 0;
          }
          .product-info { font-size: 14px; margin: 10px 0; }
          .product-name { font-weight: bold; margin-top: 10px; }
          .product-price { font-size: 16px; font-weight: bold; color: #2563eb; }
        </style>
      </head>
      <body>
        <div class="barcode-container">
          <div class="product-info">${product.category}</div>
          <div class="product-name">${product.name}</div>
          <div class="barcode-image">|${product.barcode}|</div>
          <div class="product-price">$${product.selling_price.toFixed(2)}</div>
        </div>
        <script>
          window.print();
          window.onafterprint = () => window.close();
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(barcodeHTML);
    printWindow.document.close();
  };

  const handleDownload = () => {
    const data = `
BARCODE LABEL
==============
Category: ${product.category}
Product Name: ${product.name}
Barcode: ${product.barcode}
Price: $${product.selling_price.toFixed(2)}
Cost: $${product.cost_price.toFixed(2)}
Stock: ${product.current_stock}
Min Level: ${product.min_stock_level}
Supplier: ${product.supplier || "N/A"}
Warehouse: ${product.warehouse_location || "N/A"}
    `.trim();

    const element = document.createElement("a");
    element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(data));
    element.setAttribute("download", `${product.barcode}-${product.name}.txt`);
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
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

        {/* Barcode Preview */}
        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-8 mb-6 text-center">
          <div className="text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wide mb-3">
            {product.category}
          </div>
          <div className="text-lg font-bold text-slate-900 dark:text-white mb-4">
            {product.name}
          </div>
          <div className="text-4xl font-mono font-bold text-slate-900 dark:text-white tracking-wider my-4">
            |{product.barcode}|
          </div>
          <div className="text-sm text-slate-600 dark:text-slate-400 mb-2">
            {product.barcode}
          </div>
          <div className="text-xl font-bold text-indigo-600 dark:text-sky-400">
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
            Download
          </button>
        </div>
      </div>
    </div>
  );
}
