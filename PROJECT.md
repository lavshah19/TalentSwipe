# TalentSwipe

> Discover talent. Swipe. Connect.

An AI-powered, two-sided hiring marketplace where recruiters discover candidates and job seekers discover relevant opportunities through intelligent matching and mutual interest. Think "Tinder for hiring".

> Living doc: this is the basic idea only. More will be added later.

## Roles

| Role | Does |
|------|------|
| `ADMIN` | Manages the entire platform |
| `RECRUITER` | Creates company + job postings, discovers candidates, hires |
| `JOB_SEEKER` | Uploads resume, discovers jobs, applies |

## How it works

### Job seeker
1. Register and create a profile.
2. Upload resume (PDF).
3. AI extracts skills, education, experience.
4. AI recommends relevant jobs.
5. Swipe right (interested) or left (skip).
6. Both sides swipe right -> **match**.

### Recruiter 
1. Register and create a company profile.
2. Post job vacancies (required skills, experience). A company can have **many jobs**.
3. AI recommends suitable candidates.
4. Swipe right or left on candidates.
5. Mutual interest -> **match**.
6. Chat with candidates and manage applications.

## AI

- **LangChain.js** (`@langchain/*`): resume analysis, structured extraction, LLM integration, embeddings.
- **LangGraph.js** (`@langchain/langgraph`): orchestrating multi-step AI workflows.
- **Vector similarity (pgvector)**: match resumes with job descriptions.
- **Match explanations**: why a candidate fits a job, and which skills are missing.

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js + TypeScript |
| Backend | Node.js + Express + TypeScript |
| AI | TypeScript, inside the Node backend (no Python, no separate AI service) |
| AI framework | LangChain.js + LangGraph.js |
| Database | PostgreSQL |
| Vector search | pgvector |
| ORM | Prisma |
| Cache / Queue | Redis + BullMQ |
| Real-time chat | Socket.IO |
| File storage | S3 (floci locally, AWS S3 in prod) |
| DevOps | Docker |

## Domain decisions

- Company 1—N Recruiters (team accounts).
- Company 1—N Jobs (a recruiter/company posts many jobs).
- Job seeker interacts with many jobs (many swipes/applications).
- Swipe is per **(candidate, job)** pair; a **match = candidate + job**. The same candidate can match different jobs.
- **All TypeScript, no Python.** AI runs with LangChain.js/LangGraph.js in the Node codebase.
- **Background jobs use BullMQ + Redis, not SQS + Lambda.** Redis is already running, the servers are long-lived, and local dev stays a single container. Flow: upload PDF to S3, enqueue a BullMQ job, a worker runs the LangGraph pipeline, the result goes to Postgres/pgvector, and Socket.IO notifies the user. Floci is used only to emulate S3 locally.

## Status

- Done: Prisma + PostgreSQL, user model + migrations, JWT auth, authorization, demo user seeding (`backend/`).
- Todo: company/job/resume models, swipe + match, AI service, chat, frontend, Docker. Then see Roadmap.

## Roadmap / feature ideas

All of these are planned and scheduled. Full phased plan (~25 weeks full-time): see [PROJECT_ROADMAP.md](PROJECT_ROADMAP.md).

### Tier 1: UX wins (cheap with the current stack)
1. **Match score + "why" on every card**: % fit, top matching skills, missing skills, shown before the swipe.
2. **Undo last swipe** (5–10s window): delete the Swipe if no Match exists yet.
3. **Filters on the AI feed**: work mode, salary, location, experience level.
4. **Real-time notifications**: new match, new message, resume processed (Socket.IO + email when offline).
5. **AI profile autofill + review screen**: the user checks and edits the extracted skills, experience and education.
6. **Profile strength meter / onboarding checklist**: nudges users to complete their profile.

### Tier 2: Recruiter productivity
7. **Kanban pipeline per job** using `MatchStage` (matched → interviewing → offer → hired/rejected).
8. **AI job description writer**: title + bullets → full JD + required skills.
9. **Message templates + interview scheduling** (time-slot link or .ics invite in chat).
10. **Super-like / priority interest**, limited per day.

### Tier 3: Job seeker value
11. **Skill gap advice**: "learn TypeScript → match 85% of React jobs".
12. **AI intro / cover note**, built from the match explanation and editable before sending.
13. **Application status tracker**: every match and its stage on one page.
14. **Job alerts**: daily/weekly email of new jobs above a match threshold (BullMQ repeatable job).

### Tier 4: Trust, safety, admin
15. **Company verification badge** (email domain) + **report/block user**.
16. **Admin dashboard**: users, jobs, matches/day, flagged content.
17. **Privacy controls**: hide profile from current employer, "open to work" visibility.
18. **Rate limiting + spam checks on messages** (Redis).

### Platform polish
- Mobile-first / PWA swipe UI, gestures + keyboard shortcuts (← →).
- Dark mode; swipe buttons as an accessible alternative to gestures.
- i18n later, if needed.

### Recommended order
Every item here has a phase and task ID in [PROJECT_ROADMAP.md](PROJECT_ROADMAP.md) and [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). Nothing is dropped.

## TBD

- (add later)
