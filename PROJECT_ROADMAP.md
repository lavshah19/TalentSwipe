# TalentSwipe: Full Product Roadmap

> Companion docs: [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md) (how it's built) · [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) (every task with acceptance criteria) · [TESTING_STRATEGY.md](TESTING_STRATEGY.md) (how we prove it works) · [RISK_AND_SCOPE.md](RISK_AND_SCOPE.md) (full feature list + risks)

**Approach:** no feature is removed. The whole product is estimated honestly and split into **5 phases**, each ending in a working, deployed release. The order is chosen by dependencies and risk, not by a deadline.

## 1. Estimate

### How it was calculated
1. Every task was estimated in **ideal dev-days** (focused work, including writing its tests). Details are in IMPLEMENTATION_PLAN.md.
2. A **×1.3 realism factor** was applied for learning new libraries (LangGraph, BullMQ, Socket.IO), integration bugs, code review and rework.
3. One **buffer/review day per week** is built in (tests catch-up, refactoring, deploys, demos).

| Phase | What it delivers | Ideal days | Realistic days | Weeks (full-time) |
|---|---|---|---|---|
| **1. Core MVP** | The full hiring loop: profiles, AI resume extraction, matching, swipe, match, chat, pipeline | 27.5 | ~36 + 4 stabilization | **8** (W1–W8) |
| **2. Complete product** | Admin, analytics, team invites, email + password reset, AI job extraction, AI match summaries, drag-and-drop pipeline, undo, E2E tests | 17.5 | ~23 | **5** (W9–W13) |
| **3. Trust & safety** | Company verification, report/block, moderation, privacy controls, anti-spam, account deletion + data export, audit log | 8.5 | ~11 + 2 launch prep | **3** (W14–W16) |
| **4. Engagement** | Profile strength meter, advanced + saved filters, super-likes, message templates, interview scheduling, AI intro notes, skill-gap advice, job alerts | 13 | ~17 | **4** (W17–W20) |
| **5. Platform & scale** | OCR, Google/LinkedIn login, PWA + web push, dark mode, i18n, accessibility, observability, load testing, CI/CD, horizontal scaling, v1.0 hardening | 15 | ~20 + 5 hardening | **5** (W21–W25) |
| **Total** | | **~82** | **~118** | **≈ 25 weeks** |

Realistic days = ideal × 1.3 (this includes the weekly buffer day), plus the stabilization/launch/hardening time shown.

### Bottom line
| Your availability | Calendar time to v1.0 |
|---|---|
| Full-time (5 days/week, ~6 focused hours/day) | **~6 months (25 weeks)** |
| Part-time (~20 hours/week) | **~12 months** |
| Evenings/weekends (~10 hours/week) | **~2 years**. Consider stopping at v0.4 for a strong portfolio project |

The first usable version (v0.1, the full core loop) arrives at **week 8 full-time / ~4 months part-time**.

## 2. Assumptions
- **A1.** One developer working full-time. All estimates scale linearly for part-time.
- **A2.** Embeddings: OpenAI `text-embedding-3-small` (the schema fixes the dimension at 1536). The chat/extraction LLM is any LangChain chat model with structured output, chosen by env var. **API keys are needed by week 3.**
- **A3.** Email: AWS SES in prod (we're already on AWS for S3), Mailpit container in dev.
- **A4.** Deploy target: one Linux VPS with the existing Docker Compose + Caddy (TLS) + AWS S3. Phase 5 prepares for multiple instances.
- **A5.** v0.1–v0.2 go to **invited beta users**. **Public launch at v0.3** (trust & safety in place).
- **A6.** Only features requested so far are estimated. Payments, native mobile apps, video interviews etc. aren't in the estimate (see RISK_AND_SCOPE §3).

## 3. Repo audit (starting point, 2026-11-28)

| Area | State |
|---|---|
| Prisma schema | **~85% of the core done**: Company, RecruiterProfile, CandidateProfile, Resume (versioned), WorkExperience, Education, Skill, CandidateSkill, JobSkill, Job, Swipe, Match (= application + pipeline stage), Message. Missing: Notification, plus later-phase tables. |
| pgvector | Done: `ai.candidate_embeddings` / `ai.job_embeddings` (1536, HNSW cosine). |
| Auth | Done: JWT cookies, refresh tokens, `/auth/me`, `/auth/socket-ticket`. Missing: email verification, password reset (Phase 2). |
| RBAC | **Blocker:** RECRUITER and JOB_SEEKER have empty permissions, and the seed never updates them. |
| Sign-up | **Blocker:** everyone becomes JOB_SEEKER; there's no recruiter sign-up. |
| Queue / S3 / AI / Socket.IO / tests | Not installed yet. |
| Docker | Good dev + prod setup. Needs a worker service, floci, Mailpit. The prod `data` network is internal-only, so the worker also needs an egress network. |
| Frontend | Empty Next.js 16 + Tailwind 4. |

## 4. Why the phases are in this order

1. **Core MVP first.** Every other feature (admin, alerts, scheduling, moderation) operates on profiles, jobs, matches and messages. Building it first also burns down the biggest technical risk (AI + vectors) early.
2. **Complete product second.** Admin and email are operational must-haves before more people use it: you can't run a beta without password reset or a way to manage users.
3. **Trust & safety before engagement.** Public users need reporting, blocking, verification and privacy *before* features that increase activity. Growth features without moderation create problems faster.
4. **Engagement fourth.** These features improve retention but depend on a stable core plus email (alerts, scheduling invites).
5. **Platform & scale last.** OCR, OAuth, i18n, PWA and scaling are valuable but don't change the product's core. They're optimizations once real usage shows where they matter.

## 5. Releases and milestones

| Release | Week | Audience | Definition of Done |
|---|---|---|---|
| **v0.1 Core MVP** | W8 | Invited beta (5–20 users) | The full 13-step hiring flow works on prod · CI green · core release gate passes (TESTING_STRATEGY §6) |
| **v0.2 Complete** | W13 | Wider beta | Admin can manage users/jobs · password reset + email verification · emails delivered (SPF/DKIM) · Playwright E2E in CI |
| **v0.3 Trust** | W16 | **Public launch** | Report/block + moderation queue live · verified companies · privacy controls · account deletion + export |
| **v0.4 Engagement** | W20 | Public | Interview scheduling end-to-end · job alerts sent on schedule · super-likes enforced · skill-gap advice shown |
| **v1.0** | W25 | Public | OAuth, PWA/push, OCR, i18n live · load test targets met · monitoring + alerts · security review passed |

## 6. Week-by-week schedule

Day 5 of each week = buffer/review (tests, refactor, deploy, demo). Task IDs refer to IMPLEMENTATION_PLAN.md.

### Phase 1: Core MVP (Weeks 1–8)

| Day | Work | Check at end of day |
|---|---|---|
| **W1 D1** | T01 permissions catalog + seed sync · T02 role-aware sign-up | A recruiter can register; RBAC tests pass |
| D2 | T03 Vitest + Supertest, test DB, CI test job | `npm test` green in CI |
| D3 | T04 Notification model + ownership helpers · T05 floci, worker service, env vars | Migration applied; floci bucket reachable |
| D4 | T06 Company API | Company tests pass |
| D5 | Buffer/review · Week-1 demo | |
| **W2 D1** | T07 skill normalization + autocomplete · T08 jobs (CRUD) | Draft job with skills saved |
| D2 | T08 (publish/pause/close) · T09 candidate profile | Transitions tested |
| D3 | T10 S3 resume upload | PDF in floci; Resume = UPLOADED |
| D4 | Q01 deploy skeleton to staging · T11 BullMQ worker | Staging URL live; worker processes a test job |
| D5 | Buffer/review | |
| **W3 D1–D2** | T12 LangGraph resume pipeline | Real resume → valid `parsedData` |
| D3 | T13 review + confirm API | Confirm is atomic |
| D4 | T14 embeddings | Rows in `ai.*_embeddings` |
| D5 | Buffer · **AI eval on 10 real resumes** | ≥ 8/10 usable |
| **W4 D1–D2** | T15 recommendation feeds (both sides) | Ranked feeds with score + skills |
| D3 | T17 swipe + mutual match | Concurrency test passes |
| D4 | T18 match APIs · T22 pipeline stages | Transition table tested |
| D5 | Buffer/review | |
| **W5 D1** | T20 Socket.IO + live notifications | Worker event reaches the browser |
| D2 | T21 chat | Two clients chat live |
| D3–D4 | F01 frontend shell + auth · F03 start | Login/register in the UI |
| D5 | Buffer · redeploy staging | |
| **W6 D1** | F03 recruiter company + jobs | Recruiter publishes a job in the UI |
| D2–D4 | F02 candidate onboarding + resume review | Upload → processed → confirm in the UI |
| D5 | Buffer/review | |
| **W7 D1–D2** | F04 swipe deck (both sides) | Swipe by touch, mouse, keys |
| D3 | F05 matches + chat + notification bell | Chat in the UI |
| D4 | F06 pipeline view + application tracker · Q04 security pass | Stage change visible to both sides |
| D5 | Buffer/review | |
| **W8 D1** | Q06 production deploy, backups, smoke test | Prod serves the full flow |
| D2 | **v0.1 release gate** · invite beta users | Gate passes |
| D3–D5 | Stabilization: fix beta bugs, watch logs, tune AI prompts | No open P0 bugs |

### Phase 2: Complete product (Weeks 9–13)

| Week | Work (in order) |
|---|---|
| **W9** | T26 email infrastructure (SES/Mailpit, email queue, templates) · T38 email verification + password reset · T27 email notifications + preferences |
| **W10** | T23 admin API · F07 admin UI |
| **W11** | T25 company team invites + member management · T16 AI job description extraction |
| **W12** | T19 LLM match summaries · T24 + F08 recruiter analytics · T28 swipe undo · T29 logo/avatar upload |
| **W13** | F09 drag-and-drop pipeline · Q03 Playwright E2E in CI · Q05 demo seed · **v0.2 release** |

### Phase 3: Trust & safety (Weeks 14–16)

| Week | Work |
|---|---|
| **W14** | T39 company verification (domain email + admin approval + badge) · T40 report/block + moderation queue |
| **W15** | T41 privacy controls (hide from current employer, profile visibility) · T42 anti-spam rules · T44 admin audit log |
| **W16** | T43 account deletion + data export · trust & safety test sweep · privacy policy + terms pages · **v0.3 public launch** |

### Phase 4: Engagement (Weeks 17–20)

| Week | Work |
|---|---|
| **W17** | T30 profile strength meter + onboarding checklist · T31 advanced + saved filters · T32 super-likes with daily limits |
| **W18** | T33 interview scheduling (slots, .ics, reminders) |
| **W19** | T34 message templates · T35 AI intro/cover note · T36 skill-gap advice |
| **W20** | T37 job alerts digest · engagement test sweep · **v0.4 release** |

### Phase 5: Platform & scale (Weeks 21–25)

| Week | Work |
|---|---|
| **W21** | T45 OCR for scanned resumes · T46 Google + LinkedIn login |
| **W22** | T47 PWA + web push notifications · T48 dark mode · T50 accessibility audit + fixes |
| **W23** | T49 i18n (frontend + backend message codes) · T51 observability (error tracking, metrics, queue dashboard, uptime alerts) |
| **W24** | T52 load testing + performance tuning · T53 CI/CD auto-deploy · T54 horizontal scaling readiness |
| **W25** | Final security review · full regression · docs · **v1.0 release** |

## 7. Progress checkpoints

At the end of every phase:
1. Compare actual vs estimated days and **re-estimate the remaining phases** using your real speed. This is the main way the estimate gets more accurate.
2. Run the phase release gate (TESTING_STRATEGY §6).
3. Re-check the risk register (RISK_AND_SCOPE §4).
4. Update the "Status" section in PROJECT.md.

If a phase runs over, **move the release date, not the features**. Re-ordering within the next phase is fine; silently dropping something isn't.
