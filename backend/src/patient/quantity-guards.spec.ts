import { quantityViolation, quantities } from './quantity-guards';
import type { EvidenceFact } from './evidence-contract';
const facts = (...values: string[]) => values.map((value) => ({ value, reply: value,
  subjectId: 'patient', conceptId: 'frequency', aspect: 'value', timeScope: 'episode', unit: null })) as EvidenceFact[];
describe('Source-grounded quantity and scope checks', () => {
  it('rejects a false comparison even when all numeric tokens exist in the source', () => {
    expect(quantityViolation('어제도 평소와 횟수가 비슷했나요?',
      '평소에는 하루에 1~2번이에요. 어제도 평소와 비슷하게 5번 있었어요.', facts('매일 1-2회', '어제 5회')))
      .toBe('response_comparison_invalid');
  });
  it('allows a correct comparison using count unit synonyms', () => {
    expect(quantityViolation('어제가 평소보다 많았나요?',
      '평소에는 1~2번이고 어제는 5번으로 더 많았어요.', facts('매일 1-2회', '어제 5회'))).toBeNull();
  });
  it('does not conclude a contradiction from overlapping ranges', () => {
    expect(quantityViolation('어제도 평소와 비슷했나요?',
      '평소에는 1~5번이고 어제는 3번으로 비슷했어요.', facts('매일 1-5회', '어제 3회'))).toBeNull();
  });
  it('rejects an unrequested episode value from a multi-scope source fact', () => {
    expect(quantityViolation('평소 몇 초인가요?', '평소 1~5초고 어제는 1분이었어요.',
      facts('1-5초 / 어제는 1분'))).toBe('response_unrequested_time');
  });
  it('accepts equivalent time units but rejects a changed dimension', () => {
    expect(quantityViolation('얼마나 지속됐나요?', '60초였어요.', facts('1분'))).toBeNull();
    expect(quantityViolation('몇 번인가요?', '1번이에요.', facts('1분'))).toBe('response_quantity_invalid');
  });
  it('rejects unsupported narrowing of a range', () => {
    expect(quantityViolation('몇 초인가요?', '3초예요.', facts('1-5초'))).toBe('response_quantity_invalid');
  });
  it('supports length and weight conversions without a clinical lookup', () => {
    expect(quantities('1kg 10mm')).toEqual([{ min: 1000, max: 1000, dimension: 'weight' }, { min: 1, max: 1, dimension: 'length' }]);
  });
});
