import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import type { CurrentUser } from "@/lib/auth";

/**
 * Before a manager's review of someone can be shared with that person, the
 * manager's own manager (the "skip-level") has to approve it. Example: Corinne
 * approves Jillian's review of Bella before Jillian can share it with Bella.
 * An HR admin can approve in the skip-level's place, so a review never gets
 * stuck waiting on someone who's away.
 */
export type Approver = { id: string; name: string };

/** The manager's manager, or null if the employee's manager is at the top of the org (then no approval is needed). */
export async function getApprover(employeeId: string): Promise<Approver | null> {
  const emp = (await db.select({ managerId: users.managerId }).from(users).where(eq(users.id, employeeId)).limit(1))[0];
  if (!emp?.managerId) return null;
  const mgr = (await db.select({ managerId: users.managerId }).from(users).where(eq(users.id, emp.managerId)).limit(1))[0];
  if (!mgr?.managerId) return null;
  const approver = (await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, mgr.managerId)).limit(1))[0];
  // Guard against a loop in bad data (A manages B manages A): nobody approves a review about themself.
  if (!approver || approver.id === employeeId) return null;
  return approver;
}

export type ReviewForApproval = {
  status: string;
  reviewerId: string;
  discussed: boolean;
  approvedById: string | null;
  approvedAt: Date | string | null;
};

/**
 * Who may approve (or withdraw approval of) this review: the approver, or an
 * HR admin — but never the person the review is about, and never whoever wrote it.
 */
export function mayApprove(viewer: CurrentUser, approver: Approver, employeeId: string, review: { reviewerId: string } | null) {
  if (viewer.id === employeeId) return false;
  if (review && viewer.id === review.reviewerId) return false;
  return viewer.id === approver.id || viewer.isHrAdmin;
}

export type ApprovalView = {
  /** An approval step applies to this review. */
  required: boolean;
  /** not_ready = nothing submitted yet; pending = waiting for the approver; approved; not_required = no approver above the manager, or shared before approvals existed. */
  status: "not_ready" | "pending" | "approved" | "not_required";
  approverName: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  canApprove: boolean;
  canWithdraw: boolean;
  /** True while the manager must wait: they can't share the review yet. */
  blocksSharing: boolean;
};

export async function buildApprovalView(viewer: CurrentUser, employeeId: string, review: ReviewForApproval & { reviewerId: string } | null): Promise<ApprovalView> {
  const approver = await getApprover(employeeId);
  const none: ApprovalView = { required: false, status: "not_required", approverName: null, approvedByName: null, approvedAt: null, canApprove: false, canWithdraw: false, blocksSharing: false };
  if (!approver) return none;

  const submitted = review?.status === "submitted";
  const approved = !!review?.approvedAt;
  let status: ApprovalView["status"];
  if (!submitted) status = "not_ready";
  else if (approved) status = "approved";
  else if (review?.discussed) status = "not_required"; // was shared before approvals existed
  else status = "pending";

  let approvedByName: string | null = null;
  if (approved && review?.approvedById) {
    const who = (await db.select({ name: users.name }).from(users).where(eq(users.id, review.approvedById)).limit(1))[0];
    approvedByName = who?.name || "a former employee";
  }

  const may = !!review && mayApprove(viewer, approver, employeeId, review);
  return {
    required: status !== "not_required",
    status,
    approverName: approver.name,
    approvedByName,
    approvedAt: review?.approvedAt ? new Date(review.approvedAt).toISOString() : null,
    canApprove: submitted && status === "pending" && may,
    canWithdraw: submitted && status === "approved" && !review?.discussed && may,
    blocksSharing: status === "pending",
  };
}

/**
 * The raw approval columns never go out with a review. Approval status is
 * reported through the separate, permission-aware approval object instead —
 * so, for example, the employee a review is about can't see who approved it.
 */
export function withoutApprovalFields<T extends object>(row: T) {
  const { approvedById, approvedAt, ...rest } = row as T & { approvedById?: unknown; approvedAt?: unknown };
  return rest as Omit<T, "approvedById" | "approvedAt">;
}
