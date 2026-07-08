import { useEffect, useState } from "react";

interface OrderItem {
  sku: string;
  name: string;
  category: string;
  unit_price: number;
  quantity: number;
  total_price: number;
}

interface Order {
  id: number;
  invoice_number: string;
  timestamp: string;
  cashier_id: number;
  cashier_name: string;
  payment_method: string;
  total_amount: number;
  items: OrderItem[];
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/sales")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch orders");
        return res.json();
      })
      .then((data) => {
        setOrders(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const toggleExpand = (id: number) => {
    setExpandedOrderId(expandedOrderId === id ? null : id);
  };

  const filteredOrders = orders.filter((order) => {
    const term = searchTerm.toLowerCase();
    return (
      order.invoice_number.toLowerCase().includes(term) ||
      order.cashier_name.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm border border-slate-200 dark:border-slate-800">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Orders History</h2>
        <p className="mt-2 text-slate-500 dark:text-slate-400">View and inspect customer checkout orders and item details.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <input
            type="text"
            placeholder="Search by invoice number or cashier..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
          />
        </div>
        <div className="text-sm text-slate-500 dark:text-slate-400 font-medium">
          Showing {filteredOrders.length} order{filteredOrders.length !== 1 && "s"}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-sky-500"></div>
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-red-50 dark:bg-red-950/20 p-6 text-red-500 dark:text-red-400 text-center border border-red-200 dark:border-red-950">
          Error: {error}
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="rounded-3xl bg-white dark:bg-slate-900 p-12 text-center border border-slate-200 dark:border-slate-800">
          <p className="text-slate-500 dark:text-slate-400 text-lg font-medium">No orders found matching the filter.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => {
            const isExpanded = expandedOrderId === order.id;
            const dateStr = new Date(order.timestamp).toLocaleString();
            
            return (
              <div
                key={order.id}
                className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-md transition-all duration-200"
              >
                <div
                  onClick={() => toggleExpand(order.id)}
                  className="p-6 flex flex-wrap gap-4 items-center justify-between cursor-pointer select-none"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                        {order.invoice_number}
                      </span>
                      <span className="rounded-full bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 text-xs font-semibold px-3 py-1">
                        {order.payment_method}
                      </span>
                    </div>
                    <div className="text-sm text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-4">
                      <span>🕒 {dateStr}</span>
                      <span>👤 Cashier: {order.cashier_name} (ID: {order.cashier_id})</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-xl font-bold text-slate-800 dark:text-slate-100">
                        ${order.total_amount.toFixed(2)}
                      </div>
                      <div className="text-xs text-slate-400 dark:text-slate-500">
                        {order.items.reduce((acc, it) => acc + it.quantity, 0)} item(s)
                      </div>
                    </div>
                    <button
                      type="button"
                      className="rounded-full p-2 bg-slate-50 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                    >
                      <svg
                        className={`h-5 w-5 transform transition-transform duration-200 ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50 p-6">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="text-slate-400 dark:text-slate-500 border-b border-slate-200 dark:border-slate-800 uppercase font-semibold text-xs tracking-wider">
                            <th className="pb-3">SKU / Barcode</th>
                            <th className="pb-3">Product Name</th>
                            <th className="pb-3">Category</th>
                            <th className="pb-3 text-right">Unit Price</th>
                            <th className="pb-3 text-center">Quantity</th>
                            <th className="pb-3 text-right">Total Price</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                          {order.items.map((item, idx) => (
                            <tr key={idx} className="text-slate-700 dark:text-slate-300">
                              <td className="py-4 font-mono text-xs">{item.sku}</td>
                              <td className="py-4 font-medium">{item.name}</td>
                              <td className="py-4 text-slate-500 dark:text-slate-400">{item.category}</td>
                              <td className="py-4 text-right">${item.unit_price.toFixed(2)}</td>
                              <td className="py-4 text-center">{item.quantity}</td>
                              <td className="py-4 text-right font-semibold text-slate-800 dark:text-slate-200">
                                ${item.total_price.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
