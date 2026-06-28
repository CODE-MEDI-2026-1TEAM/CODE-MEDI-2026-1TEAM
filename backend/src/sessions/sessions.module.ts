import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module';
import { LlmModule } from '../llm/llm.module';
import { RagModule } from '../rag/rag.module';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [CasesModule, LlmModule, RagModule],
  controllers: [SessionsController],
  providers: [SessionsService],
})
export class SessionsModule {}
