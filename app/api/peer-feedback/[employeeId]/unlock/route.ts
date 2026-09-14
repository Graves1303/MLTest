import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { peerSubmissionMarkers } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { canWriteReview } from "@/lib/permissions";
import { getCurrentCycle } from "@/lib/cycles";
import { z } from "zod";

const bodySchema = z.object({ peerUserId: z.string() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params;
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!(await canWriteReview(viewer, employeeId, "manager"))) {
    return NextResponse.json({ error: "Only this person's manager can do that." }, { status: 403 });
  }

  const currentCycle = await getCurrentCycle();
  if (!currentCycle) return NextResponse.json({ error: "No active review cycle." }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });

  const marker = await db
    .select()
    .from(peerSubmissionMarkers)
    .where(
      and(
        eq(peerSubmissionMarkers.employeeId, employeeId),
        eq(peerSubmissionMarkers.peerUserId, parsed.data.peerUserId),
        eq(peerSubmissionMarkers.cycleId, currentCycle.id)
      )
    )
    .limit(1);
  if (!marker[0]) return NextResponse.json({ error: "That person hasn't submitted anything to unlock." }, { status: 404 });

  await db.update(peerSubmissionMarkers).set({ locked: false }).where(eq(peerSubmissionMarkers.id, marker[0].id));
  return NextResponse.json({ ok: true });
}
