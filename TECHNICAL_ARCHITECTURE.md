# TalentSwipe: Technical Architecture

> Rule: reuse what exists. Add a dependency only when it replaces meaningful code. Every new package is listed in §9 with its reason.

## 1. System overview

```
                 ┌──────────────── Caddy (TLS, one origin) ───────────────┐
 Browser ──────► │  /            → frontend (Next.js :3000)               │
  (Next.js UI)   │  /api, /socket.io → backend api (:4000)                │
                 └────────────────────────────────────────────────────────┘
                                         │
         ┌───────────────────────────────┼────────────────────────────────┐
         ▼                               ▼                                ▼
  ┌─────────────┐  enqueue jobs   ┌─────────────┐   pub "notify"   ┌──────────────┐
  │  api        │ ───────────────►│   Redis     │◄──────────────── │  worker      │
  │ Express +   │◄─────────────── │ BullMQ +    │ ───────────────► │ BullMQ       │
  │ Socket.IO   │  sub "notify"   │ perms cache │   consume jobs   │ LangGraph.js │
  └──────┬──────┘                 └─────────────┘                  └──────┬───────┘
         │ Prisma / $queryRaw                                             │
         ▼                                                                ▼
  ┌──────────────────────────────┐        ┌──────────────┐        ┌──────────────┐
  │ PostgreSQL 18 + pgvector     │◄───────│  (same DB)   │        │ LLM + embed  │
  │ public.* (Prisma)            │        └──────────────┘        │ provider API │
  │ ai.*_embeddings (HNSW)       │                                └──────────────┘
  └──────────────────────────────┘      S3 (floci locally / AWS S3 prod) ◄── api (upload) + worker (read)
```

- **One codebase, two processes.** `backend/src/server.ts` (HTTP + Socket.IO) and a new `backend/src/worker.ts` (BullMQ consumers). The same Docker image runs both, with a different `CMD`.
- **No LLM calls on the request path.** HTTP handlers only enqueue. The worker does all LLM and embedding calls.
- **Worker → browser:** the worker writes a `Notification` row, then `PUBLISH notify <json>` on Redis. The API process `SUBSCRIBE`s and does `io.to("user:<id>").emit(...)`. That's ~15 lines and needs no `@socket.io/redis-adapter`. *Ceiling:* when there's more than one API instance, add the redis adapter.

## 2. Backend code layout (follows the existing `modules/auth` pattern)

```
backend/src/
  modules/
    auth/            (exists)
    company/         routes, controller, service, repository, validator
    job/
    candidate/       profile + resume + confirm
    skill/
    feed/            recommendation queries (raw SQL)
    swipe/           swipe + match creation
    match/           match list, stage changes (pipeline)
    chat/            message history REST + socket handlers
    notification/
    admin/           (Phase 2)
    ...              Phase 2–5 modules: see §10
  ai/
    models.ts        getChatModel(), getEmbeddings(): the only place the provider is named
    schemas.ts       zod schemas for resume extraction
    resumeGraph.ts   LangGraph StateGraph
    embedText.ts     builds the text that gets embedded for a candidate / job
    score.ts         final score + matched/missing skills
  queue/
    queues.ts        Queue instances + job payload types
    workers/         resumeParse.worker.ts, embed.worker.ts
  lib/
    prisma.ts        (exists)
    s3.ts            S3Client + put/get/presign helpers
    socket.ts        Socket.IO server, ticket auth, rooms, Redis "notify" subscriber
  worker.ts          entrypoint for the worker process
```

## 3. Database

### 3.1 What already exists (keep it)

