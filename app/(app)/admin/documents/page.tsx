"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api-client";

type DropboxStatus = { configured: boolean; connected: boolean; accountEmail: string | null };
type Doc = { id: string; name: string; size: number; mimeType: string; uploadedByName: string; createdAt: string };

const DROPBOX_ERROR_MESSAGES: Record<string, string> = {
  dropbox_not_configured: "Dropbox isn't set up for this app yet — add DROPBOX_APP_KEY and DROPBOX_APP_SECRET first.",
  dropbox_failed: "Something went wrong connecting to Dropbox. Please try again.",
  not_authorized: "Only HR admins can connect Dropbox.",
};

function ConnectError() {
  const params = useSearchParams();
  const code = params.get("error");
  const message = code ? DROPBOX_ERROR_MESSAGES[code] : null;
  if (!message) return null;
  return <div className="text-[var(--clay)] text-sm font-semibold mb-4">{message}</div>;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const [status, setStatus] = useState<DropboxStatus | null>(null);
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function load() {
    api.get("/api/admin/dropbox/status").then(setStatus).catch((e) => setError(e.message));
    api.get("/api/admin/documents").then(setDocs).catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      await fetch("/api/admin/documents", { method: "POST", credentials: "include", body: form }).then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Upload failed.");
      });
      load();
    } catch (err: any) {
      setError(err.message || "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await api.delete(`/api/admin/documents/${id}`);
      load();
    } catch (err: any) {
      setError(err.message || "Delete failed.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDisconnect() {
    await api.delete("/api/admin/dropbox/connect");
    load();
  }

  return (
    <div>
      <h2 className="font-[family-name:var(--font-display)] text-2xl mb-1">Documents</h2>
      <p className="text-sm text-[var(--ink-soft)] mb-6">
        Company policies and templates, stored in Dropbox. Visible to HR admins only.
      </p>

      <Suspense fallback={null}>
        <ConnectError />
      </Suspense>
      {error && <div className="text-[var(--clay)] text-sm font-semibold mb-4">{error}</div>}

      {!status ? (
        <div className="text-sm text-[var(--ink-soft)]">Loading…</div>
      ) : !status.connected ? (
        <div className="bg-white border border-black/10 rounded-xl p-6">
          <h3 className="font-[family-name:var(--font-display)] font-semibold text-base mb-1">Connect Dropbox</h3>
          <p className="text-sm text-[var(--ink-soft)] mb-4">
            {status.configured
              ? "Connect the company Dropbox account to start storing documents here."
              : "Dropbox isn't configured for this app yet — add DROPBOX_APP_KEY and DROPBOX_APP_SECRET to the environment first."}
          </p>
          <a
            href="/api/admin/dropbox/connect"
            className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white ${!status.configured ? "pointer-events-none opacity-50" : ""}`}
            style={{ background: "var(--horizon)" }}
          >
            Connect Dropbox
          </a>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between bg-white border border-black/10 rounded-xl p-4 mb-5">
            <div className="text-sm">
              Connected to <span className="font-semibold">{status.accountEmail}</span>
            </div>
            <div className="flex items-center gap-3">
              <label
                className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white cursor-pointer ${uploading ? "opacity-50 pointer-events-none" : ""}`}
                style={{ background: "var(--horizon)" }}
              >
                {uploading ? "Uploading…" : "Upload document"}
                <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
              </label>
              <button onClick={handleDisconnect} className="text-sm font-semibold text-[var(--ink-soft)]">
                Disconnect
              </button>
            </div>
          </div>

          <div className="bg-white border border-black/10 rounded-xl overflow-hidden">
            {!docs ? (
              <div className="p-6 text-sm text-[var(--ink-soft)]">Loading…</div>
            ) : docs.length === 0 ? (
              <div className="p-6 text-sm text-[var(--ink-soft)]">No documents uploaded yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--ink-soft)] border-b border-black/10">
                    <th className="px-4 py-3 font-[family-name:var(--font-display)]">Name</th>
                    <th className="px-4 py-3 font-[family-name:var(--font-display)]">Size</th>
                    <th className="px-4 py-3 font-[family-name:var(--font-display)]">Uploaded by</th>
                    <th className="px-4 py-3 font-[family-name:var(--font-display)]"></th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d) => (
                    <tr key={d.id} className="border-b border-black/5 last:border-0">
                      <td className="px-4 py-3">{d.name}</td>
                      <td className="px-4 py-3 text-[var(--ink-soft)]">{formatSize(d.size)}</td>
                      <td className="px-4 py-3 text-[var(--ink-soft)]">{d.uploadedByName}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <a href={`/api/admin/documents/${d.id}/download`} className="font-semibold mr-4" style={{ color: "var(--horizon)" }}>
                          Download
                        </a>
                        <button
                          onClick={() => handleDelete(d.id)}
                          disabled={deletingId === d.id}
                          className="font-semibold text-[var(--clay)] disabled:opacity-50"
                        >
                          {deletingId === d.id ? "Deleting…" : "Delete"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
