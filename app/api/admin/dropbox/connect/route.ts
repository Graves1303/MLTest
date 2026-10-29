import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { dropboxConnections } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { dropboxConfigured } from "@/lib/dropbox-client";
import { DROPBOX_OAUTH_STATE_COOKIE, dropboxRedirectUri } from "@/lib/dropbox-oauth";
import { publicOrigin } from "@/lib/request-origin";

const DROPBOX_AUTHORIZE_URL = "https://www.dropbox.com/oauth2/authorize";

// Kicks off connecting the company's Dropbox account: redirects to Dropbox's
// consent screen. token_access_type=offline is what gets us a refresh token
// back in the callback, so the connection doesn't need re-authorizing every
// few hours.
export async function GET(req: NextRequest) {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!viewer.isHrAdmin) {
    return NextResponse.json({ error: "Only HR admins can connect Dropbox." }, { status: 403 });
  }
  if (!dropboxConfigured()) {
    return NextResponse.redirect(new URL("/admin/documents?error=dropbox_not_configured", publicOrigin(req)));
  }

  const state = crypto.randomBytes(16).toString("hex");

  const url = new URL(DROPBOX_AUTHORIZE_URL);
  url.searchParams.set("client_id", process.env.DROPBOX_APP_KEY!);
  url.searchParams.set("redirect_uri", dropboxRedirectUri(publicOrigin(req)));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("token_access_type", "offline");
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url);
  res.cookies.set(DROPBOX_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}

export async function DELETE() {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!viewer.isHrAdmin) {
    return NextResponse.json({ error: "Only HR admins can disconnect Dropbox." }, { status: 403 });
  }
  await db.delete(dropboxConnections).where(eq(dropboxConnections.id, "default"));
  return NextResponse.json({ ok: true });
}
