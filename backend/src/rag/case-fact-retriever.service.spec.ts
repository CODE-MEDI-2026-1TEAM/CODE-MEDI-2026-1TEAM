import { ConfigService } from '@nestjs/config';
import { EmbeddingsService } from '../llm/embeddings.service';
import { CaseFactRetrieverService } from './case-fact-retriever.service';
import { CaseFactRepository } from './case-fact.repository';

const CASE_A = 'case-id-a';
const CASE_B = 'case-id-b';

const DUMMY_EMBEDDING = Array(1536).fill(0.1);

const factA = {
  id: 'fact-a-1',
  category: 'onset',
  label: '증상 시작 시점',
  answer: '오늘 아침부터요.',
  triggerKeywords: ['언제부터', '시작', '발병'],
  semanticScore: 0.88,
};

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService {
  return {
    get: jest.fn((key: string) => {
      const defaults: Record<string, unknown> = {
        RAG_TOP_K: 3,
        RAG_MIN_SCORE: 0.38, // 프로덕션 .env와 동일
        RAG_SEMANTIC_MIN_SCORE: 0.3, // 신규: semantic 하한선
        RAG_VECTOR_WEIGHT: 0.75,
        RAG_KEYWORD_WEIGHT: 0.25,
        ...overrides,
      };
      return defaults[key];
    }),
  } as unknown as ConfigService;
}

function makeRepo(
  searchResults: (typeof factA)[],
): jest.Mocked<CaseFactRepository> {
  return {
    searchByCaseId: jest.fn().mockResolvedValue(searchResults),
    upsert: jest.fn(),
    updateEmbedding: jest.fn(),
    findFactsNeedingEmbedding: jest.fn(),
    findByCaseId: jest.fn(),
  } as unknown as jest.Mocked<CaseFactRepository>;
}

function makeEmbeddings(): jest.Mocked<EmbeddingsService> {
  return {
    embed: jest.fn().mockResolvedValue(DUMMY_EMBEDDING),
    embedBatch: jest.fn(),
  } as unknown as jest.Mocked<EmbeddingsService>;
}

