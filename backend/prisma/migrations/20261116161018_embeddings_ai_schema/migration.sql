/*
  Warnings:

  - You are about to drop the column `embedding` on the `candidate_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `embedding` on the `jobs` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "candidate_profiles_embedding_hnsw";

-- DropIndex
DROP INDEX "jobs_embedding_hnsw";

-- AlterTable
ALTER TABLE "candidate_profiles" DROP COLUMN "embedding";

-- AlterTable
ALTER TABLE "jobs" DROP COLUMN "embedding";

-- Embeddings live outside `public` so Prisma never diffs (and drops) the HNSW indexes.
CREATE SCHEMA IF NOT EXISTS ai;

CREATE TABLE ai.candidate_embeddings (
    candidate_id TEXT PRIMARY KEY REFERENCES public.candidate_profiles(id) ON DELETE CASCADE,
    embedding    vector(1536) NOT NULL,
    model        VARCHAR(100) NOT NULL,
    updated_at   TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX candidate_embeddings_hnsw ON ai.candidate_embeddings USING hnsw (embedding vector_cosine_ops);

CREATE TABLE ai.job_embeddings (
    job_id     TEXT PRIMARY KEY REFERENCES public.jobs(id) ON DELETE CASCADE,
    embedding  vector(1536) NOT NULL,
    model      VARCHAR(100) NOT NULL,
    updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX job_embeddings_hnsw ON ai.job_embeddings USING hnsw (embedding vector_cosine_ops);
