export type PhysicalExamCriteriaStatus = 'abnormal' | 'normal' | 'unclear';

export type PhysicalExamCriteriaItem = {
  examKey: string;
  expectedPosition: 'sitting' | 'supine';
  label: string;
  result: string;
  status: PhysicalExamCriteriaStatus;
};

export type PhysicalExamCaseCriteria = {
  items: PhysicalExamCriteriaItem[];
  physicalExamPerformed: boolean;
};

export const PHYSICAL_EXAM_CRITERIA_BY_CASE: Record<
  string,
  PhysicalExamCaseCriteria
> = {
  seizure_case_01: {
    physicalExamPerformed: true,
    items: [
      { examKey: 'vital_signs', label: '활력징후 확인', expectedPosition: 'sitting', status: 'normal', result: 'V/S 정상' },
      { examKey: 'conjunctiva_exam', label: '결막 확인', expectedPosition: 'sitting', status: 'normal', result: '결막 정상' },
      { examKey: 'sclera_exam', label: '공막 확인', expectedPosition: 'sitting', status: 'normal', result: '공막 정상' },
      { examKey: 'thyroid_exam', label: '갑상샘 촉진', expectedPosition: 'sitting', status: 'normal', result: '갑상샘 정상' },
      { examKey: 'cervical_lymph_node', label: '경부 림프절 촉진', expectedPosition: 'sitting', status: 'normal', result: '림프절 정상' },
      { examKey: 'dehydration_exam', label: '입술 탈수 소견 확인', expectedPosition: 'sitting', status: 'normal', result: '입술긴장도 감소 없음' },
      { examKey: 'skin_turgor_exam', label: '피부긴장도 확인', expectedPosition: 'sitting', status: 'normal', result: '피부긴장도 감소 없음' },
      { examKey: 'pupil_light_reflex', label: '동공반사', expectedPosition: 'sitting', status: 'normal', result: '동공반사 정상' },
      { examKey: 'extraocular_movement', label: '안구운동 검사', expectedPosition: 'sitting', status: 'normal', result: '안구운동 정상' },
      { examKey: 'visual_field', label: '시야검사', expectedPosition: 'sitting', status: 'normal', result: '시야검사 정상' },
      { examKey: 'cranial_nerve_exam', label: '뇌신경검사', expectedPosition: 'sitting', status: 'normal', result: '뇌신경검사 정상' },
      { examKey: 'cerebellar_exam', label: '소뇌기능검사', expectedPosition: 'sitting', status: 'normal', result: '소뇌기능검사 정상' },
      { examKey: 'kernig_sign', label: 'Kernig sign', expectedPosition: 'supine', status: 'normal', result: 'Kernig sign 없음' },
      { examKey: 'skin_turgor_exam', label: '사지 피부긴장도 확인', expectedPosition: 'sitting', status: 'normal', result: '사지 피부긴장도 감소 없음' },
      { examKey: 'pitting_edema_exam', label: '오목부종 확인', expectedPosition: 'sitting', status: 'normal', result: '오목부종 없음' },
      { examKey: 'sensory_exam', label: '팔다리 감각 확인', expectedPosition: 'sitting', status: 'normal', result: '팔다리 감각이상 없음' },
      { examKey: 'motor_exam', label: '팔다리 운동 확인', expectedPosition: 'sitting', status: 'normal', result: '운동이상 없음' },
      { examKey: 'dtr_exam', label: '심부건반사', expectedPosition: 'sitting', status: 'normal', result: 'DTR 이상 없음' },
    ],
  },
  seizure_case_02: {
    physicalExamPerformed: false,
    items: [
      { examKey: 'growth_chart_review', label: '성장곡선 자료 확인', expectedPosition: 'sitting', status: 'normal', result: '키/체중/머리둘레 성장곡선 제시; 키·체중 정상, 머리둘레 50백분위' },
      { examKey: 'vital_signs', label: '입장 직후 처치', expectedPosition: 'sitting', status: 'normal', result: '입장 직후 V/S 체크 및 수액 연결 후 면담 시작' },
    ],
  },
  seizure_case_03: {
    physicalExamPerformed: true,
    items: [
      { examKey: 'vital_signs', label: '활력징후 확인', expectedPosition: 'sitting', status: 'unclear', result: 'V/S 확인; 자료상 서맥으로 표기됨' },
      { examKey: 'conjunctiva_exam', label: '결막 확인', expectedPosition: 'sitting', status: 'normal', result: '결막 정상' },
      { examKey: 'visual_field', label: '시야검사', expectedPosition: 'sitting', status: 'normal', result: '시야검사 이상 없음' },
      { examKey: 'dehydration_exam', label: '탈수 소견 확인', expectedPosition: 'sitting', status: 'normal', result: '탈수증상 없음' },
      { examKey: 'head_trauma_inspection', label: '두부외상 시진/촉진', expectedPosition: 'sitting', status: 'normal', result: '두부외상 없음' },
      { examKey: 'cranial_nerve_exam', label: '뇌신경검사', expectedPosition: 'sitting', status: 'normal', result: '뇌신경검사 이상 없음' },
      { examKey: 'cerebellar_exam', label: '소뇌기능검사', expectedPosition: 'sitting', status: 'normal', result: '소뇌기능검사 이상 없음' },
      { examKey: 'head_trauma_inspection', label: '외상흔적 확인', expectedPosition: 'sitting', status: 'normal', result: '외상흔적 없음' },
      { examKey: 'meningeal_sign', label: '수막자극징후', expectedPosition: 'supine', status: 'normal', result: '수막자극징후 없음' },
      { examKey: 'motor_exam', label: '사지근력검사', expectedPosition: 'sitting', status: 'normal', result: '사지근력 이상 없음' },
      { examKey: 'sensory_exam', label: '사지감각검사', expectedPosition: 'sitting', status: 'normal', result: '감각이상 없음' },
      { examKey: 'dtr_exam', label: '심부건반사', expectedPosition: 'sitting', status: 'normal', result: '반사이상 없음' },
    ],
  },
  seizure_case_04: {
    physicalExamPerformed: true,
    items: [
      { examKey: 'vital_signs', label: '활력징후 확인', expectedPosition: 'sitting', status: 'normal', result: 'V/S stable' },
      { examKey: 'head_trauma_inspection', label: '두부외상 시진', expectedPosition: 'sitting', status: 'normal', result: '두부외상 시진상 이상 없음' },
      { examKey: 'head_trauma_palpation', label: '두부외상 촉진', expectedPosition: 'sitting', status: 'normal', result: '두부외상 촉진상 이상 없음' },
      { examKey: 'eye_exam', label: '눈 진찰', expectedPosition: 'sitting', status: 'normal', result: '눈 이상 없음' },
      { examKey: 'oral_tongue_exam', label: '구강 진찰', expectedPosition: 'sitting', status: 'normal', result: '구강 이상 없음' },
      { examKey: 'pupil_light_reflex', label: '동공반사', expectedPosition: 'sitting', status: 'normal', result: '동공반사 이상 없음' },
      { examKey: 'extraocular_movement', label: '안구운동 검사', expectedPosition: 'sitting', status: 'normal', result: '안구운동 이상 없음' },
      { examKey: 'facial_sensation', label: '얼굴감각 검사', expectedPosition: 'sitting', status: 'normal', result: '얼굴감각 이상 없음' },
      { examKey: 'facial_motor', label: '얼굴운동 검사', expectedPosition: 'sitting', status: 'normal', result: '얼굴운동 이상 없음' },
      { examKey: 'finger_to_nose', label: 'Finger-to-nose', expectedPosition: 'sitting', status: 'normal', result: 'Finger-to-nose 이상 없음' },
      { examKey: 'rapid_alternating', label: 'Rapid alternating movement', expectedPosition: 'sitting', status: 'normal', result: 'Rapid alternating movement 이상 없음' },
      { examKey: 'tandem_gait', label: 'Tandem gait', expectedPosition: 'sitting', status: 'normal', result: 'Tandem gait 이상 없음' },
      { examKey: 'kernig_sign', label: 'Kernig sign', expectedPosition: 'supine', status: 'normal', result: 'Kernig sign 없음' },
      { examKey: 'neck_stiffness', label: '경부강직', expectedPosition: 'supine', status: 'normal', result: '경부강직 없음' },
      { examKey: 'sensory_exam', label: '팔다리 감각검사', expectedPosition: 'sitting', status: 'normal', result: '팔다리 감각이상 없음' },
      { examKey: 'motor_exam', label: '팔다리 근력검사', expectedPosition: 'sitting', status: 'normal', result: '근력이상 없음' },
      { examKey: 'dtr_exam', label: '심부건반사', expectedPosition: 'sitting', status: 'normal', result: 'DTR 이상 없음' },
    ],
  },
  seizure_case_05: {
    physicalExamPerformed: true,
    items: [
      { examKey: 'vital_signs', label: '혈압 확인', expectedPosition: 'sitting', status: 'abnormal', result: '고혈압 있음' },
      { examKey: 'vital_signs', label: '호흡수 확인', expectedPosition: 'sitting', status: 'abnormal', result: '호흡수 증가 있음' },
      { examKey: 'vital_signs', label: '체온 확인', expectedPosition: 'sitting', status: 'abnormal', result: '발열 있음' },
      { examKey: 'facial_motor', label: '얼굴근력 검사', expectedPosition: 'sitting', status: 'normal', result: '얼굴근력 정상' },
      { examKey: 'facial_sensation', label: '얼굴감각 검사', expectedPosition: 'sitting', status: 'normal', result: '얼굴감각 정상' },
      { examKey: 'facial_reflex', label: '얼굴반사 검사', expectedPosition: 'sitting', status: 'normal', result: '얼굴반사 정상' },
      { examKey: 'meningeal_sign', label: '수막자극징후', expectedPosition: 'supine', status: 'abnormal', result: '수막자극징후 있음' },
      { examKey: 'motor_exam', label: '팔다리 근력검사', expectedPosition: 'sitting', status: 'normal', result: '팔다리근력 정상' },
      { examKey: 'sensory_exam', label: '팔다리 감각검사', expectedPosition: 'sitting', status: 'normal', result: '팔다리감각 정상' },
      { examKey: 'dtr_exam', label: '팔다리 반사검사', expectedPosition: 'sitting', status: 'normal', result: '팔다리반사 정상' },
    ],
  },
  seizure_case_06: {
    physicalExamPerformed: true,
    items: [
      { examKey: 'vital_signs', label: '활력징후 확인', expectedPosition: 'sitting', status: 'normal', result: 'V/S 정상' },
      { examKey: 'dehydration_exam', label: '입 탈수 소견 확인', expectedPosition: 'sitting', status: 'normal', result: '입 탈수 소견 없음' },
      { examKey: 'skin_turgor_exam', label: '피부 탈수 소견 확인', expectedPosition: 'sitting', status: 'normal', result: '피부 탈수 소견 없음' },
      { examKey: 'thyroid_exam', label: '갑상샘 촉진', expectedPosition: 'sitting', status: 'normal', result: '갑상샘 이상 없음' },
      { examKey: 'skin_turgor_exam', label: '피부긴장도 확인', expectedPosition: 'sitting', status: 'normal', result: '피부긴장도 정상' },
      { examKey: 'pitting_edema_exam', label: '오목부종 확인', expectedPosition: 'sitting', status: 'normal', result: '오목부종 정상' },
      { examKey: 'visual_field', label: '시야검사', expectedPosition: 'sitting', status: 'normal', result: '시야장애 없음' },
      { examKey: 'cranial_nerve_exam', label: '얼굴 감각/운동 검사', expectedPosition: 'sitting', status: 'normal', result: '얼굴감각운동 이상 없음' },
      { examKey: 'extremity_neuro_exam', label: '팔다리 감각/운동 검사', expectedPosition: 'sitting', status: 'normal', result: '팔다리감각운동 이상 없음' },
      { examKey: 'dtr_exam', label: '심부건반사', expectedPosition: 'sitting', status: 'normal', result: 'DTR 이상 없음' },
    ],
  },
  seizure_case_07: {
    physicalExamPerformed: true,
    items: [
      { examKey: 'head_trauma_inspection', label: '두부 외상 흔적 확인', expectedPosition: 'sitting', status: 'normal', result: '두부 외상 흔적은 관찰되지 않습니다.' },
      { examKey: 'extraocular_movement', label: '안구운동검사', expectedPosition: 'sitting', status: 'normal', result: '안구운동검사 정상' },
      { examKey: 'pupil_light_reflex', label: '동공반사', expectedPosition: 'sitting', status: 'normal', result: 'Light reflex 정상' },
      { examKey: 'facial_sensation', label: '안면감각검사', expectedPosition: 'sitting', status: 'normal', result: '안면감각검사 정상' },
      { examKey: 'facial_motor', label: '안면운동검사', expectedPosition: 'sitting', status: 'normal', result: '안면운동검사 정상' },
      { examKey: 'sensory_exam', label: '사지감각검사', expectedPosition: 'sitting', status: 'normal', result: '사지감각검사 정상' },
      { examKey: 'motor_exam', label: '사지근력검사', expectedPosition: 'sitting', status: 'normal', result: '사지근력검사 정상' },
      { examKey: 'dtr_exam', label: '심부건반사', expectedPosition: 'sitting', status: 'normal', result: 'DTR 정상' },
      { examKey: 'gait_exam', label: '보행검사', expectedPosition: 'sitting', status: 'normal', result: '보행검사 정상' },
      { examKey: 'meningeal_sign', label: '뇌막 자극 징후 확인', expectedPosition: 'supine', status: 'normal', result: '뇌막 자극 징후는 관찰되지 않습니다.' },
    ],
  },
  seizure_case_08: {
    physicalExamPerformed: false,
    items: [],
  },
};

export function getPhysicalExamCriteriaForCase(
  caseSlug: string | null | undefined,
): PhysicalExamCaseCriteria {
  return (
    (caseSlug ? PHYSICAL_EXAM_CRITERIA_BY_CASE[caseSlug] : undefined) ?? {
      physicalExamPerformed: true,
      items: [],
    }
  );
}

export function getPhysicalExamCriteriaItemsForEventKey(
  caseSlug: string | null | undefined,
  eventKey: string,
) {
  const criteria = getPhysicalExamCriteriaForCase(caseSlug);
  return criteria.items.filter((item) =>
    physicalExamKeysEquivalent(item.examKey, eventKey),
  );
}

export function physicalExamKeysEquivalent(expectedKey: string, eventKey: string) {
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

export function normalizePhysicalExamStatus(
  status: PhysicalExamCriteriaStatus,
) {
  if (status === 'abnormal') return 'abnormal';
  if (status === 'unclear') return 'unclear';
  return 'normal';
}
