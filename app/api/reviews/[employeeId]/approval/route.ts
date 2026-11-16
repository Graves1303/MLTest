import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { reviews } from "@/lib/schema";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentCycle, isCycleLocked } from "@/lib/cycles";
import { buildApprovalView, getApprover, mayApprove } from "@/lib/approvals";

const bodySchema = z.object({ approved: z.boolean() });

async function loadManagerReview(employeeId: string, cycleId: string) {
  const rows = await db
    .select()
    .from(reviews)
    .where(and(eq(reviews.employeeId, employeeId), eq(reviews.reviewerType, "manager"), eq(reviews.cycleId, cycleId)))
    .limit(1);
  return rows[0] || null;
}

/**
 * Approve — or withdraw approval of — a manager review before it's shared with
 * the employee. Only the skip-level manager (or an HR admin standing in for
 * them) can; never the person the review is about, and never the person who
 * wrote it.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params;
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (await isCycleLocked()) {
    return NextResponse.json({ error: "This review cycle is closed, so approvals can't change right now." }, { status: 423 });
  }
  const currentCycle = await getCurrentCycle();
  if (!currentCycle) return NextResponse.json({ error: "No active review cycle." }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });

  // Check who's asking BEFORE looking at the review, so nobody can use this
  // endpoint to find out whether a manager review exists.
  const approver = await getApprover(employeeId);
  if (!approver) return NextResponse.json({ error: "This review doesn't need approval." }, { status: 409 });
  if (viewer.id !== approver.id && !viewer.isHrAdmin) {
    return NextResponse.json({ error: "You can't approve this review." }, { status: 403 });
  }

  const review = await loadManagerReview(employeeId, currentCycle.id);
  if (!review) return NextResponse.json({ error: "No manager review exists yet." }, { status: 404 });
  if (!mayApprove(viewer, approver, employeeId, review)) {
    return NextResponse.json({ error: "You can't approve this review." }, { status: 403 });
  }
  if (review.status !== "submitted") {
    return NextResponse.json({ error: "Only a submitted review can be approved." }, { status: 409 });
  }

  if (parsed.data.approved) {
    if (!review.approvedAt) {
      await db.update(reviews).set({ approvedById: viewer.id, approvedAt: new Date() }).where(eq(reviews.id, review.id));
    }
  } else {
    if (review.discussed) {
      return NextResponse.json({ error: "This review has already been shared with the employee, so its approval can't be withdrawn." }, { status: 409 });
    }
    await db.update(reviews).set({ approvedById: null, approvedAt: null }).where(eq(reviews.id, review.id));
  }

  const fresh = await loadManagerReview(employeeId, currentCycle.id);
  return NextResponse.json({ ok: true, approval: await buildApprovalView(viewer, employeeId, fresh) });
}
