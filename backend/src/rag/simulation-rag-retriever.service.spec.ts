import { ConfigService } from '@nestjs/config';
import { EmbeddingsService } from '../llm/embeddings.service';
import { SimulationChunkRepository } from './simulation-chunk.repository';
import { SimulationRagRetrieverService } from './simulation-rag-retriever.service';

const CASE_ID = 'case-id';
const DUMMY_EMBEDDING = Array(1536).fill(0.1);

const chunks = [
  {
    id: 'chest_pain-001:intro',
    simulationCaseId: 'chest_pain-001',
    topicId: 'chest_pain',
    topicLabel: '가슴통증',
    section: 'intro',
    text: '첫 발화: 가슴이 아파요',
    semanticScore: 1,
  },
  {
    id: 'chest_pain-001:history_onset',
    simulationCaseId: 'chest_pain-001',
    topicId: 'chest_pain',
    topicLabel: '가슴통증',
    section: 'history_onset',
    text: '5일 전 퇴근 후 버스 기다리다가 갑자기 발생',
    semanticScore: 1,
  },
  {
    id: 'chest_pain-001:history_factors',
    simulationCaseId: 'chest_pain-001',
    topicId: 'chest_pain',
    topicLabel: '가슴통증',
    section: 'history_factors',
    text: '운동/움직일 때 심해짐, 기침하면 아픔',
    semanticScore: 1,
  },
  {
    id: 'chest_pain-001:history_past_history',
    simulationCaseId: 'chest_pain-001',
    topicId: 'chest_pain',
    topicLabel: '가슴통증',
    section: 'history_past_history',
    text: '알레르기 비염',
    semanticScore: 1,
  },
];

const lifestyleChunks = [
  {
    id: 'seizure_case_04:history_associated',
    simulationCaseId: 'seizure_case_04',
    topicId: 'seizure',
    topicLabel: '경련',
    section: 'history_associated',
    text: '[동반 증상 / 유발 인자] [F] 평소보다술많이마심(+) 음주량: 소주 2병, 맥주 2병 평소음주량: 소주 1병',
    semanticScore: 1,
  },
  {
    id: 'seizure_case_04:history_social',
    simulationCaseId: 'seizure_case_04',
    topicId: 'seizure',
    topicLabel: '경련',
    section: 'history_social',
    text: '[사회력] 술: 한 달 1-2번 커피: 1-2잔 담배(-) 직업: 학생 스트레스(+) 식사: 규칙적 운동(-)',
    semanticScore: 1,
  },
  {
    id: 'seizure_case_04:history_factors',
    simulationCaseId: 'seizure_case_04',
    topicId: 'seizure',
    topicLabel: '경련',
    section: 'history_factors',
    text: '운동할 때 심해짐',
    semanticScore: 1,
  },
];

const stressOnlyInAssociatedChunks = [
  {
    id: 'seizure_case_07:history_associated',
    simulationCaseId: 'seizure_case_07',
    topicId: 'seizure',
    topicLabel: '경련',
    section: 'history_associated',
    text: '[동반 증상 / 유발 인자] [F] 내원전날과음(+) 최근학업스트레스(+)',
    semanticScore: 1,
  },
  {
    id: 'seizure_case_07:history_social',
    simulationCaseId: 'seizure_case_07',
    topicId: 'seizure',
    topicLabel: '경련',
    section: 'history_social',
    text: '[사회력] 술: social 담배(-)',
    semanticScore: 1,
  },
];

const chiefComplaintAndLocationChunks = [
  {
    id: 'seizure_case_04:L',
    simulationCaseId: 'seizure_case_04',
    topicId: 'seizure',
    topicLabel: '경련',
    section: 'history_location',
    text: '누워있는 자세로 쓰러짐',
    semanticScore: 1,
  },
  {
    id: 'seizure_case_04:chief_complaint',
    simulationCaseId: 'seizure_case_04',
    topicId: 'seizure',
    topicLabel: '경련',
    section: 'chief_complaint',
    text: '주호소: 몸이 떨렸다고 들었어요',
    semanticScore: 1,
  },
];

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService {
  return {
    get: jest.fn((key: string) => {
      const defaults: Record<string, unknown> = {
        SIMULATION_RAG_TOP_K: 4,
        SIMULATION_RAG_MIN_SCORE: 0.28,
        SIMULATION_RAG_NEAR_MISS_SCORE: 0.18,
        ...overrides,
      };
      return defaults[key];
    }),
  } as unknown as ConfigService;
}

