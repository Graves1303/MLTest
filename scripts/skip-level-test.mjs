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
      const raw = await res.text();
      let body = null;
      try { body = JSON.parse(raw); } catch { body = { __raw: raw }; }
      return { status: res.status, body };
    },
  };
}
let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? " — " + JSON.stringify(detail) : ""}`); }
}

const catData = (c) => ({
  values: { ratings: { Fun: 3, Curiosity: 3, "Problem-Solving": 3, Collaboration: 3, Ownership: 3, Hustle: 3, Inclusivity: 3 }, comments: `${c} values` },
  competencies: { ratings: { Drive: 3, "Communication & Command": 3, "Time Management & Prioritization": 3, "Adaptability + Change Management": 3, "Career Growth & Learning": 3, "Producing Results": 3 }, comments: `${c} competencies` },
});
const body = (c, extra = {}) => JSON.stringify({ categoryData: catData(c), summary: `${c} summary`, goals: [], ...extra });

async function main() {
  const hr = jar();
  await hr.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "admin@marinelayer.com", password: "ChangeMe123!" }) });
  await hr.fetch("/api/admin/cycles", { method: "POST", body: JSON.stringify({ name: "Skip Test", startDate: "2026-01-01", endDate: "2026-06-30" }) });

  const mk = async (name, managerId = null) =>
    (await hr.fetch("/api/users", { method: "POST", body: JSON.stringify({ email: `${name.toLowerCase()}@skip.com`, name, temporaryPassword: "TempPass123", managerId }) })).body.id;
  const login = async (name) => {
    const j = jar();
    await j.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: `${name.toLowerCase()}@skip.com`, password: "TempPass123" }) });
    return j;
  };

  // Adam -> Jillian -> Audrey -> Dana, plus an unrelated Pat -> Sam
  const adamId = await mk("Adam");
  const jillianId = await mk("Jillian", adamId);
  const audreyId = await mk("Audrey", jillianId);
  const danaId = await mk("Dana", audreyId);
  const patId = await mk("Pat");
  const samId = await mk("Sam", patId);
  const [adam, jillian, audrey, dana, pat] = await Promise.all(["Adam", "Jillian", "Audrey", "Dana", "Pat"].map(login));

  // Audrey submits her self review; Jillian submits a manager review of Audrey with a promotion recommendation
  await audrey.fetch(`/api/reviews/${audreyId}/self`, { method: "PUT", body: body("Audrey self", { submit: true }) });
  await jillian.fetch(`/api/reviews/${audreyId}/manager`, { method: "PUT", body: body("Jillian on Audrey", { submit: true, promotionEligible: "yes" }) });

  console.log("=== Adam (Jillian's manager) can see Audrey's submitted reviews ===");
  let res = await adam.fetch(`/api/reviews/${audreyId}/self`);
  check("Adam can read Audrey's self review", res.status === 200 && res.body.review?.status === "submitted", res);
  res = await adam.fetch(`/api/reviews/${audreyId}/manager`);
  check("Adam can read Audrey's manager review (even before it's been discussed)", res.status === 200 && res.body.review?.status === "submitted", res);
  check("...but the promotion recommendation is NOT included for Adam", res.body.review && !("promotionEligible" in res.body.review), res.body.review);
  check("Server tells the page Adam is read-only", res.body.access.canWrite === false && res.body.access.canSeePromotion === false, res.body.access);

  console.log("\n=== The promotion field stays with the people who should have it ===");
  res = await jillian.fetch(`/api/reviews/${audreyId}/manager`);
  check("Jillian (Audrey's direct manager) still sees it", res.body.review?.promotionEligible === "yes", res.body.review?.promotionEligible);
  check("Jillian can write", res.body.access.canWrite === true && res.body.access.canSeePromotion === true, res.body.access);
  res = await hr.fetch(`/api/reviews/${audreyId}/manager`);
  check("HR admin still sees it", res.body.review?.promotionEligible === "yes");

  console.log("\n=== Adam's view is strictly read-only ===");
  res = await adam.fetch(`/api/reviews/${audreyId}/self`, { method: "PUT", body: body("tampered") });
  check("Adam cannot edit Audrey's self review", res.status === 403, res);
  res = await adam.fetch(`/api/reviews/${audreyId}/manager`, { method: "PUT", body: body("tampered") });
  check("Adam cannot edit Audrey's manager review", res.status === 403, res);
  res = await adam.fetch(`/api/reviews/${audreyId}/discussed`, { method: "POST", body: JSON.stringify({ discussed: true }) });
  check("Adam cannot mark it discussed (release it to Audrey)", res.status === 403, res);
  res = await adam.fetch(`/api/reviews/${audreyId}/manager/unlock`, { method: "POST" });
  check("Adam cannot unlock it", res.status === 403, res);

  console.log("\n=== Adam sees the summary, still without the promotion field ===");
  res = await adam.fetch(`/api/summary/${audreyId}`);
  check("Summary loads for Adam with both reviews", res.status === 200 && res.body.selfReview && res.body.managerReview, res.status);
  check("Summary does not leak the promotion field", res.body.managerReview && !("promotionEligible" in res.body.managerReview), res.body.managerReview);
  res = await adam.fetch(`/api/users/${audreyId}`);
  check("Adam can open Audrey's roster record", res.status === 200 && res.body.name === "Audrey", res.status);

  console.log("\n=== Peer and upward feedback stay with the direct manager ===");
  res = await adam.fetch(`/api/peer-assignments/${audreyId}`);
  check("Adam cannot manage/see Audrey's peer reviewers", res.status === 403, res.status);
  res = await adam.fetch(`/api/peer-feedback/${audreyId}`);
  check("Adam cannot see peer feedback about Audrey", res.status === 403, res.status);
  res = await adam.fetch(`/api/upward-summary/${jillianId}`);
  check("Adam (Jillian's manager) still sees Jillian's upward summary — existing rule", res.status === 200, res.status);
  res = await adam.fetch(`/api/upward-summary/${audreyId}`);
  check("But not upward feedback about Audrey (she's Jillian's report)", res.status === 403, res.status);

  console.log("\n=== The reach stops after one extra level ===");
  await dana.fetch(`/api/reviews/${danaId}/self`, { method: "PUT", body: body("Dana self", { submit: true }) });
  res = await audrey.fetch(`/api/reviews/${danaId}/self`);
  check("Audrey (Dana's direct manager) can read Dana's self review", res.status === 200, res.status);
  res = await jillian.fetch(`/api/reviews/${danaId}/self`);
  check("Jillian (one level up from Audrey) can read it", res.status === 200, res.status);
  res = await adam.fetch(`/api/reviews/${danaId}/self`);
  check("Adam (two levels above Audrey) can NOT — Dana is too far down", res.status === 403, res.status);
  res = await adam.fetch(`/api/users/${danaId}`);
  check("Adam can't open Dana's roster record either", res.status === 403, res.status);
  res = await adam.fetch(`/api/summary/${danaId}`);
  check("...or her summary", res.status === 403, res.status);

  console.log("\n=== Drafts stay private until submitted ===");
  await audrey.fetch(`/api/reviews/${danaId}/manager`, { method: "PUT", body: body("Audrey on Dana", { submit: false }) });
  res = await jillian.fetch(`/api/reviews/${danaId}/manager`);
  check("Jillian can't read a manager review Audrey is still drafting", res.status === 403, res);
  res = await audrey.fetch(`/api/reviews/${danaId}/manager`);
  check("Audrey can, of course", res.status === 200, res.status);
  await audrey.fetch(`/api/reviews/${danaId}/manager`, { method: "PUT", body: body("Audrey on Dana", { submit: true }) });
  res = await jillian.fetch(`/api/reviews/${danaId}/manager`);
  check("Once Audrey submits it, Jillian can read it", res.status === 200 && res.body.review.status === "submitted", res.status);

  console.log("\n=== People who aren't in the reporting line see nothing ===");
  res = await pat.fetch(`/api/reviews/${audreyId}/self`);
  check("An unrelated manager can't read Audrey's review", res.status === 403, res.status);
  res = await pat.fetch(`/api/summary/${audreyId}`);
  check("...or her summary", res.status === 403, res.status);
  res = await audrey.fetch(`/api/reviews/${jillianId}/manager`);
  check("Reporting line doesn't work in reverse: Audrey can't see her manager's review", res.status === 403, res.status);

  console.log("\n=== Existing rule for the employee is unchanged ===");
  res = await audrey.fetch(`/api/reviews/${audreyId}/manager`);
  check("Audrey can't see her own manager review until it's discussed", res.status === 403, res.status);
  await jillian.fetch(`/api/reviews/${audreyId}/discussed`, { method: "POST", body: JSON.stringify({ discussed: true }) });
  res = await audrey.fetch(`/api/reviews/${audreyId}/manager`);
  check("After it's discussed she can", res.status === 200, res.status);
  check("...and the promotion field is still hidden from her", res.body.review && !("promotionEligible" in res.body.review), res.body.review);
  check("...and the page is told not to show the promotion section", res.body.access.canSeePromotion === false, res.body.access);

  console.log("\n=== Dashboard and roster listings ===");
  res = await adam.fetch("/api/dashboard");
  const byName = Object.fromEntries(res.body.map((r) => [r.name, r.relationship]));
  check("Adam's dashboard: himself, Jillian (direct), Audrey (one level down)", byName.Adam === "self" && byName.Jillian === "direct" && byName.Audrey === "skip", byName);
  check("...and nobody further down or unrelated", !("Dana" in byName) && !("Pat" in byName) && !("Sam" in byName), Object.keys(byName));
  res = await jillian.fetch("/api/dashboard");
  const jByName = Object.fromEntries(res.body.map((r) => [r.name, r.relationship]));
  check("Jillian's dashboard: Audrey direct, Dana one level down", jByName.Audrey === "direct" && jByName.Dana === "skip", jByName);
  res = await adam.fetch("/api/users");
  const names = res.body.map((u) => u.name);
  check("Adam's roster list includes Audrey but not Dana", names.includes("Audrey") && !names.includes("Dana"), names);
  res = await hr.fetch("/api/dashboard");
  const hrBy = Object.fromEntries(res.body.map((r) => [r.name, r.relationship]));
  check("HR admin still sees everyone", Object.keys(hrBy).length >= 7 && hrBy.Pat === "other", hrBy);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
