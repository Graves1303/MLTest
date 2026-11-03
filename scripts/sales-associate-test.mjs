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
  else { fail++; console.log(`  FAIL ${label}${detail !== undefined ? " — " + JSON.stringify(detail) : ""}`); }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const KEY = "retail_sales_associate";
const WANT_COMPETENCIES = ["Driving Results", "Customer Impact", "Change Management", "Learning Agility"];
const WANT_VALUES = ["Fun", "Curiosity", "Problem-Solving", "Collaboration", "Ownership", "Hustle", "Inclusivity"];

const fill = (categories, ratingFor, commentFor = (c) => `${c.label} comment`) =>
  Object.fromEntries(categories.map((c) => [c.key, { ratings: Object.fromEntries(c.items.map((i) => [i, ratingFor(c)])), comments: commentFor(c) }]));

async function main() {
  const hr = jar();
  await hr.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "admin@marinelayer.com", password: "ChangeMe123!" }) });
  await hr.fetch("/api/admin/cycles", { method: "POST", body: JSON.stringify({ name: "SA Test", startDate: "2026-01-01", endDate: "2026-06-30" }) });

  const mk = async (name, extra = {}) =>
    (await hr.fetch("/api/users", { method: "POST", body: JSON.stringify({ email: `${name.toLowerCase().replace(/ /g, ".")}@sa.com`, name, temporaryPassword: "TempPass123", ...extra }) })).body.id;
  const login = async (name) => {
    const j = jar();
    await j.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: `${name.toLowerCase().replace(/ /g, ".")}@sa.com`, password: "TempPass123" }) });
    return j;
  };

  const saId = await mk("Sam Associate", { templateKey: KEY, level: "sales associate" });
  const sam = await login("Sam Associate");

  console.log("=== Exactly what you asked for ===");
  let res = await sam.fetch(`/api/reviews/${saId}/self`);
  const tpl = res.body.template;
  const cats = tpl.categories;
  check("Template is the Sales Associate one", tpl.key === KEY && tpl.label === "Retail Sales Associate", tpl);
  check("Only two categories: Values and Competencies", same(cats.map((c) => c.key), ["values", "competencies"]), cats.map((c) => c.key));
  check("No KPIs", !cats.some((c) => c.key === "kpis"));
  const values = cats.find((c) => c.key === "values");
  const comps = cats.find((c) => c.key === "competencies");
  check("All 7 Values kept", same(values.items, WANT_VALUES), values.items);
  check("Exactly the 4 competencies you listed, in your order", same(comps.items, WANT_COMPETENCIES), comps.items);
  for (const dropped of ["Strategic Planning", "Coaching Agility", "Leadership Presence", "Talent Building"]) {
    check(`"${dropped}" is gone`, !comps.items.includes(dropped));
  }

  console.log("\n=== Definitions dropdowns ===");
  check("Each of the 4 competencies has a definition, matching the rows", same(comps.definitions.map((d) => d.name), WANT_COMPETENCIES), comps.definitions?.map((d) => d.name));
  check("Definition wording is the retail worksheet's", /elevates their team/.test(comps.definitions[0].looksLike) && /holistic understanding of who our customer is/.test(comps.definitions[1].looksLike), comps.definitions[0]);
  check("All 7 Values have definitions", same(values.definitions.map((d) => d.name), WANT_VALUES));

  console.log("\n=== Levels ===");
  let u = (await hr.fetch(`/api/users/${saId}`)).body;
  check("Level 'sales associate' was tidied to 'Sales Associate'", u.level === "Sales Associate", u.level);
  check("Person is on the new template", u.templateKey === KEY, u.templateKey);
  check("No purpose text yet (nothing invented)", u.levelContext === "", u.levelContext);

  console.log("\n=== Submitting and scoring ===");
  res = await sam.fetch(`/api/reviews/${saId}/self`, {
    method: "PUT",
    body: JSON.stringify({ categoryData: fill(cats, (c) => (c.key === "values" ? 3 : 4)), summary: "Strong half.", goals: [], submit: true }),
  });
  check("A full review submits", res.status === 200 && res.body.review.status === "submitted", res.body);
  res = await hr.fetch("/api/admin/cycle-report");
  const row = res.body.find((r) => r.id === saId);
  check("Overall = average of the two categories (3 and 4 -> 3.50)", row.self.overallScore === 3.5, row.self.overallScore);
  check("...not weighted by number of items (which would give 3.36)", row.self.overallScore !== (21 + 16) / 11);
  check("Grade follows the same bands", row.self.overallGrade === "Exceeds Expectations", row.self.overallGrade);
  check("Score breakdown lists only Values and Competencies", same(Object.keys(row.self.categoryOveralls).sort(), ["competencies", "values"]), row.self.categoryOveralls);

  console.log("\n=== Comments are still mandatory ===");
  const blankId = await mk("Blank Comments", { templateKey: KEY });
  const blank = await login("Blank Comments");
  const info = (await blank.fetch(`/api/reviews/${blankId}/self`)).body.template.categories;
  const data = fill(info, () => 3);
  data.competencies.comments = "";
  res = await blank.fetch(`/api/reviews/${blankId}/self`, { method: "PUT", body: JSON.stringify({ categoryData: data, summary: "x", goals: [], submit: true }) });
  check("Missing competencies comment blocks submission", res.status === 400, res);
  check("Message names Values and Competencies, not KPIs", /Values, Competencies/.test(res.body.error) && !/KPI/.test(res.body.error), res.body.error);

  console.log("\n=== Other templates are untouched ===");
  const lead = await mk("Retail Leader", { templateKey: "retail_leadership", level: "Manager" });
  const leadCats = (await (await login("Retail Leader")).fetch(`/api/reviews/${lead}/self`)).body.template.categories;
  check("Retail Leadership still has Values, Competencies (8) and KPIs (6)", same(leadCats.map((c) => c.key), ["values", "competencies", "kpis"]) && leadCats[1].items.length === 8 && leadCats[2].items.length === 6, leadCats.map((c) => [c.key, c.items.length]));
  const corp = await mk("Corp Person");
  const corpCats = (await (await login("Corp Person")).fetch(`/api/reviews/${corp}/self`)).body.template.categories;
  check("Corporate still has Values and Competencies (6)", same(corpCats.map((c) => c.key), ["values", "competencies"]) && corpCats[1].items.length === 6, corpCats.map((c) => [c.key, c.items.length]));

  console.log("\n=== Moving someone onto this template mid-cycle ===");
  const mover = await mk("Mover", { templateKey: "retail_leadership" });
  const moverSession = await login("Mover");
  const before = (await moverSession.fetch(`/api/reviews/${mover}/self`)).body.template.categories;
  await moverSession.fetch(`/api/reviews/${mover}/self`, { method: "PUT", body: JSON.stringify({ categoryData: fill(before, () => 2), summary: "draft", goals: [], submit: false }) });
  await hr.fetch(`/api/users/${mover}`, { method: "PATCH", body: JSON.stringify({ templateKey: KEY, level: "Sales Associate" }) });
  res = await moverSession.fetch(`/api/reviews/${mover}/self`);
  check("A review already started keeps the template it was started under (still has KPIs)", res.body.template.key === "retail_leadership" && res.body.template.categories.some((c) => c.key === "kpis"), res.body.template.key);
  const freshId = await mk("Fresh Start");
  await hr.fetch(`/api/users/${freshId}`, { method: "PATCH", body: JSON.stringify({ templateKey: KEY, level: "Sales Associate" }) });
  res = await (await login("Fresh Start")).fetch(`/api/reviews/${freshId}/self`);
  check("Someone with no review yet gets the new template", res.body.template.key === KEY && res.body.template.categories.length === 2, res.body.template.key);

  console.log("\n=== Upward reviews about a Sales Associate who manages someone ===");
  const boss = await mk("SA Boss", { templateKey: KEY, level: "Sales Associate" });
  await mk("SA Report", { managerId: boss });
  res = await (await login("SA Report")).fetch("/api/upward/draft");
  const upCats = res.body.categories;
  check("Upward review follows the manager's template: Values + the 4 competencies", same(upCats.map((c) => c.key), ["values", "competencies"]) && same(upCats[1].items, WANT_COMPETENCIES), upCats.map((c) => c.items.length));

  console.log("\n=== CSV import ===");
  res = await hr.fetch("/api/users/import", {
    method: "POST",
    body: JSON.stringify({
      rows: [
        { name: "Csv Associate", email: "csv.associate@sa.com", level: "Sales Associate", templateKey: KEY, managerRef: "", isHrAdmin: false },
        { name: "Csv Wrong Level", email: "csv.wrong@sa.com", level: "District Manager", templateKey: KEY, managerRef: "", isHrAdmin: false },
      ],
    }),
  });
  check("Import succeeds", res.status === 200 && res.body.created.length === 2, res.body);
  check("A valid Sales Associate level does NOT trigger a warning", !res.body.problems.some((p) => /Csv Associate/.test(p)), res.body.problems);
  check("A level from a different template DOES get flagged", res.body.problems.some((p) => /Csv Wrong Level/.test(p) && /District Manager/.test(p)), res.body.problems);
  const all = (await hr.fetch("/api/users")).body;
  check("Imported people are on the new template", all.find((x) => x.email === "csv.associate@sa.com")?.templateKey === KEY);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
