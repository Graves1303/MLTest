// Shared between app/api/admin/dropbox/connect and .../callback — both need
// to agree on the same cookie name and redirect_uri (Dropbox requires an
// exact match between the authorize request and the token exchange).
export const DROPBOX_OAUTH_STATE_COOKIE = "dropbox_oauth_state";

export function dropboxRedirectUri(origin: string) {
  return `${origin}/api/admin/dropbox/callback`;
}
