# TalentSwipe: Implementation Plan

> Every task follows the existing backend pattern (`modules/<name>/{routes,controller,services,repository,validator}`, `catchAsync`, `validateBody`, `authMiddleware()`, `authorize()`). **Every estimate includes writing that task's tests.** Schedule: [PROJECT_ROADMAP.md](PROJECT_ROADMAP.md). Design details: [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md).

Every task belongs to a **phase** (1 Core MVP · 2 Complete product · 3 Trust & safety · 4 Engagement · 5 Platform & scale); no task is optional. Effort is in **ideal dev-days (d)**; the roadmap applies ×1.3 for realism. **Phase 1 tasks are listed by stage below; Phases 2–5 follow at the end.**

## Stage order and why

| # | Stage | Tasks | Must come before the next stage because… |
|---|---|---|---|
| 0 | Unblock + foundations | T01–T05 | Without permissions, every new route 403s. Without a recruiter sign-up, half the product can't be used. Without a test harness, nothing after it is verifiable. |
| 1 | Company | T06 | Jobs belong to a company, and recruiter ownership checks need `companyId`. |
| 2 | Skills + jobs | T07–T08 | Jobs need normalized skills. The candidate feed needs OPEN jobs to exist. |
| 3 | Candidate profile + upload | T09–T10 | The AI pipeline needs a stored PDF and a profile to attach results to. |
| 4 | Queue + AI extraction + confirm | T11–T13 | Embeddings must be built from *confirmed* data, not raw LLM output. |
| 5 | Embeddings + feeds | T14–T15 | Swiping needs something to swipe on. |
| 6 | Swipe + match + pipeline | T17, T18, T22 | Chat and notifications are scoped to matches. |
| 7 | Real-time + chat | T20–T21 | Needs matches + the Notification model. |
| 8 | Frontend | F01–F06 | Built against tested, stable APIs. |
| 9 | Hardening + v0.1 release | Q01, Q02, Q04, Q06 | Q01 (deploy skeleton) is intentionally pulled into Week 2. |
| 10 | Phase 2: Complete product | T16, T19, T23–T29, T38, F07–F09, Q03, Q05 | Email (T26) comes first: verification, reset, invites and alerts all send email. |
| 11 | Phase 3: Trust & safety | T39–T44 | Must land before public launch; reports/blocks reuse the admin panel from Phase 2. |
| 12 | Phase 4: Engagement | T30–T37 | Needs a stable core + email + privacy rules (alerts and super-likes must respect blocks/visibility). |
| 13 | Phase 5: Platform & scale | T45–T54 | Optimizations once real usage shows where they matter. |

> "P0" in Phase-1 task headers means "blocks the v0.1 release". Tasks marked "Phase 2" were moved there by dependency, not dropped.

---

## Stage 0: Foundations

### T01 · Permission catalog + system-role sync (P0, 0.5d, deps: none)
- **Do:** extend `config/permissions.config.ts` with `company, job, candidate, resume, swipe, match, message, notification, admin`. In `seeding/role.seed.ts` define the RECRUITER and JOB_SEEKER grants in code and set `syncPermissions: true` for all system roles. After syncing, call `invalidateRoleForAllUsers(roleId)`.
  - RECRUITER: `company:[read,create,update]`, `job:[read,list,create,update]`, `candidate:[read]`, `swipe:[create]`, `match:[read,list,update]`, `message:[read,create]`, `notification:[read,update]`
  - JOB_SEEKER: `candidate:[read,update]`, `resume:[read,create]`, `job:[read,list]`, `swipe:[create]`, `match:[read,list,update]`, `message:[read,create]`, `notification:[read,update]`
- **Outcome:** routes can be protected by role grants.
- **Accept:** a re-run of `npm run db:seed` updates existing roles · a test: the recruiter token passes `authorize("job","create")`, the job-seeker token gets 403.

### T02 · Role-aware sign-up (P0, 0.5d, deps: T01)
- **Do:** `registerODT` gets `role: z.enum(["JOB_SEEKER","RECRUITER"]).default("JOB_SEEKER")` (**ADMIN is never accepted**). A JOB_SEEKER sign-up creates User + empty CandidateProfile in one transaction.
- **Accept:** `role:"ADMIN"` → 400 · a JOB_SEEKER has a CandidateProfile right after register · a RECRUITER has none until T06.

