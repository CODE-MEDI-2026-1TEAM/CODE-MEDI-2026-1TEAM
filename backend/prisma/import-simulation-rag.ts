import 'dotenv/config';
import { createHash, randomUUID } from 'crypto';
import { createReadStream, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { createInterface } from 'readline';
import OpenAI from 'openai';
import { Pool } from 'pg';
import { evaluationModuleForSimulationTopic } from '../src/rag/simulation-rag-map';

type CaseIndexEntry = {
  case_id: string;
  topic_id: string;
  topic_label: string;
  system: string;
  patient_name?: string | null;
  age?: number | null;
  sex?: string | null;
  opening_statement?: string | null;
  setting?: string | null;
  requires_manual_review?: boolean;
  source_page_range?: { start: number; end: number };
};

type SimulationCase = {
  case_id: string;
  case_number_in_pdf?: number;
  topic: {
    topic_id: string;
    topic_label: string;
    system?: string;
  };
  source?: unknown;
  patient_visible: {
    identity?: {
      name?: string;
      age?: number;
      sex?: string;
    };
    setting?: string;
    opening_statement?: string;
    vital_signs_available_on_scenario_card?: unknown;
    history_blocks?: Record<string, string>;
    physical_exam_results?: string;
    patient_question_or_concern?: string;
    actor_notes_or_special_behavior?: string | null;
    raw_profile_text?: string;
  };
  examiner_only?: {
    scenario_task?: string;
    likely_diagnoses?: string[];
    planned_tests?: string[];
    planned_treatments_or_education?: string[];
  };
  quality?: {
    flags?: string[];
    requires_manual_review?: boolean;
  };
};

type PatientVisibleChunk = {
  id: string;
  case_id: string;
  topic_id: string;
  topic_label?: string;
  section: string;
  text: string;
  metadata: Record<string, unknown>;
};

type Args = {
  all: boolean;
  topic?: string;
  caseId?: string;
  limit?: number;
  includeManualReview: boolean;
};

const root = resolve(__dirname, '../src/rag/simulationRAG');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function parseArgs(argv: string[]): Args {
  const args: Args = {
    all: false,
    topic: 'seizure',
    includeManualReview: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--all') {
      args.all = true;
      args.topic = undefined;
    } else if (arg === '--topic') {
      args.topic = argv[++i];
      args.all = false;
    } else if (arg === '--case') {
      args.caseId = argv[++i];
      args.all = false;
    } else if (arg === '--limit') {
      args.limit = Number(argv[++i]);
    } else if (arg === '--include-manual-review') {
      args.includeManualReview = true;
    }
  }

  return args;
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(root, relativePath), 'utf-8')) as T;
}

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

function caseJsonPath(entry: CaseIndexEntry): string {
  return join(
    root,
    'data',
    'cases',
    entry.topic_id,
    `${entry.case_id}.json`,
  );
}

function publicTitle(cpxCase: SimulationCase): string {
  const identity = cpxCase.patient_visible.identity ?? {};
  const patient = [identity.age ? `${identity.age}세` : null, identity.sex]
    .filter(Boolean)
    .join(' ');
  const patientPart = patient ? ` ${patient}` : '';
  return `${cpxCase.topic.topic_label}${patientPart} 환자`;
}

function buildChecklist(cpxCase: SimulationCase): string[] {
  const blocks = cpxCase.patient_visible.history_blocks ?? {};
  const labels = Object.keys(blocks).map((key) => `문진: ${key}`);

  if (cpxCase.patient_visible.physical_exam_results) {
    labels.push('신체진찰 관련 소견 확인');
  }

  if (cpxCase.examiner_only?.planned_tests?.length) {
    labels.push('필요 검사 설명');
  }

  if (cpxCase.examiner_only?.planned_treatments_or_education?.length) {
    labels.push('치료/교육 계획 설명');
  }

  return labels;
}

function buildPatientProfile(cpxCase: SimulationCase) {
  return {
    ...cpxCase.patient_visible.identity,
    setting: cpxCase.patient_visible.setting,
    topicId: cpxCase.topic.topic_id,
    topicLabel: cpxCase.topic.topic_label,
    system: cpxCase.topic.system,
    source: cpxCase.source,
    requiresManualReview: cpxCase.quality?.requires_manual_review ?? false,
    tone: '실제 환자처럼 짧고 자연스럽게 답함',
  };
}

