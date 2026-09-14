import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reviews } from "@/lib/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentCycle } from "@/lib/cycles";

function parseType(type: string): "self" | "manager" | null {
  return type === "self" || type === "manager" ? type : null;
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ employeeId: string; type: string }> }) {
  const { employeeId, type: rawType } = await params;
  const type = parseType(rawType);
  if (!type) return NextResponse.json({ error: "Invalid review type." }, { status: 400 });

  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!viewer.isHrAdmin) {
    return NextResponse.json({ error: "Only HR admins can unlock a review." }, { status: 403 });
  }

  const currentCycle = await getCurrentCycle();
  if (!currentCycle) return NextResponse.json({ error: "No active review cycle." }, { status: 404 });

  const rows = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(and(eq(reviews.employeeId, employeeId), eq(reviews.reviewerType, type), eq(reviews.cycleId, currentCycle.id)))
    .limit(1);
  if (!rows[0]) return NextResponse.json({ error: "No review found to unlock." }, { status: 404 });

  await db.update(reviews).set({ locked: false }).where(eq(reviews.id, rows[0].id));
  return NextResponse.json({ ok: true });
}
