import { pgTable, text, boolean, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/**
 * Users double as the org chart. There is no separate "role" enum —
 * access is derived from two facts about a user:
 *   1. managerId — who their manager is (drives manager-review access)
 *   2. isHrAdmin — a flag granting full visibility, independent of the org chart
 *
 * This means permission checks are computed from real relationships,
 * not a label that can drift out of sync with reality.
 */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  title: text("title").default(""),
  level: text("level").default(""),
  levelContext: text("level_context").default(""),
  // Which review template applies to this person's self/manager reviews, and
  // (for anyone who manages others) the categories used in upward reviews
  // about them. Defaults to "corporate" so every existing row is valid
  // without a migration.
  templateKey: text("template_key").notNull().default("corporate"),
  isHrAdmin: boolean("is_hr_admin").notNull().default(false),
  managerId: text("manager_id"),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ one, many }) => ({
  manager: one(users, {
    fields: [users.managerId],
    references: [users.id],
    relationName: "manager_reports",
  }),
  reports: many(users, { relationName: "manager_reports" }),
}));

// reviewerType is always "self" | "manager"
export const reviews = pgTable(
  "reviews",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id").notNull(),
    reviewerType: text("reviewer_type").notNull(),
    reviewerId: text("reviewer_id").notNull(),
    // Which cycle this review belongs to. Nullable so existing rows (from
    // before cycles existed) don't break the schema push — backfilled by a
    // one-time migration script, same pattern as categoryData/templateKey.
    cycleId: text("cycle_id"),
    // Legacy fixed-shape columns — kept as a safety net, no longer written to
    // by new code. All reads/writes go through categoryData below, which
    // supports any template's category set (2 for Corporate, 3 for Retail
    // Leadership, however many a future template needs) without a schema
    // change. templateKey records which template was active when this review
    // was created, so it keeps rendering correctly even if the person's
    // template assignment changes later.
    values: jsonb("values"),
    valuesComments: text("values_comments").default(""),
    competencies: jsonb("competencies"),
    competenciesComments: text("competencies_comments").default(""),
    templateKey: text("template_key").notNull().default("corporate"),
    categoryData: jsonb("category_data"),
    summary: text("summary").notNull().default(""),
    // "yes" | "no" | "six_months" | "" — manager-review only. Admin + the
    // authoring manager can see this; the employee being reviewed never can,
    // regardless of discussed status. Stripped server-side, not just hidden.
    promotionEligible: text("promotion_eligible").notNull().default(""),
    // Locks automatically on submission, same rule as peer feedback and
    // upward reviews: no self-service reopen once locked, only an admin's
    // dedicated unlock action can lift it, and it re-locks after that one
    // resubmission. Independent of the global cycle lock, which is a
    // separate, all-encompassing freeze on top of this.
    locked: boolean("locked").notNull().default(false),
    goals: jsonb("goals").notNull().default([]),
    status: text("status").notNull().default("draft"), // draft | submitted
    submittedAt: timestamp("submitted_at"),
    discussed: boolean("discussed").notNull().default(false),
    discussedAt: timestamp("discussed_at"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    employeeTypeCycleUnique: uniqueIndex("employee_type_cycle_unique").on(table.employeeId, table.reviewerType, table.cycleId),
  })
);

/**
 * Anonymous peer feedback.
 *
 * peerAssignments: who a manager has invited to give feedback on an employee,
 * and how many responses are required before anything is revealed. This is
 * ordinary, non-anonymous data — the manager set it, the manager can see it.
 *
 * peerFeedbackEntries: the actual anonymous content. Deliberately has NO
 * reviewer/user id column at all — there is nothing to link back to a person,
 * even for someone with raw database access.
 *
 * peerSubmissionMarkers: tracks which invited user has already submitted, so
 * the app can (a) block a duplicate submission and (b) let a resubmission
 * update the same entry instead of creating a second one. The API only ever
 * queries this scoped to "is it me?" — it never lists identities in bulk.
 */
