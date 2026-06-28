import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Pool } from 'pg';
import { createHash } from 'crypto';
import OpenAI from 'openai';

type RawFactInput = {
  category: string;
  label: string;
  answer: string;
  questionExamples: string[];
  triggerKeywords: string[];
  priority?: number;
  isCritical?: boolean;
};

type ImportFile = {
  case: { id: string; title?: string };
  facts: RawFactInput[];
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function buildSearchText(fact: RawFactInput): string {
  return [
    `카테고리: ${fact.category} / ${fact.label}`,
    `의사가 할 수 있는 질문: ${fact.questionExamples.join(' ')}`,
    `환자가 답할 수 있는 정보: ${fact.answer}`,
  ].join('\n');
}

function computeHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function getEmbeddingModel(): string {
  return process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-large';
}

function getEmbeddingDimensions(): number | undefined {
  const raw = process.env.OPENAI_EMBEDDING_DIMENSIONS;
  if (!raw) return undefined;

  const dimensions = Number(raw);
  if (!Number.isInteger(dimensions) || dimensions <= 0) {
    throw new Error('OPENAI_EMBEDDING_DIMENSIONS must be a positive integer');
  }

  return dimensions;
}

function computeEmbeddingHash(text: string): string {
  const dimensions = getEmbeddingDimensions();
  return computeHash(
    [`model=${getEmbeddingModel()};dimensions=${dimensions ?? 'default'}`, text]
      .join('\n'),
  );
}

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'sk-your-api-key') {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  return new OpenAI({ apiKey });
}

async function embedText(openai: OpenAI, text: string): Promise<number[]> {
  const dimensions = getEmbeddingDimensions();
  const response = await openai.embeddings.create({
    model: getEmbeddingModel(),
    input: text,
    ...(dimensions ? { dimensions } : {}),
  });
  const embedding = response.data[0]?.embedding;
  if (!embedding) throw new Error('Empty embedding response');
  return embedding;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: ts-node prisma/import-case-facts.ts <path-to-json>');
    process.exit(1);
  }

  const absolutePath = resolve(filePath);
  let importData: ImportFile;

  try {
    const raw = readFileSync(absolutePath, 'utf-8');
    importData = JSON.parse(raw) as ImportFile;
  } catch (error) {
    console.error(`Failed to read or parse file: ${absolutePath}`);
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  if (!importData.case?.id) {
    console.error('Validation error: case.id is required');
    process.exit(1);
  }

  if (!Array.isArray(importData.facts) || importData.facts.length === 0) {
    console.error('Validation error: facts must be a non-empty array');
    process.exit(1);
  }

  const caseResult = await pool.query<{ id: string }>(
    'SELECT id FROM "Case" WHERE id = $1 OR slug = $1 LIMIT 1',
    [importData.case.id],
  );

  if (caseResult.rows.length === 0) {
    console.error(`Case not found: ${importData.case.id}`);
    process.exit(1);
  }

  const caseId = caseResult.rows[0].id;
  console.log(`\n[CaseFact Import]`);
  console.log(`caseId: ${caseId}`);
  console.log(`total facts: ${importData.facts.length}`);

  const openai = getOpenAI();

  let created = 0;
  let updated = 0;
  let embedded = 0;
  let skippedEmbeddings = 0;
  let failed = 0;

  for (const fact of importData.facts) {
    if (!fact.category || !fact.label || !fact.answer) {
      console.error(`  Skipping invalid fact (missing required fields): ${JSON.stringify(fact).slice(0, 60)}`);
      failed++;
      continue;
    }

    const searchText = buildSearchText(fact);
    const contentHash = computeEmbeddingHash(searchText);

    try {
      const existing = await pool.query<{
        id: string;
        content_hash: string | null;
        has_embedding: boolean;
      }>(
        `SELECT id, "contentHash" as content_hash, (embedding IS NOT NULL) as has_embedding
         FROM "CaseFact"
         WHERE "caseId" = $1 AND category = $2 AND label = $3
         LIMIT 1`,
        [caseId, fact.category, fact.label],
      );

      let factId: string;
      let needsEmbedding: boolean;

      if (existing.rows.length === 0) {
        const insertResult = await pool.query<{ id: string }>(
          `INSERT INTO "CaseFact"
             ("id", "caseId", "category", "label", "answer",
              "questionExamples", "triggerKeywords", "searchText",
              "contentHash", "priority", "isCritical", "createdAt", "updatedAt")
           VALUES
             (gen_random_uuid(), $1, $2, $3, $4,
              $5::jsonb, $6::jsonb, $7,
              $8, $9, $10, NOW(), NOW())
           RETURNING id`,
          [
            caseId,
            fact.category,
            fact.label,
            fact.answer,
            JSON.stringify(fact.questionExamples ?? []),
            JSON.stringify(fact.triggerKeywords ?? []),
            searchText,
            contentHash,
            fact.priority ?? 0,
            fact.isCritical ?? false,
          ],
        );
        factId = insertResult.rows[0].id;
        needsEmbedding = true;
        created++;
      } else {
        const row = existing.rows[0];
        factId = row.id;
        const hashChanged = row.content_hash !== contentHash;

        await pool.query(
          `UPDATE "CaseFact"
           SET "answer" = $1, "questionExamples" = $2::jsonb, "triggerKeywords" = $3::jsonb,
               "searchText" = $4, "contentHash" = $5, "priority" = $6,
               "isCritical" = $7, "updatedAt" = NOW()
           WHERE id = $8`,
          [
            fact.answer,
            JSON.stringify(fact.questionExamples ?? []),
            JSON.stringify(fact.triggerKeywords ?? []),
            searchText,
            contentHash,
            fact.priority ?? 0,
            fact.isCritical ?? false,
            factId,
          ],
        );

        needsEmbedding = hashChanged || !row.has_embedding;
        if (hashChanged) updated++;
      }

      if (needsEmbedding) {
        try {
          const embedding = await embedText(openai, searchText);
          await pool.query(
            `UPDATE "CaseFact" SET embedding = $1::vector, "updatedAt" = NOW() WHERE id = $2`,
            [`[${embedding.join(',')}]`, factId],
          );
          embedded++;
        } catch (embErr) {
          failed++;
          console.error(
            `  Embedding failed for fact "${fact.label}": ${embErr instanceof Error ? embErr.message : embErr}`,
          );
        }
      } else {
        skippedEmbeddings++;
      }
    } catch (error) {
      failed++;
      console.error(
        `  Failed to process fact "${fact.label}": ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  console.log(`created: ${created}`);
  console.log(`updated: ${updated}`);
  console.log(`embedded: ${embedded}`);
  console.log(`skipped embeddings: ${skippedEmbeddings}`);
  console.log(`failed: ${failed}`);
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });
