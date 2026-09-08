import { useEffect, useRef, useState } from "react";
import { useCurrency } from "../context/CurrencyContext";
import { fetchStoreBranding, printBrandingFooterHtml, printBrandingHeaderHtml } from "../components/creditsShared";

interface BorrowCardSummary {
  id: number;
  card_code: string;
  borrow_type: string;
  status: string;
  total_amount: number;
  downpayment_percentage: number;
  downpayment_amount: number;
  amount_paid: number;
  late_fee: number;
  late_fee_applied?: boolean;
  duration_type: string;
  duration_value: number;
  installment_interval?: string;
  installment_value?: number | null;
  installment_amount?: number;
  total_installments?: number;
  paid_installments?: number;
  downpayment_paid?: boolean;
  next_installment_date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  created_at?: string | null;
}

interface LendingAccount {
  id: number;
  barcode: string;
  full_name: string;
  sex: string;
  date_of_birth: string;
  place_of_birth: string;
  address: string;
  contact: string;
  email: string;
  max_lending_amount: number;
  government_id_number: string;
  government_id_type: string;
  id_front_image: string;
  id_back_image: string;
  borrow_cards: BorrowCardSummary[];
  created_at?: string | null;
}

interface CardItem {
  id: number;
  product_id: number;
  product_barcode: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

const EMPTY_ACCOUNT: LendingAccount = {
  id: 0,
  barcode: "",
  full_name: "",
  sex: "",
  date_of_birth: "",
  place_of_birth: "",
  address: "",
  contact: "",
  email: "",
  max_lending_amount: 0,
  government_id_number: "",
  government_id_type: "national_id",
  id_front_image: "",
  id_back_image: "",
  borrow_cards: [],
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  paid: "Paid",
  unpaid: "Unpaid",
  missed_installment: "Missed Installment",
  expired: "Expired",
  cancelled: "Cancelled",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400",
  paid: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400",
  unpaid: "bg-sky-100 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400",
  missed_installment: "bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400",
  expired: "bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400",
  cancelled: "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 line-through",
};

function AccountFormModal({
  account,
  onClose,
  onSaved,
}: {
  account: LendingAccount | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<LendingAccount>(account ?? EMPTY_ACCOUNT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);

  const update = (field: keyof LendingAccount, value: string | number) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleImage = (side: "front" | "back") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      setForm((prev) => (side === "front" ? { ...prev, id_front_image: dataUrl } : { ...prev, id_back_image: dataUrl }));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!form.full_name.trim()) {
      setError("Full name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const isEdit = account != null && account.id > 0;
      const body = {
        barcode: form.barcode,
        full_name: form.full_name,
        sex: form.sex,
        date_of_birth: form.date_of_birth,
        place_of_birth: form.place_of_birth,
        address: form.address,
        contact: form.contact,
        email: form.email,
        max_lending_amount: Number(form.max_lending_amount) || 0,
        government_id_number: form.government_id_number,
        government_id_type: form.government_id_type,
        id_front_image: form.id_front_image,
        id_back_image: form.id_back_image,
      };
      const res = await fetch(
        isEdit ? `/api/lending/accounts/${account.id}` : "/api/lending/accounts",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to save lending account");
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            {account ? "Edit Lending Account" : "Create Lending Account"}
          </h3>
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

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 dark:bg-red-950/20 p-3 text-sm text-red-600 dark:text-red-400 border border-red-200 dark:border-red-950">
            {error}
          </div>
        )}

        {!account && (
          <div className="mb-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-dashed border-slate-300 dark:border-slate-600 p-4 text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400">System-generated barcode</p>
            <p className="mt-1 font-mono font-bold text-indigo-600 dark:text-sky-400">Will be generated on save</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Full Name *</label>
            <input
              type="text"
              value={form.full_name}
              onChange={(e) => update("full_name", e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Sex</label>
            <select
              value={form.sex}
              onChange={(e) => update("sex", e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
            >
              <option value="">Select</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Date of Birth</label>
            <input
              type="date"
              value={form.date_of_birth}
              onChange={(e) => update("date_of_birth", e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Place of Birth</label>
            <input
              type="text"
              value={form.place_of_birth}
              onChange={(e) => update("place_of_birth", e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Address</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Contact</label>
            <input
              type="text"
              value={form.contact}
              onChange={(e) => update("contact", e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Max Lending Amount</label>
            <input
              type="number"
              value={form.max_lending_amount}
              onChange={(e) => update("max_lending_amount", e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Government ID Number</label>
            <input
              type="text"
              value={form.government_id_number}
              onChange={(e) => update("government_id_number", e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Type of Government ID</label>
            <div className="flex flex-wrap gap-3">
              {[
                { value: "national_id", label: "National ID" },
                { value: "driving_license", label: "Driving License" },
                { value: "passport", label: "Passport" },
              ].map((opt) => (
                <label key={opt.value} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="gov_type"
                    checked={form.government_id_type === opt.value}
                    onChange={() => update("government_id_type", opt.value)}
                    className="accent-sky-600"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">ID Document - Front</label>
            <input ref={frontRef} type="file" accept="image/*" onChange={handleImage("front")} className="hidden" />
            <button
              type="button"
              onClick={() => frontRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 px-4 py-4 text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              {form.id_front_image ? (
                <img src={form.id_front_image} alt="ID front" className="h-20 object-contain" />
              ) : (
                <>Upload Front of ID</>
              )}
            </button>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">ID Document - Back</label>
            <input ref={backRef} type="file" accept="image/*" onChange={handleImage("back")} className="hidden" />
            <button
              type="button"
              onClick={() => backRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 px-4 py-4 text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              {form.id_back_image ? (
                <img src={form.id_back_image} alt="ID back" className="h-20 object-contain" />
              ) : (
                <>Upload Back of ID</>
              )}
            </button>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white px-6 py-2.5 text-sm font-bold transition-colors"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BorrowCardsModal({
  account,
  onClose,
  onChanged,
}: {
  account: LendingAccount;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { formatPrice } = useCurrency();
  const [cards, setCards] = useState<BorrowCardSummary[]>(account.borrow_cards || []);
  const [viewingCard, setViewingCard] = useState<BorrowCardSummary | null>(null);

  const reload = () => {
    fetch(`/api/lending/accounts/${account.id}`)
      .then((r) => r.json())
      .then((d) => setCards(d.borrow_cards || []))
      .catch(() => {});
    onChanged?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Borrow Cards</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">{account.full_name} · {account.barcode}</p>
          </div>
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

        {cards.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-10 text-center text-slate-500 dark:text-slate-400">
            No borrow cards for this account yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {cards.map((card) => (
              <div
                key={card.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col gap-3 sm:flex-row sm:items-center justify-between"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{card.card_code}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[card.status]}`}>
                      {STATUS_LABEL[card.status]}
                    </span>
                    <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                      {card.borrow_type === "layaway" ? "Layaway" : "Sales Credit"}
                    </span>
                  </div>
                  <div className="mt-1 font-bold text-slate-800 dark:text-slate-100">{formatPrice(card.total_amount)}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Paid {formatPrice(card.amount_paid)} · {card.duration_value} {card.duration_type}
                    {Number(card.total_installments) > 0 ? ` · ${card.paid_installments ?? 0}/${card.total_installments} installments` : ""}
                    {card.next_installment_date && Number(card.paid_installments ?? 0) < Number(card.total_installments) ? ` · next ${new Date(card.next_installment_date).toLocaleDateString()}` : ""}
                    {card.end_date ? ` · due ${new Date(card.end_date).toLocaleDateString()}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setViewingCard(card)}
                  className="shrink-0 rounded-xl bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 text-sm font-semibold transition-colors"
                >
                  View & Print
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {viewingCard && (
        <CardDetailModal cardId={viewingCard.id} onClose={() => setViewingCard(null)} onChanged={reload} />
      )}
    </div>
  );
}

function CardDetailModal({ cardId, onClose, onChanged }: { cardId: number; onClose: () => void; onChanged?: () => void }) {
  const { formatPrice } = useCurrency();
  const [card, setCard] = useState<any | null>(null);
  const [items, setItems] = useState<CardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentAmount, setPaymentAmount] = useState<number | "">("");
  const [extendEndDate, setExtendEndDate] = useState<string>("");
  const [actionLoading, setActionLoading] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const load = () => {
    Promise.all([
      fetch(`/api/lending/cards/${cardId}`).then((r) => r.json()),
      fetch(`/api/lending/cards/${cardId}/items`).then((r) => r.json()),
    ])
      .then(([cd, it]) => {
        setCard(cd);
        setItems(it);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  const disabled = card ? ["paid", "cancelled"].includes(card.status) : false;

  const runAction = async (fn: () => Promise<void>) => {
    setActionLoading(true);
    setNotice(null);
    try {
      await fn();
      setNotice({ type: "success", message: "Updated successfully." });
      load();
      onChanged?.();
    } catch (err: any) {
      setNotice({ type: "error", message: err.message || "Action failed." });
    } finally {
      setActionLoading(false);
    }
  };

  const recordPayment = () =>
    runAction(async () => {
      const amt = Number(paymentAmount);
      if (!amt || amt <= 0) throw new Error("Enter a valid payment amount.");
      const res = await fetch(`/api/lending/cards/${cardId}/payment`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to record payment.");
      setPaymentAmount("");
    });

  const payDownpayment = () =>
    runAction(async () => {
      if (!card) return;
      const remaining = Math.max(0, Number(card.downpayment_amount) - Number(card.amount_paid));
      if (remaining <= 0) throw new Error("Downpayment is already covered.");
      const res = await fetch(`/api/lending/cards/${cardId}/payment`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Math.round(remaining * 100) / 100 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to pay downpayment.");
    });

  const payNextInstallment = () =>
    runAction(async () => {
      if (!card) return;
      const amount = Math.max(0, Number(card.installment_amount) || 0);
      if (amount <= 0) throw new Error("No installment amount configured for this card.");
      const paidInst = Number(card.paid_installments) || 0;
      const totalInst = Number(card.total_installments) || 0;
      if (paidInst >= totalInst) throw new Error("All installments have been paid already.");
      const res = await fetch(`/api/lending/cards/${cardId}/payment`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to pay installment.");
    });

  const markStatus = (status: string) =>
    runAction(async () => {
      const res = await fetch(`/api/lending/cards/${cardId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to update status.");
    });

  const handleExtend = () =>
    runAction(async () => {
      if (!extendEndDate) throw new Error("Choose a new end date to extend the card.");
      const res = await fetch(`/api/lending/cards/${cardId}/extend`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ end_date: extendEndDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to extend the card.");
      setExtendEndDate("");
    });

  const handleCancel = () => {
    if (!window.confirm("Cancel this borrow card? Inventory will be restored.")) return;
    markStatus("cancelled");
  };

  const handlePrint = async () => {
    if (!card) return;
    const branding = await fetchStoreBranding();
    const logoHtml = printBrandingHeaderHtml(branding.storeLogo);
    const footerHtml = printBrandingFooterHtml(branding);
    const itemsHtml = items
      .map(
        (it) =>
          `<tr style="border-bottom:1px solid #e2e8f0;">
             <td style="padding:6px 8px;text-align:left;font-size:13px;">${it.product_name}</td>
             <td style="padding:6px 8px;text-align:center;font-size:13px;">${it.quantity}</td>
             <td style="padding:6px 8px;text-align:right;font-size:13px;">${formatPrice(it.unit_price)}</td>
             <td style="padding:6px 8px;text-align:right;font-size:13px;">${formatPrice(it.subtotal)}</td>
           </tr>`
      )
      .join("");

    const win = window.open("", "_blank", "width=400,height=600");
    if (!win) return;
    win.document.write(`<html><head><title>Borrow Card</title></head><body>
      <div style="font-family:Arial,sans-serif;padding:24px;border:2px solid #0F172A;border-radius:12px;max-width:340px;margin:auto;">
        <div style="text-align:center;border-bottom:2px solid #0F172A;padding-bottom:12px;">
          ${logoHtml}
          <div style="font-size:12px;color:#475569;letter-spacing:1px;">${branding.storeName}</div>
          <h2 style="margin:6px 0 0;font-size:20px;">BORROW CARD</h2>
        </div>
        <div style="padding:12px 0;">
          <p style="margin:2px 0;font-size:13px;"><strong>Reference:</strong> ${card.card_code}</p>
          <p style="margin:2px 0;font-size:13px;"><strong>Borrower:</strong> ${card.borrower_name || ""}</p>
          <p style="margin:2px 0;font-size:13px;"><strong>Type:</strong> ${card.borrow_type === "layaway" ? "Layaway" : "Sales Credit"}</p>
          <p style="margin:2px 0;font-size:13px;"><strong>Status:</strong> ${STATUS_LABEL[card.status] || card.status}</p>
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
          <p style="margin:2px 0;font-size:13px;text-align:right;"><strong>Total:</strong> ${formatPrice(card.total_amount)}</p>
          <p style="margin:2px 0;font-size:13px;text-align:right;"><strong>Amount Paid:</strong> ${formatPrice(card.amount_paid)}</p>
        </div>
        ${footerHtml}
      </div></body></html>`);
    win.document.close();
    win.print();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Borrow Card Items</h3>
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

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-sky-500"></div>
          </div>
        ) : card ? (
          <div>
            {notice && (
              <div className={`mb-3 rounded-xl p-3 text-sm border ${
                notice.type === "success"
                  ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-950"
                  : "bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-950"
              }`}>
                {notice.message}
              </div>
            )}

            <div className="mb-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-slate-400">Card Code</p>
                <p className="font-mono font-semibold text-slate-800 dark:text-white">{card.card_code}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Status</p>
                <span className={`inline-block mt-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[card.status]}`}>
                  {STATUS_LABEL[card.status] || card.status}
                </span>
              </div>
              <div>
                <p className="text-xs text-slate-400">Type</p>
                <p className="font-semibold text-slate-800 dark:text-white">
                  {card.borrow_type === "layaway" ? "Layaway" : "Sales Credit"}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Total</p>
                <p className="font-bold text-slate-800 dark:text-white">{formatPrice(card.total_amount)}
                  {(card.late_fee_applied && !!(card.late_fee || 0)) && (
                    <span className="ml-1 text-[10px] text-rose-500 dark:text-rose-400">incl. late fee</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Amount Due</p>
                <p className="font-bold text-indigo-700 dark:text-sky-400">{formatPrice(Math.max(0, Number(card.total_amount) - Number(card.amount_paid)))}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Downpayment</p>
                <p className="font-semibold text-slate-800 dark:text-white">
                  {formatPrice(card.downpayment_amount)}
                  {card.downpayment_paid ? <span className="ml-1 text-xs text-emerald-600 dark:text-emerald-400">(paid)</span> : null}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Amount Paid</p>
                <p className="font-bold text-slate-800 dark:text-white">{formatPrice(card.amount_paid)}</p>
              </div>
              {Number(card.total_installments) > 0 && (
                <div>
                  <p className="text-xs text-slate-400">Installments</p>
                  <p className="font-semibold text-slate-800 dark:text-white">
                    {card.paid_installments} / {card.total_installments} · {formatPrice(card.installment_amount)} each
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs text-slate-400">Next Installment</p>
                <p className={`font-semibold ${card.next_installment_date && Number(card.paid_installments ?? 0) < Number(card.total_installments) ? "text-slate-800 dark:text-white" : "text-slate-400"}`}>
                  {card.next_installment_date && Number(card.paid_installments ?? 0) < Number(card.total_installments)
                    ? new Date(card.next_installment_date).toLocaleDateString()
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Due</p>
                <p className="font-semibold text-slate-800 dark:text-white">
                  {card.end_date ? new Date(card.end_date).toLocaleDateString() : "—"}
                </p>
              </div>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((it) => (
                <div key={it.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-white">{it.product_name}</p>
                    <p className="text-xs text-slate-400">{it.quantity} × {formatPrice(it.unit_price)}</p>
                  </div>
                  <span className="font-bold text-slate-800 dark:text-white">{formatPrice(it.subtotal)}</span>
                </div>
              ))}
            </div>

            {Number(card.total_installments) > 0 && (
              <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Installments</p>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {card.paid_installments} / {card.total_installments} paid
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{
                      width: `${Math.min(100, ((card.paid_installments || 0) / (card.total_installments || 1)) * 100)}%`,
                    }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>Each installment: <strong className="text-slate-800 dark:text-white">{formatPrice(card.installment_amount)}</strong></span>
                  <span>Balance: <strong className="text-slate-800 dark:text-white">{formatPrice(Math.max(0, Number(card.total_amount) - Number(card.amount_paid)))}</strong></span>
                </div>
                {!disabled && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!card.downpayment_paid && card.downpayment_amount > Number(card.amount_paid) && (
                      <button
                        type="button"
                        onClick={payDownpayment}
                        disabled={actionLoading}
                        className="rounded-xl bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 text-xs font-bold disabled:opacity-50 transition-colors"
                      >
                        Pay Downpayment ({formatPrice(Math.max(0, Number(card.downpayment_amount) - Number(card.amount_paid)))})
                      </button>
                    )}
                    {Number(card.paid_installments) < Number(card.total_installments) && (
                      <button
                        type="button"
                        onClick={payNextInstallment}
                        disabled={actionLoading}
                        className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-xs font-bold disabled:opacity-50 transition-colors"
                      >
                        Pay Next Installment ({formatPrice(card.installment_amount)})
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {!disabled && (
              <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Record Payment</p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="Amount"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value === "" ? "" : Number(e.target.value))}
                    className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={recordPayment}
                    disabled={actionLoading}
                    className="shrink-0 rounded-xl bg-sky-600 hover:bg-sky-700 text-white px-5 py-2.5 text-sm font-bold disabled:opacity-50 transition-colors"
                  >
                    {actionLoading ? "..." : "Pay"}
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => markStatus("missed_installment")}
                    disabled={actionLoading}
                    className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 px-3 py-1.5 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-950/40 disabled:opacity-50 transition-colors"
                  >
                    Mark Missed Installment
                  </button>
                  <button
                    type="button"
                    onClick={() => markStatus("expired")}
                    disabled={actionLoading}
                    className="rounded-xl border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 px-3 py-1.5 text-xs font-semibold hover:bg-red-100 dark:hover:bg-red-950/40 disabled:opacity-50 transition-colors"
                  >
                    Mark Expired
                  </button>
                  <button
                    type="button"
                    onClick={() => markStatus("paid")}
                    disabled={actionLoading}
                    className="rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 px-3 py-1.5 text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-950/40 disabled:opacity-50 transition-colors"
                  >
                    Mark Fully Paid
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={actionLoading}
                    className="rounded-xl border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 px-3 py-1.5 text-xs font-semibold hover:bg-rose-100 dark:hover:bg-rose-950/40 disabled:opacity-50 transition-colors"
                  >
                    Cancel Card
                  </button>
                </div>
                {card.late_fee_applied && !!(card.late_fee || 0) && (
                  <p className="mt-2 text-xs text-rose-500 dark:text-rose-400">
                    A late fee of {formatPrice(card.late_fee)} has been added to the total.
                  </p>
                )}
              </div>
            )}

            {!disabled && (
              <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Extend Borrow Card</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                  Current end date: {card.end_date ? new Date(card.end_date).toLocaleDateString() : "—"}
                </p>
                <div className="flex gap-2">
                  <input
                    type="date"
                    min={new Date().toISOString().split("T")[0]}
                    value={extendEndDate}
                    onChange={(e) => setExtendEndDate(e.target.value)}
                    className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleExtend}
                    disabled={actionLoading || !extendEndDate}
                    className="shrink-0 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 text-sm font-bold disabled:opacity-50 transition-colors"
                  >
                    {actionLoading ? "..." : "Extend"}
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className="mt-5 w-full rounded-xl bg-sky-600 hover:bg-sky-700 text-white py-3 text-sm font-bold transition-colors"
            >
              🖨️ Print Card
            </button>
          </div>
        ) : (
          <div className="text-center text-slate-400 py-8">Failed to load card.</div>
        )}
      </div>
    </div>
  );
}

export default function LendingPage() {
  const { formatPrice } = useCurrency();
  const [stats, setStats] = useState<any>(null);
  const [accounts, setAccounts] = useState<LendingAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editingAccount, setEditingAccount] = useState<LendingAccount | null>(null);
  const [viewingCards, setViewingCards] = useState<LendingAccount | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadStats = () => {
    fetch("/api/lending/stats")
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => {});
  };

  const loadAccounts = () => {
    fetch(`/api/lending/accounts/search?q=${encodeURIComponent(debouncedSearch)}&status=${encodeURIComponent(statusFilter)}`)
      .then((r) => r.json())
      .then((d) => setAccounts(d))
      .catch(() => setAccounts([]));
  };

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    setLoading(true);
    loadAccounts();
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, statusFilter]);

  const statuses = ["", "unpaid", "paid", "missed_installment", "expired", "cancelled", "pending"];

  const StatTile = ({ label, value, isMoney, className }: { label: string; value: any; isMoney?: boolean; className?: string }) => (
    <div className={`rounded-2xl border p-4 text-center ${className || "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"}`}>
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-lg font-bold text-slate-800 dark:text-white">
        {isMoney ? formatPrice(Number(value) || 0) : value ?? 0}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 p-1">
      <div className="rounded-3xl bg-gradient-to-br from-indigo-600 dark:from-sky-500 to-violet-600 dark:to-sky-600 px-6 py-5 text-white shadow-md">
        <h1 className="text-2xl font-bold tracking-tight">Lending</h1>
        <p className="mt-0.5 text-sm text-indigo-200 dark:text-sky-200">Manage sales credit and layaway borrower accounts</p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <div className="md:col-span-3 xl:col-span-6">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Sales Credit</h2>
          </div>
          <StatTile label="Amount Paid" value={stats.sales_credit.amount_paid} isMoney className="bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900" />
          <StatTile label="Amount Unpaid" value={stats.sales_credit.amount_unpaid} isMoney className="bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900" />
          <StatTile label="Expired" value={stats.sales_credit.expired} className="bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900" />
          <StatTile label="Missed Installments" value={stats.sales_credit.missed_installment} className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900" />
          <StatTile label="Cancelled" value={stats.sales_credit.cancelled} className="bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
          <StatTile label="Pending" value={stats.sales_credit.pending} className="bg-sky-50 dark:bg-sky-950/20 border-sky-200 dark:border-sky-900" />

          <div className="md:col-span-3 xl:col-span-6 mt-2">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Layaway</h2>
          </div>
          <StatTile label="Amount Paid" value={stats.layaway.amount_paid} isMoney className="bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900" />
          <StatTile label="Amount Unpaid" value={stats.layaway.amount_unpaid} isMoney className="bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900" />
          <StatTile label="Expired" value={stats.layaway.expired} className="bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900" />
          <StatTile label="Missed Installments" value={stats.layaway.missed_installment} className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900" />
          <StatTile label="Cancelled" value={stats.layaway.cancelled} className="bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
          <StatTile label="Pending" value={stats.layaway.pending} className="bg-sky-50 dark:bg-sky-950/20 border-sky-200 dark:border-sky-900" />
        </div>
      )}

      <div className="rounded-3xl bg-white dark:bg-slate-900 p-5 shadow-sm border border-slate-200 dark:border-slate-700">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M16.5 10.5a6 6 0 11-12 0 6 6 0 0112 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search borrowers by name, government ID, or barcode…"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-2.5 pl-10 pr-4 text-sm text-slate-800 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
          >
            <option value="">All statuses</option>
            {statuses.filter(Boolean).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded-xl bg-sky-600 hover:bg-sky-700 text-white px-5 py-2.5 text-sm font-bold whitespace-nowrap transition-colors"
          >
            + Create Lending Account
          </button>
        </div>
      </div>

      <div className="rounded-3xl bg-white dark:bg-slate-900 p-5 shadow-sm border border-slate-200 dark:border-slate-700">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Borrower Accounts ({accounts.length})
        </h2>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-sky-500"></div>
          </div>
        ) : accounts.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-10 text-center text-slate-500 dark:text-slate-400">
            No borrower accounts found. Click "Create Lending Account" to add one.
          </div>
        ) : (
          <div className="space-y-3">
            {accounts.map((acc) => (
              <div key={acc.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-slate-800 dark:text-white">{acc.full_name}</p>
                    <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {acc.borrow_cards.length} card{acc.borrow_cards.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Gov ID: <span className="font-mono">{acc.government_id_number || "—"}</span>
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 font-mono">Barcode: {acc.barcode}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingAccount(acc)}
                    className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                  >
                    Review / Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewingCards(acc)}
                    className="rounded-xl bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 text-sm font-semibold transition-colors"
                  >
                    Borrow Cards
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <AccountFormModal account={null} onClose={() => setShowCreate(false)} onSaved={() => { loadAccounts(); loadStats(); }} />
      )}
      {editingAccount && (
        <AccountFormModal account={editingAccount} onClose={() => setEditingAccount(null)} onSaved={() => { loadAccounts(); loadStats(); }} />
      )}
      {viewingCards && (
        <BorrowCardsModal account={viewingCards} onClose={() => setViewingCards(null)} onChanged={() => { loadAccounts(); loadStats(); }} />
      )}
    </div>
  );
}