describe('CaseFactRetrieverService', () => {
  // Test 1: caseId 필터 — searchByCaseId가 현재 caseId로만 호출되는지
  it('passes the correct caseId to repository search', async () => {
    const repo = makeRepo([factA]);
    const embeddings = makeEmbeddings();
    const retriever = new CaseFactRetrieverService(
      repo,
      embeddings,
      makeConfig(),
    );

    await retriever.retrieve({
      caseId: CASE_A,
      question: '언제부터 아팠어요?',
    });

    expect(repo.searchByCaseId.mock.calls).toContainEqual([
      CASE_A,
      DUMMY_EMBEDDING,
      3,
    ]);
  });

  // Test 2: 다른 caseId의 fact가 절대 검색되지 않는지 — caseId B로 검색 시 caseId A 쿼리 없음
  it('never queries facts from a different caseId', async () => {
    const repo = makeRepo([]);
    const embeddings = makeEmbeddings();
    const retriever = new CaseFactRetrieverService(
      repo,
      embeddings,
      makeConfig(),
    );

    await retriever.retrieve({ caseId: CASE_B, question: '약 먹고 있어요?' });

    const calls = repo.searchByCaseId.mock.calls;
    for (const [calledCaseId] of calls) {
      expect(calledCaseId).toBe(CASE_B);
      expect(calledCaseId).not.toBe(CASE_A);
    }
  });

  // Test 3: 유사한 질문이 적절한 fact를 반환하는지
  it('returns facts above minScore threshold', async () => {
    const repo = makeRepo([{ ...factA, semanticScore: 0.9 }]);
    const embeddings = makeEmbeddings();
    const retriever = new CaseFactRetrieverService(
      repo,
      embeddings,
      makeConfig(),
    );

    const result = await retriever.retrieve({
      caseId: CASE_A,
      question: '언제부터 아팠어요?',
    });

    expect(result.isFallback).toBe(false);
    expect(result.facts.length).toBeGreaterThan(0);
    expect(result.facts[0].id).toBe('fact-a-1');
  });

  // Test 4: triggerKeywords 일치 시 keywordScore 상승 확인
  it('increases finalScore when triggerKeywords match the question', async () => {
    const noKeywordFact = {
      ...factA,
      triggerKeywords: [],
      semanticScore: 0.8,
    };
    const keywordFact = {
      ...factA,
      id: 'fact-with-keywords',
      triggerKeywords: ['언제부터', '시작'],
      semanticScore: 0.8,
    };

    const repoNoKw = makeRepo([noKeywordFact]);
    const repoWithKw = makeRepo([keywordFact]);
    const embeddings = makeEmbeddings();
    const config = makeConfig();

    const r1 = new CaseFactRetrieverService(repoNoKw, embeddings, config);
    const r2 = new CaseFactRetrieverService(repoWithKw, embeddings, config);

    const res1 = await r1.retrieve({
      caseId: CASE_A,
      question: '언제부터 시작됐어요?',
    });
    const res2 = await r2.retrieve({
      caseId: CASE_A,
      question: '언제부터 시작됐어요?',
    });

    const score1 = res1.facts[0]?.finalScore ?? 0;
    const score2 = res2.facts[0]?.finalScore ?? 0;

    expect(score2).toBeGreaterThan(score1);
  });

  // Test 5: finalScore < minScore → isFallback: true (OUT_OF_SCOPE)
  it('returns OUT_OF_SCOPE fallback when all facts score below threshold', async () => {
    // semanticScore=0.2 → finalScore=0.15 (threshold 0.38 미달)
    const lowScoreFact = { ...factA, semanticScore: 0.2 };
    const repo = makeRepo([lowScoreFact]);
    const embeddings = makeEmbeddings();
    const retriever = new CaseFactRetrieverService(
      repo,
      embeddings,
      makeConfig(),
    );

    const result = await retriever.retrieve({
      caseId: CASE_A,
      question: '아무 질문',
    });

    expect(result.isFallback).toBe(true);
    // DB에 팩트는 있지만 threshold 미달 → OUT_OF_SCOPE
    expect(result.fallbackType).toBe('OUT_OF_SCOPE');
  });

  // Test 6: 검색되지 않은 fact가 반환값에 없는지
  it('only includes facts returned by repository (not all facts)', async () => {
    const repo = makeRepo([factA]);
    const embeddings = makeEmbeddings();
    const retriever = new CaseFactRetrieverService(
      repo,
      embeddings,
      makeConfig(),
    );

    const result = await retriever.retrieve({
      caseId: CASE_A,
      question: '언제부터요?',
    });

    const ids = result.facts.map((f) => f.id);
    expect(ids).toContain('fact-a-1');
    expect(ids).not.toContain('fact-b-1');
  });

  // Test 7: "모든 정보 알려줘" — fact 수가 제한되는지 (topK 이하)
  it('never returns more facts than topK', async () => {
    const manyFacts = Array.from({ length: 10 }, (_, i) => ({
      ...factA,
      id: `fact-${i}`,
      semanticScore: 0.9,
    }));
    const repo = makeRepo(manyFacts);
    const embeddings = makeEmbeddings();
    const retriever = new CaseFactRetrieverService(
      repo,
      embeddings,
      makeConfig({ RAG_TOP_K: 3 }),
    );

    const result = await retriever.retrieve({
      caseId: CASE_A,
      question: '모든 정보 알려줘',
    });

    // repository는 topK=3으로 제한하고 DB 레벨에서 LIMIT 적용
    expect(repo.searchByCaseId.mock.calls).toContainEqual([
      CASE_A,
      DUMMY_EMBEDDING,
      3,
    ]);
    expect(result.facts.length).toBeLessThanOrEqual(3);
  });

  // Test 8: DIAGNOSIS_REQUEST 패턴 → isFallback DIAGNOSIS_REQUEST
  it('returns DIAGNOSIS_REQUEST fallback for diagnosis-seeking questions', async () => {
    const repo = makeRepo([]);
    const embeddings = makeEmbeddings();
    const retriever = new CaseFactRetrieverService(
      repo,
      embeddings,
      makeConfig(),
    );

    const result = await retriever.retrieve({
      caseId: CASE_A,
      question: '무슨 병인가요?',
    });

    expect(result.isFallback).toBe(true);
    expect(result.fallbackType).toBe('DIAGNOSIS_REQUEST');
    expect(repo.searchByCaseId.mock.calls).toHaveLength(0);
  });

  // Test 9: embedding 실패 시 UNKNOWN fallback
  it('returns UNKNOWN fallback when embedding generation fails', async () => {
    const repo = makeRepo([]);
    const embeddings = makeEmbeddings();
    embeddings.embed = jest.fn().mockRejectedValue(new Error('API error'));
    const retriever = new CaseFactRetrieverService(
      repo,
      embeddings,
      makeConfig(),
    );

    const result = await retriever.retrieve({
      caseId: CASE_A,
      question: '통증이 어디에 있어요?',
    });

    expect(result.isFallback).toBe(true);
    expect(result.fallbackType).toBe('UNKNOWN');
  });

  // Test 10: 검색 결과 없을 때 BROAD_QUESTION fallback
  it('returns BROAD_QUESTION fallback when no facts are found', async () => {
    const repo = makeRepo([]);
    const embeddings = makeEmbeddings();
    const retriever = new CaseFactRetrieverService(
      repo,
      embeddings,
      makeConfig(),
    );

    const result = await retriever.retrieve({
      caseId: CASE_A,
      question: '어떠세요?',
    });

    expect(result.isFallback).toBe(true);
    expect(result.fallbackType).toBe('BROAD_QUESTION');
  });

  // Test 11: semanticMinScore 하한선 — keyword boost로 finalScore가 minScore를 넘어도 semantic이 낮으면 차단
  it('blocks a fact whose semanticScore is below semanticMinScore even after keyword boost', async () => {
    // semanticScore=0.25(< 0.30), keywordScore=1.0 → finalScore=0.4375(> 0.38)
    // → semantic 하한선에서 걸러져야 함
    const noisyFact = {
      ...factA,
      semanticScore: 0.25,
      triggerKeywords: ['언제부터', '시작', '발병'],
    };
    const repo = makeRepo([noisyFact]);
    const embeddings = makeEmbeddings();
    const retriever = new CaseFactRetrieverService(
      repo,
      embeddings,
      makeConfig({ RAG_MIN_SCORE: 0.38, RAG_SEMANTIC_MIN_SCORE: 0.3 }),
    );

    const result = await retriever.retrieve({
      caseId: CASE_A,
      question: '언제부터 시작 발병',
    });

    expect(result.isFallback).toBe(true);
    expect(result.fallbackType).toBe('OUT_OF_SCOPE');
    expect(result.facts).toHaveLength(0);
  });

  // Test 12: OUT_OF_SCOPE vs BROAD_QUESTION 구분
  //   - DB에 팩트가 1개 이상 있지만 모두 threshold 미달 → OUT_OF_SCOPE
  //   - DB 결과가 아예 0건 → BROAD_QUESTION
  it('distinguishes OUT_OF_SCOPE (facts exist but low score) from BROAD_QUESTION (no facts at all)', async () => {
    const embeddings = makeEmbeddings();

    // 케이스 1: DB에 팩트 없음 → BROAD_QUESTION
    const repoEmpty = makeRepo([]);
    const r1 = new CaseFactRetrieverService(
      repoEmpty,
      embeddings,
      makeConfig(),
    );
    const result1 = await r1.retrieve({
      caseId: CASE_A,
      question: '어떠세요?',
    });
    expect(result1.fallbackType).toBe('BROAD_QUESTION');

    // 케이스 2: 팩트는 있지만 score 낮음 → OUT_OF_SCOPE
    const repoLow = makeRepo([{ ...factA, semanticScore: 0.1 }]);
    const r2 = new CaseFactRetrieverService(repoLow, embeddings, makeConfig());
    const result2 = await r2.retrieve({
      caseId: CASE_A,
      question: '어떠세요?',
    });
    expect(result2.fallbackType).toBe('OUT_OF_SCOPE');
  });

  // Test 13: Korean 형태소 변형 진단 패턴 — '왜 아프신', '왜 아프세요' 등이 DIAGNOSIS_REQUEST로 처리되는지
  it('blocks Korean morphological variants of diagnosis-seeking questions', async () => {
    const repo = makeRepo([]);
    const embeddings = makeEmbeddings();
    const retriever = new CaseFactRetrieverService(
      repo,
      embeddings,
      makeConfig(),
    );

    const diagnosisVariants = [
      '왜 아프신 거예요?',
      '왜 아프세요?',
      '왜 이렇게 아프세요',
      '무슨 질환인가요?',
      '어떤 질환인지 알아요?',
      '어떻게 치료해야 하나요?',
      '나을 수 있을까요?',
    ];

    for (const question of diagnosisVariants) {
      const result = await retriever.retrieve({ caseId: CASE_A, question });
      expect(result.isFallback).toBe(true);
      expect(result.fallbackType).toBe('DIAGNOSIS_REQUEST');
      expect(repo.searchByCaseId.mock.calls).toHaveLength(0);
    }
  });

  // Test 14: 복합 질문 — topK=2일 때 최대 2개 반환
  it('caps results at topK even when multiple facts pass threshold', async () => {
    const highScoreFacts = [
      { ...factA, id: 'fact-1', semanticScore: 0.9 },
      { ...factA, id: 'fact-2', semanticScore: 0.85 },
      { ...factA, id: 'fact-3', semanticScore: 0.8 },
    ];
    const repo = makeRepo(highScoreFacts);
    const embeddings = makeEmbeddings();
    const retriever = new CaseFactRetrieverService(
      repo,
      embeddings,
      makeConfig({ RAG_TOP_K: 2 }),
    );

    const result = await retriever.retrieve({
      caseId: CASE_A,
      question: '통증이 언제부터 어디서 나나요?',
    });

    expect(result.isFallback).toBe(false);
    expect(result.facts.length).toBeLessThanOrEqual(2);
  });
});
