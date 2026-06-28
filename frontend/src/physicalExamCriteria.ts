import type { PatientPosition, PhysicalExamEvent } from './types';

export type PhysicalExamCriteriaItem = {
  examKey: string;
  expectedPosition: PatientPosition;
  label: string;
};

const PHYSICAL_EXAM_CRITERIA_BY_CASE: Record<
  string,
  { items: PhysicalExamCriteriaItem[]; physicalExamPerformed: boolean }
> = {
  seizure_case_01: {
    physicalExamPerformed: true,
    items: [
      ['vital_signs', '활력징후 확인', 'sitting'],
      ['conjunctiva_exam', '결막 확인', 'sitting'],
      ['sclera_exam', '공막 확인', 'sitting'],
      ['thyroid_exam', '갑상샘 촉진', 'sitting'],
      ['cervical_lymph_node', '경부 림프절 촉진', 'sitting'],
      ['dehydration_exam', '입술 탈수 소견 확인', 'sitting'],
      ['skin_turgor_exam', '피부긴장도 확인', 'sitting'],
      ['pupil_light_reflex', '동공반사', 'sitting'],
      ['extraocular_movement', '안구운동 검사', 'sitting'],
      ['visual_field', '시야검사', 'sitting'],
      ['cranial_nerve_exam', '뇌신경검사', 'sitting'],
      ['cerebellar_exam', '소뇌기능검사', 'sitting'],
      ['kernig_sign', 'Kernig sign', 'supine'],
      ['skin_turgor_exam', '사지 피부긴장도 확인', 'sitting'],
      ['pitting_edema_exam', '오목부종 확인', 'sitting'],
      ['sensory_exam', '팔다리 감각 확인', 'sitting'],
      ['motor_exam', '팔다리 운동 확인', 'sitting'],
      ['dtr_exam', '심부건반사', 'sitting'],
    ].map(toCriteriaItem),
  },
  seizure_case_02: {
    physicalExamPerformed: false,
    items: [
      ['growth_chart_review', '성장곡선 자료 확인', 'sitting'],
      ['vital_signs', '입장 직후 처치', 'sitting'],
    ].map(toCriteriaItem),
  },
  seizure_case_03: {
    physicalExamPerformed: true,
    items: [
      ['vital_signs', '활력징후 확인', 'sitting'],
      ['conjunctiva_exam', '결막 확인', 'sitting'],
      ['visual_field', '시야검사', 'sitting'],
      ['dehydration_exam', '탈수 소견 확인', 'sitting'],
      ['head_trauma_inspection', '두부외상 시진/촉진', 'sitting'],
      ['cranial_nerve_exam', '뇌신경검사', 'sitting'],
      ['cerebellar_exam', '소뇌기능검사', 'sitting'],
      ['head_trauma_inspection', '외상흔적 확인', 'sitting'],
      ['meningeal_sign', '수막자극징후', 'supine'],
      ['motor_exam', '사지근력검사', 'sitting'],
      ['sensory_exam', '사지감각검사', 'sitting'],
      ['dtr_exam', '심부건반사', 'sitting'],
    ].map(toCriteriaItem),
  },
  seizure_case_04: {
    physicalExamPerformed: true,
    items: [
      ['vital_signs', '활력징후 확인', 'sitting'],
      ['head_trauma_inspection', '두부외상 시진', 'sitting'],
      ['head_trauma_palpation', '두부외상 촉진', 'sitting'],
      ['eye_exam', '눈 진찰', 'sitting'],
      ['oral_tongue_exam', '구강 진찰', 'sitting'],
      ['pupil_light_reflex', '동공반사', 'sitting'],
      ['extraocular_movement', '안구운동 검사', 'sitting'],
      ['facial_sensation', '얼굴감각 검사', 'sitting'],
      ['facial_motor', '얼굴운동 검사', 'sitting'],
      ['finger_to_nose', 'Finger-to-nose', 'sitting'],
      ['rapid_alternating', 'Rapid alternating movement', 'sitting'],
      ['tandem_gait', 'Tandem gait', 'sitting'],
      ['kernig_sign', 'Kernig sign', 'supine'],
      ['neck_stiffness', '경부강직', 'supine'],
      ['sensory_exam', '팔다리 감각검사', 'sitting'],
      ['motor_exam', '팔다리 근력검사', 'sitting'],
      ['dtr_exam', '심부건반사', 'sitting'],
    ].map(toCriteriaItem),
  },
  seizure_case_05: {
    physicalExamPerformed: true,
    items: [
      ['vital_signs', '혈압 확인', 'sitting'],
      ['vital_signs', '호흡수 확인', 'sitting'],
      ['vital_signs', '체온 확인', 'sitting'],
      ['facial_motor', '얼굴근력 검사', 'sitting'],
      ['facial_sensation', '얼굴감각 검사', 'sitting'],
      ['facial_reflex', '얼굴반사 검사', 'sitting'],
      ['meningeal_sign', '수막자극징후', 'supine'],
      ['kernig_sign', 'Kernig sign', 'supine'],
      ['brudzinski_sign', 'Brudzinski sign', 'supine'],
      ['neck_stiffness', '경부강직', 'supine'],
      ['motor_exam', '팔다리 근력검사', 'sitting'],
      ['sensory_exam', '팔다리 감각검사', 'sitting'],
      ['dtr_exam', '팔다리 반사검사', 'sitting'],
    ].map(toCriteriaItem),
  },
  seizure_case_06: {
    physicalExamPerformed: true,
    items: [
      ['vital_signs', '활력징후 확인', 'sitting'],
      ['dehydration_exam', '입 탈수 소견 확인', 'sitting'],
      ['skin_turgor_exam', '피부 탈수 소견 확인', 'sitting'],
      ['thyroid_exam', '갑상샘 촉진', 'sitting'],
      ['skin_turgor_exam', '피부긴장도 확인', 'sitting'],
      ['pitting_edema_exam', '오목부종 확인', 'sitting'],
      ['visual_field', '시야검사', 'sitting'],
      ['cranial_nerve_exam', '얼굴 감각/운동 검사', 'sitting'],
      ['extremity_neuro_exam', '팔다리 감각/운동 검사', 'sitting'],
      ['dtr_exam', '심부건반사', 'sitting'],
    ].map(toCriteriaItem),
  },
  seizure_case_07: {
    physicalExamPerformed: true,
    items: [
      ['head_trauma_inspection', '두부 외상 흔적 확인', 'sitting'],
      ['extraocular_movement', '안구운동검사', 'sitting'],
      ['pupil_light_reflex', '동공반사', 'sitting'],
      ['facial_sensation', '안면감각검사', 'sitting'],
      ['facial_motor', '안면운동검사', 'sitting'],
      ['sensory_exam', '사지감각검사', 'sitting'],
      ['motor_exam', '사지근력검사', 'sitting'],
      ['dtr_exam', '심부건반사', 'sitting'],
      ['gait_exam', '보행검사', 'sitting'],
      ['meningeal_sign', '뇌막 자극 징후 확인', 'supine'],
    ].map(toCriteriaItem),
  },
  seizure_case_08: {
    physicalExamPerformed: false,
    items: [],
  },
};

