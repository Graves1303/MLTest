import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reviews, users } from "@/lib/schema";
import { inArray } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { visibleEmployeeIds } from "@/lib/permissions";

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

  const ids = people.map((p) => p.id);
  const reviewRows = ids.length
    ? await db
        .select({ employeeId: reviews.employeeId, reviewerType: reviews.reviewerType, status: reviews.status })
        .from(reviews)
        .where(inArray(reviews.employeeId, ids))
    : [];

  const statusByEmployee: Record<string, { self?: string; manager?: string }> = {};
  for (const r of reviewRows) {
    statusByEmployee[r.employeeId] ??= {};
    if (r.reviewerType === "self") statusByEmployee[r.employeeId].self = r.status;
    if (r.reviewerType === "manager") statusByEmployee[r.employeeId].manager = r.status;
  }

  const result = people
    .map((p) => ({
      ...p,
      selfStatus: statusByEmployee[p.id]?.self || "none",
      managerStatus: statusByEmployee[p.id]?.manager || "none",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json(result);
}
