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
- **Vector simila           → Socket.IO tells the user "resume processed"rity (pgvector)**: match resumes with job descriptions.
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
- Todo: company/job/resume models, swipe + match, AI service, chat, frontend, Docker.

## TBD

- (add later)
