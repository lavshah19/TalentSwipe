# TalentSwipe: Scope and Risks

## 1. Scope principle

**Nothing is removed.** Every feature from PROJECT.md and its roadmap ideas is in the plan, assigned to a phase. The timeline follows the scope (≈ 25 weeks full-time, see PROJECT_ROADMAP §1), not the other way around.

Phases decide **when**, not **whether**.

## 2. Full feature list by phase

### Phase 1: Core MVP (v0.1, W1–W8)
- Role-aware sign-up (JOB_SEEKER / RECRUITER), JWT auth (exists), RBAC + ownership checks
- Company profile create/edit (creator = company admin)
- Job management with skills, DRAFT/OPEN/PAUSED/CLOSED
- Candidate profile, PDF resume upload to S3, resume history (active resume)
- Async AI resume extraction (LangGraph + BullMQ) → candidate review → confirm
- Embeddings + pgvector recommendations for both sides, with score, matched/missing skills, basic filters
- Swipe left/right on both sides, race-safe mutual match
- In-app notifications (persisted + live): resume processed/failed, new match, new message, stage changed
- Real-time chat per match, with history and read receipts
- Recruitment pipeline stages + the candidate's application tracker
- Mobile-first responsive UI for all of the above
- Tests in CI, production deploy with TLS, backups

### Phase 2: Complete product (v0.2, W9–W13)
- Email infrastructure (AWS SES, Mailpit in dev), email notifications with per-user preferences + unsubscribe
- Email verification + password reset
- Admin dashboard: users (search, deactivate, change role), jobs (close), platform stats
- Recruiter analytics per job: right swipes received, matches, stage funnel, time to match
- Company team: invite recruiters by email, accept flow, remove members, transfer admin
- AI job description extraction: suggested skills, level and minimum years from the description text
- AI "why this fits" summary per match (alongside the deterministic matched/missing skills)
- Drag-and-drop kanban pipeline (the dropdown stays for mobile/accessibility)
- Swipe undo (5s window, only when no match was created)
- Company logo + user avatar upload
- Playwright end-to-end tests in CI, rich demo seed data

### Phase 3: Trust & safety (v0.3, W14–W16, public launch)
- Company verification: work-email domain check + admin approval → verified badge
- Report users/jobs/messages + block users; admin moderation queue with actions
- Privacy controls: hide profile from your current employer (blocked company domains), profile visibility, "open to work" toggle visibility
- Anti-spam rules: new-account limits, link filtering in first messages, duplicate job detection
- Account deletion (soft delete + anonymization) and personal data export (JSON)
- Admin audit log

### Phase 4: Engagement (v0.4, W17–W20)
- Profile strength meter + onboarding checklist
- Advanced filters (salary range, location, employment type, company size) + saved filters
- Super-likes ("priority interest") with daily limits
- Message templates for recruiters
- Interview scheduling: recruiter proposes time slots, candidate picks one, .ics invites, reminder emails/notifications
- AI intro / cover note drafted from the match explanation, editable before sending
- Skill-gap advice: "learning X would raise your match rate for Y jobs"
- Job alerts digest (daily/weekly email of new high-scoring jobs)

### Phase 5: Platform & scale (v1.0, W21–W25)
- OCR for scanned/image resumes
- Google + LinkedIn login (OAuth)
- PWA (installable) + web push notifications
- Dark mode
- Internationalization (i18n)
- Accessibility audit (WCAG 2.1 AA) + fixes
- Observability: error tracking, metrics, BullMQ dashboard, uptime alerts
- Load testing + performance tuning
- CI/CD: auto-deploy to staging on merge, manual promote to prod
- Horizontal scaling readiness (Socket.IO Redis adapter, multiple API + worker instances)

## 3. Not requested, so not estimated

These were never asked for. If you want any of them, each gets an estimate and a phase:

| Feature | Rough size |
|---|---|
| Payments / recruiter subscriptions (Stripe) | 2–3 weeks |
| Native mobile apps (React Native) | 8–12 weeks |
| Video interviews in-app | 3–4 weeks (or embed a third-party link: 2 days) |
| Recruiters belonging to multiple companies | 1–2 weeks (schema change: `RecruiterProfile.userId` is unique today) |
| Public job board pages with SEO | 1 week |

**Change control:** a new idea gets written here with a rough size, then assigned to a phase. That moves the release dates, and that's fine as long as it's a conscious decision.

## 4. Risk register

Likelihood / Impact: H / M / L. "Phase" = when the risk is live.

