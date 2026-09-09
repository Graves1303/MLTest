import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { upwardDrafts, upwardEntries } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { slugId } from "@/lib/domain";
import { z } from "zod";

const bodySchema = z.object({ reopen: z.boolean().default(false) });

export async function POST(req: NextRequest) {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!viewer.managerId) return NextResponse.json({ error: "You don't have a manager on file." }, { status: 400 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  const reopen = parsed.success && parsed.data.reopen;

  const existing = await db.select().from(upwardDrafts).where(eq(upwardDrafts.reporterId, viewer.id)).limit(1);
  const draft = existing[0];
  if (!draft) return NextResponse.json({ error: "No draft to submit — save one first." }, { status: 400 });

  if (reopen) {
    await db.update(upwardDrafts).set({ status: "draft" }).where(eq(upwardDrafts.id, draft.id));
    return NextResponse.json({ ok: true, status: "draft" });
  }

  const content = {
    values: draft.values,
    valuesComments: draft.valuesComments,
    competencies: draft.competencies,
    competenciesComments: draft.competenciesComments,
  };

  let poolEntryId = draft.poolEntryId;
  if (poolEntryId) {
    // Resubmission after reopening — update the SAME anonymous entry, never create a second one.
    await db.update(upwardEntries).set(content).where(eq(upwardEntries.id, poolEntryId));
  } else {
    poolEntryId = slugId("upwardentry");
    await db.insert(upwardEntries).values({ id: poolEntryId, managerId: draft.managerId, ...content });
  }

  await db
    .update(upwardDrafts)
    .set({ status: "submitted", poolEntryId, submittedAt: new Date() })
    .where(eq(upwardDrafts.id, draft.id));

  return NextResponse.json({ ok: true, status: "submitted" });
}
