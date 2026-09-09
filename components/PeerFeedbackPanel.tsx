"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";

type Peer = { id: string; name: string };
type ChecklistItem = { id: string; name: string; submitted: boolean };

export default function PeerFeedbackPanel({ employeeId, employeeName }: { employeeId: string; employeeName: string }) {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [minToReveal, setMinToReveal] = useState(3);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [count, setCount] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [entries, setEntries] = useState<{ id: string; strengths: string; growth: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Peer[]>([]);

  async function load() {
    setLoading(true);
    try {
      const [assign, feedback] = await Promise.all([
        api.get(`/api/peer-assignments/${employeeId}`),
        api.get(`/api/peer-feedback/${employeeId}`),
      ]);
      setPeers(assign.peers || []);
      setMinToReveal(assign.minToReveal || 3);
      setChecklist(feedback.checklist || []);
      setCount(feedback.count || 0);
      setRevealed(feedback.revealed || false);
      setEntries(feedback.entries || []);
    } catch {
      // best-effort — peer feedback isn't essential to loading the review
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const results: Peer[] = await api.get(`/api/directory?q=${encodeURIComponent(query.trim())}`);
        setSuggestions(
          results.filter((r) => r.id !== employeeId && !peers.some((p) => p.id === r.id)).slice(0, 6)
        );
      } catch {
        setSuggestions([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query, peers, employeeId]);

  async function savePeers(nextPeers: Peer[], nextMin: number) {
    setPeers(nextPeers);
    setMinToReveal(nextMin);
    await api.put(`/api/peer-assignments/${employeeId}`, {
      peerUserIds: nextPeers.map((p) => p.id),
      minToReveal: nextMin,
    });
    load();
  }

  function addPeer(p: Peer) {
    setQuery("");
    savePeers([...peers, p], minToReveal);
  }
  function removePeer(id: string) {
    savePeers(peers.filter((p) => p.id !== id), minToReveal);
  }

  if (loading) return null;

  return (
    <section className="bg-white border border-black/10 rounded-xl p-5 mb-4">
      <header className="flex items-center justify-between gap-3 mb-1.5">
        <h3 className="font-[family-name:var(--font-display)] font-semibold text-base">Peer feedback</h3>
        <button type="button" onClick={() => setEditing((v) => !v)} className="text-[var(--horizon)] text-[13px] font-semibold">
          {editing ? "Done" : "Manage peer reviewers"}
        </button>
      </header>

      {editing && (
        <div className="bg-[var(--paper)] border border-black/10 rounded-lg p-3.5 mb-3">
          <p className="text-[13px] text-[var(--ink-soft)] mb-2.5">
            Add anyone in the company to give anonymous feedback on {employeeName}. They'll need to be signed in as
            themselves to submit — it's never attached to what they write.
          </p>
          <div className="flex flex-wrap gap-2 mb-2.5">
            {peers.length === 0 && <p className="text-[13px] italic text-[var(--ink-soft)]">No peers assigned yet.</p>}
            {peers.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1.5 bg-white border border-black/15 rounded-full pl-3 pr-1.5 py-1 text-[13px] font-semibold">
                {p.name}
                <button type="button" onClick={() => removePeer(p.id)} className="text-[var(--ink-soft)] hover:text-[var(--clay)]">
                  ✕
                </button>
              </span>
            ))}
          </div>
          <div className="relative mb-2.5">
            <input
              type="text"
              placeholder="Search for a peer's name..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full border border-black/18 rounded-lg px-3 py-2 text-[13px]"
            />
            {suggestions.length > 0 && (
              <div className="flex flex-col gap-1 mt-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => addPeer(s)}
                    className="text-left bg-white border border-black/12 rounded-lg px-3 py-2 text-[13px] hover:border-[var(--horizon-bright)]"
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <label className="flex items-center justify-between text-[13px] font-semibold">
            <span>Minimum responses before feedback is revealed</span>
            <input
              type="number"
              min={2}
              value={minToReveal}
              onChange={(e) => savePeers(peers, Math.max(2, parseInt(e.target.value, 10) || 2))}
              className="w-16 border border-black/18 rounded-lg px-2 py-1 text-center"
            />
          </label>
        </div>
      )}

      <div className="flex items-center gap-2.5 text-[13.5px] text-[var(--ink-soft)]">
        <span
          className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold"
          style={revealed ? { color: "var(--pine)", borderColor: "var(--pine)" } : { color: "var(--sand)", borderColor: "var(--sand)" }}
        >
          {revealed ? "Revealed" : "Pending"}
        </span>
        <span>
          {count} of {peers.length} invited peers have responded
          {!revealed && ` — unlocks at ${minToReveal}`}
        </span>
      </div>

      {checklist.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2.5">
          {checklist.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--ink-soft)]">
              <span style={{ color: c.submitted ? "var(--pine)" : "var(--ink-soft)" }}>{c.submitted ? "●" : "○"}</span> {c.name}
            </span>
          ))}
        </div>
      )}

      {!revealed && (
        <p className="text-[13px] italic text-[var(--ink-soft)] mt-2.5">
          Individual responses stay hidden until at least {minToReveal} peers have submitted, to help protect
          anonymity in a small group.
        </p>
      )}

      {revealed && (
        <div className="flex flex-col gap-2.5 mt-3">
          {entries.map((e) => (
            <div key={e.id} className="bg-[var(--paper)] border border-black/10 rounded-lg p-3.5">
              {e.strengths && (
                <div className="mb-2">
                  <div className="text-[11px] uppercase tracking-wide text-[var(--ink-soft)] font-semibold">Strengths</div>
                  <p className="text-sm mt-0.5">{e.strengths}</p>
                </div>
              )}
              {e.growth && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-[var(--ink-soft)] font-semibold">Growth areas</div>
                  <p className="text-sm mt-0.5">{e.growth}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
