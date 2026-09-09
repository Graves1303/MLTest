import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { inArray } from "drizzle-orm";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { visibleEmployeeIds } from "@/lib/permissions";
import { z } from "zod";
import { slugId } from "@/lib/domain";

const PUBLIC_COLUMNS = {
  id: users.id,
  email: users.email,
  name: users.name,
  title: users.title,
  level: users.level,
  levelContext: users.levelContext,
  isHrAdmin: users.isHrAdmin,
  managerId: users.managerId,
};

export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const visible = await visibleEmployeeIds(viewer);
  const rows =
    visible === "all"
      ? await db.select(PUBLIC_COLUMNS).from(users)
      : await db.select(PUBLIC_COLUMNS).from(users).where(inArray(users.id, visible));

  return NextResponse.json(rows.sort((a, b) => a.name.localeCompare(b.name)));
}

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  title: z.string().optional().default(""),
  level: z.string().optional().default(""),
  levelContext: z.string().optional().default(""),
  managerId: z.string().nullable().optional(),
  isHrAdmin: z.boolean().optional().default(false),
  temporaryPassword: z.string().min(8),
});

export async function POST(req: NextRequest) {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!viewer.isHrAdmin) {
    return NextResponse.json({ error: "Only HR admins can add people to the roster." }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input." }, { status: 400 });
  }
  const data = parsed.data;

  const passwordHash = await hashPassword(data.temporaryPassword);
  const id = slugId("user");

  try {
    await db.insert(users).values({
      id,
      email: data.email.toLowerCase(),
      name: data.name,
      title: data.title,
      level: data.level,
      levelContext: data.levelContext,
      managerId: data.managerId || null,
      isHrAdmin: data.isHrAdmin,
      passwordHash,
      mustChangePassword: true,
    });
  } catch (err: any) {
    if (String(err?.message || "").includes("unique")) {
      return NextResponse.json({ error: "That email is already in use." }, { status: 409 });
    }
    throw err;
  }

  return NextResponse.json({ id }, { status: 201 });
}
