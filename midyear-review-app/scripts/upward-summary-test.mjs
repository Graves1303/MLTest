const BASE = "http://localhost:3100";
function jar() {
  let cookie = "";
  return {
    async fetch(path, opts = {}) {
      const res = await fetch(BASE + path, {
        ...opts,
        headers: { "Content-Type": "application/json", ...(opts.headers || {}), ...(cookie ? { Cookie: cookie } : {}) },
        redirect: "manual",
      });
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";")[0];
      let body = null;
      try { body = await res.json(); } catch {}
      return { status: res.status, body };
    },
  };
}
let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? " — " + JSON.stringify(detail) : ""}`); }
}

const ratings = (v) => ({
  values: { Fun: v, Curiosity: v, "Problem-Solving": v, Collaboration: v, Ownership: v, Hustle: v, Inclusivity: v },
  competencies: { Drive: v, "Communication & Command": v, "Time Management & Prioritization": v, "Adaptability + Change Management": v, "Career Growth & Learning": v, "Producing Results": v },
});

async function main() {
  const hr = jar();
  await hr.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "admin@marinelayer.com", password: "ChangeMe123!" }) });

  const bigBoss = await hr.fetch("/api/users", { method: "POST", body: JSON.stringify({ email: "summarybigboss@test.com", name: "Summary Big Boss", temporaryPassword: "TempPass123" }) });
  const midMgr = await hr.fetch("/api/users", { method: "POST", body: JSON.stringify({ email: "summarymidmgr@test.com", name: "Summary Mid Manager", temporaryPassword: "TempPass123", managerId: bigBoss.body.id }) });
  const rep1 = await hr.fetch("/api/users", { method: "POST", body: JSON.stringify({ email: "summaryrep1@test.com", name: "Summary Rep 1", temporaryPassword: "TempPass123", managerId: midMgr.body.id }) });
  const rep2 = await hr.fetch("/api/users", { method: "POST", body: JSON.stringify({ email: "summaryrep2@test.com", name: "Summary Rep 2", temporaryPassword: "TempPass123", managerId: midMgr.body.id }) });
  const rep3 = await hr.fetch("/api/users", { method: "POST", body: JSON.stringify({ email: "summaryrep3@test.com", name: "Summary Rep 3", temporaryPassword: "TempPass123", managerId: midMgr.body.id }) });

  const bigBossSession = jar();
  await bigBossSession.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "summarybigboss@test.com", password: "TempPass123" }) });

  console.log("=== Before any submissions ===");
  let res = await bigBossSession.fetch(`/api/upward-summary/${midMgr.body.id}`);
  check("Big Boss (mid manager's manager) can see the summary shell", res.status === 200, res.body);
  check("Shows 0 of 3 reports, not revealed", res.body.submittedCount === 0 && res.body.totalReports === 3 && res.body.revealed === false, res.body);

  const midMgrSession = jar();
  await midMgrSession.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "summarymidmgr@test.com", password: "TempPass123" }) });
  res = await midMgrSession.fetch(`/api/upward-summary/${midMgr.body.id}`);
  check("Mid Manager themselves CANNOT see their own upward summary", res.status === 403, res.body);

  console.log("\n=== Two of three submit — still below threshold ===");
  async function submitUpward(email, val) {
    const s = jar();
    await s.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password: "TempPass123" }) });
    await s.fetch("/api/upward/draft", { method: "PUT", body: JSON.stringify({ ...ratings(val), valuesComments: "Leadership feedback.", competenciesComments: "Competency feedback." }) });
    return s.fetch("/api/upward/submit", { method: "POST", body: JSON.stringify({ reopen: false }) });
  }
  await submitUpward("summaryrep1@test.com", 2);
  await submitUpward("summaryrep2@test.com", 3);

  res = await bigBossSession.fetch(`/api/upward-summary/${midMgr.body.id}`);
  check("2 of 3 submitted, still not revealed", res.body.submittedCount === 2 && res.body.revealed === false, res.body);
  check("Entries empty pre-reveal", res.body.entries.length === 0, res.body.entries);

  console.log("\n=== Third submission hits the threshold ===");
  await submitUpward("summaryrep3@test.com", 4);
  res = await bigBossSession.fetch(`/api/upward-summary/${midMgr.body.id}`);
  check("3 of 3 submitted, now revealed", res.body.submittedCount === 3 && res.body.revealed === true, res.body);
  check("Aggregate score is average of 2,3,4 = 3.00", res.body.overallScore === 3, res.body.overallScore);
  check("Entries now populated with anonymized comments, no names", res.body.entries.length === 3, res.body.entries);
  const entriesText = JSON.stringify(res.body.entries);
  check("No reporter identity in the revealed entries", !entriesText.includes("summaryrep") && !entriesText.includes("Summary Rep"), entriesText);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
main().catch((err) => { console.error(err); process.exit(1); });
