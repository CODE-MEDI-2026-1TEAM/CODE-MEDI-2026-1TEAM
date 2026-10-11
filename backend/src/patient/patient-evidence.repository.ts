import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { EvidenceCorpus } from './evidence-contract';
import { hashContent } from './evidence-facts';

@Injectable()
export class PatientEvidenceRepository {
  constructor(private readonly prisma: PrismaService) {}
  async cachedVectors(
    corpus: EvidenceCorpus,
    profile: string,
  ): Promise<Map<string, number[]>> {
    const { rows } = await this.prisma.pgPool.query(
      `SELECT "searchText",embedding::text AS vector FROM "PatientEvidence" WHERE "caseId"=$1 AND "embeddingProfile"=$2 AND "searchText"=ANY($3::text[]) AND embedding IS NOT NULL`,
      [corpus.caseId, profile, corpus.facts.map((f) => f.searchText)],
    );
    const byText = new Map<string, number[]>();
    for (const row of rows) {
      const vector = JSON.parse(row.vector) as number[];
      if (
        Array.isArray(vector) &&
        vector.length &&
        vector.every(Number.isFinite) &&
        vector.some((n) => n !== 0)
      )
        byText.set(row.searchText, vector);
    }
    return new Map(
      corpus.facts
        .filter((f) => byText.has(f.searchText))
        .map((f) => [f.id, byText.get(f.searchText)!]),
    );
  }
  async ready(corpus: EvidenceCorpus, profile: string): Promise<boolean> {
    const result = await this.prisma.pgPool.query(
      `SELECT 1 FROM "PatientEvidenceIndex" i WHERE i."caseId"=$1 AND i."caseVersion"=$2 AND i."embeddingProfile"=$3 AND i.status='ready' AND i."factCount"=$4
       AND (SELECT COUNT(*) FROM "PatientEvidence" e WHERE e."caseId"=i."caseId" AND e."caseVersion"=i."caseVersion" AND e."embeddingProfile"=i."embeddingProfile" AND embedding IS NOT NULL)=i."factCount"`,
      [corpus.caseId, corpus.caseVersion, profile, corpus.facts.length],
    );
    return result.rowCount === 1;
  }
  async vectors(
    corpus: EvidenceCorpus,
    profile: string,
    vector: number[],
    allowedIds: string[],
    limit: number,
  ): Promise<Array<{ id: string; score: number }>> {
    if (
      !vector.length ||
      vector.some((n) => !Number.isFinite(n)) ||
      !vector.some((n) => n !== 0) ||
      !allowedIds.length
    )
      return [];
    const result = await this.prisma.pgPool.query(
      `SELECT "factId" as id, 1-(embedding <=> $1::vector) AS score FROM "PatientEvidence"
       WHERE "caseId"=$2 AND "caseVersion"=$3 AND "embeddingProfile"=$4 AND "factId"=ANY($5::text[])
       AND embedding IS NOT NULL AND vector_dims(embedding)=$6 ORDER BY embedding <=> $1::vector LIMIT $7`,
      [
        `[${vector.join(',')}]`,
        corpus.caseId,
        corpus.caseVersion,
        profile,
        allowedIds,
        vector.length,
        limit,
      ],
    );
    return result.rows.map((r) => ({ id: r.id, score: Number(r.score) }));
  }
  async lexical(
    corpus: EvidenceCorpus,
    profile: string,
    terms: string[],
    allowedIds: string[],
    limit: number,
  ): Promise<Array<{ id: string; score: number }>> {
    if (!terms.length || !allowedIds.length) return [];
    const result = await this.prisma.pgPool.query(
      `SELECT "factId" AS id, ts_rank_cd(to_tsvector('simple',"searchText"),query) AS score
       FROM "PatientEvidence", websearch_to_tsquery('simple',$1) AS query
       WHERE "caseId"=$2 AND "caseVersion"=$3 AND "embeddingProfile"=$4 AND "factId"=ANY($5::text[])
       AND to_tsvector('simple',"searchText") @@ query ORDER BY score DESC,"factId" LIMIT $6`,
      [
        terms.map((t) => '"' + t.replace(/["\\]/g, '') + '"').join(' OR '),
        corpus.caseId,
        corpus.caseVersion,
        profile,
        allowedIds,
        limit,
      ],
    );
    return result.rows.map((r) => ({ id: r.id, score: Number(r.score) }));
  }
  async publish(
    corpus: EvidenceCorpus,
    profile: string,
    vectors: Map<string, number[]> | null,
  ) {
    if (
      vectors &&
      (vectors.size !== corpus.facts.length ||
        corpus.facts.some((f) => !vectors.get(f.id)?.length))
    )
      throw new Error('Incomplete evidence index');
    const dimensions = vectors
      ? new Set([...vectors.values()].map((v) => v.length))
      : new Set();
    if (
      vectors &&
      (dimensions.size !== 1 ||
        [...vectors.values()].some(
          (v) => v.some((n) => !Number.isFinite(n)) || !v.some((n) => n !== 0),
        ))
    )
      throw new Error('Invalid vector dimensions');
    const client = await this.prisma.pgPool.connect();
    try {
      await client.query('BEGIN');
      for (const f of corpus.facts) {
        const vector = vectors?.get(f.id);
        await client.query(
          `INSERT INTO "PatientEvidence" (id,"caseId","caseVersion","factId","searchText",payload,"embeddingProfile",embedding)
          VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::vector)
          ON CONFLICT ("caseId","caseVersion","factId","embeddingProfile") DO UPDATE SET "searchText"=EXCLUDED."searchText",payload=EXCLUDED.payload,embedding=EXCLUDED.embedding`,
          [
            hashContent([corpus.caseId, corpus.caseVersion, f.id, profile]),
            corpus.caseId,
            corpus.caseVersion,
            f.id,
            f.searchText,
            JSON.stringify(f),
            profile,
            vector ? `[${vector.join(',')}]` : null,
          ],
        );
      }
      await client.query(
        `INSERT INTO "PatientEvidenceIndex" (id,"caseId","caseVersion","embeddingProfile",status,"factCount") VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT ("caseId","caseVersion","embeddingProfile") DO UPDATE SET status=EXCLUDED.status,"factCount"=EXCLUDED."factCount"`,
        [
          hashContent([corpus.caseId, corpus.caseVersion, profile]),
          corpus.caseId,
          corpus.caseVersion,
          profile,
          vectors ? 'ready' : 'lexical_only',
          corpus.facts.length,
        ],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
