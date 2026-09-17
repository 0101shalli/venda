import { useEffect, useState } from "react";
import { setAuth, AuthData } from "../services/auth";
import { useLanguage } from "../context/LanguageContext";

export default function LoginPage({ onSuccess }: { onSuccess: (data: AuthData) => void }) {
  const { t } = useLanguage();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [storeName, setStoreName] = useState("");
  const [storeLogo, setStoreLogo] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setStoreName(data.store_name || "");
        setStoreLogo(data.store_logo || "");
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();
      if (response.ok) {
        setAuth(data);
        onSuccess(data);
      } else if (response.status === 403) {
        setAuth(data);
        onSuccess(data);
      } else {
        setError(data.detail || t("login.failed"));
      }
    } catch (err) {
      setError(t("login.noconnect"));
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-lg">
        <div className="mb-8 flex flex-col items-center text-center">
          {storeLogo ? (
            <div className="h-40 w-40 rounded-3xl overflow-hidden border border-slate-200 bg-white flex items-center justify-center p-3 shadow-md mb-4">
              <img src={storeLogo} alt="Store logo" className="h-36 w-36 object-contain" />
            </div>
          ) : (
            <div className="h-40 w-40 rounded-3xl bg-slate-900 flex items-center justify-center text-white text-6xl font-bold mb-4 shadow-md">
              {(storeName || "S")[0].toUpperCase()}
            </div>
          )}
          <h1 className="text-2xl font-semibold text-slate-900">{storeName || "General Store"}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("login.title")}</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <label className="block">
            <span className="text-slate-700">{t("login.username")}</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3"
              required
            />
          </label>
          <label className="block">
            <span className="text-slate-700">{t("login.password")}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3"
              required
            />
          </label>
          {error && <div className="text-sm text-rose-600">{error}</div>}
          <button className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-white hover:bg-slate-700" type="submit">
            {t("login.signin")}
          </button>
        </form>
      </div>
    </div>
  );
}
