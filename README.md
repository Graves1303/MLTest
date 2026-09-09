# HQ Midyear Performance Review

A real, deployable web app for a self + manager performance review cycle, rating
Values and Competencies on a 1–4 scale (half-points allowed — 1, 1.5, 2, 2.5, 3,
3.5, 4), with an open Summary and Goals section, anonymous peer feedback,
anonymous upward reviews, and Marine Layer branding — backed by actual
authentication and server-enforced, role-based access control.

Rating inputs are a fixed set of 7 discrete values, not a free-typed number —
so a score like "3.2" isn't just discouraged, it's impossible to submit in the
first place; the server validates against that same fixed set independently of
the UI.

## How access control works

There's no separate "role" list to keep in sync. Every account has:

- an optional **manager** (who their reviews route to)
- an **HR admin** flag (full visibility, for HR/People Ops)

From those two facts, every request is checked **on the server** before any data
is returned:

- You can always read and write your own self review.
- Your direct manager can read your self review, and can write/read your manager
  review.
- You can only read your manager review once your manager has explicitly marked
  it **discussed** — not just submitted, so a manager can write freely and still
  hold it until after the 1:1 conversation. There's a "Mark as discussed" /
  "Undo" control on the manager review page for this.
- HR admins can read and write everything.
- Everyone else gets a 403, whether they come in through the UI or hit the API
  directly.

This was tested end-to-end (see `scripts/permission-test.mjs` and
`scripts/full-feature-test.mjs`) against a real Postgres database, including
confirming an unrelated manager gets a flat 403 on another manager's reports,
a still-discussed review is invisible to the employee, and the anonymity
guarantees below.

## Anonymous peer feedback

A manager can invite anyone in the company (searched from the real user
directory) to give anonymous feedback on one of their reports. The design:

- **Assignment data** (who was invited, and the minimum responses required
  before anything is revealed) is ordinary, non-anonymous data — the manager
  set it, the manager can see it.
- **Feedback content** lives in a table with no reviewer-identity column at
  all — there's nothing to link back to a person, even for someone with raw
  database access.
- **Submission eligibility is checked against the real, logged-in session** —
  not a typed-in name — so unlike a simple honor-system check, the server
  actually verifies you're on the invite list before accepting your response.
- Individual responses stay hidden until the minimum threshold is met; before
  that, only an aggregate count is shown.

## Anonymous upward reviews

Anyone can submit an anonymous review of their own manager (derived from their
account's manager field) using the same Values/Competencies template,
minus Goals and the Summary field (both specific to self/manager reviews).
Same anonymity pattern as peer feedback: your in-progress draft
is private to your own account; only on submission does an unattributed copy
get appended to a shared, anonymous pool for your manager. Reopening and
resubmitting updates your existing anonymous entry rather than creating a
second one. HR admins see an aggregated view (average score + anonymized
comments) once enough responses come in — never who submitted what.

## Stack

- **Next.js** (App Router) — pages + API routes in one deployable app
- **Postgres** via **Drizzle ORM** (chosen over Prisma because Prisma's engine
  binaries couldn't be fetched in the sandbox this was built in — Drizzle is
  pure JS/TS with no binary download step)
- **Auth**: bcrypt-hashed passwords + signed, httpOnly JWT session cookies (no
  third-party OAuth app for you to register — you can add Google/Microsoft SSO
  later if you want it, but it isn't required to run this)

## Running it locally

1. Install dependencies:
   ```
   npm install
   ```
2. Get a Postgres database. Easiest options with free tiers:
   - [Neon](https://neon.tech)
   - [Supabase](https://supabase.com)
   - [Railway](https://railway.app)
   - or a local Postgres install
3. Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL` — your connection string
   - `SESSION_SECRET` — a long random string, e.g. `openssl rand -base64 32`
   - `SEED_ADMIN_EMAIL` / `SEED_ADMIN_NAME` / `SEED_ADMIN_PASSWORD` — the first
     HR admin account
4. Push the schema to your database:
   ```
   npm run db:push
   ```
5. Create the first HR admin account:
   ```
   npm run seed
   ```
6. Run it:
   ```
   npm run dev
   ```
   Sign in at `http://localhost:3000/login` with the seed admin credentials.
   You'll be asked to set a real password immediately (the seed password is a
   temporary one, same as every account HR creates afterward).

## Adding your team

Only HR admins can add people (Admin page in the nav once signed in as one).
For each person you add, you set their manager — that relationship is what
grants manager-review access, so make sure the org chart is right before the
cycle starts. Anyone can be reassigned later, and reviews already in progress
follow the new manager immediately.

## Deploying

This is a standard Next.js app, so it deploys to
[Vercel](https://vercel.com), [Railway](https://railway.app), or anywhere else
that runs Next.js. Steps are the same regardless of host:

1. Push this project to a Git repo.
2. Connect it to your host of choice.
3. Set the same environment variables from `.env` in the host's dashboard
   (`DATABASE_URL`, `SESSION_SECRET`, and the `SEED_*` ones if you haven't
   seeded yet).
4. Run `npm run db:push` and `npm run seed` once against the production
   database (most hosts let you run a one-off command, or you can point your
   local `.env` at the production `DATABASE_URL` temporarily and run them from
   your machine).
5. Deploy.

## What's intentionally left out

- **Roster CSV import.** The artifact version this was rebuilt from had bulk
  CSV import for the roster; this rebuild doesn't yet. Adding people currently
  happens one at a time via the Admin "Add a person" flow.
- **Only one review cycle at a time.** There's one self review and one manager
  review per employee, not a history across multiple cycles. Adding a `cycle`
  field to the reviews table is the natural next step if you need year-over-year
  history.
- **The manager doesn't see their own anonymized upward feedback yet** — that
  aggregate is currently HR-admin-only oversight, not surfaced back to the
  manager it's about.
- **No email notifications** (e.g. "your manager submitted your review").
- **No SSO.** Password-based login was chosen so you don't need to register an
  OAuth app with Google/Microsoft just to get started. Swapping in SSO later is
  a contained change to `lib/auth.ts` and the login page.
- **No self-serve password reset.** HR can set a new temporary password for
  someone by re-adding them via the same email (this isn't wired up yet — worth
  adding before real rollout if HR shouldn't have to involve you for that).

## Project structure

```
lib/
  schema.ts        Drizzle table definitions — users (org chart + auth), reviews,
                    peer feedback (assignments/entries/markers), upward reviews
                    (private drafts + anonymous entries)
  db.ts             Postgres connection
  auth.ts           Password hashing, session cookies, getCurrentUser()
  permissions.ts     The actual access-control logic — read this first
  domain.ts         Rating scale, categories, grading, definitions content,
                    anonymous-pool aggregation — shared by client & server
app/
  api/              All server-enforced routes, including peer-feedback,
                    upward review, and directory search endpoints
  (app)/            Authenticated pages: dashboard, review, summary, admin,
                    account, peer-feedback, upward-review
  login/            Sign-in page
components/         Shared UI (rating rows, category panels, definitions
                    dropdown, goals editor, peer feedback panel)
scripts/
  seed.ts                    Creates the first HR admin account
  permission-test.mjs        End-to-end test of the core access-control rules
  full-feature-test.mjs      End-to-end test of discussed-gating, peer feedback
                              anonymity, and upward review anonymity
```
