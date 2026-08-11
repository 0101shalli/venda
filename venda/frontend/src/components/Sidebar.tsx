import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";

type SidebarProps = {
  role: string;
  username: string;
  onLogout: () => void;
};

const menuItems = [
  { path: "/sales", label: "Sales Terminal", roles: ["cashier", "manager1", "manager2", "admin"] },
  { path: "/orders", label: "Orders", roles: ["cashier", "manager1", "manager2", "admin"] },
  { path: "/inventory", label: "Inventory", roles: ["manager1", "admin"] },
  { path: "/analytics", label: "Analytics", roles: ["manager1", "manager2", "admin"] },
  { path: "/users", label: "User Management", roles: ["manager1", "admin"] },
  { path: "/settings", label: "Settings", roles: ["cashier", "manager1", "manager2", "admin"] },
];

export default function Sidebar({ role, username, onLogout }: SidebarProps) {
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

  const displayName = storeName || "General Store";

  return (
    <aside
      className="w-72 border-r p-6 transition-colors flex flex-col"
      style={{
        backgroundColor: "var(--color-sidebar)",
        borderColor: "var(--color-border)",
      }}
    >
      <div className="mb-10 flex flex-col items-center text-center">
        {storeLogo ? (
          <div className="h-32 w-32 rounded-3xl overflow-hidden border border-slate-200/60 dark:border-slate-700 bg-white flex items-center justify-center p-3 shadow-md mb-4 shrink-0">
            <img src={storeLogo} alt="Store logo" className="h-28 w-28 object-contain" />
          </div>
        ) : (
          <div
            className="h-32 w-32 rounded-3xl flex items-center justify-center text-white font-bold text-5xl shadow-md mb-4 shrink-0"
            style={{ background: "var(--color-primary)" }}
          >
            {(displayName || "G")[0].toUpperCase()}
          </div>
        )}
        <h1 className="text-2xl font-bold whitespace-nowrap" style={{ color: "var(--color-primary)" }}>
          {displayName}
        </h1>
        <p className="mt-1 text-sm truncate max-w-full" style={{ color: "var(--color-text-muted)" }}>
          {username}
        </p>
        <p className="text-xs uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
          Role: {role}
        </p>
      </div>

      <nav className="flex flex-col space-y-2 flex-1">
        {menuItems
          .filter((item) => item.roles.includes(role))
          .map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `block rounded-lg px-4 py-3 transition-colors ${
                  isActive
                    ? "font-semibold"
                    : "hover:opacity-75"
                }`
              }
              style={({ isActive }) => ({
                backgroundColor: isActive ? "var(--color-primary)" : "transparent",
                color: isActive ? (document.documentElement.classList.contains("dark") ? "#000" : "#fff") : "var(--color-text)",
              })}
            >
              {item.label}
            </NavLink>
          ))}

        <button
          type="button"
          onClick={onLogout}
          className="mt-auto flex items-center justify-between rounded-lg px-4 py-3 transition-colors hover:opacity-75"
          style={{ color: "var(--color-text)" }}
        >
          Logout
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </nav>
    </aside>
  );
}
