import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingsService } from '../llm/embeddings.service';
import type { RetrievalResult } from './case-fact-retriever.service';
import { SimulationChunkRepository } from './simulation-chunk.repository';

export type SimulationRetrievalResult = RetrievalResult & {
  hasSimulationChunks: boolean;
};

type IntentRule = {
  name: string;
  keywords: string[];
  sectionPatterns: RegExp[];
};

const DIAGNOSIS_PATTERNS = [
  '무슨 병',
  '어떤 병',
  '병명',
  '무슨 질환',
  '어떤 질환',
  '무슨 진단',
  '진단',
  '원인이 뭐',
  '원인은 뭐',
  '원인이 뭔',
  '원인이 무엇',
  '왜 아픈',
  '왜 아프신',
  '왜 아프세요',
  '왜 이렇게 아프',
  '치료는',
  '어떻게 치료',
  '나을 수 있',
];

const INTENT_RULES: IntentRule[] = [
  {
    name: 'chief_complaint',
    keywords: [
      '어떤 증상',
      '무슨 증상',
      '증상 때문에',
      '어디가 불편',
      '어디 불편',
      '무슨 일',
      '왜 오',
      '오셨',
      '내원',
      '방문',
    ],
    sectionPatterns: [/^intro$/, /^opening_profile$/],
  },
  {
    name: 'onset',
    keywords: [
      '언제부터',
      '언제 부터',
      '시작',
      '발생',
      '며칠',
      '몇일',
      '얼마나 됐',
      '처음',
      '갑자기',
      '상황',
    ],
    sectionPatterns: [
      /^history_onset$/,
      /^history_course$/,
      /^history_experience$/,
    ],
  },
  {
    name: 'duration',
    keywords: ['얼마나 지속', '지속', '몇 분', '몇 시간', '계속', '오래'],
    sectionPatterns: [/^history_duration$/, /^history_course$/],
  },
  {
    name: 'location',
    keywords: ['어디', '부위', '위치', '퍼지', '방사'],
    sectionPatterns: [/^history_location$/],
  },
  {
    name: 'character',
    keywords: [
      '어떤 느낌',
      '양상',
      '어떻게 아파',
      '답답',
      '욱신',
      '뻐근',
      '조이',
      '통증 정도',
      '점수',
      '어떤 통증',
      '찌르',
      '압박',
      '타는',
      '쥐어짜',
      '심한 정도',
    ],
    sectionPatterns: [/^history_character$/],
  },
  {
    name: 'aggravating_relieving_factors',
    keywords: [
      '움직',
      '운동',
      '걸',
      '심해',
      '악화',
      '완화',
      '쉬면',
      '자세',
      '식사',
      '기침',
      '더 아파',
      '더 아프',
      '더 아픈',
      '아프게 하',
      '좋아지',
      '나빠지',
      '누우면',
      '앉으면',
    ],
    sectionPatterns: [/^history_factors$/, /^history_character$/],
  },
  {
    name: 'associated_symptoms',
    keywords: [
      '숨',
      '호흡',
      '기침',
      '가래',
      '열',
      '오한',
      '두근',
      '속쓰림',
      '메스꺼',
      '구토',
      '발진',
    ],
    sectionPatterns: [/^history_associated_symptoms$/],
  },
  {
    name: 'past_history',
    keywords: [
      '앓',
      '질환',
      '병력',
      '과거력',
      '진단받',
      '기저질환',
      '평소에',
      '지병',
      '만성',
      '고혈압',
      '당뇨',
      '예전에',
      '이전에',
    ],
    sectionPatterns: [/^history_past_history$/],
  },
  {
    name: 'surgery_trauma_history',
    keywords: ['수술', '다친', '외상', '사고', '골절', '입원'],
    sectionPatterns: [/^history_trauma_history$/, /^history_past_history$/],
  },
  {
    name: 'medications',
    keywords: ['약', '복용', '먹는 약', '영양제', '건강식품'],
    sectionPatterns: [/^history_medications$/],
  },
  {
    name: 'social_history',
    keywords: ['담배', '흡연', '술', '음주', '직업', '스트레스'],
    sectionPatterns: [/^history_social_history$/],
  },
  {
    name: 'family_history',
    keywords: ['가족', '부모', '아버지', '어머니', '형제'],
    sectionPatterns: [/^history_family_history$/],
  },
  {
    name: 'prior_episode',
    keywords: [
      '처음이에요',
      '이전에도',
      '예전에도',
      '비슷한 적',
      '전에도',
      '처음 겪',
    ],
    sectionPatterns: [/^history_experience$/, /^history_onset$/],
  },
  {
    name: 'gynecologic_history',
    keywords: ['생리', '월경', '임신', '출산', '폐경', '피임', '마지막 생리'],
    sectionPatterns: [/^history_gynecologic_history$/],
  },
  {
    name: 'physical_exam',
    keywords: ['진찰', '눌', '압통', '청진', '심음', '맥박', '부종'],
    sectionPatterns: [/^physical_exam$/],
  },
];

@Injectable()
export class SimulationRagRetrieverService {
  private readonly logger = new Logger(SimulationRagRetrieverService.name);

  constructor(
    private readonly simulationChunkRepository: SimulationChunkRepository,
    private readonly embeddingsService: EmbeddingsService,
    private readonly configService: ConfigService,
  ) {}

