import legacy from '../../data/cases/seizure-21m.json';
import { analyzePatientQuestions } from './patient-question';
import {
  isReviewedLegacyAnswer,
  projectLegacyFacts,
} from './legacy-patient-facts';

const rows = legacy.facts.map((f, i) => ({ ...f, id: `legacy-${i}` }));
describe('Reviewed legacy fact projection', () => {
  it('projects duration without disclosing frequency', () => {
    const result = projectLegacyFacts(
      analyzePatientQuestions('경련이 얼마나 오래 지속됐나요?')[0],
      rows,
    );
    expect(result).toHaveLength(1);
    expect(result[0].reply).toContain('수십 초');
    expect(result[0].reply).toContain('10분');
    expect(result[0].reply).not.toContain('한 번');
  });
  it('returns all separate facts for multiple questions', () => {
    const results = analyzePatientQuestions(
      '열이 있나요? 머리 아파요? 약 먹어요?',
    ).map((q) => projectLegacyFacts(q, rows));
    expect(results.map((facts) => facts[0].value)).toEqual([
      false,
      false,
      false,
    ]);
    expect(results[0][0].reply).not.toMatch(/두통|머리|목/);
  });
  it('does not infer salivation from a negative tongue bite or incontinence', () => {
    expect(
      projectLegacyFacts(analyzePatientQuestions('침을 흘렸나요?')[0], rows),
    ).toEqual([]);
  });
  it('requires explicit review again after the source prose changes', () => {
    expect(rows.every((r) => isReviewedLegacyAnswer(r.answer))).toBe(true);
    expect(
      isReviewedLegacyAnswer('열이나 두통, 목이 뻣뻣한 증상은 있었어요.'),
    ).toBe(false);
  });
});