| Relationship | How it's modeled | Constraint |
|---|---|---|
| Company 1–N recruiters | `RecruiterProfile.companyId`, `userId @unique` | A recruiter belongs to exactly one company |
| Company 1–N jobs | `Job.companyId`, `postedById` nullable (`SetNull`) | A job outlives the recruiter |
| Candidate ↔ job swipes | `Swipe(candidateId, jobId, side, direction)` | `@@unique([candidateId, jobId, side])`: idempotent upsert, one swipe per side |
| Match per candidate + job | `Match` | `@@unique([candidateId, jobId])`: one match ever per pair |
| Application / pipeline | `Match.stage` (`MatchStage` enum), `stageChangedAt` | The match *is* the application. No separate table |
| Resume versioning | `Resume[]` per candidate + `CandidateProfile.activeResumeId` | `s3Key @unique`, `checksum` for dedupe |
| Chat | `Message.matchId` | Chat is scoped to a match: no match, no messages. No Conversation table needed |
| Skills | `Skill.slug @unique`, `CandidateSkill`/`JobSkill` composite PKs | The normalized slug makes matched/missing skills an exact join |
| Embeddings | `ai.candidate_embeddings`, `ai.job_embeddings` (1536, HNSW cosine) | Outside Prisma; read/write with `$queryRaw`/`$executeRaw` |

### 3.2 Changes needed

**Only one new model:**

```prisma
enum NotificationType { RESUME_PROCESSED RESUME_FAILED NEW_MATCH NEW_MESSAGE STAGE_CHANGED }

model Notification {
  id        String           @id @default(uuid(7))
  userId    String
  user      User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  type      NotificationType
  payload   Json             // { matchId?, jobId?, resumeId?, title, body }
  readAt    DateTime?        @db.Timestamptz(3)
  createdAt DateTime         @default(now()) @db.Timestamptz(3)

  @@index([userId, createdAt(sort: Desc)])
  @@map("notifications")
}
```

**Data changes (seed, not schema):**
- `PERMISSION_CATALOG` gets: `company, job, candidate, resume, swipe, match, message, notification, admin`.
- System-role permissions for RECRUITER / JOB_SEEKER are defined in code and **synced on seed** (today only ADMIN syncs). After syncing, call `invalidateRoleForAllUsers` so the 1h Redis cache doesn't serve stale grants.

**Not needed at all:** a Conversation table (Match covers it) and an Application table (Match covers it). Tables for later phases (invites, reports, blocks, audit log, interviews, …) are listed in §10.

### 3.3 Transactions and consistency

| Operation | Approach |
|---|---|
| Create company | One `$transaction`: insert Company + RecruiterProfile(`isCompanyAdmin: true`). 409 if the user already has a RecruiterProfile. |
| Sign up as JOB_SEEKER | One transaction: User + empty CandidateProfile, so later code never has to handle a missing profile. |
| Confirm resume data | One transaction: delete the candidate's experiences/educations/skills → insert the confirmed set → set `activeResumeId`. Then enqueue `embed:candidate` **after commit**. |
| Swipe → match | **No wrapping transaction needed.** (1) upsert own swipe (committed). (2) If RIGHT, check whether the opposite side's swipe is RIGHT. (3) If yes, `INSERT … ON CONFLICT ("candidateId","jobId") DO NOTHING RETURNING id`. When both sides swipe at the same moment, each checks *after* its own commit, so the later check always sees both rows, and the unique constraint dedupes. Notify only when `RETURNING` produced a row. |
| Stage change | `UPDATE matches SET stage=$new, "stageChangedAt"=now() WHERE id=$id AND stage=$expected`. 0 rows = 409 (someone else changed it). |
| Enqueue after write | Always enqueue after the DB commit. If enqueue fails, the row stays `UPLOADED`, and a "retry processing" endpoint re-enqueues it. *Ceiling:* transactional outbox, only if lost jobs actually happen. |

### 3.4 Authorization model

Two layers, both required:
1. **RBAC** (existing `authorize(resource, action)`): "can a recruiter create jobs at all?"
2. **Ownership** (new helpers in services): `getRecruiterContext(userId) → { companyId, isCompanyAdmin }` and `getCandidateId(userId)`. Every query is scoped by them (`WHERE companyId = ctx.companyId`). Return 404, not 403, for other people's resources (don't leak that they exist).

## 4. AI architecture

### 4.1 Resume pipeline (BullMQ job `resume-parse` → LangGraph)

