import { CaseFactRepository } from './case-fact.repository';

describe('Embedding invalidation and retry', () => {
  const data = {
    caseId: 'case',
    category: 'onset',
    label: '시점',
    answer: '오늘',
    questionExamples: [],
    triggerKeywords: [],
    searchText: '오늘',
    contentHash: 'new',
    priority: 1,
    isCritical: false,
  };
  it('marks changed facts for re-embedding', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [{ id: 'fact', content_hash: 'old', has_embedding: true }],
      })
      .mockResolvedValueOnce({ rows: [] });
    const result = await new CaseFactRepository({
      pgPool: { query },
    } as any).upsert(data);
    expect(result.needsEmbedding).toBe(true);
    expect(result.hashChanged).toBe(true);
  });
  it('retries an unchanged fact whose previous embedding failed', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [{ id: 'fact', content_hash: 'new', has_embedding: false }],
      })
      .mockResolvedValueOnce({ rows: [] });
    const result = await new CaseFactRepository({
      pgPool: { query },
    } as any).upsert(data);
    expect(result.hashChanged).toBe(false);
    expect(result.needsEmbedding).toBe(true);
  });
  it('keeps the current vector when both content and embedding are present', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [{ id: 'fact', content_hash: 'new', has_embedding: true }],
      })
      .mockResolvedValueOnce({ rows: [] });
    expect(
      (await new CaseFactRepository({ pgPool: { query } } as any).upsert(data))
        .needsEmbedding,
    ).toBe(false);
  });
});
