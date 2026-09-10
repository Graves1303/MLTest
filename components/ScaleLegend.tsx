"use client";

import { useState } from "react";
import { RATING_SCALE, colorForRatingValue } from "@/lib/domain";

export default function ScaleLegend() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs font-semibold text-[var(--horizon)] uppercase tracking-wide"
      >
        Rating scale {open ? "▾" : "▸"}
      </button>
      {open && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-2.5">
          {RATING_SCALE.map((r) => (
            <div key={r.value} className="flex gap-2.5 bg-white border border-black/[0.08] rounded-lg p-2.5">
              <span
                className="flex-shrink-0 h-[22px] min-w-[34px] px-1.5 rounded-full text-white flex items-center justify-center font-[family-name:var(--font-display)] font-semibold text-[11px]"
                style={{ background: colorForRatingValue(r.value) }}
              >
                {r.band}
              </span>
              <div>
                <div className="font-[family-name:var(--font-display)] font-semibold text-[13px] mb-0.5">{r.label}</div>
                <div className="text-[12.5px] text-[var(--ink-soft)] leading-snug">{r.desc}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