```
START → loadPdf → extractText → guardText ──(too short / no text)──► markFailed("Scanned or empty PDF") → END
                                     │
                                     ▼
                           llmExtract (withStructuredOutput(zod))
                                     │ invalid output → 1 repair retry, then throw (BullMQ retries)
                                     ▼
                           normalizeSkills (slugify + alias map + upsert Skill)
                                     ▼
                           saveDraft (Resume.parsedData, status=PROCESSED, processedAt)
                                     ▼
                           notify(RESUME_PROCESSED) → END
```

- **A linear graph, on purpose.** LangGraph gives typed state, per-node logging and an obvious place to add branches later (OCR, language detection). Don't add agents or loops.
- **Text extraction:** `unpdf` (pure JS, no native deps, so it works in the read-only Alpine container). Truncate to ~30k characters before the LLM call.
- **Structured output:** a zod schema (zod is already a dependency) passed to `model.withStructuredOutput(schema)`:
  ```ts
  ResumeExtraction = z.object({
    headline: z.string().nullable(),
    summary: z.string().nullable(),
    location: z.string().nullable(),
    yearsOfExperience: z.number().min(0).max(60).nullable(),
    experienceLevel: z.enum(["INTERN","JUNIOR","MID","SENIOR","LEAD","EXECUTIVE"]).nullable(),
    skills: z.array(z.object({ name: z.string(), years: z.number().nullable() })).max(60),
    experiences: z.array(z.object({ company, title, location?, startDate?: "YYYY-MM", endDate?: "YYYY-MM"|null, description? })),
    educations: z.array(z.object({ institution, degree?, fieldOfStudy?, startDate?, endDate?, grade? })),
  })
  ```
  Dates come back as strings and are parsed in code (`YYYY-MM` → first of the month); unparseable → null. Never trust LLM dates directly.
- **The AI draft is not live data.** The worker only writes `Resume.parsedData`. Rows in `WorkExperience/Education/CandidateSkill` are written **when the candidate confirms** (T13). Bad extractions never reach matching without a human looking at them.

### 4.2 Job requirements

- **Phase 1:** the recruiter picks skills explicitly in the job form (autocomplete from `GET /skills?q=`, with free-text creating a normalized Skill) and marks each as required or nice-to-have. This is deterministic, testable, and needs no LLM.
- **Phase 2 (T16):** "Analyse description" enqueues an `extract-job` job; the worker extracts suggested skills, level and minimum years with structured output and pushes them over the socket. They're suggestions; the recruiter accepts or edits them. The explicit skill list stays the source of truth for matching.

### 4.3 Embeddings

- Model: `text-embedding-3-small` (1536), stored in `ai.*.model` so a later model change is detectable.
- **What text gets embedded** (`ai/embedText.ts`), deterministic and short:
  - Candidate: `headline · experienceLevel · yearsOfExperience · skills (sorted) · last 3 job titles + companies · summary (≤ 1000 chars)`
  - Job: `title · experienceLevel · workMode · required skills · nice-to-have skills · description (≤ 2000 chars)`
- Triggers (queue `embed`, jobId = `candidate:<id>` / `job:<id>` so duplicates collapse): candidate confirm or profile edit; job publish or edit of an OPEN job.
- Write: `INSERT INTO ai.job_embeddings ... ON CONFLICT (job_id) DO UPDATE`, then set `embeddedAt`.

### 4.4 Recommendation and scoring

Candidate feed (recruiter feed is symmetric, per job):

```sql
SELECT j.id, 1 - (je.embedding <=> ce.embedding) AS similarity
FROM jobs j
JOIN ai.job_embeddings je ON je.job_id = j.id
CROSS JOIN (SELECT embedding FROM ai.candidate_embeddings WHERE candidate_id = $1) ce
WHERE j.status = 'OPEN' AND j."deletedAt" IS NULL
  AND NOT EXISTS (SELECT 1 FROM swipes s
                  WHERE s."candidateId" = $1 AND s."jobId" = j.id AND s.side = 'CANDIDATE')
  AND ($2::"WorkMode" IS NULL OR j."workMode" = $2)
ORDER BY je.embedding <=> ce.embedding
LIMIT 50;
```

