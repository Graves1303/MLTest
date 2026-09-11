import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { upwardEntries, users } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { canWriteReview } from "@/lib/permissions";
import { computeAggregate, UPWARD_MIN_REVEAL, type RatingMap } from "@/lib/domain";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params;
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // Same gate as peer feedback: only this person's manager or HR admin —
  // never the person themselves, even once their manager review is discussed.
  if (!(await canWriteReview(viewer, employeeId, "manager"))) {
    return NextResponse.json({ error: "Only this person's manager can see this." }, { status: 403 });
  }

  const [pool, directReports] = await Promise.all([
    db.select().from(upwardEntries).where(eq(upwardEntries.managerId, employeeId)),
    db.select({ id: users.id }).from(users).where(eq(users.managerId, employeeId)),
  ]);

  const agg = computeAggregate(
    pool.map((u) => ({ values: u.values as RatingMap, competencies: u.competencies as RatingMap })),
    UPWARD_MIN_REVEAL
  );

  return NextResponse.json({
    totalReports: directReports.length,
    submittedCount: pool.length,
    overallScore: agg.overallScore,
    overallGrade: agg.overallGrade,
    entries: pool.map((u) => ({ id: u.id, valuesComments: u.valuesComments, competenciesComments: u.competenciesComments })),
  });
}
