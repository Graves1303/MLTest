export const VALUES_ITEMS = ["Fun", "Curiosity", "Problem-Solving", "Collaboration", "Ownership", "Hustle", "Inclusivity"];

export const COMPETENCY_ITEMS = [
  "Drive",
  "Communication & Command",
  "Time Management & Prioritization",
  "Adaptability + Change Management",
  "Career Growth & Learning",
  "Producing Results",
];

export const VALUES_DEFINITIONS = [
  { name: "Fun", tagline: "We take our craft seriously. Ourselves? Not so much.", looksLike: "Bringing care & levity to all your professional relationships; putting effort into bonding with your team; showing appreciation & celebrating others' efforts." },
  { name: "Curiosity", tagline: "We're always teaching ourselves and learning from each other.", looksLike: "Actively seeking, providing, and implementing feedback; exploring other perspectives & asking questions before assuming intent; a desire to learn." },
  { name: "Problem-Solving", tagline: "We don't freak out, we figure it out.", looksLike: "Using resources & data to take a solutions-oriented approach; bringing in appropriate partners in a timely manner." },
  { name: "Collaboration", tagline: "We're flexible and always willing to lend a hand.", looksLike: "Showing up as a team player and quickly finding common ground; actively participating in team initiatives, championing & building trust with peers & partners." },
  { name: "Ownership", tagline: "We do what needs to be done, whether it's in our job description or not.", looksLike: "Holding yourself accountable to outcomes; leading by example; doing what you say you will do, when you say you will do it." },
  { name: "Hustle", tagline: "We move quickly and punch above our weight.", looksLike: "Making timely decisions; driving results." },
  { name: "Inclusivity", tagline: "We take care of our team, our customers, and the rest of the people on earth.", looksLike: "Treating everyone with respect; creating opportunities for others to contribute." },
];

export const COMPETENCY_DEFINITIONS = [
  { name: "Drive", looksLike: ["Independently motivated", "Seizes opportunities", "Drives results", "Tackles challenges", "Pivots gracefully"] },
  { name: "Communication & Command", looksLike: ["Communicates in a clear, organized fashion & fosters positive relationships across peers & partners", "Engages in healthy tension & innovative discussion but knows when to move on", "Contributes opinions and/or leads in team settings"] },
  { name: "Time Management & Prioritization", looksLike: ["Values own & others' time and uses it effectively", "Able to quickly identify what is critical vs trivial and adjust workflows accordingly", "Facilitates timelines to meet deadlines & improve team productivity", "Eliminates blockers & creates systems to support self + team in moving goals forward"] },
  { name: "Adaptability + Change Management", looksLike: ["Flexible; can effectively & respectfully cope with change and ambiguity", "Driver and/or early adopter of new processes & creative solutions"] },
  { name: "Career Growth & Learning", looksLike: ["Actively seeks 360 feedback & implements quickly", "Develops new skills, and applies learning to enhance credibility and contributions", "Volunteers for opportunities", "Approaches challenges with a growth mindset", "Sets goals & communicates progress"] },
  { name: "Producing Results", looksLike: ["Delivers accurate, high-quality work while maintaining a strong pace", "Consistently meets or exceeds the output expected for their role and level", "Meets deadlines, or flags risk to them early and clearly", "Follows through on commitments made to teammates and partners"] },
];

export const UPWARD_MIN_REVEAL = 3;

// Fixed Level titles, each with an exact, non-editable Level Context — this
// guarantees the two always correlate as defined, rather than being two
// independently-typed free-text fields that can drift out of sync. Derivation
// happens server-side (not just in the UI), so it can't be bypassed by a
// direct API call either.
export const LEVEL_CONTEXTS = [
  { level: "Jr. Associate", context: "Performance largely measured by individual competencies & results & application of values." },
  { level: "Associate", context: "Performance largely measured by individual results and application of values & competencies to complete projects under direction." },
  { level: "Senior Associate", context: "Performance largely measured by individual application of values & competencies to drive project results and effective cross-functional communication. If managing a direct report, performance is also measured on results of direct report." },
  { level: "Manager", context: "Performance largely measured by results achieved through application of values & competencies to individual contributions, department performance, and the ability to plan/execute good process. If managing a team, performance is also measured on development + results of direct reports." },
  { level: "Senior Manager/Associate Director", context: "Performance largely measured by department results, and ability to lead + develop the values, competencies, and results of a small team of direct reports." },
  { level: "Director", context: "Performance largely measured by the achievement of strategic business objectives driven by department and ability to lead + develop the values, competencies, and results of their direct reports." },
  { level: "Senior Director", context: "Performance measurement based on achievement of goals, and ability to deliver results in major areas of the business. Performance based on team achievements as a direct result of leadership and strategic guidance through the lens of our values & competencies." },
  { level: "VP", context: "Performance measured by the success of org-wide initiatives and ability to align + lead multiple departments to achievement of strategic goals through the lens of our values & competencies." },
  { level: "Senior VP", context: "Performance measured by the success of org-wide initiatives and ability to align + lead multiple departments to achievement of strategic goals through the lens of our values & competencies." },
];

