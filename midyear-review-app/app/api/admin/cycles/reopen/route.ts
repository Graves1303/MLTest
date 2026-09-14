import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { reopenCurrentCycle } from "@/lib/cycles";

export async function POST() {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!viewer.isHrAdmin) return NextResponse.json({ error: "Only HR admins can reopen a cycle." }, { status: 403 });

  try {
    const cycle = await reopenCurrentCycle();
    return NextResponse.json({ cycle });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Couldn't reopen that cycle." }, { status: 400 });
  }
}
