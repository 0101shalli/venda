import { useEffect, useState, useRef } from "react";
import JsBarcode from "jsbarcode";

export type Product = {
  id?: number;
  barcode: string;
  name: string;
  description: string;
  category: string;
  cost_price: number;
  selling_price: number;
  current_stock: number;
  min_stock_level: number;
  reorder_point: number;
  supplier: string;
  warehouse_location: string;
};

const generateBarcode = () => {
  const prefix = "750";
  const timestamp = Date.now().toString().slice(-9);
  const randomDigits = Math.floor(100 + Math.random() * 900).toString();
  return `${prefix}${timestamp}${randomDigits}`;
};

type ProductModalProps = {
  isOpen: boolean;
  isEditMode: boolean;
  product?: Product;
  onClose: () => void;
  onSave: (product: Product) => Promise<void>;
  categories?: string[];
};

const DEFAULT_CATEGORIES = ["General", "Electronics", "Logistics", "Apparel", "Food & Beverage", "Hardware"];

export default function ProductModal({ isOpen, isEditMode, product, onClose, onSave, categories = DEFAULT_CATEGORIES }: ProductModalProps) {
  const [formData, setFormData] = useState<Product>({
    barcode: "",
    name: "",
    description: "",
    category: "General",
    cost_price: 0,
    selling_price: 0,
    current_stock: 0,
    min_stock_level: 0,
    reorder_point: 0,
    supplier: "",
    warehouse_location: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const barcodePreviewRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (isOpen && formData.barcode && barcodePreviewRef.current) {
      try {
        JsBarcode(barcodePreviewRef.current, formData.barcode, {
          format: "CODE128",
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
      setFormData(product);
    } else {
      setFormData({
        barcode: generateBarcode(),
        name: "",
        description: "",
        category: "General",
        cost_price: 0,
        selling_price: 0,
        current_stock: 0,
        min_stock_level: 0,
        reorder_point: 0,
        supplier: "",
        warehouse_location: "",
      });
    }
    setErrors({});
  }, [isOpen, isEditMode, product]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.barcode.trim()) newErrors.barcode = "Barcode is required";
    if (!formData.name.trim()) newErrors.name = "Product name is required";
    if (formData.cost_price < 0) newErrors.cost_price = "Cost price must be positive";
    if (formData.selling_price < 0) newErrors.selling_price = "Selling price must be positive";
    if (formData.selling_price <= formData.cost_price) {
      newErrors.selling_price = "Selling price must be greater than cost price";
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
            {isEditMode ? "Edit Product" : "Add New Product"}
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
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">Primary Details</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="barcode" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Barcode
                </label>
                <input
                  id="barcode"
                  type="text"
                  value={formData.barcode}
                  readOnly
                  className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-400"
                  placeholder="Auto-generated barcode"
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">System-generated barcode for the new product.</p>
                <div className="mt-3 p-3 bg-white rounded-xl border border-slate-200 dark:border-slate-800 flex justify-center items-center w-64 shadow-sm">
                  <svg ref={barcodePreviewRef} />
                </div>
              </div>

              <div>
                <label htmlFor="name" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Product Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={`mt-1 block w-full rounded-lg border ${
                    errors.name ? "border-red-500 dark:border-red-600" : "border-slate-300 dark:border-slate-600"
                  } bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:border-indigo-500 dark:focus:border-sky-400 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-sky-900`}
                  placeholder="Product name"
                />
                {errors.name && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{errors.name}</p>}
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Description
                </label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:border-indigo-500 dark:focus:border-sky-400 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-sky-900"
                  placeholder="Product description"
                />
              </div>

              <div>
                <label htmlFor="category" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Category
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
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">Inventory Rules</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="current_stock" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Current Stock
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
                  Minimum Stock Level
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
                  Reorder Point
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

          {/* Financials */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">Financials</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="cost_price" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Cost Price <span className="text-red-500">*</span>
                </label>
                <input
                  id="cost_price"
                  type="number"
                  step="0.01"
                  value={formData.cost_price}
                  onChange={(e) => setFormData({ ...formData, cost_price: parseFloat(e.target.value) || 0 })}
                  className={`mt-1 block w-full rounded-lg border ${
                    errors.cost_price ? "border-red-500 dark:border-red-600" : "border-slate-300 dark:border-slate-600"
                  } bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:border-indigo-500 dark:focus:border-sky-400 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-sky-900`}
                  min="0"
                />
                {errors.cost_price && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{errors.cost_price}</p>}
              </div>

              <div>
                <label htmlFor="selling_price" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Selling Price <span className="text-red-500">*</span>
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

          {/* Logistics */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">Logistics</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="supplier" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Supplier
                </label>
                <input
                  id="supplier"
                  type="text"
                  value={formData.supplier}
                  onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:border-indigo-500 dark:focus:border-sky-400 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-sky-900"
                  placeholder="Supplier name"
                />
              </div>

              <div>
                <label htmlFor="warehouse_location" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Warehouse Location
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
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 dark:bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 dark:hover:bg-sky-600 active:scale-95 transition-transform disabled:opacity-50"
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : isEditMode ? "Update Product" : "Add Product"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