export function contextForLevel(level: string | null | undefined) {
  if (!level) return "";
  return LEVEL_CONTEXTS.find((l) => l.level.toLowerCase() === level.trim().toLowerCase())?.context || "";
}

export function canonicalLevel(level: string | null | undefined) {
  if (!level) return "";
  const match = LEVEL_CONTEXTS.find((l) => l.level.toLowerCase() === level.trim().toLowerCase());
  return match ? match.level : level.trim();
}

// Individual item ratings support half-point increments — the paper worksheet's
// "no 3.2!" warning is solved structurally here: a discrete value set makes an
// invalid score impossible to produce in the first place, not just discouraged.
export const RATING_VALUES = [1, 1.5, 2, 2.5, 3, 3.5, 4] as const;

export function colorForRatingValue(v: number) {
  if (v <= 1) return "var(--clay)";
  if (v <= 2) return "var(--sand)";
  if (v <= 3) return "var(--horizon-bright)";
  return "var(--pine)";
}

export function labelForRatingValue(v: number) {
  if (v <= 1) return "Not Meeting Expectations";
  if (v <= 2) return "Needs Improvement";
  if (v <= 3) return "Meets Expectations";
  return "Exceeds Expectations";
}

export const RATING_SCALE = [
  {
    value: 1,
    label: "Not Meeting Expectations",
    band: "1",
    desc: "Not happening and/or not visible in business results or sphere of influence.",
  },
  {
    value: 2,
    label: "Needs Improvement",
    band: "1.5–2",
    desc: "Inconsistent. Requires substantial direction to achieve results. May struggle to take & implement feedback successfully. May struggle to communicate or exhibit positive influence within their team and/or cross-functionally.",
  },
  {
    value: 3,
    label: "Meets Expectations",
    band: "2.5–3",
    desc: "Consistent. Often celebrated for their successes, and willing to learn and try new things. Seeks & implements feedback. Exhibits positive influence across their team, and may exhibit measurable positive influence cross-functionally.",
  },
  {
    value: 4,
    label: "Exceeds Expectations",
    band: "3.5–4",
    desc: "Above and beyond. An expert, largely autonomous and held up as a model of what success looks like. Able to successfully coach, train, or mentor others. Sphere of influence extends positively both across their team & cross-functionally.",
  },
] as const;

export type RatingMap = Record<string, number | null>;
export type Goal = { id: string; text: string; timeline: string };

export function emptyRatingMap(items: string[]): RatingMap {
  return Object.fromEntries(items.map((i) => [i, null]));
}

export function average(values: (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === "number");
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function gradeFromScore(score: number | null): string | null {
  if (score == null) return null;
  if (score >= 3.5) return "Exceeds Expectations";
  if (score >= 2.5) return "Meets Expectations";
  if (score >= 2) return "Needs Improvement";
  return "Not Meeting Expectations";
}

export function computeSummary(review: {
  values: RatingMap;
  competencies: RatingMap;
} | null) {
  if (!review) return { valuesOverall: null, competenciesOverall: null, overallScore: null, overallGrade: null as string | null };
  const valuesOverall = average(Object.values(review.values));
  const competenciesOverall = average(Object.values(review.competencies));
  const overallScore = average([valuesOverall, competenciesOverall]);
  return { valuesOverall, competenciesOverall, overallScore, overallGrade: gradeFromScore(overallScore) };
}

export function computeAggregate(entries: { values: RatingMap; competencies: RatingMap }[], minToReveal: number) {
  if (!entries || entries.length === 0) {
    return { count: 0, revealed: false, overallScore: null as number | null, overallGrade: null as string | null, valuesOverall: null as number | null, competenciesOverall: null as number | null };
  }
  const summaries = entries.map((e) => computeSummary(e));
  const overallScore = average(summaries.map((s) => s.overallScore));
  return {
    count: entries.length,
    revealed: entries.length >= minToReveal,
    overallScore,
    overallGrade: gradeFromScore(overallScore),
    valuesOverall: average(summaries.map((s) => s.valuesOverall)),
    competenciesOverall: average(summaries.map((s) => s.competenciesOverall)),
  };
}

export function slugId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 11)}${Date.now().toString(36)}`;
}
