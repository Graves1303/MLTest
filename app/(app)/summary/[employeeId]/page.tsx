"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { computeSummary, type RatingMap, type Goal } from "@/lib/domain";

type ReviewData = {
  values: RatingMap;
  valuesComments: string;
  competencies: RatingMap;
  competenciesComments: string;
  summary: string;
  goals: Goal[];
  status: string;
} | null;

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

export default function SummaryPage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const [employee, setEmployee] = useState<{ name: string; title: string | null; level: string | null } | null>(null);
  const [selfReview, setSelfReview] = useState<ReviewData>(null);
  const [managerReview, setManagerReview] = useState<ReviewData>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.get(`/api/summary/${employeeId}`);
        setEmployee(data.employee);
        setSelfReview(data.selfReview);
        setManagerReview(data.managerReview);
      } catch (err: any) {
        setError(err.message || "Couldn't load this summary.");
      } finally {
        setLoading(false);
      }
    })();
  }, [employeeId]);

  if (loading) return <div className="text-center text-[var(--ink-soft)] text-sm py-16">Loading summary…</div>;

  if (error) {
    return (
      <div>
        <Link href="/dashboard" className="text-[var(--ink-soft)] text-sm font-semibold inline-flex items-center gap-1.5 mb-5">
          ← Back to dashboard
        </Link>
        <div className="bg-white border border-black/10 rounded-xl p-8 text-center max-w-md mx-auto">
          <h2 className="font-[family-name:var(--font-display)] text-lg mb-2">Not available</h2>
          <p className="text-[var(--ink-soft)] text-sm">{error}</p>
        </div>
      </div>
    );
  }

  const selfSummary = computeSummary(selfReview);
  const mgrSummary = computeSummary(managerReview);

  const rows: { label: string; key: "valuesOverall" | "competenciesOverall" }[] = [
    { label: "Values", key: "valuesOverall" },
    { label: "Competencies", key: "competenciesOverall" },
  ];

  const allGoals = [
    ...(selfReview?.goals || []).map((g) => ({ ...g, owner: "Employee" })),
    ...(managerReview?.goals || []).map((g) => ({ ...g, owner: "Manager" })),
  ];

  return (
    <div>
      <Link href="/dashboard" className="text-[var(--ink-soft)] text-sm font-semibold inline-flex items-center gap-1.5 mb-5">
        ← Back to dashboard
      </Link>

      <div className="mb-5">
        <div className="font-[family-name:var(--font-display)] text-[11px] uppercase tracking-wide text-[var(--horizon)] mb-1">
          Review summary
        </div>
        <h2 className="font-[family-name:var(--font-display)] text-2xl mb-1">{employee?.name}</h2>
        <div className="text-[var(--ink-soft)] text-[13.5px]">
          {employee?.title || "—"} · Level: {employee?.level || "—"}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3.5 mb-2">
        <div className="flex-1 bg-[var(--paper)] border border-black/10 rounded-lg px-5 py-3 text-center">
          <div className="font-[family-name:var(--font-display)] text-[11px] uppercase tracking-wide text-[var(--ink-soft)]">Self</div>
          <div className="font-[family-name:var(--font-display)] text-[28px] font-semibold leading-none" style={{ color: gradeColor(selfSummary.overallGrade) }}>
            {fmt(selfSummary.overallScore)}
          </div>
          <div className="font-[family-name:var(--font-display)] text-xs font-semibold mt-1" style={{ color: gradeColor(selfSummary.overallGrade) }}>
            {selfReview ? selfSummary.overallGrade || "Not yet scored" : "Not visible / not started"}
          </div>
        </div>
        <div className="flex-1 bg-[var(--paper)] border border-black/10 rounded-lg px-5 py-3 text-center">
          <div className="font-[family-name:var(--font-display)] text-[11px] uppercase tracking-wide text-[var(--ink-soft)]">Manager</div>
          <div className="font-[family-name:var(--font-display)] text-[28px] font-semibold leading-none" style={{ color: gradeColor(mgrSummary.overallGrade) }}>
            {fmt(mgrSummary.overallScore)}
          </div>
          <div className="font-[family-name:var(--font-display)] text-xs font-semibold mt-1" style={{ color: gradeColor(mgrSummary.overallGrade) }}>
            {managerReview ? mgrSummary.overallGrade || "Not yet scored" : "Not visible / not started"}
          </div>
        </div>
      </div>
      <p className="text-[var(--ink-soft)] text-[13px] italic mb-6">
        Self and manager scores are calculated independently — use any gap between them as a starting point for the
        1:1 conversation, not an average. A manager review still in draft won't appear here for the employee until
        it's submitted.
      </p>

      <section className="bg-white border border-black/10 rounded-xl p-5 mb-4">
        <h3 className="font-[family-name:var(--font-display)] font-semibold text-base mb-2">Category overalls</h3>
        <div className="grid grid-cols-[1fr_100px_100px] font-[family-name:var(--font-display)] text-[11px] uppercase text-[var(--ink-soft)] tracking-wide pb-2">
          <div />
          <div className="text-center">Self</div>
          <div className="text-center">Manager</div>
        </div>
        {rows.map((row) => (
          <div key={row.key} className="grid grid-cols-[1fr_100px_100px] items-center py-2.5 border-t border-black/[0.07]">
            <div className="text-[14.5px]">{row.label}</div>
            <div className="font-[family-name:var(--font-display)] text-sm font-semibold text-center">{fmt(selfSummary[row.key])}</div>
            <div className="font-[family-name:var(--font-display)] text-sm font-semibold text-center">{fmt(mgrSummary[row.key])}</div>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <section className="bg-white border border-black/10 rounded-xl p-5">
          <h3 className="font-[family-name:var(--font-display)] font-semibold text-base mb-3">Employee comments</h3>
          {(["valuesComments", "competenciesComments", "summary"] as const).map((k, i) => (
            <div key={k} className="mb-3">
              <div className="font-[family-name:var(--font-display)] text-[11px] uppercase tracking-wide text-[var(--ink-soft)]">
                {["Values", "Competencies", "Summary"][i]}
              </div>
              <p className="text-sm mt-1">{selfReview?.[k] || "—"}</p>
            </div>
          ))}
        </section>
        <section className="bg-white border border-black/10 rounded-xl p-5">
          <h3 className="font-[family-name:var(--font-display)] font-semibold text-base mb-3">Manager comments</h3>
          {(["valuesComments", "competenciesComments", "summary"] as const).map((k, i) => (
            <div key={k} className="mb-3">
              <div className="font-[family-name:var(--font-display)] text-[11px] uppercase tracking-wide text-[var(--ink-soft)]">
                {["Values", "Competencies", "Summary"][i]}
              </div>
              <p className="text-sm mt-1">{managerReview?.[k] || "—"}</p>
            </div>
          ))}
        </section>
      </div>

      <section className="bg-white border border-black/10 rounded-xl p-5">
        <h3 className="font-[family-name:var(--font-display)] font-semibold text-base mb-3">Goals</h3>
        {allGoals.length === 0 && <p className="text-[var(--ink-soft)] text-[13.5px] italic">No goals recorded yet.</p>}
        {allGoals.map((g, i) => (
          <div key={i} className="flex items-center gap-3 py-2 border-t border-black/[0.07] first:border-t-0">
            <span
              className="inline-flex rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold"
              style={{ color: "var(--horizon)", borderColor: "var(--horizon)" }}
            >
              {g.owner}
            </span>
            <span className="flex-1 text-sm">{g.text || "—"}</span>
            <span className="font-[family-name:var(--font-display)] text-xs text-[var(--ink-soft)]">{g.timeline || "—"}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
