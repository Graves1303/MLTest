"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import StatusPill from "@/components/StatusPill";

type Row = {
  id: string;
  name: string;
  title: string | null;
  level: string | null;
  managerId: string | null;
  selfStatus: string;
  managerStatus: string;
};

export default function DashboardPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [isHrAdmin, setIsHrAdmin] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const [me, dash] = await Promise.all([api.get("/api/auth/me"), api.get("/api/dashboard")]);
      setViewerId(me.id);
      setIsHrAdmin(me.isHrAdmin);
      setRows(dash);
    } catch (err: any) {
      setError(err.message);
    }
  }

  const filtered = (rows || []).filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div>
      <div className="pb-7">
        <h1 className="font-[family-name:var(--font-headline)] font-bold text-[32px] leading-tight mb-2.5">
          Performance Reviews
        </h1>
        <p className="text-[var(--ink-soft)] text-base mb-5">
          Complete a self review, upward review, and any assigned peer or direct report reviews.
        </p>
        {viewerId && (
          <div className="flex flex-wrap gap-2.5">
            <Link
              href={`/review/${viewerId}/self`}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
              style={{ background: "var(--horizon)" }}
            >
              Start or continue my self review
            </Link>
            <Link
              href="/peer-feedback"
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold border border-black/20 bg-white"
            >
              Give peer feedback
            </Link>
            <Link
              href="/upward-review"
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold border border-black/20 bg-white"
            >
              Review my manager
            </Link>
          </div>
        )}
      </div>

      <section className="bg-white border border-black/10 rounded-xl p-5">
        <header className="flex items-center justify-between gap-3 mb-1.5 flex-wrap">
          <h3 className="font-[family-name:var(--font-display)] font-semibold text-base">Roster</h3>
          <input
            type="text"
            placeholder="Filter by name..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="border border-black/15 rounded-md px-3 py-1.5 text-[13px] w-[200px]"
          />
        </header>

        {error && <div className="text-[var(--clay)] text-sm font-semibold py-3">{error}</div>}
        {!error && rows === null && <div className="text-[var(--ink-soft)] text-sm py-8 text-center">Loading roster…</div>}
        {!error && rows !== null && filtered.length === 0 && (
          <p className="text-[var(--ink-soft)] text-[13.5px] italic py-3">
            {rows.length === 0 ? "No one's visible to you yet. Ask HR to add people to the roster." : "No matches for that name."}
          </p>
        )}

        {!error && filtered.length > 0 && (
          <div className="mt-2">
            <div className="hidden sm:grid grid-cols-[1.3fr_1.2fr_0.9fr_1.1fr_1.4fr] gap-2.5 pb-2 font-[family-name:var(--font-display)] text-[11px] uppercase tracking-wide text-[var(--ink-soft)]">
              <div>Name</div>
              <div>Title</div>
              <div>Self</div>
              <div>Manager review</div>
              <div />
            </div>
            {filtered.map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-1 sm:grid-cols-[1.3fr_1.2fr_0.9fr_1.1fr_1.4fr] gap-2.5 items-center py-3 border-t border-black/[0.08]"
              >
                <div className="font-semibold">
                  {r.name} {r.id === viewerId && <span className="text-[var(--ink-soft)] font-normal text-xs">(you)</span>}
                </div>
                <div className="text-[13.5px] text-[var(--ink-soft)]">{r.title || "—"}</div>
                <div>
                  <StatusPill status={r.selfStatus} />
                </div>
                <div>
                  <StatusPill status={r.managerStatus} />
                </div>
                <div className="flex gap-3 flex-wrap">
                  {r.id !== viewerId && (r.managerId === viewerId || isHrAdmin) && (
                    <Link href={`/review/${r.id}/manager`} className="text-[var(--horizon)] font-semibold text-[13px] hover:text-[var(--horizon-bright)]">
                      Manager review
                    </Link>
                  )}
                  <Link href={`/summary/${r.id}`} className="text-[var(--horizon)] font-semibold text-[13px] hover:text-[var(--horizon-bright)]">
                    Summary
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
