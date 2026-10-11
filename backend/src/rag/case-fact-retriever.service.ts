import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingsService } from '../llm/embeddings.service';
import { isDiagnosisRequest } from '../patient/patient-question';
import type { PatientQuestion } from '../patient/patient-question';
import { projectLegacyFacts } from '../patient/legacy-patient-facts';
import { isReviewedLegacyAnswer } from '../patient/legacy-patient-facts';
import type { PatientFact } from '../patient/patient-facts';
import { CaseFactRepository } from './case-fact.repository';

export type FallbackType =
  | 'UNKNOWN'
  | 'BROAD_QUESTION'
  | 'OUT_OF_SCOPE'
  | 'DIAGNOSIS_REQUEST'
  | 'NEAR_MISS';

export type RetrievedFact = {
  id: string;
  category: string;
  label: string;
  answer: string;
  semanticScore: number;
  keywordScore: number;
  finalScore: number;
  source?: string;
};

export type RetrievalResult = {
  patientFacts?: PatientFact[];
  facts: RetrievedFact[];
  isFallback: boolean;
  fallbackType?: FallbackType;
  rawResults?: Array<{
    label: string;
    semanticScore: number;
    keywordScore: number;
    finalScore: number;
  }>;
};

@Injectable()
export class CaseFactRetrieverService {
  private readonly logger = new Logger(CaseFactRetrieverService.name);

  constructor(
    private readonly caseFactRepository: CaseFactRepository,
    private readonly embeddingsService: EmbeddingsService,
    private readonly configService: ConfigService,
  ) {}

  async retrieve({
    caseId,
    question,
    limit,
    questionIntent,
  }: {
    caseId: string;
    question: string;
    limit?: number;
    questionIntent?: PatientQuestion;
  }): Promise<RetrievalResult> {
    const topK =
      limit ?? parseInt(this.configService.get('RAG_TOP_K') ?? '5', 10);
    const minScore = parseFloat(
      this.configService.get('RAG_MIN_SCORE') ?? '0.42',
    );
    const semanticMinScore = parseFloat(
      this.configService.get('RAG_SEMANTIC_MIN_SCORE') ?? '0.34',
    );
    const vectorWeight = parseFloat(
      this.configService.get('RAG_VECTOR_WEIGHT') ?? '0.85',
    );
    const keywordWeight = parseFloat(
      this.configService.get('RAG_KEYWORD_WEIGHT') ?? '0.15',
    );

    const normalized = question.trim().toLowerCase();

    if (this.isDiagnosisRequest(normalized)) {
      return { facts: [], isFallback: true, fallbackType: 'DIAGNOSIS_REQUEST' };
    }

    if (questionIntent) {
      const rows = await this.caseFactRepository.findByCaseId(caseId);
      const projected = projectLegacyFacts(questionIntent, rows);
      if (projected.length) {
        return {
          patientFacts: projected,
          facts: projected.map((f) => ({
            id: f.id,
            category: f.topic,
            label: f.label,
            answer: f.reply,
            source: f.source,
            semanticScore: 0,
            keywordScore: 1,
            finalScore: 1,
          })),
          isFallback: false,
        };
      }
      if (rows.length && rows.every((r) => isReviewedLegacyAnswer(r.answer)))
        return { facts: [], isFallback: true, fallbackType: 'UNKNOWN' };
    }

    let queryEmbedding: number[];
    try {
      const queryText = `의사가 환자에게 묻는 질문: ${normalized}`;
      queryEmbedding = await this.embeddingsService.embed(queryText);
    } catch {
      this.logger.warn(`Embedding failed for question in caseId ${caseId}`);
      throw new BadGatewayException(
        '문진 검색에 실패했습니다. 같은 질문을 다시 보내 주세요.',
      );
    }

    const searchResults = await this.caseFactRepository.searchByCaseId(
      caseId,
      queryEmbedding,
      Math.min(topK * 4, 40),
    );

    if (searchResults.length === 0) {
      // DB에 팩트 자체가 없음 — 임베딩 미생성 또는 케이스 데이터 없음
      this.logger.warn(
        `RAG: DB returned 0 rows for caseId=${caseId}. Check embeddings exist.`,
      );
      return {
        facts: [],
        isFallback: true,
        fallbackType: 'BROAD_QUESTION',
        rawResults: [],
      };
    }

    const scoredFacts: RetrievedFact[] = searchResults.map((row) => {
      const keywordScore = this.computeKeywordScore(
        normalized,
        row.triggerKeywords,
      );
      const finalScore =
        row.semanticScore * vectorWeight + keywordScore * keywordWeight;

      return {
        id: row.id,
        category: row.category,
        label: row.label,
        answer: row.answer,
        semanticScore: row.semanticScore,
        keywordScore,
        finalScore,
      };
    });

    const rawResults = scoredFacts.map((f) => ({
      label: f.label,
      semanticScore: f.semanticScore,
      keywordScore: f.keywordScore,
      finalScore: f.finalScore,
    }));

    this.logger.debug(
      `RAG scores (minScore=${minScore}, semanticMin=${semanticMinScore}): ${JSON.stringify(rawResults)}`,
    );

    // 이중 필터: hybrid finalScore AND semantic 하한선
    // — semanticMinScore는 keyword boost로 인한 노이즈 팩트 유입을 차단한다
    const passing = scoredFacts
      .filter(
        (f) => f.finalScore >= minScore && f.semanticScore >= semanticMinScore,
      )
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, topK);

    if (passing.length === 0) {
      // 팩트는 있지만 관련 없는 질문 — 케이스에 없는 특정 사실
      return {
        facts: [],
        isFallback: true,
        fallbackType: 'OUT_OF_SCOPE',
        rawResults,
      };
    }

    return { facts: passing, isFallback: false, rawResults };
  }

  private isDiagnosisRequest(text: string): boolean {
    return isDiagnosisRequest(text);
  }

  private computeKeywordScore(question: string, keywords: string[]): number {
    if (keywords.length === 0) return 0;
    const matched = keywords.filter((kw) => question.includes(kw)).length;
    return matched / keywords.length;
  }
}
