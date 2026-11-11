import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "../context/LanguageContext";

interface Gateway {
  id: string;
  gateway_name: string;
  provider_label: string;
  is_active: boolean;
  environment: "sandbox" | "live";
  api_user: string;
  has_api_key: boolean;
  has_webhook_secret: boolean;
  master_phone_number: string;
  bank_name: string;
  bank_account_number: string;
  base_url: string;
  is_manual: boolean;
  webhook_endpoint: string;
  created_at: string | null;
  updated_at: string | null;
}

interface Provider {
  id: string;
  label: string;
  is_manual: boolean;
}

interface FormState {
  gateway_name: string;
  environment: "sandbox" | "live";
  api_user: string;
  api_key: string;
  webhook_secret: string;
  master_phone_number: string;
  bank_name: string;
  bank_account_number: string;
  base_url: string;
}

const EMPTY_FORM: FormState = {
  gateway_name: "",
  environment: "sandbox",
  api_user: "",
  api_key: "",
  webhook_secret: "",
  master_phone_number: "",
  bank_name: "",
  bank_account_number: "",
  base_url: "",
};

function readError(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object" && "message" in detail) {
    return String((detail as { message: unknown }).message);
  }
  return "";
}

function Toggle({ on, disabled, onClick }: { on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      disabled={disabled}
      className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors disabled:opacity-50 ${
        on ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"
      }`}
    >
      <span
        className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-7" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function StatusPill({ active, onLabel, offLabel }: { active: boolean; onLabel: string; offLabel: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
        active
          ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
          : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
      }`}
    >
      {active ? <span className="text-[10px] uppercase">●</span> : null}
      <span className="ml-1">{active ? onLabel : offLabel}</span>
    </span>
  );
}

