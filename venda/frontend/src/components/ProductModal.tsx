import { useEffect, useState, useRef } from "react";
import JsBarcode from "jsbarcode";
import CameraScanner from "./CameraScanner";
import ScanToast from "./ScanToast";
import { useCurrency } from "../context/CurrencyContext";
import { useLanguage } from "../context/LanguageContext";
import { useKeyboardScanner } from "../hooks/useKeyboardScanner";
import { generateBarcode, barcodeFormat } from "../utils/barcode";

export type Product = {
  id?: number;
  barcode: string;
  name: string;
  description: string;
  category: string;
  cost_price: number;
  selling_price: number;
  profit_percentage: number;
  current_stock: number;
  min_stock_level: number;
  reorder_point: number;
  supplier: string;
  supplier_email: string;
  supplier_phone: string;
  warehouse_location: string;
  is_batch_tracked?: boolean;
  batch_id?: number | null;
  batch_number?: string;
  manufacturing_date?: string;
  expiry_date?: string;
  bargain_enabled?: boolean;
  min_selling_price?: number | null;
  bargain_steps?: string;
  refundable?: boolean;
  credit_discount_percentage?: number | null;
  credit_duration_days?: number | null;
  bulk_enabled?: boolean;
  bulk_quantity?: number | null;
  bulk_price?: number | null;
};

const BARGIN_STEPS = [100, 500, 1000, 2000, 5000, 10000];

type ProductModalProps = {
  isOpen: boolean;
  isEditMode: boolean;
  product?: Product;
  onClose: () => void;
  onSave: (product: Product) => Promise<void>;
  categories?: string[];
};

const DEFAULT_CATEGORIES = ["General", "Electronics", "Logistics", "Apparel", "Food & Beverage", "Hardware"];

const EMPTY_FORM: Product = {
  barcode: "",
  name: "",
  description: "",
  category: "General",
  cost_price: 0,
  selling_price: 0,
  profit_percentage: 0,
  current_stock: 0,
  min_stock_level: 0,
  reorder_point: 0,
  supplier: "",
  supplier_email: "",
  supplier_phone: "",
  warehouse_location: "",
  is_batch_tracked: false,
  batch_number: "",
  manufacturing_date: "",
  expiry_date: "",
  bargain_enabled: false,
  min_selling_price: null,
  bargain_steps: "",
  refundable: false,
  credit_discount_percentage: 0,
  credit_duration_days: 0,
  bulk_enabled: false,
  bulk_quantity: 0,
  bulk_price: 0,
};

