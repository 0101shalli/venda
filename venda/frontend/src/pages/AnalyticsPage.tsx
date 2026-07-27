import { useEffect, useState, useMemo } from "react";
import { useCurrency } from "../context/CurrencyContext";

interface RevenueTrend {
  date: string;
  revenue: number;
}

interface ItemSold {
  name: string;
  quantity: number;
}

interface PeakHour {
  hour: number;
  orders: number;
}

interface SeasonalSale {
  month: string;
  revenue: number;
}

interface InventoryHistory {
  date: string;
  value: number;
}

interface DetailedAnalytics {
  revenue_trends: RevenueTrend[];
  items_sold: ItemSold[];
  peak_hours: PeakHour[];
  seasonal_sales: SeasonalSale[];
  inventory_history: InventoryHistory[];
}

function exportToExcel(headers: string[], rows: (string | number)[][], filename: string) {
  const csvContent = [
    headers.join(","),
    ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")),
  ].join("\n");
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function printChartAsPdf(title: string, svgElement: Element | null) {
  if (!svgElement) return;
  const svgClone = svgElement.cloneNode(true) as SVGSVGElement;
  svgClone.setAttribute("width", "800");
  svgClone.setAttribute("height", "400");
  const svgString = new XMLSerializer().serializeToString(svgClone);
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
    <style>@page{size:landscape;margin:1cm}body{margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif}h1{font-size:18px;margin-bottom:8px;color:#1e293b}.chart-container{width:100%}svg{width:100%;height:auto}@media print{body{padding:0}}</style></head><body>
    <h1>${title}</h1><div class="chart-container">${svgString}</div>
    <script>window.onload=function(){window.print();window.close()}<\/script></body></html>`);
  printWindow.document.close();
}

function ChartTile({
  title,
  children,
  chartRef,
  exportHeaders,
  exportRows,
  exportFilename,
}: {
  title: string;
  children: React.ReactNode;
  chartRef: React.RefObject<HTMLDivElement>;
  exportHeaders: string[];
  exportRows: (string | number)[][];
  exportFilename: string;
}) {
  return (
    <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm border border-slate-200 dark:border-slate-800">
      <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">{title}</h3>
      <div className="w-full aspect-[2.2/1]" ref={chartRef}>
        {children}
      </div>
      <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
        <button
          onClick={() => exportToExcel(exportHeaders, exportRows, exportFilename)}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          Export Excel
        </button>
        <button
          onClick={() => printChartAsPdf(title, chartRef.current?.querySelector("svg") || null)}
          className="flex items-center gap-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
          Print PDF
        </button>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { formatPrice, currencySymbol } = useCurrency();
  const [data, setData] = useState<DetailedAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    title: string;
    value: string;
    show: boolean;
  }>({ x: 0, y: 0, title: "", value: "", show: false });

  const chartRefs = {
    revenue: useMemo(() => ({ current: null as HTMLDivElement | null }), []),
    products: useMemo(() => ({ current: null as HTMLDivElement | null }), []),
    hours: useMemo(() => ({ current: null as HTMLDivElement | null }), []),
    seasonal: useMemo(() => ({ current: null as HTMLDivElement | null }), []),
    inventory: useMemo(() => ({ current: null as HTMLDivElement | null }), []),
  };

  useEffect(() => {
    fetch("/api/analytics/detailed")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch detailed analytics");
        return res.json();
      })
      .then((payload) => {
        const mappedData: DetailedAnalytics = {
          revenue_trends: (payload.sales_changes || []).map((item: any) => ({
            date: item.date,
            revenue: Number(item.revenue || 0),
          })),
          items_sold: (payload.top_products || []).map((item: any) => ({
            name: item.name || "Unknown Product",
            quantity: Number(item.quantity || 0),
          })),
          peak_hours: (payload.daily_peak_hours || []).map((item: any) => ({
            hour: Number(item.hour || 0),
            orders: Number(item.count || 0),
          })),
          seasonal_sales: (payload.seasonal_sales || []).map((item: any) => ({
            month: item.month,
            revenue: Number(item.revenue || 0),
          })),
          inventory_history: (payload.daily_inventory || []).map((item: any) => ({
            date: item.date,
            value: Number(item.stock || 0),
          })),
        };
        setData(mappedData);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const showTooltip = (e: React.MouseEvent, title: string, value: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const parentRect = e.currentTarget.closest(".chart-container, [class*='aspect-']")?.getBoundingClientRect();
    if (!parentRect) return;
    const x = rect.left - parentRect.left + rect.width / 2;
    const y = rect.top - parentRect.top - 10;
    setTooltip({ x, y, title, value, show: true });
  };

  const hideTooltip = () => {
    setTooltip((prev) => ({ ...prev, show: false }));
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-40">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600 dark:border-t-sky-500"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-3xl bg-rose-50 dark:bg-rose-950/20 p-8 text-center border border-rose-100 dark:border-rose-950">
        <p className="text-rose-600 dark:text-rose-400 font-medium">Error: {error || "No data available"}</p>
      </div>
    );
  }

  const totalRevenue = data.revenue_trends.reduce((sum, item) => sum + item.revenue, 0);
  const totalItemsSold = data.items_sold.reduce((sum, item) => sum + item.quantity, 0);
  const currentValuation = data.inventory_history[data.inventory_history.length - 1]?.value || 0;
  const topHour = data.peak_hours.reduce((max, h) => (h.orders > max.orders ? h : max), { hour: 0, orders: 0 });

  return (
    <div className="space-y-6 pb-12 relative">
      {tooltip.show && (
        <div
          className="absolute z-50 pointer-events-none rounded-xl bg-slate-900/95 dark:bg-slate-950/95 text-white px-3 py-2 text-xs shadow-xl border border-slate-700/50 backdrop-blur-sm -translate-x-1/2 -translate-y-full"
          style={{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }}
        >
          <div className="text-slate-400 font-normal">{tooltip.title}</div>
          <div className="text-[13px] font-bold text-sky-400 mt-0.5">{tooltip.value}</div>
        </div>
      )}

      <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm border border-slate-200 dark:border-slate-800">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Interactive Analytics</h2>
        <p className="mt-2 text-slate-500 dark:text-slate-400">
          Analyze sales performance, hourly peak traffic, inventory trends, and product performance.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm border border-slate-200 dark:border-slate-800">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">30-Day Revenue</p>
          <p className="mt-2 text-3xl font-black text-slate-800 dark:text-slate-100">{formatPrice(totalRevenue)}</p>
        </div>
        <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm border border-slate-200 dark:border-slate-800">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Items Sold</p>
          <p className="mt-2 text-3xl font-black text-slate-800 dark:text-slate-100">{totalItemsSold} pcs</p>
        </div>
        <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm border border-slate-200 dark:border-slate-800">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Peak hour</p>
          <p className="mt-2 text-3xl font-black text-slate-800 dark:text-slate-100">
            {topHour.hour}:00 <span className="text-sm font-medium text-slate-400">({topHour.orders} orders)</span>
          </p>
        </div>
        <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm border border-slate-200 dark:border-slate-800">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Inventory Valuation</p>
          <p className="mt-2 text-3xl font-black text-slate-800 dark:text-slate-100">{formatPrice(currentValuation)}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartTile
          title="Revenue Trends (Last 30 Days)"
          chartRef={chartRefs.revenue}
          exportHeaders={["Date", "Revenue"]}
          exportRows={data.revenue_trends.map((t) => [t.date, t.revenue])}
          exportFilename="revenue-trends"
        >
          <RevenueTrendsChart trends={data.revenue_trends} onHover={showTooltip} onLeave={hideTooltip} currencySymbol={currencySymbol} />
        </ChartTile>

        <ChartTile
          title="Top-Selling Products"
          chartRef={chartRefs.products}
          exportHeaders={["Product", "Quantity Sold"]}
          exportRows={data.items_sold.map((p) => [p.name, p.quantity])}
          exportFilename="top-products"
        >
          <TopProductsChart products={data.items_sold} onHover={showTooltip} onLeave={hideTooltip} />
        </ChartTile>

        <ChartTile
          title="Daily Peak Sales Hours"
          chartRef={chartRefs.hours}
          exportHeaders={["Hour", "Orders"]}
          exportRows={data.peak_hours.map((h) => [`${h.hour}:00`, h.orders])}
          exportFilename="peak-hours"
        >
          <PeakHoursChart hours={data.peak_hours} onHover={showTooltip} onLeave={hideTooltip} />
        </ChartTile>

        <ChartTile
          title="Monthly Seasonal Sales"
          chartRef={chartRefs.seasonal}
          exportHeaders={["Month", "Revenue"]}
          exportRows={data.seasonal_sales.map((s) => [s.month, s.revenue])}
          exportFilename="seasonal-sales"
        >
          <SeasonalSalesChart sales={data.seasonal_sales} onHover={showTooltip} onLeave={hideTooltip} currencySymbol={currencySymbol} />
        </ChartTile>

        <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm border border-slate-200 dark:border-slate-800 lg:col-span-2">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">7-Day Inventory Valuation Trend</h3>
          <div className="w-full aspect-[3.5/1]" ref={chartRefs.inventory}>
            <InventoryValuationChart history={data.inventory_history} onHover={showTooltip} onLeave={hideTooltip} currencySymbol={currencySymbol} />
          </div>
          <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={() => exportToExcel(["Date", "Value"], data.inventory_history.map((h) => [h.date, h.value]), "inventory-valuation")}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Export Excel
            </button>
            <button
              onClick={() => printChartAsPdf("7-Day Inventory Valuation Trend", chartRefs.inventory.current?.querySelector("svg") || null)}
              className="flex items-center gap-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              Print PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── CUSTOM SVG CHART COMPONENTS ──

function RevenueTrendsChart({
  trends,
  onHover,
  onLeave,
  currencySymbol,
}: {
  trends: RevenueTrend[];
  onHover: (e: React.MouseEvent, title: string, value: string) => void;
  onLeave: () => void;
  currencySymbol: string;
}) {
  const w = 600;
  const h = 250;
  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 25;
  const paddingBottom = 35;

  const chartW = w - paddingLeft - paddingRight;
  const chartH = h - paddingTop - paddingBottom;

  const maxVal = Math.max(...trends.map((t) => t.revenue), 100);
  const minVal = Math.min(...trends.map((t) => t.revenue), 0);
  const range = maxVal - minVal || 1;

  const points = trends.map((t, idx) => {
    const x = paddingLeft + (idx / Math.max(trends.length - 1, 1)) * chartW;
    const y = paddingTop + chartH - ((t.revenue - minVal) / range) * chartH;
    return { x, y, data: t };
  });

  const lineD = points.length
    ? `M ${points.map((p) => `${p.x} ${p.y}`).join(" L ")}`
    : "";

  const areaD = points.length
    ? `${lineD} L ${points[points.length - 1].x} ${paddingTop + chartH} L ${points[0].x} ${paddingTop + chartH} Z`
    : "";

  return (
    <svg className="w-full h-full" viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.0" />
        </linearGradient>
      </defs>
      
      {[0, 0.25, 0.5, 0.75, 1].map((r, i) => {
        const y = paddingTop + chartH * r;
        const val = maxVal - r * range;
        return (
          <g key={i}>
            <line x1={paddingLeft} y1={y} x2={w - paddingRight} y2={y} stroke="#334155" strokeDasharray="3 3" opacity="0.2" />
            <text x={paddingLeft - 10} y={y + 4} textAnchor="end" className="text-[10px] fill-slate-400 font-semibold">
              {currencySymbol}{val.toFixed(0)}
            </text>
          </g>
        );
      })}

      {points.length > 0 && (
        <>
          <path d={areaD} fill="url(#revGrad)" />
          <path d={lineD} fill="none" stroke="#0ea5e9" strokeWidth="2.5" strokeLinecap="round" />
        </>
      )}

      {points.map((p, idx) => (
        <circle
          key={idx}
          cx={p.x}
          cy={p.y}
          r="4.5"
          className="fill-sky-500 stroke-white dark:stroke-slate-900 cursor-pointer hover:fill-sky-400"
          strokeWidth="1.5"
          onMouseEnter={(e) => onHover(e, new Date(p.data.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }), `${currencySymbol}${p.data.revenue.toFixed(2)}`)}
          onMouseLeave={onLeave}
        />
      ))}

      {trends.length > 1 && (
        <>
          <text x={points[0].x} y={h - 10} textAnchor="start" className="text-[10px] fill-slate-400 font-semibold">
            {new Date(trends[0].date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </text>
          <text x={points[Math.floor(trends.length / 2)].x} y={h - 10} textAnchor="middle" className="text-[10px] fill-slate-400 font-semibold">
            {new Date(trends[Math.floor(trends.length / 2)].date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </text>
          <text x={points[trends.length - 1].x} y={h - 10} textAnchor="end" className="text-[10px] fill-slate-400 font-semibold">
            {new Date(trends[trends.length - 1].date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </text>
        </>
      )}
    </svg>
  );
}

function TopProductsChart({
  products,
  onHover,
  onLeave,
}: {
  products: ItemSold[];
  onHover: (e: React.MouseEvent, title: string, value: string) => void;
  onLeave: () => void;
}) {
  const w = 600;
  const h = 250;
  const labelWidth = 100;
  const paddingRight = 40;
  const paddingTop = 15;
  const paddingBottom = 15;

  const chartW = w - labelWidth - paddingRight;
  const maxVal = Math.max(...products.map((p) => p.quantity), 1);
  const rowHeight = (h - paddingTop - paddingBottom) / Math.max(products.length, 1);

  return (
    <svg className="w-full h-full" viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#818CF8" />
        </linearGradient>
      </defs>

      {products.map((p, idx) => {
        const barWidth = (p.quantity / maxVal) * chartW;
        const y = paddingTop + idx * rowHeight;
        const barHeight = Math.max(rowHeight - 12, 10);

        return (
          <g key={idx}>
            <text
              x={labelWidth - 10}
              y={y + barHeight / 2 + 4}
              textAnchor="end"
              className="text-[11px] fill-slate-700 dark:fill-slate-300 font-bold truncate"
            >
              {p.name.length > 12 ? p.name.substring(0, 10) + "..." : p.name}
            </text>
            <rect
              x={labelWidth}
              y={y}
              width={barWidth}
              height={barHeight}
              rx="4"
              fill="url(#barGrad)"
              className="cursor-pointer hover:opacity-80"
              onMouseEnter={(e) => onHover(e, p.name, `${p.quantity} items sold`)}
              onMouseLeave={onLeave}
            />
            <text
              x={labelWidth + barWidth + 8}
              y={y + barHeight / 2 + 4}
              className="text-[10px] fill-slate-400 font-bold"
            >
              {p.quantity}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function PeakHoursChart({
  hours,
  onHover,
  onLeave,
}: {
  hours: PeakHour[];
  onHover: (e: React.MouseEvent, title: string, value: string) => void;
  onLeave: () => void;
}) {
  const w = 600;
  const h = 250;
  const paddingLeft = 40;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 35;

  const chartW = w - paddingLeft - paddingRight;
  const chartH = h - paddingTop - paddingBottom;

  const maxVal = Math.max(...hours.map((h) => h.orders), 1);
  const barWidth = (chartW / Math.max(hours.length, 1)) * 0.7;
  const step = chartW / Math.max(hours.length, 1);

  return (
    <svg className="w-full h-full" viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient id="colGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10B981" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>

      {[0, 0.5, 1].map((r, i) => {
        const y = paddingTop + chartH * r;
        const val = maxVal - r * maxVal;
        return (
          <g key={i}>
            <line x1={paddingLeft} y1={y} x2={w - paddingRight} y2={y} stroke="#334155" strokeDasharray="3 3" opacity="0.15" />
            <text x={paddingLeft - 10} y={y + 4} textAnchor="end" className="text-[10px] fill-slate-400 font-semibold">
              {val.toFixed(0)}
            </text>
          </g>
        );
      })}

      {hours.map((item, idx) => {
        const barHeight = (item.orders / maxVal) * chartH;
        const x = paddingLeft + idx * step + (step - barWidth) / 2;
        const y = paddingTop + chartH - barHeight;
        const showLabel = idx % 3 === 0;

        return (
          <g key={idx}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx="3"
              fill="url(#colGrad)"
              className="cursor-pointer hover:opacity-80"
              onMouseEnter={(e) => onHover(e, `${item.hour}:00 - Hour`, `${item.orders} orders placed`)}
              onMouseLeave={onLeave}
            />
            {showLabel && (
              <text x={x + barWidth / 2} y={h - 12} textAnchor="middle" className="text-[10px] fill-slate-400 font-semibold">
                {item.hour}h
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function SeasonalSalesChart({
  sales,
  onHover,
  onLeave,
  currencySymbol,
}: {
  sales: SeasonalSale[];
  onHover: (e: React.MouseEvent, title: string, value: string) => void;
  onLeave: () => void;
  currencySymbol: string;
}) {
  const w = 600;
  const h = 250;
  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 25;
  const paddingBottom = 35;

  const chartW = w - paddingLeft - paddingRight;
  const chartH = h - paddingTop - paddingBottom;

  const maxVal = Math.max(...sales.map((s) => s.revenue), 100);
  const minVal = 0;
  const range = maxVal - minVal;

  const points = sales.map((s, idx) => {
    const x = paddingLeft + (idx / Math.max(sales.length - 1, 1)) * chartW;
    const y = paddingTop + chartH - ((s.revenue - minVal) / range) * chartH;
    return { x, y, data: s };
  });

  let linePath = "";
  if (points.length > 0) {
    linePath = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const cpX1 = points[i].x + (points[i + 1].x - points[i].x) / 2;
      const cpY1 = points[i].y;
      const cpX2 = points[i].x + (points[i + 1].x - points[i].x) / 2;
      const cpY2 = points[i + 1].y;
      linePath += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${points[i + 1].x} ${points[i + 1].y}`;
    }
  }

  const areaPath = points.length
    ? `${linePath} L ${points[points.length - 1].x} ${paddingTop + chartH} L ${points[0].x} ${paddingTop + chartH} Z`
    : "";

  return (
    <svg className="w-full h-full" viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.0" />
        </linearGradient>
      </defs>

      {[0, 0.5, 1].map((r, i) => {
        const y = paddingTop + chartH * r;
        const val = maxVal - r * range;
        return (
          <g key={i}>
            <line x1={paddingLeft} y1={y} x2={w - paddingRight} y2={y} stroke="#334155" strokeDasharray="3 3" opacity="0.15" />
            <text x={paddingLeft - 10} y={y + 4} textAnchor="end" className="text-[10px] fill-slate-400 font-semibold">
              {currencySymbol}{val.toFixed(0)}
            </text>
          </g>
        );
      })}

      {points.length > 0 && (
        <>
          <path d={areaPath} fill="url(#areaGrad)" />
          <path d={linePath} fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" />
        </>
      )}

      {points.map((p, idx) => (
        <circle
          key={idx}
          cx={p.x}
          cy={p.y}
          r="4.5"
          className="fill-amber-500 stroke-white dark:stroke-slate-900 cursor-pointer hover:fill-amber-400"
          strokeWidth="1.5"
          onMouseEnter={(e) => onHover(e, p.data.month, `${currencySymbol}${p.data.revenue.toFixed(2)}`)}
          onMouseLeave={onLeave}
        />
      ))}

      {sales.map((item, idx) => {
        const x = paddingLeft + (idx / Math.max(sales.length - 1, 1)) * chartW;
        return (
          <text key={idx} x={x} y={h - 10} textAnchor="middle" className="text-[10px] fill-slate-400 font-semibold">
            {item.month.substring(0, 3)}
          </text>
        );
      })}
    </svg>
  );
}