export default function MobilePaymentSettings() {
  const { t } = useLanguage();
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [editing, setEditing] = useState<Gateway | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [gwRes, provRes] = await Promise.all([
        fetch("/api/payment-gateways"),
        fetch("/api/payment-gateways/providers"),
      ]);
      const gwBody = await gwRes.json();
      const provBody = await provRes.json();
      if (!gwRes.ok) {
        setNotice({ type: "error", text: readError(gwBody) });
        return;
      }
      setGateways(gwBody.gateways ?? []);
      setProviders(provBody.providers ?? []);
    } catch {
      setNotice({ type: "error", text: "Could not load payment gateways" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openEdit = (gw: Gateway) => {
    setEditing(gw);
    setCreating(false);
    setForm({
      gateway_name: gw.gateway_name,
      environment: gw.environment || "sandbox",
      api_user: gw.api_user,
      api_key: "",
      webhook_secret: "",
      master_phone_number: gw.master_phone_number,
      bank_name: gw.bank_name,
      bank_account_number: gw.bank_account_number,
      base_url: gw.base_url,
    });
    setNotice(null);
  };

  const openCreate = () => {
    setEditing(null);
    setCreating(true);
    setForm({ ...EMPTY_FORM, gateway_name: providers[0]?.id ?? "" });
    setNotice(null);
  };

  const closeModal = () => {
    setEditing(null);
    setCreating(false);
  };

  const save = async () => {
    setSaving(true);
    setNotice(null);
    const body: Record<string, unknown> = {
      gateway_name: form.gateway_name,
      environment: form.environment,
      api_user: form.api_user,
      master_phone_number: form.master_phone_number,
      bank_name: form.bank_name,
      bank_account_number: form.bank_account_number,
      base_url: form.base_url,
    };
    // Blank secrets keep whatever is already stored.
    if (form.api_key.trim()) body.api_key = form.api_key.trim();
    if (form.webhook_secret.trim()) body.webhook_secret = form.webhook_secret.trim();

    try {
      const res = await fetch(editing ? `/api/payment-gateways/${editing.id}` : "/api/payment-gateways", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const parsed = await res.json();
      if (!res.ok) {
        setNotice({ type: "error", text: readError(parsed) });
        return;
      }
      closeModal();
      setNotice({ type: "success", text: t("payments.saved") });
      await load();
    } catch {
      setNotice({ type: "error", text: "Could not save the gateway" });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (gw: Gateway) => {
    setBusyId(gw.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/payment-gateways/${gw.id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !gw.is_active }),
      });
      const parsed = await res.json();
      if (!res.ok) {
        setNotice({ type: "error", text: readError(parsed) });
        return;
      }
      setNotice({ type: "success", text: t("payments.toggled") });
      await load();
    } catch {
      setNotice({ type: "error", text: "Could not update the gateway" });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (gw: Gateway) => {
    if (!window.confirm(t("payments.confirmdelete"))) return;
    setBusyId(gw.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/payment-gateways/${gw.id}`, { method: "DELETE" });
      const parsed = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ type: "error", text: readError(parsed) });
        return;
      }
      setNotice({ type: "success", text: t("payments.deleted") });
      await load();
    } catch {
      setNotice({ type: "error", text: "Could not delete the gateway" });
    } finally {
      setBusyId(null);
    }
  };

  const configured = new Set(gateways.map((g) => g.gateway_name));
  const unconfigured = providers.filter((p) => !configured.has(p.id));
  const activeGateway = gateways.find((g) => g.is_active) ?? null;
  const modalOpen = creating || editing !== null;
  const selectedIsManual = form.gateway_name === "bank_transfer";

  return (
    <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t("settings.mobilepayments")}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("settings.mobilepayments.desc")}</p>
        </div>
        {unconfigured.length > 0 && (
          <button
            onClick={openCreate}
            className="rounded-xl bg-indigo-600 dark:bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 dark:hover:bg-sky-600 active:scale-95 transition-all shadow-sm"
          >
            {t("payments.add")} {unconfigured[0].label}
          </button>
        )}
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">{t("payments.onlyone")}</p>

      {notice && (
        <div
          className={`mb-4 rounded-xl border px-4 py-3 text-sm font-medium ${
            notice.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
              : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800"
          }`}
        >
          {notice.type === "success" ? "✓" : "✗"} {notice.text}
        </div>
      )}

      {!activeGateway && !loading && (
        <div className="mb-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          {t("payments.nogateway")}
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-sm text-slate-400">{t("common.loading")}</div>
      ) : (
        <div className="overflow-x-auto -mx-6 px-6">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500">
                <th className="py-3 pr-4 font-semibold">{t("payments.gateway")}</th>
                <th className="py-3 pr-4 font-semibold">{t("payments.environment")}</th>
                <th className="py-3 pr-4 font-semibold">{t("payments.usedfor")}</th>
                <th className="py-3 pr-4 font-semibold">{t("payments.status")}</th>
                <th className="py-3 pr-4 font-semibold text-right">{t("payments.configure")}</th>
              </tr>
            </thead>
            <tbody>
              {gateways.map((gw) => (
                <tr key={gw.id} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                  <td className="py-4 pr-4">
                    <div className="font-semibold text-slate-800 dark:text-slate-200">{gw.provider_label}</div>
                    <div className="text-xs text-slate-400 dark:text-slate-500 font-mono truncate max-w-[280px]" title={gw.webhook_endpoint}>
                      {gw.webhook_endpoint}
                    </div>
                  </td>
                  <td className="py-4 pr-4 text-slate-600 dark:text-slate-300">
                    {gw.environment === "live" ? t("payments.env.production") : t("payments.env.sandbox")}
                  </td>
                  <td className="py-4 pr-4 text-slate-600 dark:text-slate-300">
                    {gw.is_active ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">{t("sales.momo")}</span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">{t("payments.usedfor.none")}</span>
                    )}
                  </td>
                  <td className="py-4 pr-4">
                    <div className="flex items-center gap-3">
                      <StatusPill active={gw.is_active} onLabel={t("payments.enabled")} offLabel={t("payments.disabled")} />
                      <Toggle on={gw.is_active} disabled={busyId === gw.id} onClick={() => void toggle(gw)} />
                    </div>
                  </td>
                  <td className="py-4 pr-4 text-right whitespace-nowrap">
                    <button
                      onClick={() => openEdit(gw)}
                      className="mr-3 text-sm font-semibold text-sky-600 dark:text-sky-400 hover:underline"
                    >
                      {t("payments.edit")}
                    </button>
                    <button
                      onClick={() => void remove(gw)}
                      disabled={busyId === gw.id}
                      className="text-sm font-semibold text-rose-600 dark:text-rose-400 hover:underline disabled:opacity-50"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {gateways.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-slate-400">
                    {t("payments.nogateway")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {creating ? t("payments.add") : t("payments.edit")}
              </h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl leading-none">
                ✕
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1.5">
                  {t("payments.gateway")}
                </label>
                <select
                  value={form.gateway_name}
                  disabled={!creating}
                  onChange={(e) => setForm({ ...form, gateway_name: e.target.value })}
                  className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 outline-none disabled:opacity-60"
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              {!selectedIsManual && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1.5">
                        {t("payments.environment")}
                      </label>
                      <select
                        value={form.environment}
                        onChange={(e) => setForm({ ...form, environment: e.target.value as FormState["environment"] })}
                        className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 outline-none"
                      >
                        <option value="sandbox">{t("payments.env.sandbox")}</option>
                        <option value="live">{t("payments.env.production")}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1.5">
                        {t("payments.apiuser")}
                      </label>
                      <input
                        type="text"
                        value={form.api_user}
                        onChange={(e) => setForm({ ...form, api_user: e.target.value })}
                        className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1.5">
                      {t("payments.apikey")}
                    </label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={form.api_key}
                      onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                      placeholder={editing?.has_api_key ? `•••••••• (${t("payments.secrets.set")})` : t("payments.secrets.unset")}
                      className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-sky-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1.5">
                      {t("payments.webhooksecret")}
                    </label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={form.webhook_secret}
                      onChange={(e) => setForm({ ...form, webhook_secret: e.target.value })}
                      placeholder={editing?.has_webhook_secret ? `•••••••• (${t("payments.secrets.set")})` : t("payments.secrets.unset")}
                      className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-sky-500 outline-none"
                    />
                    <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">{t("payments.webhooksecret.readonly")}</p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1.5">
                        {t("payments.baseurl")}
                      </label>
                      <input
                        type="text"
                        value={form.base_url}
                        onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                        placeholder="https://"
                        className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-sky-500 outline-none"
                      />
                      <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">{t("payments.baseurl.help")}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1.5">
                        {t("payments.masterphone")}
                      </label>
                      <input
                        type="tel"
                        value={form.master_phone_number}
                        onChange={(e) => setForm({ ...form, master_phone_number: e.target.value })}
                        placeholder="677000000"
                        className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-sky-500 outline-none"
                      />
                    </div>
                  </div>
                </>
              )}

              {selectedIsManual && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1.5">
                      {t("payments.bankname")}
                    </label>
                    <input
                      type="text"
                      value={form.bank_name}
                      onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
                      className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1.5">
                      {t("payments.bankaccount")}
                    </label>
                    <input
                      type="text"
                      value={form.bank_account_number}
                      onChange={(e) => setForm({ ...form, bank_account_number: e.target.value })}
                      className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 outline-none"
                    />
                  </div>
                </div>
              )}

              {editing && (
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">
                    Webhook URL
                  </p>
                  <p className="text-xs font-mono text-slate-600 dark:text-slate-300 break-all">{editing.webhook_endpoint}</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={closeModal}
                disabled={saving}
                className="rounded-xl px-5 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all disabled:opacity-50"
              >
                {t("payments.cancel")}
              </button>
              <button
                onClick={() => void save()}
                disabled={saving || !form.gateway_name}
                className="rounded-xl bg-indigo-600 dark:bg-sky-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 dark:hover:bg-sky-600 active:scale-95 transition-all disabled:opacity-50 shadow-sm"
              >
                {t("payments.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}