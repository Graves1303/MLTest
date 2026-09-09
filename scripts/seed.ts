// Run with: npm run seed
// Reads DATABASE_URL from .env (or the shell environment) and creates the
// first HR admin account so someone can log in and add everyone else.
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
  const { users } = await import("../lib/schema");
  const { eq } = await import("drizzle-orm");
  const { hashPassword } = await import("../lib/auth");
  const { slugId } = await import("../lib/domain");

  const email = (process.env.SEED_ADMIN_EMAIL || "admin@marinelayer.com").toLowerCase();
  const name = process.env.SEED_ADMIN_NAME || "HR Admin";
  const password = process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!";

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const passwordHash = await hashPassword(password);

  if (existing[0]) {
    await db.update(users).set({ passwordHash, isHrAdmin: true, mustChangePassword: true }).where(eq(users.id, existing[0].id));
    console.log(`Updated existing admin account: ${email}`);
  } else {
    await db.insert(users).values({
      id: slugId("user"),
      email,
      name,
      passwordHash,
      isHrAdmin: true,
      mustChangePassword: true,
    });
    console.log(`Created HR admin account: ${email}`);
  }
  console.log(`Temporary password: ${password}`);
  console.log("They'll be asked to change it on first login.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
