import { Dropbox } from "dropbox";
import { db } from "@/lib/db";
import { dropboxConnections } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { decryptText } from "@/lib/crypto";

const CONNECTION_ID = "default";

export async function getDropboxConnection() {
  const rows = await db.select().from(dropboxConnections).where(eq(dropboxConnections.id, CONNECTION_ID)).limit(1);
  return rows[0] || null;
}

/**
 * Builds an authenticated Dropbox SDK client from the stored refresh token.
 * The SDK handles exchanging it for a short-lived access token (and
 * refreshing again later) on its own — callers just use the client.
 */
export async function getDropboxClient(): Promise<Dropbox | null> {
  const connection = await getDropboxConnection();
  if (!connection) return null;
  return new Dropbox({
    clientId: process.env.DROPBOX_APP_KEY,
    clientSecret: process.env.DROPBOX_APP_SECRET,
    refreshToken: decryptText(connection.refreshTokenEnc),
  });
}

export function dropboxConfigured() {
  return !!(process.env.DROPBOX_APP_KEY && process.env.DROPBOX_APP_SECRET);
}

const DOCS_FOLDER = "/documents";

export async function uploadDocumentFile(client: Dropbox, fileName: string, bytes: ArrayBuffer) {
  const path = `${DOCS_FOLDER}/${Date.now()}-${fileName}`;
  const res = await client.filesUpload({ path, contents: bytes, mode: { ".tag": "add" }, autorename: true });
  return res.result.path_display || path;
}

export async function deleteDocumentFile(client: Dropbox, path: string) {
  await client.filesDeleteV2({ path });
}

export async function getDocumentTemporaryLink(client: Dropbox, path: string) {
  const res = await client.filesGetTemporaryLink({ path });
  return res.result.link;
}
