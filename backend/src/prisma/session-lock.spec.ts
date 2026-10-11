import { PrismaService } from './prisma.service';

function lockHarness() {
  const client = {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    release: jest.fn(),
  };
  const service = Object.create(PrismaService.prototype) as PrismaService;
  Object.defineProperty(service, 'sessionLockPool', {
    value: { connect: jest.fn().mockResolvedValue(client) },
  });
  return { service, client };
}
describe('Database session lock lifecycle', () => {
  it('holds the database lock until the complete turn finishes', async () => {
    const { service, client } = lockHarness();
    const value = await service.withSessionLock('session-id', async () => {
      expect(client.query).toHaveBeenCalledWith(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        ['session-id'],
      );
      expect(client.release).not.toHaveBeenCalled();
      return 42;
    });
    expect(value).toBe(42);
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledWith(undefined);
  });
  it('releases the lock when generation fails', async () => {
    const { service, client } = lockHarness();
    await expect(
      service.withSessionLock('s', async () => {
        throw new Error('generation failed');
      }),
    ).rejects.toThrow('generation failed');
    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });
  it('destroys a connection if unlocking fails', async () => {
    const { service, client } = lockHarness();
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('connection lost'));
    await service.withSessionLock('s', async () => true);
    expect(client.release).toHaveBeenCalledWith(expect.any(Error));
  });
});
