import { useEffect, useState } from "react";

export default function AnalyticsPage() {
  const [period, setPeriod] = useState("daily");
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    fetch(`/api/analytics?period=${period}`)
      .then((res) => res.json())
      .then((payload) => setData(payload.data || []))
      .catch(() => setData([]));
  }, [period]);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Analytics</h2>
        <p className="mt-2 text-slate-600">View revenue and sales performance by period.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <label className="block text-sm font-medium text-slate-700">Period</label>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3"
          >
            <option value="daily">Daily</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
            <option value="historical">Historical</option>
          </select>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <h3 className="text-lg font-medium">Results</h3>
          <div className="mt-4 space-y-3">
            {data.length ? (
              data.map((entry) => (
                <div key={entry.period || entry.invoice_number} className="rounded-2xl border border-slate-200 p-4">
                  <p className="font-semibold">{entry.period ?? entry.invoice_number}</p>
                  <p className="text-slate-600">Revenue: ${entry.revenue ?? entry.total_amount}</p>
                </div>
              ))
            ) : (
              <p className="text-slate-500">No analytics available for this period.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
