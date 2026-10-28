import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { documents, users } from "@/lib/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getDropboxClient, uploadDocumentFile } from "@/lib/dropbox-client";
import { slugId } from "@/lib/domain";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!viewer.isHrAdmin) return NextResponse.json({ error: "Only HR admins can view the document library." }, { status: 403 });

  const rows = await db.select().from(documents).orderBy(desc(documents.createdAt));
  const uploaderIds = [...new Set(rows.map((r) => r.uploadedById))];
  const uploaders = uploaderIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, uploaderIds)) : [];
  const nameById = Object.fromEntries(uploaders.map((u) => [u.id, u.name]));

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      size: Number(r.size),
      mimeType: r.mimeType,
      uploadedByName: nameById[r.uploadedById] || "Unknown",
      createdAt: r.createdAt,
    }))
  );
}

export async function POST(req: NextRequest) {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!viewer.isHrAdmin) return NextResponse.json({ error: "Only HR admins can upload documents." }, { status: 403 });

  const client = await getDropboxClient();
  if (!client) return NextResponse.json({ error: "Dropbox isn't connected yet." }, { status: 400 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "Files must be 25MB or smaller." }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const dropboxPath = await uploadDocumentFile(client, file.name, bytes);

  const id = slugId("document");
  await db.insert(documents).values({
    id,
    name: file.name,
    dropboxPath,
    size: String(file.size),
    mimeType: file.type || "application/octet-stream",
    uploadedById: viewer.id,
  });

  return NextResponse.json({ ok: true, id });
}
