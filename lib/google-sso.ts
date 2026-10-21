// Shared between app/api/auth/google and app/api/auth/google/callback — both
// need to agree on the same cookie name and redirect_uri (Google requires an
// exact match between the authorize request and the token exchange).
export const GOOGLE_OAUTH_STATE_COOKIE = "google_oauth_state";

export function googleRedirectUri(origin: string) {
  return `${origin}/api/auth/google/callback`;
}

export function googleSsoConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}
