import { useEffect, useState } from "react";

interface User {
  id: number;
  username: string;
  role: string;
  is_active: boolean;
  full_name: string;
  email: string;
  bio: string;
  profile_image: string;
  social_github: string;
  social_twitter: string;
  social_linkedin: string;
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
    social_github: "",
    social_twitter: "",
    social_linkedin: "",
    is_active: true,
  });

  const [passwordResetOpen, setPasswordResetOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [resettingUser, setResettingUser] = useState<User | null>(null);

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
      social_github: "",
      social_twitter: "",
      social_linkedin: "",
      is_active: true,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: "", // Not used in edit unless resetting separately
      role: user.role,
      full_name: user.full_name || "",
      email: user.email || "",
      bio: user.bio || "",
      profile_image: user.profile_image || "",
      social_github: user.social_github || "",
      social_twitter: user.social_twitter || "",
      social_linkedin: user.social_linkedin || "",
      is_active: user.is_active,
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

    // Validate
    if (!formData.username.trim()) {
      alert("Username is required");
      return;
    }
    if (!isEdit && !formData.password) {
      alert("Password is required for new users");
      return;
    }

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
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete user");
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

    try {
      const res = await fetch(`/api/users/${resettingUser!.id}/reset-password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });

      if (!res.ok) throw new Error("Failed to reset password");
      setPasswordResetOpen(false);
      alert("Password reset successfully!");
    } catch (err: any) {
      alert(err.message);
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
          className="rounded-xl bg-indigo-600 dark:bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 dark:hover:bg-sky-600 active:scale-95 transition-transform"
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
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {users.map((user) => (
            <div
              key={user.id}
              className="rounded-3xl bg-white dark:bg-slate-900 p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center gap-4 mb-4">
                  {user.profile_image ? (
                    <img src={user.profile_image} className="h-14 w-14 rounded-full object-cover border border-slate-100 dark:border-slate-800" alt="avatar" />
                  ) : (
                    <div className="h-14 w-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 font-bold text-xl uppercase">
                      {user.full_name ? user.full_name[0] : user.username[0]}
                    </div>
                  )}
                  <div>
                    <h4 className="font-bold text-slate-800 dark:text-slate-100">{user.full_name || user.username}</h4>
                    <p className="text-xs text-slate-400">@{user.username}</p>
                    <span className={`inline-block mt-1 text-[10px] uppercase font-bold tracking-wide rounded px-2 py-0.5 ${
                      user.role === "admin" ? "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400" :
                      user.role === "manager" ? "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400" :
                      "bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400"
                    }`}>
                      {user.role}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400 border-t border-slate-50 dark:border-slate-800/80 pt-3">
                  <p>✉️ <span className="font-medium text-slate-800 dark:text-slate-200">{user.email || "No Email"}</span></p>
                  <p className="text-xs italic line-clamp-2">{user.bio || "No biography info provided."}</p>
                  
                  {/* Social links */}
                  <div className="flex gap-2 pt-2 text-slate-400">
                    {user.social_github && (
                      <a href={user.social_github} target="_blank" rel="noreferrer" className="hover:text-slate-900 dark:hover:text-slate-100">💻 GitHub</a>
                    )}
                    {user.social_twitter && (
                      <a href={user.social_twitter} target="_blank" rel="noreferrer" className="hover:text-slate-900 dark:hover:text-slate-100">🐦 Twitter</a>
                    )}
                    {user.social_linkedin && (
                      <a href={user.social_linkedin} target="_blank" rel="noreferrer" className="hover:text-slate-900 dark:hover:text-slate-100">🔗 LinkedIn</a>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 mt-6 border-t border-slate-50 dark:border-slate-800/80 pt-3">
                <button
                  onClick={() => openEditModal(user)}
                  className="flex-1 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 rounded-xl active:scale-95 transition-transform"
                >
                  Edit profile
                </button>
                <button
                  onClick={() => openResetPasswordModal(user)}
                  className="px-3 py-2 text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-950/40 rounded-xl active:scale-95 transition-transform"
                  title="Reset password"
                >
                  🔑
                </button>
                <button
                  onClick={() => handleDelete(user.id)}
                  className="px-3 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 hover:bg-rose-100 dark:hover:bg-rose-950/40 rounded-xl active:scale-95 transition-transform"
                  title="Delete user"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsModalOpen(false)} />
          <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-3xl shadow-xl p-6">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6">
              {editingUser ? "Edit User Profile" : "Create New User"}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex flex-col items-center gap-2 mb-4">
                {formData.profile_image ? (
                  <img src={formData.profile_image} className="h-20 w-20 rounded-full object-cover border" alt="avatar" />
                ) : (
                  <div className="h-20 w-20 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 text-3xl">
                    👤
                  </div>
                )}
                <label className="cursor-pointer text-xs text-sky-500 font-semibold hover:underline">
                  Upload profile photo
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase">Username *</label>
                  <input
                    type="text"
                    required
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm"
                    disabled={!!editingUser}
                  />
                </div>
                {!editingUser && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase">Password *</label>
                    <input
                      type="password"
                      required
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase">Role</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm"
                  >
                    <option value="cashier">Cashier</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase">Active Status</label>
                  <select
                    value={formData.is_active ? "true" : "false"}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.value === "true" })}
                    className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm"
                  >
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase">Full Name</label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase">Email Address</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase">Biography</label>
                <textarea
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  rows={2}
                  className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase">GitHub Profile</label>
                  <input
                    type="text"
                    value={formData.social_github}
                    placeholder="https://github.com/username"
                    onChange={(e) => setFormData({ ...formData, social_github: e.target.value })}
                    className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase">Twitter Profile</label>
                  <input
                    type="text"
                    value={formData.social_twitter}
                    placeholder="https://twitter.com/username"
                    onChange={(e) => setFormData({ ...formData, social_twitter: e.target.value })}
                    className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase">LinkedIn Profile</label>
                  <input
                    type="text"
                    value={formData.social_linkedin}
                    placeholder="https://linkedin.com/in/username"
                    onChange={(e) => setFormData({ ...formData, social_linkedin: e.target.value })}
                    className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-indigo-600 dark:bg-sky-500 py-3 text-sm font-semibold text-white hover:bg-indigo-700 dark:hover:bg-sky-600 active:scale-95 transition-transform"
                >
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 py-3 px-6 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {passwordResetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPasswordResetOpen(false)} />
          <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-xl p-6">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
              Reset Password for @{resettingUser?.username}
            </h3>

            <form onSubmit={handlePasswordReset} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase">New Password</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm"
                  placeholder="Enter new password"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-indigo-600 dark:bg-sky-500 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 dark:hover:bg-sky-600 active:scale-95 transition-transform"
                >
                  Reset Password
                </button>
                <button
                  type="button"
                  onClick={() => setPasswordResetOpen(false)}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 py-2.5 px-4 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
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
