import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reviews, users } from "@/lib/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { canReadReview, canViewRosterEntry } from "@/lib/permissions";
import { getCurrentCycle } from "@/lib/cycles";
import { getTemplate } from "@/lib/domain";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params;
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const currentViewer = viewer;

  if (!(await canViewRosterEntry(viewer, employeeId))) {
    return NextResponse.json({ error: "You don't have access to this person's summary." }, { status: 403 });
  }

  const employeeRows = await db
    .select({
      id: users.id,
      name: users.name,
      title: users.title,
      level: users.level,
      templateKey: users.templateKey,
      managerId: users.managerId,
    })
    .from(users)
    .where(eq(users.id, employeeId))
    .limit(1);
  if (!employeeRows[0]) return NextResponse.json({ error: "Not found." }, { status: 404 });

  async function loadIfAllowed(type: "self" | "manager") {
    const currentCycle = await getCurrentCycle();
    if (!currentCycle) return null;
    const rows = await db
      .select()
      .from(reviews)
      .where(and(eq(reviews.employeeId, employeeId), eq(reviews.reviewerType, type), eq(reviews.cycleId, currentCycle.id)))
      .limit(1);
    const row = rows[0] || null;
    const allowed = await canReadReview(currentViewer, employeeId, type, (row?.status as "draft" | "submitted") ?? null, row?.discussed ?? false);
    if (!allowed || !row) return allowed ? row : null;
    if (currentViewer.id === employeeId) {
      const { promotionEligible, ...rest } = row;
      return rest as typeof row;
    }
    return row;
  }

  const [selfReview, managerReview] = await Promise.all([loadIfAllowed("self"), loadIfAllowed("manager")]);
  const template = getTemplate(employeeRows[0].templateKey);

  return NextResponse.json({
    employee: employeeRows[0],
    selfReview,
    managerReview,
    categories: template.categories,
  });
}