async function upsertCase(cpxCase: SimulationCase): Promise<string> {
  const simulationCaseId = cpxCase.case_id;
  const topicId = cpxCase.topic.topic_id;
  const openingStatement =
    cpxCase.patient_visible.opening_statement ??
    `${cpxCase.topic.topic_label} 때문에 왔어요.`;
  const likelyDiagnoses = cpxCase.examiner_only?.likely_diagnoses ?? [];
  const evaluationModuleId = evaluationModuleForSimulationTopic(topicId);
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
    cpxCase.quality?.requires_manual_review ? 'needs-review' : 'simulation',
    simulationCaseId,
    topicId,
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
  const needsEmbedding = row.content_hash !== contentHash || !row.has_embedding;

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

  const model = process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small';
  const batchSize = Number(process.env.SIMULATION_RAG_EMBED_BATCH_SIZE ?? 64);
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

async function collectChunks(
  selectedCaseIds: Set<string>,
  caseIdBySimulationCaseId: Map<string, string>,
): Promise<{
  createdOrUpdated: number;
  needsEmbedding: Array<{ id: string; text: string }>;
}> {
  const chunksPath = join(root, 'data', 'patient_visible_chunks.jsonl');
  const rl = createInterface({
    input: createReadStream(chunksPath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });

  let createdOrUpdated = 0;
  const needsEmbedding: Array<{ id: string; text: string }> = [];

  for await (const line of rl) {
    if (!line.trim()) continue;
    const chunk = JSON.parse(line) as PatientVisibleChunk;
    if (!selectedCaseIds.has(chunk.case_id)) continue;

    const caseId = caseIdBySimulationCaseId.get(chunk.case_id);
    if (!caseId) continue;

    const result = await upsertChunk(chunk, caseId);
    createdOrUpdated++;
    if (result.needsEmbedding) {
      needsEmbedding.push({ id: result.id, text: result.text });
    }
  }

  return { createdOrUpdated, needsEmbedding };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const caseIndex = readJson<CaseIndexEntry[]>('data/case_index.json');
  let selected = caseIndex;

  if (args.caseId) {
    selected = selected.filter((entry) => entry.case_id === args.caseId);
  } else if (!args.all && args.topic) {
    selected = selected.filter((entry) => entry.topic_id === args.topic);
  }

  if (!args.includeManualReview) {
    selected = selected.filter((entry) => !entry.requires_manual_review);
  }

  if (args.limit && Number.isFinite(args.limit)) {
    selected = selected.slice(0, args.limit);
  }

  if (selected.length === 0) {
    console.log('No SimulationRAG cases matched the import filters.');
    return;
  }

  console.log('[SimulationRAG Import]');
  console.log(`cases: ${selected.length}`);
  console.log(
    `filter: ${args.all ? 'all' : args.caseId ? `case=${args.caseId}` : `topic=${args.topic}`}`,
  );

  const openai = getOpenAI();
  const selectedCaseIds = new Set<string>();
  const caseIdBySimulationCaseId = new Map<string, string>();
  let importedCases = 0;

  for (const entry of selected) {
    const raw = readFileSync(caseJsonPath(entry), 'utf-8');
    const cpxCase = JSON.parse(raw) as SimulationCase;
    const caseId = await upsertCase(cpxCase);
    selectedCaseIds.add(cpxCase.case_id);
    caseIdBySimulationCaseId.set(cpxCase.case_id, caseId);
    importedCases++;
  }

  const chunks = await collectChunks(selectedCaseIds, caseIdBySimulationCaseId);
  const embedded = await embedAndSave(openai, chunks.needsEmbedding);

  console.log(`imported cases: ${importedCases}`);
  console.log(`upserted chunks: ${chunks.createdOrUpdated}`);
  console.log(`embedded chunks: ${embedded}`);
  console.log(`skipped embeddings: ${chunks.createdOrUpdated - chunks.needsEmbedding.length}`);
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
