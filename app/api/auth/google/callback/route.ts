import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { createSessionCookie } from "@/lib/auth";
import { GOOGLE_OAUTH_STATE_COOKIE, googleRedirectUri, googleSsoConfigured } from "@/lib/google-sso";
import { publicOrigin } from "@/lib/request-origin";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

function fail(req: NextRequest, reason: string) {
  const res = NextResponse.redirect(new URL(`/login?error=${reason}`, publicOrigin(req)));
  res.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
  return res;
}

// Exchanges Google's authorization code for the signed-in user's verified
// email, then signs them into an EXISTING roster account — same model as
// password login: HR adds people first, this is just a second way to
// authenticate into that account, never a way to self-provision one.
export async function GET(req: NextRequest) {
  if (!googleSsoConfigured()) return fail(req, "google_not_configured");

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expectedState = req.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    return fail(req, "google_failed");
  }

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      code,
      grant_type: "authorization_code",
      redirect_uri: googleRedirectUri(publicOrigin(req)),
    }),
  });
  if (!tokenRes.ok) return fail(req, "google_failed");
  const tokenData = (await tokenRes.json()) as { access_token?: string };
  if (!tokenData.access_token) return fail(req, "google_failed");

  const userinfoRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!userinfoRes.ok) return fail(req, "google_failed");
  const profile = (await userinfoRes.json()) as { email?: string; email_verified?: boolean };
  if (!profile.email || !profile.email_verified) return fail(req, "google_failed");

  const rows = await db.select().from(users).where(eq(users.email, profile.email.toLowerCase())).limit(1);
  const user = rows[0];
  if (!user) return fail(req, "not_on_roster");

  await createSessionCookie(user.id);

  const res = NextResponse.redirect(new URL("/dashboard", publicOrigin(req)));
  res.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
  return res;
}
