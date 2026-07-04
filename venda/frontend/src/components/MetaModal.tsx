import { useEffect, useState } from "react";
import { Product } from "./ProductModal";

type SalesData = {
  product_id: number;
  product_name: string;
  barcode: string;
  total_sold: number;
  total_revenue: number;
  avg_daily_sales: number;
  sales_by_date: Array<{
    sale_date: string;
    items_sold: number;
    quantity_sold: number;
    revenue: number;
  }>;
};

type MetaModalProps = {
  isOpen: boolean;
  product: Product | null;
  onClose: () => void;
};

export default function MetaModal({ isOpen, product, onClose }: MetaModalProps) {
  const [currentSlide, setCurrentSlide] = useState<"data" | "sales">("data");
  const [salesData, setSalesData] = useState<SalesData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && product?.id) {
      fetchSalesData();
    }
  }, [isOpen, product?.id]);

  const fetchSalesData = async () => {
    if (!product?.id) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/inventory/${product.id}/sales`);
      if (!response.ok) throw new Error("Failed to fetch sales data");
      const data = await response.json();
      setSalesData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading sales data");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !product) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Product Analytics</h2>
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

        {/* Slider Navigation */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setCurrentSlide("data")}
            className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-colors ${
              currentSlide === "data"
                ? "bg-indigo-600 dark:bg-sky-500 text-white"
                : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            Product Data
          </button>
          <button
            onClick={() => setCurrentSlide("sales")}
            className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-colors ${
              currentSlide === "sales"
                ? "bg-indigo-600 dark:bg-sky-500 text-white"
                : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            Sales Analytics
          </button>
        </div>

        {/* Slide 1: Product Data */}
        {currentSlide === "data" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold mb-1">Name</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">{product.name}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold mb-1">Category</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">{product.category}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold mb-1">Barcode</p>
                <p className="text-lg font-mono font-bold text-slate-900 dark:text-white">{product.barcode}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold mb-1">SKU</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">{product.id}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4 border border-emerald-200 dark:border-emerald-900">
                <p className="text-xs text-emerald-600 dark:text-emerald-400 uppercase font-semibold mb-1">Selling Price</p>
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">${product.selling_price.toFixed(2)}</p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-900">
                <p className="text-xs text-blue-600 dark:text-blue-400 uppercase font-semibold mb-1">Cost Price</p>
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">${product.cost_price.toFixed(2)}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold mb-1">Current Stock</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{product.current_stock}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold mb-1">Min Level</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{product.min_stock_level}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold mb-1">Reorder Point</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{product.reorder_point}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold mb-1">Supplier</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">{product.supplier || "Not specified"}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold mb-1">Warehouse Location</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">{product.warehouse_location || "Not specified"}</p>
              </div>
            </div>

            {product.description && (
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold mb-2">Description</p>
                <p className="text-sm text-slate-700 dark:text-slate-300">{product.description}</p>
              </div>
            )}

            {/* Profit Margin */}
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-lg p-4 border border-indigo-200 dark:border-indigo-900">
              <p className="text-xs text-indigo-600 dark:text-indigo-400 uppercase font-semibold mb-2">Profit Margin</p>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-bold text-indigo-700 dark:text-indigo-400">
                  {(((product.selling_price - product.cost_price) / product.selling_price) * 100).toFixed(1)}%
                </p>
                <p className="text-sm text-indigo-600 dark:text-indigo-400">
                  (${(product.selling_price - product.cost_price).toFixed(2)} per unit)
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Slide 2: Sales Analytics */}
        {currentSlide === "sales" && (
          <div className="space-y-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-slate-400 dark:text-slate-500">Loading sales data...</div>
              </div>
            ) : error ? (
              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 text-red-600 dark:text-red-400">
                {error}
              </div>
            ) : salesData ? (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4 border border-emerald-200 dark:border-emerald-900">
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 uppercase font-semibold mb-1">Total Sold</p>
                    <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-400">{salesData.total_sold}</p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-900">
                    <p className="text-xs text-blue-600 dark:text-blue-400 uppercase font-semibold mb-1">Revenue</p>
                    <p className="text-3xl font-bold text-blue-700 dark:text-blue-400">${salesData.total_revenue.toFixed(2)}</p>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-900">
                    <p className="text-xs text-purple-600 dark:text-purple-400 uppercase font-semibold mb-1">Avg Daily</p>
                    <p className="text-3xl font-bold text-purple-700 dark:text-purple-400">{salesData.avg_daily_sales.toFixed(1)}</p>
                  </div>
                </div>

                {/* Sales Chart */}
                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                  <p className="text-sm font-bold text-slate-900 dark:text-white mb-4">Sales Over Time (Last 90 Days)</p>
                  
                  {salesData.sales_by_date && salesData.sales_by_date.length > 0 ? (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {salesData.sales_by_date.map((item) => {
                        const maxQuantity = Math.max(...salesData.sales_by_date.map(d => d.quantity_sold), 1);
                        const percentage = (item.quantity_sold / maxQuantity) * 100;
                        return (
                          <div key={item.sale_date} className="flex items-center gap-3">
                            <div className="w-24 text-xs font-medium text-slate-600 dark:text-slate-400">
                              {new Date(item.sale_date).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}
                            </div>
                            <div className="flex-1 bg-slate-200 dark:bg-slate-700 rounded-full h-6 overflow-hidden">
                              <div
                                className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full flex items-center justify-end pr-2 text-xs font-bold text-white transition-all"
                                style={{ width: `${percentage}%` }}
                              >
                                {percentage > 15 && `${item.quantity_sold}`}
                              </div>
                            </div>
                            <div className="w-12 text-right text-xs font-bold text-slate-900 dark:text-white">
                              {item.quantity_sold}
                            </div>
                            <div className="w-20 text-right text-xs text-slate-600 dark:text-slate-400">
                              ${item.revenue.toFixed(2)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-center py-6 text-slate-500 dark:text-slate-400">No sales data available</p>
                  )}
                </div>

                {/* Data Table */}
                {salesData.sales_by_date && salesData.sales_by_date.length > 0 && (
                  <div className="bg-slate-50 dark:bg-slate-800 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-100 dark:bg-slate-700">
                        <tr>
                          <th className="px-4 py-2 text-left text-slate-700 dark:text-slate-300 font-semibold">Date</th>
                          <th className="px-4 py-2 text-left text-slate-700 dark:text-slate-300 font-semibold">Qty</th>
                          <th className="px-4 py-2 text-left text-slate-700 dark:text-slate-300 font-semibold">Revenue</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                        {salesData.sales_by_date.slice(0, 10).map((item) => (
                          <tr key={item.sale_date}>
                            <td className="px-4 py-2 text-slate-900 dark:text-white">
                              {new Date(item.sale_date).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-2 font-bold text-slate-900 dark:text-white">{item.quantity_sold}</td>
                            <td className="px-4 py-2 font-bold text-emerald-600 dark:text-emerald-400">
                              ${item.revenue.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-slate-500 dark:text-slate-400">No sales data available</div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="w-full py-2 px-4 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
