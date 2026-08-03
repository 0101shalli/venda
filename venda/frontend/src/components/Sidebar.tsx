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
  { path: "/inventory", label: "Inventory", roles: ["manager1", "manager2", "admin"] },
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
      <div className="mb-10">
        {storeLogo && (
          <img src={storeLogo} alt="Store logo" className="h-12 w-12 object-contain mb-2" />
        )}
        <h1 className="text-2xl font-semibold" style={{ color: "var(--color-primary)" }}>
          {displayName}
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
          {username}
        </p>
        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          Role: {role}
        </p>
      </div>

      <nav className="space-y-2 flex-1">
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
      </nav>

      <button
        type="button"
        onClick={onLogout}
        className="mt-8 w-full rounded-lg px-4 py-3 text-white font-medium hover:opacity-90 transition-opacity"
        style={{ backgroundColor: "var(--color-primary)" }}
      >
        Logout
      </button>
    </aside>
  );
}
