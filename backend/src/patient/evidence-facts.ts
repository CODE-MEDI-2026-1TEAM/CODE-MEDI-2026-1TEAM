import { createHash } from 'crypto';
import { CONCEPT_BY_ID, FIELD_CONCEPT } from './concept-catalog';
import {
  EVIDENCE_SCHEMA_VERSION,
  type EvidenceCorpus,
  type EvidenceFact,
} from './evidence-contract';
import { patientLanguage, type PatientPersona } from './patient-facts';
import type { PatientPhase } from './patient-question';
export const hashContent = (x: unknown) =>
  createHash('sha256').update(JSON.stringify(x)).digest('hex');
const record = (x: unknown): Record<string, any> =>
  x && typeof x === 'object' && !Array.isArray(x)
    ? (x as Record<string, any>)
    : {};
const fieldLabels: Record<string, string> = {
  DM: '당뇨',
  HTN: '고혈압',
  Tb: '결핵',
  TB: '결핵',
  Hepatitis: '간염',
};

export function renderEvidenceValue(
  concept: string,
  value: string | number | boolean,
  label: string,
  aspect: EvidenceFact['aspect'],
): string {
  const definition = CONCEPT_BY_ID.get(concept);
  if (typeof value === 'string' && /^(없음|없다|없어요)$/.test(value.trim()))
    return definition?.negative ?? `${definition?.label ?? label}은 없어요.`;
  if (typeof value === 'boolean') {
    if (concept === 'sleep' && label === '잠듦')
      return value ? '잠들었어요.' : '잠들지는 않았어요.';
    if (concept === 'responsiveness' && label === '반응')
      return value ? '불렀을 때 대답했어요.' : '불러도 대답하지 못했어요.';
    if (concept === 'birth_history')
      return `${label}에서 문제${value ? '가 있었어요' : '는 없었어요'}.`;
    if (concept === 'development')
      return `${label}${value ? '은 할 수 있어요' : '은 아직 못 해요'}.`;
    if (concept === 'family_history')
      return `${label.replace(/^가족중/, '가족 중 ')}${value ? '이 있어요' : '은 없어요'}.`;
    if (concept === 'past_history')
      return `${fieldLabels[label] ?? label}을 진단받은 적${value ? '이 있어요' : '은 없어요'}.`;
    return (
      (value ? definition?.positive : definition?.negative) ??
      `${concept === 'source_detail' ? label : (definition?.label ?? label)}${value ? '은 있었어요.' : '은 없었어요.'}`
    );
  }
  const text = patientLanguage(String(value))
    .replace(/[.。]$/, '')
    .trim();
  if (aspect === 'severity') return `10점 중 ${text}점 정도예요.`;
  if (aspect === 'onset')
    return `${text}${text.endsWith('부터') ? '' : '부터'} 그랬어요.`;
  if (aspect === 'duration' || concept === 'duration')
    return `${text} 정도였어요.`;
  if (concept === 'frequency')
    return `${text}${typeof value === 'number' ? '번' : ''}이었어요.`;
  if (concept === 'name') return `${text}입니다.`;
  if (concept === 'birth_date')
    return `${text.replace(/^(\d+)-(\d+)-(\d+)$/, '$1년 $2월 $3일')}이에요.`;
  if (concept === 'chief_complaint')
    return /[요다]$/.test(text) ? `${text}.` : `${text} 때문에 왔어요.`;
  if (concept === 'medication') return `${text}을 먹었어요.`;
  if (concept === 'alcohol' || concept === 'recent_alcohol')
    return `${text}${text.endsWith('때') ? ' 마셔요' : ' 정도 마셔요'}.`;
  if (concept === 'smoking') return `${text} 정도 피웠어요.`;
  if (concept === 'seizure_pattern' || concept === 'morning_myoclonus')
    return `${text
      .replace(/함$/, '어요')
      .replace(/떨림$/, '떨렸어요')
      .replace(
        /전신화$/,
        '온몸으로 번졌어요',
      )}${/[요다]$/.test(text) ? '.' : ' 모습이었다고 해요.'}`;
  return `${text}${/[요다]$/.test(text) ? '.' : ' 정도예요.'}`;
}

