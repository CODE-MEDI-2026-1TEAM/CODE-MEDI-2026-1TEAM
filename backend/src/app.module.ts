import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CasesModule } from './cases/cases.module';
import { HealthModule } from './health/health.module';
import { LlmModule } from './llm/llm.module';
import { PrismaModule } from './prisma/prisma.module';
import { RagModule } from './rag/rag.module';
import { SessionsModule } from './sessions/sessions.module';
import { SpeechModule } from './speech/speech.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    LlmModule,
    HealthModule,
    CasesModule,
    RagModule,
    SessionsModule,
    SpeechModule,
  ],
})
export class AppModule {}
