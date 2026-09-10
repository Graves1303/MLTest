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

async function main() {
  console.log("== Setup: HR admin logs in and builds an org chart ==");
  const { j: hr, res: hrLogin } = await login("admin@marinelayer.com", "ChangeMe123!");
  check("HR admin logs in", hrLogin.status === 200, hrLogin.body);

  // HR admin must change password on first login per mustChangePassword — verify that's actually true,
  // but for test purposes we won't force the change flow through the API (not required to test permissions).
  const me = await hr.fetch("/api/auth/me");
  check("HR admin flagged as HR", me.body.isHrAdmin === true);

  // Create Manager A
  let res = await hr.fetch("/api/users", {
    method: "POST",
    body: JSON.stringify({
      email: "manager.a@marinelayer.com", name: "Manager A", title: "Sr. Manager",
      temporaryPassword: "TempPass123", isHrAdmin: false,
    }),
  });
  check("HR creates Manager A", res.status === 201, res.body);
  const managerAId = res.body.id;

  // Create Manager B (unrelated manager, to test cross-team isolation)
  res = await hr.fetch("/api/users", {
    method: "POST",
    body: JSON.stringify({
      email: "manager.b@marinelayer.com", name: "Manager B", title: "Sr. Manager",
      temporaryPassword: "TempPass123", isHrAdmin: false,
    }),
  });
  check("HR creates Manager B", res.status === 201, res.body);
  const managerBId = res.body.id;

  // Create Employee (reports to Manager A)
  res = await hr.fetch("/api/users", {
    method: "POST",
    body: JSON.stringify({
      email: "employee@marinelayer.com", name: "Employee One", title: "Associate",
      temporaryPassword: "TempPass123", managerId: managerAId,
    }),
  });
  check("HR creates Employee (reports to Manager A)", res.status === 201, res.body);
  const employeeId = res.body.id;

  console.log("\n== Employee logs in, writes and submits their self review ==");
  const { j: emp } = await login("employee@marinelayer.com", "TempPass123");

  const ratingBody = {
    values: { Fun: 3, Curiosity: 4, "Problem-Solving": 3, Collaboration: 4, Ownership: 3, Hustle: 3, Inclusivity: 4 },
    valuesComments: "Felt good about this half.",
    competencies: { "Drive": 3, "Communication & Command": 3, "Time Management & Prioritization": 3, "Adaptability + Change Management": 3, "Career Growth & Learning": 4, "Producing Results": 3 },
    competenciesComments: "",
    summary: "",
    goals: [{ id: "g1", text: "Ship the new onboarding flow", timeline: "Q4 2026" }],
    submit: false,
  };

  res = await emp.fetch(`/api/reviews/${employeeId}/self`, { method: "PUT", body: JSON.stringify(ratingBody) });
  check("Employee saves self-review draft", res.status === 200 && res.body.review.status === "draft", res.body);

  res = await emp.fetch(`/api/reviews/${employeeId}/self`, { method: "PUT", body: JSON.stringify({ ...ratingBody, submit: true }) });
  check("Employee submits self-review", res.status === 200 && res.body.review.status === "submitted", res.body);

  console.log("\n== Employee tries to write their OWN manager review (should be denied) ==");
  res = await emp.fetch(`/api/reviews/${employeeId}/manager`, { method: "PUT", body: JSON.stringify(ratingBody) });
  check("Employee CANNOT write their own manager review", res.status === 403, res.body);

  console.log("\n== Manager B (not the employee's manager) tries to read the employee's self review ==");
  const { j: mgrB } = await login("manager.b@marinelayer.com", "TempPass123");
  res = await mgrB.fetch(`/api/reviews/${employeeId}/self`);
  check("Manager B CANNOT read Employee's self review", res.status === 403, res.body);

  res = await mgrB.fetch(`/api/users/${employeeId}`);
  check("Manager B CANNOT view Employee's roster record", res.status === 403, res.body);

  res = await mgrB.fetch(`/api/summary/${employeeId}`);
  check("Manager B CANNOT view Employee's summary", res.status === 403, res.body);

  console.log("\n== Manager A (the real manager) reads the self review and writes a DRAFT manager review ==");
  const { j: mgrA } = await login("manager.a@marinelayer.com", "TempPass123");
  res = await mgrA.fetch(`/api/reviews/${employeeId}/self`);
  check("Manager A CAN read Employee's self review", res.status === 200 && !!res.body.review, res.body);

  const mgrRatingBody = {
    values: { Fun: 3, Curiosity: 3, "Problem-Solving": 3, Collaboration: 3, Ownership: 3, Hustle: 3, Inclusivity: 3 },
    valuesComments: "Draft — not ready for the employee to see yet.",
    competencies: { "Drive": 3, "Communication & Command": 3, "Time Management & Prioritization": 3, "Adaptability + Change Management": 3, "Career Growth & Learning": 3, "Producing Results": 3 },
    competenciesComments: "",
    summary: "",
    goals: [],
    submit: false,
  };
  res = await mgrA.fetch(`/api/reviews/${employeeId}/manager`, { method: "PUT", body: JSON.stringify(mgrRatingBody) });
  check("Manager A CAN write a draft manager review", res.status === 200 && res.body.review.status === "draft", res.body);

  console.log("\n== The critical check: Employee tries to read manager review WHILE STILL A DRAFT ==");
  res = await emp.fetch(`/api/reviews/${employeeId}/manager`);
  check("Employee CANNOT read manager review while it's still a draft", res.status === 403, res.body);

  res = await emp.fetch(`/api/summary/${employeeId}`);
  const summaryStillHidden = res.status === 200 && res.body.managerReview === null;
  check("Employee's summary view hides the still-draft manager review", summaryStillHidden, res.body);

  console.log("\n== Manager A submits the manager review ==");
  res = await mgrA.fetch(`/api/reviews/${employeeId}/manager`, { method: "PUT", body: JSON.stringify({ ...mgrRatingBody, submit: true }) });
  check("Manager A submits the manager review", res.status === 200 && res.body.review.status === "submitted", res.body);

  console.log("\n== Submitted alone isn't enough anymore — discussed-gating requires an explicit mark ==");
  res = await emp.fetch(`/api/reviews/${employeeId}/manager`);
  check("Employee still CANNOT read manager review — submitted but not yet discussed", res.status === 403, res.body);

  res = await mgrA.fetch(`/api/reviews/${employeeId}/discussed`, { method: "POST", body: JSON.stringify({ discussed: true }) });
  check("Manager A marks the review discussed", res.status === 200 && res.body.discussed === true, res.body);

  console.log("\n== Now that it's been marked discussed, Employee CAN read the manager review ==");
  res = await emp.fetch(`/api/reviews/${employeeId}/manager`);
  check("Employee CAN read manager review after it's marked discussed", res.status === 200 && !!res.body.review, res.body);

  res = await emp.fetch(`/api/summary/${employeeId}`);
  const summaryNowVisible = res.status === 200 && !!res.body.managerReview;
  check("Employee's summary now shows the discussed manager review", summaryNowVisible, res.body);

  console.log("\n== Employee tries to edit the now-submitted self review without reopening it (should be denied) ==");
  res = await emp.fetch(`/api/reviews/${employeeId}/self`, { method: "PUT", body: JSON.stringify(ratingBody) });
  check("Editing a submitted review without reopen is rejected", res.status === 409, res.body);

  console.log("\n== Dashboard visibility: Manager A sees only themself + their report; HR sees everyone ==");
  res = await mgrA.fetch("/api/dashboard");
  const mgrANames = res.body.map((r) => r.name).sort();
  check("Manager A's dashboard = [Employee One, Manager A]", JSON.stringify(mgrANames) === JSON.stringify(["Employee One", "Manager A"]), mgrANames);

  res = await hr.fetch("/api/dashboard");
  const hrNames = res.body.map((r) => r.name).sort();
  check("HR admin's dashboard includes everyone", hrNames.includes("Employee One") && hrNames.includes("Manager A") && hrNames.includes("Manager B") && hrNames.includes("HR Admin"), hrNames);

  console.log("\n== Non-admin cannot add users or edit the org chart ==");
  res = await mgrA.fetch("/api/users", { method: "POST", body: JSON.stringify({ email: "x@x.com", name: "X", temporaryPassword: "TempPass1234" }) });
  check("Manager A CANNOT create new roster entries (HR only)", res.status === 403, res.body);

  res = await mgrA.fetch(`/api/users/${employeeId}`, { method: "PATCH", body: JSON.stringify({ managerId: managerBId }) });
  check("Manager A CANNOT reassign Employee's manager (HR only)", res.status === 403, res.body);

  console.log("\n== Cycle report (new): HR-only, and reflects real submitted data ==");
  res = await mgrA.fetch("/api/admin/cycle-report");
  check("Manager A CANNOT view the HR cycle report", res.status === 403, res.body);

  res = await emp.fetch("/api/admin/cycle-report");
  check("Employee CANNOT view the HR cycle report", res.status === 403, res.body);

  res = await hr.fetch("/api/admin/cycle-report");
  const empRow = res.status === 200 ? res.body.find((r) => r.id === employeeId) : null;
  check(
    "HR admin CAN view the cycle report, with correct statuses for Employee One",
    res.status === 200 && empRow && empRow.self.status === "submitted" && empRow.manager.status === "submitted" && empRow.cycleStatus === "complete",
    empRow
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
