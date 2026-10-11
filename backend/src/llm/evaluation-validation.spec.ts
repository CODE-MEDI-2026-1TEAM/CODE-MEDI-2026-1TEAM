import { LlmService, evaluationFailureCode } from './llm.service';
import { ConfigService } from '@nestjs/config';
describe('Evaluation integrity', () => {
  it('reports bounded failure categories without exposing provider response content', () => {
    expect(evaluationFailureCode(new Error('Evaluation evidence is not a student quote')))
      .toBe('evaluation_evidence_not_original');
    expect(evaluationFailureCode(new SyntaxError('invalid json'))).toBe('evaluation_json_invalid');
    expect(evaluationFailureCode(new Error('secret clinical/provider content')))
      .toBe('evaluation_provider_unavailable');
  });
  it('rejects missing performance states instead of inventing non-performance', () => {
    const service = new LlmService({
      get: () => undefined,
    } as unknown as ConfigService);
    expect(() =>
      (service as any).normalizeMissedItemStatus([], ['열 문진']),
    ).toThrow('Incomplete');
  });
  const service = new LlmService({
    get: () => undefined,
  } as unknown as ConfigService);
  const valid = {
    score: 80,
    strengths: [],
    missedItems: [],
    suggestions: [],
    riskAssessment: 'test',
    caseInstructionStatus: [],
    patientEducationStatus: [],
  };
  it('rejects missing or invalid scores rather than saving zero', () => {
    for (const score of [undefined, NaN, -1, 101, 1.5, '80'])
      expect(() =>
        (service as any).normalizeEvaluation({ ...valid, score }),
      ).toThrow();
  });
  it('rejects missing required criteria rather than marking the student unmet', () => {
    expect(() =>
      (service as any).normalizeEvaluation(valid, {
        caseChecklist: { instructionItems: [{ item: 'required' }] },
        casePatientEducation: { items: [] },
      }),
    ).toThrow('Incomplete');
  });
  it('rejects invalid item status values', () => {
    expect(() =>
      (service as any).normalizeEvaluation({
        ...valid,
        caseInstructionStatus: [{ item: 'test', status: 'unknown' }],
      }),
    ).toThrow('status');
  });
  it('rejects invented evidence and patient answers used as student performance', () => {
    const result = {
      ...valid,
      caseInstructionStatus: [
        {
          item: 'history',
          status: 'met',
          evidence: ['열이 있나요?'],
          feedback: '',
        },
      ],
    };
    expect(() =>
      (service as any).validateEvaluationEvidence(result, [
        { role: 'assistant', content: '열이 있나요?' },
      ]),
    ).toThrow('quote');
    expect(() =>
      (service as any).validateEvaluationEvidence(result, [
        { role: 'user', content: '안녕하세요.' },
      ]),
    ).toThrow('quote');
    expect(() =>
      (service as any).validateEvaluationEvidence(result, [
        { role: 'user', content: '열이 있나요?' },
      ]),
    ).not.toThrow();
  });
  it('rejects fulfilled criteria without source evidence or unmet criteria with evidence', () => {
    for (const item of [
      { status: 'met', evidence: [] },
      { status: 'unmet', evidence: ['열이 있나요?'] },
    ])
      expect(() =>
        (service as any).validateEvaluationEvidence(
          { ...valid, caseInstructionStatus: [item] },
          [{ role: 'user', content: '열이 있나요?' }],
        ),
      ).toThrow();
  });
});
