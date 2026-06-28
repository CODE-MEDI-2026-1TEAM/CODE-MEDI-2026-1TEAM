import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { CasesService } from '../cases/cases.service';
import { EmbeddingsService } from '../llm/embeddings.service';
import { CaseFactRepository } from './case-fact.repository';

type RawFactInput = {
  category: string;
  label: string;
  answer: string;
  questionExamples: string[];
  triggerKeywords: string[];
  priority?: number;
  isCritical?: boolean;
};

export type ImportInput = {
  case: { id: string; title?: string };
  facts: RawFactInput[];
};

export type ImportResult = {
  caseId: string;
  totalFacts: number;
  created: number;
  updated: number;
  embedded: number;
  skippedEmbeddings: number;
  failed: number;
};

@Injectable()
export class CaseFactImportService {
  private readonly logger = new Logger(CaseFactImportService.name);

  constructor(
    private readonly casesService: CasesService,
    private readonly caseFactRepository: CaseFactRepository,
    private readonly embeddingsService: EmbeddingsService,
  ) {}

  async importFacts(input: ImportInput): Promise<ImportResult> {
    this.validateInput(input);

    const cpxCase = await this.casesService.findOneInternal(input.case.id);
    const caseId = cpxCase.id;

    let created = 0;
    let updated = 0;
    let embedded = 0;
    let skippedEmbeddings = 0;
    let failed = 0;

    const upsertedIds: Array<{
      id: string;
      searchText: string;
      contentHash: string;
      needsEmbedding: boolean;
    }> = [];

    for (const rawFact of input.facts) {
      try {
        const searchText = this.buildSearchText(rawFact);
        const contentHash = this.computeHash(searchText);

        const { id, isNew, hashChanged } = await this.caseFactRepository.upsert(
          {
            caseId,
            category: rawFact.category,
            label: rawFact.label,
            answer: rawFact.answer,
            questionExamples: rawFact.questionExamples,
            triggerKeywords: rawFact.triggerKeywords,
            searchText,
            contentHash,
            priority: rawFact.priority ?? 0,
            isCritical: rawFact.isCritical ?? false,
          },
        );

        if (isNew) created++;
        else if (hashChanged) updated++;

        upsertedIds.push({
          id,
          searchText,
          contentHash,
          needsEmbedding: isNew || hashChanged,
        });
      } catch (error) {
        failed++;
        this.logger.error(
          `Failed to upsert fact "${rawFact.label}": ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    const factsToEmbed = upsertedIds.filter((f) => f.needsEmbedding);

    for (const fact of factsToEmbed) {
      try {
        const embedding = await this.embeddingsService.embed(fact.searchText);
        await this.caseFactRepository.updateEmbedding(fact.id, embedding);
        embedded++;
      } catch (error) {
        failed++;
        this.logger.error(
          `Failed to embed fact ${fact.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    skippedEmbeddings = upsertedIds.length - factsToEmbed.length - failed;
    if (skippedEmbeddings < 0) skippedEmbeddings = 0;

    return {
      caseId,
      totalFacts: input.facts.length,
      created,
      updated,
      embedded,
      skippedEmbeddings,
      failed,
    };
  }

  buildSearchText(
    fact: Pick<
      RawFactInput,
      'category' | 'label' | 'questionExamples' | 'answer'
    >,
  ): string {
    return [
      `카테고리: ${fact.category} / ${fact.label}`,
      `의사가 할 수 있는 질문: ${fact.questionExamples.join(' ')}`,
      `환자가 답할 수 있는 정보: ${fact.answer}`,
    ].join('\n');
  }

  computeHash(text: string): string {
    return createHash('sha256')
      .update([this.embeddingsService.getCacheKey(), text].join('\n'))
      .digest('hex');
  }

  private validateInput(input: ImportInput): void {
    if (!input?.case?.id) {
      throw new BadRequestException('case.id is required');
    }

    if (!Array.isArray(input.facts) || input.facts.length === 0) {
      throw new BadRequestException('facts array must be non-empty');
    }

    const requiredFields: (keyof RawFactInput)[] = [
      'category',
      'label',
      'answer',
      'questionExamples',
      'triggerKeywords',
    ];

    for (let i = 0; i < input.facts.length; i++) {
      const fact = input.facts[i];
      for (const field of requiredFields) {
        if (!fact[field]) {
          throw new BadRequestException(`facts[${i}].${field} is required`);
        }
      }

      if (!Array.isArray(fact.questionExamples)) {
        throw new BadRequestException(
          `facts[${i}].questionExamples must be an array`,
        );
      }

      if (!Array.isArray(fact.triggerKeywords)) {
        throw new BadRequestException(
          `facts[${i}].triggerKeywords must be an array`,
        );
      }
    }
  }
}
