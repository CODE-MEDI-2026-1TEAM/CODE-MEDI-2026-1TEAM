-- Add SimulationRAG mapping columns to Case
ALTER TABLE "Case"
  ADD COLUMN IF NOT EXISTS "simulationCaseId" TEXT,
  ADD COLUMN IF NOT EXISTS "simulationTopicId" TEXT,
  ADD COLUMN IF NOT EXISTS "evaluationModuleId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Case_simulationCaseId_key"
  ON "Case"("simulationCaseId");

CREATE INDEX IF NOT EXISTS "Case_simulationTopicId_idx"
  ON "Case"("simulationTopicId");

CREATE INDEX IF NOT EXISTS "Case_evaluationModuleId_idx"
  ON "Case"("evaluationModuleId");

-- Store patient-visible SimulationRAG chunks. The embedding column is managed
-- with raw SQL because Prisma does not model pgvector fields.
CREATE TABLE IF NOT EXISTS "SimulationChunk" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "simulationCaseId" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "topicLabel" TEXT,
  "section" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "metadata" JSONB NOT NULL,
  "contentHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SimulationChunk_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SimulationChunk_caseId_section_idx"
  ON "SimulationChunk"("caseId", "section");

CREATE INDEX IF NOT EXISTS "SimulationChunk_simulationCaseId_idx"
  ON "SimulationChunk"("simulationCaseId");

CREATE INDEX IF NOT EXISTS "SimulationChunk_topicId_idx"
  ON "SimulationChunk"("topicId");

ALTER TABLE "SimulationChunk"
  ADD CONSTRAINT "SimulationChunk_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "Case"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "SimulationChunk"
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS simulation_chunk_embedding_hnsw_idx
  ON "SimulationChunk"
  USING hnsw (embedding vector_cosine_ops);
