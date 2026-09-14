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

async function login(email, password) {
  const j = jar();
  const res = await j.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  return { j, res };
}

const NEW_COMPETENCIES = ["Drive", "Communication & Command", "Time Management & Prioritization", "Adaptability + Change Management", "Career Growth & Learning", "Producing Results"];

function ratingsAt(val) {
  return {
    values: { Fun: val, Curiosity: val, "Problem-Solving": val, Collaboration: val, Ownership: val, Hustle: val, Inclusivity: val },
    valuesComments: "",
    competencies: Object.fromEntries(NEW_COMPETENCIES.map((c) => [c, val])),
    competenciesComments: "",
    summary: "Overall summary text for this review.",
    goals: [],
  };
}

async function main() {
  const { j: hr, res: hrLogin } = await login("admin@marinelayer.com", "ChangeMe123!");
  check("HR admin logs in", hrLogin.status === 200, hrLogin.body);

  async function createUser(email, name, managerId) {
    const res = await hr.fetch("/api/users", {
      method: "POST",
      body: JSON.stringify({ email, name, temporaryPassword: "TempPass123", managerId: managerId || null }),
    });
    return res.body.id;
  }

  const managerId = await createUser("manager.template@marinelayer.com", "Template Manager");
  const empId = await createUser("emp.template@marinelayer.com", "Template Employee", managerId);
  const { j: mgr } = await login("manager.template@marinelayer.com", "TempPass123");
  const { j: emp } = await login("emp.template@marinelayer.com", "TempPass123");

  console.log("\n=== Half-point rating rejection/acceptance ===");
  let res = await emp.fetch(`/api/reviews/${empId}/self`, { method: "PUT", body: JSON.stringify({ ...ratingsAt(2.5), submit: false }) });
  check("2.5 rating is accepted", res.status === 200, res.body);

  res = await emp.fetch(`/api/reviews/${empId}/self`, { method: "PUT", body: JSON.stringify({ ...ratingsAt(3.2), submit: false }) });
  check("3.2 (invalid half-point) is REJECTED", res.status === 400, res.body);

  console.log("\n=== Grade band boundaries ===");
  res = await emp.fetch(`/api/reviews/${empId}/self`, { method: "PUT", body: JSON.stringify({ ...ratingsAt(2), submit: true }) });
  check("Score of 2.0 submitted successfully", res.status === 200, res.body);
  res = await hr.fetch(`/api/admin/cycle-report`);
  let row = res.body.find((r) => r.id === empId);
  check("2.0 maps to 'Needs Improvement' (2-2.4 band)", row.self.overallGrade === "Needs Improvement", row.self);

  res = await emp.fetch(`/api/reviews/${empId}/self`, { method: "PUT", body: JSON.stringify({ ...ratingsAt(2), submit: true, reopen: true }) });
  res = await emp.fetch(`/api/reviews/${empId}/self`, { method: "PUT", body: JSON.stringify({ ...ratingsAt(2.5), submit: true }) });
  res = await hr.fetch(`/api/admin/cycle-report`);
  row = res.body.find((r) => r.id === empId);
  check("2.5 maps to 'Meets Expectations' (2.5-3.4 band)", row.self.overallGrade === "Meets Expectations", row.self);

  console.log("\n=== Output category structurally absent ===");
  res = await emp.fetch(`/api/reviews/${empId}/self`);
  const reviewKeys = Object.keys(res.body.review);
  check("Review record has no 'output' or 'outputComments' key", !reviewKeys.includes("output") && !reviewKeys.includes("outputComments"), reviewKeys);
  check("Review record HAS a 'summary' key", reviewKeys.includes("summary"), reviewKeys);
  check("Summary text saved correctly", res.body.review.summary === "Overall summary text for this review.", res.body.review.summary);

  console.log("\n=== New competency names present ===");
  const compKeys = Object.keys(res.body.review.competencies);
  check("Competencies match the new list exactly", JSON.stringify(compKeys.sort()) === JSON.stringify([...NEW_COMPETENCIES].sort()), compKeys);

  console.log("\n=== Discussed-gating still works with new schema ===");
  res = await mgr.fetch(`/api/reviews/${empId}/manager`, { method: "PUT", body: JSON.stringify({ ...ratingsAt(3.5), submit: true }) });
  check("Manager submits manager review", res.status === 200, res.body);
  res = await emp.fetch(`/api/reviews/${empId}/manager`);
  check("Employee CANNOT read manager review before discussed", res.status === 403, res.body);
  res = await mgr.fetch(`/api/reviews/${empId}/discussed`, { method: "POST", body: JSON.stringify({ discussed: true }) });
  check("Manager marks discussed", res.status === 200, res.body);
  res = await emp.fetch(`/api/reviews/${empId}/manager`);
  check("Employee CAN read manager review after discussed", res.status === 200 && !!res.body.review, res.body);

  console.log("\n=== Peer feedback still works with new schema ===");
  const peer1Id = await createUser("peer1.template@marinelayer.com", "Peer One Template", managerId);
  const peer2Id = await createUser("peer2.template@marinelayer.com", "Peer Two Template", managerId);
  const { j: peer1 } = await login("peer1.template@marinelayer.com", "TempPass123");
  const { j: peer2 } = await login("peer2.template@marinelayer.com", "TempPass123");
  res = await mgr.fetch(`/api/peer-assignments/${empId}`, { method: "PUT", body: JSON.stringify({ peerUserIds: [peer1Id, peer2Id], minToReveal: 2 }) });
  check("Manager assigns 2 peers", res.status === 200, res.body);
  res = await peer1.fetch(`/api/peer-feedback/${empId}/submit`, { method: "POST", body: JSON.stringify({ strengths: "Great work.", growth: "Keep going." }) });
  check("Peer 1 submits", res.status === 200, res.body);
  res = await peer2.fetch(`/api/peer-feedback/${empId}/submit`, { method: "POST", body: JSON.stringify({ strengths: "Reliable teammate.", growth: "None." }) });
  check("Peer 2 submits, hits threshold", res.status === 200, res.body);
  res = await mgr.fetch(`/api/peer-feedback/${empId}`);
  check("Peer feedback revealed with 2 entries", res.body.revealed === true && res.body.entries.length === 2, res.body);

  console.log("\n=== Upward reviews still work with new schema (half-points + new competencies) ===");
  res = await emp.fetch("/api/upward/draft", { method: "PUT", body: JSON.stringify({ values: ratingsAt(1.5).values, valuesComments: "", competencies: ratingsAt(1.5).competencies, competenciesComments: "" }) });
  check("Upward draft with half-point ratings saved", res.status === 200, res.body);
  res = await emp.fetch("/api/upward/submit", { method: "POST", body: JSON.stringify({ reopen: false }) });
  check("Upward review submitted", res.status === 200, res.body);

  const { j: peer1b } = await login("peer1.template@marinelayer.com", "TempPass123");
  const { j: peer2b } = await login("peer2.template@marinelayer.com", "TempPass123");
  for (const [session, val] of [[peer1b, 2], [peer2b, 3]]) {
    await session.fetch("/api/users", {}).catch(() => {}); // noop to ensure session alive
  }
  // Peer1/Peer2 also report to managerId, so they can submit upward reviews about Template Manager too
  async function submitUpward(session, val) {
    await session.fetch("/api/upward/draft", { method: "PUT", body: JSON.stringify({ values: ratingsAt(val).values, valuesComments: "", competencies: ratingsAt(val).competencies, competenciesComments: "" }) });
    return session.fetch("/api/upward/submit", { method: "POST", body: JSON.stringify({ reopen: false }) });
  }
  res = await submitUpward(peer1b, 2);
  check("Peer 1 submits upward review of Template Manager", res.status === 200, res.body);
  res = await submitUpward(peer2b, 3);
  check("Peer 2 submits upward review, hitting threshold of 3", res.status === 200, res.body);

  res = await hr.fetch("/api/admin/cycle-report");
  const mgrRow = res.body.find((r) => r.id === managerId);
  check("Admin sees revealed upward aggregate (3 of 3: employee, peer1, peer2)", mgrRow.upwardAgg.revealed === true && mgrRow.upwardAgg.count === 3, mgrRow.upwardAgg);
  check("Upward aggregate has no outputOverall field", !("outputOverall" in mgrRow.upwardAgg), mgrRow.upwardAgg);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
