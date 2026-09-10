import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { canViewRosterEntry } from "@/lib/permissions";
import { canonicalLevel, contextForLevel } from "@/lib/domain";
import { z } from "zod";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!(await canViewRosterEntry(viewer, id))) {
    return NextResponse.json({ error: "You don't have access to this person's record." }, { status: 403 });
  }

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      title: users.title,
      level: users.level,
      levelContext: users.levelContext,
      isHrAdmin: users.isHrAdmin,
      managerId: users.managerId,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!rows[0]) return NextResponse.json({ error: "Not found." }, { status: 404 });

  let managerName: string | null = null;
  if (rows[0].managerId) {
    const mgrRows = await db.select({ name: users.name }).from(users).where(eq(users.id, rows[0].managerId)).limit(1);
    managerName = mgrRows[0]?.name ?? null;
  }

  return NextResponse.json({ ...rows[0], managerName });
}

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  title: z.string().optional(),
  level: z.string().optional(),
  managerId: z.string().nullable().optional(),
  isHrAdmin: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!viewer.isHrAdmin) {
    return NextResponse.json({ error: "Only HR admins can edit roster records." }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input." }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  if (parsed.data.managerId === id) {
    return NextResponse.json({ error: "Someone can't be their own manager." }, { status: 400 });
  }

  const patch: Record<string, unknown> = { ...parsed.data };
  if (typeof patch.level === "string") {
    patch.level = canonicalLevel(patch.level as string);
    patch.levelContext = contextForLevel(patch.level as string);
  }

  await db.update(users).set(patch).where(eq(users.id, id));
  return NextResponse.json({ ok: true });
}
