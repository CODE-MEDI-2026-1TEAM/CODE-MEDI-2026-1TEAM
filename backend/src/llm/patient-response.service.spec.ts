import { ConfigService } from '@nestjs/config';
import { PatientResponseService } from './patient-response.service';
import { analyzePatientQuestions } from '../patient/patient-question';

function classifierHarness(content: object | null) {
  const create = jest.fn().mockResolvedValue({
    choices: [
      {
        finish_reason: 'stop',
        message: { content: content ? JSON.stringify(content) : null },
      },
    ],
    usage: { total_tokens: 20 },
  });
  const service = new PatientResponseService({
    get: (key: string) => key === 'PATIENT_AI_ENABLED' ? 'true' : 'configured-for-test',
  } as unknown as ConfigService);
  Object.defineProperty(service, 'client', {
    value: { chat: { completions: { create } } },
    writable: true,
  });
  return { service, create };
}
describe('Optional structured intent parsing', () => {
  it('does not call a model for clear questions', async () => {
    const { service, create } = classifierHarness(null);
    await service.resolveQuestions(
      analyzePatientQuestions('열 있나요? 머리 아파요?'),
    );
    expect(create).not.toHaveBeenCalled();
  });
  it('uses an enum schema and never sends case data or the current question twice', async () => {
    const { service, create } = classifierHarness({
      questions: [
        {
          inputId: 'q1',
          kind: 'history',
          topic: 'fever',
          phase: 'general',
          aspect: 'value',
        },
      ],
    });
    const output = await service.resolveQuestions(
      analyzePatientQuestions('발여리 있나여'),
    );
    expect(output[0].topic).toBe('fever');
    const input = create.mock.calls[0][0];
    expect(input.response_format.json_schema.strict).toBe(true);
    expect(JSON.stringify(input.messages).match(/발여리 있나여/g)).toHaveLength(
      1,
    );
    expect(JSON.stringify(input.messages)).not.toMatch(
      /김동하|hiddenDiagnosis|patientPrompt/,
    );
  });
  it('returns a retryable error on omitted or invalid intent output', async () => {
    const { service } = classifierHarness({ questions: [] });
    await expect(
      service.resolveQuestions(analyzePatientQuestions('불명확')),
    ).rejects.toThrow('질문 해석에 실패');
  });
  it('allows one ambiguous clause to contain multiple independent questions', async () => {
    const { service } = classifierHarness({
      questions: [
        {
          inputId: 'q1',
          kind: 'history',
          topic: 'fever',
          phase: 'general',
          aspect: 'value',
        },
        {
          inputId: 'q1',
          kind: 'history',
          topic: 'headache',
          phase: 'general',
          aspect: 'value',
        },
      ],
    });
    expect(
      (
        await service.resolveQuestions(
          analyzePatientQuestions('발여리랑 두투니'),
        )
      ).map((q) => q.topic),
    ).toEqual(['fever', 'headache']);
  });
});