Then in TypeScript, for those ≤ 50 rows:
- `coverage = matchedRequiredSkills / requiredSkills` (1 if the job lists no required skills)
- **`score = 0.7 × similarity + 0.3 × coverage`**, re-sorted, top 20 returned
- `matchedSkills`, `missingSkills` come from the `JobSkill` ⨝ `CandidateSkill` slug join. **This is the match explanation on the card: deterministic, free, instant.**
- Recruiter feed: candidates who already **swiped RIGHT on this job are boosted to the top** (badge "Interested in this job"). This is what produces matches early.
- **Cold start:** no embedding yet → fall back to skill-overlap count + recency. The feed never comes back empty because of a missing embedding.
- *Ceiling:* HNSW + `WHERE` filters is post-filtering. Fine at MVP scale. If filtered feeds start returning too few rows, enable pgvector 0.8 `SET hnsw.iterative_scan = relaxed_order`.
- The score shown at swipe time is stored in `Swipe.score`, and copied to `Match.score` on match.

**Phase 2 (T19):** an LLM one-paragraph "why this fits" summary, generated **once per match** (queue `match-explain`) into `Match.explanation.summary`. It's never generated per feed card.

### 4.5 Workers, retries and failures

| Queue | Job id (dedupe) | Attempts | Backoff | On final failure |
|---|---|---|---|---|
| `resume-parse` | `resume:<resumeId>` | 3 | exponential, 10s base | `Resume.status=FAILED`, `error` = user-safe message, notify `RESUME_FAILED` |
| `embed` | `candidate:<id>` / `job:<id>` | 5 | exponential, 5s | log + leave `embeddedAt` null (the feed uses the cold-start fallback) |
| `match-explain` (Phase 2) | `match:<id>` | 3 | exponential | leave the summary empty; the card still shows skills |

- **Non-retryable errors** (no text in the PDF, file too big, invalid file): throw BullMQ `UnrecoverableError`. Don't waste retries.
- **Retryable:** provider 429/5xx, timeouts, invalid structured output after one repair attempt.
- Idempotency: every worker re-reads current DB state and is safe to run twice (upserts everywhere). `Resume.attempts` is incremented per run.
- Concurrency: `resume-parse` concurrency 2 (rate limits/cost), `embed` concurrency 5. BullMQ `limiter` caps provider calls.
- Graceful shutdown: `worker.close()` on SIGTERM, mirroring `server.ts`.
- Cost guard: input truncation + `checksum` dedupe (the same PDF re-uploaded skips the LLM call and copies `parsedData`).

## 5. Real-time (Socket.IO)

- Attached to the existing `http.Server` in `server.ts`, same port, path `/socket.io`.
- **Auth:** the client calls the existing `GET /api/auth/socket-ticket` and connects with `auth: { ticket }`. The handshake middleware verifies the ticket and sets `socket.data.userId`. An invalid ticket → `connect_error`.
- **Rooms:** `user:<userId>` (joined on connect) and `match:<matchId>` (joined via `chat:join` **after a participant check**).
- **Events:**

| Direction | Event | Payload |
|---|---|---|
| server → client | `notification` | Notification row |
| client → server | `chat:join` / `chat:leave` | `{ matchId }` |
| client → server | `message:send` (with ack) | `{ matchId, body, clientId }` → ack `{ ok, message }` |
| server → client | `message:new` | Message row |
| client → server | `message:read` | `{ matchId, upToMessageId }` |

- Message flow: validate (zod, 1–4000 chars) → participant check → insert Message + update `Match.lastMessageAt` → emit `message:new` to `match:<id>` → if the recipient isn't in the room, create a `NEW_MESSAGE` notification. The client's `clientId` dedupes optimistic UI.
- History: `GET /api/matches/:id/messages?cursor=<messageId>&limit=30` (index `[matchId, createdAt desc]` exists).
- Reconnect: socket.io-client auto-reconnects. On reconnect the client fetches a new ticket, refetches unread notifications and the last page of open chats. No missed-event replay system is needed.

## 6. File storage

