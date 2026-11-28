# TalentSwipe: Testing Strategy

> Principle: test the things that lose data, leak data, or break the hiring loop. Don't chase coverage numbers. For a solo developer, **integration tests against a real Postgres + Redis give the most confidence per hour**, so they're the backbone. Unit tests only for pure logic.

## 1. Tooling

| Level | Tool | Runs where |
|---|---|---|
| Unit | Vitest | `backend` (`npm test`), CI |
| Integration / API | Vitest + Supertest against `app` (no network listener), real Postgres (`talentswipe_test`) + Redis | Local + CI (service containers) |
| AI | LangChain `FakeListChatModel` / `FakeEmbeddings` injected via `ai/models.ts` (`NODE_ENV=test`) | CI. **No real LLM calls in CI** |
| AI quality | A manual script `npm run ai:eval` over `fixtures/resumes/*.pdf` with the real provider | Locally, in week 3, after every prompt change, and before each release |
| Socket.IO | `socket.io-client` in Vitest against a server started on a random port | CI |
| Queue | BullMQ with the test Redis; run the worker processor function directly for unit tests, a real Worker for one retry test | CI |
| E2E | Playwright (from Phase 2), happy-path specs + axe accessibility checks (Phase 5) | CI against the compose stack, or locally |
| Manual | The release checklist for the phase (§6) on a phone-size viewport + desktop | Before every release, on prod |

Test data: small factory functions (`createRecruiter()`, `createOpenJob(companyId, skills)`, `createCandidateWithEmbedding(vector)`) in `backend/test/factories.ts`. No fixture framework. Each file truncates the tables it touches in `beforeEach`.

Deterministic vectors for feed tests: build 1536-dim vectors by hand (e.g. a one-hot-ish "React" direction vs a "Java" direction) so ranking assertions are exact.

## 2. What to test, by area

### Auth and authorization (P0)
- Register: `role=ADMIN` rejected · JOB_SEEKER gets a CandidateProfile · duplicate email 409.
- Login/refresh/logout happy path · an expired access token → `TOKEN_EXPIRED` · a refresh with a revoked token fails.
- **Authz sweep (one table-driven test):** for every protected route × {anonymous, JOB_SEEKER, RECRUITER, other-company RECRUITER, ADMIN} → the expected status. Catches the most common real bug: a forgotten ownership check.
- The permission cache invalidates after a role seed sync.

### Database constraints (P0)
- `Swipe` unique (candidate, job, side): a second swipe updates, never duplicates.
- `Match` unique (candidate, job).
- Company create is atomic: a failure after the company insert leaves no orphan Company.
- Confirm profile is atomic: an injected failure mid-transaction leaves the previous profile data intact.
- Deleting a job cascades swipes, matches, messages and the embedding row. Soft-deleted jobs are excluded from feeds.

### Swipe and matching edge cases (P0)
| Case | Expected |
|---|---|
| Candidate RIGHT, recruiter RIGHT | 1 Match, 2 notifications |
| Both RIGHT concurrently (`Promise.all`, 20 iterations) | Exactly 1 Match each iteration |
| RIGHT then LEFT by the same side | Swipe updated to LEFT. An existing match stays (no un-matching in the MVP) |
| One side LEFT, the other RIGHT | No match |
| Swipe on a DRAFT/PAUSED/CLOSED job | 409 |
| Recruiter swipes for another company's job | 404 |
| Recruiter swipes on an `openToWork=false` candidate | 409 |
| Swiped item reappears in the feed | Never |
| Candidate with no embedding | Feed still returns (fallback), score computed from skills |

### Pipeline (P0)
- A transition table test: every (from, to, actor) combination → allowed or 409/403.
- Optimistic concurrency: a stale `expectedStage` → 409.
- Chat is read-only for terminal stages.

### AI extraction failures (P0)
| Case | Expected |
|---|---|
| Valid text PDF, fake LLM returns valid JSON | PROCESSED, `parsedData` validates against the zod schema |
| Image-only/empty PDF | FAILED immediately, `attempts=1`, user-safe message, **no retries** |
| Fake LLM throws 429 twice then succeeds | PROCESSED after 3 attempts |
| Fake LLM always throws | FAILED after 3 attempts, `RESUME_FAILED` notification |
| Fake LLM returns schema-invalid output | 1 repair attempt, then a retry. Never writes invalid data |
| Dates like "Present", "2019", "Jan 2020" | Parsed or null. Never crash |
| Identical file re-uploaded (same sha256) | No LLM call; `parsedData` copied |
| Non-PDF renamed `.pdf` | 400 at upload (magic-byte check) |

### BullMQ (P0)
- The retry/backoff config is applied (one real Worker test with a short backoff).
- Duplicate enqueue of `embed:job:<id>` collapses to one job.
- The worker processor is idempotent: run twice → the same DB state.
- Graceful shutdown: SIGTERM waits for the active job (manual check, documented).

### Socket.IO (P0)
- Connect without a ticket / with an expired ticket / with a reused ticket → rejected.
- User A doesn't receive events for user B's room.
- `chat:join` for a non-participant → error ack, no room join.
- `message:send` persists before it's emitted. An ack contains the saved message. The rate limit triggers at 21 msgs/10s.
- A notification published from the worker process reaches the connected client.

### Feeds (P0)
- Ranking with hand-built vectors · filters (workMode, experienceLevel) · exclusion rules · the recruiter feed boosts candidates who swiped right · response includes matchedSkills/missingSkills · p95 latency check with 1k/1k seeded rows (a single benchmark test, skipped in CI by default).

