import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { peerAssignments, peerFeedbackEntries, peerSubmissionMarkers } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { z } from "zod";
import { slugId } from "@/lib/domain";

const bodySchema = z.object({
  strengths: z.string().default(""),
  growth: z.string().default(""),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params;
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const assignRows = await db.select().from(peerAssignments).where(eq(peerAssignments.employeeId, employeeId)).limit(1);
  const assignment = assignRows[0];
  const peerIds: string[] = (assignment?.peerUserIds as string[]) || [];

  // The server verifies membership via the real, authenticated session — not a
  // typed-in name. This is a genuine improvement over an honor-system check.
  if (!peerIds.includes(viewer.id)) {
    return NextResponse.json({ error: "You're not on the peer list for this person." }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  if (!parsed.data.strengths.trim() || !parsed.data.growth.trim()) {
    return NextResponse.json({ error: "Both questions need an answer before you can submit." }, { status: 400 });
  }

  const existingMarker = await db
    .select()
    .from(peerSubmissionMarkers)
    .where(and(eq(peerSubmissionMarkers.employeeId, employeeId), eq(peerSubmissionMarkers.peerUserId, viewer.id)))
    .limit(1);

  if (existingMarker[0]) {
    // Resubmission: update the SAME anonymous entry, never create a second one.
    await db
      .update(peerFeedbackEntries)
      .set({ strengths: parsed.data.strengths.trim(), growth: parsed.data.growth.trim() })
      .where(eq(peerFeedbackEntries.id, existingMarker[0].entryId));
    return NextResponse.json({ ok: true, updated: true });
  }

  const entryId = slugId("peerentry");
  await db.insert(peerFeedbackEntries).values({
    id: entryId,
    employeeId,
    strengths: parsed.data.strengths.trim(),
    growth: parsed.data.growth.trim(),
  });
  await db.insert(peerSubmissionMarkers).values({
    id: slugId("peermark"),
    employeeId,
    peerUserId: viewer.id,
    entryId,
  });

  return NextResponse.json({ ok: true, updated: false });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ employeeId: string }> }) {
  // Lets the submitting peer check their own status (already submitted? what did I write?)
  // — scoped strictly to "me", never exposing anyone else's identity or content.
  const { employeeId } = await params;
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const assignRows = await db.select().from(peerAssignments).where(eq(peerAssignments.employeeId, employeeId)).limit(1);
  const peerIds: string[] = (assignRows[0]?.peerUserIds as string[]) || [];
  if (!peerIds.includes(viewer.id)) {
    return NextResponse.json({ eligible: false });
  }

  const marker = await db
    .select()
    .from(peerSubmissionMarkers)
    .where(and(eq(peerSubmissionMarkers.employeeId, employeeId), eq(peerSubmissionMarkers.peerUserId, viewer.id)))
    .limit(1);

  if (!marker[0]) return NextResponse.json({ eligible: true, submitted: false });

  const entry = await db.select().from(peerFeedbackEntries).where(eq(peerFeedbackEntries.id, marker[0].entryId)).limit(1);
  return NextResponse.json({ eligible: true, submitted: true, strengths: entry[0]?.strengths || "", growth: entry[0]?.growth || "" });
}
