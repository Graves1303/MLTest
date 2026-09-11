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
  valuesComments: "Solid values.",
  competencies: { Drive: v, "Communication & Command": v, "Time Management & Prioritization": v, "Adaptability + Change Management": v, "Career Growth & Learning": v, "Producing Results": v },
  competenciesComments: "Solid competencies.",
  summary: "Solid overall.",
  goals: [],
});

async function main() {
  const hr = jar();
  await hr.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "admin@marinelayer.com", password: "ChangeMe123!" }) });

  console.log("=== Promotion eligibility confidentiality ===");
  const mgr = await hr.fetch("/api/users", { method: "POST", body: JSON.stringify({ email: "promomgr@test.com", name: "Promo Manager", temporaryPassword: "TempPass123" }) });
  const emp = await hr.fetch("/api/users", { method: "POST", body: JSON.stringify({ email: "promoemp@test.com", name: "Promo Employee", temporaryPassword: "TempPass123", managerId: mgr.body.id }) });

  const mgrSession = jar();
  await mgrSession.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "promomgr@test.com", password: "TempPass123" }) });
  let res = await mgrSession.fetch(`/api/reviews/${emp.body.id}/manager`, {
    method: "PUT",
    body: JSON.stringify({ ...ratings(3), promotionEligible: "yes", submit: true }),
  });
  check("Manager sets promotionEligible and submits", res.status === 200 && res.body.review.promotionEligible === "yes", res.body);

  await mgrSession.fetch(`/api/reviews/${emp.body.id}/discussed`, { method: "POST", body: JSON.stringify({ discussed: true }) });

  const empSession = jar();
  await empSession.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "promoemp@test.com", password: "TempPass123" }) });
  res = await empSession.fetch(`/api/reviews/${emp.body.id}/manager`);
  check("Employee CANNOT see promotionEligible even after discussed", res.status === 200 && !("promotionEligible" in res.body.review), res.body.review);

  res = await empSession.fetch(`/api/summary/${emp.body.id}`);
  check("Employee's summary view also excludes promotionEligible", !("promotionEligible" in (res.body.managerReview || {})), res.body.managerReview);

  res = await hr.fetch("/api/admin/cycle-report");
  const empRow = res.body.find((r) => r.id === emp.body.id);
  check("Admin's cycle report DOES include promotionEligible", empRow.manager.promotionEligible === "yes", empRow.manager);

  console.log("\n=== Admin reviewing their OWN record can't see their own promotion field (no loophole) ===");
  await hr.fetch(`/api/users/${(await hr.fetch("/api/users")).body.find(u=>u.email==="admin@marinelayer.com").id}`, {}); // noop just to be safe
  const hrId = (await hr.fetch("/api/users")).body.find((u) => u.email === "admin@marinelayer.com").id;
  // Make admin manage themselves-adjacent: create a manager review ABOUT the admin from someone else
  const someMgr = await hr.fetch("/api/users", { method: "POST", body: JSON.stringify({ email: "someoneelse@test.com", name: "Someone Else", temporaryPassword: "TempPass123" }) });
  await hr.fetch(`/api/users/${hrId}`, { method: "PATCH", body: JSON.stringify({ managerId: someMgr.body.id }) });
  const someMgrSession = jar();
  await someMgrSession.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "someoneelse@test.com", password: "TempPass123" }) });
  await someMgrSession.fetch(`/api/reviews/${hrId}/manager`, { method: "PUT", body: JSON.stringify({ ...ratings(3), promotionEligible: "no", submit: true }) });
  res = await hr.fetch(`/api/reviews/${hrId}/manager`); // hr viewing their OWN manager review, as themselves
  check("HR admin viewing THEIR OWN review can't see their own promotionEligible", res.status === 200 && res.body.review && !("promotionEligible" in res.body.review), res.body.review);

  console.log("\n=== Roster deletion safety ===");
  const del1 = await hr.fetch("/api/users", { method: "POST", body: JSON.stringify({ email: "delmgr@test.com", name: "Del Manager", temporaryPassword: "TempPass123" }) });
  const del2 = await hr.fetch("/api/users", { method: "POST", body: JSON.stringify({ email: "delreport@test.com", name: "Del Report", temporaryPassword: "TempPass123", managerId: del1.body.id }) });

  res = await mgrSession.fetch(`/api/users/${del1.body.id}`, { method: "DELETE" });
  check("Non-admin CANNOT delete anyone", res.status === 403, res.body);

  res = await hr.fetch(`/api/users/${hrId}`, { method: "DELETE" });
  check("HR admin CANNOT delete themselves", res.status === 400, res.body);

  res = await hr.fetch("/api/users", { method: "POST", body: JSON.stringify({ email: "onlyadmin-test@test.com", name: "Solo Admin", temporaryPassword: "TempPass123", isHrAdmin: true }) });
  const soloAdmin = res.body.id;
  const soloSession = jar();
  await soloSession.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "onlyadmin-test@test.com", password: "TempPass123" }) });
  // there are multiple admins right now (hr + solo), so deleting one of the OTHERS should be fine, but let's specifically test "can't delete the LAST one" by removing all admins except one
  await hr.fetch(`/api/users/${soloAdmin}`, { method: "PATCH", body: JSON.stringify({ isHrAdmin: false }) }); // demote solo, leaving hr as sole admin

  res = await hr.fetch(`/api/users/${del1.body.id}`, { method: "DELETE" });
  check("Admin CAN delete a regular person", res.status === 200, res.body);

  res = await hr.fetch("/api/users");
  const delReportAfter = res.body.find((u) => u.id === del2.body.id);
  check("Del Report's managerId is now null (not dangling)", delReportAfter.managerId === null, delReportAfter);
  check("Del Manager is actually gone from the roster", !res.body.some((u) => u.id === del1.body.id), res.body.map((u) => u.email));

  console.log("\n=== Level context surfaces in upward review ===");
  await hr.fetch(`/api/users/${mgr.body.id}`, { method: "PATCH", body: JSON.stringify({ level: "Director" }) });
  const empSession2 = jar();
  await empSession2.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "promoemp@test.com", password: "TempPass123" }) });
  res = await empSession2.fetch("/api/upward/draft");
  check("Upward draft response includes managerLevel", res.body.managerLevel === "Director", res.body);
  check("Upward draft response includes managerLevelContext", res.body.managerLevelContext && res.body.managerLevelContext.length > 10, res.body.managerLevelContext);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
main().catch((err) => { console.error(err); process.exit(1); });