export function normalizeEvidence(
  caseId: string,
  patientPrompt: string,
  persona: PatientPersona,
  chiefComplaint: string,
): EvidenceCorpus {
  const info = record(JSON.parse(patientPrompt));
  if (!Object.keys(record(info.기본정보)).length)
    throw new Error('Missing structured case data');
  const caseVersion = hashContent([
    EVIDENCE_SCHEMA_VERSION,
    patientPrompt,
    persona,
    chiefComplaint,
  ]);
  const corpus: EvidenceCorpus = {
    caseId,
    caseVersion,
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    facts: [],
    issues: [],
  };
  const put = (
    path: string,
    conceptId: string,
    raw: unknown,
    source: string,
    phase: PatientPhase = 'general',
    aspect: EvidenceFact['aspect'] = 'value',
    label = path.split('.').at(-1)!,
    time?: EvidenceFact['timeScope'],
    subject = 'patient',
    original: unknown = raw,
  ) => {
    if (conceptId === 'family_history') subject = 'family';
    if (raw === null || raw === undefined || raw === '' || raw === '-') return;
    if (Array.isArray(raw)) {
      if (conceptId === 'duration' && raw.length && raw.every((value) =>
        typeof value === 'string' && /\d.*(?:초|분|시간)/.test(value),
      ))
        raw = raw.join(' / ');
      else {
        corpus.issues.push({ path, reason: 'ambiguous_multiple_values' });
        return;
      }
    }
    if (!['string', 'number', 'boolean'].includes(typeof raw)) return;
    if (!['patient', 'caregiver', 'witness'].includes(source)) {
      corpus.issues.push({ path, reason: 'non_patient_source' });
      return;
    }
    const value = raw as EvidenceFact['value'];
    const definition = CONCEPT_BY_ID.get(conceptId);
    const isPast =
      conceptId === 'birth_history' ||
      path.startsWith('E_외_과_약.과') || path.startsWith('E_외_과_약.외');
    const isUsual =
      /^(사회력_가족력|사회력_가족력_여성력)\./.test(path) ||
      conceptId === 'alcohol';
    const specialEvent = conceptId === 'morning_myoclonus';
    const timeScope =
      time ?? (specialEvent || isPast ? 'past' : isUsual ? 'usual' : 'episode');
    const eventId = specialEvent
      ? 'morning_myoclonus'
      : timeScope === 'past' || timeScope === 'usual'
        ? 'background'
        : 'main_seizure';
    const reply = renderEvidenceValue(conceptId, value, label, aspect);
    corpus.facts.push({
      id: `${caseId}:${hashContent([EVIDENCE_SCHEMA_VERSION, path, conceptId, aspect, subject]).slice(0, 24)}`,
      caseId,
      caseVersion,
      conceptId,
      subjectId: subject,
      eventId,
      timeScope,
      phase,
      aspect,
      label,
      value,
      unit:
        aspect === 'severity'
          ? 'NRS'
          : (/\d\s*(초|분|시간|개월|년|병|잔|갑)/.exec(String(value))?.[1] ??
            null),
      polarity:
        typeof value === 'boolean'
          ? value
            ? 'positive'
            : 'negative'
          : 'unspecified',
      informationSource: source as EvidenceFact['informationSource'],
      visibility: 'patient',
      knownBy:
        source === 'witness'
          ? ['witness']
          : source === 'caregiver'
            ? ['caregiver']
            : ['patient'],
      sourceRef: {
        path,
        contentHash: hashContent(original),
        originalValue: original,
      },
      reply,
      searchText: [
        subject === 'mother'
          ? '산모 어머니'
          : subject === 'family'
            ? '가족'
            : '환자',
        eventId === 'morning_myoclonus'
          ? '별도의 아침 움찔거림'
          : eventId === 'main_seizure'
            ? '이번 발작 경련'
            : '평소 또는 과거 병력',
        { pre: '발작 전', during: '발작 중', post: '발작 후', general: '' }[
          phase
        ],
        {
          current: '현재 상태',
          episode: '이번 상황',
          usual: '평소',
          past: '과거',
        }[timeScope],
        {
          value: '',
          onset: '시작 시점',
          duration: '지속 시간 얼마나 오래',
          frequency: '횟수 빈도',
          severity: '정도 강도',
          direction: '방향',
          first_age: '처음 나이',
        }[aspect],
        conceptId,
        definition?.label,
        ...(definition?.aliases ?? []),
        label,
        aspect,
        timeScope,
        phase,
        patientLanguage(String(value)),
      ].join(' '),
    });
  };
  const walk = (
    node: unknown,
    path: string,
    source: string,
    phase: PatientPhase = 'general',
  ) => {
    const obj = record(node);
    source = typeof obj.source === 'string' ? obj.source : source;
    if (obj.원문정보없음 === true) return;
    for (const [key, raw] of Object.entries(obj)) {
      if (/^(source|원문|해석|근거)/.test(key)) continue;
      const p = `${path}.${key}`;
      const child = record(raw);
      // A_F disease names are grouping headings, not past-history leaf facts.
      if (path === 'A_F') {
        walk(raw, p, source, phase);
        continue;
      }
      let concept = FIELD_CONCEPT.get(key);
      if (path === '발달력') concept = 'development';
      if (/^E_외_과_약\.(주산기|신생아)\./.test(p)) concept = 'birth_history';
      if (p.startsWith('E_외_과_약.산모.')) {
        if (
          key === '예방접종' ||
          (key.length > 1 &&
            ['boolean', 'string', 'number'].includes(typeof raw))
        )
          put(
            p,
            key === '예방접종' ? 'vaccination' : 'source_detail',
            raw,
            source,
            phase,
            'value',
            key,
            'past',
            'mother',
          );
        else if (raw != null)
          corpus.issues.push({ path: p, reason: 'unmapped_maternal_field' });
        continue;
      }
      if (p === 'E_외_과_약.과' && typeof raw === 'string')
        concept = 'past_history';
      if (p === 'E_외_과_약.외' && typeof raw === 'string') concept = 'trauma';
      if (!concept) {
        if (raw && typeof raw === 'object') walk(raw, p, source, phase);
        else if (
          raw != null &&
          key.length > 1 &&
          !['목격자확인', '원인', '영양상태', '보호자교감'].includes(key) &&
          /[가-힣]/.test(key)
        )
          put(
            p,
            p.startsWith('E_외_과_약.과.') ? 'past_history' : 'source_detail',
            raw,
            source,
            phase,
            'value',
            key,
          );
        else if (raw !== null)
          corpus.issues.push({ path: p, reason: 'unmapped_source_field' });
        continue;
      }
      const childSource = String(child.source ?? source);
      const baseKey = ['상세', '값', '있음'].find(
        (k) => child[k] !== undefined && child[k] !== null,
      );
      const base = baseKey ? child[baseKey] : raw;
      const directed =
        concept === 'memory' &&
        ['기억상실', '기억소실'].includes(key) &&
        typeof base === 'boolean'
          ? !base
          : base;
      const factPhase =
        key === '경련중기억'
          ? 'during'
          : concept === 'prodrome'
            ? 'pre'
            : phase;
      put(
        baseKey ? `${p}.${baseKey}` : p,
        concept,
        directed,
        childSource,
        factPhase,
        'value',
        key,
        undefined,
        'patient',
        base,
      );
      for (const [field, aspect] of [
        ['시작', 'onset'],
        ['시점', 'onset'],
        ['지속시간', 'duration'],
        ['NRS', 'severity'],
        ['방향', 'direction'],
      ] as const) {
        if (child[field] !== undefined && child.있음 !== false)
          put(
            `${p}.${field}`,
            concept,
            child[field],
            childSource,
            factPhase,
            aspect,
            key,
          );
      }
      if (child.현재상태 !== undefined)
        put(
          `${p}.현재상태`,
          concept,
          child.현재상태,
          childSource,
          'general',
          'value',
          key,
          'current',
        );
      // A recognised parent concept must not hide its remaining descriptive leaves.
      // Keep the parent label/context and the exact child source path/value.
      if (child.있음 !== false) {
        const handled = new Set(['source', '상세', '값', '있음', '시작', '시점',
          '지속시간', 'NRS', '방향', '현재상태']);
        const parent = corpus.facts.find((fact) =>
          fact.sourceRef.path === (baseKey ? `${p}.${baseKey}` : p));
        for (const [field, value] of Object.entries(child)) {
          if (handled.has(field) || /^(원문|해석|근거)/.test(field) ||
            ['원인', '목격자확인', '영양상태', '보호자교감'].includes(field) ||
            field.length < 2 || !/[가-힣]/.test(field) ||
            !['string', 'number', 'boolean'].includes(typeof value)) continue;
          put(`${p}.${field}`, 'source_detail', value, childSource,
            factPhase, 'value', `${key} ${field}`,
            parent?.timeScope ?? (concept === 'birth_history' ? 'past' : undefined),
            parent?.subjectId ?? 'patient');
        }
      }
      if (concept === 'memory' && directed === raw && typeof raw === 'object')
        walk(raw, p, source, phase);
    }
  };
  const basic = record(info.기본정보);
  const source = String(
    basic.source ?? (persona.isGuardianCase ? 'caregiver' : 'patient'),
  );
  for (const [key, concept] of [
    ['성함', 'name'],
    ['생년월일', 'birth_date'],
    ['나이', 'age'],
    ['성별', 'sex'],
    ['주소', 'chief_complaint'],
  ] as const)
    put(
      `기본정보.${key}`,
      concept,
      basic[key] ??
        (concept === 'chief_complaint'
          ? chiefComplaint
          : persona[
              (
                {
                  name: 'name',
                  birth_date: 'birthDate',
                  age: 'ageRaw',
                  sex: 'sex',
                } as any
              )[concept]
            ]),
      source,
      'general',
      'value',
      key,
      'current',
    );
  const old = record(info.O_L_D_Co_Ex);
  for (const [key, concept] of [
    ['O', 'onset'],
    ['L', 'location'],
    ['Co', 'course'],
    ['Ex', 'previous_episode'],
  ] as const) {
    const node = record(old[key]);
    if (node.원문표기 !== '-')
      put(
        `O_L_D_Co_Ex.${key}.값`,
        concept,
        node.값,
        String(node.source ?? source),
      );
  }
  const duration = record(old.D);
  put(
    'O_L_D_Co_Ex.D.지속시간',
    'duration',
    duration.지속시간 ?? duration.값,
    String(duration.source ?? source),
  );
  put(
    'O_L_D_Co_Ex.D.횟수',
    'frequency',
    duration.횟수 ?? duration.빈도,
    String(duration.source ?? source),
  );
  for (const [key, phase] of [
    ['경련전', 'pre'],
    ['경련중', 'during'],
    ['경련후', 'post'],
  ] as const)
    walk(record(info.C)[key], `C.${key}`, source, phase);
  put(
    'C.기억범위.값',
    'memory',
    record(record(info.C).기억범위).값,
    String(record(record(info.C).기억범위).source ?? source),
    'during',
  );
  put(
    'C.전체상황.값',
    'situation',
    record(record(info.C).전체상황).값,
    String(record(record(info.C).전체상황).source ?? source),
  );
  for (const root of [
    'A_F',
    'E_외_과_약',
    '사회력_가족력',
    '사회력_가족력_여성력',
    '발달력',
  ])
    walk(info[root], root, source);
  // Only the patient's own question is public. Examination/station/rubric blocks never enter this corpus.
  const concern =
    record(info.질문_특이사항).질문 ?? record(info.P_E_및_특이사항).질문;
  put(
    record(info.질문_특이사항).질문 != null
      ? '질문_특이사항.질문'
      : 'P_E_및_특이사항.질문',
    'concern',
    concern,
    source,
  );
  if (persona.witnessPresent && persona.witnessRelation)
    put(
      'persona.witnessRelation',
      'witness_relationship',
      persona.witnessRelation,
      'patient',
      'general',
      'value',
      '목격자',
      'current',
    );
  if (persona.isGuardianCase && persona.guardianRole)
    put(
      'persona.guardianRole',
      'guardian_relationship',
      persona.guardianRole,
      'caregiver',
      'general',
      'value',
      '보호자',
      'current',
    );
  return corpus;
}
