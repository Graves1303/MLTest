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
  competencies: { Drive: v, "Communication & Command": v, "Time Management & Prioritization": v, "Adaptability + Change Management": v, "Career Growth & Learning": v, "Producing Results": v },
  summary: "",
  goals: [],
});

async function main() {
  const hr = jar();
  await hr.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "admin@marinelayer.com", password: "ChangeMe123!" }) });

  let res = await hr.fetch("/api/users", { method: "POST", body: JSON.stringify({ email: "mandatorytest@test.com", name: "Mandatory Test", temporaryPassword: "TempPass123" }) });
  const empId = res.body.id;
  const emp = jar();
  await emp.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "mandatorytest@test.com", password: "TempPass123" }) });

  console.log("=== Self review: server rejects submit with both comments blank ===");
  res = await emp.fetch(`/api/reviews/${empId}/self`, {
    method: "PUT",
    body: JSON.stringify({ ...ratings(3), valuesComments: "", competenciesComments: "", submit: true }),
  });
  check("Blank comments -> 400 rejected", res.status === 400, res.body);

  console.log("\n=== Only one comment filled -> still rejected ===");
  res = await emp.fetch(`/api/reviews/${empId}/self`, {
    method: "PUT",
    body: JSON.stringify({ ...ratings(3), valuesComments: "Only values filled", competenciesComments: "", submit: true }),
  });
  check("Values-only -> 400 rejected", res.status === 400, res.body);

  console.log("\n=== Draft saves fine with blank comments (only submission is blocked) ===");
  res = await emp.fetch(`/api/reviews/${empId}/self`, {
    method: "PUT",
    body: JSON.stringify({ ...ratings(3), valuesComments: "", competenciesComments: "", submit: false }),
  });
  check("Draft save succeeds with blank comments", res.status === 200, res.body);

  console.log("\n=== Both filled -> submission succeeds ===");
  res = await emp.fetch(`/api/reviews/${empId}/self`, {
    method: "PUT",
    body: JSON.stringify({ ...ratings(3), valuesComments: "Solid values.", competenciesComments: "Solid competencies.", submit: true }),
  });
  check("Both filled -> submits successfully", res.status === 200 && res.body.review.status === "submitted", res.body);

  console.log("\n=== Upward review: same server-side enforcement ===");
  res = await hr.fetch("/api/users", { method: "POST", body: JSON.stringify({ email: "upmandtest@test.com", name: "Upward Mandatory Test", temporaryPassword: "TempPass123", managerId: empId }) });
  const upEmp = jar();
  await upEmp.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "upmandtest@test.com", password: "TempPass123" }) });

  await upEmp.fetch("/api/upward/draft", { method: "PUT", body: JSON.stringify({ values: ratings(2).values, valuesComments: "", competencies: ratings(2).competencies, competenciesComments: "" }) });
  res = await upEmp.fetch("/api/upward/submit", { method: "POST", body: JSON.stringify({ reopen: false }) });
  check("Upward submit with blank comments rejected", res.status === 400, res.body);

  await upEmp.fetch("/api/upward/draft", { method: "PUT", body: JSON.stringify({ values: ratings(2).values, valuesComments: "Filled in.", competencies: ratings(2).competencies, competenciesComments: "Also filled in." }) });
  res = await upEmp.fetch("/api/upward/submit", { method: "POST", body: JSON.stringify({ reopen: false }) });
  check("Upward submit with both filled succeeds", res.status === 200, res.body);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
main().catch((err) => { console.error(err); process.exit(1); });
