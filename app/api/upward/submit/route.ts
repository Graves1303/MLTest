import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { upwardDrafts, upwardEntries } from "@/lib/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentCycle } from "@/lib/cycles";
import { getTemplate, slugId, type CategoryData } from "@/lib/domain";
import { z } from "zod";

const bodySchema = z.object({ reopen: z.boolean().default(false) });

export async function POST(req: NextRequest) {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!viewer.managerId) return NextResponse.json({ error: "You don't have a manager on file." }, { status: 400 });

  const currentCycle = await getCurrentCycle();
  if (!currentCycle || currentCycle.status === "closed") {
    return NextResponse.json({ error: "There's no open review cycle right now." }, { status: 423 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  const reopen = parsed.success && parsed.data.reopen;

  const existing = await db
    .select()
    .from(upwardDrafts)
    .where(and(eq(upwardDrafts.reporterId, viewer.id), eq(upwardDrafts.cycleId, currentCycle.id)))
    .limit(1);
  const draft = existing[0];
  if (!draft) return NextResponse.json({ error: "No draft to submit — save one first." }, { status: 400 });

  if (reopen) {
    if (draft.locked) {
      return NextResponse.json(
        { error: "This has already been submitted and is locked. Ask HR to unlock it if you need to change it." },
        { status: 423 }
      );
    }
    await db.update(upwardDrafts).set({ status: "draft" }).where(eq(upwardDrafts.id, draft.id));
    return NextResponse.json({ ok: true, status: "draft" });
  }

  if (draft.status === "submitted" && draft.locked) {
    return NextResponse.json(
      { error: "This has already been submitted and is locked. Ask HR to unlock it if you need to change it." },
      { status: 423 }
    );
  }

  const template = getTemplate(draft.templateKey);
  const categoryData = (draft.categoryData as CategoryData) || {};
  const missingComments = template.upwardCategoryKeys.some((key) => !categoryData[key]?.comments?.trim());
  if (missingComments) {
    return NextResponse.json(
      { error: `Add comments for ${template.categories.filter((c) => template.upwardCategoryKeys.includes(c.key)).map((c) => c.label).join(" and ")} before submitting.` },
      { status: 400 }
    );
  }

  let poolEntryId = draft.poolEntryId;
  if (poolEntryId) {
    // Resubmission after an admin unlock — update the SAME anonymous entry, never create a second one.
    await db.update(upwardEntries).set({ categoryData: draft.categoryData, templateKey: draft.templateKey }).where(eq(upwardEntries.id, poolEntryId));
  } else {
    poolEntryId = slugId("upwardentry");
    await db.insert(upwardEntries).values({ id: poolEntryId, managerId: draft.managerId, cycleId: currentCycle.id, categoryData: draft.categoryData, templateKey: draft.templateKey });
  }

  // Automatically re-locks — an admin unlock is good for exactly one more edit.
  await db
    .update(upwardDrafts)
    .set({ status: "submitted", locked: true, poolEntryId, submittedAt: new Date() })
    .where(eq(upwardDrafts.id, draft.id));

  return NextResponse.json({ ok: true, status: "submitted" });
}
