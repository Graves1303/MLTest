"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";

type Person = { id: string; name: string; title: string | null };

export default function PeerFeedbackPage() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Person[]>([]);
  const [selected, setSelected] = useState<Person | null>(null);
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [strengths, setStrengths] = useState("");
  const [growth, setGrowth] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!query.trim() || selected) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const results: Person[] = await api.get(`/api/directory?q=${encodeURIComponent(query.trim())}`);
        setSuggestions(results);
      } catch {
        setSuggestions([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query, selected]);

  async function pick(p: Person) {
    setSelected(p);
    setQuery(p.name);
    setSuggestions([]);
    setError("");
    setDone(false);
    try {
      const status = await api.get(`/api/peer-feedback/${p.id}/submit`);
      setEligible(status.eligible);
      setAlreadySubmitted(!!status.submitted);
      setStrengths(status.strengths || "");
      setGrowth(status.growth || "");
    } catch {
      setEligible(false);
    }
  }

  async function submit() {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      await api.post(`/api/peer-feedback/${selected.id}/submit`, { strengths, growth });
      setDone(true);
      setAlreadySubmitted(true);
    } catch (err: any) {
      setError(err.message || "Couldn't submit.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <Link href="/dashboard" className="text-[var(--ink-soft)] text-sm font-semibold inline-flex items-center gap-1.5 mb-5">
        ← Back to dashboard
      </Link>

      <h2 className="font-[family-name:var(--font-headline)] text-2xl mb-1">Give anonymous peer feedback</h2>
      <p className="text-[var(--ink-soft)] text-sm mb-6">
        Search for who you'd like to give feedback about. Your response won't be linked to your name.
      </p>

      <div className="relative max-w-md mb-6">
        <input
          type="text"
          placeholder="Start typing a name..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
            setEligible(null);
          }}
          className="w-full border border-black/18 rounded-lg px-3 py-2.5 text-sm"
        />
        {suggestions.length > 0 && (
          <div className="flex flex-col gap-1.5 mt-2">
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => pick(s)}
                className="text-left bg-white border border-black/12 rounded-lg px-3 py-2.5 text-sm hover:border-[var(--denim)] flex items-center justify-between"
              >
                <span>{s.name}</span>
                <span className="text-[var(--ink-soft)] text-xs">{s.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && eligible === false && (
        <p className="text-[var(--ink-soft)] text-sm italic max-w-md">
          You're not on {selected.name}'s peer feedback list. Check with their manager if you think this is a mistake.
        </p>
      )}

      {selected && eligible === true && (
        <div className="max-w-md flex flex-col gap-4">
          {done && (
            <div className="bg-white border border-black/10 rounded-xl p-5 text-sm">
              <div className="font-semibold text-[var(--pine)] mb-1">Thank you</div>
              Your feedback has been submitted anonymously. Nothing you wrote is linked to your name.
            </div>
          )}
          <label className="block">
            <span className="block text-xs font-semibold text-[var(--ink-soft)] mb-1.5">
              What were {selected.name.split(" ")[0]}'s biggest strengths this year?
            </span>
            <textarea rows={4} value={strengths} onChange={(e) => setStrengths(e.target.value)} placeholder="Strengths, wins, standout moments..." className="w-full border border-black/18 rounded-lg px-3 py-2.5 text-sm" />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-[var(--ink-soft)] mb-1.5">Where do they have opportunities to develop &amp; grow?</span>
            <textarea rows={4} value={growth} onChange={(e) => setGrowth(e.target.value)} placeholder="Growth areas, opportunities..." className="w-full border border-black/18 rounded-lg px-3 py-2.5 text-sm" />
          </label>
          {error && <div className="text-[var(--clay)] text-[13px] font-semibold">{error}</div>}
          <button
            type="button"
            disabled={saving || !strengths.trim() || !growth.trim()}
            onClick={submit}
            className="self-start rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--horizon)" }}
          >
            {saving ? "Submitting…" : alreadySubmitted ? "Update my anonymous feedback" : "Submit anonymously"}
          </button>
        </div>
      )}
    </div>
  );
}
