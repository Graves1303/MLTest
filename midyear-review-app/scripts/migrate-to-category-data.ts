// Run with: npm run migrate-categories
export {}; // forces module scope, so main() below doesn't collide with other scripts' main()
// One-time migration: copies existing values/competencies data into the new
// categoryData structure for reviews, upward drafts, and upward pool entries
// created before the template system existed. Idempotent and safe to run
// more than once — only touches rows where categoryData is still null.
//
// Note: env vars are loaded here, then the rest of the app is imported
// dynamically afterwards on purpose — `import` statements are hoisted and
// would otherwise run (and build the DB connection) before this file's own
// top-level code, meaning DATABASE_URL wouldn't be set in time.
try {
  process.loadEnvFile(".env");
} catch {
  // no .env file present — assume the environment already has DATABASE_URL etc.
}

async function main() {
  const { db } = await import("../lib/db");
  const { reviews, upwardDrafts, upwardEntries } = await import("../lib/schema");
  const { eq, isNull } = await import("drizzle-orm");

  console.log("Migrating existing review data into the new categoryData structure...\n");

  const reviewRows = await db.select().from(reviews).where(isNull(reviews.categoryData));
  console.log(`Found ${reviewRows.length} review(s) to migrate.`);
  for (const row of reviewRows) {
    await db
      .update(reviews)
      .set({
        templateKey: "corporate",
        categoryData: {
          values: { ratings: row.values || {}, comments: row.valuesComments || "" },
          competencies: { ratings: row.competencies || {}, comments: row.competenciesComments || "" },
        },
      })
      .where(eq(reviews.id, row.id));
  }

  const draftRows = await db.select().from(upwardDrafts).where(isNull(upwardDrafts.categoryData));
  console.log(`Found ${draftRows.length} upward draft(s) to migrate.`);
  for (const row of draftRows) {
    await db
      .update(upwardDrafts)
      .set({
        templateKey: "corporate",
        categoryData: {
          values: { ratings: row.values || {}, comments: row.valuesComments || "" },
          competencies: { ratings: row.competencies || {}, comments: row.competenciesComments || "" },
        },
      })
      .where(eq(upwardDrafts.id, row.id));
  }

  const entryRows = await db.select().from(upwardEntries).where(isNull(upwardEntries.categoryData));
  console.log(`Found ${entryRows.length} upward pool entr${entryRows.length === 1 ? "y" : "ies"} to migrate.`);
  for (const row of entryRows) {
    await db
      .update(upwardEntries)
      .set({
        templateKey: "corporate",
        categoryData: {
          values: { ratings: row.values || {}, comments: row.valuesComments || "" },
          competencies: { ratings: row.competencies || {}, comments: row.competenciesComments || "" },
        },
      })
      .where(eq(upwardEntries.id, row.id));
  }

  console.log("\nDone. Nothing was deleted — the old columns are untouched, just no longer used.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
