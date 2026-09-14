"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api-client";
import CategoryPanel from "@/components/CategoryPanel";
import GoalsEditor from "@/components/GoalsEditor";
import PeerFeedbackPanel from "@/components/PeerFeedbackPanel";
import UpwardSummaryPanel from "@/components/UpwardSummaryPanel";
import ScaleLegend from "@/components/ScaleLegend";
import {
  emptyCategoryData,
  computeCategorySummary,
  type CategoryData,
  type CategoryDef,
  type Goal,
} from "@/lib/domain";

type ReviewState = {
  categoryData: CategoryData;
  summary: string;
  goals: Goal[];
  promotionEligible?: "" | "yes" | "no" | "six_months";
  status: "draft" | "submitted";
  locked?: boolean;
  submittedAt: string | null;
  discussed?: boolean;
  discussedAt?: string | null;
};

function emptyReview(categories: CategoryDef[]): ReviewState {
  return {
    categoryData: emptyCategoryData(categories),
    summary: "",
    goals: [],
    promotionEligible: "",
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
  const { employeeId, type } = params;
  const reviewType = type === "manager" ? "manager" : "self";

  const [employee, setEmployee] = useState<{ name: string; title: string | null; level: string | null; levelContext: string | null; managerName: string | null } | null>(null);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [categories, setCategories] = useState<CategoryDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [discussedSaving, setDiscussedSaving] = useState(false);
  const [cycleLocked, setCycleLocked] = useState(false);
  const [cycleName, setCycleName] = useState<string | null>(null);
  const [priorGoals, setPriorGoals] = useState<Goal[]>([]);
  const [viewerIsHrAdmin, setViewerIsHrAdmin] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstLoad = useRef(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setAccessError(null);
      try {
        const [emp, reviewRes, me] = await Promise.all([
          api.get(`/api/users/${employeeId}`),
          api.get(`/api/reviews/${employeeId}/${reviewType}`),
          api.get("/api/auth/me").catch(() => ({ isHrAdmin: false })),
        ]);
        if (cancelled) return;
        setEmployee(emp);
        setCategories(reviewRes.template.categories);
        setReview(reviewRes.review ? { ...reviewRes.review } : emptyReview(reviewRes.template.categories));
        setCycleLocked(reviewRes.cycle?.status === "closed");
        setCycleName(reviewRes.cycle?.name || null);
        setPriorGoals(reviewRes.priorGoals || []);
        setViewerIsHrAdmin(!!me.isHrAdmin);
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

  const summary = computeCategorySummary(review?.categoryData, categories.map((c) => c.key));

  const persist = useCallback(
    async (data: ReviewState, opts: { submit?: boolean; reopen?: boolean }) => {
      setSaveState("saving");
      setSaveError(null);
      try {
        const res = await api.put(`/api/reviews/${employeeId}/${reviewType}`, {
          categoryData: data.categoryData,
          summary: data.summary,
          goals: data.goals,
          promotionEligible: data.promotionEligible || "",
          submit: !!opts.submit,
          reopen: !!opts.reopen,
        });
        setReview({ ...res.review });
        setCategories(res.template.categories);
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

  async function unlockReview() {
    setUnlocking(true);
    try {
      await api.post(`/api/reviews/${employeeId}/${reviewType}/unlock`, {});
      setReview((r) => (r ? { ...r, locked: false } : r));
    } catch (err: any) {
      setSaveError(err.message || "Couldn't unlock that.");
    } finally {
      setUnlocking(false);
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

  const readOnly = review.status === "submitted" || cycleLocked;
  const canSubmit = categories.every((c) => review.categoryData[c.key]?.comments?.trim()) && review.summary.trim();

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
          {employee.levelContext && (
            <div className="mt-2 max-w-lg bg-[var(--paper)] border border-black/10 rounded-lg px-3 py-2 text-[12.5px] text-[var(--ink-soft)] italic leading-snug">
              {employee.level ? `${employee.level}: ` : ""}{employee.levelContext}
            </div>
          )}
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

      {cycleLocked && (
        <div className="flex items-center gap-2.5 bg-[rgba(198,58,63,0.06)] text-[var(--clay)] border border-[rgba(198,58,63,0.25)] rounded-lg px-3.5 py-2.5 text-[13px] font-semibold mb-5">
          {cycleName ? `The ${cycleName} cycle has been closed by HR.` : "This review cycle has been closed by HR."} No changes can be made until it's reopened.
        </div>
      )}

      {review.status === "submitted" && (
        <div className="flex items-center gap-2.5 flex-wrap bg-[var(--pine)]/10 text-[var(--pine)] border border-[var(--pine)]/25 rounded-lg px-3.5 py-2.5 text-[13px] font-semibold mb-5">
          <span>Submitted {review.submittedAt ? new Date(review.submittedAt).toLocaleDateString() : ""}</span>
          {cycleLocked ? null : review.locked ? (
            viewerIsHrAdmin ? (
              <button type="button" disabled={unlocking} onClick={unlockReview} className="ml-auto underline text-xs font-semibold disabled:opacity-50">
                {unlocking ? "Unlocking…" : "Unlock this review (admin)"}
              </button>
            ) : (
              <span className="ml-auto text-[12.5px] italic">Locked — ask HR to unlock it if you need to change it.</span>
            )
          ) : (
            <button type="button" onClick={() => persist(review, { reopen: true })} className="ml-auto underline text-xs font-semibold">
              Reopen for edits
            </button>
          )}
        </div>
      )}

      {review.status === "submitted" && reviewType === "manager" && (
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
              <button type="button" onClick={() => markDiscussed(false)} disabled={discussedSaving || cycleLocked} className="ml-auto underline text-xs font-semibold">
                Undo
              </button>
            </>
          ) : (
            <>
              <span>{employee?.name || "The employee"} can't see this review yet. Mark it discussed after your 1:1 conversation.</span>
              <button
                type="button"
                onClick={() => markDiscussed(true)}
                disabled={discussedSaving || cycleLocked}
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

      {categories.map((cat) => (
        <CategoryPanel
          key={cat.key}
          label={cat.label}
          items={cat.items}
          ratings={review.categoryData[cat.key]?.ratings || {}}
          comments={review.categoryData[cat.key]?.comments || ""}
          readOnly={readOnly}
          definitions={cat.definitions}
          onChangeItem={(item, v) =>
            setReview((r) =>
              r ? { ...r, categoryData: { ...r.categoryData, [cat.key]: { ...r.categoryData[cat.key], ratings: { ...r.categoryData[cat.key]?.ratings, [item]: v } } } } : r
            )
          }
          onChangeComments={(v) =>
            setReview((r) => (r ? { ...r, categoryData: { ...r.categoryData, [cat.key]: { ...r.categoryData[cat.key], comments: v } } } : r))
          }
        />
      ))}

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

      {priorGoals.length > 0 && (
        <section className="bg-[var(--paper)] border border-black/10 rounded-xl p-5 mb-4">
          <h3 className="font-[family-name:var(--font-display)] font-semibold text-base mb-1">Goals from last cycle</h3>
          <p className="text-[13px] text-[var(--ink-soft)] italic mb-3">For reference only — this cycle's goals below start blank.</p>
          <div className="flex flex-col gap-2">
            {priorGoals.map((g) => (
              <div key={g.id} className="flex items-center gap-3 py-2 border-t border-black/[0.07] first:border-t-0">
                <span className="flex-1 text-sm">{g.text || "—"}</span>
                <span className="font-[family-name:var(--font-display)] text-xs text-[var(--ink-soft)]">{g.timeline || "—"}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <GoalsEditor
        goals={review.goals}
        readOnly={readOnly}
        ownerLabel={reviewType === "self" ? "Employee's goals" : "Manager's goals"}
        onChange={(goals) => setReview((r) => (r ? { ...r, goals } : r))}
      />

      {reviewType === "manager" && (
        <section className="bg-white border border-black/10 rounded-xl p-5 mb-4">
          <h3 className="font-[family-name:var(--font-display)] font-semibold text-base mb-1">Eligible for promotion?</h3>
          <p className="text-[13px] text-[var(--ink-soft)] italic mb-3">
            Visible only to you and HR admins — {employee.name.split(" ")[0]} will never see this section, even after
            this review is discussed with them.
          </p>
          <div className="flex gap-2">
            {(["yes", "no", "six_months"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                disabled={readOnly}
                onClick={() => setReview((r) => (r ? { ...r, promotionEligible: r.promotionEligible === opt ? "" : opt } : r))}
                className="rounded-lg px-4 py-2 text-sm font-semibold border disabled:cursor-default"
                style={
                  review.promotionEligible === opt
                    ? { background: "var(--horizon)", borderColor: "var(--horizon)", color: "#fff" }
                    : { background: "var(--surface)", borderColor: "rgba(0,0,0,0.18)", color: "var(--ink)" }
                }
              >
                {opt === "yes" ? "Yes" : opt === "no" ? "No" : "6 Months"}
              </button>
            ))}
          </div>
        </section>
      )}

      {reviewType === "manager" && <PeerFeedbackPanel employeeId={employeeId} employeeName={employee.name} />}

      {reviewType === "manager" && <UpwardSummaryPanel employeeId={employeeId} employeeName={employee.name} />}

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
              disabled={!canSubmit}
              onClick={() => persist(review, { submit: true })}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
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
