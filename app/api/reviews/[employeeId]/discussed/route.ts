import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reviews } from "@/lib/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { canWriteReview } from "@/lib/permissions";
import { z } from "zod";

const bodySchema = z.object({ discussed: z.boolean() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params;
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // Only whoever could write the manager review (the assigned manager, or HR) can toggle this.
  if (!(await canWriteReview(viewer, employeeId, "manager"))) {
    return NextResponse.json({ error: "Only this person's manager can do that." }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });

  const rows = await db
    .select()
    .from(reviews)
    .where(and(eq(reviews.employeeId, employeeId), eq(reviews.reviewerType, "manager")))
    .limit(1);
  const existing = rows[0];
  if (!existing) return NextResponse.json({ error: "No manager review exists yet." }, { status: 404 });

  await db
    .update(reviews)
    .set({ discussed: parsed.data.discussed, discussedAt: parsed.data.discussed ? new Date() : null })
    .where(eq(reviews.id, existing.id));

  return NextResponse.json({ ok: true, discussed: parsed.data.discussed });
}
