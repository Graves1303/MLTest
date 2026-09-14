import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { slugId, canonicalLevel, contextForLevel } from "@/lib/domain";
import { z } from "zod";

function randomPassword() {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6).toUpperCase();
}

const rowSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  title: z.string().optional().default(""),
  level: z.string().optional().default(""),
  templateKey: z.string().optional().default("corporate"),
  managerRef: z.string().optional().default(""), // raw text from the CSV — resolved below
  isHrAdmin: z.boolean().optional().default(false),
});

const bodySchema = z.object({ rows: z.array(rowSchema).min(1) });

export async function POST(req: NextRequest) {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!viewer.isHrAdmin) {
    return NextResponse.json({ error: "Only HR admins can import a roster." }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input." }, { status: 400 });
  }
  const { rows } = parsed.data;

  const problems: string[] = [];
  const created: { email: string; name: string; temporaryPassword: string }[] = [];
  const updated: { email: string; name: string }[] = [];

  // Pass 1: create or update every row by email, without touching manager links yet —
  // a manager referenced later in the same file might not exist as a row yet.
  const existingAll = await db.select().from(users);
  const byEmail = new Map(existingAll.map((u) => [u.email.toLowerCase(), u]));

  for (const row of rows) {
    const email = row.email.toLowerCase();
    const existing = byEmail.get(email);

    if (row.level && !contextForLevel(row.templateKey, row.level)) {
      problems.push(`${row.name}: level "${row.level}" doesn't match a standard title for the ${row.templateKey} template — saved as typed, but with no level context.`);
    }
    const level = canonicalLevel(row.templateKey, row.level);
    const levelContext = contextForLevel(row.templateKey, row.level);

    if (existing) {
      await db
        .update(users)
        .set({
          name: row.name,
          title: row.title ? row.title : existing.title,
          level: row.level ? level : existing.level,
          levelContext: row.level ? levelContext : existing.levelContext,
          templateKey: row.templateKey || existing.templateKey,
          ...(row.isHrAdmin ? { isHrAdmin: true } : {}),
        })
        .where(eq(users.id, existing.id));
      updated.push({ email, name: row.name });
    } else {
      const temporaryPassword = randomPassword();
      const passwordHash = await hashPassword(temporaryPassword);
      const id = slugId("user");
      await db.insert(users).values({
        id,
        email,
        name: row.name,
        title: row.title,
        level,
        levelContext,
        templateKey: row.templateKey,
        isHrAdmin: row.isHrAdmin,
        passwordHash,
        mustChangePassword: true,
      });
      created.push({ email, name: row.name, temporaryPassword });
      byEmail.set(email, { id, email, name: row.name } as any);
    }
  }

  // Pass 2: resolve manager references now that everyone in this batch exists.
  const refreshedAll = await db.select().from(users);
  const byEmailFinal = new Map(refreshedAll.map((u) => [u.email.toLowerCase(), u]));
  const byNameFinal = new Map<string, typeof refreshedAll>();
  for (const u of refreshedAll) {
    const key = u.name.trim().toLowerCase();
    byNameFinal.set(key, [...(byNameFinal.get(key) || []), u]);
  }

  for (const row of rows) {
    const ref = row.managerRef.trim();
    if (!ref) continue;
    const self = byEmailFinal.get(row.email.toLowerCase());
    if (!self) continue;

    let manager = byEmailFinal.get(ref.toLowerCase());
    if (!manager) {
      const nameMatches = byNameFinal.get(ref.toLowerCase()) || [];
      if (nameMatches.length === 1) {
        manager = nameMatches[0];
      } else if (nameMatches.length > 1) {
        problems.push(`${row.name}: manager "${ref}" matches ${nameMatches.length} people by name — use their email instead to disambiguate.`);
        continue;
      }
    }
    if (!manager) {
      problems.push(`${row.name}: manager "${ref}" wasn't found — left unassigned.`);
      continue;
    }
    if (manager.id === self.id) {
      problems.push(`${row.name}: can't be their own manager — left unassigned.`);
      continue;
    }
    await db.update(users).set({ managerId: manager.id }).where(eq(users.id, self.id));
  }

  return NextResponse.json({ created, updated, problems });
}
