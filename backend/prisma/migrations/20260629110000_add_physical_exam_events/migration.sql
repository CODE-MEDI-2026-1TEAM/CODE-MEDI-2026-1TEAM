CREATE TABLE IF NOT EXISTS "PhysicalExamEvent" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "examKey" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "position" TEXT NOT NULL,
  "expectedPosition" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "matchedText" TEXT NOT NULL,
  "messageCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PhysicalExamEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PhysicalExamEvent_sessionId_createdAt_idx"
  ON "PhysicalExamEvent"("sessionId", "createdAt");

CREATE INDEX IF NOT EXISTS "PhysicalExamEvent_sessionId_examKey_idx"
  ON "PhysicalExamEvent"("sessionId", "examKey");

ALTER TABLE "PhysicalExamEvent"
  ADD CONSTRAINT "PhysicalExamEvent_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "Session"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Evaluation"
  ADD COLUMN IF NOT EXISTS "physicalExamFindings" JSONB NOT NULL DEFAULT '[]'::jsonb;
