import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private readonly model: string;
  private readonly dimensions?: number;

  constructor(private readonly configService: ConfigService) {
    this.model =
      this.configService.get<string>('OPENAI_EMBEDDING_MODEL') ??
      'text-embedding-3-large';
    this.dimensions = this.parseDimensions(
      this.configService.get<string>('OPENAI_EMBEDDING_DIMENSIONS'),
    );
  }

  async embed(text: string): Promise<number[]> {
    try {
      const response = await this.getClient().embeddings.create({
        model: this.model,
        input: text,
        ...(this.dimensions ? { dimensions: this.dimensions } : {}),
      });

      const embedding = response.data[0]?.embedding;
      if (!embedding || embedding.length === 0) {
        throw new Error('Empty embedding response');
      }

      return embedding;
    } catch (error) {
      this.logger.error(
        `Embedding generation failed for text (${text.slice(0, 50)}...): ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new BadGatewayException({
        message: 'Failed to generate embedding',
        detail: error instanceof Error ? error.message : 'Unknown error',
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

    for (const item of texts) {
      try {
        const embedding = await this.embed(item.text);
        results.push({ id: item.id, embedding });
      } catch (error) {
        this.logger.error(
          `Failed to embed fact ${item.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        results.push({
          id: item.id,
          embedding: null,
          error: error instanceof Error ? error.message : 'Unknown error',
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
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!apiKey || apiKey === 'sk-your-api-key') {
      throw new BadGatewayException({
        message: 'OpenAI API key is not configured',
      });
    }

    return new OpenAI({ apiKey });
  }
}
