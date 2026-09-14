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

async function main() {
  const hr = jar();
  await hr.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "admin@marinelayer.com", password: "ChangeMe123!" }) });

  const bigBoss = await hr.fetch("/api/users", { method: "POST", body: JSON.stringify({ email: "bigboss@test.com", name: "Big Boss", temporaryPassword: "TempPass123" }) });
  const middleMgr = await hr.fetch("/api/users", { method: "POST", body: JSON.stringify({ email: "middlemgr@test.com", name: "Middle Manager", temporaryPassword: "TempPass123", managerId: bigBoss.body.id }) });
  const junior = await hr.fetch("/api/users", { method: "POST", body: JSON.stringify({ email: "junior@test.com", name: "Junior Person", temporaryPassword: "TempPass123", managerId: middleMgr.body.id }) });
  const colleague = await hr.fetch("/api/users", { method: "POST", body: JSON.stringify({ email: "colleague@test.com", name: "Colleague", temporaryPassword: "TempPass123" }) });

  await hr.fetch(`/api/peer-assignments/${colleague.body.id}`, { method: "PUT", body: JSON.stringify({ peerUserIds: [middleMgr.body.id], minToReveal: 2 }) });

  const middleSession = jar();
  await middleSession.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "middlemgr@test.com", password: "TempPass123" }) });

  console.log("=== Middle Manager's dashboard should show all four assignment types ===");
  let res = await middleSession.fetch("/api/dashboard");
  check("Dashboard includes Middle Manager's own row (self review)", res.body.some((r) => r.id === middleMgr.body.id), res.body.map((r) => r.name));
  check("Dashboard includes Junior Person (direct report / manager review)", res.body.some((r) => r.id === junior.body.id && r.managerId === middleMgr.body.id), res.body);

  res = await middleSession.fetch("/api/upward/draft");
  check("Upward review target is correctly Big Boss", res.body.managerName === "Big Boss", res.body);

  res = await middleSession.fetch("/api/peer-assignments/mine");
  check("Peer assignment for Colleague shows up", res.body.some((p) => p.employeeId === colleague.body.id && p.employeeName === "Colleague" && p.submitted === false), res.body);

  console.log("\n=== Submit the peer feedback, confirm it flips to submitted ===");
  await middleSession.fetch(`/api/peer-feedback/${colleague.body.id}/submit`, { method: "POST", body: JSON.stringify({ strengths: "Great work.", growth: "Keep it up." }) });
  res = await middleSession.fetch("/api/peer-assignments/mine");
  check("Peer assignment now shows submitted: true", res.body.find((p) => p.employeeId === colleague.body.id)?.submitted === true, res.body);

  console.log("\n=== Someone with NO manager and NO peer assignments sees an empty, honest list ===");
  const bossSession = jar();
  await bossSession.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "bigboss@test.com", password: "TempPass123" }) });
  res = await bossSession.fetch("/api/upward/draft");
  check("Big Boss has no manager, so no upward review target", res.body.managerName === null, res.body);
  res = await bossSession.fetch("/api/peer-assignments/mine");
  check("Big Boss has no peer assignments", Array.isArray(res.body) && res.body.length === 0, res.body);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
main().catch((err) => { console.error(err); process.exit(1); });
