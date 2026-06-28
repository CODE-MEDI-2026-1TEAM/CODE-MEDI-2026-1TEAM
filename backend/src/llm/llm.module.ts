import { Module } from '@nestjs/common';
import { EmbeddingsService } from './embeddings.service';
import { LlmService } from './llm.service';
import { PatientResponseService } from './patient-response.service';

@Module({
  providers: [LlmService, EmbeddingsService, PatientResponseService],
  exports: [LlmService, EmbeddingsService, PatientResponseService],
})
export class LlmModule {}
