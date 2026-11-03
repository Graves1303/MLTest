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
  await hr.fetch("/api/admin/cycles", { method: "POST", body: JSON.stringify({ name: "Cap Test", startDate: "2026-01-01", endDate: "2026-06-30" }) });

  async function mk(tag) {
    const r = await hr.fetch("/api/users", { method: "POST", body: JSON.stringify({ email: `${tag}@captest.com`, name: `Person ${tag}`, temporaryPassword: "TempPass123" }) });
    return r.body.id;
  }
  const assign = (empId, peerIds, min = 2) =>
    hr.fetch(`/api/peer-assignments/${empId}`, { method: "PUT", body: JSON.stringify({ peerUserIds: peerIds, minToReveal: min }) });
  const peersOf = async (empId) => (await hr.fetch(`/api/peer-assignments/${empId}`)).body.peers.map((p) => p.id);

  const [e1, e2, e3, e4, e5] = await Promise.all(["e1", "e2", "e3", "e4", "e5"].map(mk));
  const P = await mk("busy");
  const Q = await mk("other");

  console.log("=== The limit itself ===");
  check("1st assignment for the same person succeeds", (await assign(e1, [P])).status === 200);
  check("2nd assignment succeeds", (await assign(e2, [P])).status === 200);
  check("3rd assignment succeeds (exactly at the limit)", (await assign(e3, [P])).status === 200);

  let res = await assign(e4, [P]);
  check("4th assignment is REFUSED", res.status === 409, res);
  check("Error names the person and the limit", /Person busy/.test(res.body.error) && /3 peer reviews/.test(res.body.error), res.body);
  check("Refused assignment was not saved", !(await peersOf(e4)).includes(P));

  console.log("\n=== A refused request changes nothing at all ===");
  res = await assign(e4, [Q, P]);
  check("Request mixing a fine person with a capped one is refused", res.status === 409, res);
  check("The fine person wasn't partially added either", (await peersOf(e4)).length === 0, await peersOf(e4));

  console.log("\n=== Editing an existing list is never blocked ===");
  res = await assign(e1, [P], 3);
  check("Changing other settings while keeping a capped person still works", res.status === 200, res);
  check("They remain on the list", (await peersOf(e1)).includes(P));

  console.log("\n=== Freeing a slot ===");
  await assign(e1, []);
  res = await assign(e4, [P]);
  check("After removing them from one list, they can be assigned elsewhere", res.status === 200, res);

  console.log("\n=== Duplicates in one request count once ===");
  const R = await mk("dupe");
  res = await assign(e5, [R, R, R]);
  check("Same person listed 3x in one request is saved once", res.status === 200 && (await peersOf(e5)).length === 1, await peersOf(e5));

  console.log("\n=== Pre-existing over-limit people (from before the cap) ===");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const L = await mk("legacy");
  const cyc = (await hr.fetch("/api/admin/cycles")).body.currentCycleId;
  const legacyEmps = await Promise.all(["l1", "l2", "l3", "l4"].map(mk));
  for (const [i, id] of legacyEmps.entries()) {
    await pool.query(
      `INSERT INTO peer_assignments (id, employee_id, cycle_id, peer_user_ids, min_to_reveal) VALUES ($1,$2,$3,$4::jsonb,'2')`,
      [`legacy_${i}`, id, cyc, JSON.stringify([L])]
    );
  }
  res = await assign(legacyEmps[0], [L], 4);
  check("Someone already over the limit can stay on a list they were already on", res.status === 200, res);
  res = await assign(e5, [R, L]);
  check("But they can't be added to yet another list", res.status === 409, res);

  console.log("\n=== Who can see workload numbers in the directory ===");
  res = await hr.fetch("/api/directory?q=busy&withPeerLoad=1");
  check("HR admin sees the workload", res.body[0]?.peerLoad === 3, res.body);
  res = await hr.fetch("/api/directory?q=busy");
  check("Without asking for it, no workload is returned", res.body[0] && !("peerLoad" in res.body[0]), res.body);

  const plain = jar();
  await plain.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "other@captest.com", password: "TempPass123" }) });
  res = await plain.fetch("/api/directory?q=busy&withPeerLoad=1");
  check("A regular employee who manages no one does NOT get workload numbers", res.body[0] && !("peerLoad" in res.body[0]), res.body);

  console.log("\n=== Race: two requests at the same instant for the same person ===");
  let raceViolations = 0;
  const ROUNDS = 15;
  for (let i = 0; i < ROUNDS; i++) {
    const Z = await mk(`z${i}`);
    const [a, b, c1, c2] = await Promise.all([mk(`ra${i}`), mk(`rb${i}`), mk(`rc${i}`), mk(`rd${i}`)]);
    await assign(a, [Z]);
    await assign(b, [Z]); // Z is now on 2 lists
    const results = await Promise.all([assign(c1, [Z]), assign(c2, [Z])]); // both want Z's 3rd... only one fits? 2+1=3 fits, second would be 4th
    const ok = results.filter((r) => r.status === 200).length;
    const refused = results.filter((r) => r.status === 409).length;
    const load = (await pool.query(`SELECT count(*)::int AS n FROM peer_assignments WHERE cycle_id=$1 AND peer_user_ids ? $2`, [cyc, Z])).rows[0].n;
    if (load > 3 || ok !== 1 || refused !== 1) raceViolations++;
  }
  check(`Across ${ROUNDS} simultaneous-request races, the limit was never exceeded`, raceViolations === 0, { raceViolations });

  await pool.end();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