| # | Risk | Phase | Impact | Likelihood | Prevention | Fallback |
|---|---|---|---|---|---|---|
| R1 | **Long project → motivation drops, progress stalls** (25 weeks solo) | All | H | **H** | A deployed release every 3–5 weeks; real beta users from week 8 give feedback and motivation; weekly demo even if only to yourself | Stop at any release: each is a complete, working product |
| R2 | **Estimates are wrong** (first-time use of LangGraph, BullMQ, Socket.IO) | 1 | M | H | ×1.3 factor + weekly buffer day; re-estimate at every phase end | Move dates, keep the phase order |
| R3 | **LLM extraction quality is poor** (dates, merged jobs, junk skills) | 1 | H | M | zod-validated structured output, skill alias map, code-side date parsing, 10-resume eval in W3 | The candidate review screen corrects it; tune prompts during W8 stabilization |
| R4 | **Scanned PDFs have no text** | 1–4 | M | M | Detect early, fail without retries, show a clear message | OCR arrives in Phase 5 (T45). Move it earlier if beta users hit this often |
| R5 | **LLM cost grows** with match summaries, skill-gap advice, intro notes | 2, 4 | M | M | Generate once and cache (per match / per week), truncate input, checksum dedupe, BullMQ limiter, track monthly cost | Switch to a cheaper model via `LLM_MODEL`; compute skill-gap advice without the LLM |
| R6 | **Provider/API keys not ready** | 1 | H | L | Get keys in week 1. The fake models let pipeline code be written without keys | Build on fakes, plug the key in later |
| R7 | **Embedding dimension lock-in** (1536) | All | M | L | Keep `text-embedding-3-small`; store `model` per row | New column + re-embed job |
| R8 | **pgvector filtered search slow or sparse** (worse once advanced filters arrive) | 1, 4 | M | M | Fetch 50, re-rank in TS; benchmark at 1k/1k in W4 and 50k/50k in Phase 5 | `hnsw.iterative_scan = relaxed_order` (pgvector 0.8), or partial indexes for hot filters |
| R9 | **Match race condition** | 1 | H | M | Commit swipe → check → `INSERT … ON CONFLICT DO NOTHING`; the concurrency test is a release gate | The unique constraint prevents duplicates regardless |
| R10 | **Socket.IO/cookies break in prod** | 1 | H | M | One origin via Caddy; tested on staging in W5 | Long-polling fallback; notifications via REST polling |
| R11 | **Worker has no internet in prod** (`data` network is internal) | 1 | H | H if missed | Worker on an egress network (T05), verified on staging in W2 | Put the worker on the `web` network |
| R12 | **Email lands in spam** | 2+ | H | M | SES with SPF, DKIM, DMARC on your domain; plain templates; request SES production access early (approval can take days) | In-app notifications still work; resend from the admin panel |
| R13 | **LinkedIn OAuth app approval delays** | 5 | L | M | Apply when Phase 4 starts | Ship Google login first, LinkedIn when approved |
| R14 | **Authorization hole** (a recruiter sees another company's data; a blocked user can still message) | All | H | M | Ownership helpers everywhere; table-driven authz sweep test, extended every phase (blocks, privacy, team roles) | The sweep blocks release |
| R15 | **Privacy / legal** (resumes are personal data; deletion requests) | 1–3 | H | M | Private S3, short presigned URLs, no PII in logs (Phase 1); deletion + export in Phase 3 *before* public launch; write a privacy policy | Don't open publicly until Phase 3 ships |
| R16 | **Prompt injection via resume text** | 1+ | L | M | Resume passed as data with an "ignore embedded instructions" system rule; zod-validated output; human confirm step | Output can only fill profile fields |
| R17 | **Abuse once public** (spam recruiters, fake companies) | 3+ | H | M | Phase 3 lands before public launch: verification, report/block, rate limits | Admin can deactivate accounts and close jobs (Phase 2) |
| R18 | **Dependency drift** over 6 months (Next.js, Prisma, LangChain move fast) | All | M | M | Pin versions; upgrade deliberately once per phase in the buffer day; CI catches breaks | Stay on the pinned version until the phase ends |
| R19 | **Deployment surprises** | 1 | H | M | Staging from W2, redeployed weekly | Staging is the prod candidate |
| R20 | **Lost background jobs** (Redis restart, enqueue after a failed commit) | All | M | L | Redis AOF (exists), enqueue after commit, jobs keyed by entity id | "Retry processing" endpoint; Phase 5 queue dashboard shows stuck jobs |

## 5. Never compromise, in any phase
Authorization checks · upload validation · race-safe match creation · AI failure handling · tests in CI · backups · no PII in logs.
