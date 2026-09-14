import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reviews, users } from "@/lib/schema";
import { and, eq, desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentCycle, isCycleLocked } from "@/lib/cycles";
import { canReadReview, canWriteReview } from "@/lib/permissions";
import { z } from "zod";
import { slugId, RATING_VALUES, getTemplate } from "@/lib/domain";

function parseType(type: string): "self" | "manager" | null {
  return type === "self" || type === "manager" ? type : null;
}

async function findReview(employeeId: string, type: "self" | "manager", cycleId: string) {
  const rows = await db
    .select()
    .from(reviews)
    .where(and(eq(reviews.employeeId, employeeId), eq(reviews.reviewerType, type), eq(reviews.cycleId, cycleId)))
    .limit(1);
  return rows[0] || null;
}

// The most recent PRIOR cycle's review for this person — used only to show
// "goals from last cycle" as a read-only reference. Only goals are returned;
// nothing else from an old review leaks through this path.
async function previousCycleGoals(employeeId: string, type: "self" | "manager", currentCycleId: string) {
  const rows = await db
    .select({ goals: reviews.goals, cycleId: reviews.cycleId })
    .from(reviews)
    .where(and(eq(reviews.employeeId, employeeId), eq(reviews.reviewerType, type)))
    .orderBy(desc(reviews.updatedAt));
  const prior = rows.find((r) => r.cycleId && r.cycleId !== currentCycleId);
  return prior?.goals || [];
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ employeeId: string; type: string }> }) {
  const { employeeId, type: rawType } = await params;
  const type = parseType(rawType);
  if (!type) return NextResponse.json({ error: "Invalid review type." }, { status: 400 });

  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const currentCycle = await getCurrentCycle();
  if (!currentCycle) {
    return NextResponse.json({ error: "HR hasn't started a review cycle yet." }, { status: 404 });
  }

  const existing = await findReview(employeeId, type, currentCycle.id);

  const allowed = await canReadReview(viewer, employeeId, type, (existing?.status as "draft" | "submitted") ?? null, existing?.discussed ?? false);
  if (!allowed) {
    return NextResponse.json({ error: "You don't have access to this review." }, { status: 403 });
  }

  let templateKey = existing?.templateKey;
  if (!templateKey) {
    const empRows = await db.select({ templateKey: users.templateKey }).from(users).where(eq(users.id, employeeId)).limit(1);
    templateKey = empRows[0]?.templateKey || "corporate";
  }
  const template = getTemplate(templateKey);

  let responseReview = existing;
  if (existing && viewer.id === employeeId) {
    const { promotionEligible, ...rest } = existing;
    responseReview = rest as typeof existing;
  }

  const priorGoals = await previousCycleGoals(employeeId, type, currentCycle.id);

  return NextResponse.json({
    review: responseReview || null,
    template: { key: template.key, label: template.label, categories: template.categories },
    cycle: { id: currentCycle.id, name: currentCycle.name, status: currentCycle.status },
    priorGoals,
  });
}

const goalSchema = z.object({ id: z.string(), text: z.string(), timeline: z.string() });
const ratingMapSchema = z.record(
  z.string(),
  z.union([z.number().refine((v) => (RATING_VALUES as readonly number[]).includes(v)), z.null()])
);
const categoryDataSchema = z.record(z.string(), z.object({ ratings: ratingMapSchema, comments: z.string().default("") }));

const putSchema = z.object({
  categoryData: categoryDataSchema,
  summary: z.string().default(""),
  goals: z.array(goalSchema).default([]),
  promotionEligible: z.enum(["", "yes", "no", "six_months"]).default(""),
  submit: z.boolean().default(false),
  reopen: z.boolean().default(false),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ employeeId: string; type: string }> }) {
  const { employeeId, type: rawType } = await params;
  const type = parseType(rawType);
  if (!type) return NextResponse.json({ error: "Invalid review type." }, { status: 400 });

  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!(await canWriteReview(viewer, employeeId, type))) {
    return NextResponse.json({ error: "You don't have permission to edit this review." }, { status: 403 });
  }

  if (await isCycleLocked()) {
    return NextResponse.json({ error: "There's no open review cycle right now — ask HR to start or reopen one." }, { status: 423 });
  }
  const currentCycle = await getCurrentCycle();
  if (!currentCycle) {
    return NextResponse.json({ error: "HR hasn't started a review cycle yet." }, { status: 404 });
  }

  const employeeRows = await db.select({ id: users.id, templateKey: users.templateKey }).from(users).where(eq(users.id, employeeId)).limit(1);
  if (!employeeRows[0]) return NextResponse.json({ error: "That employee doesn't exist." }, { status: 404 });

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input." }, { status: 400 });
  }
  const data = parsed.data;

  const existing = await findReview(employeeId, type, currentCycle.id);
  const templateKey = existing?.templateKey || employeeRows[0].templateKey || "corporate";
  const template = getTemplate(templateKey);

  if (existing?.status === "submitted" && !data.reopen) {
    return NextResponse.json(
      { error: "This review has already been submitted. Reopen it first if you need to make changes." },
      { status: 409 }
    );
  }

  if (existing?.status === "submitted" && data.reopen && existing.locked) {
    return NextResponse.json(
      { error: "This review is locked. Ask HR to unlock it if you need to make changes." },
      { status: 423 }
    );
  }

  if (data.submit) {
    const missingCategory = template.categories.some((c) => !data.categoryData[c.key]?.comments?.trim());
    if (missingCategory || !data.summary.trim()) {
      return NextResponse.json(
        { error: `Add comments for ${template.categories.map((c) => c.label).join(", ")}, and a Summary, before submitting.` },
        { status: 400 }
      );
    }
  }

  const now = new Date();
  const status = data.submit ? "submitted" : "draft";

  if (existing) {
    await db
      .update(reviews)
      .set({
        categoryData: data.categoryData,
        templateKey,
        summary: data.summary,
        goals: data.goals,
        promotionEligible: data.promotionEligible,
        status,
        locked: data.submit,
        submittedAt: data.submit ? now : existing.submittedAt,
        updatedAt: now,
      })
      .where(eq(reviews.id, existing.id));
  } else {
    await db.insert(reviews).values({
      id: slugId("review"),
      employeeId,
      reviewerType: type,
      reviewerId: viewer.id,
      cycleId: currentCycle.id,
      categoryData: data.categoryData,
      templateKey,
      summary: data.summary,
      goals: data.goals,
      promotionEligible: data.promotionEligible,
      status,
      locked: data.submit,
      submittedAt: data.submit ? now : null,
      updatedAt: now,
    });
  }

  const saved = await findReview(employeeId, type, currentCycle.id);
  let responseReview = saved;
  if (saved && viewer.id === employeeId) {
    const { promotionEligible, ...rest } = saved;
    responseReview = rest as typeof saved;
  }
  return NextResponse.json({
    review: responseReview,
    template: { key: template.key, label: template.label, categories: template.categories },
  });
}
