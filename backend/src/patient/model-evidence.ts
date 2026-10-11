import type { EvidenceFact, TurnFrame } from './evidence-contract';
export function compactFact(f: EvidenceFact, id: string) {
  return {
    id,
    concept: f.conceptId,
    label: f.label,
    value: f.value,
    unit: f.unit,
    polarity: f.polarity,
    subject: f.subjectId,
    event: f.eventId,
    time: f.timeScope,
    phase: f.phase,
    aspect: f.aspect,
    source: f.informationSource,
  };
}
export function compactFrame(f: TurnFrame) {
  return {
    frameId: f.frameId,
    text: f.text,
    act: f.speechAct,
    concept: f.conceptId,
    aspect: f.aspect,
    subject: f.subjectId,
    event: f.eventId,
    time: f.timeScope,
    phase: f.phase,
  };
}
