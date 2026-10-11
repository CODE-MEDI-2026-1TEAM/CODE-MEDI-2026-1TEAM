// Pure local baseline. Never load dotenv, connect a database, or expose a paid mode.
import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import data from '../src/rag/simulationRAG/data/seizure_cases.json';
import reference from '../test/fixtures/patient-conversation-cases.json';
import { hashContent, normalizeEvidence } from '../src/patient/evidence-facts';
import { PatientPipelineService } from '../src/patient/patient-pipeline.service';
import { PatientModelService } from '../src/patient/patient-model.service';
import { PatientEvidenceService } from '../src/patient/patient-evidence.service';
import { GroundedResponseService } from '../src/patient/grounded-response.service';
import { TurnUnderstandingService, initialDialogueState, offlineFrames } from '../src/patient/turn-understanding.service';
import { PIPELINE_VERSION } from '../src/patient/evidence-contract';

const stats = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return { samples: values.length, medianMs: sorted[Math.ceil(sorted.length * .5) - 1],
    p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], maxMs: sorted.at(-1) };
};
const config = { get: () => undefined } as unknown as ConfigService;
const model = new PatientModelService(config);
const forbidden = async () => { throw new Error('External I/O forbidden in this baseline'); };
const repository = { ready: forbidden, vectors: forbidden, lexical: forbidden };
const evidence = new PatientEvidenceService(repository as any,
  { getCacheKey: () => 'offline', embedBatch: forbidden } as any, model, config);
const pipeline = new PatientPipelineService(new TurnUnderstandingService(model), evidence, new GroundedResponseService(model, config));

async function syntheticSearch(concurrency: number) {
  const samples: number[] = [];
  const source = data.증례목록[0].문진및신체진찰정보;
  const corpus = normalizeEvidence('synthetic', JSON.stringify(source), { witnessPresent: true }, '');
  const frames = offlineFrames('열이 있나요? 머리가 아팠나요? 약을 드시나요? 담배 피우세요? 나이는요?', initialDialogueState(corpus.caseVersion, null));
  for (let repeat = 0; repeat < 3; repeat++) {
    const pause = async (ids: string[]) => { await new Promise((yes) => setTimeout(yes, 8)); return ids.map((id) => ({ id, score: .9 })); };
    const localConfig = { get: (key: string) => key === 'PATIENT_SEARCH_CONCURRENCY' ? String(concurrency) : undefined } as unknown as ConfigService;
    const service = new PatientEvidenceService({ ready: async () => true,
      vectors: async (_c, _p, _v, ids) => pause(ids), lexical: async (_c, _p, _q, ids) => pause(ids) } as any,
      { getCacheKey: () => 'synthetic', embedBatch: async (rows) => rows.map((row) => ({ id: row.id, embedding: [1, 0] })) } as any,
      { enabled: true } as PatientModelService, localConfig);
    const started = performance.now(); await service.retrieve(corpus, frames, { witnessPresent: true }, true);
    samples.push(performance.now() - started);
  }
  return stats(samples);
}
async function main() {
  if (process.argv.slice(2).length) throw new Error('This runner supports offline execution only');
  const rows: any[] = [];
  for (const expected of reference.cases) {
    const item = data.증례목록.find((item) => item.증례번호 === expected.caseNumber)!;
    const source = item.문진및신체진찰정보;
    const persona = { isGuardianCase: source.기본정보.source === 'caregiver',
      witnessPresent: item.목격자정보.목격자유무, witnessRelation: item.목격자정보.관계 };
    const corpus = normalizeEvidence(`fixture-${expected.caseNumber}`, JSON.stringify(source), persona, source.기본정보.주소);
    let state: unknown;
    for (const [index, [question, topic]] of reference.questions.entries()) {
      const started = performance.now();
      const result = await pipeline.turn({ caseId: `fixture-${expected.caseNumber}`,
        patientPrompt: JSON.stringify(source), chiefComplaint: source.기본정보.주소, persona, content: question, state });
      state = result.state;
      const facts = result.answers.flatMap((answer) => answer.facts);
      const gold = expected.values[index];
      const matching = gold === null ? result.answers.some((answer) => answer.status === 'not_provided' || answer.status === 'needs_clarification')
        : facts.some((fact) => JSON.stringify(fact.sourceRef.originalValue) === JSON.stringify(gold));
      const representationOnly = !matching && typeof gold === 'string' && facts.some((fact) => {
        const value = fact.sourceRef.originalValue;
        return Array.isArray(value) && value.every((part) => typeof part === 'string') && value.join(', ') === gold;
      });
      rows.push({ case: expected.caseNumber, question, topic, expectedValue: gold,
        observedSourceValues: facts.map((fact) => fact.sourceRef.originalValue), sourcePaths: facts.map((fact) => fact.sourceRef.path),
        reply: result.reply, sourceValueMatch: matching, representationOnly,
        normalizationIssues: corpus.issues, processing: result.processing.status, elapsedMs: performance.now() - started });
    }
  }
  const report = { generatedAt: new Date().toISOString(), pipelineVersion: PIPELINE_VERSION,
    mode: 'offline_source_baseline_and_synthetic_search', externalCalls: 0,
    reference: 'backend/test/fixtures/patient-conversation-cases.json: manually maintained historical source values',
    sourceHash: hashContent(data), referenceHash: hashContent(reference),
    cases: reference.cases.length, questions: rows.length,
    sourceValueMatches: rows.filter((row) => row.sourceValueMatch).length,
    matchesAllowingArrayStringRepresentation: rows.filter((row) => row.sourceValueMatch || row.representationOnly).length,
    sourceValueMismatches: rows.filter((row) => !row.sourceValueMatch), localLatency: stats(rows.map((row) => row.elapsedMs)),
    syntheticSearch: { assumption: 'In-process repository mocks; each independent vector/lexical query waits 8 ms, 5 questions, cold caches, 3 repetitions. Not production latency.',
      serial: await syntheticSearch(1), concurrency2: await syntheticSearch(2) },
    actualModelQuality: { measured: false, requiredMetrics: ['evidence_recall_at_k', 'question_coverage', 'unsupported_claims',
      'overdisclosure', 'numeric_contradictions', 'correction_recovery', 'patient_role', 'latency_p50_p95', 'cache_hit_rate', 'concurrent_queue_wait'],
      protocol: 'Freeze source hashes/model/pipeline, preserve held-out questions, compare with human labels; no automatic paid runs.' }, rows };
  const directory = resolve(__dirname, '../../docs/patient-v24-validation'); mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, 'offline-benchmark.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ cases: report.cases, questions: report.questions, sourceValueMatches: report.sourceValueMatches,
    localLatency: report.localLatency, syntheticSearch: report.syntheticSearch, externalCalls: 0 }));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
