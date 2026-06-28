import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type SimulationChunkSearchResult = {
  id: string;
  simulationCaseId: string;
  topicId: string;
  topicLabel: string | null;
  section: string;
  text: string;
  semanticScore: number;
};

@Injectable()
export class SimulationChunkRepository {
  constructor(private readonly prisma: PrismaService) {}

  async countByCaseId(caseId: string): Promise<number> {
    const result = await this.prisma.pgPool.query<{ count: string }>(
      `SELECT COUNT(*)::text as count
       FROM "SimulationChunk"
       WHERE "caseId" = $1
         AND embedding IS NOT NULL`,
      [caseId],
    );

    return Number(result.rows[0]?.count ?? 0);
  }

  async searchByCaseId({
    caseId,
    queryEmbedding,
    topK,
  }: {
    caseId: string;
    queryEmbedding: number[];
    topK: number;
  }): Promise<SimulationChunkSearchResult[]> {
    const result = await this.prisma.pgPool.query<{
      id: string;
      simulation_case_id: string;
      topic_id: string;
      topic_label: string | null;
      section: string;
      text: string;
      semantic_score: number;
    }>(
      `SELECT id,
              "simulationCaseId" as simulation_case_id,
              "topicId" as topic_id,
              "topicLabel" as topic_label,
              section,
              text,
              1 - (embedding <=> $1::vector) AS semantic_score
       FROM "SimulationChunk"
       WHERE "caseId" = $2
         AND embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      [`[${queryEmbedding.join(',')}]`, caseId, topK],
    );

    return result.rows.map((row) => ({
      id: row.id,
      simulationCaseId: row.simulation_case_id,
      topicId: row.topic_id,
      topicLabel: row.topic_label,
      section: row.section,
      text: row.text,
      semanticScore: Number(row.semantic_score),
    }));
  }

  async findByCaseId(caseId: string): Promise<SimulationChunkSearchResult[]> {
    const result = await this.prisma.pgPool.query<{
      id: string;
      simulation_case_id: string;
      topic_id: string;
      topic_label: string | null;
      section: string;
      text: string;
    }>(
      `SELECT id,
              "simulationCaseId" as simulation_case_id,
              "topicId" as topic_id,
              "topicLabel" as topic_label,
              section,
              text
       FROM "SimulationChunk"
       WHERE "caseId" = $1
       ORDER BY id ASC`,
      [caseId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      simulationCaseId: row.simulation_case_id,
      topicId: row.topic_id,
      topicLabel: row.topic_label,
      section: row.section,
      text: row.text,
      semanticScore: 1,
    }));
  }
}
