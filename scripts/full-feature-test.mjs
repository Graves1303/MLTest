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

const emptyRatings = {
  values: { Fun: 3, Curiosity: 3, "Problem-Solving": 3, Collaboration: 3, Ownership: 3, Hustle: 3, Inclusivity: 3 },
  valuesComments: "Solid on values.",
  competencies: { "Drive": 3, "Communication & Command": 3, "Time Management & Prioritization": 3, "Adaptability + Change Management": 3, "Career Growth & Learning": 3, "Producing Results": 3 },
  competenciesComments: "Solid on competencies.",
  summary: "Overall solid.",
  goals: [],
};

async function main() {
  console.log("=== Setup: HR admin creates a manager and three reports ===");
  const { j: hr, res: hrLogin } = await login("admin@marinelayer.com", "ChangeMe123!");
  check("HR admin logs in", hrLogin.status === 200, hrLogin.body);

  async function createUser(email, name, managerId) {
    const res = await hr.fetch("/api/users", {
      method: "POST",
      body: JSON.stringify({ email, name, temporaryPassword: "TempPass123", managerId: managerId || null }),
    });
    return res.body.id;
  }

  const managerId = await createUser("manager.mo@marinelayer.com", "Manager Mo");
  const reportAId = await createUser("report.a@marinelayer.com", "Report A", managerId);
  const reportBId = await createUser("report.b@marinelayer.com", "Report B", managerId);
  const reportCId = await createUser("report.c@marinelayer.com", "Report C", managerId);
  console.log("Created manager + 3 reports, all reporting to Manager Mo.");

  const { j: mgr } = await login("manager.mo@marinelayer.com", "TempPass123");
  const { j: repA } = await login("report.a@marinelayer.com", "TempPass123");
  const { j: repB } = await login("report.b@marinelayer.com", "TempPass123");
  const { j: repC } = await login("report.c@marinelayer.com", "TempPass123");

  console.log("\n=== DISCUSSED GATING ===");
  let res = await mgr.fetch(`/api/reviews/${reportAId}/manager`, { method: "PUT", body: JSON.stringify({ ...emptyRatings, submit: true }) });
  check("Manager submits Report A's manager review", res.status === 200 && res.body.review.status === "submitted", res.body);

  res = await repA.fetch(`/api/reviews/${reportAId}/manager`);
  check("Report A CANNOT read manager review before it's discussed", res.status === 403, res.body);

  res = await mgr.fetch(`/api/reviews/${reportAId}/discussed`, { method: "POST", body: JSON.stringify({ discussed: true }) });
  check("Manager marks it discussed", res.status === 200 && res.body.discussed === true, res.body);

  res = await repA.fetch(`/api/reviews/${reportAId}/manager`);
  check("Report A CAN read it after being marked discussed", res.status === 200 && !!res.body.review, res.body);

  res = await repB.fetch(`/api/reviews/${reportAId}/manager`);
  check("Report B (unrelated) still CANNOT read Report A's manager review", res.status === 403, res.body);

  console.log("\n=== PEER FEEDBACK ANONYMITY (real accounts, threshold=2 for this test) ===");
  res = await mgr.fetch(`/api/peer-assignments/${reportAId}`, {
    method: "PUT",
    body: JSON.stringify({ peerUserIds: [reportBId, reportCId], minToReveal: 2 }),
  });
  check("Manager assigns Report B and C as peers for Report A", res.status === 200, res.body);

  res = await hr.fetch(`/api/peer-feedback/${reportAId}/submit`, { method: "POST", body: JSON.stringify({ strengths: "trying to sneak in" }) });
  check("HR admin (not an assigned peer) CANNOT submit peer feedback", res.status === 403, res.body);

  res = await repB.fetch(`/api/peer-feedback/${reportAId}/submit`, { method: "POST", body: JSON.stringify({ strengths: "Great collaborator on the launch project.", growth: "Could speak up more in planning." }) });
  check("Report B (assigned peer) submits feedback", res.status === 200, res.body);

  res = await mgr.fetch(`/api/peer-feedback/${reportAId}`);
  check("Manager sees 1 of 2 responded, NOT revealed yet", res.status === 200 && res.body.count === 1 && res.body.revealed === false, res.body);
  check("Checklist shows names but entries list is empty pre-reveal", res.body.checklist.some((c) => c.name === "Report B" && c.submitted) && res.body.entries.length === 0, res.body);

  res = await repC.fetch(`/api/peer-feedback/${reportAId}/submit`, { method: "POST", body: JSON.stringify({ strengths: "Consistently delivers on time.", growth: "Nothing major." }) });
  check("Report C (assigned peer) submits feedback, hitting threshold of 2", res.status === 200, res.body);

  res = await mgr.fetch(`/api/peer-feedback/${reportAId}`);
  const revealedText = JSON.stringify(res.body.entries);
  check("Manager now sees revealed entries (2 of 2)", res.body.revealed === true && res.body.entries.length === 2, res.body);
  check("Revealed entries contain NO reporter names", !revealedText.includes("Report B") && !revealedText.includes("Report C"), revealedText);

  res = await repB.fetch(`/api/peer-feedback/${reportAId}/submit`, { method: "POST", body: JSON.stringify({ strengths: "Updated: even better than I said." }) });
  check("Report B can resubmit/update (not blocked as a new duplicate error)", res.status === 200 && res.body.updated === true, res.body);
  res = await mgr.fetch(`/api/peer-feedback/${reportAId}`);
  check("Resubmission updates in place — still exactly 2 entries, not 3", res.body.entries.length === 2, res.body.entries.length);

  console.log("\n=== UPWARD REVIEW ANONYMITY (real accounts, three reports about one manager) ===");
  async function submitUpward(session, name, ratingVal) {
    const ratings = JSON.parse(JSON.stringify(emptyRatings));
    for (const k of Object.keys(ratings.values)) ratings.values[k] = ratingVal;
    for (const k of Object.keys(ratings.competencies)) ratings.competencies[k] = ratingVal;
    ratings.valuesComments = `${name} says: leadership feedback here.`;
    ratings.competenciesComments = `${name} says: competency feedback here.`;
    await session.fetch("/api/upward/draft", { method: "PUT", body: JSON.stringify(ratings) });
    return session.fetch("/api/upward/submit", { method: "POST", body: JSON.stringify({ reopen: false }) });
  }

  res = await submitUpward(repA, "Report A", 2);
  check("Report A submits upward review of Manager Mo", res.status === 200, res.body);
  res = await submitUpward(repB, "Report B", 3);
  check("Report B submits upward review of Manager Mo", res.status === 200, res.body);

  res = await hr.fetch("/api/admin/cycle-report");
  let mgrRow = res.body.find((r) => r.id === managerId);
  check("Admin sees 2 of 3 responses, NOT revealed yet", mgrRow.upwardAgg.count === 2 && mgrRow.upwardAgg.revealed === false, mgrRow.upwardAgg);

  res = await submitUpward(repC, "Report C", 4);
  check("Report C submits, hitting threshold of 3", res.status === 200, res.body);

  res = await hr.fetch("/api/admin/cycle-report");
  mgrRow = res.body.find((r) => r.id === managerId);
  check("Admin now sees revealed aggregate (3 of 3)", mgrRow.upwardAgg.revealed === true && mgrRow.upwardAgg.count === 3, mgrRow.upwardAgg);
  const upwardText = JSON.stringify(mgrRow.upwardEntries);
  check("Revealed upward entries contain NO reporter names", !upwardText.includes("Report A") && !upwardText.includes("Report B") && !upwardText.includes("Report C"), upwardText);
  check("Aggregate score is the average of 2,3,4 = 3.00", mgrRow.upwardAgg.overallScore === 3, mgrRow.upwardAgg.overallScore);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
