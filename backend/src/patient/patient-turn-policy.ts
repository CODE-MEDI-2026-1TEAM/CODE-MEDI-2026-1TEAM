import type { TurnFrame } from './evidence-contract';

export const PATIENT_RESPONSE_POLICY = 'first_question_short_reply';
export const PATIENT_REPLY_STYLE = '질문받은 정보만 쉬운 일상어로 간결하게 답한다. 서론·반복·불필요한 설명은 덧붙이지 않는다. 짧게 말하되 의미에 필요한 부정·시점·수치·관찰 출처는 유지한다.';

// Greetings, explanations and later questions must not produce a list of replies.
// A deferred question is deliberate conversational pacing, never a model failure.
export function firstResponseFrames(frames: TurnFrame[]) {
  const ordered = [...frames].sort((a, b) => (a.originalSpan?.start ?? 0) - (b.originalSpan?.start ?? 0));
  const question = ordered.find(f =>
    ['ask_history', 'confirm_dialogue', 'clarify', 'ask_diagnosis'].includes(f.speechAct));
  const active = question ?? ordered.find(f => f.speechAct !== 'social') ?? ordered[0];
  return {
    active: active ? [active] : [],
    deferred: ordered.filter(f => f !== active),
  };
}
