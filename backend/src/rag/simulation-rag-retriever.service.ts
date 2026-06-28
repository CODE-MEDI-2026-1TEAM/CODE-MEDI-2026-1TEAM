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
    name: 'patient_identity',
    keywords: [
      '성함',
      '이름',
      '누구',
      '환자분',
      '본인',
      '생년월일',
      '생년 월일',
      '몇 년생',
      '몇년생',
      '나이',
      '몇 살',
      '몇살',
      '연세',
    ],
    sectionPatterns: [/^patient_identity$/],
  },
  {
    name: 'chief_complaint',
    keywords: [
      '어떤 증상',
      '무슨 증상',
      '증상 때문에',
      '어디가 불편',
      '어디 불편',
      '어디가 아프',
      '어디 아프',
      '아파서 오',
      '아프셔서 오',
      '불편해서 오',
      '무슨 일',
      '왜 오',
      '오셨',
      '내원',
      '방문',
    ],
    sectionPatterns: [/^intro$/, /^opening_profile$/, /^chief_complaint$/],
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
      '경련 전',
      '경련 중',
      '경련 후',
      '경련 당시',
      '경련할 때',
      '발작 당시',
      '발작 전',
      '발작 후',
      '전조',
      '의식',
      '떨',
      '뻣뻣',
      '자동증',
      '혀 깨물',
      '실금',
      '고개',
      '눈이 돌아',
      '깨어난',
      '경련 이후',
    ],
    sectionPatterns: [/^history_character/],
  },
  {
    name: 'aggravating_relieving_factors',
    keywords: [
      '움직',
      '운동할 때',
      '운동하면',
      '운동 후',
      '운동 중',
      '심해',
      '악화',
      '완화',
      '쉬면',
      '자세',
      '더 아파',
      '더 아프',
      '더 아픈',
      '좋아지',
      '나빠지',
    ],
    sectionPatterns: [/^history_factors$/, /^history_character/],
  },
  {
    name: 'associated_symptoms',
    keywords: [
      // 감염/발열
      '열',
      '발열',
      '오한',
      '기침',
      '가래',
      '감기',
      // 신경계 (경련 감별 핵심)
      '두통',
      '머리 아프',
      '어지럽',
      '시야',
      '보행',
      '말이 어눌',
      '힘이 빠',
      '마비',
      '목 뻣뻣',
      '수막',
      '경부',
      // 정신/자율
      '우울',
      '불안',
      '피로',
      // 구역/소화
      '구역',
      '구토',
      '메스꺼',
      '오심',
      // 유발 인자 (경련 특이적)
      '잠',
      '수면',
      '스트레스',
      '과호흡',
      '음주',
      '술',
    ],
    sectionPatterns: [/^history_associated/],
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
      '열성 경련',
      '뇌전증',
      '뇌졸중',
      '뇌종양',
      '머리 다친',
      '주산기',
    ],
    sectionPatterns: [/^history_past/, /^history_development/],
  },
  {
    name: 'surgery_trauma_history',
    keywords: ['수술', '다친', '외상', '사고', '골절', '입원', '교통사고'],
    sectionPatterns: [/^history_trauma/, /^history_past/],
  },
  {
    name: 'medications',
    keywords: ['약', '복용', '먹는 약', '영양제', '건강식품', '항경련제'],
    sectionPatterns: [/^history_medication/],
  },
  {
    name: 'social_history',
    keywords: [
      '담배',
      '흡연',
      '술',
      '음주',
      '직업',
      '스트레스',
      '카페인',
      '커피',
      '운동',
      '사회력',
      '생활습관',
    ],
    sectionPatterns: [/^history_social/],
  },
  {
    name: 'family_history',
    keywords: ['가족', '부모', '아버지', '어머니', '형제', '유전', '집안'],
    sectionPatterns: [/^history_family/],
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
      '처음 있는',
    ],
    sectionPatterns: [/^history_experience$/, /^history_onset$/],
  },
  {
    name: 'gynecologic_history',
    keywords: ['생리', '월경', '임신', '출산', '폐경', '피임', '마지막 생리'],
    sectionPatterns: [/^history_gynecologic/],
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
      parseInt(this.configService.get('SIMULATION_RAG_TOP_K') ?? '4', 10);
    const minScore = parseFloat(
      this.configService.get('SIMULATION_RAG_MIN_SCORE') ??
        this.configService.get('RAG_SEMANTIC_MIN_SCORE') ??
        '0.28',
    );
    const nearMissScore = parseFloat(
      this.configService.get('SIMULATION_RAG_NEAR_MISS_SCORE') ?? '0.18',
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
          source: (row.metadata as Record<string, unknown> | null | undefined)
            ?.source as string | undefined,
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
          source: (row.metadata as Record<string, unknown> | null | undefined)
            ?.source as string | undefined,
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
    const matchedRules = INTENT_RULES.filter((rule) =>
      rule.keywords.some((keyword) => normalizedQuestion.includes(keyword)),
    );

    const sectionPatterns = matchedRules.flatMap(
      (rule) => rule.sectionPatterns,
    );
    if (this.isChiefComplaintQuestion(normalizedQuestion)) {
      sectionPatterns.unshift(
        /^chief_complaint$/,
        /^opening_profile$/,
        /^intro$/,
      );
    }
    if (this.isLifestyleSocialQuestion(normalizedQuestion)) {
      sectionPatterns.unshift(/^history_social$/);
    }

    if (sectionPatterns.length === 0) return null;

    const chunks = await this.simulationChunkRepository.findByCaseId(caseId);
    const matchedChunks = chunks
      .filter((chunk) =>
        sectionPatterns.some((pattern) => pattern.test(chunk.section)),
      )
      .sort(
        (a, b) =>
          this.chunkPriority(a.section, normalizedQuestion, a.text) -
          this.chunkPriority(b.section, normalizedQuestion, b.text),
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
      `SimulationRAG intent=${matchedRules.map((rule) => rule.name).join('+') || 'lifestyle_social'}: ${JSON.stringify(rawResults)}`,
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
        source: (chunk.metadata as Record<string, unknown> | null | undefined)
          ?.source as string | undefined,
      })),
      isFallback: false,
      rawResults,
      hasSimulationChunks: true,
    };
  }

  private isLifestyleSocialQuestion(text: string): boolean {
    if (
      this.matchesAny(text, [
        '음주력',
        '사회력',
        '생활습관',
        '담배',
        '흡연',
        '직업',
        '카페인',
        '커피',
      ])
    ) {
      return true;
    }

    if (
      this.matchesAny(text, ['술', '음주', '마시']) &&
      this.matchesAny(text, [
        '한 달',
        '한달',
        '평소',
        '자주',
        '얼마나',
        '몇 번',
        '몇번',
        '주량',
      ])
    ) {
      return true;
    }

    if (
      text.includes('스트레스') &&
      this.matchesAny(text, ['받', '많', '심', '있', '없', '요'])
    ) {
      return true;
    }

    if (!text.includes('운동')) {
      return false;
    }

    return !this.isExerciseAggravationQuestion(text);
  }

  private isChiefComplaintQuestion(text: string): boolean {
    return this.matchesAny(text, [
      '어떤 증상',
      '무슨 증상',
      '증상 때문에',
      '어디가 불편',
      '어디 불편',
      '어디가 아프',
      '어디 아프',
      '뭐가 아프',
      '무슨 일',
      '왜 오',
      '아파서 오',
      '아프셔서 오',
      '불편해서 오',
      '오셨',
      '오셨어',
      '내원',
      '방문',
    ]);
  }

  private isExerciseAggravationQuestion(text: string): boolean {
    return (
      text.includes('운동') &&
      this.matchesAny(text, [
        '할 때',
        '할때',
        '하면',
        '후',
        '중',
        '심해',
        '아프',
        '악화',
        '완화',
        '나빠',
        '좋아',
      ])
    );
  }

  private chunkPriority(
    section: string,
    question: string,
    answer: string,
  ): number {
    if (this.isChiefComplaintQuestion(question)) {
      if (
        section === 'chief_complaint' ||
        section === 'opening_profile' ||
        section === 'intro'
      ) {
        return 0;
      }
      if (section === 'history_location') return 5;
    }

    if (this.isExerciseAggravationQuestion(question)) {
      if (section === 'history_factors') return 0;
      if (section.startsWith('history_character')) return 1;
      if (section === 'history_social') return 3;
    }

    if (this.isLifestyleSocialQuestion(question)) {
      const directlyRelevant = this.answerMentionsLifestyleTerm(
        answer,
        question,
      );
      if (directlyRelevant && section === 'history_social') return 0;
      if (directlyRelevant && section === 'history_associated') return 1;
      if (directlyRelevant) return 2;
      if (section === 'history_social') return 5;
      if (section === 'history_associated') return 6;
    }

    if (section === 'history_associated') return 1;
    if (section === 'history_social') return 2;
    return 10;
  }

  private answerMentionsLifestyleTerm(
    answer: string,
    question: string,
  ): boolean {
    if (this.matchesAny(question, ['술', '음주', '마시', '주량'])) {
      return (
        /(^|[^가-힣])술/.test(answer) ||
        this.matchesAny(answer, [
          '음주',
          '과음',
          '음주량',
          '전날과음',
          '평소보다술',
          '술 때문에',
          '임신중술',
        ])
      );
    }

    if (question.includes('스트레스')) {
      return answer.includes('스트레스');
    }

    if (question.includes('운동')) {
      return answer.includes('운동');
    }

    if (this.matchesAny(question, ['커피', '카페인'])) {
      return this.matchesAny(answer, ['커피', '카페인']);
    }

    if (this.matchesAny(question, ['담배', '흡연'])) {
      return this.matchesAny(answer, ['담배', '흡연']);
    }

    if (question.includes('직업')) {
      return answer.includes('직업');
    }

    return false;
  }

  private matchesAny(text: string, patterns: string[]): boolean {
    return patterns.some((pattern) => text.includes(pattern));
  }
}
