import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") || "").trim().toLowerCase();
  if (!q) return NextResponse.json([]);

  const all = await db.select({ id: users.id, name: users.name, title: users.title }).from(users);
  const matches = all.filter((u) => u.name.toLowerCase().includes(q)).slice(0, 8);
  return NextResponse.json(matches);
}
