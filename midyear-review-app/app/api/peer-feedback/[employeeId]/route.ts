import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { peerAssignments, peerFeedbackEntries, peerSubmissionMarkers, users } from "@/lib/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { canWriteReview } from "@/lib/permissions";
import { getCurrentCycle } from "@/lib/cycles";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params;
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!(await canWriteReview(viewer, employeeId, "manager"))) {
    return NextResponse.json({ error: "Only this person's manager can see this." }, { status: 403 });
  }

  const currentCycle = await getCurrentCycle();
  if (!currentCycle) return NextResponse.json({ checklist: [], minToReveal: 3, count: 0, revealed: false, entries: [] });

  const assignRows = await db
    .select()
    .from(peerAssignments)
    .where(and(eq(peerAssignments.employeeId, employeeId), eq(peerAssignments.cycleId, currentCycle.id)))
    .limit(1);
  const assignment = assignRows[0];
  const peerIds: string[] = (assignment?.peerUserIds as string[]) || [];
  const minToReveal = assignment ? parseInt(assignment.minToReveal, 10) || 3 : 3;

  const peerUsers = peerIds.length
    ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, peerIds))
    : [];

  const markers = await db
    .select()
    .from(peerSubmissionMarkers)
    .where(and(eq(peerSubmissionMarkers.employeeId, employeeId), eq(peerSubmissionMarkers.cycleId, currentCycle.id)));
  const markerByPeer = new Map(markers.map((m) => [m.peerUserId, m]));

  const checklist = peerUsers.map((p) => {
    const marker = markerByPeer.get(p.id);
    return { id: p.id, name: p.name, submitted: !!marker, locked: marker?.locked ?? false };
  });

  const entries = await db
    .select()
    .from(peerFeedbackEntries)
    .where(and(eq(peerFeedbackEntries.employeeId, employeeId), eq(peerFeedbackEntries.cycleId, currentCycle.id)));
  const revealed = entries.length >= minToReveal;

  return NextResponse.json({
    checklist,
    minToReveal,
    count: entries.length,
    revealed,
    entries: revealed ? entries.map((e) => ({ id: e.id, strengths: e.strengths, growth: e.growth })) : [],
  });
}