### Frontend critical journeys (manual in Phase 1, Playwright from Phase 2)
1. Candidate: register → onboarding → upload → review → confirm → swipe → match modal.
2. Recruiter: register → company setup → create job → publish → discover → swipe right on an interested candidate → match.
3. Both: chat in two browsers. Recruiter moves the stage → the candidate sees the stage + a notification.
4. Session: access-token expiry mid-session → silent refresh. Logout → protected pages redirect.
5. Mobile viewport (375×667): every step above is usable, buttons ≥ 44px, swipe works by touch and by buttons.

## 3. Test pyramid budget for Phase 1 (grows with each phase)
- ~15 unit test files (skill normalization, score, date parsing, transition table, embedText, zod schemas).
- ~12 integration files (one per module + the authz sweep + concurrency).
- 1 socket file, 1 queue/retry file.
- Playwright specs from Phase 2 (one per critical journey).
- The manual checklist.

## 4. CI gates (every PR to `main`)
`lint` · `format:check` · `typecheck` · `build` (exist today) **+ `test` (new)**. A red CI blocks merge. No skipping.

## 5. Security checklist (Q04)
- [ ] Every route has `authMiddleware()` + `authorize()` + an ownership scope (the authz sweep test is green)
- [ ] Rate limits: login/register 10/min/IP, upload 5/min/user, messages 20/10s/user
- [ ] Upload: 5 MB cap, magic-byte check, random S3 keys, private bucket, presigned GET 5 min
- [ ] No resume text, tokens or passwords in logs (check the pino redaction config)
- [ ] `role=ADMIN` can't be self-assigned
- [ ] Cookies `httpOnly`, `secure` in prod, `sameSite=lax` (exists)
- [ ] CORS limited to the app origin (same origin in prod)
- [ ] Secrets only in `.env.production` (gitignored), example files have no real values
- [ ] LLM prompt: resume text is passed as data with a system instruction to ignore instructions inside it (prompt-injection hygiene); the output is still zod-validated

## 6. Release gates

Every release must pass **all gates of earlier releases again** (regression) plus its own. "Open blocking bug" means a bug that breaks a flow, leaks data or loses data.

### v0.1 Core MVP (end of Phase 1)
**All of these must be true on the production URL:**

1. CI is green on `main` (lint, typecheck, build, all tests).
2. The 13-step MVP flow is completed manually on prod, on a phone viewport **and** a desktop, with two fresh accounts (not the seeded ones).
3. Concurrency, authz-sweep, AI-failure and socket-isolation tests pass.
4. The AI eval: ≥ 8/10 fixture resumes produce usable skills + experience. p95 processing < 60s.
5. The feed responds p95 < 300ms on prod with demo-sized data loaded.
6. A failed resume shows a clear message and can be re-uploaded.
7. A backend or worker container restart loses no queued jobs (Redis AOF on) and a resume uploaded during the restart still gets processed.
8. A nightly `pg_dump` has run at least once and the dump has been test-restored locally.
9. The security checklist (§5) is fully ticked.
10. No open blocking bug.

### v0.2 Complete product (end of Phase 2)
1. Password reset and email verification work end-to-end on prod. Tokens are single-use and expire (tested).
2. Emails land in the inbox, not spam, at Gmail and Outlook (SPF, DKIM, DMARC pass in the headers).
3. Notification preferences and one-click unsubscribe are respected (tested per notification type).
4. Admin: deactivate a user → they're logged out within 15 min; the authz sweep covers every `/api/admin` route.
5. Team invite → accept → the new recruiter sees the company's jobs; the last admin can't leave.
6. The AI job extraction and match summary never run inside an HTTP request; failures fall back gracefully.
7. The Playwright happy path runs green in CI.

### v0.3 Trust & safety, public launch (end of Phase 3)
1. A blocked user is invisible in feeds, chat, notifications and alerts **in both directions** (tested for each).
2. The privacy sweep: a recruiter from a hidden company domain never sees the candidate in any endpoint.
3. Reports reach the moderation queue; every admin action writes exactly one audit-log row.
4. Account deletion removes S3 files and embeddings and anonymizes the profile; the export contains only the requester's data.
5. Anti-spam limits are enforced under concurrent requests.
6. A privacy policy and terms page are live, and the deletion/export process is described in them.

### v0.4 Engagement (end of Phase 4)
1. Interview scheduling: the .ics imports into Google Calendar and Outlook; reminders fire at −24h/−1h and are removed on cancel; times are correct across two different timezones.
2. Super-like daily limits hold under concurrent requests.
3. Job alerts: no email when nothing is new; already-swiped jobs and blocked companies are excluded.
4. The skill-gap ranking is deterministic and unit-tested; LLM cost per active user per month is measured and written down.
5. The feed is still p95 < 300ms with every filter enabled.

### v1.0 (end of Phase 5)
1. Load test: feed p95 < 300ms, swipe p95 < 150ms at 50 req/s with 50k candidates / 50k jobs; 500 concurrent sockets stable for 10 min.
2. Two API instances: a chat message crosses instances; killing one instance loses no jobs.
3. OAuth can't take over an existing account through an unverified provider email.
4. Zero serious/critical axe violations on the critical pages; full keyboard-only journey works.
5. A scanned resume fixture extracts correctly through OCR.
6. Error tracking, metrics and uptime alerts are live, and an alert has been fired and received as a test.
7. Deploy and rollback work from CI without SSH.
8. A final security review of the whole codebase (authz, uploads, OAuth, tokens, secrets) is complete with no open findings.