- `lib/s3.ts` with `@aws-sdk/client-s3`. `S3_ENDPOINT` + `forcePathStyle: true` for floci locally; unset in prod.
- **Upload through the API** (multer memory storage, 5 MB limit), not presigned PUT. This lets us check the `%PDF-` magic bytes, compute sha256 and dedupe in one place. A 5 MB in-memory buffer is fine for one API instance.
- Keys: `resumes/<candidateId>/<uuid>.pdf`, `logos/<companyId>/<uuid>.<ext>`. **Store keys, never URLs** (the schema already does).
- Download: short-lived presigned GET (5 min), only for the owning candidate or a recruiter who has a match with that candidate.
- The bucket is private. No public ACLs.

## 7. Frontend architecture

- Next.js App Router, **client-side data fetching** (auth lives in httpOnly cookies on the API origin; same origin in prod via Caddy).
- `lib/api.ts`: a `fetch` wrapper with `credentials: "include"`. On `401 TOKEN_EXPIRED` → `POST /auth/refresh-token` once → retry. One in-flight refresh at a time.
- TanStack Query for server state (caching, invalidation after swipe/confirm, loading/error states). No global state library beyond a small auth context fed by `/auth/me`.
- Route groups: `(auth)`, `(candidate)`, `(recruiter)`, `(admin)`. Each group layout checks the role from `/auth/me` and redirects otherwise.
- Forms: native `<form>` + zod (the same schemas as the backend where practical). No form library.
- Swipe: pointer events + CSS transforms, **plus Left/Right buttons and ←/→ keys** (accessibility and desktop). No animation library.
- Mobile-first Tailwind. Every page is designed at 375px first.

## 8. Infrastructure

**Dev (`docker-compose.dev.yml`), add:**
- `floci` service (S3 emulator) + a one-shot bucket-creation step.
- `worker` service: same build target `dev`, command `npm run dev:worker` (`tsx watch src/worker.ts`).

**Prod (`docker-compose.yml`), add:**
- `worker` service: target `runner`, `CMD ["node","dist/worker.js"]`, same hardening. **Networks: `data` + an egress network** (`web` or a new `egress`). `data` is `internal: true`, so the worker can't reach the LLM API or S3 without this.
- New env vars for backend + worker: `S3_BUCKET, S3_REGION, S3_ENDPOINT (dev only), AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, LLM_MODEL, LLM_API_KEY (provider-specific name), EMBEDDING_MODEL, OPENAI_API_KEY`. All are validated in `config/env.ts` (the existing zod pattern).
- Caddy in front: `/api/*` and `/socket.io/*` → backend:4000, everything else → frontend:3000. One origin means no CORS or cookie-domain problems.
- Backups: a nightly `pg_dump` cron to S3 (one shell line in crontab on the VPS).

## 9. New dependencies (justified)

| Package | Where | Why |
|---|---|---|
| `bullmq` | backend | Queue (already the chosen stack); uses the existing Redis |
| `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` | backend | S3 put/get + presigned download |
| `multer` (+ types) | backend | Multipart PDF upload with a size limit |
| `unpdf` | backend | PDF → text, pure JS |
| `@langchain/core`, `@langchain/langgraph`, `@langchain/openai` (+ the chat provider package) | backend | The chosen AI stack |
| `socket.io` / `socket.io-client` | backend / frontend | Real-time |
| `vitest`, `supertest` | backend (dev) | Tests (none exist today) |
| `@tanstack/react-query` | frontend | Server-state caching and invalidation; replaces hand-written loading/refetch logic |
| `@playwright/test` | frontend (dev, Phase 2) | E2E happy path + accessibility checks |

Not added: an ORM for vectors, a form library, an animation library, a state manager, Redux, a UI kit, a separate AI service.

## 10. Later-phase additions (Phases 2–5)

Details and acceptance criteria are in IMPLEMENTATION_PLAN.md. This section lists what changes in the architecture.

### 10.1 New tables

