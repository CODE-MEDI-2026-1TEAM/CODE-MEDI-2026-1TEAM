import { isClinicianActionStatement } from './clinician-statement';
describe('Clinician action declarations', () => {
  it.each(['눈에 빛을 비춰 동공 반응을 확인하겠습니다.', '검사를 진행하려고 합니다.',
    '추가 검사가 필요합니다.'])('does not turn %s into a history request', (text) => {
    expect(isClinicianActionStatement(text)).toBe(true);
  });
  it.each(['평소 몇 초였는지 구분해 말씀해 주세요.', '확인하겠습니다. 그런데 언제 시작했나요?',
    '아까는 다르게 말씀하셔서 헷갈립니다.', '아이 이름은 무엇인가요?'])('leaves %s available for semantic interpretation', (text) => {
    expect(isClinicianActionStatement(text)).toBe(false);
  });
});
