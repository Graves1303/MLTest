import { NextRequest } from "next/server";

/**
 * The app's real public origin — even behind a reverse proxy (Railway, etc.)
 * that terminates TLS and forwards to the container's internal host:port.
 * `req.nextUrl.origin` reflects the raw Host header the container received,
 * which behind such a proxy can be the internal address rather than the
 * public domain; X-Forwarded-Host/Proto are the standard way a proxy tells
 * the app what the client actually connected to. Falls back to the
 * request's own origin for local dev, where there's no proxy in front.
 */
export function publicOrigin(req: NextRequest): string {
  const forwardedHost = req.headers.get("x-forwarded-host");
  if (!forwardedHost) return req.nextUrl.origin;
  const forwardedProto = req.headers.get("x-forwarded-proto") || "https";
  return `${forwardedProto}://${forwardedHost}`;
}
