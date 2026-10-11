import type { EvidenceFact } from './evidence-contract';

type Quantity = { min: number; max: number; dimension: string };
function scoped(text: string, scope: 'usual' | 'episode'): Quantity[] {
  const markers = [...text.matchAll(/평소(?!와|보다)|보통|매일|어제|이번|오늘|최근/g)];
  return markers.flatMap((marker, index) => {
    const kind = /평소|보통|매일/.test(marker[0]) ? 'usual' : 'episode';
    return kind === scope ? quantities(text.slice(marker.index! + marker[0].length,
      markers[index + 1]?.index ?? text.length)) : [];
  });
}
// Units and comparison language, independent of disease and source values.
const units: Record<string, [string, number]> = {
  초: ['time', 1], 분: ['time', 60], 시간: ['time', 3600],
  번: ['count', 1], 회: ['count', 1], 세: ['age', 12], 개월: ['age', 1],
  kg: ['weight', 1000], g: ['weight', 1], cm: ['length', 1], mm: ['length', .1],
};
export function quantities(text: string): Quantity[] {
  return [...text.matchAll(/(\d+(?:\.\d+)?)\s*(?:[~～\-]\s*(\d+(?:\.\d+)?))?\s*(시간|개월|초|분|번|회|세|kg|cm|mm|g)(?![a-z])/gi)]
    .map((match) => {
      const [dimension, scale] = units[match[3].toLowerCase()];
      return { min: Number(match[1]) * scale, max: Number(match[2] ?? match[1]) * scale, dimension };
    });
}
export function quantityViolation(question: string, reply: string, facts: EvidenceFact[]): string | null {
  const source = facts.flatMap((fact) => quantities(`${fact.value}${fact.unit ?? ''} ${fact.reply}`));
  const stated = quantities(reply);
  if (stated.some((value) => !source.some((item) => item.dimension === value.dimension &&
    item.min === value.min && item.max === value.max))) return 'response_quantity_invalid';
  if (/평소|보통/.test(question) && !/어제|이번|최근|오늘|가장\s*길|평소.*(?:비교|구분)/.test(question) &&
    /어제|이번에는|오늘은/.test(reply)) return 'response_unrequested_time';
  const usual = facts.filter((fact) => fact.timeScope === 'usual');
  const episode = facts.filter((fact) => fact.timeScope !== 'usual');
  const pairs = usual.flatMap((left) => episode.filter((right) =>
    left.subjectId === right.subjectId && left.conceptId === right.conceptId && left.aspect === right.aspect)
    .flatMap((right) => quantities(`${left.value}${left.unit ?? ''}`).flatMap((a) =>
      quantities(`${right.value}${right.unit ?? ''}`).filter((b) => a.dimension === b.dimension).map((b) => ({ a, b })))));
  // Also check explicitly scoped values in the reply itself; source metadata
  // may store several time periods inside one unchanged source value.
  if (/비교|구분|비슷|평소보다|평소.*어제|어제.*평소/.test(question))
    pairs.push(...scoped(reply, 'usual').flatMap((a) => scoped(reply, 'episode')
      .filter((b) => a.dimension === b.dimension).map((b) => ({ a, b }))));
  // Only prove contradictions for explicitly scoped, disjoint quantities. Ambiguous
  // or overlapping ranges remain the independent verifier's responsibility.
  if (/어제|이번|오늘|최근/.test(reply) && /평소/.test(reply)) {
    if (/비슷|같은\s*(?:횟수|시간)|차이.*없/.test(reply) && pairs.some(({ a, b }) =>
      a.max < b.min || b.max < a.min)) return 'response_comparison_invalid';
    const more = /(?:어제|이번|오늘|최근)[^.!?]*(?:더\s*(?:많|자주|길)|평소보다\s*(?:많|자주|길))/.test(reply);
    const less = /(?:어제|이번|오늘|최근)[^.!?]*(?:더\s*(?:적|짧)|평소보다\s*(?:적|짧))/.test(reply);
    if ((more && pairs.some(({ a, b }) => b.max < a.min)) ||
        (less && pairs.some(({ a, b }) => b.min > a.max))) return 'response_comparison_invalid';
  }
  return null;
}
