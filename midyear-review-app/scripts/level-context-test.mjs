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
  await hr.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "admin@marinelayer.com", password: "ChangeMe123!" }) });

  console.log("=== Create: server derives levelContext from level, ignoring anything else client sends ===");
  let res = await hr.fetch("/api/users", {
    method: "POST",
    body: JSON.stringify({
      email: "level.create@test.com",
      name: "Level Create Test",
      level: "manager", // lowercase — should normalize
      levelContext: "I am trying to inject a fake context here", // should be ignored entirely
      temporaryPassword: "TempPass123",
    }),
  });
  check("Create succeeds", res.status === 201, res.body);
  const createdId = res.body.id;

  res = await hr.fetch(`/api/users/${createdId}`);
  check("Level normalized to canonical casing 'Manager'", res.body.level === "Manager", res.body.level);
  check("Level context correctly derived, NOT the injected fake value", res.body.levelContext.startsWith("Performance largely measured by results achieved"), res.body.levelContext);

  console.log("\n=== Update: changing level updates context; injected fake context is ignored ===");
  res = await hr.fetch(`/api/users/${createdId}`, {
    method: "PATCH",
    body: JSON.stringify({ level: "VP", levelContext: "another fake injected value" }),
  });
  check("Update succeeds", res.status === 200, res.body);
  res = await hr.fetch(`/api/users/${createdId}`);
  check("Level context updated to match new level (VP)", res.body.levelContext.startsWith("Performance measured by the success of org-wide"), res.body.levelContext);

  console.log("\n=== CSV import: correct correlation, normalization, and unrecognized-level handling ===");
  res = await hr.fetch("/api/users/import", {
    method: "POST",
    body: JSON.stringify({
      rows: [
        { name: "CSV Correlation A", email: "csvcorr.a@test.com", title: "", level: "director", managerRef: "", isHrAdmin: false },
        { name: "CSV Correlation B", email: "csvcorr.b@test.com", title: "", level: "Made Up Title", managerRef: "", isHrAdmin: false },
      ],
    }),
  });
  check("Import succeeds", res.status === 200, res.body);
  check("Unrecognized level flagged as a problem", res.body.problems.some((p) => p.includes('"Made Up Title"')), res.body.problems);

  res = await hr.fetch("/api/users");
  const a = res.body.find((u) => u.email === "csvcorr.a@test.com");
  const b = res.body.find((u) => u.email === "csvcorr.b@test.com");
  check("CSV-imported level normalized (director -> Director)", a.level === "Director", a.level);
  check("CSV-imported level context correctly derived", a.levelContext.startsWith("Performance largely measured by the achievement of strategic"), a.levelContext);
  check("Unrecognized level saved as-typed", b.level === "Made Up Title", b.level);
  check("Unrecognized level has empty context, not garbage", b.levelContext === "", b.levelContext);

  console.log("\n=== CSV re-import with a blank Level cell doesn't wipe the existing level ===");
  res = await hr.fetch("/api/users/import", {
    method: "POST",
    body: JSON.stringify({
      rows: [{ name: "CSV Correlation A", email: "csvcorr.a@test.com", title: "Updated Title", level: "", managerRef: "", isHrAdmin: false }],
    }),
  });
  res = await hr.fetch("/api/users");
  const aAfter = res.body.find((u) => u.email === "csvcorr.a@test.com");
  check("Title updated", aAfter.title === "Updated Title", aAfter.title);
  check("Level preserved despite blank CSV cell", aAfter.level === "Director", aAfter.level);
  check("Level context preserved too", aAfter.levelContext.startsWith("Performance largely measured by the achievement of strategic"), aAfter.levelContext);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
main().catch((err) => { console.error(err); process.exit(1); });
