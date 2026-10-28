import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { GOOGLE_OAUTH_STATE_COOKIE, googleRedirectUri, googleSsoConfigured } from "@/lib/google-sso";

const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";

// Kicks off "Sign in with Google": redirects to Google's consent screen.
// The actual roster lookup happens in the callback — this route just starts
// a standard OAuth2 authorization-code flow with CSRF protection via `state`.
export async function GET(req: NextRequest) {
  if (!googleSsoConfigured()) {
    return NextResponse.redirect(new URL("/login?error=google_not_configured", req.url));
  }

  const state = crypto.randomBytes(16).toString("hex");

  const url = new URL(GOOGLE_AUTHORIZE_URL);
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", googleRedirectUri(req.nextUrl.origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  // Restricts the Google account picker to the company's Workspace domain.
  // This is a first-pass filter, not the real access gate — the callback's
  // roster-email lookup is what actually decides who can sign in.
  url.searchParams.set("hd", "marinelayer.com");

  const res = NextResponse.redirect(url);
  res.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
