export default function StatusPill({ status }: { status?: string }) {
  const map: Record<string, { label: string; color: string }> = {
    none: { label: "Not started", color: "var(--ink-soft)" },
    draft: { label: "Draft", color: "var(--sand)" },
    submitted: { label: "Submitted", color: "var(--pine)" },
  };
  const s = map[status || "none"] || map.none;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold font-[family-name:var(--font-display)]"
      style={{ color: s.color, borderColor: s.color }}
    >
      {s.label}
    </span>
  );
}
