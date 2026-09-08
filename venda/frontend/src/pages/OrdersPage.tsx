import { useEffect, useState } from "react";
import { useCurrency } from "../context/CurrencyContext";
import RefundModal, { RefundOrderItem } from "../components/RefundModal";
import CreditProcessModal from "../components/CreditProcessModal";
import ViewCreditsModal from "../components/ViewCreditsModal";
import { fetchStoreBranding, printBrandingFooterHtml, printBrandingHeaderHtml } from "../components/creditsShared";

interface OrderItem extends RefundOrderItem {
  sku: string;
  name: string;
  description: string;
  category: string;
  unit_price: number;
  quantity: number;
  total_price: number;
  is_bulk?: boolean;
  bulk_units?: number;
  bulk_quantity?: number;
  is_refunded?: boolean;
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

function OrderItemsModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const { formatPrice } = useCurrency();
  const [printing, setPrinting] = useState(false);

  const handlePrint = async () => {
    const branding = await fetchStoreBranding();
    const footerHtml = printBrandingFooterHtml(branding);
    setPrinting(true);
    const itemsHtml = order.items
      .map(
        (it) =>
          `<tr style="border-bottom:1px solid #e2e8f0;">
             <td style="padding:6px 8px;text-align:left;font-size:13px;">${it.name}${it.is_bulk ? " (BULK)" : ""}</td>
             <td style="padding:6px 8px;text-align:center;font-size:13px;">${it.is_bulk && (it.bulk_units ?? 0) > 0 ? `${it.bulk_units} × bulk` : it.quantity}</td>
             <td style="padding:6px 8px;text-align:right;font-size:13px;">${formatPrice(it.is_bulk && it.bulk_quantity ? it.unit_price * it.bulk_quantity : it.unit_price)}</td>
             <td style="padding:6px 8px;text-align:right;font-size:13px;">${formatPrice(it.total_price)}</td>
           </tr>`
      )
      .join("");
    const win = window.open("", "_blank", "width=500,height=600");
    if (!win) {
      setPrinting(false);
      return;
    }
    win.document.write(`<html><head><title>Order ${order.invoice_number}</title></head><body>
      <div style="font-family:Arial,sans-serif;padding:24px;border:2px solid #0F172A;border-radius:12px;max-width:440px;margin:auto;">
        <div style="text-align:center;border-bottom:2px solid #0F172A;padding-bottom:12px;">
          ${printBrandingHeaderHtml(branding.storeLogo)}
          <div style="font-size:12px;color:#475569;letter-spacing:1px;">${branding.storeName}</div>
          <h2 style="margin:6px 0 0;font-size:20px;">ORDER ITEMS</h2>
        </div>
        <div style="padding:12px 0;">
          <p style="margin:2px 0;font-size:13px;"><strong>Reference:</strong> ${order.invoice_number}</p>
          <p style="margin:2px 0;font-size:13px;"><strong>Date:</strong> ${new Date(order.timestamp).toLocaleString()}</p>
          <p style="margin:2px 0;font-size:13px;"><strong>Cashier:</strong> ${order.cashier_name} (ID: ${order.cashier_id})</p>
          <p style="margin:2px 0;font-size:13px;"><strong>Payment:</strong> ${order.payment_method}</p>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="background:#f1f5f9;">
            <th style="padding:6px 8px;text-align:left;">Item</th>
            <th style="padding:6px 8px;text-align:center;">Qty</th>
            <th style="padding:6px 8px;text-align:right;">Price</th>
            <th style="padding:6px 8px;text-align:right;">Total</th>
          </tr></thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        <div style="margin-top:12px;border-top:2px solid #0F172A;padding-top:10px;">
          <p style="margin:2px 0;font-size:15px;text-align:right;"><strong>Total:</strong> ${formatPrice(order.total_amount)}</p>
        </div>
        ${footerHtml}
      </div></body></html>`);
    win.document.close();
    win.print();
    setPrinting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Order Items</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              disabled={printing}
              className="rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-semibold transition-colors"
            >
              {printing ? "Printing..." : "🖨️ Print"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4 text-sm">
          <div>
            <p className="text-xs text-slate-400">Reference</p>
            <p className="font-mono font-semibold text-slate-800 dark:text-white">{order.invoice_number}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Payment</p>
            <p className="font-semibold text-slate-800 dark:text-white">{order.payment_method}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Cashier</p>
            <p className="font-semibold text-slate-800 dark:text-white">{order.cashier_name}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Date</p>
            <p className="font-semibold text-slate-800 dark:text-white">{new Date(order.timestamp).toLocaleString()}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="text-slate-400 dark:text-slate-500 border-b border-slate-200 dark:border-slate-800 uppercase font-semibold text-xs tracking-wider">
                <th className="pb-3">SKU / Barcode</th>
                <th className="pb-3">Product Name</th>
                <th className="pb-3 text-right">Unit Price</th>
                <th className="pb-3 text-center">Quantity</th>
                <th className="pb-3 text-right">Total Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {order.items.map((item, idx) => (
                <tr key={idx} className="text-slate-700 dark:text-slate-300">
                  <td className="py-3 font-mono text-xs">{item.sku}</td>
                  <td className="py-3 font-medium">
                    <span>{item.name}</span>
                    {item.is_bulk && (
                      <span className="ml-1.5 rounded-md bg-sky-100 dark:bg-sky-950/50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-600 dark:text-sky-400">
                        Bulk
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-right">
                    {item.is_bulk && item.bulk_quantity ? formatPrice(item.unit_price * item.bulk_quantity) : formatPrice(item.unit_price)}
                  </td>
                  <td className="py-3 text-center">
                    {item.is_bulk && (item.bulk_units ?? 0) > 0 ? `${item.bulk_units} × bulk` : item.quantity}
                  </td>
                  <td className="py-3 text-right font-semibold text-slate-800 dark:text-slate-200">{formatPrice(item.total_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex justify-end text-right">
          <div>
            <div className="text-sm text-slate-500 dark:text-slate-400">
              {order.items.reduce((acc, it) => acc + it.quantity, 0)} item(s)
            </div>
            <div className="text-lg font-bold text-slate-800 dark:text-slate-100">{formatPrice(order.total_amount)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OrdersPage() {
  const { formatPrice } = useCurrency();
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [refundItem, setRefundItem] = useState<{ orderId: number; item: OrderItem } | null>(null);
  const [creditProcessOpen, setCreditProcessOpen] = useState(false);
  const [viewCreditsOpen, setViewCreditsOpen] = useState(false);
  const [viewCreditsRefresh, setViewCreditsRefresh] = useState(0);
  const [printOrder, setPrintOrder] = useState<Order | null>(null);

  const fetchOrders = () => {
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
  };

  useEffect(() => {
    fetchOrders();
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
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setCreditProcessOpen(true)}
            className="rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-semibold px-4 py-3 transition-colors"
          >
            💳 Credit Process
          </button>
          <button
            type="button"
            onClick={() => {
              setViewCreditsRefresh((k) => k + 1);
              setViewCreditsOpen(true);
            }}
            className="rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-medium px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            👁️ View Credit
          </button>
          <div className="text-sm text-slate-500 dark:text-slate-400 font-medium">
            Showing {filteredOrders.length} order{filteredOrders.length !== 1 && "s"}
          </div>
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
                        {formatPrice(order.total_amount)}
                      </div>
                      <div className="text-xs text-slate-400 dark:text-slate-500">
                        {order.items.reduce((acc, it) => acc + it.quantity, 0)} item(s)
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPrintOrder(order);
                      }}
                      className="rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold px-3 py-2 transition-colors"
                    >
                      View & Print
                    </button>
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
                            <th className="pb-3">Description</th>
                            <th className="pb-3">Category</th>
                            <th className="pb-3 text-right">Unit Price</th>
                            <th className="pb-3 text-center">Quantity</th>
                            <th className="pb-3 text-right">Total Price</th>
                            <th className="pb-3 text-center">Refund</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                          {order.items.map((item, idx) => (
                            <tr key={idx} className="text-slate-700 dark:text-slate-300">
                              <td className="py-4 font-mono text-xs">{item.sku}</td>
                              <td className="py-4 font-medium">
                                <div className="flex items-center gap-2">
                                  <span>{item.name}</span>
                                  {item.is_bulk && (
                                    <span className="shrink-0 rounded-md bg-sky-100 dark:bg-sky-950/50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-600 dark:text-sky-400">
                                      Bulk
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-4 text-xs text-slate-500 dark:text-slate-400 max-w-[200px] truncate">{item.description || "—"}</td>
                              <td className="py-4 text-slate-500 dark:text-slate-400">{item.category}</td>
                              <td className="py-4 text-right">
                                {item.is_bulk && item.bulk_quantity
                                  ? formatPrice(item.unit_price * item.bulk_quantity)
                                  : formatPrice(item.unit_price)}
                              </td>
                              <td className="py-4 text-center">
                                {item.is_bulk && (item.bulk_units ?? 0) > 0
                                  ? `${item.bulk_units} × bulk`
                                  : item.quantity}
                              </td>
                              <td className="py-4 text-right font-semibold text-slate-800 dark:text-slate-200">
                                {formatPrice(item.total_price)}
                              </td>
                              <td className="py-4 text-center">
                                {order.payment_method !== "Refund" &&
                                  order.payment_method !== "Store Credit" &&
                                  item.refundable &&
                                  item.sale_item_id != null && (
                                    item.is_refunded ? (
                                      <span className="rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 text-xs font-semibold px-3 py-1.5 cursor-not-allowed">
                                        Refunded
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setRefundItem({ orderId: order.id, item })}
                                        className="rounded-full bg-red-50 dark:bg-red-950/40 text-red-500 dark:text-red-400 text-xs font-semibold px-3 py-1.5 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                                      >
                                        Refund
                                      </button>
                                    )
                                  )}
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

      {refundItem && (
        <RefundModal
          orderId={refundItem.orderId}
          item={refundItem.item}
          onClose={() => setRefundItem(null)}
          onRefunded={fetchOrders}
        />
      )}

      {creditProcessOpen && (
        <CreditProcessModal
          onClose={() => setCreditProcessOpen(false)}
          onClaimed={() => {
            setViewCreditsRefresh((k) => k + 1);
            fetchOrders();
          }}
        />
      )}

      {viewCreditsOpen && (
        <ViewCreditsModal
          refreshKey={viewCreditsRefresh}
          onClose={() => setViewCreditsOpen(false)}
        />
      )}

      {printOrder && (
        <OrderItemsModal order={printOrder} onClose={() => setPrintOrder(null)} />
      )}
    </div>
  );
}
