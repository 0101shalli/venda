import { useState } from "react";
import { fetchWithAuthInterceptors, getAuth, setAuth } from "../services/auth";
import { useLanguage } from "../context/LanguageContext";

export default function ChangePasswordModal({ onComplete }: { onComplete: () => void }) {
  const { t } = useLanguage();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      setError(t("changepw.nomatch"));
      return;
    }

    try {
      await fetchWithAuthInterceptors("/api/change-password", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      // Clear the first-login flag in localStorage so the modal never re-appears
      const current = getAuth();
      if (current) {
        setAuth({ ...current, is_first_login: false });
      }
      onComplete();
    } catch (error) {
      setError(t("changepw.error"));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-xl rounded-3xl bg-white p-8 shadow-xl">
        <h2 className="text-2xl font-semibold">{t("changepw.title")}</h2>
        <p className="mt-2 text-slate-600">{t("changepw.subtitle")}</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">{t("changepw.newpw")}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">{t("changepw.confirmpw")}</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
              required
            />
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <button type="submit" className="w-full rounded-xl bg-slate-900 px-4 py-3 text-white hover:bg-slate-700">
            {t("changepw.update")}
          </button>
        </form>
      </div>
    </div>
  );
}