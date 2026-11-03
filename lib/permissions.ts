import { db } from "./db";
import { users } from "./schema";
import { eq } from "drizzle-orm";
import type { CurrentUser } from "./auth";

/**
 * Every function here is meant to be called from a server-side API route
 * or server component, AFTER getCurrentUser() has verified the session.
 * Nothing here should ever be duplicated as the sole check on the client —
 * the client-side UI just hides buttons; these functions are the real gate.
 */

async function getManagerId(employeeId: string): Promise<string | null> {
  const rows = await db.select({ managerId: users.managerId }).from(users).where(eq(users.id, employeeId)).limit(1);
  return rows[0]?.managerId ?? null;
}

/**
 * How many levels below a manager their visibility reaches, beyond direct
 * reports. 0 = direct reports only. 1 = also their reports' reports (a
 * manager of managers). Use Infinity for the entire chain beneath them.
 */
export const SKIP_LEVELS_VISIBLE = 1;
const MAX_HOPS = 1 + SKIP_LEVELS_VISIBLE;

export type ReportingRelationship = "direct" | "skip";

/**
 * Walks up the reporting line from `employeeId`; returns how many levels
 * above them `viewerId` sits (1 = direct manager, 2 = their manager's
 * manager...) or null if not within reach. Guarded against loops in bad data.
 */
function hopsUpTo(parentOf: Map<string, string | null>, employeeId: string, viewerId: string): number | null {
  const seen = new Set<string>([employeeId]);
  let current = employeeId;
  for (let hops = 1; hops <= MAX_HOPS; hops++) {
    const mgr = parentOf.get(current) ?? null;
    if (!mgr || seen.has(mgr)) return null;
    if (mgr === viewerId) return hops;
    seen.add(mgr);
    current = mgr;
  }
  return null;
}

async function loadParentMap() {
  const rows = await db.select({ id: users.id, managerId: users.managerId }).from(users);
  return new Map(rows.map((r) => [r.id, r.managerId] as [string, string | null]));
}

/**
 * Everyone beneath `viewerId` within reach, keyed by id: "direct" for direct
 * reports, "skip" for people further down (a report's report).
 */
export async function reportingRelationships(viewerId: string): Promise<Record<string, ReportingRelationship>> {
  const parentOf = await loadParentMap();
  const result: Record<string, ReportingRelationship> = {};
  for (const id of parentOf.keys()) {
    if (id === viewerId) continue;
    const hops = hopsUpTo(parentOf, id, viewerId);
    if (hops !== null) result[id] = hops === 1 ? "direct" : "skip";
  }
  return result;
}

/** Is `viewer` above this employee in the reporting line, but not their direct manager? */
export async function isSkipLevelManagerOf(viewerId: string, employeeId: string) {
  const hops = hopsUpTo(await loadParentMap(), employeeId, viewerId);
  return hops !== null && hops >= 2;
}

/** Is `viewer` this employee's direct manager? */
export async function isDirectManagerOf(viewerId: string, employeeId: string) {
  const managerId = await getManagerId(employeeId);
  return managerId === viewerId;
}

/**
 * Can `viewer` see this employee's roster record (name/title/level/manager)?
 * HR admins see everyone. A manager sees themself, their direct reports, and
 * (a manager of managers) their reports' reports. Everyone sees themself.
 */
export async function canViewRosterEntry(viewer: CurrentUser, employeeId: string) {
  if (viewer.isHrAdmin) return true;
  if (viewer.id === employeeId) return true;
  return hopsUpTo(await loadParentMap(), employeeId, viewer.id) !== null;
}

/**
 * Can `viewer` read a given review (employeeId + reviewerType)?
 * - Self review: the employee, their direct manager, or HR can read it.
 * - Manager review: the manager who owns it or HR can always read it.
 *   The employee can only read it once their manager has explicitly marked
 *   it "discussed" — not just submitted — so a manager can submit freely
 *   and still hold it until after the 1:1 conversation.
 * - A manager of managers can read either review, read-only, once it has
 *   been SUBMITTED. Drafts stay private to whoever is still writing them.
 */
export async function canReadReview(
  viewer: CurrentUser,
  employeeId: string,
  reviewerType: "self" | "manager",
  reviewStatus: "draft" | "submitted" | null,
  discussed?: boolean
) {
  if (viewer.isHrAdmin) return true;

  if (reviewerType === "self") {
    if (viewer.id === employeeId) return true;
    if (await isDirectManagerOf(viewer.id, employeeId)) return true;
  } else {
    if (await isDirectManagerOf(viewer.id, employeeId)) return true;
    if (viewer.id === employeeId) return reviewStatus === "submitted" && !!discussed;
  }

  // Everyone else who can get here is looking from higher up the reporting line.
  return reviewStatus === "submitted" && (await isSkipLevelManagerOf(viewer.id, employeeId));
}

/**
 * The promotion recommendation on a manager review is visible only to the
 * manager who wrote it and HR admins — never to the person it's about
 * (even an HR admin looking at their own review), and not to managers
 * further up the chain either.
 */
export async function canSeePromotionRecommendation(viewer: CurrentUser, employeeId: string) {
  if (viewer.id === employeeId) return false;
  if (viewer.isHrAdmin) return true;
  return isDirectManagerOf(viewer.id, employeeId);
}

/**
 * Can `viewer` write (create/edit/submit) a given review?
 * - Self review: only the employee themself.
 * - Manager review: only that employee's direct manager.
 * HR admins can write either, for corrections.
 */
export async function canWriteReview(viewer: CurrentUser, employeeId: string, reviewerType: "self" | "manager") {
  if (viewer.isHrAdmin) return true;
  if (reviewerType === "self") return viewer.id === employeeId;
  return isDirectManagerOf(viewer.id, employeeId);
}

/**
 * Which employee IDs can `viewer` see on a roster / dashboard listing?
 * HR admins get everyone; everyone else gets themself, their direct reports,
 * and their reports' reports.
 */
export async function visibleEmployeeIds(viewer: CurrentUser): Promise<string[] | "all"> {
  if (viewer.isHrAdmin) return "all";
  return [viewer.id, ...Object.keys(await reportingRelationships(viewer.id))];
}
