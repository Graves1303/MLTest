"use client";

import RatingRow from "./RatingRow";
import CategoryLegend from "./CategoryLegend";
import { average } from "@/lib/domain";
import type { RatingMap } from "@/lib/domain";

export default function CategoryPanel({
  label,
  items,
  ratings,
  comments,
  onChangeItem,
  onChangeComments,
  readOnly,
  note,
  definitions,
}: {
  label: string;
  items: string[];
  ratings: RatingMap;
  comments: string;
  onChangeItem: (item: string, value: number | null) => void;
  onChangeComments: (value: string) => void;
  readOnly?: boolean;
  note?: string | null;
  definitions?: { name: string; tagline?: string; looksLike: string | string[] }[];
}) {
  const overall = average(Object.values(ratings));
  return (
    <section className="bg-white border border-black/10 rounded-xl p-5 mb-4">
      <header className="flex items-center justify-between gap-3 mb-1.5">
        <h3 className="font-[family-name:var(--font-display)] font-semibold text-base">{label}</h3>
        <div className="flex items-baseline gap-2">
          <span className="font-[family-name:var(--font-display)] text-[11px] uppercase tracking-wide text-[var(--ink-soft)]">
            Overall
          </span>
          <span className="font-[family-name:var(--font-display)] text-lg font-semibold" style={{ color: overall != null ? "var(--ink)" : "var(--ink-soft)" }}>
            {overall == null ? "—" : overall.toFixed(2)}
          </span>
        </div>
      </header>
      {note && <p className="text-[13px] text-[var(--ink-soft)] italic mb-3">{note}</p>}
      {definitions && <CategoryLegend label={`${label} definitions`} items={definitions} />}
      <div className="mt-2.5">
        {items.map((item) => (
          <RatingRow key={item} item={item} value={ratings[item]} readOnly={readOnly} onChange={(v) => onChangeItem(item, v)} />
        ))}
      </div>
      <div className="mt-3.5">
        <label className="block text-xs font-semibold text-[var(--ink-soft)] mb-1.5 font-[family-name:var(--font-display)]">
          Comments
        </label>
        <textarea
          disabled={readOnly}
          rows={3}
          placeholder={`Notes on ${label.toLowerCase()}...`}
          value={comments}
          onChange={(e) => onChangeComments(e.target.value)}
          className="w-full border border-black/15 rounded-lg px-3 py-2.5 text-sm bg-[var(--paper)] text-[var(--ink)] disabled:opacity-75"
        />
      </div>
    </section>
  );
}
