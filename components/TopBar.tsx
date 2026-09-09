"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import type { CurrentUser } from "@/lib/auth";

export default function TopBar({ user }: { user: CurrentUser }) {
  const router = useRouter();

  async function logout() {
    await api.post("/api/auth/logout");
    router.push("/login");
    router.refresh();
  }

  return (
    <header
      className="flex items-center gap-3 px-6 py-4 border-b border-black/10"
      style={{ background: "linear-gradient(90deg, var(--dawn), var(--paper) 75%)" }}
    >
      <svg viewBox="0 0 40 40" width="30" height="30" aria-hidden="true">
        <clipPath id="topbarSunClip">
          <circle cx="20" cy="20" r="15" />
        </clipPath>
        <g clipPath="url(#topbarSunClip)">
          <rect x="5" y="5" width="30" height="7.5" fill="var(--clay)" />
          <rect x="5" y="12.5" width="30" height="7.5" fill="var(--sand)" />
          <rect x="5" y="20" width="30" height="7.5" fill="var(--horizon-bright)" />
          <rect x="5" y="27.5" width="30" height="7.5" fill="var(--dawn)" />
        </g>
      </svg>
      <div>
        <div className="font-[family-name:var(--font-display)] font-bold text-[15px] uppercase tracking-wide">Marine Layer</div>
        <div className="font-[family-name:var(--font-display)] text-[11px] uppercase tracking-wider text-[var(--ink-soft)]">
          HQ Midyear Performance Review
        </div>
      </div>

      <nav className="ml-auto flex items-center gap-4 text-sm">
        <Link href="/dashboard" className="font-semibold hover:text-[var(--horizon-bright)]">
          Dashboard
        </Link>
        {user.isHrAdmin && (
          <Link href="/admin" className="font-semibold hover:text-[var(--horizon-bright)]">
            Admin
          </Link>
        )}
        <Link href="/account" className="font-semibold hover:text-[var(--horizon-bright)]">
          {user.name}
        </Link>
        <button onClick={logout} className="rounded-lg border border-black/15 bg-white px-3 py-1.5 text-xs font-semibold hover:border-[var(--horizon-bright)]">
          Sign out
        </button>
      </nav>
    </header>
  );
}
