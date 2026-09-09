import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { peerAssignments, peerFeedbackEntries, peerSubmissionMarkers, users } from "@/lib/schema";
import { eq, inArray } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { canWriteReview } from "@/lib/permissions";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params;
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!(await canWriteReview(viewer, employeeId, "manager"))) {
    return NextResponse.json({ error: "Only this person's manager can see this." }, { status: 403 });
  }

  const assignRows = await db.select().from(peerAssignments).where(eq(peerAssignments.employeeId, employeeId)).limit(1);
  const assignment = assignRows[0];
  const peerIds: string[] = (assignment?.peerUserIds as string[]) || [];
  const minToReveal = assignment ? parseInt(assignment.minToReveal, 10) || 3 : 3;

  const peerUsers = peerIds.length
    ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, peerIds))
    : [];

  const markers = await db.select().from(peerSubmissionMarkers).where(eq(peerSubmissionMarkers.employeeId, employeeId));
  const submittedIds = new Set(markers.map((m) => m.peerUserId));

  const checklist = peerUsers.map((p) => ({ id: p.id, name: p.name, submitted: submittedIds.has(p.id) }));

  const entries = await db.select().from(peerFeedbackEntries).where(eq(peerFeedbackEntries.employeeId, employeeId));
  const revealed = entries.length >= minToReveal;

  return NextResponse.json({
    checklist,
    minToReveal,
    count: entries.length,
    revealed,
    entries: revealed ? entries.map((e) => ({ id: e.id, strengths: e.strengths, growth: e.growth })) : [],
  });
}
