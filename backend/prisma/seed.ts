import 'dotenv/config';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const cpxCase = {
    slug: 'seizure-21m',
    title: '21세 남성 경련 환자',
    chiefComplaint: '경련',
    difficulty: 'beginner',
    simulationCaseId: 'seizure-001',
    simulationTopicId: 'seizure',
    evaluationModuleId: 'cpx-34-seizure',
    patientProfile: {
      name: '김준서',
      age: 21,
      sex: 'male',
      occupation: '대학생',
      tone: '당황스럽지만 질문에는 협조적으로 짧게 답함',
    },
    openingStatement: '안녕하세요.',
    hiddenDiagnosis: '청소년 근간대 뇌전증 의심',
    checklist: [
      '경련 발생 시점',
      '경련 당시 자세와 상황',
      '경련 지속 시간과 횟수',
      '목격자 여부',
      '경련 전 전조 증상',
      '경련 중 양상',
      '혀 깨물림 또는 대소변 실금 여부',
      '경련 후 피로감 또는 국소 마비',
      '발열, 두통, 목 뻣뻣함 등 동반 증상',
      '수면 부족, 음주, 스트레스 등 유발 요인',
      '과거 유사 증상',
      '두부 외상 병력',
      '뇌수막염 등 과거력',
      '복용 약물',
      '음주 및 흡연력',
      '신경학적 신체 진찰',
    ],
    redFlags: [
      '반복되는 경련',
      '경련 후 의식 회복 지연',
      '두부 외상',
      '발열 또는 수막자극 징후',
      '국소 신경학적 결손',
      '대소변 실금 또는 혀 깨물림',
      '수면 부족과 과음',
    ],
    patientPrompt: [
      '환자 정보:',
      '- 21세 남성 대학생이며 어제 한 차례 경련 증상이 있었다고 들음.',
      '- 경련 당시 누워 있는 자세였고 어머니가 목격함.',
      '- 본인은 세수할 때까지는 기억하지만 이후 경련 당시 상황은 잘 기억하지 못함.',
      '- 수십 초 동안 양쪽 팔을 떨다가 축 처졌고 전체 상황은 10분 내외였다고 들음.',
      '- 경련 전 전조 증상은 없었음.',
      '- 눈이나 고개가 한쪽으로 돌아가지는 않았고 혀를 깨물거나 대소변 실금은 없었음.',
      '- 경련 후 피곤했고 팔다리에 힘이 빠지는 느낌이 있었음.',
      '- 전날 평소보다 술을 많이 마셨고 잠을 잘 못 잤음.',
      '- 고등학교 때 비슷하게 떨린 적이 있고, 전날 과식하고 쓰러진 적도 있음.',
      '- 어렸을 때 자전거를 타다가 머리를 다친 적은 있지만 심한 외상은 아니었음.',
      '- 고등학교 때 뇌수막염을 앓았으나 현재는 완치됨.',
      '- 현재 복용 중인 약은 없음.',
      '- 흡연은 하지 않고, 평소 음주는 한 달에 1~2번 정도임.',
      '',
      '응답 규칙:',
      '- 학생이 관련 질문을 하기 전에는 위 정보를 한꺼번에 말하지 않는다.',
      '- 당황스러움과 걱정을 표현하되 과장하지 않는다.',
      '- 진단명이나 의학적 결론은 먼저 말하지 않는다.',
    ].join('\n'),
  };

  await pool.query(
    `
      INSERT INTO "Case" (
        "id",
        "slug",
        "title",
        "chiefComplaint",
        "difficulty",
        "simulationCaseId",
        "simulationTopicId",
        "evaluationModuleId",
        "patientProfile",
        "openingStatement",
        "hiddenDiagnosis",
        "checklist",
        "redFlags",
        "patientPrompt"
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12::jsonb, $13::jsonb, $14)
      ON CONFLICT ("slug") DO UPDATE SET
        "title" = EXCLUDED."title",
        "chiefComplaint" = EXCLUDED."chiefComplaint",
        "difficulty" = EXCLUDED."difficulty",
        "simulationCaseId" = EXCLUDED."simulationCaseId",
        "simulationTopicId" = EXCLUDED."simulationTopicId",
        "evaluationModuleId" = EXCLUDED."evaluationModuleId",
        "patientProfile" = EXCLUDED."patientProfile",
        "openingStatement" = EXCLUDED."openingStatement",
        "hiddenDiagnosis" = EXCLUDED."hiddenDiagnosis",
        "checklist" = EXCLUDED."checklist",
        "redFlags" = EXCLUDED."redFlags",
        "patientPrompt" = EXCLUDED."patientPrompt"
    `,
    [
      randomUUID(),
      cpxCase.slug,
      cpxCase.title,
      cpxCase.chiefComplaint,
      cpxCase.difficulty,
      cpxCase.simulationCaseId,
      cpxCase.simulationTopicId,
      cpxCase.evaluationModuleId,
      JSON.stringify(cpxCase.patientProfile),
      cpxCase.openingStatement,
      cpxCase.hiddenDiagnosis,
      JSON.stringify(cpxCase.checklist),
      JSON.stringify(cpxCase.redFlags),
      cpxCase.patientPrompt,
    ],
  );
}

main()
  .then(async () => {
    await pool.end();
  })
  .catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });
