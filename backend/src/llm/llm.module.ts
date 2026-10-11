import { Module } from '@nestjs/common';
import { EmbeddingsService } from './embeddings.service';
import { LlmService } from './llm.service';
import { PatientResponseService } from './patient-response.service';
import { ApiCostService } from './api-cost.service';

@Module({
  providers: [ApiCostService, LlmService, EmbeddingsService, PatientResponseService],
  exports: [ApiCostService, LlmService, EmbeddingsService, PatientResponseService],
})
export class LlmModule {}
