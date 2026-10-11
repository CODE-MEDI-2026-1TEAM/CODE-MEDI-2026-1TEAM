// Narrow speech-act boundary, independent of disease concepts and patient values.
// Requests such as "이름을 말씀해 주세요" and corrective questions are not matched.
export function isClinicianActionStatement(text: string): boolean {
  return /(?:하겠습니다|하려고\s*합니다|설명드리겠습니다|의심합니다|생각합니다|권합니다|필요합니다|하셔야\s*합니다)[.!。]?\s*$/.test(text.trim());
}
