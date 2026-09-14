import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentCycle } from "@/lib/cycles";
import { buildCycleReport } from "@/lib/cycle-report";

export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!viewer.isHrAdmin) {
    return NextResponse.json({ error: "Only HR admins can view the cycle report." }, { status: 403 });
  }

  const current = await getCurrentCycle();
  if (!current) return NextResponse.json([]);

  const result = await buildCycleReport(current.id);
  return NextResponse.json(result);
}
