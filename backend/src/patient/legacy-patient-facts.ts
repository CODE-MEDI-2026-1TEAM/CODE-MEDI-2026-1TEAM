import {
  analyzePatientQuestions,
  type PatientQuestion,
} from './patient-question';
import { patientLanguage, type PatientFact } from './patient-facts';

// Reviewed projections for the legacy seed. Exact matching intentionally fails closed after a prose edit.
const REVIEWED: Record<
  string,
  Array<[string, PatientFact['phase'], PatientFact['value'], string]>
> = {
  '어제 한 번 그랬다고 들었어요.': [
    ['onset', 'general', '어제', '어제 그랬어요.'],
  ],
  '누워 있다가 그랬고, 어머니가 보셨다고 했어요.': [
    ['situation', 'general', '누워 있음', '누워 있다가 그랬어요.'],
  ],
  '수십 초 동안 그랬고 전체 상황은 10분 안쪽이었다고 들었어요. 한 번이었어요.':
    [
      [
        'duration',
        'general',
        '수십 초 / 전체 상황 10분 안쪽',
        '수십 초 동안 그랬고 전체 상황은 10분 안쪽이었대요.',
      ],
      ['frequency', 'general', 1, '한 번이었어요.'],
    ],
  '특별히 이상한 느낌이나 전조 증상은 없었어요.': [
    ['prodrome', 'pre', false, '미리 이상한 느낌은 없었어요.'],
  ],
  '양쪽 팔을 떨다가 축 처졌고 눈이 위로 올라갔다고 들었어요.': [
    [
      'seizure_pattern',
      'during',
      '양팔 떨림 후 처짐',
      '양팔을 떨다가 축 처졌대요.',
    ],
    ['eye_deviation', 'during', true, '눈이 위로 올라갔대요.'],
  ],
  '혀를 깨물거나 대소변을 지리지는 않았다고 들었어요.': [
    ['tongue_bite', 'during', false, '혀를 깨물지는 않았대요.'],
    ['urinary_incontinence', 'during', false, '소변을 지리지는 않았대요.'],
    ['fecal_incontinence', 'during', false, '대변을 지리지는 않았대요.'],
  ],
  '끝나고 나서는 피곤했고 팔다리에 힘이 빠지는 느낌이 있었어요.': [
    ['fatigue', 'post', true, '끝나고 피곤했어요.'],
    ['weakness', 'post', true, '끝나고 팔다리에 힘이 빠졌어요.'],
  ],
  '열이나 두통, 목이 뻣뻣한 증상은 없었어요.': [
    ['fever', 'general', false, '열은 없었어요.'],
    ['headache', 'general', false, '머리는 아프지 않았어요.'],
    ['neck_stiffness', 'general', false, '목이 뻣뻣하지는 않았어요.'],
  ],
  '전날 술을 평소보다 많이 마셨고 잠도 잘 못 잤어요.': [
    ['alcohol', 'general', true, '전날 술을 평소보다 많이 마셨어요.'],
    ['sleep', 'general', true, '전날 잠을 잘 못 잤어요.'],
  ],
  '고등학교 때 몸이 떨린 적이 있고, 전날 과식하고 쓰러진 적도 있었어요.': [
    [
      'previous_episode',
      'general',
      '고등학교 / 전날',
      '고등학교 때 몸이 떨린 적이 있고, 전날 과식하고 쓰러진 적도 있어요.',
    ],
  ],
  '어릴 때 자전거를 타다가 머리를 다친 적은 있는데 심하게 다친 건 아니었어요.':
    [
      [
        'trauma',
        'general',
        '어릴 때 자전거 사고',
        '어릴 때 자전거 타다가 머리를 다친 적은 있어요.',
      ],
    ],
  '고등학교 때 뇌수막염을 앓았는데 지금은 다 나았어요.': [
    [
      'past_history',
      'general',
      '뇌수막염',
      '고등학교 때 뇌수막염을 앓았는데 다 나았어요.',
    ],
  ],
  '지금 먹는 약은 없어요.': [
    ['medication', 'general', false, '먹는 약은 없어요.'],
  ],
  '담배는 안 피우고, 술은 보통 한 달에 한두 번 정도 마셔요.': [
    ['smoking', 'general', false, '담배는 안 피워요.'],
    ['alcohol', 'general', '한 달 한두 번', '술은 한 달에 한두 번 마셔요.'],
  ],
};

export function isReviewedLegacyAnswer(answer: string): boolean {
  return Object.hasOwn(REVIEWED, answer);
}

/** Old section answers are usable only when reviewed or when a sentence contains one requested fact. */
export function projectLegacyFacts(
  question: PatientQuestion,
  rows: Array<{ id: string; answer: string; source?: string }>,
): PatientFact[] {
  const facts: PatientFact[] = [];
  for (const row of rows) {
    const reviewed = REVIEWED[row.answer];
    if (reviewed) {
      for (const [topic, phase, value, reply] of reviewed) {
        if (
          topic !== question.topic ||
          question.aspect !== 'value' ||
          (question.phase !== 'general' &&
            phase !== 'general' &&
            phase !== question.phase)
        )
          continue;
        facts.push({
          id: `${row.id}:${topic}`,
          topic,
          phase,
          aspect: 'value',
          source: row.source ?? 'patient',
          label: topic,
          value,
          reply,
        });
      }
      continue;
    }
    for (const sentence of row.answer
      .split(/(?<=[.!?。])\s+|\n/)
      .filter(Boolean)) {
      const topics = analyzePatientQuestions(sentence)
        .filter((q) => q.kind === 'history')
        .map((q) => q.topic);
      if (!topics.includes(question.topic) || new Set(topics).size !== 1)
        continue;
      if (question.aspect !== 'value') continue;
      facts.push({
        id: row.id,
        topic: question.topic,
        phase: question.phase,
        aspect: question.aspect,
        source: row.source ?? 'patient',
        label: question.topic,
        value: sentence,
        reply: patientLanguage(sentence),
      });
    }
  }
  if (question.topic === 'alcohol') {
    const recent = /어제|전날|그날/.test(question.text);
    const preferred = facts.filter((f) =>
      recent ? typeof f.value === 'boolean' : typeof f.value === 'string',
    );
    if (preferred.length) return preferred.slice(0, 1);
  }
  return facts.slice(0, 1);
}
