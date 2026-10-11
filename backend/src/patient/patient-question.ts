export type PatientPhase = 'general' | 'pre' | 'during' | 'post';
export type PatientQuestion = {
  id: string;
  text: string;
  kind:
    | 'history'
    | 'identity'
    | 'social'
    | 'education'
    | 'exam'
    | 'diagnosis'
    | 'off_topic'
    | 'clarify';
  topic: string;
  phase: PatientPhase;
  aspect: 'value' | 'onset' | 'duration' | 'frequency' | 'severity';
  allowModel?: boolean;
};

const TOPICS: Array<[string, RegExp]> = [
  ['birth_date', /생년\s*월일|생일|몇\s*년생/],
  ['age', /나이|연세|몇\s*살/],
  ['name', /성함|성명|(?:환자|아이|본인).{0,4}이름|^이름/],
  ['sex', /성별/],
  [
    'chief_complaint',
    /어떤\s*증상|무슨\s*증상|어디가?\s*(?:불편|아프).*(?:오|내원)|왜\s*오|오셨|방문\s*이유/,
  ],
  [
    'onset',
    /언제부터|언제\s*부터|언제.{0,8}(?:시작|발생|그랬|떨|경련|발작)|처음.{0,6}시작/,
  ],
  [
    'duration',
    /얼마나\s*(?:오래|지속)|지속\s*시간|몇\s*(?:분|초|시간).{0,10}(?:지속|떨|발작|경련|그랬)|오래\s*갔/,
  ],
  ['frequency', /몇\s*번|횟수|빈도|얼마나\s*자주|하루에|반복/],
  [
    'previous_episode',
    /처음(?:인가|이에|이었|입니)|이전에도|예전에도|전에도|비슷한\s*적|또\s*그런|이런\s*적/,
  ],
  ['course', /점점|경과|더\s*심해|악화|나아졌|좋아졌/],
  [
    'location',
    /어느\s*부위|어느\s*쪽|어디서|어디에서|어느\s*장소|어디.{0,5}(?:떨|발작|경련)/,
  ],
  ['situation', /어떤\s*상황|뭘\s*하|무엇을\s*하|무슨\s*일을\s*하|자세/],
  ['prodrome', /전조|전구|이상한\s*느낌/],
  ['consciousness', /의식|정신.{0,4}(?:잃|있|돌아|차렸)|깨어|깼/],
  ['responsiveness', /대답|반응/],
  ['memory', /기억/],
  [
    'seizure_pattern',
    /어떤\s*(?:모습|양상)|어떤\s*식|어떻게\s*(?:떨|경련|발작)|팔다리.{0,8}(?:떨|뻣뻣)|몸.{0,8}(?:굳|떨)|움찔/,
  ],
  ['post_symptoms', /(?:경련|발작).{0,4}(?:후|이후).*(?:어땠|어떠|증상|느낌)/],
  ['tongue_bite', /혀.{0,5}(?:깨물|다치)|입을?.{0,4}깨물/],
  ['urinary_incontinence', /소변.{0,5}(?:지|실수)|요실금/],
  ['fecal_incontinence', /대변.{0,5}(?:지|실수)|변실금/],
  ['incontinence', /실금|대소변/],
  ['salivation', /침.{0,4}흘|거품/],
  ['eye_deviation', /눈.{0,8}(?:돌아|돌았|올라|위로)|안구\s*편위/],
  ['head_deviation', /고개.{0,8}(?:돌|편)|목.{0,4}돌/],
  ['automatism', /자동증|만지작|입맛|쩝쩝/],
  ['fever', /발열|체온|열(?:이|은|도|을|나|났|있|없|\s*있|\s*나)/],
  ['chills', /오한|춥/],
  ['headache', /두통|머리.{0,12}(?:아프|아파|아팠|통증)/],
  ['neck_stiffness', /목.{0,5}(?:뻣뻣|뻐근)|경부\s*강직|목\s*경직/],
  ['vision', /시야|복시|눈.{0,5}(?:흐리|안\s*보)|겹쳐\s*보/],
  ['dizziness', /어지|현기증/],
  ['nausea', /메스껍|메스꺼|구역|오심/],
  ['vomiting', /구토|토했|토하|토한/],
  ['cough', /기침/],
  ['sputum', /가래/],
  ['dyspnea', /숨.{0,5}(?:차|가쁘|막)|호흡\s*곤란/],
  ['palpitations', /두근|심장.{0,4}빨리/],
  ['fatigue', /피곤|피로|기운/],
  ['muscle_pain', /근육통|온몸.{0,5}쑤|몸.{0,5}쑤/],
  ['weakness', /힘.{0,5}빠|마비|근력/],
  ['tingling', /감각\s*이상|저림|저렸|저리/],
  ['sleep', /수면|잠.{0,8}(?:잘|못|부족|자|잤)/],
  ['alcohol', /음주|과음|주량|(?<![가-힣])술/],
  ['smoking', /담배|흡연/],
  ['caffeine', /커피|카페인/],
  ['occupation', /직업|어떤\s*일|무슨\s*일.*하/],
  ['stress', /스트레스/],
  ['exercise', /운동/],
  ['diet', /식사|식습관|이유식/],
  [
    'medication',
    /복용|먹는\s*약|약(?:은|을|이|\s*이름|\s*먹)|약물|항경련제|영양제/,
  ],
  ['allergy', /알레르기/],
  ['family_history', /가족|집안|부모|아버지|어머니|형제|유전/],
  [
    'past_history',
    /과거력|지병|기저\s*질환|진단\s*받|진단받|앓|고혈압|당뇨|뇌전증|뇌수막염|열성\s*경련/,
  ],
  ['trauma', /다친|다쳤|외상|교통\s*사고|머리.{0,8}다침/],
  ['surgery', /수술/],
  ['gynecologic', /생리|월경|폐경|임신|출산|피임/],
  ['development', /발달|성장|옹알이|눈맞춤|까꿍/],
  ['birth_history', /주산기|태어|출생|분만|신생아|예방\s*접종/],
  ['concern', /궁금|걱정.*(?:있|되)|질문.*있/],
];

