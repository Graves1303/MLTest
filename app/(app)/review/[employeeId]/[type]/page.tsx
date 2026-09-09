"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api-client";
import CategoryPanel from "@/components/CategoryPanel";
import GoalsEditor from "@/components/GoalsEditor";
import PeerFeedbackPanel from "@/components/PeerFeedbackPanel";
import ScaleLegend from "@/components/ScaleLegend";
import {
  VALUES_ITEMS,
  COMPETENCY_ITEMS,
  VALUES_DEFINITIONS,
  COMPETENCY_DEFINITIONS,
  emptyRatingMap,
  computeSummary,
  type RatingMap,
  type Goal,
} from "@/lib/domain";

type ReviewState = {
  values: RatingMap;
  valuesComments: string;
  competencies: RatingMap;
  competenciesComments: string;
  summary: string;
  goals: Goal[];
  status: "draft" | "submitted";
  submittedAt: string | null;
  discussed?: boolean;
  discussedAt?: string | null;
};

function emptyReview(): ReviewState {
  return {
    values: emptyRatingMap(VALUES_ITEMS),
    valuesComments: "",
    competencies: emptyRatingMap(COMPETENCY_ITEMS),
    competenciesComments: "",
    summary: "",
    goals: [],
    status: "draft",
    submittedAt: null,
  };
}

function gradeColor(grade: string | null) {
  switch (grade) {
    case "Exceeds Expectations": return "var(--pine)";
    case "Meets Expectations": return "var(--horizon-bright)";
    case "Needs Improvement": return "var(--sand)";
    case "Not Meeting Expectations": return "var(--clay)";
    default: return "var(--ink-soft)";
  }
}

