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

const KEY = "retail_store_supervisor";
const WANT_COMPETENCIES = ["Driving Results", "Coaching Agility", "Change Management", "Leadership Presence", "Customer Impact", "Learning Agility"];
const WANT_VALUES = ["Fun", "Curiosity", "Problem-Solving", "Collaboration", "Ownership", "Hustle", "Inclusivity"];
const LEADERSHIP_COMPETENCIES = ["Driving Results", "Strategic Planning", "Coaching Agility", "Change Management", "Leadership Presence", "Customer Impact", "Talent Building", "Learning Agility"];

const fill = (categories, ratingFor, commentFor = (c) => `${c.label} comment`) =>
  Object.fromEntries(categories.map((c) => [c.key, { ratings: Object.fromEntries(c.items.map((i) => [i, ratingFor(c)])), comments: commentFor(c) }]));

async function main() {
  const hr = jar();
  await hr.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "admin@marinelayer.com", password: "ChangeMe123!" }) });
  await hr.fetch("/api/admin/cycles", { method: "POST", body: JSON.stringify({ name: "SS Test", startDate: "2026-01-01", endDate: "2026-06-30" }) });

  const mk = async (name, extra = {}) =>
    (await hr.fetch("/api/users", { method: "POST", body: JSON.stringify({ email: `${name.toLowerCase().replace(/ /g, ".")}@ss.com`, name, temporaryPassword: "TempPass123", ...extra }) })).body.id;
  const login = async (name) => {
    const j = jar();
    await j.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: `${name.toLowerCase().replace(/ /g, ".")}@ss.com`, password: "TempPass123" }) });
    return j;
  };
  const templateFor = async (id, session) => (await session.fetch(`/api/reviews/${id}/self`)).body.template;

  const supId = await mk("Sam Supervisor", { templateKey: KEY, level: "store supervisor" });
  const sam = await login("Sam Supervisor");

  console.log("=== Exactly what you asked for ===");
  let res = await sam.fetch(`/api/reviews/${supId}/self`);
  const tpl = res.body.template;
  const cats = tpl.categories;
  check("Template is the Store Supervisor one", tpl.key === KEY && tpl.label === "Retail Store Supervisor", tpl);
  check("Only two categories: Values and Competencies", same(cats.map((c) => c.key), ["values", "competencies"]), cats.map((c) => c.key));
  check("No KPIs", !cats.some((c) => c.key === "kpis"));
  const values = cats.find((c) => c.key === "values");
  const comps = cats.find((c) => c.key === "competencies");
  check("All 7 Values kept", same(values.items, WANT_VALUES), values.items);
  check("Exactly the 6 competencies that remain, in worksheet order", same(comps.items, WANT_COMPETENCIES), comps.items);
  check("Talent Building is gone", !comps.items.includes("Talent Building"));
  check("Strategic Planning is gone", !comps.items.includes("Strategic Planning"));
  for (const kept of WANT_COMPETENCIES) check(`"${kept}" is kept`, comps.items.includes(kept));

  console.log("\n=== Definitions dropdowns ===");
  check("Each of the 6 competencies has a definition, matching the rows in order", same(comps.definitions.map((d) => d.name), WANT_COMPETENCIES), comps.definitions?.map((d) => d.name));
  check("Definition wording is the retail worksheet's", /meeting people where they are at/.test(comps.definitions[1].looksLike) && /Projects confidence/.test(comps.definitions[3].looksLike), comps.definitions[1]);
  check("No definitions for the removed competencies", !comps.definitions.some((d) => ["Talent Building", "Strategic Planning"].includes(d.name)));
  check("All 7 Values have definitions", same(values.definitions.map((d) => d.name), WANT_VALUES));

  console.log("\n=== Levels ===");
  const u = (await hr.fetch(`/api/users/${supId}`)).body;
  check("Level 'store supervisor' was tidied to 'Store Supervisor'", u.level === "Store Supervisor", u.level);
  check("Person is on the new template", u.templateKey === KEY, u.templateKey);
  check("No purpose text yet (nothing invented)", u.levelContext === "", u.levelContext);

  console.log("\n=== Submitting and scoring ===");
  res = await sam.fetch(`/api/reviews/${supId}/self`, {
    method: "PUT",
    body: JSON.stringify({ categoryData: fill(cats, (c) => (c.key === "values" ? 3 : 4)), summary: "Strong half.", goals: [], submit: true }),
  });
  check("A full review submits", res.status === 200 && res.body.review.status === "submitted", res.body);
  res = await hr.fetch("/api/admin/cycle-report");
  const row = res.body.find((r) => r.id === supId);
  check("Overall = average of the two categories (3 and 4 -> 3.50)", row.self.overallScore === 3.5, row.self.overallScore);
  check("...not weighted by number of items (which would give about 3.46)", row.self.overallScore !== (21 + 24) / 13);
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

  console.log("\n=== Every other template is untouched ===");
  const lead = await mk("Retail Leader", { templateKey: "retail_leadership", level: "Manager" });
  const leadTpl = await templateFor(lead, await login("Retail Leader"));
  check("Retail Leadership: Values, all 8 competencies in original order, and 6 KPIs", same(leadTpl.categories.map((c) => c.key), ["values", "competencies", "kpis"]) && same(leadTpl.categories[1].items, LEADERSHIP_COMPETENCIES) && leadTpl.categories[2].items.length === 6, leadTpl.categories.map((c) => [c.key, c.items.length]));
  check("Retail Leadership still has all 8 definitions", leadTpl.categories[1].definitions.length === 8);
  const sa = await mk("Sales Assoc", { templateKey: "retail_sales_associate", level: "Sales Associate" });
  const saTpl = await templateFor(sa, await login("Sales Assoc"));
  check("Sales Associate still has exactly its 4 competencies and 4 definitions", same(saTpl.categories[1].items, ["Driving Results", "Customer Impact", "Change Management", "Learning Agility"]) && saTpl.categories[1].definitions.length === 4 && saTpl.categories.length === 2, saTpl.categories[1].items);
  const corp = await mk("Corp Person");
  const corpTpl = await templateFor(corp, await login("Corp Person"));
  check("Corporate still has Values and 6 competencies", same(corpTpl.categories.map((c) => c.key), ["values", "competencies"]) && corpTpl.categories[1].items.length === 6);

  console.log("\n=== Moving someone onto this template mid-cycle ===");
  const mover = await mk("Mover", { templateKey: "retail_leadership" });
  const moverSession = await login("Mover");
  const before = (await moverSession.fetch(`/api/reviews/${mover}/self`)).body.template.categories;
  await moverSession.fetch(`/api/reviews/${mover}/self`, { method: "PUT", body: JSON.stringify({ categoryData: fill(before, () => 2), summary: "draft", goals: [], submit: false }) });
  await hr.fetch(`/api/users/${mover}`, { method: "PATCH", body: JSON.stringify({ templateKey: KEY, level: "Store Supervisor" }) });
  res = await moverSession.fetch(`/api/reviews/${mover}/self`);
  check("A review already started keeps the template it was started under (still has KPIs)", res.body.template.key === "retail_leadership" && res.body.template.categories.some((c) => c.key === "kpis"), res.body.template.key);
  const freshId = await mk("Fresh Start");
  await hr.fetch(`/api/users/${freshId}`, { method: "PATCH", body: JSON.stringify({ templateKey: KEY, level: "Store Supervisor" }) });
  const freshTpl = await templateFor(freshId, await login("Fresh Start"));
  check("Someone with no review yet gets the new template", freshTpl.key === KEY && freshTpl.categories.length === 2, freshTpl.key);

  console.log("\n=== Upward reviews about a Store Supervisor who manages someone ===");
  const boss = await mk("SS Boss", { templateKey: KEY, level: "Store Supervisor" });
  await mk("SS Report", { managerId: boss });
  res = await (await login("SS Report")).fetch("/api/upward/draft");
  const upCats = res.body.categories;
  check("Upward review follows the manager's template: Values + the 6 competencies", same(upCats.map((c) => c.key), ["values", "competencies"]) && same(upCats[1].items, WANT_COMPETENCIES), upCats.map((c) => c.items.length));

  console.log("\n=== CSV import ===");
  res = await hr.fetch("/api/users/import", {
    method: "POST",
    body: JSON.stringify({
      rows: [
        { name: "Csv Supervisor", email: "csv.supervisor@ss.com", level: "Store Supervisor", templateKey: KEY, managerRef: "", isHrAdmin: false },
        { name: "Csv Wrong Level", email: "csv.wrong@ss.com", level: "Sales Associate", templateKey: KEY, managerRef: "", isHrAdmin: false },
      ],
    }),
  });
  check("Import succeeds", res.status === 200 && res.body.created.length === 2, res.body);
  check("A valid Store Supervisor level does NOT trigger a warning", !res.body.problems.some((p) => /Csv Supervisor/.test(p)), res.body.problems);
  check("A level from a different template DOES get flagged", res.body.problems.some((p) => /Csv Wrong Level/.test(p) && /Sales Associate/.test(p)), res.body.problems);
  const all = (await hr.fetch("/api/users")).body;
  check("Imported people are on the new template", all.find((x) => x.email === "csv.supervisor@ss.com")?.templateKey === KEY);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
