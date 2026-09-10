"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import CategoryPanel from "@/components/CategoryPanel";
import ScaleLegend from "@/components/ScaleLegend";
import {
  VALUES_ITEMS,
  COMPETENCY_ITEMS,
  VALUES_DEFINITIONS,
  COMPETENCY_DEFINITIONS,
  computeSummary,
  type RatingMap,
} from "@/lib/domain";

type Draft = {
  values: RatingMap;
  valuesComments: string;
  competencies: RatingMap;
  competenciesComments: string;
  status: "none" | "draft" | "submitted";
  submittedAt: string | null;
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

export default function UpwardReviewPage() {
  const [managerName, setManagerName] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstLoad = useRef(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await api.get("/api/upward/draft");
        setManagerName(res.managerName);
        setDraft(res.draft);
      } finally {
        firstLoad.current = true;
        setLoading(false);
      }
    })();
  }, []);

  const summary = draft ? computeSummary(draft) : computeSummary(null);

  const persist = useCallback(async (data: Draft, submit: boolean) => {
    setSaveState("saving");
    setSaveError(null);
    try {
      await api.put("/api/upward/draft", {
        values: data.values,
        valuesComments: data.valuesComments,
        competencies: data.competencies,
        competenciesComments: data.competenciesComments,
      });
      if (submit) {
        const res = await api.post("/api/upward/submit", { reopen: false });
        setDraft((d) => (d ? { ...d, status: res.status, submittedAt: new Date().toISOString() } : d));
      }
      setSaveState("saved");
    } catch (err: any) {
      setSaveState("error");
      setSaveError(err.message || "Couldn't save.");
    }
  }, []);

  async function reopen() {
    await api.post("/api/upward/submit", { reopen: true });
    setDraft((d) => (d ? { ...d, status: "draft" } : d));
  }

  useEffect(() => {
    if (loading || !draft || draft.status === "submitted") return;
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => persist(draft, false), 900);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  if (loading) return <div className="text-center text-[var(--ink-soft)] text-sm py-16">Loading…</div>;

  if (!managerName) {
    return (
      <div>
        <Link href="/dashboard" className="text-[var(--ink-soft)] text-sm font-semibold inline-flex items-center gap-1.5 mb-5">
          ← Back to dashboard
        </Link>
        <p className="text-[var(--ink-soft)] text-sm italic">No manager is on file for your account yet.</p>
      </div>
    );
  }

  if (!draft) return null;
  const readOnly = draft.status === "submitted";

  function changeItem(catKey: "values" | "competencies", item: string, value: number | null) {
    setDraft((d) => (d ? { ...d, [catKey]: { ...d[catKey], [item]: value } } : d));
  }
  function changeComments(key: "valuesComments" | "competenciesComments", value: string) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  return (
    <div>
      <Link href="/dashboard" className="text-[var(--ink-soft)] text-sm font-semibold inline-flex items-center gap-1.5 mb-5">
        ← Back to dashboard
      </Link>

      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div>
          <div className="font-[family-name:var(--font-display)] text-[11px] uppercase tracking-wide text-[var(--horizon)] mb-1">
            Upward review · anonymous
          </div>
          <h2 className="font-[family-name:var(--font-headline)] text-2xl mb-1">{managerName}</h2>
          <div className="text-[var(--ink-soft)] text-[13.5px]">
            Your response is never linked to your name — only aggregated, anonymized results are ever shared.
          </div>
        </div>
        <div className="bg-[var(--paper)] border border-black/10 rounded-lg px-5 py-3 text-center min-w-[140px]">
          <div className="font-[family-name:var(--font-display)] text-[28px] font-semibold leading-none" style={{ color: gradeColor(summary.overallGrade) }}>
            {summary.overallScore == null ? "—" : summary.overallScore.toFixed(2)}
          </div>
          <div className="font-[family-name:var(--font-display)] text-xs font-semibold mt-1" style={{ color: gradeColor(summary.overallGrade) }}>
            {summary.overallGrade || "Not yet scored"}
          </div>
        </div>
      </div>

      {readOnly && (
        <div className="flex items-center gap-2.5 bg-[var(--pine)]/10 text-[var(--ink)] border border-[var(--pine)]/25 rounded-lg px-3.5 py-2.5 text-[13px] font-semibold mb-5">
          <span>Submitted anonymously {draft.submittedAt ? new Date(draft.submittedAt).toLocaleDateString() : ""}</span>
          <button type="button" onClick={reopen} className="ml-auto underline text-xs font-semibold">
            Reopen for edits
          </button>
        </div>
      )}

      <ScaleLegend />

      <CategoryPanel label="Values" items={VALUES_ITEMS} ratings={draft.values} comments={draft.valuesComments} readOnly={readOnly} definitions={VALUES_DEFINITIONS} onChangeItem={(item, v) => changeItem("values", item, v)} onChangeComments={(v) => changeComments("valuesComments", v)} />
      <CategoryPanel label="Competencies" items={COMPETENCY_ITEMS} ratings={draft.competencies} comments={draft.competenciesComments} readOnly={readOnly} definitions={COMPETENCY_DEFINITIONS} onChangeItem={(item, v) => changeItem("competencies", item, v)} onChangeComments={(v) => changeComments("competenciesComments", v)} />

      <div className="flex items-center justify-between gap-4 flex-wrap mt-2">
        <span className="font-[family-name:var(--font-display)] text-[12.5px] text-[var(--ink-soft)]">
          {saveState === "saving" && "Saving…"}
          {saveState === "saved" && "All changes saved"}
          {saveState === "error" && (saveError || "Couldn't save — try again")}
        </span>
        {!readOnly && (
          <div className="flex gap-2.5">
            <button type="button" onClick={() => persist(draft, false)} className="rounded-lg px-4 py-2.5 text-sm font-semibold border border-black/20 bg-white">
              Save draft
            </button>
            <button
              type="button"
              disabled={!draft.valuesComments.trim() || !draft.competenciesComments.trim()}
              onClick={() => persist(draft, true)}
              className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--horizon)" }}
            >
              Submit anonymously
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
