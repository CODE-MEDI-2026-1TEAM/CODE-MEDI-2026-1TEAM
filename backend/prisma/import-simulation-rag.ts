import 'dotenv/config';
import { createHash, randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import OpenAI from 'openai';
import { Pool } from 'pg';
import { evaluationModuleForSimulationTopic } from '../src/rag/simulation-rag-map';

// ==================== Types ====================

type ValueField = {
  source: string;
  값?: unknown;
  원문표기?: string;
  지속시간?: string | string[];
  횟수?: number;
  해석?: string;
};

type WitnessInfo = {
  목격자유무: boolean;
  관계?: string | null;
  근거?: string;
  환자응답방식?: string;
};

type BasicInfo = {
  source: 'patient' | 'caregiver';
  성별: string;
  나이: string;
  주소: string;
};

type ClinicalInfo = {
  기본정보: BasicInfo;
  O_L_D_Co_Ex: {
    O?: ValueField;
    L?: ValueField;
    D?: ValueField;
    Co?: ValueField;
    Ex?: ValueField;
  };
  C: {
    기억범위?: ValueField;
    전체상황?: ValueField;
    경련전: Record<string, unknown>;
    경련중: Record<string, unknown>;
    경련후: Record<string, unknown>;
  };
  발달력?: Record<string, unknown>;
  A_F: Record<string, unknown>;
  E_외_과_약: Record<string, unknown>;
  사회력_가족력?: Record<string, unknown>;
  사회력_가족력_여성력?: Record<string, unknown>;
  P_E?: Record<string, unknown>;
  P_E_및_특이사항?: Record<string, unknown>;
  질문_특이사항?: Record<string, unknown>;
};

type CaseRecord = {
  증례번호: number;
  증례명: string;
  목격자정보: WitnessInfo;
  상황지시: {
    source: 'station';
    환자상황: string;
    활력징후: Record<string, string>;
    응시자과제?: string[];
  };
  환자교육: {
    가능성이높은진단: string[];
    필요한검사계획: string[];
    필요한치료교육계획: string[];
  };
  문진및신체진찰정보: ClinicalInfo;
};

type DataFile = {
  schema_version: string;
  topic: string;
  증례목록: CaseRecord[];
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

// ==================== Constants ====================

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

// ==================== Serialization ====================

const SKIP_KEYS = new Set([
  'source',
  'sourceNote',
  'sourceOverrideReason',
  'sourceNoteReason',
  '해석',
  '원문표기',
  '근거',
  '환자응답방식',
]);

function serializeObj(obj: Record<string, unknown>): string {
  const parts: string[] = [];

  for (const [k, v] of Object.entries(obj)) {
    if (SKIP_KEYS.has(k)) continue;
    if (v === null || v === undefined) continue;

    if (typeof v === 'boolean') {
      parts.push(`${k}(${v ? '+' : '-'})`);
    } else if (typeof v === 'string' && v !== '') {
      parts.push(`${k}: ${v}`);
    } else if (typeof v === 'number') {
      parts.push(`${k}: ${v}`);
    } else if (Array.isArray(v)) {
      const joined = v
        .filter(Boolean)
        .map(String)
        .join(', ');
      if (joined) parts.push(`${k}: ${joined}`);
    } else if (typeof v === 'object') {
      const nested = v as Record<string, unknown>;
      if ('있음' in nested) {
        const present = nested.있음 as boolean;
        const details = Object.entries(nested)
          .filter(
            ([dk]) => dk !== '있음' && !SKIP_KEYS.has(dk) && nested[dk] !== null,
          )
          .map(([dk, dv]) =>
            typeof dv === 'boolean'
              ? `${dk}(${dv ? '+' : '-'})`
              : `${dk}: ${dv}`,
          )
          .join(' ');
        parts.push(
          `${k}(${present ? '+' : '-'})${present && details ? ': ' + details : ''}`,
        );
      } else {
        const nestedText = serializeObj(nested);
        if (nestedText) parts.push(`[${k}] ${nestedText}`);
      }
    }
  }

  return parts.join(' ');
}

// ==================== Metadata Extraction ====================

function parseAge(ageStr: string): number | null {
  const match = /^(\d+)세/.exec(ageStr);
  return match ? parseInt(match[1], 10) : null;
}

function extractPatientName(환자상황: string): string | null {
  const match = /([가-힣]{2,3})(씨|가\s|의\s|\()/.exec(환자상황);
  return match ? match[1] : null;
}

function normalizeRelation(relation: string | null | undefined): string | null {
  if (!relation) return null;
  const roles = [
    '어머니',
    '엄마',
    '아버지',
    '아빠',
    '아내',
    '남편',
    '동료들',
    '할머니',
    '할아버지',
  ];
  for (const role of roles) {
    if (relation.includes(role)) return role;
  }
  const cleaned = relation.replace(/로\s*추정.*$/, '').trim();
  return cleaned.split('/').pop()?.trim() ?? cleaned;
}

function extractGuardianRole(caseRecord: CaseRecord): string | null {
  const info = caseRecord.문진및신체진찰정보;
  const social = (info.사회력_가족력 ??
    info.사회력_가족력_여성력) as Record<string, unknown> | undefined;
  if (social?.주양육자) return social.주양육자 as string;
  if (social?.양육자) return social.양육자 as string;
  return normalizeRelation(caseRecord.목격자정보.관계 ?? null);
}

function buildPatientProfile(caseRecord: CaseRecord) {
  const info = caseRecord.문진및신체진찰정보;
  const basic = info.기본정보;
  const wit = caseRecord.목격자정보;
  const isGuardianCase = basic.source === 'caregiver';

  return {
    name: extractPatientName(caseRecord.상황지시.환자상황),
    age: parseAge(basic.나이),
    ageRaw: basic.나이,
    sex: basic.성별,
    topicId: TOPIC_ID,
    topicLabel: TOPIC_LABEL,
    system: '신경',
    vitalSigns: caseRecord.상황지시.활력징후,
    requiresManualReview: false,
    tone: '실제 환자처럼 짧고 자연스럽게 답함',
    witnessPresent: wit.목격자유무,
    witnessRelation: normalizeRelation(wit.관계 ?? null),
    isGuardianCase,
    guardianRole: isGuardianCase ? extractGuardianRole(caseRecord) : null,
  };
}

function publicTitle(caseRecord: CaseRecord): string {
  const basic = caseRecord.문진및신체진찰정보.기본정보;
  return `${TOPIC_LABEL} ${basic.나이} ${basic.성별} 환자`;
}

function buildChecklist(caseRecord: CaseRecord): string[] {
  const labels: string[] = [];
  const info = caseRecord.문진및신체진찰정보;
  const oldcoe = info.O_L_D_Co_Ex;

  for (const key of ['O', 'L', 'D', 'Co', 'Ex'] as const) {
    const field = oldcoe[key];
    if (field && field.원문표기 !== '-' && (field.값 !== null || field.지속시간)) {
      labels.push(`문진: ${key}`);
    }
  }

  labels.push('문진: C (경련 전/중/후)');
  labels.push('문진: A_F (동반 증상 / 유발 인자)');

  const pe = info.P_E ?? info.P_E_및_특이사항;
  if (pe && (pe as Record<string, unknown>).신체진찰시행 !== false) {
    labels.push('신체진찰 관련 소견 확인');
  }

  if (caseRecord.환자교육.필요한검사계획.length) {
    labels.push('필요 검사 설명');
  }
  if (caseRecord.환자교육.필요한치료교육계획.length) {
    labels.push('치료/교육 계획 설명');
  }

  return labels;
}

// ==================== Chunk Builder ====================

function buildChunksForCase(caseRecord: CaseRecord): PatientVisibleChunk[] {
  const chunks: PatientVisibleChunk[] = [];
  const caseId = `seizure_case_${String(caseRecord.증례번호).padStart(2, '0')}`;
  const info = caseRecord.문진및신체진찰정보;

  function push(key: string, section: string, text: string, source: string) {
    const trimmed = text.trim();
    if (!trimmed || trimmed === '-') return;
    chunks.push({
      id: `${caseId}_${key}`,
      case_id: caseId,
      topic_id: TOPIC_ID,
      topic_label: TOPIC_LABEL,
      section,
      text: trimmed,
      metadata: { scope: 'patient_dialogue', source },
    });
  }

  // 1. Chief complaint
  push(
    'initial',
    'chief_complaint',
    `${caseRecord.상황지시.환자상황}\n주호소: ${info.기본정보.주소}`,
    'station',
  );

  // 2. O / L / D / Co / Ex
  const FIELD_SECTIONS: Array<[keyof ClinicalInfo['O_L_D_Co_Ex'], string]> = [
    ['O', 'history_onset'],
    ['L', 'history_location'],
    ['D', 'history_duration'],
    ['Co', 'history_course'],
    ['Ex', 'history_experience'],
  ];

  for (const [key, section] of FIELD_SECTIONS) {
    const field = info.O_L_D_Co_Ex[key];
    if (!field) continue;
    if (field.원문표기 === '-' || (field.값 === null && !field.지속시간)) continue;

    let valueText: string;
    if (Array.isArray(field.값)) {
      valueText = (field.값 as unknown[]).map(String).join(', ');
    } else if (field.값 !== null && field.값 !== undefined) {
      valueText = String(field.값);
    } else if (field.지속시간) {
      const dur = Array.isArray(field.지속시간)
        ? field.지속시간.join(', ')
        : field.지속시간;
      valueText = `${dur}${field.횟수 ? `, ${field.횟수}회` : ''}`;
    } else {
      continue;
    }

    if (field.해석) valueText += ` (${field.해석})`;
    push(key, section, valueText, field.source);
  }

  // 3. Character sections
  const C = info.C;

  // 3a. Pre-seizure
  const preParts: string[] = [];
  if (C.기억범위?.값) preParts.push(`기억범위: ${C.기억범위.값}`);
  if (C.전체상황?.값) preParts.push(`전체상황: ${C.전체상황.값}`);
  const preSource = (C.경련전.source as string) ?? 'patient';
  const preBody = serializeObj(C.경련전);
  if (preBody) preParts.push(preBody);
  if (preParts.length > 0) {
    push(
      'C_pre',
      'history_character_pre',
      `[경련 전] ${preParts.join(' ')}`,
      preSource,
    );
  }

  // 3b. During-seizure (usually witness)
  const durSource = (C.경련중.source as string) ?? 'witness';
  const durBody = serializeObj(C.경련중);
  if (durBody) {
    push(
      'C_during',
      'history_character_during',
      `[경련 중] ${durBody}`,
      durSource,
    );
  }

  // 3c. Post-seizure
  const postSource = (C.경련후.source as string) ?? 'patient';
  const postBody = serializeObj(C.경련후);
  if (postBody) {
    push(
      'C_post',
      'history_character_post',
      `[경련 후] ${postBody}`,
      postSource,
    );
  }

  // 4. Associated symptoms & precipitating factors (A_F)
  const af = info.A_F;
  const afSource = (af.source as string) ?? 'patient';
  const { source: _afs, ...afData } = af;
  const afText = serializeObj(afData as Record<string, unknown>);
  if (afText) {
    push(
      'A_F',
      'history_associated',
      `[동반 증상 / 유발 인자] ${afText}`,
      afSource,
    );
  }

  // 5. Past history, trauma, medication (E_외_과_약)
  const eoa = info.E_외_과_약;
  const eoaSource = (eoa.source as string) ?? 'patient';

  // 5a. Past history: 과 + E + 주산기 + 산모 + 신생아
  const pastParts: string[] = [];
  if (eoa.과 !== null && eoa.과 !== undefined) {
    const past = eoa.과;
    if (typeof past === 'string' && past !== '-') {
      pastParts.push(past);
    } else if (past && typeof past === 'object') {
      const t = serializeObj(past as Record<string, unknown>);
      if (t) pastParts.push(t);
    }
  }
  if (eoa.E !== null && eoa.E !== undefined) {
    const e = eoa.E;
    const eStr =
      typeof e === 'string'
        ? e
        : serializeObj(e as Record<string, unknown>);
    if (eStr) pastParts.push(`건강검진: ${eStr}`);
  }
  for (const key of ['주산기', '산모', '신생아'] as const) {
    if (eoa[key] && typeof eoa[key] === 'object') {
      const t = serializeObj(eoa[key] as Record<string, unknown>);
      if (t) pastParts.push(`${key}: ${t}`);
    }
  }
  if (pastParts.length > 0) {
    push(
      'past',
      'history_past',
      `[과거력] ${pastParts.join(' ')}`,
      eoaSource,
    );
  }

  // 5b. Trauma
  if (eoa.외 !== null && eoa.외 !== undefined) {
    const 외 = eoa.외;
    const 외str =
      typeof 외 === 'string'
        ? 외
        : serializeObj(외 as Record<string, unknown>);
    if (외str) push('trauma', 'history_trauma', `[외상] ${외str}`, eoaSource);
  }
  if (typeof eoa.외상_과거력 === 'string' && eoa.외상_과거력) {
    push(
      'trauma',
      'history_trauma',
      `[외상 / 과거력] ${eoa.외상_과거력}`,
      eoaSource,
    );
  }

  // 5c. Medication
  if (eoa.약 !== null && eoa.약 !== undefined) {
    const 약 = eoa.약;
    const 약str =
      typeof 약 === 'string'
        ? 약
        : serializeObj(약 as Record<string, unknown>);
    if (약str)
      push('medication', 'history_medication', `[약물] ${약str}`, eoaSource);
  }

  // 6. Social & family history
  const social = (info.사회력_가족력 ??
    info.사회력_가족력_여성력) as Record<string, unknown> | undefined;
  if (social) {
    const socialSource = (social.source as string) ?? 'patient';
    const { source: _ss, 가족력, 여성력, ...socialData } = social as {
      source?: unknown;
      가족력?: unknown;
      여성력?: unknown;
      [k: string]: unknown;
    };

    const socialText = serializeObj(socialData as Record<string, unknown>);
    if (socialText)
      push(
        'social',
        'history_social',
        `[사회력] ${socialText}`,
        socialSource,
      );

    if (가족력 !== null && 가족력 !== undefined && 가족력 !== '-') {
      const 가족Text =
        typeof 가족력 === 'string'
          ? 가족력
          : serializeObj(가족력 as Record<string, unknown>);
      if (가족Text)
        push(
          'family',
          'history_family',
          `[가족력] ${가족Text}`,
          socialSource,
        );
    }

    if (여성력) {
      const 여성Text =
        typeof 여성력 === 'string'
          ? 여성력
          : serializeObj(여성력 as Record<string, unknown>);
      if (여성Text)
        push(
          'gynecologic',
          'history_gynecologic',
          `[여성력] ${여성Text}`,
          socialSource,
        );
    }
  }

  // 7. Developmental history (pediatric only)
  if (info.발달력) {
    const dev = info.발달력;
    const devSource = (dev.source as string) ?? 'caregiver';
    const { source: _ds, ...devData } = dev;
    const devText = serializeObj(devData as Record<string, unknown>);
    if (devText)
      push(
        'development',
        'history_development',
        `[발달력] ${devText}`,
        devSource,
      );
  }

  // 8. Physical exam
  const pe = (info.P_E ??
    info.P_E_및_특이사항) as Record<string, unknown> | undefined;
  if (pe) {
    const peSource = (pe.source as string) ?? 'exam';
    const {
      source: _ps,
      신체진찰시행,
      신체진찰미시행사유: _미시행,
      질문: peQuestion,
      특이사항: _특이,
      ...peData
    } = pe as {
      source?: unknown;
      신체진찰시행?: boolean;
      신체진찰미시행사유?: unknown;
      질문?: string | null;
      특이사항?: unknown;
      [k: string]: unknown;
    };

    if (신체진찰시행 !== false) {
      const peText = serializeObj(peData as Record<string, unknown>);
      if (peText)
        push('pe', 'physical_exam', `[신체 진찰] ${peText}`, peSource);
    }

    if (peQuestion && typeof peQuestion === 'string') {
      const qSrc =
        info.기본정보.source === 'caregiver' ? 'caregiver' : 'patient';
      push(
        'patient_question',
        'patient_question',
        `[환자 질문] ${peQuestion}`,
        qSrc,
      );
    }
  }

  // 9. Patient question from 질문_특이사항
  if (info.질문_특이사항) {
    const qa = info.질문_특이사항 as Record<string, unknown>;
    const 질문 = qa.질문 as string | null | undefined;
    if (질문 && typeof 질문 === 'string') {
      const alreadyAdded = chunks.some((c) => c.section === 'patient_question');
      if (!alreadyAdded) {
        const qSrc =
          info.기본정보.source === 'caregiver' ? 'caregiver' : 'patient';
        push(
          'patient_question',
          'patient_question',
          `[환자 질문] ${질문}`,
          qSrc,
        );
      }
    }
  }

  return chunks;
}

// ==================== DB Operations ====================

async function upsertCase(caseRecord: CaseRecord): Promise<string> {
  const simulationCaseId = `seizure_case_${String(caseRecord.증례번호).padStart(2, '0')}`;
  const openingStatement = caseRecord.문진및신체진찰정보.기본정보.주소;
  const likelyDiagnoses = caseRecord.환자교육.가능성이높은진단;
  const evaluationModuleId = evaluationModuleForSimulationTopic(TOPIC_ID);
  const patientPrompt = JSON.stringify(caseRecord.문진및신체진찰정보);

  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM "Case"
     WHERE "simulationCaseId" = $1 OR slug = $1
     LIMIT 1`,
    [simulationCaseId],
  );

  const values = [
    existing.rows[0]?.id ?? randomUUID(),
    simulationCaseId,
    publicTitle(caseRecord),
    openingStatement,
    'simulation',
    simulationCaseId,
    TOPIC_ID,
    evaluationModuleId,
    JSON.stringify(buildPatientProfile(caseRecord)),
    openingStatement,
    likelyDiagnoses.join(', '),
    JSON.stringify(buildChecklist(caseRecord)),
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

// ==================== Main ====================

async function main() {
  const dataFilePath = join(root, 'data', 'seizure_cases.json');
  const raw = readFileSync(dataFilePath, 'utf-8');
  const dataFile = JSON.parse(raw) as DataFile;
  const cases = dataFile.증례목록;

  console.log('[SimulationRAG Import]');
  console.log(`source: seizure_cases.json (v${dataFile.schema_version})`);
  console.log(`cases: ${cases.length}`);

  const openai = getOpenAI();
  let importedCases = 0;
  let upsertedChunks = 0;
  const needsEmbedding: Array<{ id: string; text: string }> = [];

  for (const cpxCase of cases) {
    const caseDbId = await upsertCase(cpxCase);
    importedCases++;

    const chunks = buildChunksForCase(cpxCase);
    for (const chunk of chunks) {
      const result = await upsertChunk(chunk, caseDbId);
      upsertedChunks++;
      if (result.needsEmbedding) {
        needsEmbedding.push({ id: result.id, text: result.text });
      }
    }

    const simulationCaseId = `seizure_case_${String(cpxCase.증례번호).padStart(2, '0')}`;
    console.log(
      `  [${simulationCaseId}] ${publicTitle(cpxCase)} — ${chunks.length} chunks`,
    );
  }

  const embedded = await embedAndSave(openai, needsEmbedding);

  console.log(`\nimported cases: ${importedCases}`);
  console.log(`upserted chunks: ${upsertedChunks}`);
  console.log(`embedded chunks: ${embedded}`);
  console.log(`skipped embeddings: ${upsertedChunks - needsEmbedding.length}`);
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