  async retrieve({
    caseId,
    question,
    conversationContext,
    limit,
  }: {
    caseId: string;
    question: string;
    conversationContext?: string;
    limit?: number;
  }): Promise<SimulationRetrievalResult> {
    const topK =
      limit ??
      parseInt(this.configService.get('SIMULATION_RAG_TOP_K') ?? '3', 10);
    const minScore = parseFloat(
      this.configService.get('SIMULATION_RAG_MIN_SCORE') ??
        this.configService.get('RAG_SEMANTIC_MIN_SCORE') ??
        '0.20',
    );
    const nearMissScore = parseFloat(
      this.configService.get('SIMULATION_RAG_NEAR_MISS_SCORE') ?? '0.10',
    );

    const normalized = question.trim().toLowerCase();

    if (this.isDiagnosisRequest(normalized)) {
      return {
        facts: [],
        isFallback: true,
        fallbackType: 'DIAGNOSIS_REQUEST',
        hasSimulationChunks: true,
      };
    }

    const chunkCount =
      await this.simulationChunkRepository.countByCaseId(caseId);
    if (chunkCount === 0) {
      return {
        facts: [],
        isFallback: true,
        fallbackType: 'BROAD_QUESTION',
        rawResults: [],
        hasSimulationChunks: false,
      };
    }

    const intentRetrieval = await this.retrieveByIntent({
      caseId,
      normalizedQuestion: normalized,
      topK,
    });

    if (intentRetrieval) {
      return intentRetrieval;
    }

    let queryEmbedding: number[];
    const embeddingQuery = conversationContext
      ? `${conversationContext} / ${normalized}`
      : `의사가 표준화 환자에게 묻는 질문: ${normalized}`;

    try {
      queryEmbedding = await this.embeddingsService.embed(embeddingQuery);
    } catch {
      this.logger.warn(
        `SimulationRAG embedding failed for caseId ${caseId}, returning UNKNOWN fallback`,
      );
      return {
        facts: [],
        isFallback: true,
        fallbackType: 'UNKNOWN',
        hasSimulationChunks: true,
      };
    }

    const searchResults = await this.simulationChunkRepository.searchByCaseId({
      caseId,
      queryEmbedding,
      topK,
    });

    const rawResults = searchResults.map((row) => ({
      label: row.section,
      semanticScore: row.semanticScore,
      keywordScore: 0,
      finalScore: row.semanticScore,
    }));

    this.logger.debug(
      `SimulationRAG scores (minScore=${minScore}, nearMissScore=${nearMissScore}): ${JSON.stringify(rawResults)}`,
    );

    const passing = searchResults
      .filter((row) => row.semanticScore >= minScore)
      .sort((a, b) => b.semanticScore - a.semanticScore)
      .slice(0, topK);

    if (passing.length > 0) {
      return {
        facts: passing.map((row) => ({
          id: row.id,
          category: row.section,
          label: row.section,
          answer: row.text,
          semanticScore: row.semanticScore,
          keywordScore: 0,
          finalScore: row.semanticScore,
        })),
        isFallback: false,
        rawResults,
        hasSimulationChunks: true,
      };
    }

    const nearMiss = searchResults
      .filter(
        (row) =>
          row.semanticScore >= nearMissScore && row.semanticScore < minScore,
      )
      .sort((a, b) => b.semanticScore - a.semanticScore)
      .slice(0, topK);

    if (nearMiss.length > 0) {
      return {
        facts: nearMiss.map((row) => ({
          id: row.id,
          category: row.section,
          label: row.section,
          answer: row.text,
          semanticScore: row.semanticScore,
          keywordScore: 0,
          finalScore: row.semanticScore,
        })),
        isFallback: true,
        fallbackType: 'NEAR_MISS',
        rawResults,
        hasSimulationChunks: true,
      };
    }

    return {
      facts: [],
      isFallback: true,
      fallbackType: 'OUT_OF_SCOPE',
      rawResults,
      hasSimulationChunks: true,
    };
  }

  private isDiagnosisRequest(text: string): boolean {
    return DIAGNOSIS_PATTERNS.some((pattern) => text.includes(pattern));
  }

  private async retrieveByIntent({
    caseId,
    normalizedQuestion,
    topK,
  }: {
    caseId: string;
    normalizedQuestion: string;
    topK: number;
  }): Promise<SimulationRetrievalResult | null> {
    const matchedRule = INTENT_RULES.find((rule) =>
      rule.keywords.some((keyword) => normalizedQuestion.includes(keyword)),
    );

    if (!matchedRule) return null;

    const chunks = await this.simulationChunkRepository.findByCaseId(caseId);
    const matchedChunks = chunks
      .filter((chunk) =>
        matchedRule.sectionPatterns.some((pattern) =>
          pattern.test(chunk.section),
        ),
      )
      .slice(0, topK);

    if (matchedChunks.length === 0) return null;

    const rawResults = matchedChunks.map((chunk) => ({
      label: chunk.section,
      semanticScore: 1,
      keywordScore: 1,
      finalScore: 1,
    }));

    this.logger.debug(
      `SimulationRAG intent=${matchedRule.name}: ${JSON.stringify(rawResults)}`,
    );

    return {
      facts: matchedChunks.map((chunk) => ({
        id: chunk.id,
        category: chunk.section,
        label: chunk.section,
        answer: chunk.text,
        semanticScore: 1,
        keywordScore: 1,
        finalScore: 1,
      })),
      isFallback: false,
      rawResults,
      hasSimulationChunks: true,
    };
  }
}
