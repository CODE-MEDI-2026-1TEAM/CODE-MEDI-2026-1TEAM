ALTER TABLE "Evaluation"
ADD COLUMN "caseInstructionStatus" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "patientEducationStatus" JSONB NOT NULL DEFAULT '[]';
