import { useEffect, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { getAuth } from "../services/auth";

interface ProfileData {
  id: number;
  username: string;
  role: string;
  full_name: string;
  email: string;
  bio: string;
  profile_image: string;
  social_twitter: string;
  social_facebook: string;
  social_linkedin: string;
  social_instagram: string;
}

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const auth = getAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [profile, setProfile] = useState<ProfileData>({
    id: 0,
    username: "",
    role: "",
    full_name: "",
    email: "",
    bio: "",
    profile_image: "",
    social_twitter: "",
    social_facebook: "",
    social_linkedin: "",
    social_instagram: "",
  });

  useEffect(() => {
    if (!auth?.username) return;
    setLoading(true);
    fetch(`/api/profile?username=${encodeURIComponent(auth.username)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch profile");
        return res.json();
      })
      .then((data) => {
        setProfile({
          id: data.id,
          username: data.username,
          role: data.role,
          full_name: data.full_name || "",
          email: data.email || "",
          bio: data.bio || "",
          profile_image: data.profile_image || "",
          social_twitter: data.social_twitter || "",
          social_facebook: data.social_facebook || "",
          social_linkedin: data.social_linkedin || "",
          social_instagram: data.social_instagram || "",
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Compress and convert to base64
    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_SIZE = 256;
        let w = img.width;
        let h = img.height;

        // Scale down to max 256×256
        if (w > h) {
          if (w > MAX_SIZE) { h = Math.round((h * MAX_SIZE) / w); w = MAX_SIZE; }
        } else {
          if (h > MAX_SIZE) { w = Math.round((w * MAX_SIZE) / h); h = MAX_SIZE; }
        }

        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL("image/jpeg", 0.8);
        setProfile((prev) => ({ ...prev, profile_image: compressed }));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setProfile((prev) => ({ ...prev, profile_image: "" }));
  };

  const handleSave = async () => {
    if (!auth?.username) return;
    setSaving(true);
    setSaveMessage(null);

    try {
      const res = await fetch(`/api/profile?username=${encodeURIComponent(auth.username)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: profile.full_name || null,
          email: profile.email || null,
          bio: profile.bio || null,
          profile_image: profile.profile_image || null,
          social_twitter: profile.social_twitter || null,
          social_facebook: profile.social_facebook || null,
          social_linkedin: profile.social_linkedin || null,
          social_instagram: profile.social_instagram || null,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to save profile");
      }

      setSaveMessage({ type: "success", text: "Profile saved successfully!" });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err: any) {
      setSaveMessage({ type: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm border border-slate-200 dark:border-slate-800">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Settings</h1>
        <p className="mt-1 text-slate-500 dark:text-slate-400">Manage your profile and application preferences.</p>
      </div>

      {/* Appearance / Theme Toggle */}
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Appearance</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Toggle between light and dark mode</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {theme === "light" ? "☀️ Light" : "🌙 Dark"}
            </span>
            <button
              onClick={toggleTheme}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                theme === "dark" ? "bg-sky-500" : "bg-slate-300"
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-sm transition-transform ${
                  theme === "dark" ? "translate-x-7" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Profile Section */}
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-6">My Profile</h2>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-slate-200 border-t-sky-500"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Avatar Section */}
            <div className="flex items-center gap-6">
              <div className="relative group">
                {profile.profile_image ? (
                  <img
                    src={profile.profile_image}
                    alt="Profile"
                    className="h-24 w-24 rounded-full object-cover border-3 border-slate-200 dark:border-slate-700 shadow-md"
                  />
                ) : (
                  <div className="h-24 w-24 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 dark:from-sky-400 dark:to-cyan-500 flex items-center justify-center text-white text-3xl font-bold uppercase shadow-md">
                    {profile.full_name ? profile.full_name[0] : profile.username[0]}
                  </div>
                )}
                {/* Hover overlay */}
                <label className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                  <span className="text-white text-xs font-semibold">Change</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </label>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{profile.full_name || profile.username}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">@{profile.username} · {profile.role}</p>
                <div className="flex gap-2 mt-2">
                  <label className="cursor-pointer text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline">
                    Upload new photo
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  </label>
                  {profile.profile_image && (
                    <button
                      onClick={handleRemoveImage}
                      className="text-xs font-semibold text-rose-500 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Profile Form Fields */}
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1.5">Full Name</label>
                <input
                  type="text"
                  value={profile.full_name}
                  onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                  placeholder="Your full name"
                  className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1.5">Email Address</label>
                <input
                  type="email"
                  value={profile.email}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  placeholder="your.email@example.com"
                  className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none transition-all"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1.5">Bio</label>
                <textarea
                  value={profile.bio}
                  onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                  placeholder="Tell us about yourself..."
                  rows={3}
                  className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none transition-all resize-none"
                />
              </div>
            </div>

            {/* Social Links */}
            <div>
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">Social Profiles</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-3">
                  <span className="text-lg">🐦</span>
                  <input
                    type="text"
                    value={profile.social_twitter}
                    onChange={(e) => setProfile({ ...profile, social_twitter: e.target.value })}
                    placeholder="Twitter profile URL"
                    className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none"
                  />
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-3">
                  <span className="text-lg">📘</span>
                  <input
                    type="text"
                    value={profile.social_facebook}
                    onChange={(e) => setProfile({ ...profile, social_facebook: e.target.value })}
                    placeholder="Facebook profile URL"
                    className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none"
                  />
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-3">
                  <span className="text-lg">🔗</span>
                  <input
                    type="text"
                    value={profile.social_linkedin}
                    onChange={(e) => setProfile({ ...profile, social_linkedin: e.target.value })}
                    placeholder="LinkedIn profile URL"
                    className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none"
                  />
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-3">
                  <span className="text-lg">📷</span>
                  <input
                    type="text"
                    value={profile.social_instagram}
                    onChange={(e) => setProfile({ ...profile, social_instagram: e.target.value })}
                    placeholder="Instagram profile URL"
                    className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Save Button & Status */}
            <div className="flex items-center gap-4 pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-xl bg-indigo-600 dark:bg-sky-500 px-8 py-3 text-sm font-semibold text-white hover:bg-indigo-700 dark:hover:bg-sky-600 active:scale-95 transition-all disabled:opacity-50 shadow-sm"
              >
                {saving ? "Saving..." : "Save Profile"}
              </button>

              {saveMessage && (
                <p className={`text-sm font-medium ${
                  saveMessage.type === "success"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}>
                  {saveMessage.type === "success" ? "✓" : "✗"} {saveMessage.text}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Account Info */}
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-6">
        <h3 className="font-semibold text-slate-700 dark:text-slate-300 mb-2">Account Information</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Your theme preference is automatically saved and will be restored when you return to the application.
          Profile changes are stored on the server and visible to other administrators.
        </p>
      </div>
    </div>
  );
}
