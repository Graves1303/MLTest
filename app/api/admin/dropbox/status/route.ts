import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { dropboxConfigured, getDropboxConnection } from "@/lib/dropbox-client";

export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!viewer.isHrAdmin) return NextResponse.json({ error: "Only HR admins can view this." }, { status: 403 });

  const connection = await getDropboxConnection();
  return NextResponse.json({
    configured: dropboxConfigured(),
    connected: !!connection,
    accountEmail: connection?.accountEmail || null,
  });
}
