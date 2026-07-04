import { useTheme } from "../context/ThemeContext";

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">Manage your preferences</p>
      </div>

      {/* Theme Card */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Appearance</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Toggle between light and dark mode</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {theme === "light" ? "Light Mode" : "Dark Mode"}
              </span>
              <button
                onClick={toggleTheme}
                className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                  theme === "dark" ? "bg-indigo-600" : "bg-slate-300"
                }`}
              >
                <span
                  className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                    theme === "dark" ? "translate-x-7" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Preview Cards */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Preview</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Light Example */}
          <div
            className="rounded-xl border border-slate-200 p-6"
            style={{
              backgroundColor: "#FFFFFF",
              borderColor: "#E2E8F0",
              color: "#0F172A",
            }}
          >
            <h4 className="font-semibold mb-2">Light Mode Card</h4>
            <p className="text-sm opacity-75">
              This is how cards look in light mode with a clean, bright appearance.
            </p>
            <div className="mt-4 flex gap-2">
              <div
                className="px-3 py-1 rounded text-sm font-medium"
                style={{ backgroundColor: "#0F172A", color: "#FFFFFF" }}
              >
                Primary Button
              </div>
            </div>
          </div>

          {/* Dark Example */}
          <div
            className="rounded-xl border p-6"
            style={{
              backgroundColor: "#111827",
              borderColor: "#334155",
              color: "#F1F5F9",
            }}
          >
            <h4 className="font-semibold mb-2">Dark Mode Card</h4>
            <p className="text-sm opacity-75">
              This is how cards look in dark mode with easy-on-the-eyes colors.
            </p>
            <div className="mt-4 flex gap-2">
              <div
                className="px-3 py-1 rounded text-sm font-medium"
                style={{ backgroundColor: "#38BDF8", color: "#0B0F19" }}
              >
                Primary Button
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Color Palette */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Color Palette</h3>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Light Mode Colors */}
            <div>
              <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Light Mode</p>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded" style={{ backgroundColor: "#F8FAFC" }} />
                  <span className="text-xs text-slate-600 dark:text-slate-400">App Bg: #F8FAFC</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded" style={{ backgroundColor: "#FFFFFF" }} />
                  <span className="text-xs text-slate-600 dark:text-slate-400">Card: #FFFFFF</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded" style={{ backgroundColor: "#0F172A" }} />
                  <span className="text-xs text-slate-600 dark:text-slate-400">Primary: #0F172A</span>
                </div>
              </div>
            </div>

            {/* Dark Mode Colors */}
            <div>
              <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Dark Mode</p>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded border border-slate-600" style={{ backgroundColor: "#0B0F19" }} />
                  <span className="text-xs text-slate-600 dark:text-slate-400">App Bg: #0B0F19</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded" style={{ backgroundColor: "#111827" }} />
                  <span className="text-xs text-slate-600 dark:text-slate-400">Card: #111827</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded" style={{ backgroundColor: "#38BDF8" }} />
                  <span className="text-xs text-slate-600 dark:text-slate-400">Primary: #38BDF8</span>
                </div>
              </div>
            </div>

            {/* Additional Resources */}
            <div>
              <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Navigation</p>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded" style={{ backgroundColor: "#FFFFFF" }} />
                  <span className="text-xs text-slate-600 dark:text-slate-400">Light Nav: #FFFFFF</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded" style={{ backgroundColor: "#1E293B" }} />
                  <span className="text-xs text-slate-600 dark:text-slate-400">Dark Nav: #1E293B</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Information */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-blue-50 dark:bg-blue-900/20 p-6">
        <h4 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">Theme Information</h4>
        <p className="text-sm text-blue-800 dark:text-blue-200">
          Your theme preference is automatically saved and will be restored when you return to the application.
        </p>
      </div>
    </div>
  );
}
