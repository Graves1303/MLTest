"use client";

import type { Goal } from "@/lib/domain";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export default function GoalsEditor({
  goals,
  onChange,
  readOnly,
  ownerLabel,
}: {
  goals: Goal[];
  onChange: (goals: Goal[]) => void;
  readOnly?: boolean;
  ownerLabel?: string;
}) {
  function update(id: string, patch: Partial<Goal>) {
    onChange(goals.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }
  function add() {
    onChange([...goals, { id: uid(), text: "", timeline: "" }]);
  }
  function remove(id: string) {
    onChange(goals.filter((g) => g.id !== id));
  }

  return (
    <section className="bg-white border border-black/10 rounded-xl p-5 mb-4">
      <header className="flex items-center justify-between gap-3 mb-1.5">
        <h3 className="font-[family-name:var(--font-display)] font-semibold text-base">Goals</h3>
        {ownerLabel && (
          <span className="font-[family-name:var(--font-display)] text-[11px] uppercase tracking-wide text-[var(--ink-soft)]">
            {ownerLabel}
          </span>
        )}
      </header>
      {goals.length === 0 && <p className="text-[var(--ink-soft)] text-[13.5px] italic">No goals added yet.</p>}
      <div className="flex flex-col gap-2.5 mt-2.5">
        {goals.map((g) => (
          <div key={g.id} className="grid grid-cols-1 sm:grid-cols-[1fr_160px_auto] gap-2.5 items-start">
            <textarea
              rows={2}
              disabled={readOnly}
              placeholder="Describe the goal..."
              value={g.text}
              onChange={(e) => update(g.id, { text: e.target.value })}
              className="w-full border border-black/15 rounded-lg px-3 py-2.5 text-sm bg-[var(--paper)] text-[var(--ink)] disabled:opacity-75"
            />
            <input
              type="text"
              disabled={readOnly}
              placeholder="Timeline (e.g. Q4 2026)"
              value={g.timeline}
              onChange={(e) => update(g.id, { timeline: e.target.value })}
              className="w-full border border-black/15 rounded-lg px-3 py-2.5 text-sm bg-[var(--paper)] text-[var(--ink)] disabled:opacity-75"
            />
            {!readOnly && (
              <button
                type="button"
                onClick={() => remove(g.id)}
                aria-label="Remove goal"
                className="text-[var(--clay)] hover:bg-[var(--clay)]/10 rounded-md p-1.5"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      {!readOnly && (
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1.5 border border-dashed border-black/25 rounded-lg px-3.5 py-2 text-[13px] font-semibold text-[var(--horizon)] mt-3 hover:border-[var(--horizon-bright)]"
        >
          + Add a goal
        </button>
      )}
    </section>
  );
}
