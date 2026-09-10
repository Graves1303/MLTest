"use client";

import { useState } from "react";

type Definition = { name: string; tagline?: string; looksLike: string | string[] };

export default function CategoryLegend({ label, items }: { label: string; items: Definition[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs font-semibold text-[var(--horizon)] uppercase tracking-wide"
      >
        {label} {open ? "▾" : "▸"}
      </button>
      {open && (
        <div className="flex flex-col gap-2 mt-2.5">
          {items.map((it) => (
            <div key={it.name} className="bg-[var(--paper)] border border-black/[0.08] rounded-lg p-3">
              <div className="font-[family-name:var(--font-display)] font-semibold text-[13.5px] mb-0.5">{it.name}</div>
              {it.tagline && <div className="text-[13px] italic text-[var(--ink)] mb-1">{it.tagline}</div>}
              {Array.isArray(it.looksLike) ? (
                <ul className="list-disc pl-[18px] mt-1">
                  {it.looksLike.map((line, i) => (
                    <li key={i} className="text-[12.5px] text-[var(--ink-soft)] leading-snug mb-0.5">{line}</li>
                  ))}
                </ul>
              ) : (
                <div className="text-[12.5px] text-[var(--ink-soft)] leading-snug">Looks like: {it.looksLike}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
