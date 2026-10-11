import { createHash } from 'crypto';
import type { PatientPhase, PatientQuestion } from './patient-question';

export type PatientPersona = {
  name?: string | null;
  birthDate?: string | null;
  ageRaw?: string | null;
  sex?: string | null;
  tone?: string;
  isGuardianCase?: boolean;
  guardianRole?: string | null;
  witnessPresent?: boolean;
  witnessRelation?: string | null;
};

export type PatientFact = {
  id: string;
  topic: string;
  phase: PatientPhase;
  aspect: PatientQuestion['aspect'];
  source: string;
  label: string;
  value: string | number | boolean;
  reply: string;
};

const WORDS: Record<string, [string, string]> = {
  prodrome: ['이상한 느낌이 있었어요.', '미리 이상한 느낌은 없었어요.'],
  consciousness: ['정신을 잃었어요.', '정신은 있었어요.'],
  responsiveness: ['불렀을 때 대답하지 못했어요.', '불렀을 때 대답했어요.'],
  tingling: ['저린 느낌이 있었어요.', '저린 느낌은 없었어요.'],
  memory: ['기억이 나요.', '그때는 기억이 안 나요.'],
  seizure_pattern: ['몸이 뻣뻣해졌어요.', '몸이 떨리지는 않았어요.'],
  tongue_bite: ['혀를 깨물었어요.', '혀를 깨물지는 않았어요.'],
  urinary_incontinence: ['소변을 지렸어요.', '소변을 지리지는 않았어요.'],
  fecal_incontinence: ['대변을 지렸어요.', '대변을 지리지는 않았어요.'],
  salivation: ['침을 흘렸어요.', '침을 흘리지는 않았어요.'],
  eye_deviation: ['눈이 돌아갔어요.', '눈이 돌아가지는 않았어요.'],
  head_deviation: ['고개가 돌아갔어요.', '고개가 돌아가지는 않았어요.'],
  automatism: ['손을 만지작거렸어요.', '그런 움직임은 없었어요.'],
  fever: ['열이 났어요.', '열은 없었어요.'],
  chills: ['몸이 으슬으슬했어요.', '몸이 으슬으슬하지는 않았어요.'],
  headache: ['머리가 아팠어요.', '머리는 아프지 않았어요.'],
  neck_stiffness: ['목이 뻣뻣했어요.', '목이 뻣뻣하지는 않았어요.'],
  vision: ['잘 보이지 않았어요.', '보는 데 불편하지는 않았어요.'],
  dizziness: ['어지러웠어요.', '어지럽지는 않았어요.'],
  nausea: ['속이 메스꺼웠어요.', '속이 메스껍지는 않았어요.'],
  vomiting: ['토했어요.', '토하지는 않았어요.'],
  cough: ['기침이 났어요.', '기침은 없었어요.'],
  sputum: ['가래가 있었어요.', '가래는 없었어요.'],
  dyspnea: ['숨이 찼어요.', '숨이 차지는 않았어요.'],
  palpitations: ['가슴이 두근거렸어요.', '가슴이 두근거리지는 않았어요.'],
  fatigue: ['피곤했어요.', '피곤하지는 않았어요.'],
  muscle_pain: ['몸이 쑤셨어요.', '몸이 쑤시지는 않았어요.'],
  weakness: ['팔다리에 힘이 빠졌어요.', '팔다리에 힘이 빠지지는 않았어요.'],
  sleep: ['잠을 잘 못 잤어요.', '잠이 부족하지는 않았어요.'],
  alcohol: ['술을 마셨어요.', '술은 마시지 않았어요.'],
  smoking: ['담배를 피워요.', '담배는 안 피워요.'],
  caffeine: ['커피를 마셔요.', '커피는 안 마셔요.'],
  stress: ['스트레스를 받았어요.', '스트레스는 없었어요.'],
  exercise: ['운동을 해요.', '운동은 안 해요.'],
  trauma: ['머리를 다친 적이 있어요.', '머리를 다친 적은 없어요.'],
  surgery: ['수술받은 적이 있어요.', '수술받은 적은 없어요.'],
  family_history: ['가족 중 그런 일이 있었어요.', '가족 중 그런 일은 없어요.'],
};

