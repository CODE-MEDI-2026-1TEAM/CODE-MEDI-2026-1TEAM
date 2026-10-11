ALTER TABLE "Session" ADD COLUMN "dialogueState" JSONB;
ALTER TABLE "SessionMessageRequest" ADD COLUMN "processing" JSONB;
ALTER TABLE "Evaluation" ADD COLUMN "provenance" JSONB;
ALTER TABLE "PhysicalExamEvent" ADD COLUMN "execution" TEXT NOT NULL DEFAULT 'performed';
ALTER TABLE "PhysicalExamEvent" ADD COLUMN "resultAvailability" TEXT NOT NULL DEFAULT 'available';
ALTER TABLE "PhysicalExamEvent" ADD COLUMN "details" JSONB;
UPDATE "PhysicalExamEvent" SET "resultAvailability"='not_provided' WHERE status='unavailable';
CREATE TABLE "PatientEvidence" (
  "id" TEXT PRIMARY KEY, "caseId" TEXT NOT NULL REFERENCES "Case"("id") ON DELETE CASCADE,
  "caseVersion" TEXT NOT NULL, "factId" TEXT NOT NULL, "searchText" TEXT NOT NULL,
  "payload" JSONB NOT NULL, "embeddingProfile" TEXT NOT NULL DEFAULT 'lexical', "embedding" vector,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatientEvidence_scope_key" UNIQUE ("caseId", "caseVersion", "factId", "embeddingProfile")
);
CREATE INDEX "PatientEvidence_caseId_caseVersion_idx" ON "PatientEvidence"("caseId", "caseVersion");
CREATE INDEX "PatientEvidence_searchText_idx" ON "PatientEvidence" USING GIN (to_tsvector('simple', "searchText"));
CREATE TABLE "PatientEvidenceIndex" (
  "id" TEXT PRIMARY KEY, "caseId" TEXT NOT NULL REFERENCES "Case"("id") ON DELETE CASCADE,
  "caseVersion" TEXT NOT NULL, "embeddingProfile" TEXT NOT NULL, "status" TEXT NOT NULL,
  "factCount" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatientEvidenceIndex_scope_key" UNIQUE ("caseId", "caseVersion", "embeddingProfile")
);
-- Dimension-independent vectors use exact filtered search for eight small cases.
-- A ready manifest is committed only after all vectors pass model/dimension/count checks.