### T03 · Test harness + CI (P0, 1d, deps: none)
- **Do:** add `vitest`, `supertest`. Set `test` = `vitest run`. Test DB `talentswipe_test` (a separate DB in the same Postgres container). Global setup runs `prisma migrate deploy` + seed roles; each test file truncates the tables it uses. Add a `test` job in `.github/workflows/ci.yml` with `pgvector/pgvector:pg18` + `redis:7.4-alpine` services.
- **Accept:** auth tests (register/login/refresh/me) pass locally and in CI · CI fails when a test fails.

### T04 · Notification model + ownership helpers (P0, 0.5d, deps: T01)
- **Do:** add the `Notification` model + enum (TECHNICAL_ARCHITECTURE §3.2), migration. Add `getRecruiterContext(userId)` and `getCandidateId(userId)` helpers (throw 403 "Complete company setup" / 404 when missing).
- **Accept:** migration applies cleanly on a fresh DB and on the existing dev DB · unit tests for both helpers.

### T05 · Infra: floci, worker service, env (P0, 0.5d, deps: none)
- **Do:** add a `floci` service to `docker-compose.dev.yml` + bucket creation. Add a `worker` service to both compose files (the prod one on `data` + an egress network). Add the new env vars to `config/env.ts` (zod) and the `.env*.example` files. Set the `PORT` default to 4000.
- **Accept:** `docker compose -f docker-compose.dev.yml up` starts postgres, redis, floci, backend, worker (a stub that logs "worker ready") and frontend · missing required env → a clear startup error.

## Stage 1: Company

### T06 · Company API (P0, 1d, deps: T01, T04)
- **Endpoints:** `POST /api/companies` (creates Company + RecruiterProfile `isCompanyAdmin=true` in a transaction, slug from the name with a suffix on collision) · `GET /api/companies/me` · `PATCH /api/companies/me` (company admin only) · `GET /api/companies/:slug` (public summary).
- **Accept:** a second `POST` by the same recruiter → 409 · a JOB_SEEKER → 403 · PATCH by a non-admin recruiter → 403 · slug is unique · soft-deleted companies aren't returned.
- **Later:** logo upload is T29 (Phase 2; reuses `lib/s3.ts` from T10).

## Stage 2: Skills + jobs

### T07 · Skill normalization + autocomplete (P0, 0.5d, deps: T03)
- **Do:** `normalizeSkill(name) → { name, slug }` (lowercase, trim, strip spaces/dots/dashes, a small alias map: `js→javascript`, `ts→typescript`, `node→nodejs`, `reactjs→react`, `postgres→postgresql`, `k8s→kubernetes`, …). `upsertSkills(names[])` returns ids. `GET /api/skills?q=` (prefix match, limit 10).
- **Accept:** a unit test table: `"Node.js"`, `"node js"`, `"NodeJS"` → `nodejs` · autocomplete returns ≤ 10 results.

### T08 · Job management (P0, 1d, deps: T06, T07)
- **Endpoints:** `POST /api/jobs` (DRAFT, with `skills: [{ name, isRequired, minYears? }]`) · `PATCH /api/jobs/:id` (replace skills in a transaction) · `POST /api/jobs/:id/{publish|pause|close}` · `GET /api/jobs/mine?status=` · `GET /api/jobs/:id`.
- **Rules:** allowed transitions are `DRAFT→OPEN`, `OPEN↔PAUSED`, `OPEN|PAUSED→CLOSED`. Publish sets `publishedAt` and enqueues `embed:job` (a no-op stub until T14). Publish requires ≥ 1 required skill and `salaryMin ≤ salaryMax`.
- **Accept:** a recruiter can't read or modify another company's job (404) · invalid transition → 409 · `GET /api/jobs/:id` hides DRAFT jobs from non-owners.

## Stage 3: Candidate profile + upload

### T09 · Candidate profile (P0, 0.5d, deps: T02)
- **Endpoints:** `GET /api/candidates/me` (profile + skills + experiences + educations + active resume status) · `PATCH /api/candidates/me` (headline, summary, location, preferredWorkMode, openToWork, experienceLevel).
- **Accept:** PATCH by a recruiter → 403 · the response shape is documented in the route file's JSDoc.

