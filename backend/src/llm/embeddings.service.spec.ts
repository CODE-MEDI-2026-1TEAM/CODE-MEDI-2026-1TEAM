import { ConfigService } from '@nestjs/config';
import { EmbeddingsService } from './embeddings.service';
describe('Actual embedding batches', () => {
  it('uses one array request and maps reordered response indices correctly', async () => {
    const service = new EmbeddingsService({
      get: () => undefined,
    } as unknown as ConfigService);
    const create = jest.fn(async (_input: unknown) => ({
      data: [
        { index: 1, embedding: [0, 1] },
        { index: 0, embedding: [1, 0] },
      ],
    }));
    jest
      .spyOn(service as any, 'getClient')
      .mockReturnValue({ embeddings: { create } });
    const result = await service.embedBatch([
      { id: 'a', text: 'first' },
      { id: 'b', text: 'second' },
    ]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({
      input: ['first', 'second'],
    });
    expect(result).toEqual([
      { id: 'a', embedding: [1, 0] },
      { id: 'b', embedding: [0, 1] },
    ]);
  });
  it('rejects invalid indices without returning duplicated partial results', async () => {
    const service = new EmbeddingsService({
      get: () => undefined,
    } as unknown as ConfigService);
    jest.spyOn(service as any, 'getClient').mockReturnValue({
      embeddings: {
        create: async () => ({
          data: [
            { index: 0, embedding: [1, 0] },
            { index: 2, embedding: [0, 1] },
          ],
        }),
      },
    });
    const result = await service.embedBatch([
      { id: 'a', text: 'first' },
      { id: 'b', text: 'second' },
    ]);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.embedding === null)).toBe(true);
  });
  it('does not make paid requests when model calls are disabled', async () => {
    const service = new EmbeddingsService({
      get: () => undefined,
    } as unknown as ConfigService);
    expect(
      (await service.embedBatch([{ id: 'a', text: 'test' }]))[0].error,
    ).toBe('embedding_unavailable');
  });
});