| Phase | Model | Purpose / key constraints |
|---|---|---|
| 2 | `User.emailVerifiedAt`, `EmailToken{ userId, type VERIFY\|RESET, tokenHash @unique, expiresAt, usedAt }` | Verification + password reset. Only the sha256 hash of the token is stored |
| 2 | `NotificationPreference{ userId, type, email, inApp }` `@@unique([userId, type])` | Per-type email/in-app opt-out |
| 2 | `CompanyInvite{ companyId, email, tokenHash @unique, invitedById, expiresAt, acceptedAt }` | Team invites |
| 3 | `Company.verifiedAt`, `Company.verificationDomain` | Verified badge |
| 3 | `Report{ reporterId, targetType, targetId, reason, details, status, handledById }` `@@index([status, createdAt])` | Moderation queue |
| 3 | `Block{ blockerId, blockedId }` `@@unique([blockerId, blockedId])` | Feed/chat exclusion, checked in **both directions** |
| 3 | `CandidateProfile.visibility`, `hiddenFromCompanyDomains String[]` | Privacy controls |
| 3 | `AuditLog{ actorId, action, targetType, targetId, before, after, createdAt }` | Append-only admin log |
| 4 | `SwipeDirection.SUPER` (enum value) | Super-likes; matching treats SUPER as RIGHT |
| 4 | `SavedFilter{ userId, name, criteria Json }`, `AlertSubscription{ userId, frequency, savedFilterId?, minScore, lastSentAt }` | Saved filters + job alerts |
| 4 | `Interview{ matchId, proposedById, slots Json, selectedSlot, durationMin, location, status, timezone }` | Scheduling. All times in UTC |
| 4 | `MessageTemplate{ companyId, name, body }` | Recruiter templates |
| 4 | `CandidateInsight{ candidateId @unique, data Json, generatedAt }` | Cached skill-gap advice |
| 5 | `OAuthAccount{ userId, provider, providerUserId }` `@@unique([provider, providerUserId])` | Google/LinkedIn login. `User.password` becomes nullable |
| 5 | `PushSubscription{ userId, endpoint @unique, keys Json }` | Web push |

### 10.2 New queues

| Queue | Phase | Notes |
|---|---|---|
| `email` | 2 | 5 attempts; every email goes through it (never sent inside a request) |
| `extract-job` | 2 | Job description → suggested skills/level |
| `match-explain` | 2 | One summary per match |
| `notify-delayed` | 2 | "Unread message" email after 10 min, cancelled when read (delayed job with a known id) |
| `interview-reminder` | 4 | Delayed jobs at −24h / −1h, removed on cancel/reschedule |
| `insights` | 4 | Weekly skill-gap advice (repeatable job) |
| `job-alerts` | 4 | Daily/weekly digests (repeatable job) |
| `ocr` (or a node inside the resume graph) | 5 | tesseract.js, concurrency 1 (CPU heavy) |

### 10.3 Cross-cutting rules that arrive with later phases
- **Blocks and privacy apply everywhere.** Feeds, chat, notifications, alerts, search and super-likes all go through one `visibilityFilter(viewerId)` helper (Phase 3), so a new feature can't forget them.
- **Unverified email** (Phase 2): can browse, can't swipe or message.
- **Every admin action** writes an AuditLog row (Phase 3) inside the same transaction as the change.
- **i18n** (Phase 5): the backend returns stable error codes (`JOB_NOT_OPEN`); the frontend owns the text.
- **Scaling** (Phase 5): the custom Redis `notify` relay is replaced by `@socket.io/redis-adapter`; Caddy gets sticky sessions; API and worker run as multiple replicas.

### 10.4 Later-phase dependencies

| Package | Phase | Why |
|---|---|---|
| `@aws-sdk/client-sesv2` | 2 | Sending email via SES (same AWS account as S3) |
| Mailpit (Docker image, dev only) | 2 | Catches dev emails |
| `ics` | 4 | Generating calendar invites |
| `tesseract.js` (+ a PDF-to-image renderer) | 5 | OCR in TypeScript, no Python |
| `arctic` | 5 | OAuth 2.0/OIDC flows for Google and LinkedIn |
| `web-push` | 5 | Web Push with VAPID |
| `next-intl` | 5 | i18n for Next.js |
| `@axe-core/playwright` | 5 | Accessibility checks |
| Sentry SDK (or self-hosted equivalent), `@bull-board/express` | 5 | Error tracking, queue dashboard |
| `@socket.io/redis-adapter` | 5 | Multiple API instances |
| `autocannon` or k6 | 5 | Load testing |
