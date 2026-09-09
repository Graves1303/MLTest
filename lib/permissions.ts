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

/** Is `viewer` this employee's direct manager? */
export async function isDirectManagerOf(viewerId: string, employeeId: string) {
  const managerId = await getManagerId(employeeId);
  return managerId === viewerId;
}

/**
 * Can `viewer` see this employee's roster record (name/title/level/manager)?
 * HR admins see everyone. A manager sees themself and their direct reports.
 * Everyone sees themself.
 */
export async function canViewRosterEntry(viewer: CurrentUser, employeeId: string) {
  if (viewer.isHrAdmin) return true;
  if (viewer.id === employeeId) return true;
  return isDirectManagerOf(viewer.id, employeeId);
}

/**
 * Can `viewer` read a given review (employeeId + reviewerType)?
 * - Self review: the employee, their direct manager, or HR can read it.
 * - Manager review: the manager who owns it or HR can always read it.
 *   The employee can only read it once their manager has explicitly marked
 *   it "discussed" — not just submitted — so a manager can submit freely
 *   and still hold it until after the 1:1 conversation.
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
    return isDirectManagerOf(viewer.id, employeeId);
  }

  // reviewerType === "manager"
  if (await isDirectManagerOf(viewer.id, employeeId)) return true;
  if (viewer.id === employeeId) return reviewStatus === "submitted" && !!discussed;
  return false;
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
 * HR admins get everyone; everyone else gets themself + direct reports.
 */
export async function visibleEmployeeIds(viewer: CurrentUser): Promise<string[] | "all"> {
  if (viewer.isHrAdmin) return "all";
  const reports = await db.select({ id: users.id }).from(users).where(eq(users.managerId, viewer.id));
  return [viewer.id, ...reports.map((r) => r.id)];
}
