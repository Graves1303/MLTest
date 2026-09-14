// Run with: npm run migrate-cycles
export {}; // forces module scope, avoiding collisions with other scripts' main()

try {
  process.loadEnvFile(".env");
} catch {
  // no .env file present — assume the environment already has DATABASE_URL etc.
}

async function main() {
  const { db } = await import("../lib/db");
  const { cycles, reviews, upwardDrafts, upwardEntries, peerAssignments, peerFeedbackEntries, peerSubmissionMarkers } = await import("../lib/schema");
  const { isNull, asc, eq } = await import("drizzle-orm");
  const { slugId } = await import("../lib/domain");

  console.log("Migrating existing data into the cycles system...\n");

  const existingCycles = await db.select().from(cycles).orderBy(asc(cycles.createdAt));
  let targetCycleId: string;

  if (existingCycles.length === 0) {
    const id = slugId("cycle");
    const today = new Date().toISOString().slice(0, 10);
    await db.insert(cycles).values({
      id,
      name: "Initial cycle",
      startDate: today,
      endDate: today,
      status: "open",
    });
    targetCycleId = id;
    console.log(`No cycles existed yet — created "Initial cycle" (open) to hold pre-existing data.`);
  } else {
    targetCycleId = existingCycles[0].id;
    console.log(`Using existing earliest cycle "${existingCycles[0].name}" for any orphaned rows.`);
  }

  const tables = [
    { name: "reviews", table: reviews },
    { name: "upward drafts", table: upwardDrafts },
    { name: "upward pool entries", table: upwardEntries },
    { name: "peer assignments", table: peerAssignments },
    { name: "peer feedback entries", table: peerFeedbackEntries },
    { name: "peer submission markers", table: peerSubmissionMarkers },
  ] as const;

  for (const { name, table } of tables) {
    const rows = await db.select({ id: (table as any).id }).from(table as any).where(isNull((table as any).cycleId));
    console.log(`Found ${rows.length} ${name} row(s) to assign to the target cycle.`);
    for (const row of rows) {
      await db.update(table as any).set({ cycleId: targetCycleId }).where(eq((table as any).id, row.id));
    }
  }

  console.log("\nDone. Nothing was deleted, and no existing cycles were changed.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
