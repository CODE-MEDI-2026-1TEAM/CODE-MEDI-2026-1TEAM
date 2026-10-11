import dataset from '../src/rag/simulationRAG/data/seizure_cases.json';
import { normalizeEvidence } from '../src/patient/evidence-facts';
import { auditSourceCoverage } from '../src/patient/source-coverage';
import { compactFact } from '../src/patient/model-evidence';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const directory = resolve(__dirname, '../../docs/patient-v23-validation');
mkdirSync(directory, { recursive: true });
const cases = dataset.증례목록.map((c, i) => {
  const number = i + 1;
  const source = c.문진및신체진찰정보;
  const persona = {
    isGuardianCase: [2, 8].includes(number),
    witnessPresent: number !== 6,
    witnessRelation: [2, 8].includes(number) ? '보호자' : '동료',
    guardianRole: [2, 8].includes(number) ? '어머니' : null,
  };
  const prompt = JSON.stringify(source);
  const corpus = normalizeEvidence(
    `seizure_case_${String(number).padStart(2, '0')}`,
    prompt,
    persona,
    source.기본정보.주소,
  );
  return {
    simulationCaseId: corpus.caseId,
    schemaVersion: corpus.schemaVersion,
    facts: corpus.facts,
    issues: corpus.issues,
    coverage: auditSourceCoverage(prompt, corpus),
  };
});
writeFileSync(
  resolve(directory, 'source-audit-local.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: 'unchanged repository seizure_cases.json; local persona fixtures',
      reviewStatus: 'developer_provisional',
      cases,
    },
    null,
    2,
  ) + '\n',
);
const manifest = {
  status: 'not_sent_pending_external_payload_approval',
  destinations: [
    'https://api.openai.com/v1/embeddings',
    'https://api.openai.com/v1/chat/completions',
  ],
  budgetUsd: 2,
  embeddingModel: 'text-embedding-3-small',
  patientModel: 'gpt-4.1-mini-2025-04-14',
  evaluationModel: 'gpt-4.1-2025-04-14',
  scope:
    'Existing eight seizure cases for embedding; exactly two text interview sessions and one evaluation per session',
  embeddingPayload: cases.map((c) => ({
    case: c.simulationCaseId,
    input: c.facts.map((f) => f.searchText),
  })),
  patientCandidateExamples: cases
    .filter((c) =>
      ['seizure_case_01', 'seizure_case_08'].includes(c.simulationCaseId),
    )
    .map((c) => ({
      case: c.simulationCaseId,
      candidates: c.facts
        .slice(0, 32)
        .map((f, i) => compactFact(f, `e${i + 1}`)),
    })),
  evaluationContent:
    'Full original student/patient text, observed clinical actions, and existing case-specific scoring/education criteria; sent to the grading model only.',
  exclusions:
    'No .env, API keys, DB URLs, full source hashes or database keys. Patient generator receives no hidden diagnosis, examination result or scoring criterion.',
  provenanceLimit:
    'Educational case files are present locally; original clinical source and de-identification status have not been independently authenticated.',
};
writeFileSync(
  resolve(directory, 'api-transmission-preview.json'),
  JSON.stringify(manifest, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    cases: cases.length,
    facts: cases.reduce((n, c) => n + c.facts.length, 0),
    issues: cases.reduce((n, c) => n + c.issues.length, 0),
    coverage: cases.map((c) => ({
      case: c.simulationCaseId,
      counts: c.coverage.counts,
    })),
    paidCalls: 0,
  }),
);
