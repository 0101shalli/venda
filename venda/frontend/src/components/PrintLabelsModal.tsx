import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import JsBarcode from "jsbarcode";
import { Product } from "./ProductModal";
import { useCurrency } from "../context/CurrencyContext";
import { buildLabelsHtml, barcodeToPngDataUrl } from "../utils/labels";
import { barcodeFormat } from "../utils/barcode";
import { fetchStoreBranding } from "./creditsShared";

type PrintLabelsModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const simpleFilter = (query: string, product: Product) => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const name = (product.name || "").toLowerCase();
  const barcode = (product.barcode || "").toLowerCase();
  const category = (product.category || "").toLowerCase();
  return name.includes(q) || barcode.includes(q) || category.includes(q);
};

export default function PrintLabelsModal({ isOpen, onClose }: PrintLabelsModalProps) {
  const { formatPrice } = useCurrency();
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(
    () => (searchQuery ? products.filter((p) => simpleFilter(searchQuery, p)) : products),
    [products, searchQuery]
  );

  const selectedCount = selectedIds.size;

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((p) => p.id != null && selectedIds.has(p.id as number));

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory");
      if (!res.ok) throw new Error("Failed to load products");
      const data = await res.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, []);

  const selectFiltered = useCallback(() => {
    const ids = filtered.filter((p) => p.id != null).map((p) => p.id as number);
    setSelectedIds(new Set(ids));
  }, [filtered]);

  const clearAll = useCallback(() => setSelectedIds(new Set()), []);

  const toggle = useCallback((id: number | undefined) => {
    if (id == null) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Reset internal state whenever the modal is (re)opened.
  useEffect(() => {
    if (isOpen) {
      fetchProducts();
      setSearchQuery("");
      setSelectedIds(new Set());
      setPrintPreviewOpen(false);
      setError(null);
    }
  }, [isOpen, fetchProducts]);

  // Focus the first matching product row when searching.
  useEffect(() => {
    if (!searchQuery.trim() || !listRef.current || filtered.length === 0) return;
    const focusId = `label-product-${filtered[0].id}`;
    const el = listRef.current.querySelector(`[data-id="${focusId}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [searchQuery, filtered]);

  if (!isOpen) return null;

  const handlePrintPdf = async () => {
    if (selectedCount === 0) {
      alert("Select at least one product to print labels.");
      return;
    }
    setGeneratingPdf(true);
    try {
      const selected = products.filter((p) => p.id != null && selectedIds.has(p.id as number));
      const branding = await fetchStoreBranding();
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      const labelW = 70;
      const labelH = 32;
      const cols = 3;
      const marginX = (210 - cols * labelW) / 2;
      let startY = 15;

      const storeName = (branding.storeName || "").trim();
      if (storeName) {
        pdf.setFontSize(14);
        pdf.setFont("helvetica", "bold");
        pdf.text(storeName, 105, 12, { align: "center" });
        pdf.setFont("helvetica", "normal");
        startY = 20;
      }

      for (let i = 0; i < selected.length; i++) {
        if (i % (cols * 7) === 0 && i !== 0) {
          pdf.addPage();
        }
        const col = i % cols;
        const positionInPage = i % (cols * 7);
        const rowInPage = Math.floor(positionInPage / cols);
        const x = marginX + col * labelW;
        const y = startY + rowInPage * (labelH + 2);
        const p = selected[i];
        const pageIndex = Math.floor(i / (cols * 7));
        pdf.setPage(pageIndex + 1);

        let img: string | null = null;
        try {
          img = await barcodeToPngDataUrl(p);
        } catch {
          img = null;
        }

        pdf.setDrawColor(0);
        pdf.rect(x, y, labelW - 2, labelH, "S");

        pdf.setFontSize(7);
        pdf.text(String(p.category || "").toUpperCase(), x + 1.5, y + 5, { maxWidth: labelW - 5 });
        pdf.setFontSize(9);
        pdf.setFont("helvetica", "bold");
        pdf.text(String(p.name || ""), x + 1.5, y + 10, { maxWidth: labelW - 5 });
        pdf.setFont("helvetica", "normal");

        if (img) {
          pdf.addImage(img, "PNG", x + 1.5, y + 12, 34, 14);
        }

        pdf.setFontSize(11);
        pdf.setFont("helvetica", "bold");
        pdf.text(formatPrice(p.selling_price), x + 1.5, y + labelH - 3, { maxWidth: labelW - 5 });
        pdf.setFont("helvetica", "normal");
      }

      pdf.save("barcode_labels.pdf");
    } catch (err) {
      console.error("PDF generation error:", err);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handlePrint = () => {
    if (selectedCount === 0) {
      alert("Select at least one product to print labels.");
      return;
    }
    setPrintPreviewOpen(true);
  };

  const printSelected = async () => {
    const selected = products.filter((p) => p.id != null && selectedIds.has(p.id as number));
    const branding = await fetchStoreBranding();
    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) {
      alert("Could not open the print window. Please allow pop-ups.");
      return;
    }
    win.document.write(buildLabelsHtml(selected, formatPrice, { storeName: branding.storeName }));
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <div className="relative w-full max-w-3xl bg-white dark:bg-slate-900 rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Print Labels</h2>
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

          {/* Search + selection toolbar */}
          <div className="px-6 py-3 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center border-b border-slate-200 dark:border-slate-700">
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or barcode..."
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 focus:border-indigo-500 dark:focus:border-sky-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-sky-900 outline-none"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="rounded-lg bg-indigo-50 dark:bg-sky-900/30 px-3 py-2 text-sm font-semibold text-indigo-700 dark:text-sky-300 whitespace-nowrap">
                {selectedCount} selected
              </div>
              <button
                type="button"
                onClick={allFilteredSelected ? clearAll : selectFiltered}
                className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition-transform whitespace-nowrap"
              >
                {allFilteredSelected ? "Clear All" : "Select All"}
              </button>
            </div>
          </div>

          {/* Product list */}
          <div ref={listRef} className="flex-1 overflow-y-auto px-6 py-3">
            {loading ? (
              <div className="py-12 text-center text-slate-500 dark:text-slate-400">Loading products...</div>
            ) : error ? (
              <div className="py-6 text-center text-red-600 dark:text-red-400">{error}</div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-slate-500 dark:text-slate-400">
                {searchQuery ? "No products match your search." : "No products available."}
              </div>
            ) : (
              <div className="space-y-1">
                {filtered.map((p) => {
                  const pid = p.id as number;
                  const isSelected = selectedIds.has(pid);
                  return (
                    <div
                      key={pid}
                      data-id={`label-product-${pid}`}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 border transition-colors ${
                        isSelected
                          ? "bg-indigo-50 dark:bg-sky-900/30 border-indigo-200 dark:border-sky-800"
                          : "border-transparent hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 dark:text-white truncate">{p.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
                          {p.category} · {p.barcode}
                        </p>
                      </div>
                      <div className="shrink-0 text-sm font-semibold text-slate-700 dark:text-slate-300">
                        {formatPrice(p.selling_price)}
                      </div>
                      <button
                        type="button"
                        onClick={() => toggle(pid)}
                        className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                          isSelected
                            ? "bg-indigo-600 dark:bg-sky-500 text-white hover:bg-indigo-700 dark:hover:bg-sky-600"
                            : "border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                        }`}
                      >
                        {isSelected ? "Selected" : "Select"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex flex-wrap gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition-transform"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-semibold text-white active:scale-95 transition-transform"
            >
              Print
            </button>
            <button
              type="button"
              onClick={handlePrintPdf}
              disabled={generatingPdf}
              className="rounded-lg bg-indigo-600 dark:bg-sky-500 hover:bg-indigo-700 dark:hover:bg-sky-600 px-4 py-2 text-sm font-semibold text-white active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generatingPdf ? "Generating..." : "Print PDF"}
            </button>
          </div>
        </div>
      </div>

      {/* Print preview modal */}
      {printPreviewOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPrintPreviewOpen(false)} />
          <div className="relative w-full max-w-3xl bg-white dark:bg-slate-900 rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Preview ({selectedCount} label{selectedCount !== 1 ? "s" : ""})
              </h3>
              <button
                onClick={() => setPrintPreviewOpen(false)}
                type="button"
                className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 bg-slate-100 dark:bg-slate-800">
              <div className="flex flex-wrap justify-center gap-3">
                {products
                  .filter((p) => p.id != null && selectedIds.has(p.id as number))
                  .map((p) => (
                    <div
                      key={p.id}
                      className="w-[70mm] rounded-md bg-white border border-black p-3 text-center"
                    >
                      <div className="text-[9px] uppercase text-slate-500">{p.category}</div>
                      <div className="text-[11px] font-bold text-slate-900 mt-1 max-w-full">{p.name}</div>
                      <div className="my-2 flex justify-center">
                        <BarcodeImage barcode={p.barcode} />
                      </div>
                      <div className="text-[12px] font-bold text-slate-900">
                        {formatPrice(p.selling_price)}
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setPrintPreviewOpen(false)}
                className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition-transform"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={printSelected}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-semibold text-white active:scale-95 transition-transform inline-flex items-center gap-2"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4" />
                </svg>
                Print
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function BarcodeImage({ barcode }: { barcode: string }) {
  const ref = useRef<SVGSVGElement | null>(null);
  useEffect(() => {
    if (ref.current) {
      try {
        JsBarcode(ref.current, barcode, {
          format: barcodeFormat(barcode),
          width: 2,
          height: 50,
          displayValue: true,
          fontSize: 10,
          background: "#ffffff",
          lineColor: "#000000",
        });
      } catch (err) {
        console.error("BarcodeImage error", err);
      }
    }
  }, [barcode]);
  return <svg ref={ref} />;
}
