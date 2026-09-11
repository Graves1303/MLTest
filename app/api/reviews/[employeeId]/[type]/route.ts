import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reviews, users } from "@/lib/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { canReadReview, canWriteReview } from "@/lib/permissions";
import { z } from "zod";
import { slugId, RATING_VALUES } from "@/lib/domain";

function parseType(type: string): "self" | "manager" | null {
  return type === "self" || type === "manager" ? type : null;
}

async function findReview(employeeId: string, type: "self" | "manager") {
  const rows = await db
    .select()
    .from(reviews)
    .where(and(eq(reviews.employeeId, employeeId), eq(reviews.reviewerType, type)))
    .limit(1);
  return rows[0] || null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ employeeId: string; type: string }> }) {
  const { employeeId, type: rawType } = await params;
  const type = parseType(rawType);
  if (!type) return NextResponse.json({ error: "Invalid review type." }, { status: 400 });

  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const existing = await findReview(employeeId, type);

  const allowed = await canReadReview(viewer, employeeId, type, (existing?.status as "draft" | "submitted") ?? null, existing?.discussed ?? false);
  if (!allowed) {
    return NextResponse.json({ error: "You don't have access to this review." }, { status: 403 });
  }

  // The promotion-eligibility field is never shown to the person being
  // reviewed, no matter their role or the discussed status — stripped here
  // server-side, not just hidden in the UI.
  let responseReview = existing;
  if (existing && viewer.id === employeeId) {
    const { promotionEligible, ...rest } = existing;
    responseReview = rest as typeof existing;
  }

  return NextResponse.json({ review: responseReview || null });
}

const goalSchema = z.object({ id: z.string(), text: z.string(), timeline: z.string() });
const ratingMapSchema = z.record(
  z.string(),
  z.union([z.number().refine((v) => (RATING_VALUES as readonly number[]).includes(v)), z.null()])
);

const putSchema = z.object({
  values: ratingMapSchema,
  valuesComments: z.string().default(""),
  competencies: ratingMapSchema,
  competenciesComments: z.string().default(""),
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

  // Confirm the employee actually exists so a stray ID can't create orphaned rows.
  const employeeRows = await db.select({ id: users.id }).from(users).where(eq(users.id, employeeId)).limit(1);
  if (!employeeRows[0]) return NextResponse.json({ error: "That employee doesn't exist." }, { status: 404 });

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input." }, { status: 400 });
  }
  const data = parsed.data;

  const existing = await findReview(employeeId, type);

  // A submitted review is locked from further edits unless it's explicitly reopened
  // (status sent back to draft) — checked here, not just hidden in the UI.
  if (existing?.status === "submitted" && !data.reopen) {
    return NextResponse.json(
      { error: "This review has already been submitted. Reopen it first if you need to make changes." },
      { status: 409 }
    );
  }

  // Comments and Summary are mandatory on submission — enforced here, not just
  // a disabled button, so it can't be bypassed by calling the API directly.
  if (data.submit && (!data.valuesComments.trim() || !data.competenciesComments.trim() || !data.summary.trim())) {
    return NextResponse.json(
      { error: "Add comments for Values and Competencies, and a Summary, before submitting." },
      { status: 400 }
    );
  }

  const now = new Date();
  const status = data.submit ? "submitted" : "draft";

  if (existing) {
    await db
      .update(reviews)
      .set({
        values: data.values,
        valuesComments: data.valuesComments,
        competencies: data.competencies,
        competenciesComments: data.competenciesComments,
        summary: data.summary,
        goals: data.goals,
        promotionEligible: data.promotionEligible,
        status,
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
      values: data.values,
      valuesComments: data.valuesComments,
      competencies: data.competencies,
      competenciesComments: data.competenciesComments,
      summary: data.summary,
      goals: data.goals,
      promotionEligible: data.promotionEligible,
      status,
      submittedAt: data.submit ? now : null,
      updatedAt: now,
    });
  }

  const saved = await findReview(employeeId, type);
  let responseReview = saved;
  if (saved && viewer.id === employeeId) {
    const { promotionEligible, ...rest } = saved;
    responseReview = rest as typeof saved;
  }
  return NextResponse.json({ review: responseReview });
}
