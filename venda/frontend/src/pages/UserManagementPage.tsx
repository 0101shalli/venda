import { useEffect, useState } from "react";

interface User {
  id: number;
  username: string;
  role: string;
  is_first_login: boolean;
  full_name: string;
  email: string;
  bio: string;
  profile_image: string;
  social_twitter: string;
  social_facebook: string;
  social_linkedin: string;
  social_instagram: string;
}

export default function UserManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    role: "cashier",
    full_name: "",
    email: "",
    bio: "",
    profile_image: "",
    social_twitter: "",
    social_facebook: "",
    social_linkedin: "",
    social_instagram: "",
  });

  const [passwordResetOpen, setPasswordResetOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [resettingUser, setResettingUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchUsers = () => {
    setLoading(true);
    fetch("/api/users")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load users list");
        return res.json();
      })
      .then((data) => {
        setUsers(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const openAddModal = () => {
    setEditingUser(null);
    setFormData({
      username: "",
      password: "",
      role: "cashier",
      full_name: "",
      email: "",
      bio: "",
      profile_image: "",
      social_twitter: "",
      social_facebook: "",
      social_linkedin: "",
      social_instagram: "",
    });
    setIsModalOpen(true);
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: "",
      role: user.role,
      full_name: user.full_name || "",
      email: user.email || "",
      bio: user.bio || "",
      profile_image: user.profile_image || "",
      social_twitter: user.social_twitter || "",
      social_facebook: user.social_facebook || "",
      social_linkedin: user.social_linkedin || "",
      social_instagram: user.social_instagram || "",
    });
    setIsModalOpen(true);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData((prev) => ({ ...prev, profile_image: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isEdit = !!editingUser;
    const url = isEdit ? `/api/users/${editingUser!.id}` : "/api/users";
    const method = isEdit ? "PUT" : "POST";

    if (!formData.username.trim()) {
      alert("Username is required");
      return;
    }
    if (!isEdit && !formData.password) {
      alert("Password is required for new users");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Request failed");
      }

      setIsModalOpen(false);
      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to delete user");
      }
      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const openResetPasswordModal = (user: User) => {
    setResettingUser(user);
    setNewPassword("");
    setPasswordResetOpen(true);
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword.trim()) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/users/${resettingUser!.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });

      if (!res.ok) throw new Error("Failed to reset password");
      setPasswordResetOpen(false);
      alert("Password reset successfully!");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const getRoleBadgeStyle = (role: string) => {
    switch (role) {
      case "admin":
        return "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400";
      case "manager":
        return "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400";
      default:
        return "bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap gap-4 items-center justify-between rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm border border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">User Management</h2>
          <p className="mt-1 text-slate-500 dark:text-slate-400">Add, edit, or configure store user profiles and roles.</p>
        </div>
        <button
          onClick={openAddModal}
          className="rounded-xl bg-indigo-600 dark:bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 dark:hover:bg-sky-600 active:scale-95 transition-transform shadow-sm"
        >
          + Add New User
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-sky-500"></div>
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-red-50 dark:bg-red-950/20 p-6 text-red-500 dark:text-red-400 text-center border border-red-200 dark:border-red-950">
          Error: {error}
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-3xl bg-white dark:bg-slate-900 p-12 text-center border border-slate-200 dark:border-slate-800">
          <div className="text-5xl mb-4">👥</div>
          <p className="text-slate-500 dark:text-slate-400 text-lg font-medium">No users found. Create the first user to get started.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {users.map((user) => (
            <div
              key={user.id}
              className="group rounded-3xl bg-white dark:bg-slate-900 p-6 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center gap-4 mb-4">
                  {user.profile_image ? (
                    <img src={user.profile_image} className="h-14 w-14 rounded-full object-cover border-2 border-slate-100 dark:border-slate-800 shadow-sm" alt="avatar" />
                  ) : (
                    <div className="h-14 w-14 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 dark:from-sky-400 dark:to-cyan-500 flex items-center justify-center text-white font-bold text-xl uppercase shadow-sm">
                      {user.full_name ? user.full_name[0] : user.username[0]}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h4 className="font-bold text-slate-800 dark:text-slate-100 truncate">{user.full_name || user.username}</h4>
                    <p className="text-xs text-slate-400 dark:text-slate-500">@{user.username}</p>
                    <span className={`inline-block mt-1 text-[10px] uppercase font-bold tracking-wide rounded-full px-2.5 py-0.5 ${getRoleBadgeStyle(user.role)}`}>
                      {user.role}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800/80 pt-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs">✉️</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300 truncate">{user.email || "No email"}</span>
                  </div>
                  {user.bio && (
                    <p className="text-xs italic text-slate-500 dark:text-slate-400 line-clamp-2">{user.bio}</p>
                  )}

                  {/* Social links */}
                  {(user.social_twitter || user.social_facebook || user.social_linkedin || user.social_instagram) && (
                    <div className="flex gap-3 pt-1 text-xs text-slate-400">
                      {user.social_twitter && (
                        <a href={user.social_twitter} target="_blank" rel="noreferrer" className="hover:text-sky-500 transition-colors" title="Twitter">🐦</a>
                      )}
                      {user.social_facebook && (
                        <a href={user.social_facebook} target="_blank" rel="noreferrer" className="hover:text-blue-600 transition-colors" title="Facebook">📘</a>
                      )}
                      {user.social_linkedin && (
                        <a href={user.social_linkedin} target="_blank" rel="noreferrer" className="hover:text-blue-700 transition-colors" title="LinkedIn">🔗</a>
                      )}
                      {user.social_instagram && (
                        <a href={user.social_instagram} target="_blank" rel="noreferrer" className="hover:text-pink-500 transition-colors" title="Instagram">📷</a>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2 mt-5 border-t border-slate-100 dark:border-slate-800/80 pt-3">
                <button
                  onClick={() => openEditModal(user)}
                  className="flex-1 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl active:scale-95 transition-all"
                >
                  ✏️ Edit
                </button>
                <button
                  onClick={() => openResetPasswordModal(user)}
                  className="px-3 py-2 text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-950/40 rounded-xl active:scale-95 transition-all"
                  title="Reset password"
                >
                  🔑
                </button>
                <button
                  onClick={() => handleDelete(user.id)}
                  className="px-3 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 hover:bg-rose-100 dark:hover:bg-rose-950/40 rounded-xl active:scale-95 transition-all"
                  title="Delete user"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-6 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                {editingUser ? "Edit User Profile" : "Create New User"}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Avatar upload */}
              <div className="flex flex-col items-center gap-3">
                {formData.profile_image ? (
                  <img src={formData.profile_image} className="h-20 w-20 rounded-full object-cover border-2 border-slate-200 dark:border-slate-700 shadow-sm" alt="avatar" />
                ) : (
                  <div className="h-20 w-20 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 dark:from-sky-400 dark:to-cyan-500 flex items-center justify-center text-white text-3xl shadow-sm">
                    👤
                  </div>
                )}
                <label className="cursor-pointer text-xs text-sky-600 dark:text-sky-400 font-semibold hover:underline">
                  Upload profile photo
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                </label>
              </div>

              {/* Core fields */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">Username *</label>
                  <input
                    type="text"
                    required
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none"
                    disabled={!!editingUser}
                  />
                </div>
                {!editingUser && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">Password *</label>
                    <input
                      type="password"
                      required
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">Role</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none"
                  >
                    <option value="cashier">Cashier</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">Full Name</label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">Biography</label>
                <textarea
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  rows={2}
                  className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none resize-none"
                />
              </div>

              {/* Social links */}
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2">Social Profiles</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase mb-0.5">Twitter</label>
                    <input
                      type="text"
                      value={formData.social_twitter}
                      placeholder="https://twitter.com/..."
                      onChange={(e) => setFormData({ ...formData, social_twitter: e.target.value })}
                      className="block w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-300 dark:placeholder-slate-600 outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase mb-0.5">Facebook</label>
                    <input
                      type="text"
                      value={formData.social_facebook}
                      placeholder="https://facebook.com/..."
                      onChange={(e) => setFormData({ ...formData, social_facebook: e.target.value })}
                      className="block w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-300 dark:placeholder-slate-600 outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase mb-0.5">LinkedIn</label>
                    <input
                      type="text"
                      value={formData.social_linkedin}
                      placeholder="https://linkedin.com/in/..."
                      onChange={(e) => setFormData({ ...formData, social_linkedin: e.target.value })}
                      className="block w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-300 dark:placeholder-slate-600 outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase mb-0.5">Instagram</label>
                    <input
                      type="text"
                      value={formData.social_instagram}
                      placeholder="https://instagram.com/..."
                      onChange={(e) => setFormData({ ...formData, social_instagram: e.target.value })}
                      className="block w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-300 dark:placeholder-slate-600 outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-xl bg-indigo-600 dark:bg-sky-500 py-3 text-sm font-semibold text-white hover:bg-indigo-700 dark:hover:bg-sky-600 active:scale-95 transition-transform disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 py-3 px-6 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Password Reset Modal ── */}
      {passwordResetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setPasswordResetOpen(false)} />
          <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-6 border border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
              Reset Password for <span className="text-sky-500">@{resettingUser?.username}</span>
            </h3>

            <form onSubmit={handlePasswordReset} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">New Password</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none"
                  placeholder="Enter new password"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-xl bg-amber-500 dark:bg-amber-600 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 dark:hover:bg-amber-700 active:scale-95 transition-transform disabled:opacity-50"
                >
                  {saving ? "Resetting..." : "Reset Password"}
                </button>
                <button
                  type="button"
                  onClick={() => setPasswordResetOpen(false)}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 py-2.5 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
