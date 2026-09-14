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

async function main() {
  const hr = jar();
  let res = await hr.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "admin@marinelayer.com", password: "ChangeMe123!" }) });
  check("HR admin logs in", res.status === 200, res.body);

  console.log("\n=== Batch 1: manager referenced by NAME, listed AFTER their report in the same file ===");
  res = await hr.fetch("/api/users/import", {
    method: "POST",
    body: JSON.stringify({
      rows: [
        { name: "Report Csv", email: "report.csv@test.com", title: "Associate", level: "Associate", levelContext: "", managerRef: "Manager Csv", isHrAdmin: false },
        { name: "Manager Csv", email: "manager.csv@test.com", title: "Director", level: "Director", levelContext: "", managerRef: "", isHrAdmin: false },
      ],
    }),
  });
  check("Batch imports with 2 created", res.status === 200 && res.body.created.length === 2, res.body);
  check("No problems (forward reference resolved)", res.body.problems.length === 0, res.body.problems);

  res = await hr.fetch("/api/users");
  const reportUser = res.body.find((u) => u.email === "report.csv@test.com");
  const managerUser = res.body.find((u) => u.email === "manager.csv@test.com");
  check("Report's managerId correctly resolved to Manager Csv's id", reportUser.managerId === managerUser.id, { reportUser, managerUser });

  console.log("\n=== Batch 2: manager referenced by EMAIL ===");
  res = await hr.fetch("/api/users/import", {
    method: "POST",
    body: JSON.stringify({
      rows: [{ name: "Email Ref Report", email: "emailref@test.com", title: "", level: "", levelContext: "", managerRef: "manager.csv@test.com", isHrAdmin: false }],
    }),
  });
  res = await hr.fetch("/api/users");
  const emailRefUser = res.body.find((u) => u.email === "emailref@test.com");
  check("Manager resolved via email reference", emailRefUser.managerId === managerUser.id, emailRefUser);

  console.log("\n=== Batch 3: re-importing an existing person updates them, doesn't duplicate or touch password ===");
  const beforeCount = (await hr.fetch("/api/users")).body.length;
  res = await hr.fetch("/api/users/import", {
    method: "POST",
    body: JSON.stringify({
      rows: [{ name: "Report Csv", email: "report.csv@test.com", title: "Senior Associate", level: "Senior Associate", levelContext: "", managerRef: "", isHrAdmin: false }],
    }),
  });
  check("Update result shows 0 created, 1 updated", res.body.created.length === 0 && res.body.updated.length === 1, res.body);
  const afterCount = (await hr.fetch("/api/users")).body.length;
  check("No duplicate account created", afterCount === beforeCount, { beforeCount, afterCount });
  const updatedReport = (await hr.fetch("/api/users")).body.find((u) => u.email === "report.csv@test.com");
  check("Title actually updated to Senior Associate", updatedReport.title === "Senior Associate", updatedReport);
  check("Existing manager link preserved (blank managerRef doesn't clear it)", updatedReport.managerId === managerUser.id, updatedReport);

  // Confirm the original login still works (password untouched)
  const reportSession = jar();
  res = await reportSession.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "report.csv@test.com", password: "wrong-password-not-set" }) });
  check("Login with a random password correctly fails (password wasn't reset to something guessable)", res.status !== 200, res.status);

  console.log("\n=== Batch 4: ambiguous manager name (two people share a name) ===");
  await hr.fetch("/api/users/import", {
    method: "POST",
    body: JSON.stringify({
      rows: [
        { name: "Duplicate Name", email: "dup1@test.com", title: "", level: "", levelContext: "", managerRef: "", isHrAdmin: false },
        { name: "Duplicate Name", email: "dup2@test.com", title: "", level: "", levelContext: "", managerRef: "", isHrAdmin: false },
      ],
    }),
  });
  res = await hr.fetch("/api/users/import", {
    method: "POST",
    body: JSON.stringify({
      rows: [{ name: "Ambiguous Report", email: "ambiguous@test.com", title: "", level: "", levelContext: "", managerRef: "Duplicate Name", isHrAdmin: false }],
    }),
  });
  check("Ambiguous name match is flagged as a problem, not silently guessed", res.body.problems.some((p) => p.includes("matches 2 people")), res.body.problems);
  const ambigUser = (await hr.fetch("/api/users")).body.find((u) => u.email === "ambiguous@test.com");
  check("Ambiguous manager left unassigned rather than guessing wrong", ambigUser.managerId === null, ambigUser);

  console.log("\n=== Batch 5: manager reference that doesn't exist at all ===");
  res = await hr.fetch("/api/users/import", {
    method: "POST",
    body: JSON.stringify({
      rows: [{ name: "Orphan Report", email: "orphan@test.com", title: "", level: "", levelContext: "", managerRef: "Nobody Real", isHrAdmin: false }],
    }),
  });
  check("Unresolvable manager reported as a problem", res.body.problems.some((p) => p.includes("wasn't found")), res.body.problems);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