export default function ReviewFormPage() {
  const params = useParams<{ employeeId: string; type: string }>();
  const router = useRouter();
  const { employeeId, type } = params;
  const reviewType = type === "manager" ? "manager" : "self";

  const [employee, setEmployee] = useState<{ name: string; title: string | null; level: string | null; levelContext: string | null; managerName: string | null } | null>(null);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [discussedSaving, setDiscussedSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstLoad = useRef(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setAccessError(null);
      try {
        const [emp, reviewRes] = await Promise.all([
          api.get(`/api/users/${employeeId}`),
          api.get(`/api/reviews/${employeeId}/${reviewType}`),
        ]);
        if (cancelled) return;
        setEmployee(emp);
        setReview(reviewRes.review ? { ...reviewRes.review } : emptyReview());
      } catch (err: any) {
        if (!cancelled) setAccessError(err.message || "You don't have access to this review.");
      } finally {
        if (!cancelled) {
          firstLoad.current = true;
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [employeeId, reviewType]);

  const summary = review ? computeSummary(review) : computeSummary(null);

  const persist = useCallback(
    async (data: ReviewState, opts: { submit?: boolean; reopen?: boolean }) => {
      setSaveState("saving");
      setSaveError(null);
      try {
        const res = await api.put(`/api/reviews/${employeeId}/${reviewType}`, {
          values: data.values,
          valuesComments: data.valuesComments,
          competencies: data.competencies,
          competenciesComments: data.competenciesComments,
          summary: data.summary,
          goals: data.goals,
          submit: !!opts.submit,
          reopen: !!opts.reopen,
        });
        setReview({ ...res.review });
        setSaveState("saved");
      } catch (err: any) {
        setSaveState("error");
        setSaveError(err.message || "Couldn't save.");
      }
    },
    [employeeId, reviewType]
  );

  async function markDiscussed(discussed: boolean) {
    setDiscussedSaving(true);
    try {
      await api.post(`/api/reviews/${employeeId}/discussed`, { discussed });
      setReview((r) => (r ? { ...r, discussed, discussedAt: discussed ? new Date().toISOString() : null } : r));
    } catch (err: any) {
      setSaveError(err.message || "Couldn't update that.");
    } finally {
      setDiscussedSaving(false);
    }
  }

  // Debounced silent autosave on edits (skipped for the very first load, and never while locked/read-only).
  useEffect(() => {
    if (loading || !review || review.status === "submitted") return;
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      persist(review, {});
    }, 900);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review]);

  if (loading) return <div className="text-center text-[var(--ink-soft)] text-sm py-16">Loading review…</div>;

  if (accessError) {
    return (
      <div>
        <Link href="/dashboard" className="text-[var(--ink-soft)] text-sm font-semibold inline-flex items-center gap-1.5 mb-5">
          ← Back to dashboard
        </Link>
        <div className="bg-white border border-black/10 rounded-xl p-8 text-center max-w-md mx-auto">
          <h2 className="font-[family-name:var(--font-display)] text-lg mb-2">Not available</h2>
          <p className="text-[var(--ink-soft)] text-sm">{accessError}</p>
        </div>
      </div>
    );
  }

  if (!review || !employee) return null;

  const readOnly = review.status === "submitted";

  return (
    <div>
      <Link href="/dashboard" className="text-[var(--ink-soft)] text-sm font-semibold inline-flex items-center gap-1.5 mb-5">
        ← Back to dashboard
      </Link>

      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div>
          <div className="font-[family-name:var(--font-display)] text-[11px] uppercase tracking-wide text-[var(--horizon)] mb-1">
            {reviewType === "self" ? "Self review" : "Manager review"}
          </div>
          <h2 className="font-[family-name:var(--font-headline)] text-2xl mb-1">{employee.name}</h2>
          <div className="text-[var(--ink-soft)] text-[13.5px]">
            {employee.title || "—"} · Level: {employee.level || "—"} · Manager: {employee.managerName || "—"}
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
        <div className="flex items-center gap-2.5 bg-[var(--pine)]/10 text-[var(--pine)] border border-[var(--pine)]/25 rounded-lg px-3.5 py-2.5 text-[13px] font-semibold mb-5">
          <span>Submitted {review.submittedAt ? new Date(review.submittedAt).toLocaleDateString() : ""}</span>
          <button type="button" onClick={() => persist(review, { reopen: true })} className="ml-auto underline text-xs font-semibold">
            Reopen for edits
          </button>
        </div>
      )}

      {readOnly && reviewType === "manager" && (
        <div
          className="flex items-center gap-2.5 flex-wrap rounded-lg px-3.5 py-2.5 text-[13px] mb-5"
          style={
            review.discussed
              ? { background: "rgba(90,96,106,0.1)", border: "1px solid rgba(90,96,106,0.25)", color: "var(--ink)" }
              : { background: "rgba(198,58,63,0.06)", border: "1px solid rgba(198,58,63,0.25)", color: "var(--ink)" }
          }
        >
          {review.discussed ? (
            <>
              <span>
                Marked as discussed with {employee?.name || "the employee"} on{" "}
                {review.discussedAt ? new Date(review.discussedAt).toLocaleDateString() : ""}. They can now see this
                review.
              </span>
              <button type="button" onClick={() => markDiscussed(false)} disabled={discussedSaving} className="ml-auto underline text-xs font-semibold">
                Undo
              </button>
            </>
          ) : (
            <>
              <span>{employee?.name || "The employee"} can't see this review yet. Mark it discussed after your 1:1 conversation.</span>
              <button
                type="button"
                onClick={() => markDiscussed(true)}
                disabled={discussedSaving}
                className="ml-auto rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
                style={{ background: "var(--horizon)" }}
              >
                {discussedSaving ? "Saving…" : "Mark as discussed"}
              </button>
            </>
          )}
        </div>
      )}

      <ScaleLegend />

      <CategoryPanel
        label="Values"
        items={VALUES_ITEMS}
        ratings={review.values}
        comments={review.valuesComments}
        readOnly={readOnly}
        definitions={VALUES_DEFINITIONS}
        onChangeItem={(item, v) => setReview((r) => (r ? { ...r, values: { ...r.values, [item]: v } } : r))}
        onChangeComments={(v) => setReview((r) => (r ? { ...r, valuesComments: v } : r))}
      />
      <CategoryPanel
        label="Competencies"
        items={COMPETENCY_ITEMS}
        ratings={review.competencies}
        comments={review.competenciesComments}
        readOnly={readOnly}
        definitions={COMPETENCY_DEFINITIONS}
        onChangeItem={(item, v) => setReview((r) => (r ? { ...r, competencies: { ...r.competencies, [item]: v } } : r))}
        onChangeComments={(v) => setReview((r) => (r ? { ...r, competenciesComments: v } : r))}
      />

      <section className="bg-white border border-black/10 rounded-xl p-5 mb-4">
        <header className="mb-1.5">
          <h3 className="font-[family-name:var(--font-display)] font-semibold text-base">Summary</h3>
        </header>
        <p className="text-[13px] text-[var(--ink-soft)] italic mb-3">
          Highlight specific wins, opportunities, and overall performance impact.
        </p>
        <textarea
          disabled={readOnly}
          rows={4}
          placeholder="Summarize the overall picture..."
          value={review.summary || ""}
          onChange={(e) => setReview((r) => (r ? { ...r, summary: e.target.value } : r))}
          className="w-full border border-black/15 rounded-lg px-3 py-2.5 text-sm bg-[var(--paper)] text-[var(--ink)] disabled:opacity-75"
        />
      </section>

      <GoalsEditor
        goals={review.goals}
        readOnly={readOnly}
        ownerLabel={reviewType === "self" ? "Employee's goals" : "Manager's goals"}
        onChange={(goals) => setReview((r) => (r ? { ...r, goals } : r))}
      />

      {reviewType === "manager" && <PeerFeedbackPanel employeeId={employeeId} employeeName={employee.name} />}

      <div className="flex items-center justify-between gap-4 flex-wrap mt-2">
        <span className="font-[family-name:var(--font-display)] text-[12.5px] text-[var(--ink-soft)]">
          {saveState === "saving" && "Saving…"}
          {saveState === "saved" && "All changes saved"}
          {saveState === "error" && (saveError || "Couldn't save — try again")}
        </span>
        {!readOnly && (
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => persist(review, {})}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold border border-black/20 bg-white"
            >
              Save draft
            </button>
            <button
              type="button"
              onClick={() => persist(review, { submit: true })}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
              style={{ background: "var(--horizon)" }}
            >
              Submit review
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
