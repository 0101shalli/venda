import { useEffect, useState, useMemo, ReactNode } from "react";
import ProductModal, { Product } from "../components/ProductModal";
import BarcodeModal from "../components/BarcodeModal";
import MetaModal from "../components/MetaModal";
import PrintLabelsModal from "../components/PrintLabelsModal";
import { useCurrency } from "../context/CurrencyContext";
import { useLanguage } from "../context/LanguageContext";

type InventoryStat = {
  total_products: number;
  in_stock: number;
  low_stock: number;
  out_of_stock: number;
  expired_products: number;
  soon_expired_products: number;
  restock: number;
  total_value: number;
  total_retail_value: number;
  categories: string[];
};

const CATEGORIES = ["All", "General", "Electronics", "Logistics", "Apparel", "Food & Beverage", "Hardware"];
const STOCK_STATUSES = ["All", "In Stock", "Low Stock", "Out of Stock", "Restock Needed"];
const PRODUCT_STATES = ["All", "Soon Expired", "Expired"];

const categoryLabelMap: Record<string, string> = {
  "All": "inventory.all",
  "General": "inventory.gen",
  "Electronics": "inventory.elec",
  "Logistics": "inventory.log",
  "Apparel": "inventory.apparel",
  "Food & Beverage": "inventory.food",
  "Hardware": "inventory.hardware",
};

const stockStatusLabelMap: Record<string, string> = {
  "All": "inventory.all",
  "In Stock": "inventory.instock",
  "Low Stock": "inventory.lowstock",
  "Out of Stock": "inventory.outofstock",
  "Restock Needed": "inventory.restock",
};

