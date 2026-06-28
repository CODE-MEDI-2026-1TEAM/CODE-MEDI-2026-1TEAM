import 'dotenv/config';
import { createHash, randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import OpenAI from 'openai';
import { Pool } from 'pg';
import { evaluationModuleForSimulationTopic } from '../src/rag/simulation-rag-map';

// --- New consolidated format types (seizure_simulation_rag.json) ---

type NewIdentity = {
  sex: string;
  age: string; // e.g. "21세", "생후 7개월"
  name: string;
  respondent?: string; // for infant cases answered by a guardian
};

type NewHistory = Record<string, string | string[]>;

type NewPhysicalExam = Record<string, string | string[]> | string;

type NewPatientVisible = {
  initial_scenario: string;
  identity: NewIdentity;
  chief_complaint: string;
  vital_signs_after_arrival?: Record<string, string>;
  history?: NewHistory;
  physical_exam?: NewPhysicalExam;
  patient_question?: string;
  special_notes?: string;
};

type NewExaminerOnly = {
  task?: string;
  likely_diagnoses?: string[];
  required_test_plans?: string[];
  required_treatment_plans?: string[];
  required_education_plans?: string[];
  expected_skills?: string[];
};

type NewSimulationCase = {
  case_id: string;
  case_number: number;
  patient_visible: NewPatientVisible;
  examiner_only: NewExaminerOnly;
  teaching_notes?: string[];
};

type NewSimulationFile = {
  simulation_rag_usage?: unknown;
  cases: NewSimulationCase[];
  simulation_chunks?: unknown[];
};

// --- DB chunk type ---

type PatientVisibleChunk = {
  id: string;
  case_id: string; // simulationCaseId
  topic_id: string;
  topic_label?: string;
  section: string;
  text: string;
  metadata: Record<string, unknown>;
};

// History key → section name: compatible with simulation-rag-retriever.service.ts intent rules
const HISTORY_KEY_TO_SECTION: Record<string, string> = {
  O: 'history_onset',
  L: 'history_location',
  D: 'history_duration',
  Co: 'history_course',
  Ex: 'history_experience',
  C: 'history_character',
  A: 'history_associated',
  F: 'history_factors',
  E: 'history_events',
  외상: 'history_trauma',
  과거력: 'history_past',
  약물: 'history_medication',
  사회력: 'history_social',
  가족력: 'history_family',
  여성력: 'history_gynecologic',
};

const TOPIC_ID = 'seizure';
const TOPIC_LABEL = '경련';

const root = resolve(__dirname, '../src/rag/simulationRAG');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'sk-your-api-key') {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  return new OpenAI({ apiKey });
}

function computeHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function parseAge(ageStr: string): number | null {
  const match = /^(\d+)세/.exec(ageStr);
  return match ? parseInt(match[1], 10) : null;
}

function valueToText(value: string | string[]): string {
  return Array.isArray(value) ? value.join('\n') : value;
}

function publicTitle(cpxCase: NewSimulationCase): string {
  const { age, sex } = cpxCase.patient_visible.identity;
  const parts = [age, sex].filter(Boolean);
  const patientPart = parts.length ? ` ${parts.join(' ')}` : '';
  return `${TOPIC_LABEL}${patientPart} 환자`;
}

function buildChecklist(cpxCase: NewSimulationCase): string[] {
  const labels: string[] = [];

  for (const key of Object.keys(cpxCase.patient_visible.history ?? {})) {
    labels.push(`문진: ${key}`);
  }

  if (cpxCase.patient_visible.physical_exam) {
    labels.push('신체진찰 관련 소견 확인');
  }

  if (cpxCase.examiner_only?.required_test_plans?.length) {
    labels.push('필요 검사 설명');
  }

  if (cpxCase.examiner_only?.required_treatment_plans?.length) {
    labels.push('치료/교육 계획 설명');
  }

  return labels;
}

function buildPatientProfile(cpxCase: NewSimulationCase) {
  const { identity, vital_signs_after_arrival } = cpxCase.patient_visible;
  return {
    name: identity.name,
    age: parseAge(identity.age),
    ageRaw: identity.age,
    sex: identity.sex,
    respondent: identity.respondent,
    topicId: TOPIC_ID,
    topicLabel: TOPIC_LABEL,
    system: '신경',
    vitalSigns: vital_signs_after_arrival,
    requiresManualReview: false,
    tone: '실제 환자처럼 짧고 자연스럽게 답함',
  };
}

