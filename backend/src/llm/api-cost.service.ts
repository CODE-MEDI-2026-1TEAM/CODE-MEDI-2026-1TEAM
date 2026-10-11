import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';

// Standard text rates per million tokens, verified against official model pages 2026-10-11.
export const TEXT_PRICES: Record<
  string,
  { input: number; cached: number; output: number }
> = {
  'gpt-4.1-mini': { input: 0.4, cached: 0.1, output: 1.6 },
  'gpt-4.1-mini-2025-04-14': { input: 0.4, cached: 0.1, output: 1.6 },
  'gpt-4.1': { input: 2, cached: 0.5, output: 8 },
  'gpt-4.1-2025-04-14': { input: 2, cached: 0.5, output: 8 },
  'text-embedding-3-small': { input: 0.02, cached: 0.02, output: 0 },
  'text-embedding-3-large': { input: 0.13, cached: 0.13, output: 0 },
};
type Context = { sessionId?: string; requestId?: string };
type Entry = Context & {
  id: string;
  stage: string;
  model: string;
  startedAt: string;
  reservedUsd: number;
  costUsd: number | null;
  status: 'pending' | 'received' | 'usage_unknown';
  elapsedMs?: number;
  usage?: unknown;
};
type Ledger = {
  version: 1;
  priceDate: string;
  limitUsd: number | null;
  evaluationReserveUsd: number;
  entries: Entry[];
};
export class ApiBudgetError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
@Injectable()
export class ApiCostService {
  private readonly contexts = new AsyncLocalStorage<Context>();
  private memory: Ledger;
  private readonly file?: string;
  private readonly limit: number | null;
  constructor(private readonly config: ConfigService) {
    const raw = config.get<string>('API_BUDGET_USD');
    this.limit = raw === undefined || raw === '' ? null : Number(raw);
    if (
      this.limit !== null &&
      (!Number.isFinite(this.limit) || this.limit <= 0)
    )
      throw new ApiBudgetError('budget_config_invalid');
    const path = config.get<string>('API_USAGE_LEDGER_PATH');
    if (this.limit !== null && !path)
      throw new ApiBudgetError('budget_ledger_required');
    this.file = path ? resolve(path) : undefined;
    this.memory = {
      version: 1,
      priceDate: '2026-10-11',
      limitUsd: this.limit,
      evaluationReserveUsd: this.reserve(),
      entries: [],
    };
  }
  context<T>(context: Context, work: () => T): T {
    return this.contexts.run(context, work);
  }
  private reserve() {
    const value = Number(
      this.config.get<string>('API_EVALUATION_RESERVE_USD') ?? '0',
    );
    if (!Number.isFinite(value) || value < 0)
      throw new ApiBudgetError('budget_reserve_invalid');
    return value;
  }
  private edit<T>(work: (ledger: Ledger) => T): T {
    if (!this.file) return work(this.memory);
    mkdirSync(dirname(this.file), { recursive: true });
    let lock: number;
    try {
      lock = openSync(this.file + '.lock', 'wx');
    } catch {
      throw new ApiBudgetError('budget_ledger_busy');
    }
    try {
      const ledger: Ledger = existsSync(this.file)
        ? JSON.parse(readFileSync(this.file, 'utf8'))
        : this.memory;
      if (
        ledger.version !== 1 ||
        !Array.isArray(ledger.entries) ||
        ledger.limitUsd !== this.limit ||
        !Number.isFinite(ledger.evaluationReserveUsd) ||
        ledger.evaluationReserveUsd < 0 ||
        ledger.entries.some(
          (e) =>
            !e ||
            !Number.isFinite(e.reservedUsd) ||
            e.reservedUsd < 0 ||
            (e.costUsd !== null &&
              (!Number.isFinite(e.costUsd) || e.costUsd < 0)) ||
            !['pending', 'received', 'usage_unknown'].includes(e.status),
        )
      )
        throw new ApiBudgetError('budget_ledger_invalid');
      const result = work(ledger);
      // The exclusive lock serializes readers/writers across processes. Flush before
      // dispatching a paid call. Interrupted/corrupt writes fail closed on the next read.
      const output = openSync(this.file, 'w');
      try {
        writeFileSync(output, JSON.stringify(ledger, null, 2) + '\n');
        fsyncSync(output);
      } finally {
        closeSync(output);
      }
      this.memory = ledger;
      return result;
    } finally {
      closeSync(lock);
      unlinkSync(this.file + '.lock');
    }
  }
  snapshot() {
    return this.edit((ledger) => ({
      ...ledger,
      entries: ledger.entries.map((e) => ({ ...e })),
    }));
  }
  async execute<T extends { usage?: any }>(
    stage: string,
    model: string,
    request: unknown,
    maxOutput: number,
    call: () => Promise<T>,
  ): Promise<T> {
    const price = TEXT_PRICES[model];
    if (this.limit !== null && !price)
      throw new ApiBudgetError('budget_price_unknown');
    // Byte-level text tokenizers cannot produce more tokens than UTF-8 bytes.
    // Include schema/roles and a conservative protocol allowance; never assume a cache hit.
    const upperInput =
      Buffer.byteLength(JSON.stringify(request), 'utf8') + 4096;
    const reservedUsd = price
      ? (upperInput * price.input + maxOutput * price.output) / 1e6
      : 0;
    const entry: Entry = {
      ...this.contexts.getStore(),
      id: randomUUID(),
      stage,
      model,
      startedAt: new Date().toISOString(),
      reservedUsd,
      costUsd: null,
      status: 'pending',
    };
    this.edit((ledger) => {
      const spent = ledger.entries.reduce(
        (n, e) => n + (e.costUsd ?? e.reservedUsd),
        0,
      );
      const evaluation = stage === 'evaluation';
      const fromReserve = evaluation
        ? Math.min(ledger.evaluationReserveUsd, reservedUsd)
        : 0;
      if (
        this.limit !== null &&
        spent + reservedUsd + ledger.evaluationReserveUsd - fromReserve >
          this.limit
      )
        throw new ApiBudgetError('budget_exhausted');
      ledger.evaluationReserveUsd -= fromReserve;
      ledger.entries.push(entry);
    });
    const began = Date.now();
    try {
      const response = await call();
      this.edit((ledger) => {
        const row = ledger.entries.find((e) => e.id === entry.id)!;
        row.elapsedMs = Date.now() - began;
        const u = response.usage;
        if (
          u &&
          Number.isFinite(u.prompt_tokens) &&
          Number.isFinite(u.total_tokens)
        ) {
          const input = u.prompt_tokens;
          const output = u.completion_tokens ?? 0;
          const cached = u.prompt_tokens_details?.cached_tokens ?? 0;
          if (input < 0 || output < 0 || cached < 0 || cached > input)
            throw new ApiBudgetError('usage_invalid');
          row.usage = u;
          row.costUsd = price
            ? ((input - cached) * price.input +
                cached * price.cached +
                output * price.output) /
              1e6
            : null;
          row.status = 'received';
        } else {
          row.status = 'usage_unknown';
        }
      });
      return response;
    } catch (error) {
      this.edit((ledger) => {
        const row = ledger.entries.find((e) => e.id === entry.id)!;
        if (row.status === 'pending') {
          row.status = 'usage_unknown';
          row.elapsedMs = Date.now() - began;
        }
      });
      throw error;
    }
  }
}