const productStateLabelMap: Record<string, string> = {
  "All": "inventory.all",
  "Soon Expired": "inventory.soonexpired",
  "Expired": "inventory.expired",
};

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
  const { t } = useLanguage();
  const { formatPrice, currencySymbol } = useCurrency();
  const [products, setProducts] = useState<Product[]>([]);
  const [stats, setStats] = useState<InventoryStat | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedStockStatus, setSelectedStockStatus] = useState("All");
  const [selectedState, setSelectedState] = useState("All");
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
  const [isPrintLabelsOpen, setIsPrintLabelsOpen] = useState(false);

  const translateOption = (map: Record<string, string>, value: string): string => {
    const key = map[value];
    return key ? t(key) : value;
  };

  // Fetch inventory data
  const fetchInventory = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedCategory !== "All") params.append("category", selectedCategory);
      if (selectedStockStatus !== "All") params.append("stock_status", selectedStockStatus);
      if (selectedState !== "All") {
        const stateValue =
          selectedState === "Soon Expired" ? "soon_expired" :
          selectedState === "Expired" ? "expired" : selectedState;
        params.append("state", stateValue);
      }
      if (searchQuery) params.append("search", searchQuery);

      const response = await fetch(`/api/inventory?${params.toString()}`);
      if (!response.ok) throw new Error(t("inventory.errfetch"));
      
      const data = await response.json();
      setProducts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("inventory.errload"));
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch stats
  const fetchStats = async () => {
    try {
      const response = await fetch("/api/inventory/stats");
      if (!response.ok) throw new Error(t("inventory.errfetchstats"));
      
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
  }, [searchQuery, selectedCategory, selectedStockStatus, selectedState]);

  // Fuzzy filter for search
  const filteredProducts = useMemo(() => {
    if (!searchQuery) return products;
    
    return products.filter(
      (p) => fuzzySearch(searchQuery, p.name) || fuzzySearch(searchQuery, p.barcode)
    );
  }, [products, searchQuery]);

  const getStockStatus = (product: Product) => {
    const stock = product.current_stock;
    if (stock === 0) return { status: "Out of Stock", color: "bg-red-100 text-red-700" };
    if (stock < product.reorder_point) return { status: "Restock Needed", color: "bg-purple-100 text-purple-700" };
    if (stock > 10) return { status: "In Stock", color: "bg-emerald-100 text-emerald-700" };
    return { status: "Low Stock", color: "bg-amber-100 text-amber-700" };
  };

  const getProductState = (product: Product) => {
    if (product.state === "expired") {
      return { state: "Expired", color: "bg-red-100 text-red-700" };
    }
    if (product.state === "soon_expired") {
      return { state: "Soon Expired", color: "bg-orange-100 text-orange-700" };
    }
    return null;
  };

  const handleAddProduct = async (product: Product) => {
    try {
      const response = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(product),
      });

      if (!response.ok) throw new Error(t("inventory.erradd"));

      await Promise.all([fetchInventory(), fetchStats()]);
    } catch (err) {
      alert(err instanceof Error ? err.message : t("inventory.erradd"));
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

      if (!response.ok) throw new Error(t("inventory.errupdate"));

      await Promise.all([fetchInventory(), fetchStats()]);
    } catch (err) {
      alert(err instanceof Error ? err.message : t("inventory.errupdate"));
      throw err;
    }
  };

  const handleDeleteProduct = async (productId: number) => {
    if (!confirm(t("inventory.confirmdelete"))) return;

    try {
      const response = await fetch(`/api/inventory/${productId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error(t("inventory.errdelete"));

      await Promise.all([fetchInventory(), fetchStats()]);
    } catch (err) {
      alert(err instanceof Error ? err.message : t("inventory.errdelete"));
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
      alert(t("inventory.catempty"));
      return;
    }
    
    if (categories.includes(trimmedName)) {
      alert(t("inventory.catexists"));
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t("inventory.totalproducts")} value={stats.total_products} icon="📦" />
          <StatCard label={t("inventory.instock")} value={stats.in_stock} icon="✓" color="emerald" />
          <StatCard label={t("inventory.lowstock")} value={stats.low_stock} icon="⚠" color="amber" />
          <StatCard label={t("inventory.outofstock")} value={stats.out_of_stock} icon="✕" color="red" />
          <StatCard
            label={t("inventory.trackingstate")}
            value={
              <>
                <span className="text-amber-500">{stats.soon_expired_products || 0}</span>{" "}
                <span className="text-slate-500 dark:text-slate-400">/</span>{" "}
                <span className="text-rose-500">{stats.expired_products}</span>
              </>
            }
            icon="📅"
            color="red"
          />
          <StatCard label={t("inventory.restock")} value={stats.restock} icon="🔄" color="amber" />
          <StatCard label={t("inventory.totalvalue")} value={<><span className="text-sm font-semibold text-indigo-500 dark:text-indigo-400">{currencySymbol}</span><br/>{formatPrice(stats.total_value)}</>} icon="💰" />
          <StatCard label={t("inventory.retailvalue")} value={<><span className="text-sm font-semibold text-indigo-500 dark:text-indigo-400">{currencySymbol}</span><br/>{formatPrice(stats.total_retail_value)}</>} icon="💵" />
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
            placeholder={t("inventory.searchplaceholder")}
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
                {t("inventory.category")}
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
                      {translateOption(categoryLabelMap, cat)}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setIsCategoryModalOpen(true)}
                  className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition-transform"
                  title={t("inventory.addcategory")}
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
                {t("inventory.stockstatus")}
              </label>
              <select
                id="stock-filter"
                value={selectedStockStatus}
                onChange={(e) => setSelectedStockStatus(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:border-indigo-400 dark:focus:border-sky-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-sky-900 outline-none text-slate-900 dark:text-white"
              >
                {STOCK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {translateOption(stockStatusLabelMap, status)}
                  </option>
                ))}
              </select>
            </div>

            {/* State Filter */}
            <div className="flex-1 sm:flex-auto sm:min-w-[160px]">
              <label htmlFor="state-filter" className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">
                {t("inventory.state")}
              </label>
              <select
                id="state-filter"
                value={selectedState}
                onChange={(e) => setSelectedState(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:border-indigo-400 dark:focus:border-sky-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-sky-900 outline-none text-slate-900 dark:text-white"
              >
                {PRODUCT_STATES.map((state) => (
                  <option key={state} value={state}>
                    {translateOption(productStateLabelMap, state)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Print Labels + Add Product Buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setIsPrintLabelsOpen(true)}
              className="flex items-center justify-center gap-2 rounded-lg border border-indigo-600 dark:border-sky-500 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-semibold text-indigo-600 dark:text-sky-400 hover:bg-indigo-50 dark:hover:bg-slate-700 active:scale-95 transition-transform whitespace-nowrap"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {t("inventory.printlabels")}
            </button>

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
              {t("inventory.addproduct")}
            </button>
          </div>
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
            <div className="text-slate-500 dark:text-slate-400">{t("inventory.loading")}</div>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <svg className="h-12 w-12 text-slate-300 dark:text-slate-700 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
              <p className="text-slate-600 dark:text-slate-300 font-medium">{t("inventory.empty")}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{t("inventory.emptyhint")}</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">{t("inventory.sku")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">{t("inventory.category")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">{t("inventory.stock")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">{t("inventory.status")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">{t("inventory.state")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">{t("inventory.price")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">{t("inventory.profit")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">{t("inventory.supplier")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">{t("inventory.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {filteredProducts.map((product) => {
                  const { status, color } = getStockStatus(product);
                  const productState = getProductState(product);
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
                        <div className="text-xs text-slate-500 dark:text-slate-400">{t("inventory.min")} {product.min_stock_level}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>
                          {translateOption(stockStatusLabelMap, status)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {product.is_batch_tracked && productState ? (
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${productState.color}`}>
                            {translateOption(productStateLabelMap, productState.state)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-semibold text-slate-900 dark:text-white">{formatPrice(product.selling_price)}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{t("inventory.cost")} {formatPrice(product.cost_price)}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">{product.profit_percentage || 0}%</span>
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
                            title={t("inventory.barcode")}
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
                            title={t("inventory.meta")}
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => openEditModal(product)}
                            className="rounded px-2 py-1 text-xs font-medium text-indigo-600 dark:text-sky-400 hover:bg-indigo-50 dark:hover:bg-slate-800"
                            title={t("inventory.edit")}
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => product.id && handleDeleteProduct(product.id)}
                            className="rounded px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-slate-800"
                            title={t("inventory.delete")}
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

      {/* Print Labels Modal */}
      <PrintLabelsModal
        isOpen={isPrintLabelsOpen}
        onClose={() => setIsPrintLabelsOpen(false)}
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
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">{t("inventory.newcategory")}</h2>
            <form onSubmit={handleAddCategory} className="space-y-4">
              <div>
                <label htmlFor="category-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {t("inventory.catname")}
                </label>
                <input
                  id="category-name"
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder={t("inventory.catplaceholder")}
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
                  {t("inventory.cancel")}
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-600 dark:bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 dark:hover:bg-sky-600 active:scale-95 transition-transform"
                >
                  {t("inventory.addcategory")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string | number | ReactNode; icon: string; color?: string }) {
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
