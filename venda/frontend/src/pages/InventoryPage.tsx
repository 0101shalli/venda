import { useEffect, useState, useMemo } from "react";
import ProductModal, { Product } from "../components/ProductModal";
import BarcodeModal from "../components/BarcodeModal";
import MetaModal from "../components/MetaModal";

type InventoryStat = {
  total_products: number;
  in_stock: number;
  low_stock: number;
  out_of_stock: number;
  total_value: number;
  total_retail_value: number;
  categories: string[];
};

const CATEGORIES = ["All", "General", "Electronics", "Logistics", "Apparel", "Food & Beverage", "Hardware"];
const STOCK_STATUSES = ["All", "In Stock", "Low Stock", "Out of Stock"];

// Simple fuzzy search algorithm
function fuzzySearch(query: string, text: string): boolean {
  const lowerQuery = query.toLowerCase();
  const lowerText = text.toLowerCase();
  
  if (!lowerQuery) return true;
  
  let queryIdx = 0;
  for (let i = 0; i < lowerText.length && queryIdx < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[queryIdx]) {
      queryIdx++;
    }
  }
  return queryIdx === lowerQuery.length;
}

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [stats, setStats] = useState<InventoryStat | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedStockStatus, setSelectedStockStatus] = useState("All");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>(["All", "General", "Electronics", "Logistics", "Apparel", "Food & Beverage", "Hardware"]);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);
  const [selectedProductForBarcode, setSelectedProductForBarcode] = useState<Product | null>(null);
  const [isMetaModalOpen, setIsMetaModalOpen] = useState(false);
  const [selectedProductForMeta, setSelectedProductForMeta] = useState<Product | null>(null);

  // Fetch inventory data
  const fetchInventory = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedCategory !== "All") params.append("category", selectedCategory);
      if (selectedStockStatus !== "All") params.append("stock_status", selectedStockStatus);
      if (searchQuery) params.append("search", searchQuery);

      const response = await fetch(`/api/inventory?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch inventory");
      
      const data = await response.json();
      setProducts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading inventory");
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch stats
  const fetchStats = async () => {
    try {
      const response = await fetch("/api/inventory/stats");
      if (!response.ok) throw new Error("Failed to fetch stats");
      
      const data = await response.json();
      setStats(data);
      // Update categories from stats, preserving "All" at the start
      if (data.categories && data.categories.length > 0) {
        setCategories(["All", ...data.categories.filter((c: string) => c !== "All")]);
      }
    } catch (err) {
      console.error("Error loading stats:", err);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      fetchInventory();
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [searchQuery, selectedCategory, selectedStockStatus]);

  // Fuzzy filter for search
  const filteredProducts = useMemo(() => {
    if (!searchQuery) return products;
    
    return products.filter(
      (p) => fuzzySearch(searchQuery, p.name) || fuzzySearch(searchQuery, p.barcode)
    );
  }, [products, searchQuery]);

  const getStockStatus = (stock: number) => {
    if (stock > 10) return { status: "In Stock", color: "bg-emerald-100 text-emerald-700" };
    if (stock > 0) return { status: "Low Stock", color: "bg-amber-100 text-amber-700" };
    return { status: "Out of Stock", color: "bg-red-100 text-red-700" };
  };

  const handleAddProduct = async (product: Product) => {
    try {
      const response = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(product),
      });

      if (!response.ok) throw new Error("Failed to add product");

      await Promise.all([fetchInventory(), fetchStats()]);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error adding product");
      throw err;
    }
  };

  const handleUpdateProduct = async (product: Product) => {
    if (!product.id) return;

    try {
      const response = await fetch(`/api/inventory/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(product),
      });

      if (!response.ok) throw new Error("Failed to update product");

      await Promise.all([fetchInventory(), fetchStats()]);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error updating product");
      throw err;
    }
  };

  const handleDeleteProduct = async (productId: number) => {
    if (!confirm("Are you sure you want to delete this product?")) return;

    try {
      const response = await fetch(`/api/inventory/${productId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete product");

      await Promise.all([fetchInventory(), fetchStats()]);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error deleting product");
    }
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newCategoryName.trim();
    
    if (!trimmedName) {
      alert("Category name cannot be empty");
      return;
    }
    
    if (categories.includes(trimmedName)) {
      alert("This category already exists");
      return;
    }
    
    // Add category locally
    setCategories([...categories, trimmedName]);
    setNewCategoryName("");
    setIsCategoryModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Stats Bar */}
      {stats && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <StatCard label="Total Products" value={stats.total_products} icon="📦" />
          <StatCard label="In Stock" value={stats.in_stock} icon="✓" color="emerald" />
          <StatCard label="Low Stock" value={stats.low_stock} icon="⚠" color="amber" />
          <StatCard label="Out of Stock" value={stats.out_of_stock} icon="✕" color="red" />
          <StatCard label="Total Value" value={`$${stats.total_value.toFixed(2)}`} icon="💰" />
          <StatCard label="Retail Value" value={`$${stats.total_retail_value.toFixed(2)}`} icon="💵" />
        </div>
      )}

      {/* Filters & Search Bar */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4 border border-slate-200 dark:border-slate-700">
        {/* Search Bar */}
        <div className="relative">
          <svg className="absolute left-3 top-3 h-5 w-5 text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by product name or barcode..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-10 pr-4 py-2.5 text-sm placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-400 dark:focus:border-sky-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-sky-900 outline-none text-slate-900 dark:text-white"
          />
        </div>

        {/* Filter Row */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:gap-4 flex-1">
            {/* Category Filter */}
            <div className="flex-1 sm:flex-auto sm:min-w-[160px]">
              <label htmlFor="category-filter" className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">
                Category
              </label>
              <div className="flex gap-2">
                <select
                  id="category-filter"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:border-indigo-400 dark:focus:border-sky-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-sky-900 outline-none text-slate-900 dark:text-white"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setIsCategoryModalOpen(true)}
                  className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition-transform"
                  title="Add new category"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Stock Status Filter */}
            <div className="flex-1 sm:flex-auto sm:min-w-[160px]">
              <label htmlFor="stock-filter" className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">
                Stock Status
              </label>
              <select
                id="stock-filter"
                value={selectedStockStatus}
                onChange={(e) => setSelectedStockStatus(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:border-indigo-400 dark:focus:border-sky-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-sky-900 outline-none text-slate-900 dark:text-white"
              >
                {STOCK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Add Product Button */}
          <button
            onClick={() => {
              setEditingProduct(null);
              setIsModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 dark:bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 dark:hover:bg-sky-600 active:scale-95 transition-transform whitespace-nowrap"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Product
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Data Table */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 shadow-sm overflow-hidden border border-slate-200 dark:border-slate-700">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-slate-500 dark:text-slate-400">Loading inventory...</div>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <svg className="h-12 w-12 text-slate-300 dark:text-slate-700 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
              <p className="text-slate-600 dark:text-slate-300 font-medium">No products found</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Try adjusting your filters or search query</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">SKU/Name</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Category</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Stock</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Price</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Supplier</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {filteredProducts.map((product) => {
                  const { status, color } = getStockStatus(product.current_stock);
                  return (
                    <tr key={product.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-slate-900 dark:text-white">{product.name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{product.barcode}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-600 dark:text-slate-400">{product.category}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-semibold text-slate-900 dark:text-white">{product.current_stock}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">Min: {product.min_stock_level}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>
                          {status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-semibold text-slate-900 dark:text-white">${product.selling_price.toFixed(2)}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">Cost: ${product.cost_price.toFixed(2)}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-600 dark:text-slate-400">{product.supplier || "—"}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-1 flex-wrap">
                          <button
                            onClick={() => {
                              setSelectedProductForBarcode(product);
                              setIsBarcodeModalOpen(true);
                            }}
                            className="rounded px-2 py-1 text-xs font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-slate-800"
                            title="Print Barcode"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => {
                              setSelectedProductForMeta(product);
                              setIsMetaModalOpen(true);
                            }}
                            className="rounded px-2 py-1 text-xs font-medium text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-slate-800"
                            title="Meta Data & Sales"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => openEditModal(product)}
                            className="rounded px-2 py-1 text-xs font-medium text-indigo-600 dark:text-sky-400 hover:bg-indigo-50 dark:hover:bg-slate-800"
                            title="Edit"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => product.id && handleDeleteProduct(product.id)}
                            className="rounded px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-slate-800"
                            title="Delete"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Product Modal */}
      <ProductModal
        isOpen={isModalOpen}
        isEditMode={!!editingProduct}
        product={editingProduct || undefined}
        onClose={closeModal}
        onSave={editingProduct ? handleUpdateProduct : handleAddProduct}
        categories={categories}
      />

      {/* Barcode Modal */}
      <BarcodeModal
        isOpen={isBarcodeModalOpen}
        product={selectedProductForBarcode}
        onClose={() => {
          setIsBarcodeModalOpen(false);
          setSelectedProductForBarcode(null);
        }}
      />

      {/* Meta Modal */}
      <MetaModal
        isOpen={isMetaModalOpen}
        product={selectedProductForMeta}
        onClose={() => {
          setIsMetaModalOpen(false);
          setSelectedProductForMeta(null);
        }}
      />

      {/* Add Category Modal */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsCategoryModalOpen(false)} />
          <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Add New Category</h2>
            <form onSubmit={handleAddCategory} className="space-y-4">
              <div>
                <label htmlFor="category-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Category Name
                </label>
                <input
                  id="category-name"
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="e.g., Furniture"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:border-indigo-500 dark:focus:border-sky-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-sky-900 outline-none"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsCategoryModalOpen(false);
                    setNewCategoryName("");
                  }}
                  className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition-transform"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-600 dark:bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 dark:hover:bg-sky-600 active:scale-95 transition-transform"
                >
                  Add Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: string; color?: string }) {
  const colorClass = {
    emerald: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400",
    amber: "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400",
    red: "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400",
  }[color || "default"] || "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400";

  return (
    <div className="rounded-xl bg-white dark:bg-slate-900 p-4 shadow-sm border border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
        </div>
        <div className={`rounded-lg p-3 text-xl ${colorClass}`}>{icon}</div>
      </div>
    </div>
  );
}

