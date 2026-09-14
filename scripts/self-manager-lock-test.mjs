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
  categoryData: {
    values: { ratings: { Fun: v, Curiosity: v, "Problem-Solving": v, Collaboration: v, Ownership: v, Hustle: v, Inclusivity: v }, comments: "Values comment." },
    competencies: { ratings: { Drive: v, "Communication & Command": v, "Time Management & Prioritization": v, "Adaptability + Change Management": v, "Career Growth & Learning": v, "Producing Results": v }, comments: "Competencies comment." },
  },
  summary: "Summary text.",
  goals: [],
});

async function main() {
  const hr = jar();
  await hr.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "admin@marinelayer.com", password: "ChangeMe123!" }) });

  const emp = await hr.fetch("/api/users", { method: "POST", body: JSON.stringify({ email: "selflockemp@test.com", name: "Self Lock Employee", temporaryPassword: "TempPass123" }) });
  const empSession = jar();
  await empSession.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "selflockemp@test.com", password: "TempPass123" }) });

  console.log("=== Self review locks immediately on submission ===");
  let res = await empSession.fetch(`/api/reviews/${emp.body.id}/self`, { method: "PUT", body: JSON.stringify({ ...ratings(3), submit: true }) });
  check("Submission succeeds", res.status === 200 && res.body.review.status === "submitted", res.body);
  check("Locked automatically on submit", res.body.review.locked === true, res.body.review);

  res = await empSession.fetch(`/api/reviews/${emp.body.id}/self`, { method: "PUT", body: JSON.stringify({ ...ratings(4), reopen: true }) });
  check("Self-service reopen BLOCKED — locked", res.status === 423, res.body);

  console.log("\n=== Non-admin can't unlock ===");
  const other = jar();
  await hr.fetch("/api/users", { method: "POST", body: JSON.stringify({ email: "notadmin2@test.com", name: "Not Admin Two", temporaryPassword: "TempPass123" }) });
  await other.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "notadmin2@test.com", password: "TempPass123" }) });
  res = await other.fetch(`/api/reviews/${emp.body.id}/self/unlock`, { method: "POST" });
  check("Non-admin CANNOT unlock a review", res.status === 403, res.body);

  console.log("\n=== Admin unlocks, self-service reopen now works exactly once ===");
  res = await hr.fetch(`/api/reviews/${emp.body.id}/self/unlock`, { method: "POST" });
  check("HR admin unlocks the review", res.status === 200, res.body);

  res = await empSession.fetch(`/api/reviews/${emp.body.id}/self`, { method: "PUT", body: JSON.stringify({ ...ratings(4), reopen: true }) });
  check("Reopen now succeeds after unlock", res.status === 200 && res.body.review.status === "draft", res.body);

  res = await empSession.fetch(`/api/reviews/${emp.body.id}/self`, { method: "PUT", body: JSON.stringify({ ...ratings(4), submit: true }) });
  check("Resubmission after reopen succeeds", res.status === 200 && res.body.review.locked === true, res.body.review);

  res = await empSession.fetch(`/api/reviews/${emp.body.id}/self`, { method: "PUT", body: JSON.stringify({ ...ratings(4), reopen: true }) });
  check("Auto re-locked — reopen blocked again without a fresh unlock", res.status === 423, res.body);

  console.log("\n=== Manager reviews follow the same rule ===");
  const mgr = jar();
  await hr.fetch(`/api/users/${emp.body.id}`, {}); // noop
  const mgrUser = await hr.fetch("/api/users", { method: "POST", body: JSON.stringify({ email: "selflockmgr@test.com", name: "Self Lock Manager", temporaryPassword: "TempPass123" }) });
  await hr.fetch(`/api/users/${emp.body.id}`, { method: "PATCH", body: JSON.stringify({ managerId: mgrUser.body.id }) });
  await mgr.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "selflockmgr@test.com", password: "TempPass123" }) });

  res = await mgr.fetch(`/api/reviews/${emp.body.id}/manager`, { method: "PUT", body: JSON.stringify({ ...ratings(3), submit: true }) });
  check("Manager review submission locks it", res.status === 200 && res.body.review.locked === true, res.body.review);

  res = await mgr.fetch(`/api/reviews/${emp.body.id}/manager`, { method: "PUT", body: JSON.stringify({ ...ratings(3), reopen: true }) });
  check("Manager's own reopen blocked while locked", res.status === 423, res.body);

  console.log("\n=== Closing the cycle still overrides everything, even after admin unlock ===");
  await hr.fetch(`/api/reviews/${emp.body.id}/manager/unlock`, { method: "POST" });
  await hr.fetch("/api/admin/cycles/close", { method: "POST" });
  res = await mgr.fetch(`/api/reviews/${emp.body.id}/manager`, { method: "PUT", body: JSON.stringify({ ...ratings(3), reopen: true }) });
  check("Closing the cycle blocks even an admin-unlocked review", res.status === 423, res.body);
  await hr.fetch("/api/admin/cycles/reopen", { method: "POST" });

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
main().catch((err) => { console.error(err); process.exit(1); });
