-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "CaseFact" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "questionExamples" JSONB NOT NULL,
    "triggerKeywords" JSONB NOT NULL,
    "searchText" TEXT NOT NULL,
    "contentHash" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseFact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaseFact_caseId_category_idx" ON "CaseFact"("caseId", "category");

-- AddForeignKey
ALTER TABLE "CaseFact" ADD CONSTRAINT "CaseFact_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add pgvector embedding column (not managed by Prisma)
ALTER TABLE "CaseFact"
    ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create HNSW index for cosine similarity search
CREATE INDEX IF NOT EXISTS case_fact_embedding_hnsw_idx
    ON "CaseFact"
    USING hnsw (embedding vector_cosine_ops);
