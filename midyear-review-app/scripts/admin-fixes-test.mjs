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

  console.log("=== Password reset ===");
  let res = await hr.fetch("/api/users", { method: "POST", body: JSON.stringify({ email: "resettest@test.com", name: "Reset Test", temporaryPassword: "OldPass123" }) });
  const userId = res.body.id;

  const person = jar();
  res = await person.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "resettest@test.com", password: "OldPass123" }) });
  check("Original password works before reset", res.status === 200, res.body);

  // Non-admin cannot reset someone else's password
  const nonAdmin = jar();
  await hr.fetch("/api/users", { method: "POST", body: JSON.stringify({ email: "nonadmin@test.com", name: "Non Admin", temporaryPassword: "TempPass123" }) });
  await nonAdmin.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "nonadmin@test.com", password: "TempPass123" }) });
  res = await nonAdmin.fetch(`/api/users/${userId}/reset-password`, { method: "POST", body: JSON.stringify({ newPassword: "Hacked123!" }) });
  check("Non-admin CANNOT reset someone else's password", res.status === 403, res.body);

  res = await hr.fetch(`/api/users/${userId}/reset-password`, { method: "POST", body: JSON.stringify({ newPassword: "NewPass456!" }) });
  check("HR admin resets the password successfully", res.status === 200, res.body);

  const oldSession = jar();
  res = await oldSession.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "resettest@test.com", password: "OldPass123" }) });
  check("Old password no longer works", res.status !== 200, res.status);

  const newSession = jar();
  res = await newSession.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "resettest@test.com", password: "NewPass456!" }) });
  check("New password works", res.status === 200, res.body);

  console.log("\n=== Dashboard view toggle (server-side scoping) ===");
  const createManagedRes = await hr.fetch("/api/users", { method: "POST", body: JSON.stringify({ email: "managed1@test.com", name: "Managed One", temporaryPassword: "TempPass123" }) });
  const managedId = createManagedRes.body.id;
  const resetUser = (await hr.fetch("/api/users")).body.find((u) => u.email === "resettest@test.com");
  await hr.fetch(`/api/users/${managedId}`, { method: "PATCH", body: JSON.stringify({ managerId: resetUser.id }) });

  const dashRes = await person.fetch("/api/dashboard"); // "person" = resettest@test.com, now manages Managed One
  const managesReport = dashRes.body.some((r) => r.id === managedId);
  check("Non-admin manager's dashboard includes their direct report", managesReport, dashRes.body.map((r) => r.name));
  const allUsersCount = (await hr.fetch("/api/users")).body.length;
  check("Non-admin manager's dashboard is NOT scoped to everyone", dashRes.body.length < allUsersCount, { got: dashRes.body.length, total: allUsersCount });

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
main().catch((err) => { console.error(err); process.exit(1); });
