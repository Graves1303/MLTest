import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { peerAssignments, users } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentCycle } from "@/lib/cycles";
import { countPeerLoads } from "@/lib/domain";

export async function GET(req: NextRequest) {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") || "").trim().toLowerCase();
  if (!q) return NextResponse.json([]);

  const all = await db.select({ id: users.id, name: users.name, title: users.title }).from(users);
  const matches = all.filter((u) => u.name.toLowerCase().includes(q)).slice(0, 8);

  // Peer workload is only included when asked for, and only for people who
  // actually assign peers (managers and HR admins) — everyone else using the
  // directory just gets names.
  if (req.nextUrl.searchParams.get("withPeerLoad") !== "1") return NextResponse.json(matches);
  const managesSomeone =
    viewer.isHrAdmin || (await db.select({ id: users.id }).from(users).where(eq(users.managerId, viewer.id)).limit(1)).length > 0;
  if (!managesSomeone) return NextResponse.json(matches);

  const cycle = await getCurrentCycle();
  const loads = cycle
    ? countPeerLoads(
        await db
          .select({ employeeId: peerAssignments.employeeId, peerUserIds: peerAssignments.peerUserIds })
          .from(peerAssignments)
          .where(eq(peerAssignments.cycleId, cycle.id))
      )
    : {};

  return NextResponse.json(matches.map((m) => ({ ...m, peerLoad: loads[m.id] || 0 })));
}