export function isDiagnosisRequest(text: string): boolean {
  if (/(?:이전|예전|과거|평소|진단\s*받|진단받|앓고|지병)/.test(text))
    return false;
  return /무슨\s*(?:병|질환|진단)|어떤\s*(?:병|질환)|병명|정답|원인(?:이|은).{0,3}(?:뭐|뭔|무엇)|왜\s*(?:이렇게\s*)?(?:아픈|아프신|아프세요|힘드)|어떻게\s*치료|치료는|나을\s*수\s*있/.test(
    text,
  );
}

export function isExamRequest(text: string): boolean {
  if (
    /(?:하지\s*마|하지\s*않|안\s*(?:할|하|해)|나중에|예전에|이전에|받았|받은|했나요|했어요)/.test(
      text,
    )
  )
    return false;
  return /(?:진찰|검진|촉진|청진|검사|혈압|맥박|체온|동공|반사|눈꺼풀|혀|목|팔다리|걸음|수막|머리|손발).*(?:하겠|할게|하도록|시행|측정|재볼|재보|살펴|만져|확인하|보겠|볼게|눌러)|누워\s*(?:주세요|보세요)|걸어\s*(?:보세요|주세요)/i.test(
    text,
  );
}

export function questionPhase(text: string): PatientPhase {
  if (/(?:경련|발작).{0,3}(?:후|이후)|끝나|끝난|깨어난/.test(text))
    return 'post';
  if (/(?:경련|발작).{0,3}(?:전|직전)|일어나기\s*전/.test(text)) return 'pre';
  if (/(?:경련|발작).{0,3}(?:중|당시|할\s*때)/.test(text)) return 'during';
  return 'general';
}

