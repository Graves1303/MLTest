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
  categoryData: {
    values: { ratings: { Fun: v, Curiosity: v, "Problem-Solving": v, Collaboration: v, Ownership: v, Hustle: v, Inclusivity: v }, comments: "Values comment." },
    competencies: { ratings: { Drive: v, "Communication & Command": v, "Time Management & Prioritization": v, "Adaptability + Change Management": v, "Career Growth & Learning": v, "Producing Results": v }, comments: "Competencies comment." },
  },
  summary: "Summary text.",
  goals: [],
});

async function main() {
  const hr = jar();
  await hr.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "admin@marinelayer.com", password: "ChangeMe123!" }) });

  console.log("=== Cycle close/reopen: self/manager reviews ===");
  const emp = await hr.fetch("/api/users", { method: "POST", body: JSON.stringify({ email: "lockemp@test.com", name: "Lock Employee", temporaryPassword: "TempPass123" }) });
  const empSession = jar();
  await empSession.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "lockemp@test.com", password: "TempPass123" }) });

  let res = await empSession.fetch(`/api/reviews/${emp.body.id}/self`, { method: "PUT", body: JSON.stringify({ ...ratings(3), submit: false }) });
  check("Can save a draft while cycle is open", res.status === 200, res.body);

  res = await hr.fetch("/api/admin/cycles/close", { method: "POST" });
  check("HR admin can close the cycle", res.status === 200 && res.body.cycle.status === "closed", res.body);

  res = await empSession.fetch(`/api/reviews/${emp.body.id}/self`, { method: "PUT", body: JSON.stringify({ ...ratings(3), submit: false }) });
  check("Draft save now BLOCKED while closed", res.status === 423, res.body);

  // Even HR admin can't write reviews directly while closed
  const hrId = (await hr.fetch("/api/users")).body.find((u) => u.email === "admin@marinelayer.com").id;
  await hr.fetch(`/api/users/${hrId}`, { method: "PATCH", body: JSON.stringify({ managerId: null }) });
  res = await hr.fetch(`/api/reviews/${emp.body.id}/manager`, { method: "PUT", body: JSON.stringify({ ...ratings(3), submit: false }) });
  check("Even HR admin's own writes are blocked while closed (no bypass)", res.status === 423, res.body);

  res = await hr.fetch("/api/admin/cycles/reopen", { method: "POST" });
  res = await empSession.fetch(`/api/reviews/${emp.body.id}/self`, { method: "PUT", body: JSON.stringify({ ...ratings(3), submit: false }) });
  check("Reopening restores normal editing", res.status === 200, res.body);

  console.log("\n=== Peer feedback: locks immediately on submission ===");
  const subject = await hr.fetch("/api/users", { method: "POST", body: JSON.stringify({ email: "locksubject@test.com", name: "Lock Subject", temporaryPassword: "TempPass123" }) });
  const peer = await hr.fetch("/api/users", { method: "POST", body: JSON.stringify({ email: "lockpeer@test.com", name: "Lock Peer", temporaryPassword: "TempPass123" }) });
  await hr.fetch(`/api/peer-assignments/${subject.body.id}`, { method: "PUT", body: JSON.stringify({ peerUserIds: [peer.body.id], minToReveal: 2 }) });

  const peerSession = jar();
  await peerSession.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "lockpeer@test.com", password: "TempPass123" }) });
  res = await peerSession.fetch(`/api/peer-feedback/${subject.body.id}/submit`, { method: "POST", body: JSON.stringify({ strengths: "Great.", growth: "Keep going." }) });
  check("First submission succeeds", res.status === 200, res.body);

  res = await peerSession.fetch(`/api/peer-feedback/${subject.body.id}/submit`, { method: "POST", body: JSON.stringify({ strengths: "Changed my mind.", growth: "Still good." }) });
  check("Resubmission BLOCKED immediately — no self-service update", res.status === 423, res.body);

  // Manager (HR, since canWriteReview allows HR) unlocks it
  res = await hr.fetch(`/api/peer-feedback/${subject.body.id}/unlock`, { method: "POST", body: JSON.stringify({ peerUserId: peer.body.id }) });
  check("Admin can unlock the specific peer's submission", res.status === 200, res.body);

  res = await peerSession.fetch(`/api/peer-feedback/${subject.body.id}/submit`, { method: "POST", body: JSON.stringify({ strengths: "Changed my mind.", growth: "Still good." }) });
  check("Resubmission now succeeds after unlock", res.status === 200, res.body);

  res = await peerSession.fetch(`/api/peer-feedback/${subject.body.id}/submit`, { method: "POST", body: JSON.stringify({ strengths: "Once more?", growth: "Nope." }) });
  check("Auto re-locked after that one resubmission", res.status === 423, res.body);

  console.log("\n=== Upward review: locks immediately on submission ===");
  const mgr = await hr.fetch("/api/users", { method: "POST", body: JSON.stringify({ email: "lockmgr@test.com", name: "Lock Manager", temporaryPassword: "TempPass123" }) });
  const report = await hr.fetch("/api/users", { method: "POST", body: JSON.stringify({ email: "lockreport@test.com", name: "Lock Report", temporaryPassword: "TempPass123", managerId: mgr.body.id }) });
  const reportSession = jar();
  await reportSession.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "lockreport@test.com", password: "TempPass123" }) });

  await reportSession.fetch("/api/upward/draft", { method: "PUT", body: JSON.stringify({ categoryData: ratings(3).categoryData }) });
  res = await reportSession.fetch("/api/upward/submit", { method: "POST", body: JSON.stringify({ reopen: false }) });
  check("Upward submission succeeds", res.status === 200, res.body);

  res = await reportSession.fetch("/api/upward/submit", { method: "POST", body: JSON.stringify({ reopen: true }) });
  check("Self-service reopen BLOCKED immediately", res.status === 423, res.body);

  res = await hr.fetch(`/api/users/${report.body.id}/unlock-upward`, { method: "POST" });
  check("Admin can unlock this person's upward review", res.status === 200, res.body);

  res = await reportSession.fetch("/api/upward/submit", { method: "POST", body: JSON.stringify({ reopen: true }) });
  check("Reopen now succeeds after unlock", res.status === 200, res.body);

  await reportSession.fetch("/api/upward/draft", { method: "PUT", body: JSON.stringify({ categoryData: ratings(4).categoryData }) });
  res = await reportSession.fetch("/api/upward/submit", { method: "POST", body: JSON.stringify({ reopen: false }) });
  check("Resubmission after reopen succeeds", res.status === 200, res.body);

  res = await reportSession.fetch("/api/upward/submit", { method: "POST", body: JSON.stringify({ reopen: true }) });
  check("Auto re-locked after that resubmission", res.status === 423, res.body);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
main().catch((err) => { console.error(err); process.exit(1); });
