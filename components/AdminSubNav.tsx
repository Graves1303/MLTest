"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AdminSubNav() {
  const pathname = usePathname();
  const tabs = [
    { href: "/admin", label: "Roster" },
    { href: "/admin/cycle", label: "Cycle overview" },
  ];
  return (
    <div className="flex gap-1.5 mb-6 border-b border-black/10 pb-0">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className="px-3.5 py-2.5 text-sm font-semibold border-b-2 -mb-px"
            style={{
              borderColor: active ? "var(--horizon)" : "transparent",
              color: active ? "var(--horizon)" : "var(--ink-soft)",
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
