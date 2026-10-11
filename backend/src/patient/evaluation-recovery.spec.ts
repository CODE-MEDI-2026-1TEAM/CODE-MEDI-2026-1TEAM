import { unresolvedProcessingRequests } from './evaluation-recovery';
const failed = { requestId: 'a', response: {}, processing: { status: 'degraded',
  failedRepairIds: ['p1_f1', 'p1_f2'], issues: [{ stage: 'understanding' }] } };
const repaired = (ids: string[]) => ({ requestId: 'b', response: {}, processing: {
  pipelineVersion: 'patient-pipeline-v2.4', verifiedFrameIds: ['f1'],
  repairResolutions: ids.map((id) => ({ id, requestId: 'a', frameIds: ['f1'] })), issues: [] } });
describe('Evaluation recovery provenance', () => {
  it('allows only a complete, later verified repair of all failed parts', () => {
    expect(unresolvedProcessingRequests([failed, repaired(['p1_f1'])])).toEqual(['a']);
    expect(unresolvedProcessingRequests([failed, repaired(['p1_f1', 'p1_f2'])])).toEqual([]);
  });
  it('accepts a verified v2.5 repair while keeping v2.4 receipt compatibility', () => {
    const current = repaired(['p1_f1', 'p1_f2']);
    current.processing.pipelineVersion = 'patient-pipeline-v2.5';
    expect(unresolvedProcessingRequests([failed, current])).toEqual([]);
  });
  it('rejects a repair preceding the failed request', () => {
    expect(unresolvedProcessingRequests([repaired(['p1_f1', 'p1_f2']), failed])).toEqual(['a']);
  });
  it('keeps legacy failures without repair identities unresolved', () => {
    expect(unresolvedProcessingRequests([{ ...failed, processing: { issues: [{ stage: 'understanding' }] } }, repaired(['p1_f1', 'p1_f2'])])).toEqual(['a']);
  });
  it('does not accept unverified frame IDs or a null response', () => {
    const record = repaired(['p1_f1', 'p1_f2']); record.processing.verifiedFrameIds = [];
    expect(unresolvedProcessingRequests([failed, record])).toEqual(['a']);
    expect(unresolvedProcessingRequests([{ ...failed, response: null }, repaired(['p1_f1', 'p1_f2'])])).toEqual(['a']);
  });
  it('blocks unresolved semantic failures but allows harmless speech-act correction', () => {
    expect(unresolvedProcessingRequests([{ requestId: 'semantic', response: {}, processing: { issues: [{ stage: 'generation', code: 'response_semantic_invalid' }] } }])).toEqual(['semantic']);
    expect(unresolvedProcessingRequests([{ requestId: 'routing', response: {}, processing: { issues: [{ stage: 'generation', code: 'speech_act_corrected' }] } }])).toEqual([]);
  });
});
