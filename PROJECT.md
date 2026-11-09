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

- **LangChain**: resume analysis, structured extraction, LLM integration, embeddings.
- **LangGraph**: orchestrating multi-step AI workflows.
- **Vector similarity (pgvector)**: match resumes with job descriptions.
- **Match explanations**: why a candidate fits a job, and which skills are missing.

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js + TypeScript |
| Backend | Node.js + Express + TypeScript |
| AI service | Python + FastAPI |
| AI framework | LangChain + LangGraph |
| Database | PostgreSQL |
| Vector search | pgvector |
| ORM | Prisma |
| Cache / Queue | Redis + BullMQ |
| Real-time chat | Socket.IO |
| File storage | S3-compatible storage |
| DevOps | Docker |

## Domain decisions

- Company 1—N Recruiters (team accounts).
- Company 1—N Jobs (a recruiter/company posts many jobs).
- Job seeker interacts with many jobs (many swipes/applications).
- Swipe is per **(candidate, job)** pair; a **match = candidate + job**. The same candidate can match different jobs.

## Status

- Done: Prisma + PostgreSQL, user model + migrations, JWT auth, authorization, demo user seeding (`backend/`).
- Todo: company/job/resume models, swipe + match, AI service, chat, frontend, Docker.

## TBD

- (add later)