### T10 · S3 + resume upload (P0, 1d, deps: T05, T09)
- **Do:** `lib/s3.ts`. `POST /api/candidates/me/resumes` (multer memory, 5 MB, field `file`). Check the `%PDF-` magic bytes (don't trust the mime type), compute sha256, `putObject`, create a Resume `UPLOADED`, enqueue `resume-parse` (stub until T11). Also `GET /api/candidates/me/resumes`, `GET /api/candidates/me/resumes/:id` (status), `GET /api/candidates/me/resumes/:id/download` (presigned, 5 min).
- **Accept:** a non-PDF → 400 · > 5 MB → 413 · the object exists in floci · re-uploading an identical file reuses `parsedData` without a new LLM run (once T12 exists).

## Stage 4: Queue + AI extraction + confirm

### T11 · BullMQ queues + worker process (P0, 0.5d, deps: T05)
- **Do:** `queue/queues.ts` (typed payloads, `resume-parse`, `embed`), `src/worker.ts` (registers workers, graceful shutdown), the attempt/backoff config from TECHNICAL_ARCHITECTURE §4.5, scripts `dev:worker` and a `worker` start command.
- **Accept:** an enqueued test job is processed by the worker container · SIGTERM finishes the in-flight job before exit.

### T12 · Resume LangGraph pipeline (P0, 1.5d, deps: T10, T11, T07)
- **Do:** `ai/models.ts`, `ai/schemas.ts`, `ai/resumeGraph.ts` (nodes: loadPdf → extractText → guardText → llmExtract → normalizeSkills → saveDraft → notify). Status transitions UPLOADED → PROCESSING → PROCESSED/FAILED. `UnrecoverableError` for no text. User-safe error messages.
- **Accept:** with a fake chat model, a fixture PDF → `parsedData` matches the zod schema · an image-only PDF → FAILED without retries · a provider error is retried 3× then → FAILED · a manual run on 10 real resumes (record the results in the PR): ≥ 8 usable · p95 < 60s.

### T13 · Review + confirm API (P0, 1d, deps: T12)
- **Do:** `GET /api/candidates/me/resumes/:id/draft` (returns `parsedData`) · `POST /api/candidates/me/profile/confirm` with the edited payload (the same zod shape, server-validated). One transaction: replace experiences/educations/skills (`source` = `MANUAL` if the user edited the item, otherwise `AI`; the client sends a flag), update the profile fields, set `activeResumeId`. After commit, enqueue `embed:candidate`.
- **Accept:** confirm is atomic (a forced failure mid-way leaves the old data intact) · confirming someone else's resume → 404 · confirm while the resume isn't PROCESSED → 409.

## Stage 5: Embeddings + feeds

### T14 · Embeddings (P0, 1d, deps: T11, T13, T08)
- **Do:** `ai/embedText.ts`, the `embed` worker (upsert into `ai.*_embeddings` via `$executeRaw`, set `embeddedAt`). Wire the triggers: candidate confirm or profile edit, job publish or OPEN-job edit.
- **Accept:** a fake-embeddings test writes a 1536-dim row · re-running is idempotent · deleting a job/candidate cascades the embedding row.

### T15 · Recommendation feeds (P0, 1.5d, deps: T14)
- **Endpoints:** `GET /api/feed/jobs?workMode=&experienceLevel=&location=` (candidate) · `GET /api/jobs/:id/feed` (recruiter, own OPEN job). Each item has `{ job|candidate summary, score (0–100), matchedSkills[], missingSkills[], interestedInYou? }`.
- **Do:** the SQL from TECHNICAL_ARCHITECTURE §4.4, `ai/score.ts`, boost candidates who already swiped right in the recruiter feed, the cold-start fallback.
- **Accept:** swiped jobs, CLOSED/PAUSED/DRAFT jobs and soft-deleted jobs never appear · `openToWork=false` candidates never appear · a candidate without an embedding still gets results · the fixture "React dev" ranks a React job above a Java job · p95 < 300ms with 1k jobs/1k candidates seeded.

### T16 · AI job description extraction → Phase 2 (see the Phase 2 section)

## Stage 6: Swipe, match, pipeline

### T17 · Swipe + mutual match (P0, 1d, deps: T15)
- **Endpoints:** `POST /api/swipes` with `{ jobId, direction }` (candidate) or `{ jobId, candidateId, direction }` (recruiter; side inferred from role).
- **Do:** validate (job OPEN; candidate `openToWork`; the recruiter owns the job), upsert the swipe (with `score` and `swipedById`), the match algorithm from TECHNICAL_ARCHITECTURE §3.3. Response `{ matched: boolean, matchId? }`.
- **Accept:** a repeated swipe is idempotent (it updates direction, no duplicate row) · **concurrency test:** both sides RIGHT via `Promise.all` × 20 runs → exactly 1 Match every time · LEFT never matches · swiping on a CLOSED job → 409.

### T18 · Match APIs + notifications (P0, 0.5d, deps: T17, T04)
- **Endpoints:** `GET /api/matches` (the candidate's matches, or for a recruiter `?jobId=` and `?stage=`), `GET /api/matches/:id` (includes deterministic `explanation` { matchedSkills, missingSkills, score }).
- **Do:** on match creation, store the explanation and create a `NEW_MATCH` Notification for the candidate + the job's company recruiters (published via Redis once T20 lands; DB-only until then).
- **Accept:** a non-participant → 404 · both sides see the match.

### T22 · Recruitment pipeline (P0, 0.5d, deps: T18)
- **Endpoint:** `PATCH /api/matches/:id/stage` `{ stage, expectedStage }`.
- **Transitions:** recruiter: `MATCHED→SCREENING→INTERVIEW→OFFER→HIRED` (forward one step or skip forward), any non-terminal stage → `REJECTED`. Candidate: any non-terminal stage → `WITHDRAWN`. `HIRED/REJECTED/WITHDRAWN` are terminal. Notify the other party (`STAGE_CHANGED`).
- **Accept:** a full transition-table unit test · stale `expectedStage` → 409 · a candidate can't set HIRED.

## Stage 7: Real-time + chat

### T20 · Socket.IO + live notifications (P0, 1d, deps: T04, T18)
- **Do:** `lib/socket.ts` (ticket auth middleware, `user:<id>` room, Redis `notify` subscriber → emit). `notificationService.create(userId, type, payload)` = insert + `redis.publish`. REST: `GET /api/notifications?unread=`, `POST /api/notifications/read` `{ ids | all }`.
- **Accept:** an invalid or expired ticket is rejected · user A never receives user B's events · a notification created inside the worker reaches the browser socket.

### T21 · Chat (P0, 1d, deps: T20)
- **Do:** socket events and history REST per TECHNICAL_ARCHITECTURE §5. Participant check (candidate of the match, or a recruiter of the job's company). Body 1–4000 chars, trimmed. Rate limit 20 msgs / 10 s per user (Redis INCR). A `NEW_MESSAGE` notification only if the recipient isn't in the room.
- **Accept:** two socket clients exchange messages in < 1s · history paginates in a stable order · a non-participant join/send → error ack · there's no chat on a REJECTED/WITHDRAWN match (read-only).

### T19 · LLM match summary → Phase 2 (see the Phase 2 section)

---

## Frontend

### F01 · App shell + auth (P0, 1.5d, deps: T02)
- `lib/api.ts` (fetch + refresh-retry), TanStack Query provider, `AuthProvider` (`/auth/me`), route groups with role guards, pages `/login` and `/register` (role picker: "I'm hiring" / "I'm looking for a job"), a responsive app layout with bottom nav on mobile and sidebar on desktop.
- **Accept:** login → redirected to the role home · an expired access token silently refreshes · logout clears state · a wrong-role URL redirects.

### F02 · Candidate onboarding + resume review (P0, 2d, deps: F01, T09, T10, T13, T20)
- Pages: `/onboarding` (steps: profile basics → upload resume → review → done), `/profile`.
- Upload with progress, a "Processing…" state driven by the `notification` socket event (polling `GET …/resumes/:id` every 5s as a fallback), a FAILED state with a retry/re-upload button. The review form is prefilled from the draft: editable lists of experiences, education and skill chips → Confirm.
- **Accept:** works at 375px width · a failed parse shows the server message · after confirm, the feed is reachable.

### F03 · Recruiter company + jobs (P0, 1.5d, deps: F01, T06, T08)
- Pages: `/recruiter/company/setup` (forced on first login when no company exists), `/recruiter/jobs` (status tabs), `/recruiter/jobs/new` + `/recruiter/jobs/[id]/edit` (skill autocomplete chips with a required/nice toggle), publish/pause/close actions.
- **Accept:** client and server validation errors show inline · a published job appears under the OPEN tab.

### F04 · Swipe deck (P0, 1.5d, deps: F01, T15, T17)
- A shared `<SwipeDeck>`: card (title/company or candidate headline, score badge, matched skills in green, missing in grey, "Interested in you" badge), drag with pointer events, buttons, ←/→ keys, an optimistic remove + prefetch of the next page, a "It's a match!" modal, an empty state ("No more jobs, adjust filters").
- Pages: `/jobs` (candidate feed + filters), `/recruiter/jobs/[id]/discover`.
- **Accept:** works by touch, mouse and keyboard · a swipe failure restores the card · no duplicate cards after a refetch.

### F05 · Matches, chat, notifications (P0, 1.5d, deps: F01, T18, T20, T21)
- Pages: `/matches` (list, last message, unread dot), `/matches/[id]` (chat with infinite scroll up, optimistic send, the explanation panel). A notification bell + dropdown in the layout, live via socket.
- **Accept:** messages appear live in the other tab · a reload shows the history · the unread count updates.

### F06 · Pipeline + application tracker (P0, 1d, deps: F05, T22)
- Recruiter `/recruiter/jobs/[id]/pipeline`: columns by stage on desktop, a grouped list on mobile, a stage dropdown per card (no drag-and-drop in the MVP). Candidate `/applications`: each match with its current stage + a withdraw action.
- **Accept:** a stage change reflects on the other side via notification · terminal stages are read-only.

F07 (admin pages), F08 (analytics cards) and F09 (drag-and-drop pipeline) are in Phase 2.

---

## Quality + release

| ID | Task | P | Effort | Deps | Accept |
|---|---|---|---|---|---|
| Q01 | Deploy the skeleton: VPS, Docker, Caddy TLS, `.env.production`, migrate job | P0 | 0.5d | T05 | `https://<staging>/api/health` returns ok |
| Q02 | Integration tests for each task (inside each estimate) | P0 | – | T03 | CI green on every merge |
| Q03 | Playwright E2E → Phase 2 (see below) | – | – | – | – |
| Q04 | Security pass: Redis rate limit on login/register/upload, helmet check, authz test sweep (every route × wrong role), upload limits, no secrets in logs | P0 | 0.5d | all backend | Checklist in TESTING_STRATEGY §5 all ticked |
| Q05 | Demo seed → Phase 2 (see below) | – | – | – | – |
| Q06 | Production deploy, AWS S3 bucket + IAM user (least privilege), nightly `pg_dump`, smoke test | P0 | 1d | everything P0 | The v0.1 release gate passes on prod |

---

# Phase 2: Complete product (v0.2) · 17.5d ideal

| ID | Task | Effort | Deps | Acceptance criteria |
|---|---|---|---|---|
| T26 | **Email infrastructure.** `lib/email.ts` (AWS SES via `@aws-sdk/client-sesv2`; Mailpit SMTP-compatible capture in dev), BullMQ `email` queue (5 attempts, backoff), plain HTML + text templates as TS functions, a `List-Unsubscribe` header | 1.5d | T11 | Dev emails appear in Mailpit · a failed send retries · SPF/DKIM/DMARC configured for the prod domain |
| T38 | **Email verification + password reset.** `User.emailVerifiedAt`; token table `EmailToken{ userId, type: VERIFY\|RESET, tokenHash, expiresAt, usedAt }` (store a sha256 hash, never the raw token); `POST /auth/verify-email`, `POST /auth/forgot-password` (always 200, no account enumeration), `POST /auth/reset-password` (revokes all refresh tokens); UI pages | 1.5d | T26 | A token is single-use and expires in 1h (reset) / 24h (verify) · unverified users can browse but can't swipe or message · reset logs out all sessions |
| T27 | **Email notifications + preferences.** `NotificationPreference{ userId, type, email: bool, inApp: bool }` with defaults; send email for NEW_MATCH, STAGE_CHANGED, and NEW_MESSAGE only if the user is offline > 10 min (BullMQ delayed job, cancelled if read); settings page; one-click unsubscribe link | 1.5d | T26, T20 | A user who turns off match emails gets none · unsubscribe works without login · no email for messages already read in-app |
| T23 | **Admin API.** `GET /api/admin/users?q=&role=&page=`, `PATCH /api/admin/users/:id` (deactivate = `deletedAt` + revoke refresh tokens + invalidate permission cache; change role), `GET /api/admin/jobs`, `POST /api/admin/jobs/:id/close`, `GET /api/admin/stats` (users by role, open jobs, resumes processed/failed, swipes/matches per day for 30 days) | 1.5d | T01 | Only ADMIN can call it (authz sweep) · a deactivated user is logged out within one access-token lifetime (15 min) · stats match seeded counts |
| F07 | **Admin UI.** `/admin` dashboard (stat cards + a 30-day line chart), `/admin/users` (search, filter, deactivate, change role), `/admin/jobs` (search, close) | 1.5d | T23, F01 | Every action asks for confirmation · tables paginate · usable on a tablet |
| T25 | **Company team.** `CompanyInvite{ companyId, email, tokenHash, invitedById, expiresAt, acceptedAt }`; `POST /companies/me/invites` (company admin), an accept link → register-or-login → RecruiterProfile created; `GET/DELETE /companies/me/members/:id`; transfer the admin flag; UI in company settings | 1.5d | T06, T26 | An invite expires after 7 days and is single-use · an invite to an email already in another company → 409 · removing a member keeps their jobs (`postedById` set null) · the last admin can't leave |
| T16 | **AI job description extraction.** "Analyse description" button → enqueue `extract-job` → the worker returns suggested skills (required/nice), experience level and minimum years via structured output → socket `job:extraction-ready` → the recruiter accepts or edits each suggestion | 1.5d | T11, T08, T20 | No LLM call in the HTTP request · suggestions are normalized skills · the recruiter can reject any of them · a failed run shows a retry option |
| T19 | **AI match summary.** On match creation, enqueue `match-explain` → a 2–3 sentence "why this fits + what's missing" stored in `Match.explanation.summary`; shown in the match detail and chat sidebar | 1d | T18, T11 | Generated once per match (job id `match:<id>`) · if it fails, the deterministic explanation still shows · a cost log line per call |
| T24 | **Recruiter analytics API.** Per job: candidates shown, right swipes given/received, matches, count per stage, median time from publish to first match; per company: totals across jobs | 1d | T18, T22 | Numbers match a hand-built fixture · queries < 200ms on the demo seed |
| F08 | **Analytics UI.** Stat cards + a stage funnel on the job page, a company overview page | 1d | T24 | Readable on mobile · empty states for new jobs |
| T28 | **Swipe undo.** `DELETE /api/swipes/last` within 5s if no match was created from it; an undo toast in the swipe deck | 0.5d | T17, F04 | After 5s → 409 · undoing restores the card in the deck · undo after a match → 409 |
| T29 | **Logo + avatar upload.** Image upload (PNG/JPG/WebP ≤ 2 MB, magic-byte check), stored by key, served via short-lived presigned URLs (cached client-side) | 0.5d | T10 | Wrong type/size rejected · old object deleted on replace |
| F09 | **Drag-and-drop pipeline.** Native HTML5 drag-and-drop between stage columns on desktop; the stage dropdown stays on mobile and for keyboard users; invalid drops snap back | 1d | F06 | Same transition rules as T22 · keyboard users can still change stage · optimistic update rolls back on 409 |
| Q03 | **Playwright E2E.** Register both roles → company → job → upload (fake LLM in test env) → confirm → swipe both sides → match → message → stage change | 1.5d | F06 | Runs in CI against the compose stack · < 5 min |
| Q05 | **Demo seed.** 3 companies, 15 jobs, 30 candidates with embeddings and a few matches/messages; `npm run db:seed:demo` (never in production) | 0.5d | T14 | Feeds and pipeline are non-empty right after seeding |

# Phase 3: Trust & safety (v0.3, public launch) · 8.5d ideal

| ID | Task | Effort | Deps | Acceptance criteria |
|---|---|---|---|---|
| T39 | **Company verification.** `Company.verifiedAt`, `verificationDomain`. A recruiter verifies a work email on the company's domain (reuses EmailToken) → status PENDING → admin approves in the admin panel → verified badge on cards and job pages | 1.5d | T38, T23 | Free-mail domains (gmail etc.) can't verify · only an admin can grant the badge · the badge shows on the swipe card |
| T40 | **Report + block.** `Report{ reporterId, targetType: USER\|JOB\|MESSAGE\|COMPANY, targetId, reason enum, details, status: OPEN\|ACTIONED\|DISMISSED, handledById }`, `Block{ blockerId, blockedId }` unique. A block hides both sides from each other's feeds, closes chat (read-only) and stops notifications. Admin moderation queue: view context, dismiss, deactivate user, close job, delete message | 2d | T23, T21 | A blocked user never appears in the feed again (both directions) · a blocked user can't send messages (socket + REST) · every moderation action is recorded (T44) |
| T41 | **Privacy controls.** `CandidateProfile.visibility: PUBLIC\|MATCHED_ONLY\|HIDDEN`, `hiddenFromCompanyDomains string[]` (e.g. the current employer's domain). The recruiter feed excludes candidates hiding from the recruiter's company domain; until matched, show only the candidate's first name + headline | 1.5d | T15, T39 | A recruiter from a hidden domain never sees the candidate (tested) · HIDDEN removes the candidate from all feeds · the resume download stays match-only |
| T42 | **Anti-spam rules.** Accounts < 24h old: max 20 swipes/day and no links in messages; a recruiter's first message per match is limited to 1000 chars; duplicate job detection (same company + same normalized title + similar description) warns before publishing | 1d | T21, T08 | Each rule has a test · limits come from one config object |
| T44 | **Admin audit log.** `AuditLog{ actorId, action, targetType, targetId, before Json?, after Json?, createdAt }` written by every admin/moderation action; an admin page with filters | 1d | T23 | Every admin mutation creates exactly one row · the log can't be edited through the API |
| T43 | **Account deletion + data export.** `DELETE /api/me`: soft delete, anonymize name/email/phone, delete S3 resumes, delete embeddings, keep anonymized messages so the other party's history stays intact. `GET /api/me/export`: a JSON file of profile, resumes metadata, swipes, matches, messages | 1.5d | T10, T21 | After deletion the user can't log in, doesn't appear anywhere, and their S3 objects are gone · the export contains only the requester's data |

# Phase 4: Engagement (v0.4) · 13d ideal

| ID | Task | Effort | Deps | Acceptance criteria |
|---|---|---|---|---|
| T30 | **Profile strength meter + onboarding checklist.** Score from a rules list (headline, summary, ≥ 5 skills, experience, education, active resume, preferences); a checklist with links to each missing item; recruiters get the same for company profile + jobs | 1d | T09, F02 | A pure-function unit test for the score · completing an item updates the meter immediately |
| T31 | **Advanced + saved filters.** Salary range, location (text match; radius is out of scope), employment type, company size, verified-only; `SavedFilter{ userId, name, criteria Json }` | 1.5d | T15 | Filters combine correctly (tested) · feed p95 still < 300ms with all filters on the demo seed |
| T32 | **Super-likes.** `SwipeDirection.SUPER`; daily limit per user (e.g. 3, from config) stored in Redis with a midnight TTL; the receiver sees a "Super-liked you" badge and the card is boosted in their feed; counts as RIGHT for matching | 1.5d | T17 | The limit is enforced under concurrent requests · super = right for match creation · the remaining count is shown in the UI |
| T33 | **Interview scheduling.** `Interview{ matchId, proposedById, slots Json, selectedSlot, durationMin, location/link, status: PROPOSED\|CONFIRMED\|CANCELLED, timezone }`. The recruiter proposes up to 5 slots → the candidate picks one → both get an email with an `.ics` attachment + a notification; reminders 24h and 1h before (BullMQ delayed jobs, removed on cancel); moving the match to INTERVIEW stage is offered | 3.5d | T22, T26 | Times are stored in UTC and shown in each user's timezone · cancelling removes the reminder jobs · the .ics file imports correctly into Google Calendar and Outlook |
| T34 | **Message templates.** `MessageTemplate{ companyId, name, body }` with variables `{{candidateFirstName}}`, `{{jobTitle}}`; insert from the chat composer | 1d | T21, T25 | Variables are filled on insert · templates are shared across the company team |
| T35 | **AI intro / cover note.** "Draft intro" in chat → enqueue → the worker writes a short note from the match explanation + profile → shown in the composer for editing; never sent automatically | 1d | T19, T21 | Always editable before sending · 1 draft per click, rate-limited (5/day) |
| T36 | **Skill-gap advice.** Weekly per candidate: aggregate missing required skills across their top 50 feed jobs, rank by frequency × score gain, then a short LLM explanation of the top 3; cached in `CandidateInsight{ candidateId, data Json, generatedAt }`; a card on the profile page | 2d | T15, T11 | Ranking is deterministic and unit-tested · the LLM only phrases the result · regenerated weekly or after a profile change, at most once/day |
| T37 | **Job alerts digest.** `AlertSubscription{ userId, frequency: DAILY\|WEEKLY, savedFilterId?, minScore }`; a BullMQ repeatable job finds new OPEN jobs since the last send above `minScore` → one digest email | 1.5d | T26, T31 | No email when there are no new jobs · jobs already swiped are excluded · respects unsubscribe and blocks |

# Phase 5: Platform & scale (v1.0) · 15d ideal

| ID | Task | Effort | Deps | Acceptance criteria |
|---|---|---|---|---|
| T45 | **OCR for scanned resumes.** When `guardText` finds no text, render PDF pages to images and run `tesseract.js` in the worker (max 5 pages), then continue the normal pipeline | 2d | T12 | Scanned fixture → usable extraction · OCR time p95 < 90s · memory stays under the container limit |
| T46 | **Google + LinkedIn login.** OAuth 2.0 / OIDC with PKCE using the `arctic` library; `OAuthAccount{ userId, provider, providerUserId }`; links to an existing account only when the provider's email is verified; the role is chosen on first login | 2d | T02, T38 | No account takeover via an unverified provider email · the existing JWT cookie flow is reused after the OAuth callback |
| T47 | **PWA + web push.** Web app manifest, a small service worker (app shell cache only), Web Push via the `web-push` library with VAPID keys; `PushSubscription` table; push is used for match/message/interview reminders according to preferences | 2d | T27 | Installable on Android/desktop Chrome and iOS Safari (home screen) · push respects notification preferences · an expired subscription is removed on 410 |
| T48 | **Dark mode.** Tailwind `dark:` variants, follows the system setting with a manual toggle stored in localStorage | 1d | F01 | Every page checked in both themes · contrast passes AA |
| T49 | **Internationalization.** `next-intl` on the frontend (English first, a second language as proof); the backend returns error **codes** and the frontend translates them; emails use the user's locale | 2d | F01, T26 | No hard-coded UI strings left (lint rule) · switching locale changes UI + emails |
| T50 | **Accessibility audit.** axe checks in Playwright, keyboard-only pass through all critical journeys, screen-reader labels on the swipe deck, focus management in modals | 1d | Q03 | Zero serious/critical axe violations on the critical pages |
| T51 | **Observability.** Error tracking (Sentry or a self-hosted equivalent) in frontend + backend + worker; a `/metrics` endpoint (request latency, queue depth, LLM calls/cost); `bull-board` behind admin auth; an uptime check + alerts | 1.5d | T11 | An exception in the worker shows up in error tracking with context · an alert fires when the queue backs up > 100 jobs |
| T52 | **Load testing + tuning.** `autocannon` or k6 scripts for login, feed, swipe, chat; seed 50k candidates / 50k jobs; fix slow queries (EXPLAIN ANALYZE), tune the HNSW `ef_search`, the Prisma pool and the Node memory limit | 1.5d | T15, T21 | Feed p95 < 300ms and swipe p95 < 150ms at 50 req/s · 500 concurrent sockets stable for 10 min |
| T53 | **CI/CD.** On merge to `main`: build images, push to a registry, deploy to staging automatically; promote to prod by a manual workflow; migrations run as the existing `migrate` job | 1d | Q06 | A deploy needs no SSH · a rollback to the previous image takes one command |
| T54 | **Horizontal scaling readiness.** `@socket.io/redis-adapter` (replaces the custom notify relay), sticky sessions in Caddy, 2 API + 2 worker replicas in compose, the S3 upload path checked for statelessness | 1d | T20, T52 | Two API instances: a message sent via instance A reaches a client on instance B · killing one instance drops no queued jobs |
