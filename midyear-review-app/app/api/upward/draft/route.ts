import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { upwardDrafts, users } from "@/lib/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentCycle } from "@/lib/cycles";
import { emptyCategoryData, getTemplate, RATING_VALUES, slugId, type CategoryData } from "@/lib/domain";
import { z } from "zod";

export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!viewer.managerId) {
    return NextResponse.json({ managerName: null, managerLevel: null, managerLevelContext: null, categories: [], draft: null });
  }
  const mgrRows = await db
    .select({ name: users.name, level: users.level, levelContext: users.levelContext, templateKey: users.templateKey })
    .from(users)
    .where(eq(users.id, viewer.managerId))
    .limit(1);
  const managerName = mgrRows[0]?.name || null;
  const managerLevel = mgrRows[0]?.level || null;
  const managerLevelContext = mgrRows[0]?.levelContext || null;

  const template = getTemplate(mgrRows[0]?.templateKey);
  const upwardCategories = template.categories.filter((c) => template.upwardCategoryKeys.includes(c.key));

  const currentCycle = await getCurrentCycle();
  const draft = currentCycle
    ? (await db.select().from(upwardDrafts).where(and(eq(upwardDrafts.reporterId, viewer.id), eq(upwardDrafts.cycleId, currentCycle.id))).limit(1))[0] || null
    : null;

  return NextResponse.json({
    managerName,
    managerLevel,
    managerLevelContext,
    categories: upwardCategories,
    draft: draft
      ? {
          categoryData: draft.categoryData,
          status: draft.status,
          locked: draft.locked,
          submittedAt: draft.submittedAt,
        }
      : {
          categoryData: emptyCategoryData(upwardCategories),
          status: "none",
          locked: false,
          submittedAt: null,
        },
  });
}

const ratingMapSchema = z.record(
  z.string(),
  z.union([z.number().refine((v) => (RATING_VALUES as readonly number[]).includes(v)), z.null()])
);
const categoryDataSchema = z.record(z.string(), z.object({ ratings: ratingMapSchema, comments: z.string().default("") }));
const putSchema = z.object({ categoryData: categoryDataSchema });

export async function PUT(req: NextRequest) {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!viewer.managerId) return NextResponse.json({ error: "You don't have a manager on file." }, { status: 400 });

  const currentCycle = await getCurrentCycle();
  if (!currentCycle || currentCycle.status === "closed") {
    return NextResponse.json({ error: "There's no open review cycle right now." }, { status: 423 });
  }

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });

  const mgrRows = await db.select({ templateKey: users.templateKey }).from(users).where(eq(users.id, viewer.managerId)).limit(1);
  const templateKey = mgrRows[0]?.templateKey || "corporate";

  const existing = await db
    .select()
    .from(upwardDrafts)
    .where(and(eq(upwardDrafts.reporterId, viewer.id), eq(upwardDrafts.cycleId, currentCycle.id)))
    .limit(1);
  if (existing[0]?.status === "submitted") {
    return NextResponse.json({ error: "Already submitted — reopen it first to make changes." }, { status: 409 });
  }

  if (existing[0]) {
    await db
      .update(upwardDrafts)
      .set({ categoryData: parsed.data.categoryData, templateKey, managerId: viewer.managerId, updatedAt: new Date() })
      .where(eq(upwardDrafts.id, existing[0].id));
  } else {
    await db.insert(upwardDrafts).values({
      id: slugId("upwarddraft"),
      reporterId: viewer.id,
      cycleId: currentCycle.id,
      managerId: viewer.managerId,
      categoryData: parsed.data.categoryData,
      templateKey,
    });
  }

  return NextResponse.json({ ok: true });
}
