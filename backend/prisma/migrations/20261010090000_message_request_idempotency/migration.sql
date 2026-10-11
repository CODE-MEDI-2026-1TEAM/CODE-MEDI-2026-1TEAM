CREATE TABLE "SessionMessageRequest" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "userMessageId" TEXT NOT NULL,
  "response" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SessionMessageRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SessionMessageRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SessionMessageRequest_sessionId_requestId_key" ON "SessionMessageRequest"("sessionId", "requestId");
