import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { documents } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getDropboxClient, deleteDocumentFile } from "@/lib/dropbox-client";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!viewer.isHrAdmin) return NextResponse.json({ error: "Only HR admins can delete documents." }, { status: 403 });

  const rows = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  const doc = rows[0];
  if (!doc) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  const client = await getDropboxClient();
  if (client) await deleteDocumentFile(client, doc.dropboxPath).catch(() => null);

  await db.delete(documents).where(eq(documents.id, id));
  return NextResponse.json({ ok: true });
}
