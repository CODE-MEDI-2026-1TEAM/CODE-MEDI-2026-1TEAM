import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PatientEvidenceRepository } from '../src/patient/patient-evidence.repository';
import { EmbeddingsService } from '../src/llm/embeddings.service';
import { normalizeEvidence } from '../src/patient/evidence-facts';
import type { PatientPersona } from '../src/patient/patient-facts';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { auditSourceCoverage } from '../src/patient/source-coverage';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const config = app.get(ConfigService);
    const embed = process.argv.includes('--embed');
    if (embed && config.get<string>('PATIENT_AI_ENABLED') !== 'true')
      throw new Error('Embedding requires explicit PATIENT_AI_ENABLED=true');
    const db = app.get(PrismaService);
    const repository = app.get(PatientEvidenceRepository);
    const embeddings = app.get(EmbeddingsService);
    const ids = Array.from(
      { length: 8 },
      (_, i) => `seizure_case_${String(i + 1).padStart(2, '0')}`,
    );
    const cases = await db.case.findMany({
      where: { simulationCaseId: { in: ids } },
      orderBy: { simulationCaseId: 'asc' },
    });
    if (cases.length !== 8) throw new Error('Expected eight seizure cases');
    const audit: Array<Record<string, unknown>> = [];
    for (const c of cases) {
      const corpus = normalizeEvidence(
        c.id,
        c.patientPrompt,
        c.patientProfile as PatientPersona,
        c.chiefComplaint,
      );
      const profile = embed ? embeddings.getCacheKey() : 'lexical';
      audit.push({
        case: c.slug,
        caseVersion: corpus.caseVersion,
        schemaVersion: corpus.schemaVersion,
        facts: corpus.facts.map((f) => ({
          id: f.id,
          concept: f.conceptId,
          source: f.sourceRef,
          phase: f.phase,
          timeScope: f.timeScope,
          subject: f.subjectId,
        })),
        issues: corpus.issues,
        coverage: auditSourceCoverage(c.patientPrompt, corpus),
      });
      if (embed && (await repository.ready(corpus, profile))) {
        console.log(
          JSON.stringify({
            case: c.slug,
            status: 'already_ready',
            facts: corpus.facts.length,
          }),
        );
        continue;
      }
      let vectors: Map<string, number[]> | null = null;
      if (embed) {
        vectors = await repository.cachedVectors(corpus, profile);
        const rows = await embeddings.embedBatch(
          corpus.facts
            .filter((f) => !vectors!.has(f.id))
            .map((f) => ({ id: f.id, text: f.searchText })),
        );
        if (rows.some((r) => !r.embedding))
          throw new Error('Embedding batch failed; old index retained');
        for (const row of rows) vectors.set(row.id, row.embedding!);
      }
      await repository.publish(corpus, profile, vectors);
      console.log(
        JSON.stringify({
          case: c.slug,
          status: embed ? 'ready' : 'lexical_only',
          facts: corpus.facts.length,
          sourceIssues: corpus.issues.length,
          version: corpus.caseVersion,
        }),
      );
    }
    const destination = resolve(
      __dirname,
      '../../docs/patient-v2-validation/source-audit.json',
    );
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(
      destination,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          reviewStatus: 'developer_provisional',
          cases: audit,
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    await app.close();
  }
}
void main().catch(() => {
  console.error(
    'Patient evidence import failed. Check configuration, migrations, and index completeness.',
  );
  process.exitCode = 1;
});
