import { NextRequest, NextResponse } from "next/server";
import { Dropbox } from "dropbox";
import { db } from "@/lib/db";
import { dropboxConnections } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { encryptText } from "@/lib/crypto";
import { DROPBOX_OAUTH_STATE_COOKIE, dropboxRedirectUri } from "@/lib/dropbox-oauth";
import { publicOrigin } from "@/lib/request-origin";

const DROPBOX_TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";

function fail(req: NextRequest, reason: string) {
  const res = NextResponse.redirect(new URL(`/admin/documents?error=${reason}`, publicOrigin(req)));
  res.cookies.delete(DROPBOX_OAUTH_STATE_COOKIE);
  return res;
}

export async function GET(req: NextRequest) {
  const viewer = await getCurrentUser();
  if (!viewer || !viewer.isHrAdmin) return fail(req, "not_authorized");

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expectedState = req.cookies.get(DROPBOX_OAUTH_STATE_COOKIE)?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    return fail(req, "dropbox_failed");
  }

  const tokenRes = await fetch(DROPBOX_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      client_id: process.env.DROPBOX_APP_KEY!,
      client_secret: process.env.DROPBOX_APP_SECRET!,
      redirect_uri: dropboxRedirectUri(publicOrigin(req)),
    }),
  });
  if (!tokenRes.ok) return fail(req, "dropbox_failed");
  const tokenData = (await tokenRes.json()) as { access_token?: string; refresh_token?: string };
  if (!tokenData.access_token || !tokenData.refresh_token) return fail(req, "dropbox_failed");

  const client = new Dropbox({ accessToken: tokenData.access_token });
  const account = await client.usersGetCurrentAccount().catch(() => null);
  if (!account) return fail(req, "dropbox_failed");

  const refreshTokenEnc = encryptText(tokenData.refresh_token);
  const existing = await db.select().from(dropboxConnections).where(eq(dropboxConnections.id, "default")).limit(1);
  if (existing[0]) {
    await db
      .update(dropboxConnections)
      .set({ accountEmail: account.result.email, refreshTokenEnc, connectedById: viewer.id, connectedAt: new Date() })
      .where(eq(dropboxConnections.id, "default"));
  } else {
    await db.insert(dropboxConnections).values({
      id: "default",
      accountEmail: account.result.email,
      refreshTokenEnc,
      connectedById: viewer.id,
    });
  }

  const res = NextResponse.redirect(new URL("/admin/documents?connected=1", publicOrigin(req)));
  res.cookies.delete(DROPBOX_OAUTH_STATE_COOKIE);
  return res;
}
