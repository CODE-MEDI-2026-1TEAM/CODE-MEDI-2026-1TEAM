import { EvaluationCriteriaService } from './evaluation-criteria.service';

describe('EvaluationCriteriaService', () => {
  it('maps the seizure MVP case to the seizure evaluation module', () => {
    const service = new EvaluationCriteriaService();

    const criteriaPack = service.buildCriteriaPack({
      slug: 'seizure-21m',
      title: '21세 남성 경련 환자',
      chiefComplaint: '경련',
      checklist: ['경련 발생 시점'],
      redFlags: ['경련 후 의식 회복 지연'],
    });

    expect(criteriaPack?.selectedModule.moduleId).toBe('cpx-34-seizure');
    expect(criteriaPack?.selectedModule.title).toBe('경련');
    expect(criteriaPack?.globalRubric.dimensions.length).toBeGreaterThan(0);
    expect(criteriaPack?.moduleRubric.historyTakingText).toContain(
      '언제부터 발작',
    );
  });

  it('falls back to chief complaint matching when a case slug is unknown', () => {
    const service = new EvaluationCriteriaService();

    const criteriaPack = service.buildCriteriaPack({
      slug: 'custom-case',
      title: '외래 경련 환자',
      chiefComplaint: '발작',
      checklist: [],
      redFlags: [],
    });

    expect(criteriaPack?.selectedModule.moduleId).toBe('cpx-34-seizure');
  });

  it('loads case-specific patient education criteria for simulation cases', () => {
    const service = new EvaluationCriteriaService();

    const criteriaPack = service.buildCriteriaPack({
      slug: 'seizure_case_03',
      simulationCaseId: 'seizure_case_03',
      simulationTopicId: 'seizure',
      title: '성인 경련 - 측두엽 뇌전증과 외상성 출혈 감별',
      chiefComplaint: '몸이 떨려요',
      checklist: ['경련 전후 상황 확인'],
      redFlags: ['두부 외상'],
    });

    expect(criteriaPack?.casePatientEducation.likelyDiagnoses).toEqual([
      '측두엽 뇌전증',
      '외상성 뇌출혈',
      '외상성 경막하혈종',
    ]);
    expect(criteriaPack?.casePatientEducation.requiredTests).toEqual([
      '뇌파검사',
      '뇌 CT/MRI',
      '혈액검사',
    ]);
    expect(
      criteriaPack?.casePatientEducation.requiredTreatmentEducation,
    ).toEqual(['약물 치료', '입원 권유', '스트레스 조절']);
    expect(criteriaPack?.casePatientEducation.items).toHaveLength(9);
  });
});
