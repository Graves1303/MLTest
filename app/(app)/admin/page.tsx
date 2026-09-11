"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import ImportRosterPanel from "@/components/ImportRosterPanel";
import { LEVEL_CONTEXTS, contextForLevel } from "@/lib/domain";

type UserRow = {
  id: string;
  email: string;
  name: string;
  title: string | null;
  level: string | null;
  levelContext: string | null;
  isHrAdmin: boolean;
  managerId: string | null;
};

function randomPassword() {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6).toUpperCase();
}

export default function AdminPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [resetPasswordId, setResetPasswordId] = useState<string | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetNotice, setResetNotice] = useState<{ name: string; email: string; password: string } | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [form, setForm] = useState({
    email: "",
    name: "",
    title: "",
    level: "",
    managerId: "",
    isHrAdmin: false,
    temporaryPassword: randomPassword(),
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdInfo, setCreatedInfo] = useState<{ name: string; email: string; temporaryPassword: string } | null>(null);

  function passwordMailto(email: string, name: string, password: string) {
    const subject = encodeURIComponent("Your Marine Layer Performance Review login");
    const body =
      `Hi ${name.split(" ")[0]},\n\n` +
      `You've been added to the Marine Layer performance review system.\n\n` +
      `Your temporary password is: ${password}\n\n` +
      `You'll be asked to set a new password the first time you sign in.\n\nThanks!`;
    return `mailto:${email}?subject=${subject}&body=${encodeURIComponent(body)}`;
  }

  useEffect(() => {
    loadRoster();
  }, []);

  async function loadRoster() {
    try {
      const data = await api.get("/api/users");
      setRows(data);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    setCreatedInfo(null);
    try {
      await api.post("/api/users", {
        ...form,
        managerId: form.managerId || null,
      });
      setCreatedInfo({ name: form.name, email: form.email, temporaryPassword: form.temporaryPassword });
      setForm({
        email: "",
        name: "",
        title: "",
        level: "",
        managerId: "",
        isHrAdmin: false,
        temporaryPassword: randomPassword(),
      });
      await loadRoster();
    } catch (err: any) {
      setCreateError(err.message || "Couldn't create that person.");
    } finally {
      setCreating(false);
    }
  }

  async function updateUser(id: string, patch: Partial<UserRow>) {
    try {
      await api.patch(`/api/users/${id}`, patch);
      await loadRoster();
    } catch (err: any) {
      setError(err.message);
    }
  }

  function openResetPassword(id: string) {
    setResetPasswordId(resetPasswordId === id ? null : id);
    setNewPasswordValue(randomPassword());
    setResetNotice(null);
    setResetError(null);
  }

  async function submitResetPassword(id: string, name: string, email: string) {
    setResettingPassword(true);
    setResetError(null);
    setResetNotice(null);
    try {
      await api.post(`/api/users/${id}/reset-password`, { newPassword: newPasswordValue });
      setResetNotice({ name, email, password: newPasswordValue });
    } catch (err: any) {
      setResetError(err.message || "Couldn't reset that password.");
    } finally {
      setResettingPassword(false);
    }
  }

  async function deleteUser(id: string) {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/api/users/${id}`);
      setConfirmDeleteId(null);
      await loadRoster();
    } catch (err: any) {
      setDeleteError(err.message || "Couldn't delete that person.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <h2 className="font-[family-name:var(--font-display)] text-2xl mb-1">Roster admin</h2>
      <p className="text-[var(--ink-soft)] text-sm mb-6">
        Add people to the roster and set who reports to whom. Access to reviews is derived from these relationships —
        there's no separate permissions list to keep in sync.
      </p>

      <button
        type="button"
        onClick={() => setShowImport((v) => !v)}
        className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold border border-black/20 bg-white mb-6"
      >
        {showImport ? "Close import" : "Import roster from CSV"}
      </button>

      {showImport && (
        <ImportRosterPanel
          existingEmails={new Set(rows.map((r) => r.email.toLowerCase()))}
          onDone={() => setShowImport(false)}
          onImported={loadRoster}
        />
      )}

      <section className="bg-white border border-black/10 rounded-xl p-5 mb-6">
        <h3 className="font-[family-name:var(--font-display)] font-semibold text-base mb-3">Add a person</h3>
        <form onSubmit={createUser} className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <label className="block">
            <span className="block text-xs font-semibold text-[var(--ink-soft)] mb-1.5">Name</span>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border border-black/18 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-[var(--ink-soft)] mb-1.5">Email</span>
            <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full border border-black/18 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-[var(--ink-soft)] mb-1.5">Title</span>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full border border-black/18 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-[var(--ink-soft)] mb-1.5">Level</span>
            <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} className="w-full border border-black/18 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">— Select level —</option>
              {LEVEL_CONTEXTS.map((l) => (
                <option key={l.level} value={l.level}>{l.level}</option>
              ))}
            </select>
          </label>
          {form.level && (
            <label className="block sm:col-span-2">
              <span className="block text-xs font-semibold text-[var(--ink-soft)] mb-1.5">Level context</span>
              <div className="w-full border border-black/12 rounded-lg px-3 py-2 text-[13px] text-[var(--ink-soft)] italic bg-[var(--paper)]">
                {contextForLevel(form.level)}
              </div>
            </label>
          )}
          <label className="block">
            <span className="block text-xs font-semibold text-[var(--ink-soft)] mb-1.5">Manager</span>
            <select value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })} className="w-full border border-black/18 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">No manager (top of org)</option>
              {rows.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 mt-6">
            <input type="checkbox" checked={form.isHrAdmin} onChange={(e) => setForm({ ...form, isHrAdmin: e.target.checked })} />
            <span className="text-sm">HR admin (sees everyone)</span>
          </label>
          <label className="block sm:col-span-2">
            <span className="block text-xs font-semibold text-[var(--ink-soft)] mb-1.5">Temporary password</span>
            <div className="flex gap-2">
              <input value={form.temporaryPassword} onChange={(e) => setForm({ ...form, temporaryPassword: e.target.value })} className="flex-1 border border-black/18 rounded-lg px-3 py-2 text-sm font-[family-name:var(--font-display)]" />
              <button type="button" onClick={() => setForm({ ...form, temporaryPassword: randomPassword() })} className="border border-black/18 rounded-lg px-3 text-xs font-semibold">
                Regenerate
              </button>
            </div>
            <p className="text-[12px] text-[var(--ink-soft)] mt-1">They'll be asked to change this the first time they sign in.</p>
          </label>

          {createError && <div className="sm:col-span-2 text-[var(--clay)] text-[13px] font-semibold">{createError}</div>}
          {createdInfo && (
            <div className="sm:col-span-2 bg-[rgba(90,96,106,0.08)] rounded-lg p-3">
              <p className="text-[var(--pine)] text-[13px] font-semibold mb-1.5">
                {createdInfo.name} was added. Share this temporary password with them: {createdInfo.temporaryPassword}
              </p>
              <a
                href={passwordMailto(createdInfo.email, createdInfo.name, createdInfo.temporaryPassword)}
                className="text-[var(--horizon)] text-[13px] font-semibold underline"
              >
                Open a pre-filled email to send it
              </a>
            </div>
          )}

          <button
            type="submit"
            disabled={creating}
            className="sm:col-span-2 self-start inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--horizon)" }}
          >
            {creating ? "Adding…" : "Add to roster"}
          </button>
        </form>
      </section>

      <section className="bg-white border border-black/10 rounded-xl p-5">
        <h3 className="font-[family-name:var(--font-display)] font-semibold text-base mb-3">Everyone on the roster</h3>
        {error && <div className="text-[var(--clay)] text-sm font-semibold mb-3">{error}</div>}
        {rows.map((r) => (
          <div key={r.id} className="py-3 border-t border-black/[0.08] first:border-t-0">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="font-semibold text-sm">
                  {r.name} {r.isHrAdmin && <span className="ml-1.5 text-[11px] font-semibold text-[var(--horizon)]">HR ADMIN</span>}
                </div>
                <div className="text-[13px] text-[var(--ink-soft)]">
                  {r.email} · {r.title || "no title"} · Manager: {rows.find((m) => m.id === r.managerId)?.name || "none"}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => openResetPassword(r.id)}
                  className="text-[var(--horizon)] text-[13px] font-semibold"
                >
                  {resetPasswordId === r.id ? "Close" : "Reset password"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(editingId === r.id ? null : r.id)}
                  className="text-[var(--horizon)] text-[13px] font-semibold"
                >
                  {editingId === r.id ? "Close" : "Edit"}
                </button>
                <button
                  type="button"
                  onClick={() => { setConfirmDeleteId(confirmDeleteId === r.id ? null : r.id); setDeleteError(null); }}
                  className="text-[var(--clay)] text-[13px] font-semibold"
                >
                  {confirmDeleteId === r.id ? "Cancel" : "Delete"}
                </button>
              </div>
            </div>
            {confirmDeleteId === r.id && (
              <div className="mt-3 bg-[rgba(198,58,63,0.06)] border border-[rgba(198,58,63,0.25)] rounded-lg p-3.5 max-w-md">
                <p className="text-[13px] text-[var(--ink)] mb-2.5">
                  Delete <strong>{r.name}</strong>? This removes their account, their self and manager reviews, and
                  their peer/upward review data. Anyone reporting to them will show "no manager" until reassigned.
                  This can't be undone.
                </p>
                {deleteError && <div className="text-[var(--clay)] text-[13px] font-semibold mb-2">{deleteError}</div>}
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => deleteUser(r.id)}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: "var(--clay)" }}
                >
                  {deleting ? "Deleting…" : "Yes, delete permanently"}
                </button>
              </div>
            )}
            {resetPasswordId === r.id && (
              <div className="mt-3 bg-[var(--paper)] rounded-lg p-3.5 max-w-md">
                <p className="text-[13px] text-[var(--ink-soft)] mb-2.5">
                  Set a new password for {r.name}. They'll be asked to change it the first time they sign in with it.
                </p>
                <div className="flex gap-2 mb-2.5">
                  <input
                    value={newPasswordValue}
                    onChange={(e) => setNewPasswordValue(e.target.value)}
                    className="flex-1 border border-black/18 rounded-lg px-3 py-2 text-sm font-[family-name:var(--font-display)]"
                  />
                  <button
                    type="button"
                    onClick={() => setNewPasswordValue(randomPassword())}
                    className="border border-black/18 rounded-lg px-3 text-xs font-semibold"
                  >
                    Regenerate
                  </button>
                </div>
                {resetError && <div className="text-[var(--clay)] text-[13px] font-semibold mb-2">{resetError}</div>}
                {resetNotice && (
                  <div className="mb-2">
                    <p className="text-[var(--pine)] text-[13px] font-semibold mb-1">
                      New password set for {resetNotice.name}. Share this with them: {resetNotice.password}
                    </p>
                    <a
                      href={passwordMailto(resetNotice.email, resetNotice.name, resetNotice.password)}
                      className="text-[var(--horizon)] text-[13px] font-semibold underline"
                    >
                      Open a pre-filled email to send it
                    </a>
                  </div>
                )}
                <button
                  type="button"
                  disabled={resettingPassword || newPasswordValue.length < 8}
                  onClick={() => submitResetPassword(r.id, r.name, r.email)}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: "var(--horizon)" }}
                >
                  {resettingPassword ? "Setting…" : "Set password"}
                </button>
              </div>
            )}
            {editingId === r.id && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[var(--paper)] rounded-lg p-3.5">
                <label className="block">
                  <span className="block text-xs font-semibold text-[var(--ink-soft)] mb-1">Level</span>
                  <select
                    defaultValue={r.level || ""}
                    onChange={(e) => updateUser(r.id, { level: e.target.value } as any)}
                    className="w-full border border-black/18 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    <option value="">— Select level —</option>
                    {LEVEL_CONTEXTS.map((l) => (
                      <option key={l.level} value={l.level}>{l.level}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold text-[var(--ink-soft)] mb-1">Manager</span>
                  <select
                    defaultValue={r.managerId || ""}
                    onChange={(e) => updateUser(r.id, { managerId: e.target.value || null } as any)}
                    className="w-full border border-black/18 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    <option value="">No manager (top of org)</option>
                    {rows.filter((m) => m.id !== r.id).map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </label>
                {r.level && contextForLevel(r.level) && (
                  <div className="sm:col-span-2 text-[13px] text-[var(--ink-soft)] italic">
                    Level context: {contextForLevel(r.level)}
                  </div>
                )}
                <label className="flex items-center gap-2 mt-1">
                  <input
                    type="checkbox"
                    defaultChecked={r.isHrAdmin}
                    onChange={(e) => updateUser(r.id, { isHrAdmin: e.target.checked })}
                  />
                  <span className="text-sm">HR admin (sees everyone)</span>
                </label>
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