export const peerAssignments = pgTable(
  "peer_assignments",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id").notNull(),
    cycleId: text("cycle_id"),
    peerUserIds: jsonb("peer_user_ids").notNull().default([]),
    minToReveal: text("min_to_reveal").notNull().default("3"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    employeeCycleUnique: uniqueIndex("peer_assignments_employee_cycle_unique").on(table.employeeId, table.cycleId),
  })
);

export const peerFeedbackEntries = pgTable("peer_feedback_entries", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull(),
  cycleId: text("cycle_id"),
  strengths: text("strengths").notNull().default(""),
  growth: text("growth").notNull().default(""),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
});

export const peerSubmissionMarkers = pgTable(
  "peer_submission_markers",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id").notNull(),
    peerUserId: text("peer_user_id").notNull(),
    cycleId: text("cycle_id"),
    entryId: text("entry_id").notNull(),
    // Locks automatically on submission — no self-service resubmission.
    // Only an admin or the assigning manager can flip this back to false,
    // and it re-locks the moment a resubmission comes in.
    locked: boolean("locked").notNull().default(true),
    submittedAt: timestamp("submitted_at").notNull().defaultNow(),
  },
  (table) => ({
    employeePeerCycleUnique: uniqueIndex("employee_peer_cycle_unique").on(table.employeeId, table.peerUserId, table.cycleId),
  })
);

/**
 * Anonymous upward reviews — same pattern as peer feedback, but the "who's
 * invited" step doesn't exist: anyone can submit about their own manager
 * (derived from their own account's managerId), so there's no assignment
 * table, just content + a self-scoped marker per (reporter, manager) pair.
 */
/**
 * The reporter's own private in-progress upward review. Access is always
 * scoped to reporterId = the logged-in user — nobody else, not even HR,
 * reads this table; only the anonymized upwardEntries pool is ever shared.
 */
export const upwardDrafts = pgTable(
  "upward_drafts",
  {
    id: text("id").primaryKey(),
    reporterId: text("reporter_id").notNull(),
    cycleId: text("cycle_id"),
    managerId: text("manager_id").notNull(),
    values: jsonb("values"),
    valuesComments: text("values_comments").default(""),
    competencies: jsonb("competencies"),
    competenciesComments: text("competencies_comments").default(""),
    templateKey: text("template_key").notNull().default("corporate"),
    categoryData: jsonb("category_data"),
    status: text("status").notNull().default("draft"), // draft | submitted
    // Locks automatically on submission — same rule as peer feedback markers:
    // no self-service reopen once locked, only an admin can lift it, and it
    // re-locks the moment a resubmission comes in.
    locked: boolean("locked").notNull().default(false),
    poolEntryId: text("pool_entry_id"),
    submittedAt: timestamp("submitted_at"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    reporterCycleUnique: uniqueIndex("upward_drafts_reporter_cycle_unique").on(table.reporterId, table.cycleId),
  })
);

export const upwardEntries = pgTable("upward_entries", {
  id: text("id").primaryKey(),
  managerId: text("manager_id").notNull(),
  cycleId: text("cycle_id"),
  values: jsonb("values"),
  valuesComments: text("values_comments").default(""),
  competencies: jsonb("competencies"),
  competenciesComments: text("competencies_comments").default(""),
  templateKey: text("template_key").notNull().default("corporate"),
  categoryData: jsonb("category_data"),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
});

/**
 * A real review cycle — named, dated, and with its own lifecycle (open ->
 * closed). Replaces the old global on/off lock: instead of one switch that
 * applied forever, each cycle is its own period. Closing a cycle is
 * reversible (same as the old lock/unlock), but starting a NEW cycle is the
 * deliberate, forward-only action — it requires the current one to be
 * closed first, and everyone starts blank in the new one. Every review,
 * peer-feedback entry, and upward entry is tagged with the cycle it belongs
 * to, so old cycles stay intact and viewable rather than being overwritten.
 */
export const cycles = pgTable("cycles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  status: text("status").notNull().default("open"), // open | closed
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Kept only so any already-deployed database doesn't error on startup before
// the migration script runs — no longer read or written by the app.
export const cycleSettings = pgTable("cycle_settings", {
  id: text("id").primaryKey().default("global"),
  locked: boolean("locked").notNull().default(false),
  lockedAt: timestamp("locked_at"),
});



