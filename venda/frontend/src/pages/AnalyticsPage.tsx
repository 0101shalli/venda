import { useEffect, useState } from "react";

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

export default function AnalyticsPage() {
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

  useEffect(() => {
    fetch("/api/analytics/detailed")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch detailed analytics");
        return res.json();
      })
      .then((payload) => {
        setData(payload);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const showTooltip = (e: React.MouseEvent, title: string, value: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const parentRect = e.currentTarget.parentElement?.getBoundingClientRect();
    const x = rect.left - (parentRect?.left || 0) + rect.width / 2;
    const y = rect.top - (parentRect?.top || 0) - 10;
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

  // Calculate high-level metrics
  const totalRevenue = data.revenue_trends.reduce((sum, item) => sum + item.revenue, 0);
  const totalItemsSold = data.items_sold.reduce((sum, item) => sum + item.quantity, 0);
  const currentValuation = data.inventory_history[data.inventory_history.length - 1]?.value || 0;
  const topHour = data.peak_hours.reduce((max, h) => (h.orders > max.orders ? h : max), { hour: 0, orders: 0 });

  return (
    <div className="space-y-6 pb-12 relative">
      {/* Tooltip component */}
      {tooltip.show && (
        <div
          className="absolute z-50 pointer-events-none rounded-xl bg-slate-900/95 dark:bg-slate-950/95 text-white px-3 py-2 text-xs shadow-xl border border-slate-700/50 backdrop-blur-sm -translate-x-1/2 -translate-y-full transition-all duration-100 font-medium"
          style={{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }}
        >
          <div className="text-slate-400 font-normal">{tooltip.title}</div>
          <div className="text-[13px] font-bold text-sky-400 mt-0.5">{tooltip.value}</div>
        </div>
      )}

      {/* Header */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm border border-slate-200 dark:border-slate-800">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Interactive Analytics</h2>
        <p className="mt-2 text-slate-500 dark:text-slate-400">
          Analyze sales performance, hourly peak traffic, inventory trends, and product performance.
        </p>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm border border-slate-200 dark:border-slate-800">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">30-Day Revenue</p>
          <p className="mt-2 text-3xl font-black text-slate-800 dark:text-slate-100">${totalRevenue.toFixed(2)}</p>
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
          <p className="mt-2 text-3xl font-black text-slate-800 dark:text-slate-100">${currentValuation.toFixed(2)}</p>
        </div>
      </div>

      {/* Charts Layout */}
      <div className="grid gap-6 lg:grid-cols-2">
        
        {/* 1. Revenue Trends Line Chart */}
        <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm border border-slate-200 dark:border-slate-800 relative">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">Revenue Trends (Last 30 Days)</h3>
          <div className="w-full aspect-[2.2/1]">
            <RevenueTrendsChart trends={data.revenue_trends} onHover={showTooltip} onLeave={hideTooltip} />
          </div>
        </div>

        {/* 2. Top Selling Products Horizontal Bar Chart */}
        <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm border border-slate-200 dark:border-slate-800">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">Top-Selling Products</h3>
          <div className="w-full aspect-[2.2/1]">
            <TopProductsChart products={data.items_sold} onHover={showTooltip} onLeave={hideTooltip} />
          </div>
        </div>

        {/* 3. Daily Peak Hours Bar Chart */}
        <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm border border-slate-200 dark:border-slate-800">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">Daily Peak Sales Hours</h3>
          <div className="w-full aspect-[2.2/1]">
            <PeakHoursChart hours={data.peak_hours} onHover={showTooltip} onLeave={hideTooltip} />
          </div>
        </div>

        {/* 4. Seasonal Sales Area Chart */}
        <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm border border-slate-200 dark:border-slate-800">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">Monthly Seasonal Sales</h3>
          <div className="w-full aspect-[2.2/1]">
            <SeasonalSalesChart sales={data.seasonal_sales} onHover={showTooltip} onLeave={hideTooltip} />
          </div>
        </div>

        {/* 5. Inventory Valuation Chart */}
        <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm border border-slate-200 dark:border-slate-800 lg:col-span-2">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">7-Day Inventory Valuation Trend</h3>
          <div className="w-full aspect-[3.5/1]">
            <InventoryValuationChart history={data.inventory_history} onHover={showTooltip} onLeave={hideTooltip} />
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
}: {
  trends: RevenueTrend[];
  onHover: (e: React.MouseEvent, title: string, value: string) => void;
  onLeave: () => void;
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

  // Make coordinates
  const points = trends.map((t, idx) => {
    const x = paddingLeft + (idx / (trends.length - 1)) * chartW;
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
      
      {/* Grid Lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((r, i) => {
        const y = paddingTop + chartH * r;
        const val = maxVal - r * range;
        return (
          <g key={i}>
            <line x1={paddingLeft} y1={y} x2={w - paddingRight} y2={y} stroke="#334155" strokeDasharray="3 3" opacity="0.2" />
            <text x={paddingLeft - 10} y={y + 4} textAnchor="end" className="text-[10px] fill-slate-400 font-semibold">
              ${val.toFixed(0)}
            </text>
          </g>
        );
      })}

      {/* Areas & Lines */}
      {points.length > 0 && (
        <>
          <path d={areaD} fill="url(#revGrad)" />
          <path d={lineD} fill="none" stroke="#0ea5e9" strokeWidth="2.5" strokeLinecap="round" />
        </>
      )}

      {/* Dots for interaction */}
      {points.map((p, idx) => (
        <circle
          key={idx}
          cx={p.x}
          cy={p.y}
          r="4.5"
          className="fill-sky-500 stroke-white dark:stroke-slate-900 cursor-pointer hover:r-6 hover:fill-sky-400 transition-all duration-150"
          strokeWidth="1.5"
          onMouseEnter={(e) => onHover(e, new Date(p.data.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }), `$${p.data.revenue.toFixed(2)}`)}
          onMouseLeave={onLeave}
        />
      ))}

      {/* Bottom Axis Label (Only first, middle, last to avoid crowding) */}
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
            {/* Label */}
            <text
              x={labelWidth - 10}
              y={y + barHeight / 2 + 4}
              textAnchor="end"
              className="text-[11px] fill-slate-700 dark:fill-slate-300 font-bold truncate"
            >
              {p.name.length > 12 ? p.name.substring(0, 10) + "..." : p.name}
            </text>

            {/* Bar */}
            <rect
              x={labelWidth}
              y={y}
              width={barWidth}
              height={barHeight}
              rx="4"
              fill="url(#barGrad)"
              className="cursor-pointer hover:opacity-90 transition-opacity"
              onMouseEnter={(e) => onHover(e, p.name, `${p.quantity} items sold`)}
              onMouseLeave={onLeave}
            />

            {/* Count text */}
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

      {/* Grid Lines */}
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

        // Label formatting: show label every 3 hours to avoid crowd
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
              className="cursor-pointer hover:opacity-90 transition-opacity"
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
}: {
  sales: SeasonalSale[];
  onHover: (e: React.MouseEvent, title: string, value: string) => void;
  onLeave: () => void;
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

  // Calculate bezier curves for smooth layout
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

      {/* Grid Lines */}
      {[0, 0.5, 1].map((r, i) => {
        const y = paddingTop + chartH * r;
        const val = maxVal - r * range;
        return (
          <g key={i}>
            <line x1={paddingLeft} y1={y} x2={w - paddingRight} y2={y} stroke="#334155" strokeDasharray="3 3" opacity="0.15" />
            <text x={paddingLeft - 10} y={y + 4} textAnchor="end" className="text-[10px] fill-slate-400 font-semibold">
              ${val.toFixed(0)}
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

      {/* Smooth nodes */}
      {points.map((p, idx) => (
        <circle
          key={idx}
          cx={p.x}
          cy={p.y}
          r="4.5"
          className="fill-amber-500 stroke-white dark:stroke-slate-900 cursor-pointer hover:r-6 hover:fill-amber-400 transition-all duration-150"
          strokeWidth="1.5"
          onMouseEnter={(e) => onHover(e, p.data.month, `$${p.data.revenue.toFixed(2)}`)}
          onMouseLeave={onLeave}
        />
      ))}

      {/* Bottom Labels */}
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
}: {
  history: InventoryHistory[];
  onHover: (e: React.MouseEvent, title: string, value: string) => void;
  onLeave: () => void;
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

      {/* Grid Lines */}
      {[0, 0.5, 1].map((r, i) => {
        const y = paddingTop + chartH * r;
        const val = maxVal - r * range;
        return (
          <g key={i}>
            <line x1={paddingLeft} y1={y} x2={w - paddingRight} y2={y} stroke="#334155" strokeDasharray="3 3" opacity="0.15" />
            <text x={paddingLeft - 12} y={y + 4} textAnchor="end" className="text-[10px] fill-slate-400 font-semibold">
              ${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}
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

      {/* Dots */}
      {points.map((p, idx) => (
        <circle
          key={idx}
          cx={p.x}
          cy={p.y}
          r="5"
          className="fill-emerald-500 stroke-white dark:stroke-slate-900 cursor-pointer hover:r-6 hover:fill-emerald-400 transition-all duration-150"
          strokeWidth="1.5"
          onMouseEnter={(e) => onHover(e, new Date(p.data.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }), `Valuation: $${p.data.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`)}
          onMouseLeave={onLeave}
        />
      ))}

      {/* Bottom Labels */}
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
