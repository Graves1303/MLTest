import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { peerAssignments, users } from "@/lib/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { canWriteReview } from "@/lib/permissions";
import { getCurrentCycle } from "@/lib/cycles";
import { z } from "zod";
import { slugId, countPeerLoads, MAX_PEER_REVIEWS_PER_PERSON } from "@/lib/domain";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params;
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!(await canWriteReview(viewer, employeeId, "manager"))) {
    return NextResponse.json({ error: "Only this person's manager can see this." }, { status: 403 });
  }

  const currentCycle = await getCurrentCycle();
  if (!currentCycle) return NextResponse.json({ peers: [], minToReveal: 3 });

  const rows = await db
    .select()
    .from(peerAssignments)
    .where(and(eq(peerAssignments.employeeId, employeeId), eq(peerAssignments.cycleId, currentCycle.id)))
    .limit(1);
  const assignment = rows[0];
  if (!assignment) return NextResponse.json({ peers: [], minToReveal: 3 });

  const peerIds = (assignment.peerUserIds as string[]) || [];
  const peerUsers = peerIds.length
    ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, peerIds))
    : [];

  return NextResponse.json({
    peers: peerUsers,
    minToReveal: parseInt(assignment.minToReveal, 10) || 3,
  });
}

const putSchema = z.object({
  peerUserIds: z.array(z.string()),
  minToReveal: z.number().min(2),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params;
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!(await canWriteReview(viewer, employeeId, "manager"))) {
    return NextResponse.json({ error: "Only this person's manager can set this." }, { status: 403 });
  }

  const currentCycle = await getCurrentCycle();
  if (!currentCycle) return NextResponse.json({ error: "No active review cycle." }, { status: 404 });

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });

  const peerUserIds = Array.from(new Set(parsed.data.peerUserIds));
  const { minToReveal } = parsed.data;

  // The cap check and the save happen inside one transaction, behind a lock
  // that serializes peer-assignment writes. Without it, two managers adding
  // the same person at the same instant could both read "2 assignments" and
  // both push them to 4.
  const outcome = await db.transaction(async (tx) => {
    await tx.execute(sql.raw("select pg_advisory_xact_lock(7342001)"));

    const existingRows = await tx
      .select()
      .from(peerAssignments)
      .where(and(eq(peerAssignments.employeeId, employeeId), eq(peerAssignments.cycleId, currentCycle.id)))
      .limit(1);
    const existing = existingRows[0];
    const previousIds = new Set(((existing?.peerUserIds as string[]) || []));

    // Only people being NEWLY added are checked. Someone already on this
    // employee's list stays put even if they're over the limit from before
    // the cap existed, so editing other settings never gets blocked.
    const newlyAdded = peerUserIds.filter((id) => !previousIds.has(id));
    if (newlyAdded.length > 0) {
      const cycleRows = await tx
        .select({ employeeId: peerAssignments.employeeId, peerUserIds: peerAssignments.peerUserIds })
        .from(peerAssignments)
        .where(eq(peerAssignments.cycleId, currentCycle.id));
      const loads = countPeerLoads(cycleRows, employeeId);
      const overId = newlyAdded.find((id) => (loads[id] || 0) >= MAX_PEER_REVIEWS_PER_PERSON);
      if (overId) {
        const nameRows = await tx.select({ name: users.name }).from(users).where(eq(users.id, overId)).limit(1);
        return { ok: false as const, name: nameRows[0]?.name || "That person" };
      }
    }

    if (existing) {
      await tx
        .update(peerAssignments)
        .set({ peerUserIds, minToReveal: String(minToReveal), updatedAt: new Date() })
        .where(eq(peerAssignments.id, existing.id));
    } else {
      await tx.insert(peerAssignments).values({
        id: slugId("peerassign"),
        employeeId,
        cycleId: currentCycle.id,
        peerUserIds,
        minToReveal: String(minToReveal),
      });
    }
    return { ok: true as const };
  });

  if (!outcome.ok) {
    return NextResponse.json(
      {
        error: `${outcome.name} is already assigned to ${MAX_PEER_REVIEWS_PER_PERSON} peer reviews this cycle, which is the maximum. Please choose someone else.`,
      },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true });
}
