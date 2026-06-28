import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type CaseFactRow = {
  id: string;
  caseId: string;
  category: string;
  label: string;
  answer: string;
  questionExamples: unknown;
  triggerKeywords: unknown;
  searchText: string;
  contentHash: string | null;
  priority: number;
  isCritical: boolean;
};

export type CaseFactSearchResult = {
  id: string;
  category: string;
  label: string;
  answer: string;
  triggerKeywords: string[];
  semanticScore: number;
};

type UpsertFactData = {
  caseId: string;
  category: string;
  label: string;
  answer: string;
  questionExamples: string[];
  triggerKeywords: string[];
  searchText: string;
  contentHash: string;
  priority: number;
  isCritical: boolean;
};

@Injectable()
export class CaseFactRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(data: UpsertFactData): Promise<{
    id: string;
    isNew: boolean;
    hashChanged: boolean;
  }> {
    const pool = this.prisma.pgPool;

    const existing = await pool.query<{
      id: string;
      content_hash: string | null;
    }>(
      `SELECT id, "contentHash" as content_hash FROM "CaseFact"
       WHERE "caseId" = $1 AND category = $2 AND label = $3
       LIMIT 1`,
      [data.caseId, data.category, data.label],
    );

    if (existing.rows.length === 0) {
      const result = await pool.query<{ id: string }>(
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
          data.caseId,
          data.category,
          data.label,
          data.answer,
          JSON.stringify(data.questionExamples),
          JSON.stringify(data.triggerKeywords),
          data.searchText,
          data.contentHash,
          data.priority,
          data.isCritical,
        ],
      );
      return { id: result.rows[0].id, isNew: true, hashChanged: false };
    }

    const existingRow = existing.rows[0];
    const hashChanged = existingRow.content_hash !== data.contentHash;

    await pool.query(
      `UPDATE "CaseFact"
       SET "answer" = $1, "questionExamples" = $2::jsonb, "triggerKeywords" = $3::jsonb,
           "searchText" = $4, "contentHash" = $5, "priority" = $6,
           "isCritical" = $7, "updatedAt" = NOW()
       WHERE id = $8`,
      [
        data.answer,
        JSON.stringify(data.questionExamples),
        JSON.stringify(data.triggerKeywords),
        data.searchText,
        data.contentHash,
        data.priority,
        data.isCritical,
        existingRow.id,
      ],
    );

    return { id: existingRow.id, isNew: false, hashChanged };
  }

  async updateEmbedding(id: string, embedding: number[]): Promise<void> {
    const pool = this.prisma.pgPool;
    await pool.query(
      `UPDATE "CaseFact" SET embedding = $1::vector, "updatedAt" = NOW() WHERE id = $2`,
      [`[${embedding.join(',')}]`, id],
    );
  }

  async searchByCaseId(
    caseId: string,
    queryEmbedding: number[],
    topK: number,
  ): Promise<CaseFactSearchResult[]> {
    const pool = this.prisma.pgPool;

    const result = await pool.query<{
      id: string;
      category: string;
      label: string;
      answer: string;
      trigger_keywords: string[];
      semantic_score: number;
    }>(
      `SELECT id, category, label, answer,
              "triggerKeywords" as trigger_keywords,
              1 - (embedding <=> $1::vector) AS semantic_score
       FROM "CaseFact"
       WHERE "caseId" = $2
         AND embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      [`[${queryEmbedding.join(',')}]`, caseId, topK],
    );

    return result.rows.map((row) => ({
      id: row.id,
      category: row.category,
      label: row.label,
      answer: row.answer,
      triggerKeywords: Array.isArray(row.trigger_keywords)
        ? row.trigger_keywords
        : [],
      semanticScore: Number(row.semantic_score),
    }));
  }

  async findFactsNeedingEmbedding(
    caseId: string,
    currentHashes: Map<string, string>,
  ): Promise<Array<{ id: string; searchText: string; contentHash: string }>> {
    const pool = this.prisma.pgPool;

    const result = await pool.query<{
      id: string;
      search_text: string;
      content_hash: string | null;
      has_embedding: boolean;
    }>(
      `SELECT id, "searchText" as search_text, "contentHash" as content_hash,
              (embedding IS NOT NULL) as has_embedding
       FROM "CaseFact"
       WHERE "caseId" = $1`,
      [caseId],
    );

    return result.rows
      .filter((row) => {
        if (!row.has_embedding) return true;
        const newHash = currentHashes.get(row.id);
        return newHash !== undefined && newHash !== row.content_hash;
      })
      .map((row) => ({
        id: row.id,
        searchText: row.search_text,
        contentHash: row.content_hash ?? '',
      }));
  }

  async findByCaseId(caseId: string): Promise<CaseFactRow[]> {
    return this.prisma.caseFact.findMany({
      where: { caseId },
      orderBy: { priority: 'desc' },
    });
  }
}
