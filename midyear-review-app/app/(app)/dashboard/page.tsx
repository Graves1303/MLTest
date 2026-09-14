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

type PeerAssignment = { employeeId: string; employeeName: string; submitted: boolean };

function AssignmentRow({
  type,
  subtitle,
  status,
  href,
  submittedLabel = "View",
  pendingLabel = "Start / continue",
}: {
  type: string;
  subtitle: string;
  status: string;
  href: string;
  submittedLabel?: string;
  pendingLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 border-t border-black/[0.08] first:border-t-0 flex-wrap">
      <div>
        <div className="font-semibold text-sm">{type}</div>
        <div className="text-[13px] text-[var(--ink-soft)]">{subtitle}</div>
      </div>
      <div className="flex items-center gap-3">
        <StatusPill status={status} />
        <Link href={href} className="text-[var(--horizon)] font-semibold text-[13px] hover:text-[var(--denim)]">
          {status === "submitted" ? submittedLabel : pendingLabel}
        </Link>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [isHrAdmin, setIsHrAdmin] = useState(false);
  const [viewMode, setViewMode] = useState<"mine" | "admin">("mine");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [upward, setUpward] = useState<{ managerName: string | null; draft: { status: string } | null } | null>(null);
  const [peerAssignments, setPeerAssignments] = useState<PeerAssignment[] | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const [me, dash, upwardRes, peerRes] = await Promise.all([
        api.get("/api/auth/me"),
        api.get("/api/dashboard"),
        api.get("/api/upward/draft"),
        api.get("/api/peer-assignments/mine"),
      ]);
      setViewerId(me.id);
      setIsHrAdmin(me.isHrAdmin);
      setRows(dash);
      setUpward(upwardRes);
      setPeerAssignments(peerRes);
    } catch (err: any) {
      setError(err.message);
    }
  }

  const myRow = (rows || []).find((r) => r.id === viewerId);
  const myReports = (rows || []).filter((r) => r.managerId === viewerId);

  const scoped =
    isHrAdmin && viewMode === "mine"
      ? (rows || []).filter((r) => r.id === viewerId || r.managerId === viewerId)
      : rows || [];
  const filtered = scoped.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase()));

  const hasAnyAssignment =
    myRow || upward?.managerName || myReports.length > 0 || (peerAssignments && peerAssignments.length > 0);

  return (
    <div>
      <div className="pb-7">
        <h1 className="font-[family-name:var(--font-headline)] font-bold text-[32px] leading-tight mb-2.5">
          Performance Reviews
        </h1>
        <p className="text-[var(--ink-soft)] text-base">
          Complete a self review, upward review, and any assigned peer or direct report reviews.
        </p>
      </div>

      <section className="bg-white border border-black/10 rounded-xl p-5 mb-6">
        <h3 className="font-[family-name:var(--font-display)] font-semibold text-base mb-1">Your reviews this cycle</h3>
        <p className="text-[13px] text-[var(--ink-soft)] mb-1">
          Everything assigned to you, as set by HR or your manager. Upward and peer reviews stay anonymous — only you
          can see that these are on your list.
        </p>

        {!rows && <div className="text-[var(--ink-soft)] text-sm py-8 text-center">Loading…</div>}

        {rows && (
          <div className="mt-2">
            {viewerId && (
              <AssignmentRow
                type="Self review"
                subtitle="Your own performance"
                status={myRow?.selfStatus || "none"}
                href={`/review/${viewerId}/self`}
              />
            )}

            {upward?.managerName && (
              <AssignmentRow
                type="Upward review"
                subtitle={`About ${upward.managerName} · anonymous`}
                status={upward.draft?.status || "none"}
                href="/upward-review"
              />
            )}

            {myReports.map((r) => (
              <AssignmentRow
                key={r.id}
                type="Manager review"
                subtitle={`About ${r.name}`}
                status={r.managerStatus}
                href={`/review/${r.id}/manager`}
              />
            ))}

            {(peerAssignments || []).map((p) => (
              <AssignmentRow
                key={p.employeeId}
                type="Peer feedback"
                subtitle={`About ${p.employeeName} · anonymous`}
                status={p.submitted ? "submitted" : "none"}
                href={`/peer-feedback?employeeId=${p.employeeId}&name=${encodeURIComponent(p.employeeName)}`}
                submittedLabel="View / update"
                pendingLabel="Give feedback"
              />
            ))}

            {!hasAnyAssignment && (
              <p className="text-[var(--ink-soft)] text-[13.5px] italic py-3">
                Nothing assigned to you yet for this cycle.
              </p>
            )}
          </div>
        )}
      </section>

      {isHrAdmin && (
        <div className="flex items-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => setViewMode("mine")}
            className="rounded-full px-3.5 py-1.5 text-xs font-semibold border"
            style={
              viewMode === "mine"
                ? { borderColor: "var(--horizon)", color: "var(--horizon)", background: "rgba(63,78,99,0.08)" }
                : { borderColor: "rgba(0,0,0,0.15)", color: "var(--ink-soft)", background: "transparent" }
            }
          >
            My view
          </button>
          <button
            type="button"
            onClick={() => setViewMode("admin")}
            className="rounded-full px-3.5 py-1.5 text-xs font-semibold border"
            style={
              viewMode === "admin"
                ? { borderColor: "var(--horizon)", color: "var(--horizon)", background: "rgba(63,78,99,0.08)" }
                : { borderColor: "rgba(0,0,0,0.15)", color: "var(--ink-soft)", background: "transparent" }
            }
          >
            Admin view — everyone
          </button>
        </div>
      )}

      <section className="bg-white border border-black/10 rounded-xl p-5">
        <header className="flex items-center justify-between gap-3 mb-1.5 flex-wrap">
          <h3 className="font-[family-name:var(--font-display)] font-semibold text-base">
            {isHrAdmin && viewMode === "admin" ? "Everyone" : "Direct reports"}
          </h3>
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
            {filtered.length === 0 && query.trim() === ""
              ? isHrAdmin && viewMode === "mine"
                ? "You don't manage anyone directly. Switch to Admin view to see the full roster."
                : "No one's visible to you yet. Ask HR to add people to the roster."
              : "No matches for that name."}
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
                    <Link href={`/review/${r.id}/manager`} className="text-[var(--horizon)] font-semibold text-[13px] hover:text-[var(--denim)]">
                      Manager review
                    </Link>
                  )}
                  <Link href={`/summary/${r.id}`} className="text-[var(--horizon)] font-semibold text-[13px] hover:text-[var(--denim)]">
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
