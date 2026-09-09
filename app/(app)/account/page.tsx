"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";

export default function AccountPage() {
  const [mustChange, setMustChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/api/auth/me").then((u) => setMustChange(u.mustChangePassword));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (newPassword !== confirm) {
      setError("New passwords don't match.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/api/auth/change-password", { currentPassword, newPassword });
      setSuccess(true);
      setMustChange(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2 className="font-[family-name:var(--font-display)] text-2xl mb-1">Your account</h2>
      <p className="text-[var(--ink-soft)] text-sm mb-6">Update your password below.</p>

      {mustChange && (
        <div className="bg-[var(--sand)]/10 border border-[var(--sand)]/30 text-[var(--sand)] rounded-lg px-4 py-3 text-sm font-semibold mb-5">
          You're using a temporary password. Set a new one before continuing.
        </div>
      )}

      <form onSubmit={submit} className="bg-white border border-black/10 rounded-xl p-5 flex flex-col gap-4 max-w-md">
        <label className="block">
          <span className="block text-xs font-semibold text-[var(--ink-soft)] mb-1.5 font-[family-name:var(--font-display)]">
            Current password
          </span>
          <input
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full border border-black/18 rounded-lg px-3 py-2.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-[var(--ink-soft)] mb-1.5 font-[family-name:var(--font-display)]">
            New password (min 8 characters)
          </span>
          <input
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full border border-black/18 rounded-lg px-3 py-2.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-[var(--ink-soft)] mb-1.5 font-[family-name:var(--font-display)]">
            Confirm new password
          </span>
          <input
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full border border-black/18 rounded-lg px-3 py-2.5 text-sm"
          />
        </label>
        {error && <div className="text-[var(--clay)] text-[13px] font-semibold">{error}</div>}
        {success && <div className="text-[var(--pine)] text-[13px] font-semibold">Password updated.</div>}
        <button
          type="submit"
          disabled={saving}
          className="self-start inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--horizon)" }}
        >
          {saving ? "Saving…" : "Update password"}
        </button>
      </form>
    </div>
  );
}
