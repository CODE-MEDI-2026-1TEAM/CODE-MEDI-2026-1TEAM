CREATE TABLE IF NOT EXISTS "HandHygieneEvent" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "phase" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "messageCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "HandHygieneEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "HandHygieneEvent_sessionId_createdAt_idx"
  ON "HandHygieneEvent"("sessionId", "createdAt");

ALTER TABLE "HandHygieneEvent"
  ADD CONSTRAINT "HandHygieneEvent_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "Session"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Evaluation"
  ADD COLUMN IF NOT EXISTS "handHygieneMoments" JSONB NOT NULL DEFAULT '[]'::jsonb;