function buildChunksForCase(cpxCase: NewSimulationCase): PatientVisibleChunk[] {
  const chunks: PatientVisibleChunk[] = [];
  const simulationCaseId = cpxCase.case_id;

  // Initial info chunk (scenario context + chief complaint)
  chunks.push({
    id: `${simulationCaseId}_initial`,
    case_id: simulationCaseId,
    topic_id: TOPIC_ID,
    topic_label: TOPIC_LABEL,
    section: 'chief_complaint',
    text: `${cpxCase.patient_visible.initial_scenario}\n주호소: ${cpxCase.patient_visible.chief_complaint}`,
    metadata: { scope: 'patient_dialogue', key: 'initial' },
  });

  // History chunks — one per key, mapped to section names for intent matching
  const history = cpxCase.patient_visible.history ?? {};
  for (const [key, value] of Object.entries(history)) {
    const text = valueToText(value);
    if (!text || text === '-') continue;

    const section = HISTORY_KEY_TO_SECTION[key] ?? `history_${key}`;
    chunks.push({
      id: `${simulationCaseId}_${key}`,
      case_id: simulationCaseId,
      topic_id: TOPIC_ID,
      topic_label: TOPIC_LABEL,
      section,
      text: `[${key}] ${text}`,
      metadata: { scope: 'patient_dialogue', key },
    });
  }

  // Physical exam chunk
  const physExam = cpxCase.patient_visible.physical_exam;
  if (physExam) {
    let physText: string;
    if (typeof physExam === 'string') {
      physText = physExam;
    } else {
      physText = Object.entries(physExam)
        .map(([k, v]) => `[${k}] ${valueToText(v)}`)
        .join('\n');
    }

    if (physText && physText !== '-') {
      chunks.push({
        id: `${simulationCaseId}_physical_exam`,
        case_id: simulationCaseId,
        topic_id: TOPIC_ID,
        topic_label: TOPIC_LABEL,
        section: 'physical_exam',
        text: physText,
        metadata: { scope: 'physical_exam' },
      });
    }
  }

  return chunks;
}

