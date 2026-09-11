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
    values: jsonb("values").notNull(),
    valuesComments: text("values_comments").notNull().default(""),
    competencies: jsonb("competencies").notNull(),
    competenciesComments: text("competencies_comments").notNull().default(""),
    summary: text("summary").notNull().default(""),
    // "yes" | "no" | "six_months" | "" — manager-review only. Admin + the
    // authoring manager can see this; the employee being reviewed never can,
    // regardless of discussed status. Stripped server-side, not just hidden.
    promotionEligible: text("promotion_eligible").notNull().default(""),
    goals: jsonb("goals").notNull().default([]),
    status: text("status").notNull().default("draft"), // draft | submitted
    submittedAt: timestamp("submitted_at"),
    discussed: boolean("discussed").notNull().default(false),
    discussedAt: timestamp("discussed_at"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    employeeTypeUnique: uniqueIndex("employee_type_unique").on(table.employeeId, table.reviewerType),
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
export const peerAssignments = pgTable("peer_assignments", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull().unique(),
  peerUserIds: jsonb("peer_user_ids").notNull().default([]),
  minToReveal: text("min_to_reveal").notNull().default("3"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const peerFeedbackEntries = pgTable("peer_feedback_entries", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull(),
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
    entryId: text("entry_id").notNull(),
    submittedAt: timestamp("submitted_at").notNull().defaultNow(),
  },
  (table) => ({
    employeePeerUnique: uniqueIndex("employee_peer_unique").on(table.employeeId, table.peerUserId),
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
export const upwardDrafts = pgTable("upward_drafts", {
  id: text("id").primaryKey(),
  reporterId: text("reporter_id").notNull().unique(),
  managerId: text("manager_id").notNull(),
  values: jsonb("values").notNull(),
  valuesComments: text("values_comments").notNull().default(""),
  competencies: jsonb("competencies").notNull(),
  competenciesComments: text("competencies_comments").notNull().default(""),
  status: text("status").notNull().default("draft"), // draft | submitted
  poolEntryId: text("pool_entry_id"),
  submittedAt: timestamp("submitted_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const upwardEntries = pgTable("upward_entries", {
  id: text("id").primaryKey(),
  managerId: text("manager_id").notNull(),
  values: jsonb("values").notNull(),
  valuesComments: text("values_comments").notNull().default(""),
  competencies: jsonb("competencies").notNull(),
  competenciesComments: text("competencies_comments").notNull().default(""),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
});



