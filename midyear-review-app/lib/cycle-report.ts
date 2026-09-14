import { db } from "@/lib/db";
import { reviews, users, upwardEntries } from "@/lib/schema";
import { and, eq, inArray } from "drizzle-orm";
import { computeCategorySummary, computeCategoryAggregate, getTemplate, UPWARD_MIN_REVEAL, type CategoryData } from "@/lib/domain";

export async function buildCycleReport(cycleId: string) {
  const people = await db
    .select({ id: users.id, name: users.name, email: users.email, title: users.title, level: users.level, templateKey: users.templateKey, managerId: users.managerId })
    .from(users);

  const managerNameById = Object.fromEntries(people.map((p) => [p.id, p.name]));
  const ids = people.map((p) => p.id);

  const reviewRows = ids.length
    ? await db.select().from(reviews).where(and(inArray(reviews.employeeId, ids), eq(reviews.cycleId, cycleId)))
    : [];

  const upwardRows = ids.length
    ? await db.select().from(upwardEntries).where(and(inArray(upwardEntries.managerId, ids), eq(upwardEntries.cycleId, cycleId)))
    : [];
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
    const template = getTemplate(row.templateKey);
    const summary = computeCategorySummary(row.categoryData as CategoryData, template.categories.map((c) => c.key));
    return {
      status: row.status,
      categoryOveralls: summary.categoryOveralls,
      overallScore: summary.overallScore,
      overallGrade: summary.overallGrade,
      submittedAt: row.submittedAt,
      promotionEligible: row.promotionEligible || "",
    };
  }

  return people
    .map((p) => {
      const self = scoresFor(byEmployee[p.id]?.self);
      const manager = scoresFor(byEmployee[p.id]?.manager);
      const cycleStatus =
        self.status === "submitted" && manager.status === "submitted"
          ? "complete"
          : self.status === "none" && manager.status === "none"
          ? "not_started"
          : "in_progress";
      const upwardPool = upwardByManager[p.id] || [];
      const managerTemplate = getTemplate(p.templateKey);
      const upwardAgg = computeCategoryAggregate(
        upwardPool.map((u) => u.categoryData as CategoryData),
        managerTemplate.upwardCategoryKeys,
        UPWARD_MIN_REVEAL
      );
      return {
        id: p.id,
        name: p.name,
        email: p.email,
        title: p.title,
        level: p.level,
        templateKey: p.templateKey,
        managerName: p.managerId ? managerNameById[p.managerId] || null : null,
        self,
        manager,
        cycleStatus,
        upwardAgg,
        upwardEntries: upwardAgg.revealed ? upwardPool.map((u) => ({ id: u.id, categoryData: u.categoryData })) : [],
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
