import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { GroundedResponseService } from './grounded-response.service';
import { PatientModelService } from './patient-model.service';
import { PatientEvidenceRepository } from './patient-evidence.repository';
import { PatientEvidenceService } from './patient-evidence.service';
import { PatientPipelineService } from './patient-pipeline.service';
import { TurnUnderstandingService } from './turn-understanding.service';
import { IntegratedTurnService } from './integrated-turn.service';
@Module({
  imports: [LlmModule],
  providers: [
    PatientModelService,
    TurnUnderstandingService,
    PatientEvidenceRepository,
    PatientEvidenceService,
    GroundedResponseService,
    PatientPipelineService,
    IntegratedTurnService,
  ],
  exports: [PatientPipelineService, PatientEvidenceRepository],
})
export class PatientModule {}
