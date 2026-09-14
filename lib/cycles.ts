import { db } from "@/lib/db";
import { cycles } from "@/lib/schema";
import { desc, eq } from "drizzle-orm";

export type Cycle = typeof cycles.$inferSelect;

/**
 * The current cycle is always whichever one was created most recently —
 * whether it's open (being actively worked on) or closed (waiting for HR to
 * start the next one). This avoids ambiguity: there's never a question of
 * "which cycle are we in," only "is it open or closed right now."
 */
export async function getCurrentCycle(): Promise<Cycle | null> {
  const rows = await db.select().from(cycles).orderBy(desc(cycles.createdAt)).limit(1);
  return rows[0] || null;
}

export async function getCycleById(id: string): Promise<Cycle | null> {
  const rows = await db.select().from(cycles).where(eq(cycles.id, id)).limit(1);
  return rows[0] || null;
}

export async function listCycles(): Promise<Cycle[]> {
  return db.select().from(cycles).orderBy(desc(cycles.createdAt));
}

/**
 * No cycle set up yet, or the current one is closed — either way, nothing
 * should be editable. This is the single check every review/peer
 * feedback/upward-review write route uses before allowing a change.
 */
export async function isCycleLocked(): Promise<boolean> {
  const current = await getCurrentCycle();
  return !current || current.status === "closed";
}

export async function closeCurrentCycle(): Promise<Cycle> {
  const current = await getCurrentCycle();
  if (!current) throw new Error("No cycle exists yet.");
  if (current.status === "closed") return current;
  await db.update(cycles).set({ status: "closed", closedAt: new Date() }).where(eq(cycles.id, current.id));
  return { ...current, status: "closed", closedAt: new Date() };
}

export async function reopenCurrentCycle(): Promise<Cycle> {
  const current = await getCurrentCycle();
  if (!current) throw new Error("No cycle exists yet.");
  if (current.status === "open") return current;
  await db.update(cycles).set({ status: "open", closedAt: null }).where(eq(cycles.id, current.id));
  return { ...current, status: "open", closedAt: null };
}

export async function startNewCycle(input: { name: string; startDate: string; endDate: string }): Promise<Cycle> {
  const current = await getCurrentCycle();
  if (current && current.status === "open") {
    throw new Error("Close the current cycle before starting a new one.");
  }
  const { slugId } = await import("@/lib/domain");
  const id = slugId("cycle");
  await db.insert(cycles).values({
    id,
    name: input.name.trim(),
    startDate: input.startDate,
    endDate: input.endDate,
    status: "open",
  });
  const created = await getCycleById(id);
  if (!created) throw new Error("Couldn't create that cycle.");
  return created;
}
