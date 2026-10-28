// Run with: npm run encrypt-existing-data
// One-off, idempotent: re-saves any row that isn't already encrypted. Safe to re-run.
export {}; // forces module scope, avoiding collisions with other scripts' main()

try {
  process.loadEnvFile(".env");
} catch {
  // no .env file present — assume the environment already has DATABASE_URL etc.
}

async function main() {
  if (!process.env.ENCRYPTION_KEY) {
    console.error("ENCRYPTION_KEY isn't set — set it first (same value the app will run with), then re-run this script.");
    process.exit(1);
  }

  const { db } = await import("../lib/db");
  const { reviews, peerFeedbackEntries, upwardDrafts, upwardEntries } = await import("../lib/schema");
  const { eq } = await import("drizzle-orm");
  const { encryptText, encryptJson, isEncryptedText } = await import("../lib/crypto");

  console.log("Encrypting existing sensitive review content at rest...\n");

  function needsJsonEncryption(value: unknown) {
    return !(value && typeof value === "object" && typeof (value as any)._enc === "string");
  }

  const reviewRows = await db.select().from(reviews);
  let reviewCount = 0;
  for (const row of reviewRows) {
    const patch: Record<string, unknown> = {};
    if (!isEncryptedText(row.summary)) patch.summary = encryptText(row.summary || "");
    if (needsJsonEncryption(row.categoryData)) patch.categoryData = encryptJson(row.categoryData ?? {});
    if (needsJsonEncryption(row.goals)) patch.goals = encryptJson(row.goals ?? []);
    if (Object.keys(patch).length) {
      await db.update(reviews).set(patch).where(eq(reviews.id, row.id));
      reviewCount++;
    }
  }
  console.log(`reviews: encrypted ${reviewCount} of ${reviewRows.length} row(s).`);

  const peerRows = await db.select().from(peerFeedbackEntries);
  let peerCount = 0;
  for (const row of peerRows) {
    const patch: Record<string, unknown> = {};
    if (!isEncryptedText(row.strengths)) patch.strengths = encryptText(row.strengths || "");
    if (!isEncryptedText(row.growth)) patch.growth = encryptText(row.growth || "");
    if (Object.keys(patch).length) {
      await db.update(peerFeedbackEntries).set(patch).where(eq(peerFeedbackEntries.id, row.id));
      peerCount++;
    }
  }
  console.log(`peer feedback entries: encrypted ${peerCount} of ${peerRows.length} row(s).`);

  const draftRows = await db.select().from(upwardDrafts);
  let draftCount = 0;
  for (const row of draftRows) {
    if (needsJsonEncryption(row.categoryData)) {
      await db.update(upwardDrafts).set({ categoryData: encryptJson(row.categoryData ?? {}) }).where(eq(upwardDrafts.id, row.id));
      draftCount++;
    }
  }
  console.log(`upward drafts: encrypted ${draftCount} of ${draftRows.length} row(s).`);

  const entryRows = await db.select().from(upwardEntries);
  let entryCount = 0;
  for (const row of entryRows) {
    if (needsJsonEncryption(row.categoryData)) {
      await db.update(upwardEntries).set({ categoryData: encryptJson(row.categoryData ?? {}) }).where(eq(upwardEntries.id, row.id));
      entryCount++;
    }
  }
  console.log(`upward pool entries: encrypted ${entryCount} of ${entryRows.length} row(s).`);

  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
