import pg from "pg";
try { process.loadEnvFile(".env"); } catch {}

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
      return { status: res.status, body, raw };
    },
  };
}
let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${detail !== undefined ? " — " + JSON.stringify(detail).slice(0, 300) : ""}`); }
}

const fill = (cats, v = 3) =>
  Object.fromEntries(cats.map((c) => [c.key, { ratings: Object.fromEntries(c.items.map((i) => [i, v])), comments: `${c.label} comment` }]));

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const hr = jar();
  await hr.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "admin@marinelayer.com", password: "ChangeMe123!" }) });
  await hr.fetch("/api/admin/cycles", { method: "POST", body: JSON.stringify({ name: "Cycle Alpha", startDate: "2026-01-01", endDate: "2026-12-31" }) });

  const mk = async (name, extra = {}) =>
    (await hr.fetch("/api/users", { method: "POST", body: JSON.stringify({ email: `${name.toLowerCase()}@ap.com`, name, temporaryPassword: "TempPass123", ...extra }) })).body.id;
  const login = async (name) => {
    const j = jar();
    await j.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: `${name.toLowerCase()}@ap.com`, password: "TempPass123" }) });
    return j;
  };

  // Corinne (top) -> Jillian -> Bella, Eve, Fay, Gus, Hana(an HR admin). Pat is unrelated.
  const corinneId = await mk("Corinne");
  const jillianId = await mk("Jillian", { managerId: corinneId });
  const bellaId = await mk("Bella", { managerId: jillianId });
  const eveId = await mk("Eve", { managerId: jillianId });
  const fayId = await mk("Fay", { managerId: jillianId });
  const gusId = await mk("Gus", { managerId: jillianId });
  const hanaId = await mk("Hana", { managerId: jillianId, isHrAdmin: true });
  const patId = await mk("Pat");
  const [corinne, jillian, bella, eve, fay, gus, hana, pat] = await Promise.all(["Corinne", "Jillian", "Bella", "Eve", "Fay", "Gus", "Hana", "Pat"].map(login));

  const writeReview = async (mgrSession, empId, { submit, reopen = false } = {}) => {
    const cats = (await mgrSession.fetch(`/api/reviews/${empId}/manager`)).body.template.categories;
    return mgrSession.fetch(`/api/reviews/${empId}/manager`, {
      method: "PUT",
      body: JSON.stringify({ categoryData: fill(cats), summary: "Summary text.", goals: [], promotionEligible: "yes", submit, reopen }),
    });
  };
  const approve = (sess, empId, approved = true) => sess.fetch(`/api/reviews/${empId}/approval`, { method: "POST", body: JSON.stringify({ approved }) });
  const share = (sess, empId, discussed = true) => sess.fetch(`/api/reviews/${empId}/discussed`, { method: "POST", body: JSON.stringify({ discussed }) });
  const view = async (sess, empId) => (await sess.fetch(`/api/reviews/${empId}/manager`)).body;

  console.log("=== The main flow: Jillian reviews Bella; Corinne has to approve before Jillian can share ===");
  let res = await writeReview(jillian, bellaId, { submit: true });
  check("Jillian submits her review of Bella", res.status === 200 && res.body.review.status === "submitted", res);
  let v = await view(jillian, bellaId);
  check("Jillian sees it's waiting on Corinne", v.approval.required && v.approval.status === "pending" && v.approval.approverName === "Corinne" && v.approval.blocksSharing, v.approval);
  check("...and that she can't approve it herself", v.approval.canApprove === false && v.approval.canWithdraw === false);
  res = await share(jillian, bellaId);
  check("Jillian can NOT share it yet, and is told why", res.status === 409 && /Corinne/.test(res.body.error), res);
  res = await bella.fetch(`/api/reviews/${bellaId}/manager`);
  check("Bella can't see it", res.status === 403, res.status);

  v = await view(corinne, bellaId);
  check("Corinne (Jillian's manager) can open the review", !!v.review && v.review.status === "submitted");
  check("...and is told she can approve it", v.approval.canApprove === true, v.approval);
  check("...and, as the approver, sees the promotion recommendation too", v.review.promotionEligible === "yes", v.review.promotionEligible);
  check("The page is told it may show that section, read-only", v.access.canSeePromotion === true && v.access.canWrite === false, v.access);
  res = await corinne.fetch(`/api/summary/${bellaId}`);
  check("It's in her summary view as well", res.body.managerReview?.promotionEligible === "yes", res.body.managerReview && Object.keys(res.body.managerReview));
  check("...and no raw approval fields are in the review itself", !("approvedAt" in v.review) && !("approvedById" in v.review));
  res = await corinne.fetch(`/api/reviews/${bellaId}/manager`, { method: "PUT", body: JSON.stringify({ categoryData: {}, summary: "x", goals: [], reopen: true }) });
  check("Approving doesn't let Corinne edit anything", res.status === 403, res.status);

  res = await approve(corinne, bellaId);
  check("Corinne approves", res.status === 200 && res.body.approval.status === "approved" && res.body.approval.approvedByName === "Corinne", res);
  v = await view(jillian, bellaId);
  check("Jillian now sees it's approved by Corinne", v.approval.status === "approved" && v.approval.approvedByName === "Corinne" && v.approval.blocksSharing === false, v.approval);
  res = await share(jillian, bellaId);
  check("Jillian can share it with Bella", res.status === 200, res);
  res = await bella.fetch(`/api/reviews/${bellaId}/manager`);
  check("Bella can now read it", res.status === 200 && !!res.body.review, res.status);
  const leakMatch = JSON.stringify(res.body).match(/.{0,50}(approv|Corinne).{0,50}/i);
  check("...and still can't see the promotion recommendation", !("promotionEligible" in res.body.review));
  check("...and gets NO approval information, in any form", !("approval" in res.body) && !leakMatch, leakMatch ? leakMatch[0] : null);
  res = await bella.fetch(`/api/summary/${bellaId}`);
  check("Her summary view doesn't carry approval details either", res.body.managerReview && !("approvedAt" in res.body.managerReview) && !("approvedById" in res.body.managerReview));

  res = await approve(corinne, bellaId, false);
  check("Once it's shared, Corinne can't withdraw her approval", res.status === 409, res);
  await share(jillian, bellaId, false);
  res = await approve(corinne, bellaId, false);
  check("After Jillian un-shares it, Corinne CAN withdraw approval", res.status === 200 && res.body.approval.status === "pending", res);
  res = await share(jillian, bellaId);
  check("...and then Jillian is blocked from sharing again", res.status === 409, res);
  await approve(corinne, bellaId);
  res = await share(jillian, bellaId);
  check("Re-approved, she can share again", res.status === 200, res);

  console.log("\n=== Editing a review wipes its approval and un-shares it ===");
  await hr.fetch(`/api/reviews/${bellaId}/manager/unlock`, { method: "POST" });
  res = await writeReview(jillian, bellaId, { submit: false, reopen: true });
  check("(setup) Jillian reopens the already-shared, approved review", res.status === 200 && res.body.review.status === "draft", res);
  res = await bella.fetch(`/api/reviews/${bellaId}/manager`);
  check("Bella can't see it while it's being edited", res.status === 403, res.status);
  res = await writeReview(jillian, bellaId, { submit: true });
  check("Jillian resubmits", res.status === 200 && res.body.review.status === "submitted", res);
  check("The save response reports the fresh state: pending again", res.body.approval.status === "pending", res.body.approval);
  res = await bella.fetch(`/api/reviews/${bellaId}/manager`);
  check("Resubmitting did NOT quietly re-share it with Bella", res.status === 403, res.status);
  res = await share(jillian, bellaId);
  check("It needs approval again before it can be shared", res.status === 409, res);
  const rawBella = (await pool.query("select discussed, approved_at, approved_by_id from reviews where employee_id=$1 and reviewer_type='manager'", [bellaId])).rows[0];
  check("(database) approval and sharing really were cleared", rawBella.discussed === false && rawBella.approved_at === null && rawBella.approved_by_id === null, rawBella);

  console.log("\n=== Even resubmitting in one step can't carry an old approval across (Eve) ===");
  await writeReview(jillian, eveId, { submit: true });
  await approve(corinne, eveId);
  await hr.fetch(`/api/reviews/${eveId}/manager/unlock`, { method: "POST" });
  res = await writeReview(jillian, eveId, { submit: true, reopen: true });
  check("A reopen-and-resubmit in a single request succeeds", res.status === 200 && res.body.review.status === "submitted", res);
  v = await view(jillian, eveId);
  check("...but the approval was cleared anyway", v.approval.status === "pending", v.approval);

  console.log("\n=== Who can and can't approve ===");
  for (const [who, sess] of [["Bella (the person it's about)", bella], ["Jillian (who wrote it)", jillian], ["Pat (unrelated)", pat], ["Fay (another of Jillian's reports)", fay]]) {
    res = await approve(sess, eveId);
    check(`${who} can't approve`, res.status === 403, res.status);
  }
  res = await approve(hr, eveId);
  check("An HR admin can approve in Corinne's place", res.status === 200 && res.body.approval.approvedByName === "HR Admin", res);
  res = await share(jillian, eveId);
  check("...and that unblocks Jillian", res.status === 200, res);
  await writeReview(jillian, hanaId, { submit: true });
  res = await approve(hana, hanaId);
  check("An HR admin can't approve a review about THEMSELVES", res.status === 403, res.status);
  res = await approve(hr, hanaId);
  check("A different HR admin can", res.status === 200, res);

  console.log("\n=== Things that aren't approvable ===");
  await writeReview(jillian, fayId, { submit: false });
  res = await approve(corinne, fayId);
  check("A draft can't be approved", res.status === 409, res);
  res = await approve(corinne, gusId);
  check("Nor can a review that doesn't exist yet", res.status === 404, res);
  res = await approve(pat, gusId);
  check("A stranger gets 'no' without learning whether a review exists", res.status === 403, res.status);
  await writeReview(corinne, jillianId, { submit: true });
  res = await approve(hr, jillianId);
  check("A review whose manager has no manager above them doesn't need approval", res.status === 409 && /doesn't need approval/.test(res.body.error), res);

  console.log("\n=== The loophole: sharing a DRAFT, then submitting ===");
  res = await share(jillian, fayId);
  check("A draft can't be marked as shared", res.status === 409 && /Submit/.test(res.body.error), res);
  await writeReview(jillian, fayId, { submit: true });
  res = await fay.fetch(`/api/reviews/${fayId}/manager`);
  check("Submitting afterwards doesn't leave it visible to Fay", res.status === 403, res.status);

  console.log("\n=== Managers at the top of the org need no approval ===");
  v = await view(corinne, jillianId);
  check("Corinne's review of Jillian shows no approval step", v.approval.required === false && v.approval.status === "not_required" && v.approval.blocksSharing === false, v.approval);
  res = await share(corinne, jillianId);
  check("Corinne can share it straight away", res.status === 200, res);
  res = await jillian.fetch(`/api/reviews/${jillianId}/manager`);
  check("Jillian can read it, with no approval details", res.status === 200 && !("approval" in res.body));
  check("...and nothing exposes a promotion recommendation to her either (she's the person it's about)", !("promotionEligible" in res.body.review));

  console.log("\n=== Reviews that were already shared before approvals existed ===");
  await writeReview(jillian, gusId, { submit: true });
  await pool.query("update reviews set discussed = true, discussed_at = now(), approved_at = null, approved_by_id = null where employee_id = $1 and reviewer_type = 'manager'", [gusId]);
  res = await gus.fetch(`/api/reviews/${gusId}/manager`);
  check("Gus can still read it (nothing already shared gets pulled back)", res.status === 200 && !!res.body.review, res.status);
  v = await view(jillian, gusId);
  check("It's treated as not needing approval", v.approval.status === "not_required" && v.approval.blocksSharing === false, v.approval);
  v = await view(corinne, gusId);
  check("Corinne isn't asked to approve it", v.approval.canApprove === false);
  res = await corinne.fetch("/api/dashboard");
  check("...and it's not on her to-do list", res.body.find((r) => r.name === "Gus").needsMyApproval === false);
  await share(jillian, gusId, false);
  res = await share(jillian, gusId);
  check("But if it's un-shared, re-sharing does need approval", res.status === 409, res);

  console.log("\n=== The approver's to-do list and the manager's view (dashboard) ===");
  // Eve was re-approved and shared above; start a fresh pending one
  await hr.fetch(`/api/reviews/${eveId}/manager/unlock`, { method: "POST" });
  await writeReview(jillian, eveId, { submit: false, reopen: true });
  await writeReview(jillian, eveId, { submit: true });
  res = await corinne.fetch("/api/dashboard");
  let row = res.body.find((r) => r.name === "Eve");
  check("Corinne's dashboard flags Eve's review as waiting for HER approval", row.needsMyApproval === true && row.managerApproval === "pending" && row.approverName === "Corinne" && row.relationship === "skip", row);
  res = await jillian.fetch("/api/dashboard");
  row = res.body.find((r) => r.name === "Eve");
  check("Jillian's dashboard shows it as pending, but not as hers to approve", row.managerApproval === "pending" && row.needsMyApproval === false, row);
  res = await eve.fetch("/api/dashboard");
  row = res.body.find((r) => r.name === "Eve");
  check("Eve's own dashboard shows nothing about approval", row.managerApproval === null && row.needsMyApproval === false && row.approverName === null, row);
  res = await hr.fetch("/api/dashboard");
  row = res.body.find((r) => r.name === "Eve");
  check("HR sees it pending, without it being on HR's own to-do list", row.managerApproval === "pending" && row.needsMyApproval === false, row);
  res = await pat.fetch("/api/dashboard");
  check("An unrelated manager doesn't see Eve at all", !res.body.some((r) => r.name === "Eve"));
  res = await hr.fetch("/api/admin/cycle-report");
  let report = res.body.find((r) => r.name === "Eve");
  check("HR's cycle overview shows it awaiting Corinne", report.manager.approval.status === "pending" && report.manager.approval.approverName === "Corinne", report.manager.approval);
  await approve(corinne, eveId);
  res = await corinne.fetch("/api/dashboard");
  check("Once approved it drops off Corinne's to-do list", res.body.find((r) => r.name === "Eve").needsMyApproval === false);
  res = await hr.fetch("/api/admin/cycle-report");
  report = res.body.find((r) => r.name === "Eve");
  check("...and HR sees who approved it", report.manager.approval.status === "approved" && report.manager.approval.approvedByName === "Corinne", report.manager.approval);

  console.log("\n=== A closed cycle freezes approvals too ===");
  await hr.fetch("/api/admin/cycles/close", { method: "POST" });
  res = await approve(corinne, eveId, false);
  check("Approvals can't change while the review cycle is closed", res.status === 423, res.status);
  await hr.fetch("/api/admin/cycles/reopen", { method: "POST" });

  await pool.end();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