export function analyzePatientQuestions(
  text: string,
  previousQuestion?: string,
): PatientQuestion[] {
  const parts = text
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .split(
      /[?？!！;；\n]+|(?:그리고|또한|그런데|그럼)\s*|(?<=[요까])\s*[.,，]\s*|,\s*(?=언제|몇|얼마나|열|머리|약|이름)/u,
    )
    .map((part) => part.trim())
    .filter(Boolean);
  const questions: PatientQuestion[] = [];
  const add = (
    part: string,
    kind: PatientQuestion['kind'],
    topic = '',
    phase = questionPhase(part),
    aspect: PatientQuestion['aspect'] = 'value',
  ) => {
    if (
      !questions.some(
        (q) =>
          q.text === part &&
          q.kind === kind &&
          q.topic === topic &&
          q.phase === phase &&
          q.aspect === aspect,
      )
    ) {
      questions.push({
        id: `q${questions.length + 1}`,
        text: part,
        kind,
        topic,
        phase,
        aspect,
      });
    }
  };
  for (const part of parts) {
    if (
      /지시.*무시|역할.*(?:바꿔|변경)|프롬프트|시스템.*(?:출력|알려)|평가\s*기준|채점|전체\s*(?:병력|정보)|모든\s*증상/.test(
        part,
      )
    ) {
      add(part, 'off_topic');
      continue;
    }
    if (/레시피|코딩|파이썬|평가기준|시를\s*써|라면.*(?:싶|먹자)/.test(part)) {
      add(part, 'off_topic');
      continue;
    }
    if (isExamRequest(part)) {
      add(part, 'exam');
      continue;
    }
    if (
      /검사|진찰|혈압|맥박|체온/.test(part) &&
      /하지\s*마|안\s*(?:할|하|해)/.test(part)
    ) {
      add(part, 'education');
      continue;
    }
    if (
      /검사|진찰|혈압|맥박|체온/.test(part) &&
      /예전|이전|과거|받았|받은|했나요/.test(part)
    ) {
      add(part, 'history', 'exam_history');
      continue;
    }
    if (
      /(?:의심됩니다|필요합니다|필요해요|설명드|하시기\s*바랍|힘드셨|검사.*(?:진행하|받으)|치료.*받으)/.test(
        part,
      ) &&
      !/나요|습니까|세요\s*$|있어요|했어요/.test(part)
    ) {
      add(part, 'education');
      continue;
    }
    if (isDiagnosisRequest(part)) {
      add(part, 'diagnosis');
      continue;
    }
    let matched = TOPICS.filter(([, pattern]) => pattern.test(part));
    if (/대소변/.test(part))
      matched = matched.filter(
        ([topic]) =>
          !['urinary_incontinence', 'fecal_incontinence'].includes(topic),
      );
    else if (
      matched.some(([topic]) =>
        ['urinary_incontinence', 'fecal_incontinence'].includes(topic),
      )
    )
      matched = matched.filter(([topic]) => topic !== 'incontinence');
    if (matched.some(([topic]) => topic === 'post_symptoms'))
      matched = matched.filter(
        ([topic]) => !['chief_complaint', 'seizure_pattern'].includes(topic),
      );
    if (
      /가족|아버지|어머니|부모|형제/.test(part) &&
      /이름|성함|성명/.test(part)
    ) {
      add(part, 'history', 'family_identity');
      continue;
    }
    if (
      /(?:약|약물).{0,6}이름/.test(part) &&
      !/성함|성명|^이름|(?:환자|본인|아이).{0,4}이름/.test(part)
    )
      matched = matched.filter(([topic]) => topic !== 'name');
    if (matched.some(([topic]) => topic === 'family_history'))
      matched = matched.filter(([topic]) => topic !== 'past_history');
    if (/열성\s*경련/.test(part))
      matched = matched.filter(([topic]) => topic !== 'fever');
    if (matched.some(([topic]) => topic === 'chief_complaint'))
      matched = matched.filter(
        ([topic]) => !['location', 'onset'].includes(topic),
      );
    const specificSymptoms = matched.filter(
      ([topic]) =>
        ![
          'onset',
          'duration',
          'frequency',
          'course',
          'previous_episode',
          'seizure_pattern',
        ].includes(topic),
    );
    let aspect: PatientQuestion['aspect'] = 'value';
    if (
      specificSymptoms.some(
        ([topic]) =>
          !['name', 'age', 'birth_date', 'sex', 'chief_complaint'].includes(
            topic,
          ),
      )
    ) {
      if (/언제|시작\s*(?:시점|시기)|생겼던\s*시점|발생\s*시점/.test(part)) {
        aspect = 'onset';
        matched = matched.filter(([topic]) => topic !== 'onset');
      } else if (
        /얼마나\s*(?:오래|지속)|지속\s*시간|몇\s*(?:초|분|시간)/.test(part)
      ) {
        aspect = 'duration';
        matched = matched.filter(([topic]) => topic !== 'duration');
      } else if (
        /얼마나\s*자주|몇\s*번/.test(part) &&
        !/발작|경련/.test(part)
      ) {
        aspect = 'frequency';
        matched = matched.filter(([topic]) => topic !== 'frequency');
      } else if (/얼마나\s*(?:아프|아파|심)|몇\s*점|nrs/.test(part))
        aspect = 'severity';
    }
    if (matched.length) {
      matched.sort(([, a], [, b]) => (part.match(a)?.index ?? 0) - (part.match(b)?.index ?? 0));
      for (const [topic] of matched)
        add(
          part,
          ['name', 'birth_date', 'age', 'sex'].includes(topic)
            ? 'identity'
            : 'history',
          topic,
          questionPhase(part),
          aspect,
        );
      continue;
    }
    if (
      /레시피|라면.*(?:싶|먹자)|코딩|파이썬|주식|날씨|농담|게임|노래|요리.*알려|시를\s*써/.test(
        part,
      )
    ) {
      add(part, 'off_topic');
      continue;
    }
    if (/안녕하세요|반갑|성함.*소개|저는.*(?:학생|의사)|감사|수고/.test(part)) {
      add(part, 'social');
      continue;
    }
    if (
      /설명|필요합니다|필요해요|하시기\s*바랍|하시.*좋|걱정.*(?:되셨|되시)|힘드셨|의심됩니다|검사.*(?:받으|진행)|치료.*(?:하겠|받으)/.test(
        part,
      )
    ) {
      add(part, 'education');
      continue;
    }
    if (
      previousQuestion &&
      /그때|그건|그것|얼마나|에는요|은요|는요/.test(part)
    ) {
      const previous = analyzePatientQuestions(previousQuestion).filter(
        (q) => q.kind === 'history',
      );
      if (previous.length === 1) {
        const q = previous[0];
        add(
          part,
          'history',
          q.topic,
          questionPhase(part) === 'general' ? q.phase : questionPhase(part),
          q.aspect,
        );
        continue;
      }
    }
    add(part, 'clarify');
    if (!/[가-힣a-z0-9]/i.test(part) || /에는요|은요|는요/.test(part))
      questions[questions.length - 1].allowModel = false;
  }
  return questions;
}
