import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reviews, users } from "@/lib/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { visibleEmployeeIds, reportingRelationships } from "@/lib/permissions";
import { getCurrentCycle } from "@/lib/cycles";

export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const visible = await visibleEmployeeIds(viewer);

  const people =
    visible === "all"
      ? await db
          .select({ id: users.id, name: users.name, title: users.title, level: users.level, managerId: users.managerId })
          .from(users)
      : await db
          .select({ id: users.id, name: users.name, title: users.title, level: users.level, managerId: users.managerId })
          .from(users)
          .where(inArray(users.id, visible));

  const currentCycle = await getCurrentCycle();
  const ids = people.map((p) => p.id);
  const reviewRows =
    ids.length && currentCycle
      ? await db
          .select({
            employeeId: reviews.employeeId,
            reviewerType: reviews.reviewerType,
            status: reviews.status,
            discussed: reviews.discussed,
            approvedAt: reviews.approvedAt,
          })
          .from(reviews)
          .where(and(inArray(reviews.employeeId, ids), eq(reviews.cycleId, currentCycle.id)))
      : [];

  const statusByEmployee: Record<string, { self?: string; manager?: string }> = {};
  const managerReviewByEmployee: Record<string, (typeof reviewRows)[number]> = {};
  for (const r of reviewRows) {
    statusByEmployee[r.employeeId] ??= {};
    if (r.reviewerType === "self") statusByEmployee[r.employeeId].self = r.status;
    if (r.reviewerType === "manager") {
      statusByEmployee[r.employeeId].manager = r.status;
      managerReviewByEmployee[r.employeeId] = r;
    }
  }

  // Who approves a manager review of each person: their manager's manager.
  const everyone = await db.select({ id: users.id, name: users.name, managerId: users.managerId }).from(users);
  const personById = new Map(everyone.map((u) => [u.id, u]));
  function approverOf(employeeId: string) {
    const mgrId = personById.get(employeeId)?.managerId;
    const approverId = mgrId ? personById.get(mgrId)?.managerId : null;
    if (!approverId || approverId === employeeId) return null;
    return personById.get(approverId) || null;
  }

  // How each person relates to the viewer: themself, a direct report, or
  // someone further down their reporting line. (For HR admins looking at
  // everyone, anyone outside their own team is "other".)
  const relationships = await reportingRelationships(viewer.id);

  const result = people
    .map((p) => {
      // Approval state of the manager review about this person. Never shown to
      // the person it's about.
      const mr = managerReviewByEmployee[p.id];
      const approver = p.id === viewer.id ? null : approverOf(p.id);
      let managerApproval: "pending" | "approved" | null = null;
      if (approver && mr?.status === "submitted") {
        if (mr.approvedAt) managerApproval = "approved";
        else if (!mr.discussed) managerApproval = "pending";
      }
      return {
        ...p,
        relationship: p.id === viewer.id ? "self" : relationships[p.id] || "other",
        selfStatus: statusByEmployee[p.id]?.self || "none",
        managerStatus: statusByEmployee[p.id]?.manager || "none",
        managerApproval,
        approverName: managerApproval ? approver?.name || null : null,
        needsMyApproval: managerApproval === "pending" && approver?.id === viewer.id,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json(result);
}
