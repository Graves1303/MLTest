"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";

type ReviewScore = {
  status: string;
  overallScore: number | null;
  overallGrade: string | null;
  submittedAt: string | null;
  promotionEligible?: string;
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

type Cycle = { id: string; name: string; startDate: string; endDate: string; status: "open" | "closed"; closedAt: string | null; createdAt: string };

export default function CycleOverviewPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [query, setQuery] = useState("");
  const [expandedUpwardId, setExpandedUpwardId] = useState<string | null>(null);

  const [cycles, setCycles] = useState<Cycle[] | null>(null);
  const [currentCycleId, setCurrentCycleId] = useState<string | null>(null);
  const [viewingCycleId, setViewingCycleId] = useState<string | null>(null);
  const [confirmingCloseReopen, setConfirmingCloseReopen] = useState(false);
  const [closingOrReopening, setClosingOrReopening] = useState(false);
  const [showStartForm, setShowStartForm] = useState(false);
  const [newCycleName, setNewCycleName] = useState("");
  const [newCycleStart, setNewCycleStart] = useState("");
  const [newCycleEnd, setNewCycleEnd] = useState("");
  const [startingCycle, setStartingCycle] = useState(false);
  const [startCycleError, setStartCycleError] = useState<string | null>(null);

  const current = cycles?.find((c) => c.id === currentCycleId) || null;
  const viewing = cycles?.find((c) => c.id === viewingCycleId) || null;
  const isViewingCurrent = viewingCycleId === currentCycleId;
  const pastCycles = (cycles || []).filter((c) => c.id !== currentCycleId);

  useEffect(() => {
    loadCycles();
  }, []);

  useEffect(() => {
    if (!viewingCycleId) return;
    setRows(null);
    api
      .get(`/api/admin/cycles/${viewingCycleId}/report`)
      .then((res) => setRows(res.rows))
      .catch((err) => setError(err.message));
  }, [viewingCycleId]);

  async function loadCycles() {
    try {
      const res = await api.get("/api/admin/cycles");
      setCycles(res.cycles);
      setCurrentCycleId(res.currentCycleId);
      setViewingCycleId((prev) => prev || res.currentCycleId);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function closeOrReopenCycle() {
    setClosingOrReopening(true);
    try {
      await api.post(current?.status === "open" ? "/api/admin/cycles/close" : "/api/admin/cycles/reopen", {});
      setConfirmingCloseReopen(false);
      await loadCycles();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setClosingOrReopening(false);
    }
  }

  async function startNewCycle() {
    setStartingCycle(true);
    setStartCycleError(null);
    try {
      const res = await api.post("/api/admin/cycles", { name: newCycleName, startDate: newCycleStart, endDate: newCycleEnd });
      setShowStartForm(false);
      setNewCycleName("");
      setNewCycleStart("");
      setNewCycleEnd("");
      setViewingCycleId(res.cycle.id);
      await loadCycles();
    } catch (err: any) {
      setStartCycleError(err.message || "Couldn't start that cycle.");
    } finally {
      setStartingCycle(false);
    }
  }

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
    const promoLabel = (v: string) => (v === "yes" ? "Yes" : v === "no" ? "No" : v === "six_months" ? "6 Months" : "");
    const header = [
      "Name", "Email", "Title", "Level", "Manager",
      "Self status", "Self overall score", "Self overall grade", "Self submitted",
      "Manager status", "Manager overall score", "Manager overall grade", "Manager submitted",
      "Eligible for promotion",
      "Upward reviews collected", "Upward revealed", "Upward overall score", "Upward overall grade",
      "Cycle status",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(
        [
          csvCell(r.name), csvCell(r.email), csvCell(r.title), csvCell(r.level), csvCell(r.managerName),
          csvCell(statusLabel(r.self.status)), csvCell(r.self.overallScore), csvCell(r.self.overallGrade), csvCell(r.self.submittedAt),
          csvCell(statusLabel(r.manager.status)), csvCell(r.manager.overallScore), csvCell(r.manager.overallGrade), csvCell(r.manager.submittedAt),
          csvCell(promoLabel(r.manager.promotionEligible || "")),
          csvCell(r.upwardAgg.count),
          csvCell(r.upwardAgg.revealed ? "yes" : "no"),
          csvCell(r.upwardAgg.revealed ? r.upwardAgg.overallScore : ""),
          csvCell(r.upwardAgg.revealed ? r.upwardAgg.overallGrade : ""),
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

      {cycles && (
        <section className="border rounded-xl p-5 mb-4 bg-white border-black/10">
          {current ? (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h3 className="font-[family-name:var(--font-display)] font-semibold text-base mb-1">
                  {current.name} · {current.status === "open" ? "Open" : "Closed"}
                </h3>
                <p className="text-[13px] text-[var(--ink-soft)]">
                  {current.startDate} – {current.endDate}
                  {current.status === "open"
                    ? " — close this cycle when you're ready to freeze all reviews and start a new one."
                    : ` — closed${current.closedAt ? " " + new Date(current.closedAt).toLocaleDateString() : ""}. Nothing can be edited until you reopen it, or start the next cycle below.`}
                </p>
              </div>
              {!confirmingCloseReopen ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmingCloseReopen(true)}
                    className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white whitespace-nowrap"
                    style={{ background: current.status === "open" ? "var(--clay)" : "var(--pine)" }}
                  >
                    {current.status === "open" ? "Close this cycle" : "Reopen this cycle"}
                  </button>
                  {current.status === "closed" && (
                    <button
                      type="button"
                      onClick={() => setShowStartForm((v) => !v)}
                      className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white whitespace-nowrap"
                      style={{ background: "var(--horizon)" }}
                    >
                      Start new cycle
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={closingOrReopening}
                    onClick={closeOrReopenCycle}
                    className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 whitespace-nowrap"
                    style={{ background: current.status === "open" ? "var(--clay)" : "var(--pine)" }}
                  >
                    {closingOrReopening ? "Working…" : current.status === "open" ? "Yes, close it" : "Yes, reopen it"}
                  </button>
                  <button type="button" onClick={() => setConfirmingCloseReopen(false)} className="rounded-lg px-4 py-2.5 text-sm font-semibold border border-black/20 bg-white">
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h3 className="font-[family-name:var(--font-display)] font-semibold text-base mb-1">No cycle started yet</h3>
                <p className="text-[13px] text-[var(--ink-soft)]">Start your first review cycle to let people begin their reviews.</p>
              </div>
              <button type="button" onClick={() => setShowStartForm(true)} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white whitespace-nowrap" style={{ background: "var(--horizon)" }}>
                Start a cycle
              </button>
            </div>
          )}

          {showStartForm && (
            <div className="mt-4 pt-4 border-t border-black/10 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="block">
                <span className="block text-xs font-semibold text-[var(--ink-soft)] mb-1.5">Cycle name</span>
                <input value={newCycleName} onChange={(e) => setNewCycleName(e.target.value)} placeholder="e.g. H1 2027" className="w-full border border-black/18 rounded-lg px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-[var(--ink-soft)] mb-1.5">Start date</span>
                <input type="date" value={newCycleStart} onChange={(e) => setNewCycleStart(e.target.value)} className="w-full border border-black/18 rounded-lg px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-[var(--ink-soft)] mb-1.5">End date</span>
                <input type="date" value={newCycleEnd} onChange={(e) => setNewCycleEnd(e.target.value)} className="w-full border border-black/18 rounded-lg px-3 py-2 text-sm" />
              </label>
              {startCycleError && <div className="sm:col-span-3 text-[var(--clay)] text-[13px] font-semibold">{startCycleError}</div>}
              <div className="sm:col-span-3 flex gap-2">
                <button
                  type="button"
                  disabled={startingCycle || !newCycleName.trim() || !newCycleStart || !newCycleEnd}
                  onClick={startNewCycle}
                  className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: "var(--horizon)" }}
                >
                  {startingCycle ? "Starting…" : "Create & start this cycle"}
                </button>
                <button type="button" onClick={() => setShowStartForm(false)} className="rounded-lg px-4 py-2.5 text-sm font-semibold border border-black/20 bg-white">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {pastCycles.length > 0 && (
        <section className="border rounded-xl p-4 mb-6 bg-white border-black/10">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[13px] font-semibold text-[var(--ink-soft)]">Viewing:</span>
            <select
              value={viewingCycleId || ""}
              onChange={(e) => setViewingCycleId(e.target.value)}
              className="border border-black/18 rounded-lg px-3 py-1.5 text-[13px] bg-white"
            >
              {current && <option value={current.id}>{current.name} (current)</option>}
              {pastCycles.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {!isViewingCurrent && (
              <span className="text-[12.5px] italic text-[var(--ink-soft)]">Read-only snapshot of a closed cycle.</span>
            )}
          </div>
        </section>
      )}

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
            Stored anonymously, not shown to the person being reviewed — shown here as soon as any response comes in.
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
                    {r.manager.promotionEligible && (
                      <div
                        className="inline-flex mt-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold"
                        style={
                          r.manager.promotionEligible === "yes"
                            ? { color: "var(--pine)", borderColor: "var(--pine)" }
                            : r.manager.promotionEligible === "six_months"
                            ? { color: "var(--sand)", borderColor: "var(--sand)" }
                            : { color: "var(--ink-soft)", borderColor: "rgba(0,0,0,0.2)" }
                        }
                      >
                        Promotion: {r.manager.promotionEligible === "yes" ? "Yes" : r.manager.promotionEligible === "six_months" ? "6 Months" : "No"}
                      </div>
                    )}
                  </div>
                  <div className="text-[13.5px] text-[var(--ink-soft)]">{r.managerName || "—"}</div>
                  <div>
                    <Link href={`/summary/${r.id}`} className="text-[var(--horizon)] font-semibold text-[13px] hover:text-[var(--denim)]">
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
