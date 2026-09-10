"use client";

import { useRef, useState } from "react";
import Papa from "papaparse";
import { api } from "@/lib/api-client";
import { contextForLevel } from "@/lib/domain";

const COLUMN_ALIASES: Record<string, string[]> = {
  name: ["name", "employee", "employee name"],
  email: ["email", "email address"],
  title: ["title"],
  level: ["level"],
  managerRef: ["manager", "manager name", "manager email"],
  isHrAdmin: ["hr admin", "is hr admin", "admin"],
};

type ParsedRow = {
  name: string;
  email: string;
  title: string;
  level: string;
  managerRef: string;
  isHrAdmin: boolean;
  isNew: boolean;
};

function truthy(v: string) {
  return ["yes", "true", "1", "y"].includes(v.trim().toLowerCase());
}

export default function ImportRosterPanel({
  existingEmails,
  onDone,
  onImported,
}: {
  existingEmails: Set<string>;
  onDone: () => void;
  onImported: () => void;
}) {
  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState<{ rows: ParsedRow[]; problems: string[] } | null>(null);
  const [parseError, setParseError] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: { email: string; name: string; temporaryPassword: string }[]; updated: { email: string; name: string }[]; problems: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setRawText(String(reader.result || ""));
    reader.onerror = () => setParseError("Couldn't read that file.");
    reader.readAsText(file);
  }

  function parse() {
    setParseError("");
    setResult(null);
    if (!rawText.trim()) {
      setParseError("Paste some CSV content or choose a file first.");
      return;
    }
    const csvResult = Papa.parse<Record<string, string>>(rawText.trim(), { header: true, skipEmptyLines: true });
    if (csvResult.errors?.length) {
      setParseError("Couldn't parse that CSV: " + csvResult.errors[0].message);
      return;
    }
    const rowsData = csvResult.data;
    if (!rowsData.length) {
      setParseError("No rows found in that CSV.");
      return;
    }

    const colMap: Record<string, string> = {};
    const headers = Object.keys(rowsData[0]);
    headers.forEach((h) => {
      const norm = h.trim().toLowerCase();
      Object.entries(COLUMN_ALIASES).forEach(([field, aliases]) => {
        if (aliases.includes(norm)) colMap[field] = h;
      });
    });
    if (!colMap.name) {
      setParseError('No "Name" column found. Make sure the CSV has a header row with a "Name" column.');
      return;
    }
    if (!colMap.email) {
      setParseError('No "Email" column found. Every person needs a real email to sign in with.');
      return;
    }

    const problems: string[] = [];
    const rows: ParsedRow[] = [];
    const seenEmails = new Set<string>();
    rowsData.forEach((row, i) => {
      const name = (row[colMap.name] || "").trim();
      const email = (row[colMap.email] || "").trim().toLowerCase();
      if (!name || !email) {
        problems.push(`Row ${i + 2}: missing name or email, skipped.`);
        return;
      }
      if (!email.includes("@")) {
        problems.push(`Row ${i + 2}: "${email}" doesn't look like a valid email, skipped.`);
        return;
      }
      if (seenEmails.has(email)) {
        problems.push(`Row ${i + 2}: duplicate email "${email}" in this file, skipped.`);
        return;
      }
      seenEmails.add(email);
      const level = colMap.level ? (row[colMap.level] || "").trim() : "";
      if (level && !contextForLevel(level)) {
        problems.push(`Row ${i + 2}: level "${level}" doesn't match a standard title — will be saved as typed, with no level context.`);
      }
      rows.push({
        name,
        email,
        title: colMap.title ? (row[colMap.title] || "").trim() : "",
        level,
        managerRef: colMap.managerRef ? (row[colMap.managerRef] || "").trim() : "",
        isHrAdmin: colMap.isHrAdmin ? truthy(row[colMap.isHrAdmin] || "") : false,
        isNew: !existingEmails.has(email),
      });
    });

    setParsed({ rows, problems });
  }

  async function confirmImport() {
    if (!parsed) return;
    setImporting(true);
    try {
      const res = await api.post("/api/users/import", {
        rows: parsed.rows.map((r) => ({
          name: r.name,
          email: r.email,
          title: r.title,
          level: r.level,
          managerRef: r.managerRef,
          isHrAdmin: r.isHrAdmin,
        })),
      });
      setResult(res);
      setParsed(null);
      setRawText("");
      onImported();
    } catch (err: any) {
      setParseError(err.message || "Import failed — check your connection and try again.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <section className="bg-white border border-black/10 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="font-[family-name:var(--font-display)] font-semibold text-base">Import roster</h3>
        <button type="button" onClick={onDone} className="text-[var(--horizon)] text-[13px] font-semibold">Close</button>
      </div>

      {result ? (
        <div>
          <p className="text-sm mb-3">
            <strong>{result.created.length}</strong> new, <strong>{result.updated.length}</strong> updated.
          </p>
          {result.created.length > 0 && (
            <div className="bg-[var(--paper)] border border-black/10 rounded-lg p-3.5 mb-3">
              <p className="text-[13px] font-semibold mb-2">
                Temporary passwords — copy these now, they won't be shown again:
              </p>
              <div className="flex flex-col gap-1 font-[family-name:var(--font-display)] text-[13px]">
                {result.created.map((c) => (
                  <div key={c.email}>{c.name} ({c.email}): <strong>{c.temporaryPassword}</strong></div>
                ))}
              </div>
            </div>
          )}
          {result.problems.length > 0 && (
            <div className="text-[13px] text-[var(--sand)] mb-3">
              {result.problems.map((p, i) => <p key={i}>{p}</p>)}
            </div>
          )}
          <button type="button" onClick={onDone} className="rounded-lg px-4 py-2 text-sm font-semibold border border-black/20 bg-white">
            Done
          </button>
        </div>
      ) : (
        <>
          <p className="text-[13px] text-[var(--ink-soft)] mb-3">
            CSV with a header row. Required: <strong>Name, Email</strong>. Optional: Title, Level, Manager (their name
            or email — either works), HR Admin (yes/no). If Level matches one of the standard titles (e.g.
            "Manager", "Senior Director"), its Level Context is filled in automatically — there's no separate column
            for it. Matching is by email — importing someone already on the roster updates their profile instead of
            duplicating them; blank cells never overwrite existing values, and their password is never touched.
          </p>
          <div className="flex items-center gap-3 mb-2.5">
            <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-lg px-3 py-2 text-xs font-semibold border border-black/20 bg-white">
              Choose CSV file
            </button>
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
            <span className="text-[12px] text-[var(--ink-soft)]">or paste below</span>
          </div>
          <textarea
            rows={6}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={"Name,Email,Title,Level,Manager\nJordan Lee,jordan@company.com,Associate,Associate,Sam Rivera"}
            className="w-full border border-black/18 rounded-lg px-3 py-2.5 text-sm font-[family-name:var(--font-display)] mb-2.5"
          />
          {parseError && <div className="text-[var(--clay)] text-[13px] font-semibold mb-2.5">{parseError}</div>}
          {!parsed && (
            <button type="button" onClick={parse} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white" style={{ background: "var(--horizon)" }}>
              Preview import
            </button>
          )}

          {parsed && (
            <div>
              {parsed.problems.length > 0 && (
                <div className="text-[13px] text-[var(--sand)] mb-2.5">
                  {parsed.problems.map((p, i) => <p key={i}>{p}</p>)}
                </div>
              )}
              <div className="flex flex-col gap-1.5 mb-3.5 max-h-64 overflow-y-auto">
                {parsed.rows.map((r) => (
                  <div key={r.email} className="flex items-center gap-2.5 text-[13px] border-t border-black/[0.07] pt-1.5 first:border-t-0 first:pt-0">
                    <span
                      className="text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5"
                      style={r.isNew ? { background: "rgba(90,96,106,0.12)", color: "var(--pine)" } : { background: "rgba(231,136,53,0.15)", color: "var(--sand)" }}
                    >
                      {r.isNew ? "New" : "Update"}
                    </span>
                    <span className="font-semibold">{r.name}</span>
                    <span className="text-[var(--ink-soft)]">{r.email}{r.managerRef ? ` · reports to ${r.managerRef}` : ""}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  disabled={importing}
                  onClick={confirmImport}
                  className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: "var(--horizon)" }}
                >
                  {importing ? "Importing…" : `Confirm import (${parsed.rows.length})`}
                </button>
                <button type="button" onClick={() => setParsed(null)} className="rounded-lg px-4 py-2.5 text-sm font-semibold border border-black/20 bg-white">
                  Back
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