function toCriteriaItem([
  examKey,
  label,
  expectedPosition,
]: readonly string[]): PhysicalExamCriteriaItem {
  return {
    examKey,
    expectedPosition: expectedPosition === 'supine' ? 'supine' : 'sitting',
    label,
  };
}

export function getPhysicalExamCriteriaForCase(caseSlug?: string | null) {
  return (
    (caseSlug ? PHYSICAL_EXAM_CRITERIA_BY_CASE[caseSlug] : undefined) ?? {
      physicalExamPerformed: true,
      items: [],
    }
  );
}

export function physicalExamFindingForCriteriaItem(
  findings: PhysicalExamEvent[],
  item: PhysicalExamCriteriaItem,
) {
  return findings.find((finding) =>
    physicalExamKeysEquivalent(item.examKey, finding.examKey),
  );
}

export type PhysicalExamMedia = {
  alt: string;
  finding: string;
  guide: string;
  imageSrc: string;
  subtitle: string;
  title: string;
};

const SONG_CHANG_HEE_MENINGEAL_MEDIA: Record<string, PhysicalExamMedia> = {
  brudzinski_sign: {
    alt: 'Brudzinski sign 양성 반응을 보이는 환자 그림',
    finding:
      '목을 굽힐 때 환자가 의도하지 않았는데도 양쪽 고관절과 무릎이 반사적으로 굽혀지면 양성입니다.',
    guide:
      '이번에는 목을 천천히 앞으로 숙여보겠습니다. 몸에 힘을 빼고 계시고, 목이나 허리가 아프면 바로 말씀해주세요.',
    imageSrc: '/exam-media/meningeal/brudzinski-sign.png',
    subtitle: '수막자극징후 검사',
    title: 'Brudzinski sign 양성',
  },
  kernig_sign: {
    alt: 'Kernig sign 양성 반응을 보이는 환자 그림',
    finding:
      '무릎을 펴려고 할 때 허리/목/햄스트링 부위 통증, 저항, 무릎 신전 제한이 있으면 양성입니다.',
    guide:
      '한쪽 다리를 들어서 무릎을 굽혔다가 펴보겠습니다. 허리나 목, 다리 뒤쪽에 통증이 있으면 말씀해주세요.',
    imageSrc: '/exam-media/meningeal/kernig-sign.png',
    subtitle: '수막자극징후 검사',
    title: 'Kernig sign 양성',
  },
  neck_stiffness: {
    alt: '경부강직 양성 반응을 보이는 환자 그림',
    finding:
      '목을 앞으로 굽히기 어렵거나 심한 저항감, 통증, 목 굴곡 제한이 있으면 경부강직 양성입니다.',
    guide:
      '목이 뻣뻣한지 확인하겠습니다. 힘을 빼고 계세요. 제가 머리를 받치고 천천히 앞으로 숙여보겠습니다.',
    imageSrc: '/exam-media/meningeal/neck-stiffness.png',
    subtitle: '수막자극징후 검사',
    title: '경부강직 양성',
  },
};

export function physicalExamMediaForEvent(
  caseSlug: string | null | undefined,
  event: PhysicalExamEvent,
) {
  if (caseSlug !== 'seizure_case_05' || event.status !== 'abnormal') {
    return null;
  }

  return SONG_CHANG_HEE_MENINGEAL_MEDIA[event.examKey] ?? null;
}

function physicalExamKeysEquivalent(expectedKey: string, eventKey: string) {
  if (expectedKey === eventKey) return true;

  const aliases: Record<string, string[]> = {
    brudzinski_sign: ['meningeal_sign'],
    cerebellar_exam: ['finger_to_nose', 'gait_exam', 'rapid_alternating', 'tandem_gait'],
    cranial_nerve_exam: [
      'extraocular_movement',
      'facial_motor',
      'facial_reflex',
      'facial_sensation',
      'pupil_light_reflex',
      'visual_field',
    ],
    extremity_neuro_exam: ['dtr_exam', 'motor_exam', 'sensory_exam'],
    head_trauma_inspection: ['head_inspection_palpation'],
    head_trauma_palpation: ['head_inspection_palpation'],
    kernig_sign: ['meningeal_sign'],
    neck_stiffness: ['meningeal_sign'],
  };

  return aliases[expectedKey]?.includes(eventKey) ?? false;
}
