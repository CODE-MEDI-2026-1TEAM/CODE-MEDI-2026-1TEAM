import { BadRequestException } from '@nestjs/common';
import { CasesService } from '../cases/cases.service';
import { EmbeddingsService } from '../llm/embeddings.service';
import { CaseFactImportService } from './case-fact-import.service';
import { CaseFactRepository } from './case-fact.repository';

function makeCasesService(): jest.Mocked<CasesService> {
  return {
    findOneInternal: jest.fn().mockResolvedValue({
      id: 'case-id-abc',
      chiefComplaint: '경련',
    }),
  } as unknown as jest.Mocked<CasesService>;
}

function makeRepo(): jest.Mocked<CaseFactRepository> {
  return {
    upsert: jest
      .fn()
      .mockResolvedValue({ id: 'fact-1', isNew: true, hashChanged: false }),
    updateEmbedding: jest.fn().mockResolvedValue(undefined),
    searchByCaseId: jest.fn(),
    findFactsNeedingEmbedding: jest.fn(),
    findByCaseId: jest.fn(),
  } as unknown as jest.Mocked<CaseFactRepository>;
}

function makeEmbeddings(): jest.Mocked<EmbeddingsService> {
  return {
    embed: jest.fn().mockResolvedValue(Array(1536).fill(0.1)),
    embedBatch: jest.fn(),
  } as unknown as jest.Mocked<EmbeddingsService>;
}

const validFact = {
  category: 'onset',
  label: '증상 시작 시점',
  answer: '오늘 아침부터요.',
  questionExamples: ['언제부터요?'],
  triggerKeywords: ['언제'],
  priority: 80,
  isCritical: false,
};

describe('CaseFactImportService', () => {
  // Test 1: import JSON schema 오류 시 BadRequestException
  it('throws BadRequestException when case.id is missing', async () => {
    const service = new CaseFactImportService(
      makeCasesService(),
      makeRepo(),
      makeEmbeddings(),
    );

    await expect(
      service.importFacts({ case: { id: '' }, facts: [validFact] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when facts array is empty', async () => {
    const service = new CaseFactImportService(
      makeCasesService(),
      makeRepo(),
      makeEmbeddings(),
    );

    await expect(
      service.importFacts({ case: { id: 'case-id' }, facts: [] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when fact is missing required field', async () => {
    const service = new CaseFactImportService(
      makeCasesService(),
      makeRepo(),
      makeEmbeddings(),
    );

    const invalidFact = { ...validFact, answer: '' };

    await expect(
      service.importFacts({ case: { id: 'case-id' }, facts: [invalidFact] }),
    ).rejects.toThrow(BadRequestException);
  });

  // Test 2: contentHash 동일하면 embedding 재생성 스킵
  it('skips embedding when contentHash is unchanged', async () => {
    const repo = makeRepo();
    repo.upsert = jest.fn().mockResolvedValue({
      id: 'fact-1',
      isNew: false,
      hashChanged: false,
    });

    const embeddings = makeEmbeddings();
    const service = new CaseFactImportService(
      makeCasesService(),
      repo,
      embeddings,
    );

    await service.importFacts({
      case: { id: 'case-id' },
      facts: [validFact],
    });

    expect(embeddings.embed.mock.calls).toHaveLength(0);
  });

  // Test 3: 새 fact는 embedding 생성
  it('generates embedding for newly created facts', async () => {
    const repo = makeRepo();
    repo.upsert = jest.fn().mockResolvedValue({
      id: 'fact-1',
      isNew: true,
      hashChanged: false,
    });

    const embeddings = makeEmbeddings();
    const service = new CaseFactImportService(
      makeCasesService(),
      repo,
      embeddings,
    );

    await service.importFacts({
      case: { id: 'case-id' },
      facts: [validFact],
    });

    expect(embeddings.embed.mock.calls).toHaveLength(1);
    expect(repo.updateEmbedding.mock.calls).toEqual([
      ['fact-1', expect.any(Array)],
    ]);
  });

  // Test 4: searchText 자동 생성 형식 검증
  it('generates correct searchText format', () => {
    const service = new CaseFactImportService(
      makeCasesService(),
      makeRepo(),
      makeEmbeddings(),
    );

    const searchText = service.buildSearchText(validFact);

    expect(searchText).toContain('카테고리: onset / 증상 시작 시점');
    expect(searchText).toContain('의사가 할 수 있는 질문: 언제부터요?');
    expect(searchText).toContain('환자가 답할 수 있는 정보: 오늘 아침부터요.');
  });

  // Test 5: 정상 import 결과 형식 검증
  it('returns correct import result counts', async () => {
    const repo = makeRepo();
    repo.upsert = jest.fn().mockResolvedValue({
      id: 'fact-1',
      isNew: true,
      hashChanged: false,
    });

    const service = new CaseFactImportService(
      makeCasesService(),
      repo,
      makeEmbeddings(),
    );

    const result = await service.importFacts({
      case: { id: 'case-id' },
      facts: [validFact],
    });

    expect(result.totalFacts).toBe(1);
    expect(result.created).toBe(1);
    expect(result.embedded).toBe(1);
    expect(result.failed).toBe(0);
  });
});
