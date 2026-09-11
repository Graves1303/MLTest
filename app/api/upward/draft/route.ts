import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { upwardDrafts, users } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { emptyRatingMap, VALUES_ITEMS, COMPETENCY_ITEMS, RATING_VALUES, slugId } from "@/lib/domain";
import { z } from "zod";

export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!viewer.managerId) {
    return NextResponse.json({ managerName: null, managerLevel: null, managerLevelContext: null, draft: null });
  }
  const mgrRows = await db
    .select({ name: users.name, level: users.level, levelContext: users.levelContext })
    .from(users)
    .where(eq(users.id, viewer.managerId))
    .limit(1);
  const managerName = mgrRows[0]?.name || null;
  const managerLevel = mgrRows[0]?.level || null;
  const managerLevelContext = mgrRows[0]?.levelContext || null;

  const rows = await db.select().from(upwardDrafts).where(eq(upwardDrafts.reporterId, viewer.id)).limit(1);
  const draft = rows[0] || null;

  return NextResponse.json({
    managerName,
    managerLevel,
    managerLevelContext,
    draft: draft
      ? {
          values: draft.values,
          valuesComments: draft.valuesComments,
          competencies: draft.competencies,
          competenciesComments: draft.competenciesComments,
          status: draft.status,
          submittedAt: draft.submittedAt,
        }
      : {
          values: emptyRatingMap(VALUES_ITEMS),
          valuesComments: "",
          competencies: emptyRatingMap(COMPETENCY_ITEMS),
          competenciesComments: "",
          status: "none",
          submittedAt: null,
        },
  });
}

const ratingMapSchema = z.record(
  z.string(),
  z.union([z.number().refine((v) => (RATING_VALUES as readonly number[]).includes(v)), z.null()])
);
const putSchema = z.object({
  values: ratingMapSchema,
  valuesComments: z.string().default(""),
  competencies: ratingMapSchema,
  competenciesComments: z.string().default(""),
});

export async function PUT(req: NextRequest) {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!viewer.managerId) return NextResponse.json({ error: "You don't have a manager on file." }, { status: 400 });

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });

  const existing = await db.select().from(upwardDrafts).where(eq(upwardDrafts.reporterId, viewer.id)).limit(1);
  if (existing[0]?.status === "submitted") {
    return NextResponse.json({ error: "Already submitted — reopen it first to make changes." }, { status: 409 });
  }

  if (existing[0]) {
    await db
      .update(upwardDrafts)
      .set({ ...parsed.data, managerId: viewer.managerId, updatedAt: new Date() })
      .where(eq(upwardDrafts.id, existing[0].id));
  } else {
    await db.insert(upwardDrafts).values({
      id: slugId("upwarddraft"),
      reporterId: viewer.id,
      managerId: viewer.managerId,
      ...parsed.data,
    });
  }

  return NextResponse.json({ ok: true });
}
