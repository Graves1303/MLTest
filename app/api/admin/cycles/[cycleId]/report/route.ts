import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCycleById } from "@/lib/cycles";
import { buildCycleReport } from "@/lib/cycle-report";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ cycleId: string }> }) {
  const { cycleId } = await params;
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!viewer.isHrAdmin) {
    return NextResponse.json({ error: "Only HR admins can view cycle reports." }, { status: 403 });
  }

  const cycle = await getCycleById(cycleId);
  if (!cycle) return NextResponse.json({ error: "That cycle doesn't exist." }, { status: 404 });

  const result = await buildCycleReport(cycleId);
  return NextResponse.json({ cycle, rows: result });
}
