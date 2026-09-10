"use client";

import { RATING_VALUES, colorForRatingValue, labelForRatingValue } from "@/lib/domain";

export default function RatingRow({
  item,
  value,
  onChange,
  readOnly,
}: {
  item: string;
  value: number | null;
  onChange: (v: number | null) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-t border-black/[0.07] first:border-t-0 flex-wrap">
      <div className="flex-1 min-w-0 text-[15px]">{item}</div>
      <div className="flex gap-1 flex-shrink-0" role="radiogroup" aria-label={item}>
        {RATING_VALUES.map((v) => {
          const active = value === v;
          const color = colorForRatingValue(v);
          return (
            <button
              type="button"
              key={v}
              role="radio"
              aria-checked={active}
              disabled={readOnly}
              title={`${v} — ${labelForRatingValue(v)}`}
              onClick={() => onChange(active ? null : v)}
              className="w-[34px] h-[30px] rounded-md border-[1.5px] font-[family-name:var(--font-display)] font-semibold text-[11.5px] disabled:cursor-default disabled:opacity-85 hover:not-disabled:-translate-y-px transition-transform"
              style={{
                background: active ? color : "transparent",
                borderColor: color,
                color: active ? "#fff" : color,
              }}
            >
              {v}
            </button>
          );
        })}
      </div>
    </div>
  );
}