export function patientLanguage(text: string): string {
  return text
    .replace(/의식소실\(-\)/g, '정신은 있었음')
    .replace(/전신\s*강직간대발작/g, '온몸이 뻣뻣해졌다가 떨림')
    .replace(/\bsocial\b/gi, '가끔 마셔요')
    .replace(/C-sec/gi, '제왕절개')
    .replace(/의식\s*소실/g, '정신을 잃음')
    .replace(/전조\s*증상|전구\s*증상/g, '이상한 느낌')
    .replace(/대소변\s*실금/g, '소변이나 대변을 지림')
    .replace(/요실금/g, '소변을 지림')
    .replace(/변실금/g, '대변을 지림')
    .replace(/경부강직|수막자극징후/g, '목이 뻣뻣함')
    .replace(/근간대성경련/g, '갑자기 움찔거림')
    .replace(/국소마비/g, '한쪽에 힘이 빠짐');
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function particle(text: string, consonant: string, vowel: string): string {
  const code = text.charCodeAt(text.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? consonant : vowel;
}

const KEYS: Array<[string, RegExp]> = [
  ['prodrome', /전조|전구/],
  ['consciousness', /의식소실/],
  ['responsiveness', /반응없음/],
  ['memory', /기억/],
  ['seizure_pattern', /양상|시작양상|뻣뻣하게|떨림|진행/],
  ['tongue_bite', /혀깨물/],
  ['urinary_incontinence', /요실금|소변지림|^소변$/],
  ['fecal_incontinence', /^변실금$|대변지림|^대변$/],
  ['incontinence', /대소변/],
  ['salivation', /침흘림/],
  ['eye_deviation', /안구편위|눈한쪽|눈위로|눈치켜|머리나눈/],
  ['head_deviation', /고개|목돌아/],
  ['automatism', /자동증/],
  ['fever', /발열|심한열/],
  ['chills', /오한/],
  ['headache', /두통/],
  ['neck_stiffness', /목뻣뻣|목경직|수막자극/],
  ['vision', /시야|복시/],
  ['dizziness', /어지럼/],
  ['nausea', /메스꺼|오심|^N$/],
  ['vomiting', /구토|^V$/],
  ['cough', /기침|감기증상|최근감기/],
  ['sputum', /가래/],
  ['dyspnea', /호흡곤란/],
  ['palpitations', /두근거림/],
  ['fatigue', /피로|피곤/],
  ['muscle_pain', /근육통/],
  ['weakness', /힘빠짐|마비|근력이상/],
  ['tingling', /감각.*이상|손가락끝저림/],
  ['sleep', /수면|잠/],
  ['alcohol', /음주|과음|^술$|술많이/],
  ['smoking', /담배|흡연/],
  ['caffeine', /커피/],
  ['occupation', /직업/],
  ['stress', /스트레스|과로/],
  ['exercise', /^운동$/],
  ['diet', /식사|이유식/],
  ['family_history', /가족/],
  ['gynecologic', /여성력/],
  ['trauma', /두부외상|머리.*다침|외상_과거력/],
  ['surgery', /수술/],
  ['situation', /상황/],
];

export function extractPatientFacts(
  caseId: string,
  clinicalInfo: unknown,
  persona: PatientPersona,
  chiefComplaint?: string,
): PatientFact[] {
  const info = record(clinicalInfo);
  const facts: PatientFact[] = [];
  const put = (
    topic: string,
    value: unknown,
    source = 'patient',
    phase: PatientPhase = 'general',
    label = topic,
    aspect: PatientQuestion['aspect'] = 'value',
    customReply?: string,
  ) => {
    if (
      value === null ||
      value === undefined ||
      value === '-' ||
      value === '' ||
      !['string', 'number', 'boolean'].includes(typeof value)
    )
      return;
    if (source === 'exam' || source === 'station') return;
    let reply = customReply;
    if (!reply && typeof value === 'boolean') {
      const words = WORDS[topic];
      if (!words) return;
      reply = words[value ? 0 : 1];
    }
    if (!reply) {
      const text = patientLanguage(String(value)).trim();
      if (/^(?:없음|없다|없어요)$/.test(text))
        reply =
          topic === 'medication'
            ? '먹는 약은 없어요.'
            : topic === 'family_history'
              ? '가족 중 그런 일은 없어요.'
              : `${label}은 없어요.`;
      else if (topic === 'name') reply = `${text}입니다.`;
      else if (topic === 'birth_date') {
        const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
        reply = date
          ? `${date[1]}년 ${Number(date[2])}월 ${Number(date[3])}일이에요.`
          : `${text}이에요.`;
      } else if (topic === 'age') reply = `${text}이에요.`;
      else if (topic === 'frequency' && typeof value === 'number')
        reply = `${text}번이었어요.`;
      else if (aspect === 'severity') reply = `10점 중 ${text}점 정도예요.`;
      else if (topic === 'occupation')
        reply = `${text}${particle(text, '이에요', '예요')}.`;
      else if (topic === 'smoking') reply = `${text} 정도 피웠어요.`;
      else if (topic === 'alcohol')
        reply =
          text === '회식 때'
            ? '회식할 때 마셔요.'
            : text === '가끔 마셔요'
              ? `${text}.`
              : `${text} 정도 마셔요.`;
      else if (topic === 'onset') reply = `${text}부터 그랬어요.`;
      else if (topic === 'medication') {
        const medicine = text.replace(/\([^)]*\)/g, '').trim();
        reply = `${medicine}${particle(medicine, '을', '를')} 먹었어요.`;
      } else if (topic === 'seizure_pattern') {
        const descriptions: Record<string, string> = {
          '팔다리를 접었다 폈다 반복함': '팔다리를 자꾸 접었다 폈다고 해요.',
          '처음 왼팔/왼다리가 뻣뻣해지며 시작':
            '처음에 왼팔과 왼다리가 뻣뻣해졌어요.',
          '전신이 뻣뻣해지면서 떨림': '온몸이 뻣뻣해지면서 떨렸어요.',
          '양쪽 팔을 떨다가 처짐': '양팔을 떨다가 축 처졌대요.',
          '온몸이 뻣뻣해졌다가 떨림': '온몸이 뻣뻣해졌다가 떨렸대요.',
          '사지를 대칭적으로 접었다 폈다 하며 움찔움찔':
            '양팔과 양다리를 접었다 폈다 하면서 움찔거렸어요.',
        };
        reply = descriptions[text] ?? `${text} 모습이었어요.`;
      } else
        reply = `${text.replace(/[.。]$/, '')}${/[요다]$/.test(text) ? '.' : ' 정도예요.'}`;
    }
    facts.push({
      id: `${caseId}:${topic}:${phase}:${aspect}:${facts.length}`,
      topic,
      phase,
      aspect,
      source,
      label,
      value: value as PatientFact['value'],
      reply,
    });
  };
  const basic = record(info.기본정보);
  put('name', persona.name ?? basic.성함 ?? basic.이름);
  put('birth_date', persona.birthDate ?? basic.생년월일);
  put('age', persona.ageRaw ?? basic.나이);
  put('sex', persona.sex ?? basic.성별);
  const complaint = chiefComplaint ?? basic.주소;
  put(
    'chief_complaint',
    complaint,
    String(basic.source ?? 'patient'),
    'general',
    '주호소',
    'value',
    typeof complaint === 'string'
      ? `${patientLanguage(complaint)
          .replace(/경련|발작/g, '몸이 떨림')
          .replace(
            /[.。]$/,
            '',
          )}${/[요다]$/.test(complaint) ? '.' : ' 때문에 왔어요.'}`
      : undefined,
  );
  const old = record(info.O_L_D_Co_Ex);
  for (const [key, topic] of [
    ['O', 'onset'],
    ['L', 'location'],
    ['Co', 'course'],
    ['Ex', 'previous_episode'],
  ]) {
    const field = record(old[key]);
    if (field.원문표기 !== '-')
      put(topic, field.값, String(field.source ?? basic.source ?? 'patient'));
  }
  const duration = record(old.D);
  const durationValue = duration.지속시간 ?? duration.값;
  if (Array.isArray(durationValue))
    put(
      'duration',
      durationValue.join(', '),
      String(duration.source ?? 'witness'),
    );
  else put('duration', durationValue, String(duration.source ?? 'witness'));
  put(
    'frequency',
    duration.횟수 ?? duration.빈도,
    String(duration.source ?? 'witness'),
  );

  const walk = (obj: unknown, phase: PatientPhase, source: string) => {
    const current = record(obj);
    source = typeof current.source === 'string' ? current.source : source;
    if (current.원문정보없음 === true) return;
    for (const [key, value] of Object.entries(current)) {
      if (/^source|원문|해석|근거|환자응답|특이사항/.test(key)) continue;
      const topic = KEYS.find(([, pattern]) => pattern.test(key))?.[0];
      if (!topic) {
        if (value && typeof value === 'object') walk(value, phase, source);
        continue;
      }
      const nested = record(value);
      const presence = nested.있음;
      const baseValue =
        typeof presence === 'boolean'
          ? presence
          : (nested.값 ?? nested.상세 ?? value);
      if (topic === 'incontinence' && typeof baseValue === 'boolean') {
        put('urinary_incontinence', baseValue, source, phase, key);
        put('fecal_incontinence', baseValue, source, phase, key);
      } else {
        const directedValue =
          topic === 'memory' &&
          /상실|소실/.test(key) &&
          typeof baseValue === 'boolean'
            ? !baseValue
            : baseValue;
        const factPhase = /경련중기억/.test(key)
          ? 'during'
          : phase === 'general' && topic === 'prodrome'
            ? 'pre'
            : phase === 'general' && topic === 'automatism'
              ? 'during'
              : phase;
        put(
          topic,
          directedValue,
          String(nested.source ?? source),
          factPhase,
          key,
        );
      }
      if (nested.시작 ?? nested.시점)
        put(topic, nested.시작 ?? nested.시점, source, phase, key, 'onset');
      if (nested.지속시간)
        put(topic, nested.지속시간, source, phase, key, 'duration');
      if (nested.NRS !== undefined)
        put(topic, nested.NRS, source, phase, key, 'severity');
      if (typeof baseValue === 'string' && topic === 'alcohol') {
        const frequency =
          /매일|한\s*달\s*\d+(?:-\d+)?(?:번|회)|주\s*\d+(?:-\d+)?회/.exec(
            baseValue,
          )?.[0];
        if (frequency)
          put(
            topic,
            frequency,
            source,
            phase,
            key,
            'frequency',
            `${frequency} 마셔요.`,
          );
      }
      if (typeof baseValue === 'string' && topic === 'smoking') {
        const years = /\d+(?:-\d+)?년/.exec(baseValue)?.[0];
        if (years)
          put(
            topic,
            years,
            source,
            phase,
            key,
            'duration',
            `${years} 정도 피웠어요.`,
          );
      }
    }
  };
  const character = record(info.C);
  for (const [key, phase] of [
    ['경련전', 'pre'],
    ['경련중', 'during'],
    ['경련후', 'post'],
  ] as const)
    walk(character[key], phase, String(basic.source ?? 'patient'));
  const memory = record(character.기억범위);
  put('memory', memory.값, String(memory.source ?? 'patient'), 'during');
  const situation = record(character.전체상황);
  put('situation', situation.값, String(situation.source ?? 'patient'));
  walk(info.A_F, 'general', String(basic.source ?? 'patient'));
  const history = record(info.E_외_과_약);
  const historySource = String(history.source ?? basic.source ?? 'patient');
  put('medication', history.약, historySource);
  put(
    'trauma',
    history.외상_과거력 ??
      (typeof history.외 === 'string' ? history.외 : undefined),
    historySource,
  );
  walk(history.외, 'general', historySource);
  const past = record(history.과);
  const diseaseNames: Record<string, string> = {
    DM: '당뇨',
    HTN: '고혈압',
    Tb: '결핵',
    TB: '결핵',
    Hepatitis: '간염',
  };
  if (typeof history.과 === 'string')
    put('past_history', history.과, historySource, 'general', '과거 병력');
  for (const [key, value] of Object.entries(past)) {
    if (key === 'source') continue;
    const label = diseaseNames[key] ?? key;
    const v = record(value).있음 ?? value;
    put(
      'past_history',
      v,
      historySource,
      'general',
      label,
      'value',
      typeof v === 'boolean'
        ? v
          ? `${label}${particle(label, '을', '를')} 진단받은 적이 있어요.`
          : `${label}${particle(label, '을', '를')} 진단받은 적은 없어요.`
        : undefined,
    );
    const when = record(value).시점;
    if (when && v !== false)
      put('past_history', when, historySource, 'general', label, 'onset');
  }
  for (const key of ['주산기', '산모', '신생아']) {
    for (const [label, value] of Object.entries(record(history[key]))) {
      if (label === 'source' || typeof value === 'boolean') continue;
      put('birth_history', value, historySource, 'general', label);
    }
  }
  const social = record(info.사회력_가족력 ?? info.사회력_가족력_여성력);
  walk(social, 'general', String(social.source ?? basic.source ?? 'patient'));
  for (const [label, value] of Object.entries(record(info.발달력))) {
    if (label !== 'source' && typeof value === 'string')
      put('development', value, 'caregiver', 'general', label);
  }
  const pe = record(info.P_E_및_특이사항 ?? info.P_E);
  const concern = record(info.질문_특이사항).질문 ?? pe.질문;
  put(
    'concern',
    concern,
    String(basic.source ?? 'patient'),
    'general',
    '걱정',
    'value',
    typeof concern === 'string' ? patientLanguage(concern) : undefined,
  );
  return facts;
}

export function selectPatientFacts(
  question: PatientQuestion,
  facts: PatientFact[],
  persona: PatientPersona,
): PatientFact[] {
  let candidates = facts.filter(
    (f) => f.topic === question.topic && f.aspect === question.aspect,
  );
  if (question.topic === 'post_symptoms')
    candidates = facts.filter(
      (f) =>
        f.phase === 'post' &&
        ['fatigue', 'muscle_pain', 'weakness', 'memory'].includes(f.topic) &&
        f.aspect === 'value' &&
        f.value !== false,
    );
  if (question.topic === 'incontinence')
    candidates = facts.filter((f) =>
      ['urinary_incontinence', 'fecal_incontinence'].includes(f.topic),
    );
  const phased = candidates.filter((f) => f.phase === question.phase);
  if (phased.length) candidates = phased;
  else if (question.phase !== 'general')
    candidates = [
      'onset',
      'duration',
      'frequency',
      'location',
      'situation',
      'previous_episode',
      'course',
      'medication',
      'past_history',
      'family_history',
      'birth_history',
      'development',
      'occupation',
      'gynecologic',
    ].includes(question.topic)
      ? candidates.filter((f) => f.phase === 'general')
      : [];
  else {
    const general = candidates.filter((f) => f.phase === 'general');
    if (general.length) candidates = general;
    else if (new Set(candidates.map((f) => f.phase)).size > 1) return [];
  }
  if (question.topic === 'past_history') {
    const named = candidates.filter((f) =>
      question.text.replace(/\s/g, '').includes(f.label.replace(/\s/g, '')),
    );
    candidates = named.length
      ? named
      : candidates.filter((f) => f.value !== false);
  }
  if (question.topic === 'family_history') {
    const condition = /고혈압|당뇨|뇌전증|뇌졸중|경련|신경계질환/.exec(
      question.text,
    )?.[0];
    if (condition)
      candidates = candidates.filter((f) =>
        `${f.label} ${f.value}`.includes(condition),
      );
  }
  if (question.topic === 'location') {
    if (/부위|어느\s*쪽|팔다리|팔|다리|몸/.test(question.text))
      candidates = candidates.filter((f) =>
        /팔|다리|사지|전신/.test(String(f.value)),
      );
    else if (/어디서|어디에서|장소/.test(question.text))
      candidates = candidates.filter((f) =>
        /회사|집|학교|병원|현장|에서/.test(String(f.value)),
      );
  }
  if (
    question.topic === 'development' &&
    /눈맞춤|옹알|키|체중|까꿍/.test(question.text)
  ) {
    candidates = candidates.filter((f) =>
      [...question.text.matchAll(/눈맞춤|옹알|키|체중|까꿍/g)].some(([word]) =>
        f.label.includes(word),
      ),
    );
  }
  if (question.topic === 'alcohol') {
    const quantity = /얼마나|몇\s*(?:잔|병)|주량/.test(question.text);
    const recent = /어제|어젯|전날|이번|당시|그날/.test(question.text);
    const usual = /평소|주량/.test(question.text);
    const preferred = candidates.filter((f) =>
      quantity
        ? usual
          ? /평소음주량/.test(f.label)
          : /음주량/.test(f.label) && !/평소/.test(f.label)
        : recent
          ? /과음|술많이/.test(f.label)
          : /^(?:술|음주)$/.test(f.label),
    );
    if (preferred.length) candidates = preferred;
  }
  if (question.topic === 'sleep') {
    const recent = /어제|어젯|전날/.test(question.text);
    const preferred = candidates.filter((f) =>
      recent ? /어젯밤/.test(f.label) : !/어젯밤/.test(f.label),
    );
    if (preferred.length) candidates = preferred;
  }
  if (question.topic === 'eye_deviation') {
    const upwards = /위로|올라/.test(question.text);
    const sideways = /한쪽|옆/.test(question.text);
    const preferred = candidates.filter((f) =>
      upwards
        ? /위로|치켜/.test(f.label)
        : sideways
          ? /한쪽|편위/.test(f.label)
          : f.value === true,
    );
    if (preferred.length) candidates = preferred;
  }
  // Do not expose witness facts to the model when nobody could have witnessed them.
  candidates = candidates.filter(
    (f) => f.source !== 'witness' || persona.witnessPresent === true,
  );
  const unique = candidates.filter(
    (f, index) =>
      candidates.findIndex(
        (other) => other.reply === f.reply && other.topic === f.topic,
      ) === index,
  );
  return unique.slice(0, question.topic === 'incontinence' ? 2 : 1);
}

export class PatientFactCache {
  private readonly entries = new Map<string, PatientFact[]>();
  get(
    caseId: string,
    patientPrompt: string,
    persona: PatientPersona,
    chiefComplaint: string,
    requireStructured = false,
  ): PatientFact[] {
    const key = createHash('sha256')
      .update(
        JSON.stringify([
          caseId,
          patientPrompt,
          persona,
          chiefComplaint,
          requireStructured,
        ]),
      )
      .digest('hex');
    const cached = this.entries.get(key);
    if (cached) return cached;
    let info: unknown = {};
    try {
      info = JSON.parse(patientPrompt) as unknown;
    } catch {
      if (requireStructured) throw new Error('Invalid structured patient case');
      /* Legacy prose is retrieved separately. */
    }
    if (requireStructured && !Object.keys(record(record(info).기본정보)).length)
      throw new Error('Missing structured patient facts');
    const facts = extractPatientFacts(caseId, info, persona, chiefComplaint);
    if (this.entries.size >= 100)
      this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(key, facts);
    return facts;
  }
}
