import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reviews, users, upwardEntries } from "@/lib/schema";
import { inArray } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { computeSummary, computeAggregate, UPWARD_MIN_REVEAL, type RatingMap } from "@/lib/domain";

export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!viewer.isHrAdmin) {
    return NextResponse.json({ error: "Only HR admins can view the cycle report." }, { status: 403 });
  }

  const people = await db
    .select({ id: users.id, name: users.name, email: users.email, title: users.title, level: users.level, managerId: users.managerId })
    .from(users);

  const managerNameById = Object.fromEntries(people.map((p) => [p.id, p.name]));

  const ids = people.map((p) => p.id);
  const reviewRows = ids.length
    ? await db
        .select()
        .from(reviews)
        .where(inArray(reviews.employeeId, ids))
    : [];

  const upwardRows = ids.length ? await db.select().from(upwardEntries).where(inArray(upwardEntries.managerId, ids)) : [];
  const upwardByManager: Record<string, typeof upwardRows> = {};
  for (const u of upwardRows) {
    upwardByManager[u.managerId] ??= [];
    upwardByManager[u.managerId].push(u);
  }

  const byEmployee: Record<string, { self?: typeof reviewRows[number]; manager?: typeof reviewRows[number] }> = {};
  for (const r of reviewRows) {
    byEmployee[r.employeeId] ??= {};
    if (r.reviewerType === "self") byEmployee[r.employeeId].self = r;
    if (r.reviewerType === "manager") byEmployee[r.employeeId].manager = r;
  }

  function scoresFor(row?: typeof reviewRows[number]) {
    if (!row) return { status: "none", overallScore: null, overallGrade: null, submittedAt: null, promotionEligible: "" };
    const summary = computeSummary({
      values: row.values as RatingMap,
      competencies: row.competencies as RatingMap,
    });
    return {
      status: row.status,
      valuesOverall: summary.valuesOverall,
      competenciesOverall: summary.competenciesOverall,
      overallScore: summary.overallScore,
      overallGrade: summary.overallGrade,
      submittedAt: row.submittedAt,
      promotionEligible: row.promotionEligible || "",
    };
  }

  const result = people
    .map((p) => {
      const self = scoresFor(byEmployee[p.id]?.self);
      const manager = scoresFor(byEmployee[p.id]?.manager);
      const cycleStatus = self.status === "submitted" && manager.status === "submitted"
        ? "complete"
        : self.status === "none" && manager.status === "none"
        ? "not_started"
        : "in_progress";
      const upwardPool = upwardByManager[p.id] || [];
      const upwardAgg = computeAggregate(
        upwardPool.map((u) => ({ values: u.values as RatingMap, competencies: u.competencies as RatingMap })),
        UPWARD_MIN_REVEAL
      );
      return {
        id: p.id,
        name: p.name,
        email: p.email,
        title: p.title,
        level: p.level,
        managerName: p.managerId ? managerNameById[p.managerId] || null : null,
        self,
        manager,
        cycleStatus,
        upwardAgg,
        upwardEntries: upwardAgg.revealed
          ? upwardPool.map((u) => ({ id: u.id, valuesComments: u.valuesComments, competenciesComments: u.competenciesComments }))
          : [],
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json(result);
}
