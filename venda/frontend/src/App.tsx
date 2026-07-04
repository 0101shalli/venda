import { useEffect, useMemo, useState } from "react";
import { Route, Routes, Navigate, useNavigate } from "react-router-dom";
import { useTheme } from "./context/ThemeContext";
import Sidebar from "./components/Sidebar";
import LoginPage from "./pages/LoginPage";
import SalesTerminal from "./pages/SalesTerminal";
import InventoryPage from "./pages/InventoryPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import UserManagementPage from "./pages/UserManagementPage";
import SettingsPage from "./pages/SettingsPage";
import ChangePasswordModal from "./components/ChangePasswordModal";
import { fetchWithAuthInterceptors, getAuth, setAuth, clearAuth, AuthData } from "./services/auth";

const routePermissions = {
  cashier: ["/sales"],
  manager: ["/sales", "/inventory", "/analytics"],
  admin: ["/sales", "/inventory", "/analytics", "/users", "/settings"],
};

function App() {
  const { theme } = useTheme();
  const [auth, setAuthState] = useState<AuthData | null>(getAuth());
  const [forcePasswordChange, setForcePasswordChange] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (auth?.is_first_login) {
      setForcePasswordChange(true);
      navigate("/sales", { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount — modal cleanup updates localStorage directly

  const allowedRoutes = useMemo(() => {
    if (!auth || !auth.role) return [];
    return routePermissions[auth.role as keyof typeof routePermissions] ?? [];
  }, [auth]);

  const handleLogin = (data: AuthData) => {
    setAuth(data);
    setAuthState(data);
    if (data.is_first_login) {
      setForcePasswordChange(true);
    } else {
      navigate("/sales");
    }
  };

  const handleLogout = () => {
    clearAuth();
    setAuthState(null);
    navigate("/login");
  };

  if (!auth) {
    return <LoginPage onSuccess={handleLogin} />;
  }

  return (
    <div className={`min-h-screen flex ${theme === "dark" ? "dark" : ""}`}>
      <style>{`
        :root {
          --color-primary: ${theme === "dark" ? "#38BDF8" : "#0F172A"};
          --color-bg: ${theme === "dark" ? "#0B0F19" : "#F8FAFC"};
          --color-sidebar: ${theme === "dark" ? "#1E293B" : "#FFFFFF"};
          --color-card: ${theme === "dark" ? "#111827" : "#FFFFFF"};
          --color-text: ${theme === "dark" ? "#F1F5F9" : "#0F172A"};
          --color-text-muted: ${theme === "dark" ? "#CBD5E1" : "#64748B"};
          --color-border: ${theme === "dark" ? "#334155" : "#E2E8F0"};
        }
        
        body {
          background-color: var(--color-bg);
          color: var(--color-text);
        }
      `}</style>
      <Sidebar role={auth.role} onLogout={handleLogout} />
      <main className="flex-1 p-6" style={{ backgroundColor: "var(--color-bg)", color: "var(--color-text)" }}>
        {forcePasswordChange && <ChangePasswordModal onComplete={() => setForcePasswordChange(false)} />}
        <Routes>
          <Route path="/sales" element={allowedRoutes.includes("/sales") ? <SalesTerminal /> : <Navigate to="/sales" />} />
          <Route path="/inventory" element={allowedRoutes.includes("/inventory") ? <InventoryPage /> : <Navigate to="/sales" />} />
          <Route path="/analytics" element={allowedRoutes.includes("/analytics") ? <AnalyticsPage /> : <Navigate to="/sales" />} />
          <Route path="/users" element={allowedRoutes.includes("/users") ? <UserManagementPage /> : <Navigate to="/sales" />} />
          <Route path="/settings" element={allowedRoutes.includes("/settings") ? <SettingsPage /> : <Navigate to="/sales" />} />
          <Route path="*" element={<Navigate to="/sales" />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