function makeRepo(): jest.Mocked<SimulationChunkRepository> {
  return {
    countByCaseId: jest.fn().mockResolvedValue(chunks.length),
    findByCaseId: jest.fn().mockResolvedValue(chunks),
    searchByCaseId: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<SimulationChunkRepository>;
}

function makeEmbeddings(): jest.Mocked<EmbeddingsService> {
  return {
    embed: jest.fn().mockResolvedValue(DUMMY_EMBEDDING),
    embedBatch: jest.fn(),
  } as unknown as jest.Mocked<EmbeddingsService>;
}

describe('SimulationRagRetrieverService', () => {
  it('routes chief complaint questions to the intro chunk', async () => {
    const repo = makeRepo();
    const retriever = new SimulationRagRetrieverService(
      repo,
      makeEmbeddings(),
      makeConfig(),
    );

    const result = await retriever.retrieve({
      caseId: CASE_ID,
      question: '안녕하세요 오늘 어떤 증상 때문에 오셨나요?',
    });

    expect(result.isFallback).toBe(false);
    expect(result.facts[0].id).toBe('chest_pain-001:intro');
    expect(repo.searchByCaseId.mock.calls).toHaveLength(0);
  });

  it('routes "where does it hurt" visit-reason wording to chief complaint', async () => {
    const repo = makeRepo();
    repo.findByCaseId.mockResolvedValue(chiefComplaintAndLocationChunks);
    const retriever = new SimulationRagRetrieverService(
      repo,
      makeEmbeddings(),
      makeConfig(),
    );

    const result = await retriever.retrieve({
      caseId: CASE_ID,
      question: '어디가 아프셔서 오셨어요?',
    });

    expect(result.isFallback).toBe(false);
    expect(result.facts[0].id).toBe('seizure_case_04:chief_complaint');
    expect(repo.searchByCaseId.mock.calls).toHaveLength(0);
  });

  it('routes onset questions to the onset chunk', async () => {
    const repo = makeRepo();
    const retriever = new SimulationRagRetrieverService(
      repo,
      makeEmbeddings(),
      makeConfig(),
    );

    const result = await retriever.retrieve({
      caseId: CASE_ID,
      question: '가슴이 아프기 시작한 건 언제부터인가요?',
    });

    expect(result.isFallback).toBe(false);
    expect(result.facts[0].id).toBe('chest_pain-001:history_onset');
  });

  it('routes movement-related pain questions to the factor chunk', async () => {
    const repo = makeRepo();
    const retriever = new SimulationRagRetrieverService(
      repo,
      makeEmbeddings(),
      makeConfig(),
    );

    const result = await retriever.retrieve({
      caseId: CASE_ID,
      question: '움직이는 거나 걸을 때 더 아픈가요?',
    });

    expect(result.isFallback).toBe(false);
    expect(result.facts[0].id).toBe('chest_pain-001:history_factors');
  });

  it('routes past medical history questions to the past history chunk', async () => {
    const repo = makeRepo();
    const retriever = new SimulationRagRetrieverService(
      repo,
      makeEmbeddings(),
      makeConfig(),
    );

    const result = await retriever.retrieve({
      caseId: CASE_ID,
      question: '평소에 앓고 있는 질환이 있어요?',
    });

    expect(result.isFallback).toBe(false);
    expect(result.facts[0].id).toBe('chest_pain-001:history_past_history');
  });

  it('routes situation/context questions (처음 상황) to the onset chunk', async () => {
    const repo = makeRepo();
    const retriever = new SimulationRagRetrieverService(
      repo,
      makeEmbeddings(),
      makeConfig(),
    );

    const result = await retriever.retrieve({
      caseId: CASE_ID,
      question: '처음 아팠을 때는 어떤 상황이었어요?',
    });

    expect(result.isFallback).toBe(false);
    expect(['chest_pain-001:history_onset']).toContain(result.facts[0].id);
  });

  it('routes chronic disease questions (지병) to the past history chunk', async () => {
    const repo = makeRepo();
    const retriever = new SimulationRagRetrieverService(
      repo,
      makeEmbeddings(),
      makeConfig(),
    );

    const result = await retriever.retrieve({
      caseId: CASE_ID,
      question: '지병 있어요?',
    });

    expect(result.isFallback).toBe(false);
    expect(result.facts[0].id).toBe('chest_pain-001:history_past_history');
  });

  it('routes aggravation questions (더 아프) to the factors chunk', async () => {
    const repo = makeRepo();
    const retriever = new SimulationRagRetrieverService(
      repo,
      makeEmbeddings(),
      makeConfig(),
    );

    const result = await retriever.retrieve({
      caseId: CASE_ID,
      question: '더 아픈가요?',
    });

    expect(result.isFallback).toBe(false);
    expect(result.facts[0].id).toBe('chest_pain-001:history_factors');
  });

  it('prioritizes social history for follow-up monthly drinking questions', async () => {
    const repo = makeRepo();
    repo.findByCaseId.mockResolvedValue(lifestyleChunks);
    const retriever = new SimulationRagRetrieverService(
      repo,
      makeEmbeddings(),
      makeConfig(),
    );

    const result = await retriever.retrieve({
      caseId: CASE_ID,
      question: '한달에 얼마나 마시는지는요?',
    });

    expect(result.isFallback).toBe(false);
    expect(result.facts[0].id).toBe('seizure_case_04:history_social');
    expect(repo.searchByCaseId.mock.calls).toHaveLength(0);
  });

  it('prioritizes social history for stress questions', async () => {
    const repo = makeRepo();
    repo.findByCaseId.mockResolvedValue(lifestyleChunks);
    const retriever = new SimulationRagRetrieverService(
      repo,
      makeEmbeddings(),
      makeConfig(),
    );

    const result = await retriever.retrieve({
      caseId: CASE_ID,
      question: '스트레스는 많이 받나요?',
    });

    expect(result.isFallback).toBe(false);
    expect(result.facts[0].id).toBe('seizure_case_04:history_social');
  });

  it('prioritizes associated history when stress is only documented there', async () => {
    const repo = makeRepo();
    repo.findByCaseId.mockResolvedValue(stressOnlyInAssociatedChunks);
    const retriever = new SimulationRagRetrieverService(
      repo,
      makeEmbeddings(),
      makeConfig(),
    );

    const result = await retriever.retrieve({
      caseId: CASE_ID,
      question: '스트레스는 많이 받나요?',
    });

    expect(result.isFallback).toBe(false);
    expect(result.facts[0].id).toBe('seizure_case_07:history_associated');
  });

  it('routes exercise habit questions to social history', async () => {
    const repo = makeRepo();
    repo.findByCaseId.mockResolvedValue(lifestyleChunks);
    const retriever = new SimulationRagRetrieverService(
      repo,
      makeEmbeddings(),
      makeConfig(),
    );

    const result = await retriever.retrieve({
      caseId: CASE_ID,
      question: '운동은 하세요?',
    });

    expect(result.isFallback).toBe(false);
    expect(result.facts[0].id).toBe('seizure_case_04:history_social');
  });

  it('keeps exercise aggravation questions on the factor chunk', async () => {
    const repo = makeRepo();
    repo.findByCaseId.mockResolvedValue(lifestyleChunks);
    const retriever = new SimulationRagRetrieverService(
      repo,
      makeEmbeddings(),
      makeConfig(),
    );

    const result = await retriever.retrieve({
      caseId: CASE_ID,
      question: '운동할 때 더 아픈가요?',
    });

    expect(result.isFallback).toBe(false);
    expect(result.facts[0].id).toBe('seizure_case_04:history_factors');
  });

  it('returns NEAR_MISS fallback when semantic score is between nearMissScore and minScore', async () => {
    const repo = makeRepo();
    repo.findByCaseId.mockResolvedValue([]);
    repo.searchByCaseId.mockResolvedValue([
      {
        id: 'chest_pain-001:history_factors',
        simulationCaseId: 'chest_pain-001',
        topicId: 'chest_pain',
        topicLabel: '가슴통증',
        section: 'history_factors',
        text: '운동/움직일 때 심해짐',
        semanticScore: 0.15,
        metadata: null,
      },
    ]);

    const retriever = new SimulationRagRetrieverService(
      repo,
      makeEmbeddings(),
      makeConfig({
        SIMULATION_RAG_MIN_SCORE: 0.2,
        SIMULATION_RAG_NEAR_MISS_SCORE: 0.1,
      }),
    );

    const result = await retriever.retrieve({
      caseId: CASE_ID,
      question: '뭔가 하면 더 아픈 게 있나요?',
    });

    expect(result.isFallback).toBe(true);
    expect(result.fallbackType).toBe('NEAR_MISS');
    expect(result.facts.length).toBeGreaterThan(0);
  });

  it('enriches semantic embedding query with conversationContext', async () => {
    const repo = makeRepo();
    repo.findByCaseId.mockResolvedValue([]);
    const embeddings = makeEmbeddings();
    const retriever = new SimulationRagRetrieverService(
      repo,
      embeddings,
      makeConfig(),
    );

    await retriever.retrieve({
      caseId: CASE_ID,
      question: '더 아픈 게 있어요?',
      conversationContext: '가슴이 아파요',
    });

    const embedCalls = (
      embeddings.embed as jest.MockedFunction<EmbeddingsService['embed']>
    ).mock.calls;
    const embeddingCall = embedCalls[0]?.[0] ?? '';
    expect(embeddingCall).toContain('가슴이 아파요');
    expect(embeddingCall).toContain('더 아픈 게 있어요?');
  });
});
