import { BadGatewayException, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ApiCostService } from './api-cost.service';

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private readonly model: string;
  private readonly dimensions?: number;

  constructor(private readonly configService: ConfigService, @Optional() private readonly costs: ApiCostService = new ApiCostService(configService)) {
    this.model =
      this.configService.get<string>('OPENAI_EMBEDDING_MODEL') ??
      'text-embedding-3-large';
    this.dimensions = this.parseDimensions(
      this.configService.get<string>('OPENAI_EMBEDDING_DIMENSIONS'),
    );
  }

  async embed(text: string): Promise<number[]> {
    try {
      const client = this.getClient();
      const request = {
        model: this.model,
        input: text,
        ...(this.dimensions ? { dimensions: this.dimensions } : {}),
      };
      const response = await this.costs.execute('embedding', this.model, request, 0, () => client.embeddings.create(request));

      const embedding = response.data[0]?.embedding;
      if (!embedding || embedding.length === 0) {
        throw new Error('Empty embedding response');
      }

      return embedding;
    } catch (error) {
      this.logger.warn('Embedding unavailable');
      throw new BadGatewayException({
        message: 'Failed to generate embedding',
        detail: 'embedding_unavailable',
      });
    }
  }

  async embedBatch(
    texts: Array<{ id: string; text: string }>,
  ): Promise<
    Array<{ id: string; embedding: number[] | null; error?: string }>
  > {
    const results: Array<{
      id: string;
      embedding: number[] | null;
      error?: string;
    }> = [];

    for (let offset = 0; offset < texts.length; offset += 64) {
      const batch = texts.slice(offset, offset + 64);
      try {
        if (batch.some((item) => !item.text.trim()))
          throw new Error('Empty embedding input');
        const client = this.getClient();
        const request = {
          model: this.model,
          input: batch.map((item) => item.text),
          ...(this.dimensions ? { dimensions: this.dimensions } : {}),
        };
        const response = await this.costs.execute('embedding', this.model, request, 0, () => client.embeddings.create(request));
        const embeddings = new Map(
          response.data.map((row) => [row.index, row.embedding]),
        );
        const lengths = new Set(
          response.data.map((row) => row.embedding.length),
        );
        if (
          embeddings.size !== batch.length ||
          batch.some((_, i) => !embeddings.has(i)) ||
          lengths.size !== 1 ||
          response.data.some(
            (row) =>
              !row.embedding.length ||
              row.embedding.some((n) => !Number.isFinite(n)) ||
              !row.embedding.some((n) => n !== 0) ||
              (this.dimensions && row.embedding.length !== this.dimensions),
          )
        )
          throw new Error('Invalid embedding batch');
        for (const [i, item] of batch.entries()) {
          const embedding = embeddings.get(i);
          if (!embedding) throw new Error('Missing embedding');
          results.push({ id: item.id, embedding });
        }
        this.logger.log(
          JSON.stringify({
            event: 'embedding.batch.completed',
            model: this.model,
            dimensions: [...lengths][0],
            count: batch.length,
            usage: response.usage,
          }),
        );
      } catch {
        this.logger.warn(
          JSON.stringify({
            event: 'embedding.batch.failed',
            count: batch.length,
          }),
        );
        for (const item of batch)
          results.push({
            id: item.id,
            embedding: null,
            error: 'embedding_unavailable',
          });
      }
    }

    return results;
  }

  getCacheKey(): string {
    return `model=${this.model};dimensions=${this.dimensions ?? 'default'}`;
  }

  private parseDimensions(value?: string): number | undefined {
    if (!value) return undefined;

    const dimensions = Number(value);
    if (!Number.isInteger(dimensions) || dimensions <= 0) {
      throw new Error('OPENAI_EMBEDDING_DIMENSIONS must be a positive integer');
    }

    return dimensions;
  }

  private getClient(): OpenAI {
    if (this.configService.get<string>('PATIENT_AI_ENABLED') !== 'true')
      throw new BadGatewayException('Embedding generation is disabled');
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!apiKey || apiKey === 'sk-your-api-key') {
      throw new BadGatewayException({
        message: 'OpenAI API key is not configured',
      });
    }

    return new OpenAI({ apiKey, timeout: 20000, maxRetries: 0 });
  }
}
