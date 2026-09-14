import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listCycles, getCurrentCycle, startNewCycle } from "@/lib/cycles";
import { z } from "zod";

export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!viewer.isHrAdmin) return NextResponse.json({ error: "Only HR admins can view cycles." }, { status: 403 });

  const [all, current] = await Promise.all([listCycles(), getCurrentCycle()]);
  return NextResponse.json({ cycles: all, currentCycleId: current?.id || null });
}

const bodySchema = z.object({
  name: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!viewer.isHrAdmin) return NextResponse.json({ error: "Only HR admins can start a new cycle." }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input." }, { status: 400 });
  }

  try {
    const cycle = await startNewCycle(parsed.data);
    return NextResponse.json({ cycle }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Couldn't start that cycle." }, { status: 400 });
  }
}
