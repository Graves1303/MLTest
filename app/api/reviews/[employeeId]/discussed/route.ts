import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reviews } from "@/lib/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { canWriteReview } from "@/lib/permissions";
import { getCurrentCycle, isCycleLocked } from "@/lib/cycles";
import { getApprover } from "@/lib/approvals";
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

  if (await isCycleLocked()) {
    return NextResponse.json({ error: "This review cycle has been locked by HR." }, { status: 423 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });

  const currentCycle = await getCurrentCycle();
  if (!currentCycle) return NextResponse.json({ error: "No active review cycle." }, { status: 404 });

  const rows = await db
    .select()
    .from(reviews)
    .where(and(eq(reviews.employeeId, employeeId), eq(reviews.reviewerType, "manager"), eq(reviews.cycleId, currentCycle.id)))
    .limit(1);
  const existing = rows[0];
  if (!existing) return NextResponse.json({ error: "No manager review exists yet." }, { status: 404 });

  // Sharing is only allowed for a SUBMITTED review that has been approved (when
  // there's someone above the manager to approve it). Both checks are enforced
  // here, not just in the page, so they can't be skipped: marking a draft as
  // shared and submitting it afterwards would otherwise sidestep approval.
  if (parsed.data.discussed) {
    if (existing.status !== "submitted") {
      return NextResponse.json({ error: "Submit the review before sharing it with the employee." }, { status: 409 });
    }
    const approver = await getApprover(employeeId);
    if (approver && !existing.approvedAt) {
      return NextResponse.json({ error: `This review needs ${approver.name}’s approval before it can be shared.` }, { status: 409 });
    }
  }

  await db
    .update(reviews)
    .set({ discussed: parsed.data.discussed, discussedAt: parsed.data.discussed ? new Date() : null })
    .where(eq(reviews.id, existing.id));

  return NextResponse.json({ ok: true, discussed: parsed.data.discussed });
}
