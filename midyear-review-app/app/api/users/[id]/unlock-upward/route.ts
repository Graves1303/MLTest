import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { upwardDrafts } from "@/lib/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentCycle } from "@/lib/cycles";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!viewer.isHrAdmin) {
    return NextResponse.json({ error: "Only HR admins can unlock an upward review." }, { status: 403 });
  }

  const currentCycle = await getCurrentCycle();
  if (!currentCycle) return NextResponse.json({ error: "No active review cycle." }, { status: 404 });

  const rows = await db
    .select({ id: upwardDrafts.id })
    .from(upwardDrafts)
    .where(and(eq(upwardDrafts.reporterId, id), eq(upwardDrafts.cycleId, currentCycle.id)))
    .limit(1);
  if (!rows[0]) return NextResponse.json({ error: "That person hasn't submitted an upward review to unlock." }, { status: 404 });

  await db.update(upwardDrafts).set({ locked: false }).where(eq(upwardDrafts.id, rows[0].id));
  return NextResponse.json({ ok: true });
}
