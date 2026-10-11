import { ConfigService } from '@nestjs/config';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApiCostService } from './api-cost.service';
describe('API cost reservations', () => {
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'cpx-cost-'));
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));
  const config = (path: string, budget = '2', reserve = '0') =>
    ({
      get: (k: string) =>
        (
          ({
            API_BUDGET_USD: budget,
            API_USAGE_LEDGER_PATH: path,
            API_EVALUATION_RESERVE_USD: reserve,
          }) as Record<string, string>
        )[k],
    }) as ConfigService;
  it('counts cached input once and reasoning within output even for a truncated response', async () => {
    const service = new ApiCostService(config(join(directory, 'usage.json')));
    await service.context({ sessionId: 's1', requestId: 'r1' }, () =>
      service.execute('generation', 'gpt-4.1-mini', {}, 1024, async () => ({
        finish_reason: 'length',
        usage: {
          prompt_tokens: 1000,
          completion_tokens: 500,
          total_tokens: 1500,
          prompt_tokens_details: { cached_tokens: 200 },
          completion_tokens_details: { reasoning_tokens: 300 },
        },
      })),
    );
    const row = service.snapshot().entries[0];
    expect(row.costUsd).toBeCloseTo(0.00114, 8);
    expect(row.sessionId).toBe('s1');
    expect(row.status).toBe('received');
  });
  it('blocks unpriced models and calls that consume the evaluation reserve', async () => {
    const service = new ApiCostService(
      config(join(directory, 'usage.json'), '0.01', '0.009'),
    );
    const provider = jest.fn();
    await expect(
      service.execute('generation', 'unknown', {}, 100, provider),
    ).rejects.toThrow('budget_price_unknown');
    await expect(
      service.execute('generation', 'gpt-4.1-mini', {}, 1000, provider),
    ).rejects.toThrow('budget_exhausted');
    expect(provider).not.toHaveBeenCalled();
  });
  it('keeps missing-usage reservations across process instances and prevents concurrent overspend', async () => {
    const path = join(directory, 'usage.json');
    const a = new ApiCostService(config(path, '0.004'));
    const b = new ApiCostService(config(path, '0.004'));
    let release!: () => void;
    const call = a.execute(
      'generation',
      'gpt-4.1-mini',
      {},
      1024,
      () =>
        new Promise((resolve) => {
          release = () => resolve({});
        }),
    );
    await expect(
      b.execute('generation', 'gpt-4.1-mini', {}, 1024, async () => ({})),
    ).rejects.toThrow('budget_exhausted');
    release();
    await call;
    expect(b.snapshot().entries[0].status).toBe('usage_unknown');
    expect(b.snapshot().entries[0].reservedUsd).toBeGreaterThan(0);
  });
  it('records transport failures without retrying or declaring them free', async () => {
    const service = new ApiCostService(config(join(directory, 'usage.json')));
    const call = jest.fn(async () => {
      throw new Error('transport');
    });
    await expect(
      service.execute('embedding', 'text-embedding-3-small', {}, 0, call),
    ).rejects.toThrow('transport');
    expect(call).toHaveBeenCalledTimes(1);
    expect(service.snapshot().entries[0].costUsd).toBeNull();
  });
});
