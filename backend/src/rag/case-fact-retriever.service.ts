import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingsService } from '../llm/embeddings.service';
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

const DIAGNOSIS_PATTERNS = [
  // 병명/진단 직접 요구
  '무슨 병',
  '어떤 병',
  '병명',
  '무슨 질환',
  '어떤 질환',
  '무슨 진단',
  '진단',
  // 원인
  '원인이 뭐',
  '원인은 뭐',
  '원인이 뭔',
  '원인이 무엇',
  // 왜 아픈 — 형태소 변형 포함
  '왜 아픈',
  '왜 아프신',
  '왜 아프세요',
  '왜 이렇게 아프',
  '왜 이렇게 힘드',
  // 예후/치료
  '치료는',
  '어떻게 치료',
  '나을 수 있',
];

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
  }: {
    caseId: string;
    question: string;
    limit?: number;
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

    let queryEmbedding: number[];
    try {
      const queryText = `의사가 환자에게 묻는 질문: ${normalized}`;
      queryEmbedding = await this.embeddingsService.embed(queryText);
    } catch {
      this.logger.warn(
        `Embedding failed for question in caseId ${caseId}, returning UNKNOWN fallback`,
      );
      return { facts: [], isFallback: true, fallbackType: 'UNKNOWN' };
    }

    const searchResults = await this.caseFactRepository.searchByCaseId(
      caseId,
      queryEmbedding,
      topK,
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
    return DIAGNOSIS_PATTERNS.some((pattern) => text.includes(pattern));
  }

  private computeKeywordScore(question: string, keywords: string[]): number {
    if (keywords.length === 0) return 0;
    const matched = keywords.filter((kw) => question.includes(kw)).length;
    return matched / keywords.length;
  }
}
