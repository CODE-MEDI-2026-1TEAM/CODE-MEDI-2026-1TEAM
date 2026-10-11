import type { DialogueExchange, DialogueState, DialogueMemory, PendingRepair } from './evidence-contract';

export function dialogueMemory(state: DialogueState): DialogueMemory[] {
  return (Array.isArray(state.memory) ? state.memory : []).filter((item) => item &&
    typeof item.id === 'string' && Number.isInteger(item.turn) && typeof item.question === 'string' &&
    typeof item.reply === 'string' && ['known', 'not_provided'].includes(item.status) &&
    Array.isArray(item.factIds) && item.factIds.every((id) => typeof id === 'string'))
    .slice(-12).map((item) => ({ ...item, question: item.question.slice(0, 900), reply: item.reply.slice(0, 220), factIds: item.factIds.slice(0, 6) }));
}
export function dialogueMemoryForTurn(content: string, state: DialogueState): DialogueMemory[] {
  const memory = dialogueMemory(state);
  // Keep the nearest references available even for unfamiliar wording. Expand
  // dialogue context for reference/correction language, never for a clinical label.
  const referencesDialogue = /아까|앞서|이전|방금|모른|모르|말씀|답변|대답|그건|그것|그거|그때|그\s*부분|걱정했던/.test(content);
  return referencesDialogue || repairReason(content, state) ? memory : memory.slice(-2);
}
export function pendingRepairs(state: DialogueState): PendingRepair[] {
  return (Array.isArray(state.pendingRepairs) ? state.pendingRepairs : []).filter((item) => item &&
    typeof item.id === 'string' && Number.isInteger(item.turn) && typeof item.question === 'string' &&
    (item.requestId === undefined || typeof item.requestId === 'string'))
    .slice(-24).map((item) => ({ ...item, question: item.question.slice(0, 900) }));
}

export function recentDialogue(state: DialogueState): DialogueExchange[] {
  if (!Array.isArray(state.recentTurns)) return [];
  return state.recentTurns.filter((turn) => turn && Number.isInteger(turn.turn) &&
    typeof turn.question === 'string' && typeof turn.reply === 'string' &&
    ['completed', 'degraded'].includes(turn.processingStatus))
    .slice(-2).map((turn) => ({
      turn: turn.turn,
      question: turn.question.slice(0, 900),
      reply: turn.reply.slice(0, 500),
      processingStatus: turn.processingStatus,
    }));
}

export function repairReason(content: string, state: DialogueState): string | null {
  const recent = recentDialogue(state);
  if (!recent.length) return null;
  const normal = (text: string) => text.replace(/[\s?？!！.,]/g, '').toLowerCase();
  if (recent.some((turn) => normal(turn.question) === normal(content)))
    return 'repeated_question';
  // Dialogue repair markers only: these do not select a clinical concept or answer.
  if (/방금|아까|앞서|이전.*(?:답|말)|잘못|틀렸|정정|다시\s*(?:묻|질문|말씀|말해|확인)|아니[요, ]|그게\s*아니|질문.*(?:답|대답)|말씀.*(?:달|다르)/.test(content))
    return 'student_correction';
  return null;
}
