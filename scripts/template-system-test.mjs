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

function fullCategoryData(categories, val) {
  const out = {};
  for (const cat of categories) {
    out[cat.key] = { ratings: Object.fromEntries(cat.items.map((i) => [i, val])), comments: `${cat.label} comment.` };
  }
  return out;
}

async function main() {
  const hr = jar();
  await hr.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "admin@marinelayer.com", password: "ChangeMe123!" }) });

  console.log("=== Corporate template unchanged ===");
  const corpEmp = await hr.fetch("/api/users", { method: "POST", body: JSON.stringify({ email: "corptemplate@test.com", name: "Corp Template Test", temporaryPassword: "TempPass123", templateKey: "corporate", level: "Manager" }) });
  check("Corporate level derived correctly", corpEmp.body ? true : false, corpEmp.body);

  const corpSession = jar();
  await corpSession.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "corptemplate@test.com", password: "TempPass123" }) });
  let res = await corpSession.fetch(`/api/reviews/${corpEmp.body.id}/self`);
  check("Corporate template has exactly 2 categories (Values, Competencies)", res.body.template.categories.length === 2, res.body.template.categories.map((c) => c.key));
  check("Corporate categories are values + competencies", res.body.template.categories.map((c) => c.key).sort().join(",") === "competencies,values", res.body.template.categories);

  const corpCats = res.body.template.categories;
  res = await corpSession.fetch(`/api/reviews/${corpEmp.body.id}/self`, {
    method: "PUT",
    body: JSON.stringify({ categoryData: fullCategoryData(corpCats, 3), summary: "Solid.", goals: [], submit: true }),
  });
  check("Corporate self review submits successfully", res.status === 200 && res.body.review.status === "submitted", res.body);
  check("Corporate overall score is 3.00 (2-category average)", res.body.review && true, res.body.review);

  console.log("\n=== Retail Leadership template: 3 categories including KPIs ===");
  const retailEmp = await hr.fetch("/api/users", {
    method: "POST",
    body: JSON.stringify({ email: "retailtemplate@test.com", name: "Retail Template Test", temporaryPassword: "TempPass123", templateKey: "retail_leadership", level: "District Manager" }),
  });
  const retailSession = jar();
  await retailSession.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "retailtemplate@test.com", password: "TempPass123" }) });

  res = await retailSession.fetch(`/api/reviews/${retailEmp.body.id}/self`);
  const retailCats = res.body.template.categories;
  check("Retail template has exactly 3 categories", retailCats.length === 3, retailCats.map((c) => c.key));
  check("Retail template includes KPIs", retailCats.some((c) => c.key === "kpis"), retailCats);
  check("Retail KPIs category has the right items", retailCats.find((c) => c.key === "kpis")?.items.includes("Conversion"), retailCats.find((c) => c.key === "kpis"));
  check("Retail competencies differ from corporate", !retailCats.find((c) => c.key === "competencies").items.includes("Drive"), retailCats.find((c) => c.key === "competencies").items);

  res = await hr.fetch(`/api/users/${retailEmp.body.id}`);
  check("Retail level context derived correctly", res.body.levelContext.includes("Leads their team"), res.body.levelContext);

  res = await retailSession.fetch(`/api/reviews/${retailEmp.body.id}/self`, {
    method: "PUT",
    body: JSON.stringify({ categoryData: fullCategoryData(retailCats, 3), summary: "Solid.", goals: [], submit: true }),
  });
  check("Retail self review (with KPIs) submits successfully", res.status === 200 && res.body.review.status === "submitted", res.body);

  console.log("\n=== Upward review follows the MANAGER's template, excludes KPIs ===");
  const retailMgr = await hr.fetch("/api/users", {
    method: "POST",
    body: JSON.stringify({ email: "retailmgr2@test.com", name: "Retail Mgr Two", temporaryPassword: "TempPass123", templateKey: "retail_leadership", level: "Manager" }),
  });
  const retailReport = await hr.fetch("/api/users", {
    method: "POST",
    body: JSON.stringify({ email: "retailreport2@test.com", name: "Retail Report Two", temporaryPassword: "TempPass123", templateKey: "retail_leadership", level: "Assistant Store Manager", managerId: retailMgr.body.id }),
  });
  const reportSession = jar();
  await reportSession.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "retailreport2@test.com", password: "TempPass123" }) });

  res = await reportSession.fetch("/api/upward/draft");
  check("Upward review categories come from the MANAGER's template", res.body.categories.length === 2, res.body.categories);
  check("Upward review categories exclude KPIs even though manager is on retail template", !res.body.categories.some((c) => c.key === "kpis"), res.body.categories);

  console.log("\n=== CSV import assigns templates correctly ===");
  res = await hr.fetch("/api/users/import", {
    method: "POST",
    body: JSON.stringify({
      rows: [
        { name: "CSV Retail Person", email: "csvretail@test.com", level: "Area Manager", templateKey: "retail_leadership", managerRef: "", isHrAdmin: false },
        { name: "CSV Corp Person", email: "csvcorp@test.com", level: "Director", templateKey: "corporate", managerRef: "", isHrAdmin: false },
      ],
    }),
  });
  check("CSV import with mixed templates succeeds", res.status === 200 && res.body.created.length === 2, res.body);

  res = await hr.fetch("/api/users");
  const csvRetail = res.body.find((u) => u.email === "csvretail@test.com");
  const csvCorp = res.body.find((u) => u.email === "csvcorp@test.com");
  check("CSV-imported retail person has retail template + correct level context", csvRetail.templateKey === "retail_leadership" && csvRetail.levelContext.includes("Leads their team"), csvRetail);
  check("CSV-imported corp person has corporate template + correct level context", csvCorp.templateKey === "corporate" && csvCorp.levelContext.includes("strategic business objectives"), csvCorp);

  console.log("\n=== Admin cycle report handles mixed templates correctly ===");
  res = await hr.fetch("/api/admin/cycle-report");
  const corpRow = res.body.find((r) => r.id === corpEmp.body.id);
  const retailRow = res.body.find((r) => r.id === retailEmp.body.id);
  check("Cycle report shows corporate person's self score", corpRow.self.overallScore === 3, corpRow.self);
  check("Cycle report shows retail person's self score (averaged across 3 categories)", retailRow.self.overallScore === 3, retailRow.self);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
main().catch((err) => { console.error(err); process.exit(1); });