export default function ProductModal({ isOpen, isEditMode, product, onClose, onSave, categories = DEFAULT_CATEGORIES }: ProductModalProps) {
  const { currencySymbol, formatPrice } = useCurrency();
  const { t } = useLanguage();
  const [formData, setFormData] = useState<Product>(EMPTY_FORM);
  const [systemBargainEnabled, setSystemBargainEnabled] = useState(false);
  const [systemRefundEnabled, setSystemRefundEnabled] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [minPriceError, setMinPriceError] = useState<string | null>(null);
  const [minPriceInput, setMinPriceInput] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanFlash, setScanFlash] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const barcodePreviewRef = useRef<SVGSVGElement | null>(null);
  const barcodeInputRef = useRef<HTMLInputElement | null>(null);

  const captureBarcode = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setFormData((prev) => ({ ...prev, barcode: trimmed }));
    setScannerOpen(false);
    setScanFlash(true);
    setToast({ type: "success", message: t("product.barcodeCaptured") });
    window.setTimeout(() => setScanFlash(false), 2000);
  };

  useKeyboardScanner({
    enabled: isOpen,
    captureRef: barcodeInputRef,
    onBarcode: captureBarcode,
    onNoBarcode: () => setToast({ type: "error", message: t("product.noBarcode") }),
  });

  useEffect(() => {
    if (isOpen && formData.barcode && barcodePreviewRef.current) {
      try {
        JsBarcode(barcodePreviewRef.current, formData.barcode, {
          format: barcodeFormat(formData.barcode),
          width: 1.8,
          height: 40,
          displayValue: true,
          fontSize: 12,
          background: "#FFFFFF",
          lineColor: "#000000"
        });
      } catch (err) {
        console.error("JsBarcode edit preview error:", err);
      }
    }
  }, [isOpen, formData.barcode]);

  useEffect(() => {
    if (isEditMode && product) {
      const merged = { ...EMPTY_FORM, ...product } as Product;
      if (Array.isArray(merged.bargain_steps)) {
        merged.bargain_steps = (merged.bargain_steps as unknown as number[]).join(",");
      }
      setFormData(merged);
    } else {
      setFormData({ ...EMPTY_FORM, barcode: generateBarcode() });
    }
    setErrors({});
    setMinPriceError(null);
    setMinPriceInput(
      isEditMode && product && product.min_selling_price != null ? String(product.min_selling_price) : ""
    );
  }, [isOpen, isEditMode, product]);

  useEffect(() => {
    if (!isOpen) return;
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        setSystemBargainEnabled(data.bargain_enabled === "true");
        setSystemRefundEnabled(data.refund_feature_enabled === "true");
      })
      .catch(() => {
        setSystemBargainEnabled(false);
        setSystemRefundEnabled(false);
      });
  }, [isOpen]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.barcode.trim()) newErrors.barcode = t("product.errBarcodeRequired");
    if (!formData.name.trim()) newErrors.name = t("product.errNameRequired");
    if (formData.cost_price < 0) newErrors.cost_price = t("product.errCostPositive");
    if (formData.selling_price < 0) newErrors.selling_price = t("product.errSellingPositive");
    if (formData.selling_price <= formData.cost_price) {
      newErrors.selling_price = t("product.errSellingGreater");
    }
    if (
      formData.bargain_enabled &&
      formData.min_selling_price != null &&
      formData.min_selling_price < formData.cost_price
    ) {
      newErrors.min_selling_price = t("product.errMinPrice");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSaving(true);
    try {
      await onSave(formData);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleCostPriceChange = (value: number) => {
    const newCost = value;
    const newFormData = { ...formData, cost_price: newCost };
    if (newFormData.profit_percentage > 0) {
      newFormData.selling_price = parseFloat((newCost * (1 + newFormData.profit_percentage / 100)).toFixed(2));
    }
    if (newFormData.min_selling_price != null && newFormData.min_selling_price < newCost) {
      newFormData.min_selling_price = newCost;
      setMinPriceInput(String(newCost));
      setMinPriceError(null);
    }
    setFormData(newFormData);
  };

  const handleProfitPercentageChange = (value: number) => {
    const newProfit = value;
    const newFormData = { ...formData, profit_percentage: newProfit };
    if (newFormData.cost_price > 0) {
      newFormData.selling_price = parseFloat((newFormData.cost_price * (1 + newProfit / 100)).toFixed(2));
    }
    setFormData(newFormData);
  };

  const handleScanBarcode = (code: string) => {
    captureBarcode(code);
  };

  const handleManualBarcodeChange = (value: string) => {
    setFormData({ ...formData, barcode: value });
  };

  const generateBatchNumber = async () => {
    try {
      const response = await fetch("/api/inventory/generate-batch-number");
      if (response.ok) {
        const data = await response.json();
        setFormData((prev) => ({ ...prev, batch_number: data.batch_number }));
      }
    } catch (err) {
      console.error("Failed to generate batch number:", err);
    }
  };

  const handleToggleBatchTracking = (enable: boolean) => {
    if (enable) {
      setFormData((prev) => ({ ...prev, is_batch_tracked: true }));
      generateBatchNumber();
    } else {
      setFormData({
        ...formData,
        is_batch_tracked: false,
        batch_number: "",
        manufacturing_date: "",
        expiry_date: "",
      });
    }
  };

  const toggleBargainStep = (step: number) => {
    const steps = (formData.bargain_steps || "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "");
    const index = steps.indexOf(String(step));
    if (index >= 0) {
      steps.splice(index, 1);
    } else {
      steps.push(String(step));
    }
    setFormData({ ...formData, bargain_steps: steps.join(",") });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-2xl shadow-xl">
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {isEditMode ? t("product.editTitle") : t("product.addTitle")}
          </h2>
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

        {/* Content */}
        <form onSubmit={handleSubmit} className="space-y-6 px-6 py-4">
          {/* Primary Details */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">{t("product.primaryDetails")}</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="barcode" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("product.barcode")}
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    id="barcode"
                    ref={barcodeInputRef}
                    type="text"
                    value={formData.barcode}
                    onChange={(e) => handleManualBarcodeChange(e.target.value)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm text-slate-900 placeholder-slate-500 focus:ring-1 dark:text-white dark:placeholder-slate-400 ${
                      scanFlash
                        ? "border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200 dark:border-emerald-500 dark:bg-emerald-900/20 dark:ring-emerald-900"
                        : errors.barcode
                        ? "border-red-500 dark:border-red-600"
                        : "border-slate-300 bg-white focus:border-indigo-500 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:focus:border-sky-400 dark:focus:ring-sky-900"
                    }`}
                    placeholder={t("product.scanOrTypeBarcode")}
                  />
                  <button
                    type="button"
                    onClick={() => setScannerOpen(true)}
                    className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition-all hover:bg-indigo-100 active:scale-95 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-400 dark:hover:bg-sky-900/50"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.882V15.118a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                    </svg>
                    {t("product.scan")}
                  </button>
                  {!isEditMode && (
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, barcode: generateBarcode() })}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-all hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                      title={t("product.generateNewBarcode")}
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  )}
                </div>
                {errors.barcode && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{errors.barcode}</p>}
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {scanFlash
                    ? t("product.scannedSuccess")
                    : isEditMode
                    ? t("product.productBarcode")
                    : t("product.scanHint")}
                </p>
                {formData.barcode && (
                  <div className="mt-3 flex justify-center rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <svg ref={barcodePreviewRef} />
                  </div>
                )}
              </div>

              <CameraScanner
                isOpen={scannerOpen}
                onScan={handleScanBarcode}
                onClose={() => setScannerOpen(false)}
                onError={(msg) => setToast({ type: "error", message: msg })}
                title={t("product.scanFromProduct")}
              />

              <div>
                <label htmlFor="name" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("product.productName")} <span className="text-red-500">*</span>
                </label>
                <input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={`mt-1 block w-full rounded-lg border ${
                    errors.name ? "border-red-500 dark:border-red-600" : "border-slate-300 dark:border-slate-600"
                  } bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:border-indigo-500 dark:focus:border-sky-400 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-sky-900`}
                  placeholder={t("product.productNamePlaceholder")}
                />
                {errors.name && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{errors.name}</p>}
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("common.description")}
                </label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:border-indigo-500 dark:focus:border-sky-400 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-sky-900"
                  placeholder={t("product.descriptionPlaceholder")}
                />
              </div>

              <div>
                <label htmlFor="category" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("product.category")}
                </label>
                <select
                  id="category"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-indigo-500 dark:focus:border-sky-400 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-sky-900"
                >
                  {categories.filter(c => c !== "All").map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Inventory Rules */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">{t("product.inventoryRules")}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="current_stock" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("product.currentStock")}
                </label>
                <input
                  id="current_stock"
                  type="number"
                  value={formData.current_stock}
                  onChange={(e) => setFormData({ ...formData, current_stock: parseInt(e.target.value) || 0 })}
                  className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:border-indigo-500 dark:focus:border-sky-400 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-sky-900"
                  min="0"
                />
              </div>

              <div>
                <label htmlFor="min_stock_level" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("product.minStockLevel")}
                </label>
                <input
                  id="min_stock_level"
                  type="number"
                  value={formData.min_stock_level}
                  onChange={(e) => setFormData({ ...formData, min_stock_level: parseInt(e.target.value) || 0 })}
                  className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:border-indigo-500 dark:focus:border-sky-400 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-sky-900"
                  min="0"
                />
              </div>

              <div>
                <label htmlFor="reorder_point" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("product.reorderPoint")}
                </label>
                <input
                  id="reorder_point"
                  type="number"
                  value={formData.reorder_point}
                  onChange={(e) => setFormData({ ...formData, reorder_point: parseInt(e.target.value) || 0 })}
                  className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:border-indigo-500 dark:focus:border-sky-400 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-sky-900"
                  min="0"
                />
              </div>
            </div>
          </div>

          {/* Batch Tracking */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">{t("product.batchTracking")}</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("product.batchTracking")}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {formData.is_batch_tracked
                      ? t("product.trackedByBatches")
                      : t("product.trackByBatchesHint")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleBatchTracking(!formData.is_batch_tracked)}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all active:scale-95 ${
                    formData.is_batch_tracked
                      ? "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                      : "bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-sky-500 dark:hover:bg-sky-600"
                  }`}
                >
                  {formData.is_batch_tracked ? t("product.disableBatchTracking") : t("product.enableBatchTracking")}
                </button>
              </div>

              {formData.is_batch_tracked && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label htmlFor="batch_number" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                      {t("product.batchNumber")}
                    </label>
                    <div className="mt-1 flex gap-2">
                      <input
                        id="batch_number"
                        type="text"
                        value={formData.batch_number || ""}
                        onChange={(e) => setFormData({ ...formData, batch_number: e.target.value })}
                        className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:border-indigo-500 dark:focus:border-sky-400 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-sky-900"
                        placeholder={t("product.batchNumberPlaceholder")}
                      />
                      <button
                        type="button"
                        onClick={generateBatchNumber}
                        className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition-transform"
                        title={t("product.generateNewBatchNumber")}
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {t("product.batchNumberHint")}
                    </p>
                  </div>

                  <div>
                    <label htmlFor="manufacturing_date" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                      {t("product.manufacturingDate")}
                    </label>
                    <input
                      id="manufacturing_date"
                      type="date"
                      value={formData.manufacturing_date || ""}
                      onChange={(e) => setFormData({ ...formData, manufacturing_date: e.target.value })}
                      className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-indigo-500 dark:focus:border-sky-400 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-sky-900"
                    />
                  </div>

                  <div>
                    <label htmlFor="expiry_date" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                      {t("product.expiryDate")}
                    </label>
                    <input
                      id="expiry_date"
                      type="date"
                      value={formData.expiry_date || ""}
                      onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                      className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-indigo-500 dark:focus:border-sky-400 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-sky-900"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Financials */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">{t("product.financials")}</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor="cost_price" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("product.costPrice")} ({currencySymbol}) <span className="text-red-500">*</span>
                </label>
                <input
                  id="cost_price"
                  type="number"
                  step="0.01"
                  value={formData.cost_price}
                  onChange={(e) => handleCostPriceChange(parseFloat(e.target.value) || 0)}
                  className={`mt-1 block w-full rounded-lg border ${
                    errors.cost_price ? "border-red-500 dark:border-red-600" : "border-slate-300 dark:border-slate-600"
                  } bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:border-indigo-500 dark:focus:border-sky-400 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-sky-900`}
                  min="0"
                />
                {errors.cost_price && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{errors.cost_price}</p>}
              </div>

              <div>
                <label htmlFor="profit_percentage" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("product.profitPct")}
                </label>
                <input
                  id="profit_percentage"
                  type="number"
                  step="0.01"
                  value={formData.profit_percentage}
                  onChange={(e) => handleProfitPercentageChange(parseFloat(e.target.value) || 0)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:border-indigo-500 dark:focus:border-sky-400 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-sky-900"
                  min="0"
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("product.markupHint")}</p>
              </div>

              <div>
                <label htmlFor="selling_price" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("product.sellingPrice")} ({currencySymbol}) <span className="text-red-500">*</span>
                </label>
                <input
                  id="selling_price"
                  type="number"
                  step="0.01"
                  value={formData.selling_price}
                  onChange={(e) => setFormData({ ...formData, selling_price: parseFloat(e.target.value) || 0 })}
                  className={`mt-1 block w-full rounded-lg border ${
                    errors.selling_price ? "border-red-500 dark:border-red-600" : "border-slate-300 dark:border-slate-600"
                  } bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:border-indigo-500 dark:focus:border-sky-400 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-sky-900`}
                  min="0"
                />
                {errors.selling_price && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{errors.selling_price}</p>}
              </div>
            </div>
          </div>

          {/* Bargain */}
          {systemBargainEnabled && (
            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">{t("product.bargain")}</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("product.enableBargainForProduct")}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formData.bargain_enabled
                        ? t("product.bargainEnabledHint")
                        : t("product.bargainDisabledHint")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, bargain_enabled: !formData.bargain_enabled })}
                    className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all active:scale-95 ${
                      formData.bargain_enabled
                        ? "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                        : "bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-sky-500 dark:hover:bg-sky-600"
                    }`}
                  >
                    {formData.bargain_enabled ? t("product.disableBargain") : t("product.enableBargain")}
                  </button>
                </div>

                {formData.bargain_enabled && (
                  <>
                    <div>
                      <label htmlFor="min_selling_price" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                        {t("product.minSellingPrice")} ({currencySymbol})
                      </label>
                      <input
                        id="min_selling_price"
                        type="text"
                        inputMode="decimal"
                        value={minPriceInput}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^0-9.]/g, "");
                          const dotIndex = raw.indexOf(".");
                          const sanitized = dotIndex >= 0
                            ? raw.slice(0, dotIndex + 1) + raw.slice(dotIndex + 1).replace(/\./g, "")
                            : raw;
                          setMinPriceInput(sanitized);
                          if (sanitized === "") {
                            setFormData({ ...formData, min_selling_price: null });
                            setMinPriceError(null);
                            return;
                          }
                          const value = parseFloat(sanitized);
                          if (!Number.isFinite(value)) {
                            setMinPriceError(t("product.errValidNumber"));
                            return;
                          }
                          if (value < formData.cost_price) {
                            setMinPriceError(
                              `${t("product.errMinPriceLess")} (${formatPrice(formData.cost_price)}).`
                            );
                            return;
                          }
                          setFormData({ ...formData, min_selling_price: value });
                          setMinPriceError(null);
                        }}
                        onBlur={() => {
                          if (minPriceInput === "") {
                            setFormData({ ...formData, min_selling_price: null });
                            setMinPriceError(null);
                            return;
                          }
                          const value = parseFloat(minPriceInput);
                          if (!Number.isFinite(value)) return;
                          if (value < formData.cost_price) {
                            setFormData({ ...formData, min_selling_price: formData.cost_price });
                            setMinPriceInput(String(formData.cost_price));
                            setMinPriceError(null);
                          }
                        }}
                        className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:ring-1 outline-none ${
                          minPriceError || errors.min_selling_price
                            ? "border-red-500 dark:border-red-600 focus:border-red-500 focus:ring-red-500 dark:focus:ring-red-900"
                            : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:border-indigo-500 dark:focus:border-sky-400 focus:ring-indigo-500 dark:focus:ring-sky-900"
                        }`}
                        placeholder={t("product.minPricePlaceholder")}
                      />
                      {(minPriceError || errors.min_selling_price) && (
                        <p className="mt-1 text-xs text-red-500 dark:text-red-400">
                          {minPriceError || errors.min_selling_price}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {t("product.minPriceHint1")} ({formatPrice(formData.cost_price)}). {t("product.minPriceHint2")} ({formatPrice(formData.selling_price)}).
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t("product.bargainSteps")} ({currencySymbol})</label>
                      <div className="flex flex-wrap gap-2">
                        {BARGIN_STEPS.map((step) => {
                          const selected = (formData.bargain_steps || "")
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean)
                            .includes(String(step));
                          return (
                            <label
                              key={step}
                              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                                selected
                                  ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-sky-500 dark:bg-sky-900/30 dark:text-sky-400"
                                  : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => toggleBargainStep(step)}
                                className="sr-only"
                              />
                              {formatPrice(step)}
                            </label>
                          );
                        })}
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {t("product.bargainStepsHint")}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Refund / Store Credit */}
          {systemRefundEnabled && (
            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">{t("product.refundStoreCredit")}</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("product.refundable")}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formData.refundable
                        ? t("product.refundableEnabledHint")
                        : t("product.refundableDisabledHint")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, refundable: !formData.refundable })}
                    className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all active:scale-95 ${
                      formData.refundable
                        ? "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                        : "bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-sky-500 dark:hover:bg-sky-600"
                    }`}
                  >
                    {formData.refundable ? t("product.disableRefunds") : t("product.enableRefunds")}
                  </button>
                </div>

                {formData.refundable && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="credit_discount_percentage" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                        {t("product.creditDiscountPct")}
                      </label>
                      <input
                        id="credit_discount_percentage"
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={formData.credit_discount_percentage ?? 0}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            credit_discount_percentage: Math.min(100, Math.max(0, e.target.value === "" ? 0 : parseFloat(e.target.value) || 0)),
                          })
                        }
                        className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-indigo-500 dark:focus:border-sky-400 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-sky-900"
                      />
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {t("product.creditDiscountHint")}
                      </p>
                    </div>
                    <div>
                      <label htmlFor="credit_duration_days" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                        {t("product.creditDuration")}
                      </label>
                      <input
                        id="credit_duration_days"
                        type="number"
                        min="0"
                        value={formData.credit_duration_days ?? 0}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            credit_duration_days: Math.max(0, e.target.value === "" ? 0 : parseInt(e.target.value) || 0),
                          })
                        }
                        className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-indigo-500 dark:focus:border-sky-400 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-sky-900"
                      />
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {t("product.creditDurationHint")}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Bulk Price */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">{t("product.bulkPrice")}</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("product.bulkPricing")}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {formData.bulk_enabled
                      ? t("product.bulkEnabledHint")
                      : t("product.bulkDisabledHint")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, bulk_enabled: !formData.bulk_enabled })}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all active:scale-95 ${
                    formData.bulk_enabled
                      ? "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                      : "bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-sky-500 dark:hover:bg-sky-600"
                  }`}
                >
                  {formData.bulk_enabled ? t("product.disableBulkPrice") : t("product.enableBulkPrice")}
                </button>
              </div>

              {formData.bulk_enabled && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="bulk_quantity" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                      {t("product.bulkQuantity")}
                    </label>
                    <input
                      id="bulk_quantity"
                      type="number"
                      min="1"
                      value={formData.bulk_quantity ?? 0}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          bulk_quantity: Math.max(1, e.target.value === "" ? 0 : parseInt(e.target.value) || 0),
                        })
                      }
                      className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-indigo-500 dark:focus:border-sky-400 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-sky-900"
                    />
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {t("product.bulkQuantityHint")}
                    </p>
                  </div>
                  <div>
                    <label htmlFor="bulk_price" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                      {t("product.bulkPrice")}
                    </label>
                    <input
                      id="bulk_price"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.bulk_price ?? 0}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          bulk_price: e.target.value === "" ? 0 : parseFloat(e.target.value) || 0,
                        })
                      }
                      className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-indigo-500 dark:focus:border-sky-400 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-sky-900"
                    />
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {t("product.bulkPriceHint")}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Logistics */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">{t("product.logistics")}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="supplier" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("product.supplier")}
                </label>
                <input
                  id="supplier"
                  type="text"
                  value={formData.supplier}
                  onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:border-indigo-500 dark:focus:border-sky-400 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-sky-900"
                  placeholder={t("product.supplierNamePlaceholder")}
                />
              </div>

              <div>
                <label htmlFor="supplier_email" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("product.supplierEmail")}
                </label>
                <input
                  id="supplier_email"
                  type="email"
                  value={formData.supplier_email}
                  onChange={(e) => setFormData({ ...formData, supplier_email: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:border-indigo-500 dark:focus:border-sky-400 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-sky-900"
                  placeholder="supplier@example.com"
                />
              </div>

              <div>
                <label htmlFor="supplier_phone" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("product.supplierPhone")}
                </label>
                <input
                  id="supplier_phone"
                  type="tel"
                  value={formData.supplier_phone}
                  onChange={(e) => setFormData({ ...formData, supplier_phone: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:border-indigo-500 dark:focus:border-sky-400 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-sky-900"
                  placeholder="+1 234 567 890"
                />
              </div>

              <div>
                <label htmlFor="warehouse_location" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("product.warehouseLocation")}
                </label>
                <input
                  id="warehouse_location"
                  type="text"
                  value={formData.warehouse_location}
                  onChange={(e) => setFormData({ ...formData, warehouse_location: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:border-indigo-500 dark:focus:border-sky-400 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-sky-900"
                  placeholder="e.g. A-12-03"
                />
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-slate-700 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition-transform"
              disabled={isSaving}
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 dark:bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 dark:hover:bg-sky-600 active:scale-95 transition-transform disabled:opacity-50"
              disabled={isSaving}
            >
              {isSaving ? t("product.saving") : isEditMode ? t("product.updateProduct") : t("product.addProduct")}
            </button>
          </div>
        </form>
      </div>

      {toast && <ScanToast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  );
}
