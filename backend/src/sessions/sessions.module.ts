import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module';
import { LlmModule } from '../llm/llm.module';
import { RagModule } from '../rag/rag.module';
import { PatientModule } from '../patient/patient.module';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [CasesModule, LlmModule, RagModule, PatientModule],
  controllers: [SessionsController],
  providers: [SessionsService],
})
export class SessionsModule {}
