// Kept as a thin re-export so existing imports (`@/lib/cycle-lock`) don't
// need to change everywhere — the real implementation now lives in
// lib/cycles.ts, since "is it locked" is really just "is the current cycle
// closed," which is one fact among several the cycles module manages.
export { isCycleLocked } from "@/lib/cycles";
