type Record = { requestId: string; userMessageId?: string; response: unknown; processing: any };
export function unresolvedProcessingRequests(records: Record[]): string[] {
  // Accept resolutions only from a later, verified v2.4 receipt. Never clear old
  // records or accept a repair marker supplied by a student's text.
  return records.filter((record, index) => {
    const issues = record.processing?.issues ?? [];
    const failed = record.response === null || record.processing?.status === 'failed' ||
      issues.some((issue: any) => issue.stage === 'understanding' ||
        (issue.stage === 'generation' && issue.code !== 'speech_act_corrected'));
    if (!failed) return false;
    const targets = record.processing?.failedRepairIds;
    if (!Array.isArray(targets) || !targets.length || record.response === null) return true;
    const proven = new Set(records.slice(index + 1).flatMap((later) => {
      const processing = later.processing;
      if (!later.response || !['patient-pipeline-v2.4', 'patient-pipeline-v2.5'].includes(processing?.pipelineVersion)) return [];
      return (Array.isArray(processing.repairResolutions) ? processing.repairResolutions : [])
        .filter((item: any) => item.requestId === record.requestId && typeof item.id === 'string' &&
          Array.isArray(item.frameIds) && item.frameIds.length && item.frameIds.every((id: string) =>
            processing.verifiedFrameIds?.includes(id)))
        .map((item: any) => item.id);
    }));
    return !targets.every((id: string) => proven.has(id));
  }).map((record) => record.requestId);
}
