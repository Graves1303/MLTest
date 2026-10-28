"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api-client";

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  not_on_roster: "Your Google account isn't on the roster yet — ask your HR admin to add you.",
  google_not_configured: "Google sign-in isn't set up for this app yet.",
  google_failed: "Something went wrong signing in with Google. Please try again.",
};

function GoogleSsoError() {
  const params = useSearchParams();
  const code = params.get("error");
  const message = code ? GOOGLE_ERROR_MESSAGES[code] : null;
  if (!message) return null;
  return <div className="text-[var(--clay)] text-[13px] font-semibold text-center mb-4">{message}</div>;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await api.post("/api/auth/login", { email, password });
      router.push(user.mustChangePassword ? "/account" : "/dashboard");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "var(--paper)" }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <svg viewBox="0 0 40 40" width="40" height="40" className="mx-auto mb-3" aria-hidden="true">
            <clipPath id="loginSunClip">
              <circle cx="20" cy="20" r="15" />
            </clipPath>
            <g clipPath="url(#loginSunClip)">
              <rect x="5" y="5" width="30" height="7.5" fill="var(--clay)" />
              <rect x="5" y="12.5" width="30" height="7.5" fill="var(--sand)" />
              <rect x="5" y="20" width="30" height="7.5" fill="var(--horizon-bright)" />
              <rect x="5" y="27.5" width="30" height="7.5" fill="var(--dawn)" />
            </g>
          </svg>
          <h1 className="font-[family-name:var(--font-display)] font-bold text-xl uppercase tracking-wide">Marine Layer</h1>
        </div>

        <Suspense fallback={null}>
          <GoogleSsoError />
        </Suspense>

        <div className="bg-white border border-black/10 rounded-xl p-6 flex flex-col gap-4">
          <a
            href="/api/auth/google"
            className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold border border-black/18"
          >
            <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6 29.6 4 24 4c-7.5 0-14 4.2-17.7 10.7z" />
              <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.6 35.1 26.9 36 24 36c-5.2 0-9.6-3.3-11.2-8l-6.6 5.1C9.9 39.8 16.4 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.6 5.6c-.5.4 7.2-5.2 7.2-15.7 0-1.3-.1-2.7-.4-3.5z" />
            </svg>
            Sign in with Google
          </a>

          <div className="flex items-center gap-3 text-[11px] text-[var(--ink-soft)]">
            <div className="flex-1 border-t border-black/10" />
            or
            <div className="flex-1 border-t border-black/10" />
          </div>

          <form onSubmit={submit} className="flex flex-col gap-4">
            <label className="block">
              <span className="block text-xs font-semibold text-[var(--ink-soft)] mb-1.5 font-[family-name:var(--font-display)]">Email</span>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-black/18 rounded-lg px-3 py-2.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-[var(--ink-soft)] mb-1.5 font-[family-name:var(--font-display)]">Password</span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-black/18 rounded-lg px-3 py-2.5 text-sm"
              />
            </label>
            {error && <div className="text-[var(--clay)] text-[13px] font-semibold">{error}</div>}
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--horizon)" }}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
        <p className="text-center text-[12.5px] text-[var(--ink-soft)] mt-5">
          Don't have an account? Ask your HR admin to add you to the roster.
        </p>
      </div>
    </div>
  );
}