async function upsertCase(cpxCase: NewSimulationCase): Promise<string> {
  const simulationCaseId = cpxCase.case_id;
  const openingStatement = cpxCase.patient_visible.chief_complaint;
  const likelyDiagnoses = cpxCase.examiner_only?.likely_diagnoses ?? [];
  const evaluationModuleId = evaluationModuleForSimulationTopic(TOPIC_ID);
  const patientPrompt = JSON.stringify(cpxCase.patient_visible);

  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM "Case"
     WHERE "simulationCaseId" = $1 OR slug = $1
     LIMIT 1`,
    [simulationCaseId],
  );

  const values = [
    existing.rows[0]?.id ?? randomUUID(),
    simulationCaseId,
    publicTitle(cpxCase),
    openingStatement,
    'simulation',
    simulationCaseId,
    TOPIC_ID,
    evaluationModuleId,
    JSON.stringify(buildPatientProfile(cpxCase)),
    openingStatement,
    likelyDiagnoses.join(', '),
    JSON.stringify(buildChecklist(cpxCase)),
    JSON.stringify([]),
    patientPrompt,
  ];

  if (existing.rows.length === 0) {
    await pool.query(
      `INSERT INTO "Case" (
         "id", slug, title, "chiefComplaint", difficulty,
         "simulationCaseId", "simulationTopicId", "evaluationModuleId",
         "patientProfile", "openingStatement", "hiddenDiagnosis",
         checklist, "redFlags", "patientPrompt"
       )
       VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8,
         $9::jsonb, $10, $11,
         $12::jsonb, $13::jsonb, $14
       )`,
      values,
    );
    return values[0] as string;
  }

  await pool.query(
    `UPDATE "Case"
     SET slug = $2,
         title = $3,
         "chiefComplaint" = $4,
         difficulty = $5,
         "simulationCaseId" = $6,
         "simulationTopicId" = $7,
         "evaluationModuleId" = $8,
         "patientProfile" = $9::jsonb,
         "openingStatement" = $10,
         "hiddenDiagnosis" = $11,
         checklist = $12::jsonb,
         "redFlags" = $13::jsonb,
         "patientPrompt" = $14
     WHERE id = $1`,
    values,
  );

  return values[0] as string;
}

async function upsertChunk(
  chunk: PatientVisibleChunk,
  caseId: string,
): Promise<{ id: string; text: string; needsEmbedding: boolean }> {
  const contentHash = computeHash(chunk.text);
  const existing = await pool.query<{
    id: string;
    content_hash: string | null;
    has_embedding: boolean;
  }>(
    `SELECT id,
            "contentHash" as content_hash,
            (embedding IS NOT NULL) as has_embedding
     FROM "SimulationChunk"
     WHERE id = $1
     LIMIT 1`,
    [chunk.id],
  );

  const values = [
    chunk.id,
    caseId,
    chunk.case_id,
    chunk.topic_id,
    chunk.topic_label ?? null,
    chunk.section,
    chunk.text,
    JSON.stringify(chunk.metadata ?? {}),
    contentHash,
  ];

  if (existing.rows.length === 0) {
    await pool.query(
      `INSERT INTO "SimulationChunk" (
         id, "caseId", "simulationCaseId", "topicId", "topicLabel",
         section, text, metadata, "contentHash", "createdAt", "updatedAt"
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, NOW(), NOW())`,
      values,
    );
    return { id: chunk.id, text: chunk.text, needsEmbedding: true };
  }

  const row = existing.rows[0];
  const needsEmbedding =
    row.content_hash !== contentHash || !row.has_embedding;

  await pool.query(
    `UPDATE "SimulationChunk"
     SET "caseId" = $2,
         "simulationCaseId" = $3,
         "topicId" = $4,
         "topicLabel" = $5,
         section = $6,
         text = $7,
         metadata = $8::jsonb,
         "contentHash" = $9,
         "updatedAt" = NOW()
     WHERE id = $1`,
    values,
  );

  return { id: chunk.id, text: chunk.text, needsEmbedding };
}

async function embedAndSave(
  openai: OpenAI,
  items: Array<{ id: string; text: string }>,
): Promise<number> {
  if (items.length === 0) return 0;

  const model =
    process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small';
  const batchSize = Number(
    process.env.SIMULATION_RAG_EMBED_BATCH_SIZE ?? 64,
  );
  let embedded = 0;

  for (let start = 0; start < items.length; start += batchSize) {
    const batch = items.slice(start, start + batchSize);
    const response = await openai.embeddings.create({
      model,
      input: batch.map((item) => item.text),
    });

    for (let i = 0; i < batch.length; i++) {
      const embedding = response.data[i]?.embedding;
      if (!embedding) continue;

      await pool.query(
        `UPDATE "SimulationChunk"
         SET embedding = $1::vector, "updatedAt" = NOW()
         WHERE id = $2`,
        [`[${embedding.join(',')}]`, batch[i].id],
      );
      embedded++;
    }
  }

  return embedded;
}

async function main() {
  const dataFilePath = join(root, 'data', 'seizure_simulation_rag.json');
  const raw = readFileSync(dataFilePath, 'utf-8');
  const simulationFile = JSON.parse(raw) as NewSimulationFile;
  const cases = simulationFile.cases;

  console.log('[SimulationRAG Import]');
  console.log(`source: seizure_simulation_rag.json`);
  console.log(`cases: ${cases.length}`);

  const openai = getOpenAI();
  let importedCases = 0;
  let upsertedChunks = 0;
  const needsEmbedding: Array<{ id: string; text: string }> = [];

  for (const cpxCase of cases) {
    const caseId = await upsertCase(cpxCase);
    importedCases++;

    const chunks = buildChunksForCase(cpxCase);
    for (const chunk of chunks) {
      const result = await upsertChunk(chunk, caseId);
      upsertedChunks++;
      if (result.needsEmbedding) {
        needsEmbedding.push({ id: result.id, text: result.text });
      }
    }

    console.log(
      `  [${cpxCase.case_id}] ${publicTitle(cpxCase)} — ${chunks.length} chunks`,
    );
  }

  const embedded = await embedAndSave(openai, needsEmbedding);

  console.log(`\nimported cases: ${importedCases}`);
  console.log(`upserted chunks: ${upsertedChunks}`);
  console.log(`embedded chunks: ${embedded}`);
  console.log(
    `skipped embeddings: ${upsertedChunks - needsEmbedding.length}`,
  );
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });
