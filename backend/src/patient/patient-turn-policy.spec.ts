import { firstResponseFrames } from './patient-turn-policy';
import type { TurnFrame } from './evidence-contract';

const frame = (frameId: string, speechAct: TurnFrame['speechAct'], start: number) => ({
  frameId, speechAct, text: frameId, originalSpan: { start, end: start + 2 },
} as TurnFrame);

describe('One short patient answer per turn', () => {
  it('chooses the first question in original order and suppresses greetings and later questions', () => {
    const greeting = frame('greeting', 'social', 0);
    const first = frame('first', 'ask_history', 10);
    const later = frame('later', 'ask_history', 25);
    expect(firstResponseFrames([later, greeting, first])).toEqual({ active: [first], deferred: [greeting, later] });
  });
  it('does not skip an unclear first question to disclose a later answer', () => {
    const first = frame('first', 'clarify', 0);
    const later = frame('later', 'ask_history', 25);
    expect(firstResponseFrames([first, later]).active).toEqual([first]);
  });
  it('uses one response for explanation-only turns', () => {
    const first = frame('first', 'explain_plan', 0);
    expect(firstResponseFrames([first, frame('later', 'educate', 25)]).active).toEqual([first]);
  });
});
