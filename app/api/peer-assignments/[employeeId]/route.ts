import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { peerAssignments, users } from "@/lib/schema";
import { eq, inArray } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { canWriteReview } from "@/lib/permissions";
import { z } from "zod";
import { slugId } from "@/lib/domain";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params;
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!(await canWriteReview(viewer, employeeId, "manager"))) {
    return NextResponse.json({ error: "Only this person's manager can see this." }, { status: 403 });
  }

  const rows = await db.select().from(peerAssignments).where(eq(peerAssignments.employeeId, employeeId)).limit(1);
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

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });

  const existing = await db.select().from(peerAssignments).where(eq(peerAssignments.employeeId, employeeId)).limit(1);
  const { peerUserIds, minToReveal } = parsed.data;

  if (existing[0]) {
    await db
      .update(peerAssignments)
      .set({ peerUserIds, minToReveal: String(minToReveal), updatedAt: new Date() })
      .where(eq(peerAssignments.id, existing[0].id));
  } else {
    await db.insert(peerAssignments).values({
      id: slugId("peerassign"),
      employeeId,
      peerUserIds,
      minToReveal: String(minToReveal),
    });
  }

  return NextResponse.json({ ok: true });
}
