"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";

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

        <form onSubmit={submit} className="bg-white border border-black/10 rounded-xl p-6 flex flex-col gap-4">
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
        <p className="text-center text-[12.5px] text-[var(--ink-soft)] mt-5">
          Don't have an account? Ask your HR admin to add you to the roster.
        </p>
      </div>
    </div>
  );
}
