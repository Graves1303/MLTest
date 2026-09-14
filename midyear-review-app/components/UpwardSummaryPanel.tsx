"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";

type Summary = {
  totalReports: number;
  submittedCount: number;
  overallScore: number | null;
  overallGrade: string | null;
  entries: { id: string; valuesComments: string; competenciesComments: string }[];
};

function gradeColor(grade: string | null) {
  switch (grade) {
    case "Exceeds Expectations": return "var(--pine)";
    case "Meets Expectations": return "var(--horizon-bright)";
    case "Needs Improvement": return "var(--sand)";
    case "Not Meeting Expectations": return "var(--clay)";
    default: return "var(--ink-soft)";
  }
}

export default function UpwardSummaryPanel({ employeeId, employeeName }: { employeeId: string; employeeName: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await api.get(`/api/upward-summary/${employeeId}`);
        setSummary(res);
      } catch {
        // best-effort — this panel just doesn't render if it can't load
      } finally {
        setLoading(false);
      }
    })();
  }, [employeeId]);

  if (loading || !summary || summary.totalReports === 0) return null;

  const firstName = employeeName.split(" ")[0];
  const hasResponses = summary.submittedCount > 0;

  return (
    <section className="bg-white border border-black/10 rounded-xl p-5 mb-4">
      <header className="flex items-center justify-between gap-3 mb-1.5">
        <h3 className="font-[family-name:var(--font-display)] font-semibold text-base">Upward reviews</h3>
      </header>
      <p className="text-[13px] text-[var(--ink-soft)] mb-2.5">
        Feedback from {firstName}'s own reports about their leadership. Stored anonymously — not shown to {firstName}.
      </p>

      <div className="text-[13.5px] text-[var(--ink-soft)]">
        {summary.submittedCount} of {summary.totalReports} direct report{summary.totalReports === 1 ? "" : "s"} have responded
      </div>

      {hasResponses && (
        <>
          <div className="mt-3 flex items-center gap-2">
            <span className="font-[family-name:var(--font-display)] text-2xl font-semibold" style={{ color: gradeColor(summary.overallGrade) }}>
              {summary.overallScore == null ? "—" : summary.overallScore.toFixed(2)}
            </span>
            <span className="font-[family-name:var(--font-display)] text-[12.5px] font-semibold" style={{ color: gradeColor(summary.overallGrade) }}>
              {summary.overallGrade}
            </span>
          </div>
          <div className="flex flex-col gap-2.5 mt-3">
            {summary.entries.map((e) => (
              <div key={e.id} className="bg-[var(--paper)] border border-black/10 rounded-lg p-3.5">
                {e.valuesComments && (
                  <div className="mb-2">
                    <div className="text-[11px] uppercase tracking-wide text-[var(--ink-soft)] font-semibold">Values</div>
                    <p className="text-sm mt-0.5">{e.valuesComments}</p>
                  </div>
                )}
                {e.competenciesComments && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-[var(--ink-soft)] font-semibold">Competencies</div>
                    <p className="text-sm mt-0.5">{e.competenciesComments}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {!hasResponses && (
        <p className="text-[13px] italic text-[var(--ink-soft)] mt-2.5">No responses yet.</p>
      )}
    </section>
  );
}
