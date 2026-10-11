import { recentDialogue, repairReason, dialogueMemoryForTurn } from './dialogue-repair';
import { initialDialogueState } from './turn-understanding.service';
describe('Student initiated dialogue repair', () => {
  it('bounds stored dialogue and rejects malformed stored exchanges', () => {
    const state = initialDialogueState('case', null);
    state.recentTurns = [null, { turn: 0, question: 'old', reply: 'old', processingStatus: 'completed' },
      { turn: 1, question: 'q'.repeat(2000), reply: 'a'.repeat(2000), processingStatus: 'degraded' },
      { turn: 2, question: 'current', reply: 'current', processingStatus: 'completed' }] as any;
    const recent = recentDialogue(state);
    expect(recent.map((turn) => turn.turn)).toEqual([1, 2]);
    expect(recent[0].question).toHaveLength(900);
    expect(recent[0].reply).toHaveLength(500);
  });
  it('does not treat every subsequent explicit question as a correction after a processing error', () => {
    const state = initialDialogueState('case', null);
    state.recentTurns = [{ turn: 1, question: '언제였나요?', reply: '다시 말씀해 주세요.', processingStatus: 'degraded' }];
    expect(repairReason('직업이 무엇인가요?', state)).toBeNull();
    expect(repairReason('언제였나요 ?', state)).toBe('repeated_question');
    expect(repairReason('아까 질문을 다시 확인할게요.', state)).toBe('student_correction');
  });
  it('does not carry another case version into the new dialogue', () => {
    const state = initialDialogueState('old', null);
    state.recentTurns = [{ turn: 1, question: 'q', reply: 'a', processingStatus: 'completed' }];
    expect(recentDialogue(initialDialogueState('new', state))).toEqual([]);
  });
  it('limits ordinary context while retaining older references for conversation confirmation', () => {
    const state = initialDialogueState('case', null);
    state.memory = Array.from({ length: 12 }, (_, index) => ({ id: `d${index}`, turn: index + 1,
      question: `질문${index}`, reply: '모르겠어요.', status: 'not_provided', factIds: [] }));
    expect(dialogueMemoryForTurn('평소 약을 드시나요?', state).map((item) => item.id)).toEqual(['d10', 'd11']);
    expect(dialogueMemoryForTurn('앞서 모른다고 한 것은 회복 여부인가요?', state)).toHaveLength(12);
  });
});
