import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CasesModule } from './cases/cases.module';
import { HealthModule } from './health/health.module';
import { LlmModule } from './llm/llm.module';
import { PrismaModule } from './prisma/prisma.module';
import { RagModule } from './rag/rag.module';
import { SessionsModule } from './sessions/sessions.module';

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
  ],
})
export class AppModule {}
