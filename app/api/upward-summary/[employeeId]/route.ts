import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { upwardEntries, users } from "@/lib/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { canWriteReview } from "@/lib/permissions";
import { getCurrentCycle } from "@/lib/cycles";
import { computeCategoryAggregate, getTemplate, UPWARD_MIN_REVEAL, type CategoryData } from "@/lib/domain";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params;
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!(await canWriteReview(viewer, employeeId, "manager"))) {
    return NextResponse.json({ error: "Only this person's manager can see this." }, { status: 403 });
  }

  const currentCycle = await getCurrentCycle();
  const [pool, directReports, empRows] = await Promise.all([
    currentCycle
      ? db.select().from(upwardEntries).where(and(eq(upwardEntries.managerId, employeeId), eq(upwardEntries.cycleId, currentCycle.id)))
      : Promise.resolve([]),
    db.select({ id: users.id }).from(users).where(eq(users.managerId, employeeId)),
    db.select({ templateKey: users.templateKey }).from(users).where(eq(users.id, employeeId)).limit(1),
  ]);

  const template = getTemplate(empRows[0]?.templateKey);
  const agg = computeCategoryAggregate(
    pool.map((u) => u.categoryData as CategoryData),
    template.upwardCategoryKeys,
    UPWARD_MIN_REVEAL
  );

  return NextResponse.json({
    totalReports: directReports.length,
    submittedCount: pool.length,
    overallScore: agg.overallScore,
    overallGrade: agg.overallGrade,
    categories: template.categories.filter((c) => template.upwardCategoryKeys.includes(c.key)),
    entries: pool.map((u) => ({ id: u.id, categoryData: u.categoryData })),
  });
}
