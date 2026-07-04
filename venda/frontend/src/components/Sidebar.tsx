import { NavLink } from "react-router-dom";

type SidebarProps = {
  role: string;
  onLogout: () => void;
};

const menuItems = [
  { path: "/sales", label: "Sales Terminal", roles: ["cashier", "manager", "admin"] },
  { path: "/inventory", label: "Inventory", roles: ["manager", "admin"] },
  { path: "/analytics", label: "Analytics", roles: ["manager", "admin"] },
  { path: "/users", label: "User Management", roles: ["admin"] },
  { path: "/settings", label: "Settings", roles: ["admin"] },
];

export default function Sidebar({ role, onLogout }: SidebarProps) {
  return (
    <aside
      className="w-72 border-r p-6 transition-colors"
      style={{
        backgroundColor: "var(--color-sidebar)",
        borderColor: "var(--color-border)",
      }}
    >
      <div className="mb-10">
        <h1 className="text-2xl font-semibold" style={{ color: "var(--color-primary)" }}>
          General Store
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
          Role: {role}
        </p>
      </div>

      <nav className="space-y-2">
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
