import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module';
import { LlmModule } from '../llm/llm.module';
import { CaseFactImportService } from './case-fact-import.service';
import { CaseFactRepository } from './case-fact.repository';
import { CaseFactRetrieverService } from './case-fact-retriever.service';
import { EvaluationCriteriaService } from './evaluation-criteria.service';
import { SimulationChunkRepository } from './simulation-chunk.repository';
import { SimulationRagRetrieverService } from './simulation-rag-retriever.service';

@Module({
  imports: [LlmModule, CasesModule],
  providers: [
    CaseFactRepository,
    CaseFactRetrieverService,
    CaseFactImportService,
    EvaluationCriteriaService,
    SimulationChunkRepository,
    SimulationRagRetrieverService,
  ],
  exports: [
    CaseFactRetrieverService,
    CaseFactImportService,
    EvaluationCriteriaService,
    SimulationRagRetrieverService,
  ],
})
export class RagModule {}
