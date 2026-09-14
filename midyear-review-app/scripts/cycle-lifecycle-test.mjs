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
      const rawText = await res.text();
      let body = null;
      try { body = JSON.parse(rawText); } catch { body = { __rawText: rawText }; }
      return { status: res.status, body };
    },
  };
}
let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? " — " + JSON.stringify(detail) : ""}`); }
}

function catData(categories, val, comment) {
  const out = {};
  for (const cat of categories) {
    out[cat.key] = { ratings: Object.fromEntries(cat.items.map((i) => [i, val])), comments: `${comment} ${cat.label}` };
  }
  return out;
}

async function main() {
  const hr = jar();
  await hr.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "admin@marinelayer.com", password: "ChangeMe123!" }) });

  const emp = await hr.fetch("/api/users", { method: "POST", body: JSON.stringify({ email: "cycleemp@test.com", name: "Cycle Employee", temporaryPassword: "TempPass123" }) });
  const empSession = jar();
  await empSession.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "cycleemp@test.com", password: "TempPass123" }) });

  console.log("=== No cycle exists yet: writes are blocked ===");
  let res = await empSession.fetch(`/api/reviews/${emp.body.id}/self`);
  check("GET review fails with 'no cycle started' before any cycle exists", res.status === 404, res.body);

  console.log("\n=== Starting the first cycle ===");
  res = await hr.fetch("/api/admin/cycles", { method: "POST", body: JSON.stringify({ name: "H1 2026", startDate: "2026-01-01", endDate: "2026-06-30" }) });
  check("HR can start the first cycle", res.status === 201 && res.body.cycle.status === "open", res.body);
  const cycle1Id = res.body.cycle.id;

  res = await empSession.fetch(`/api/reviews/${emp.body.id}/self`);
  check("Review GET now works with a cycle open", res.status === 200, res.body);
  const cycle1Categories = res.body.template.categories;

  console.log("\n=== Submitting a review with a goal, in cycle 1 ===");
  res = await empSession.fetch(`/api/reviews/${emp.body.id}/self`, {
    method: "PUT",
    body: JSON.stringify({
      categoryData: catData(cycle1Categories, 3, "Cycle 1"),
      summary: "Cycle 1 summary.",
      goals: [{ id: "g1", text: "Ship the Q1 project", timeline: "Q1 2026" }],
      submit: true,
    }),
  });
  check("Cycle 1 self review submits successfully", res.status === 200 && res.body.review.status === "submitted", res.body);

  console.log("\n=== Trying to start a new cycle while cycle 1 is still OPEN ===");
  res = await hr.fetch("/api/admin/cycles", { method: "POST", body: JSON.stringify({ name: "H2 2026", startDate: "2026-07-01", endDate: "2026-12-31" }) });
  check("Starting a new cycle is BLOCKED while the current one is open", res.status === 400, res.body);

  console.log("\n=== Closing cycle 1 ===");
  res = await hr.fetch("/api/admin/cycles/close", { method: "POST" });
  check("HR can close the current cycle", res.status === 200 && res.body.cycle.status === "closed", res.body);

  res = await empSession.fetch(`/api/reviews/${emp.body.id}/self`, { method: "PUT", body: JSON.stringify({ categoryData: catData(cycle1Categories, 4, "x"), summary: "x", goals: [], reopen: true }) });
  check("Writes are blocked while the cycle is closed", res.status === 423, res.body);

  console.log("\n=== Starting cycle 2 (now that cycle 1 is closed) ===");
  res = await hr.fetch("/api/admin/cycles", { method: "POST", body: JSON.stringify({ name: "H2 2026", startDate: "2026-07-01", endDate: "2026-12-31" }) });
  check("Starting a new cycle now succeeds", res.status === 201 && res.body.cycle.status === "open", res.body);
  const cycle2Id = res.body.cycle.id;
  check("Cycle 2 has a different ID than cycle 1", cycle2Id !== cycle1Id, { cycle1Id, cycle2Id });

  console.log("\n=== Employee's review in cycle 2 starts BLANK, with cycle 1's goals shown as reference ===");
  res = await empSession.fetch(`/api/reviews/${emp.body.id}/self`);
  check("Cycle 2's review is blank (no review row yet)", res.body.review === null, res.body.review);
  check("Prior goals from cycle 1 are shown for reference", res.body.priorGoals.length === 1 && res.body.priorGoals[0].text === "Ship the Q1 project", res.body.priorGoals);

  console.log("\n=== Submitting a DIFFERENT review in cycle 2 ===");
  res = await empSession.fetch(`/api/reviews/${emp.body.id}/self`, {
    method: "PUT",
    body: JSON.stringify({
      categoryData: catData(cycle1Categories, 2, "Cycle 2"),
      summary: "Cycle 2 summary — totally different from cycle 1.",
      goals: [{ id: "g2", text: "A brand new cycle 2 goal", timeline: "Q3 2026" }],
      submit: true,
    }),
  });
  check("Cycle 2 self review submits successfully", res.status === 200, { status: res.status, body: res.body });

  console.log("\n=== Cycle 1's data is UNTOUCHED and still viewable historically ===");
  res = await hr.fetch(`/api/admin/cycles/${cycle1Id}/report`);
  const cycle1Row = res.body.rows.find((r) => r.id === emp.body.id);
  check("Cycle 1's historical report still shows cycle 1's exact score (3.00)", cycle1Row.self.overallScore === 3, cycle1Row.self);

  res = await hr.fetch(`/api/admin/cycles/${cycle2Id}/report`);
  const cycle2Row = res.body.rows.find((r) => r.id === emp.body.id);
  check("Cycle 2's report shows cycle 2's DIFFERENT score (2.00)", cycle2Row.self.overallScore === 2, cycle2Row.self);

  console.log("\n=== Reopening the current cycle works ===");
  await hr.fetch("/api/admin/cycles/close", { method: "POST" });
  res = await hr.fetch("/api/admin/cycles/reopen", { method: "POST" });
  check("HR can reopen the current (cycle 2) after closing it", res.status === 200 && res.body.cycle.status === "open", res.body);

  console.log("\n=== Listing all cycles shows both, most recent first ===");
  res = await hr.fetch("/api/admin/cycles");
  check("Both cycles are listed", res.body.cycles.length === 2, res.body.cycles.map((c) => c.name));
  check("Current cycle ID matches cycle 2", res.body.currentCycleId === cycle2Id, res.body.currentCycleId);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
main().catch((err) => { console.error(err); process.exit(1); });
