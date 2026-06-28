export const SIMULATION_TOPIC_TO_EVALUATION_MODULE: Record<string, string> = {
  seizure: 'cpx-34-seizure',
};

export function evaluationModuleForSimulationTopic(
  topicId: string | null | undefined,
): string | null {
  if (!topicId) return null;
  return SIMULATION_TOPIC_TO_EVALUATION_MODULE[topicId] ?? null;
}