function InventoryValuationChart({
  history,
  onHover,
  onLeave,
  currencySymbol,
}: {
  history: InventoryHistory[];
  onHover: (e: React.MouseEvent, title: string, value: string) => void;
  onLeave: () => void;
  currencySymbol: string;
}) {
  const w = 900;
  const h = 220;
  const paddingLeft = 55;
  const paddingRight = 20;
  const paddingTop = 25;
  const paddingBottom = 35;

  const chartW = w - paddingLeft - paddingRight;
  const chartH = h - paddingTop - paddingBottom;

  const maxVal = Math.max(...history.map((h) => h.value), 1000);
  const minVal = Math.min(...history.map((h) => h.value), 0);
  const range = maxVal - minVal || 1;

  const points = history.map((item, idx) => {
    const x = paddingLeft + (idx / Math.max(history.length - 1, 1)) * chartW;
    const y = paddingTop + chartH - ((item.value - minVal) / range) * chartH;
    return { x, y, data: item };
  });

  const lineD = points.length
    ? `M ${points.map((p) => `${p.x} ${p.y}`).join(" L ")}`
    : "";

  const areaD = points.length
    ? `${lineD} L ${points[points.length - 1].x} ${paddingTop + chartH} L ${points[0].x} ${paddingTop + chartH} Z`
    : "";

  return (
    <svg className="w-full h-full" viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient id="invGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10B981" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
        </linearGradient>
      </defs>

      {[0, 0.5, 1].map((r, i) => {
        const y = paddingTop + chartH * r;
        const val = maxVal - r * range;
        return (
          <g key={i}>
            <line x1={paddingLeft} y1={y} x2={w - paddingRight} y2={y} stroke="#334155" strokeDasharray="3 3" opacity="0.15" />
            <text x={paddingLeft - 12} y={y + 4} textAnchor="end" className="text-[10px] fill-slate-400 font-semibold">
              {currencySymbol}{val.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </text>
          </g>
        );
      })}

      {points.length > 0 && (
        <>
          <path d={areaD} fill="url(#invGrad)" />
          <path d={lineD} fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" />
        </>
      )}

      {points.map((p, idx) => (
        <circle
          key={idx}
          cx={p.x}
          cy={p.y}
          r="5"
          className="fill-emerald-500 stroke-white dark:stroke-slate-900 cursor-pointer hover:fill-emerald-400"
          strokeWidth="1.5"
          onMouseEnter={(e) => onHover(e, new Date(p.data.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }), `Valuation: ${currencySymbol}${p.data.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`)}
          onMouseLeave={onLeave}
        />
      ))}

      {history.map((item, idx) => {
        const x = paddingLeft + (idx / Math.max(history.length - 1, 1)) * chartW;
        return (
          <text key={idx} x={x} y={h - 10} textAnchor="middle" className="text-[10px] fill-slate-400 font-semibold">
            {new Date(item.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </text>
        );
      })}
    </svg>
  );
}
