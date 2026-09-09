"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";

type ReviewScore = {
  status: string;
  overallScore: number | null;
  overallGrade: string | null;
  submittedAt: string | null;
};
type Row = {
  id: string;
  name: string;
  email: string;
  title: string | null;
  level: string | null;
  managerName: string | null;
  self: ReviewScore;
  manager: ReviewScore;
  cycleStatus: "complete" | "in_progress" | "not_started";
  upwardAgg: { count: number; revealed: boolean; overallScore: number | null; overallGrade: string | null };
  upwardEntries: { id: string; valuesComments: string; competenciesComments: string }[];
};

const FILTERS = [
  { key: "all", label: "Everyone" },
  { key: "complete", label: "Complete" },
  { key: "in_progress", label: "In progress" },
  { key: "not_started", label: "Not started" },
] as const;

function gradeColor(grade: string | null) {
  switch (grade) {
    case "Exceeds Expectations": return "var(--pine)";
    case "Meets Expectations": return "var(--horizon-bright)";
    case "Needs Improvement": return "var(--sand)";
    case "Not Meeting Expectations": return "var(--clay)";
    default: return "var(--ink-soft)";
  }
}
function fmt(n: number | null) {
  return n == null ? "—" : n.toFixed(2);
}
function statusLabel(s: string) {
  return s === "submitted" ? "Submitted" : s === "draft" ? "Draft" : "Not started";
}
function csvCell(value: string | number | null) {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function CycleOverviewPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [query, setQuery] = useState("");
  const [expandedUpwardId, setExpandedUpwardId] = useState<string | null>(null);

  useEffect(() => {
    api
      .get("/api/admin/cycle-report")
      .then(setRows)
      .catch((err) => setError(err.message));
  }, []);

  const stats = useMemo(() => {
    if (!rows) return null;
    const total = rows.length;
    const selfSubmitted = rows.filter((r) => r.self.status === "submitted").length;
    const managerSubmitted = rows.filter((r) => r.manager.status === "submitted").length;
    const complete = rows.filter((r) => r.cycleStatus === "complete").length;
    const notStarted = rows.filter((r) => r.cycleStatus === "not_started").length;
    return { total, selfSubmitted, managerSubmitted, complete, notStarted };
  }, [rows]);

  const filtered = (rows || [])
    .filter((r) => filter === "all" || r.cycleStatus === filter)
    .filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase()));

  function exportCsv() {
    if (!rows) return;
    const header = [
      "Name", "Email", "Title", "Level", "Manager",
      "Self status", "Self overall score", "Self overall grade", "Self submitted",
      "Manager status", "Manager overall score", "Manager overall grade", "Manager submitted",
      "Cycle status",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(
        [
          csvCell(r.name), csvCell(r.email), csvCell(r.title), csvCell(r.level), csvCell(r.managerName),
          csvCell(statusLabel(r.self.status)), csvCell(r.self.overallScore), csvCell(r.self.overallGrade), csvCell(r.self.submittedAt),
          csvCell(statusLabel(r.manager.status)), csvCell(r.manager.overallScore), csvCell(r.manager.overallGrade), csvCell(r.manager.submittedAt),
          csvCell(r.cycleStatus.replace("_", " ")),
        ].join(",")
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `midyear-review-cycle-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (error) return <div className="text-[var(--clay)] text-sm font-semibold py-6">{error}</div>;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-2xl mb-1">Cycle overview</h2>
          <p className="text-[var(--ink-soft)] text-sm">
            Track completion across the whole roster and export a snapshot for your records.
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={!rows}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--horizon)" }}
        >
          Export CSV
        </button>
      </div>

      {!rows && <div className="text-center text-[var(--ink-soft)] text-sm py-16">Loading cycle data…</div>}

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mb-6">
          {[
            { label: "People on roster", value: stats.total },
            { label: "Self reviews submitted", value: `${stats.selfSubmitted}/${stats.total}` },
            { label: "Manager reviews submitted", value: `${stats.managerSubmitted}/${stats.total}` },
            { label: "Fully complete", value: `${stats.complete}/${stats.total}` },
          ].map((s) => (
            <div key={s.label} className="bg-white border border-black/10 rounded-xl px-4 py-3.5 text-center">
              <div className="font-[family-name:var(--font-display)] text-2xl font-semibold">{s.value}</div>
              <div className="text-[12px] text-[var(--ink-soft)] mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {rows && rows.some((r) => r.upwardAgg.count > 0) && (
        <section className="bg-white border border-black/10 rounded-xl p-5 mb-6">
          <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold mb-1">Upward reviews</h3>
          <p className="text-[13px] text-[var(--ink-soft)] mb-3">
            Anonymous — individual responses stay hidden (even from admin) until at least 3 have been submitted about
            that person.
          </p>
          {rows
            .filter((r) => r.upwardAgg.count > 0)
            .map((r) => (
              <div key={r.id} className="py-3 border-t border-black/[0.08] first:border-t-0">
                <div className="flex items-center gap-4 flex-wrap">
                  <div>
                    <div className="font-semibold text-sm">{r.name}</div>
                    <div className="text-[12.5px] text-[var(--ink-soft)]">{r.title || "—"}</div>
                  </div>
                  <span
                    className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold"
                    style={r.upwardAgg.revealed ? { color: "var(--pine)", borderColor: "var(--pine)" } : { color: "var(--sand)", borderColor: "var(--sand)" }}
                  >
                    {r.upwardAgg.revealed ? "Revealed" : "Pending"}
                  </span>
                  <span className="text-[13px] text-[var(--ink-soft)]">
                    {r.upwardAgg.count} response{r.upwardAgg.count === 1 ? "" : "s"}
                  </span>
                  {r.upwardAgg.revealed && (
                    <span className="font-[family-name:var(--font-display)] text-[12.5px] font-semibold" style={{ color: gradeColor(r.upwardAgg.overallGrade) }}>
                      {fmt(r.upwardAgg.overallScore)} · {r.upwardAgg.overallGrade}
                    </span>
                  )}
                  {r.upwardAgg.revealed && (
                    <button
                      type="button"
                      onClick={() => setExpandedUpwardId(expandedUpwardId === r.id ? null : r.id)}
                      className="ml-auto text-[var(--horizon)] text-[13px] font-semibold"
                    >
                      {expandedUpwardId === r.id ? "Hide" : "View"} details
                    </button>
                  )}
                </div>
                {expandedUpwardId === r.id && (
                  <div className="flex flex-col gap-2 mt-3">
                    {r.upwardEntries.map((e) => (
                      <div key={e.id} className="bg-[var(--paper)] border border-black/10 rounded-lg p-3 text-sm">
                        {e.valuesComments && <p className="mb-1"><strong>Values:</strong> {e.valuesComments}</p>}
                        {e.competenciesComments && <p className="mb-1"><strong>Competencies:</strong> {e.competenciesComments}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
        </section>
      )}

      {rows && (
        <section className="bg-white border border-black/10 rounded-xl p-5">
          <header className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="flex gap-1.5 flex-wrap">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className="rounded-full border px-3 py-1 text-[12.5px] font-semibold"
                  style={{
                    borderColor: filter === f.key ? "var(--horizon)" : "rgba(0,0,0,0.15)",
                    color: filter === f.key ? "var(--horizon)" : "var(--ink-soft)",
                    background: filter === f.key ? "rgba(53,92,102,0.08)" : "transparent",
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Filter by name..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="border border-black/15 rounded-md px-3 py-1.5 text-[13px] w-[200px]"
            />
          </header>

          {filtered.length === 0 && <p className="text-[var(--ink-soft)] text-[13.5px] italic py-3">No matches.</p>}

          {filtered.length > 0 && (
            <>
              <div className="hidden sm:grid grid-cols-[1.2fr_1fr_1fr_1fr_0.9fr] gap-2.5 pb-2 font-[family-name:var(--font-display)] text-[11px] uppercase tracking-wide text-[var(--ink-soft)]">
                <div>Name</div>
                <div>Self review</div>
                <div>Manager review</div>
                <div>Manager</div>
                <div />
              </div>
              {filtered.map((r) => (
                <div key={r.id} className="grid grid-cols-1 sm:grid-cols-[1.2fr_1fr_1fr_1fr_0.9fr] gap-2.5 items-center py-3 border-t border-black/[0.08]">
                  <div>
                    <div className="font-semibold text-sm">{r.name}</div>
                    <div className="text-[12.5px] text-[var(--ink-soft)]">{r.title || "—"}</div>
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold">{statusLabel(r.self.status)}</div>
                    {r.self.overallScore != null && (
                      <div className="font-[family-name:var(--font-display)] text-[12.5px]" style={{ color: gradeColor(r.self.overallGrade) }}>
                        {fmt(r.self.overallScore)} · {r.self.overallGrade}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold">{statusLabel(r.manager.status)}</div>
                    {r.manager.overallScore != null && (
                      <div className="font-[family-name:var(--font-display)] text-[12.5px]" style={{ color: gradeColor(r.manager.overallGrade) }}>
                        {fmt(r.manager.overallScore)} · {r.manager.overallGrade}
                      </div>
                    )}
                  </div>
                  <div className="text-[13.5px] text-[var(--ink-soft)]">{r.managerName || "—"}</div>
                  <div>
                    <Link href={`/summary/${r.id}`} className="text-[var(--horizon)] font-semibold text-[13px] hover:text-[var(--horizon-bright)]">
                      Summary
                    </Link>
                  </div>
                </div>
              ))}
            </>
          )}
        </section>
      )}
    </div>
  );
}
