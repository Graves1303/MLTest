import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { peerAssignments, peerSubmissionMarkers, users } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentCycle } from "@/lib/cycles";

export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const currentCycle = await getCurrentCycle();
  if (!currentCycle) return NextResponse.json([]);

  // Peer assignments aren't indexed by peer, so we scan this cycle's and keep
  // only the ones that name this viewer — fine at this scale, and it means no
  // new index or denormalization just to answer "what's assigned to me?".
  const cycleAssignments = await db.select().from(peerAssignments).where(eq(peerAssignments.cycleId, currentCycle.id));
  const mine = cycleAssignments.filter((a) => ((a.peerUserIds as string[]) || []).includes(viewer.id));
  if (mine.length === 0) return NextResponse.json([]);

  const employeeIds = mine.map((a) => a.employeeId);
  const employees = await db.select({ id: users.id, name: users.name }).from(users);
  const nameById = Object.fromEntries(employees.map((e) => [e.id, e.name]));

  // Fetch this cycle's markers and filter in JS to "mine, for these
  // employees" — this never queries or returns anyone else's submission status.
  const cycleMarkers = await db.select().from(peerSubmissionMarkers).where(eq(peerSubmissionMarkers.cycleId, currentCycle.id));
  const mySubmittedFor = new Set(
    cycleMarkers.filter((m) => m.peerUserId === viewer.id && employeeIds.includes(m.employeeId)).map((m) => m.employeeId)
  );

  const result = mine.map((a) => ({
    employeeId: a.employeeId,
    employeeName: nameById[a.employeeId] || "Someone no longer on the roster",
    submitted: mySubmittedFor.has(a.employeeId),
  }));

  return NextResponse.json(result);
}
