import {
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool, type PoolClient } from 'pg';
import { SessionWorkQueue, SessionQueueError } from './session-work-queue';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly pool: Pool;
  private readonly sessionLockPool: Pool;
  private workQueue?: SessionWorkQueue;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    const pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
    });
    const adapter = new PrismaPg(pool);
    super({ adapter });
    this.pool = pool;
    // Waiting session locks must not exhaust the pool used by Prisma and RAG queries.
    this.sessionLockPool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: positiveSetting('SESSION_LOCK_MAX', 4, 32),
      connectionTimeoutMillis: 15000,
    });
  }

  get pgPool(): Pool {
    return this.pool;
  }

  async withSessionLock<T>(
    sessionId: string,
    work: () => Promise<T>,
  ): Promise<T> {
    this.workQueue ??= new SessionWorkQueue(positiveSetting('SESSION_QUEUE_MAX', 8, 32));
    try { return await this.workQueue.run(sessionId, () => this.withDatabaseSessionLock(sessionId, work)); }
    catch (error) {
      if (error instanceof SessionQueueError) throw new ServiceUnavailableException({ code: error.message,
        message: '이전 질문을 처리 중입니다. 잠시 후 같은 요청으로 다시 보내 주세요.' });
      throw error;
    }
  }
  private async withDatabaseSessionLock<T>(sessionId: string, work: () => Promise<T>): Promise<T> {
    let client: PoolClient;
    try {
      client = await this.sessionLockPool.connect();
    } catch {
      throw new ServiceUnavailableException(
        '요청이 많습니다. 잠시 후 다시 시도해 주세요.',
      );
    }
    let transactionStarted = false;
    let releaseError: Error | undefined;
    try {
      await client.query('BEGIN');
      transactionStarted = true;
      await client.query('SET LOCAL statement_timeout = 30000');
      // An explicit transaction also pins the connection on transaction-pooling proxies.
      try {
        await client.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [sessionId],
        );
      } catch {
        throw new ServiceUnavailableException(
          '이전 질문을 처리 중입니다. 잠시 후 같은 질문을 다시 보내 주세요.',
        );
      }
      return await work();
    } finally {
      try {
        if (transactionStarted) await client.query('ROLLBACK');
      } catch (error) {
        releaseError =
          error instanceof Error
            ? error
            : new Error('Failed to release session lock');
      }
      // Destroy a failed connection instead of returning a potentially locked session to the pool.
      client.release(releaseError);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
    await this.sessionLockPool.end();
  }
}

function positiveSetting(key: string, fallback: number, maximum: number): number {
  const value = Number(process.env[key] ?? fallback);
  return Number.isInteger(value) && value > 0 ? Math.min(value, maximum) : fallback;
}
