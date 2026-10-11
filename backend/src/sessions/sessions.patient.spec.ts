import { ConfigService } from '@nestjs/config';
import { SessionsService } from './sessions.service';
import { PatientResponseService } from '../llm/patient-response.service';
import dataset from '../rag/simulationRAG/data/seizure_cases.json';
import { PatientPipelineService } from '../patient/patient-pipeline.service';
import { TurnUnderstandingService } from '../patient/turn-understanding.service';
import { PatientModelService } from '../patient/patient-model.service';
import { PatientEvidenceService } from '../patient/patient-evidence.service';
import { GroundedResponseService } from '../patient/grounded-response.service';

function harness(useV2 = false) {
  const item = dataset.증례목록[0];
  const messages: Array<Record<string, any>> = [];
  const exams: Array<Record<string, any>> = [];
  const receipts = new Map<string, any>();
  let sequence = 0;
  let queue = Promise.resolve();
  const session = {
    id: 'session',
    caseId: 'case',
    status: 'active',
    case: {
      slug: 'seizure_case_01',
      simulationCaseId: 'seizure_case_01',
      chiefComplaint: '몸이 떨렸어요',
      patientPrompt: JSON.stringify(item.문진및신체진찰정보),
      patientProfile: {
        name: '김동하',
        witnessPresent: true,
        witnessRelation: '동료',
      },
    },
  };
  const db: any = {
    session: {
      findUnique: jest.fn(async () => session),
      update: jest.fn(async ({ data }) => Object.assign(session, data)),
    },
    message: {
      create: jest.fn(async ({ data }) => {
        const message = {
          ...data,
          id: `m${++sequence}`,
          createdAt: new Date(),
        };
        messages.push(message);
        return message;
      }),
      findMany: jest.fn(async ({ where }) =>
        messages
          .filter((m) => m.id !== where.id?.not)
          .slice(-10)
          .reverse(),
      ),
      count: jest.fn(
        async () => messages.filter((m) => m.role === 'user').length,
      ),
    },
    physicalExamEvent: {
      findMany: jest.fn(async () => exams),
      create: jest.fn(async ({ data }) => {
        const exam = { ...data, id: `e${++sequence}` };
        exams.push(exam);
        return exam;
      }),
    },
    handHygieneEvent: { findMany: jest.fn(async () => []) },
    evaluation: { create: jest.fn(async ({ data }) => ({ id: 'evaluation', ...data })) },
    sessionMessageRequest: {
      findUnique: jest.fn(
        async ({ where }) =>
          receipts.get(where.sessionId_requestId.requestId) ?? null,
      ),
      create: jest.fn(async ({ data }) => {
        const row = { ...data, response: null };
        receipts.set(data.requestId, row);
        return row;
      }),
      update: jest.fn(async ({ where, data }) =>
        Object.assign(receipts.get(where.sessionId_requestId.requestId), data),
      ),
      findMany: jest.fn(async () => [...receipts.values()]),
      updateMany: jest.fn(async ({ where, data }) => {
        const row = receipts.get(where.requestId);
        if (row && row.response === null) Object.assign(row, data);
        return { count: row ? 1 : 0 };
      }),
    },
    $transaction: jest.fn(async (work) => work(db)),
    withSessionLock: jest.fn((_id, work) => {
      const result = queue.then(work);
      queue = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    }),
  };
  const flags = new Map<string, string>();
  const config = {
    get: (key: string) => flags.get(key),
  } as unknown as ConfigService;
  const patient = new PatientResponseService(config);
  const retriever = { retrieve: jest.fn() };
  const model = new PatientModelService(config);
  const pipeline = new PatientPipelineService(
    new TurnUnderstandingService(model),
    new PatientEvidenceService(
      { ready: jest.fn(), vectors: jest.fn() } as any,
      { getCacheKey: () => 'test', embedBatch: jest.fn() } as any,
      model,
      config,
    ),
    new GroundedResponseService(model, config),
  );
  const grader = { evaluateConversation: jest.fn(async () => ({ score: 70, strengths: [],
    missedItems: [], missedItemStatus: [], riskAssessment: '', suggestions: [],
    caseInstructionStatus: [], patientEducationStatus: [] })) };
  const criteria = { buildCriteriaPack: jest.fn(() => null) };
  const service = new SessionsService(
    db,
    {} as any,
    grader as any,
    patient,
    retriever as any,
    criteria as any,
    {} as any,
    config,
    useV2 ? pipeline : undefined,
  );
  return {
    service,
    db,
    messages,
    exams,
    patient,
    retriever,
    session,
    flags,
    receipts,
    pipeline,
    grader,
  };
}

describe('Patient turn integration', () => {
  it('answers interview questions alongside a physical exam and preserves the original input', async () => {
    const h = harness();
    const content = '혈압을 측정하겠습니다? 열이 있나요?';
    const response: any = await h.service.createMessage('session', {
      content,
      requestId: 'req',
    });
    expect(response.message.content).toContain('열은 없었어요');
    expect(response.message.content).not.toContain('120');
    expect(h.exams.map((e) => e.examKey)).toEqual(['vital_signs']);
    expect(h.messages[0].content).toBe(content);
    expect(h.retriever.retrieve).not.toHaveBeenCalled();
  });
  it('does not record historical or negated examinations', async () => {
    const h = harness();
    await h.service.createMessage('session', {
      content: '목 검사는 하지 마세요? 이전에 혈압을 재봤나요?',
    });
    expect(h.exams).toEqual([]);
  });
  it('returns the same response for duplicate requests without duplicate messages or examinations', async () => {
    const h = harness();
    const input = {
      content: '혈압을 측정하겠습니다? 열이 있나요?',
      requestId: 'same',
    };
    const [first, second]: any[] = await Promise.all([
      h.service.createMessage('session', input),
      h.service.createMessage('session', input),
    ]);
    expect(first.message.id).toBe(second.message.id);
    expect(h.messages).toHaveLength(2);
    expect(h.exams).toHaveLength(1);
  });
  it('reuses the saved student message after generation fails', async () => {
    const h = harness();
    const generate = jest.spyOn(h.patient, 'generateReply');
    generate.mockRejectedValueOnce(new Error('transport failure'));
    const input = { content: '열이 있나요?', requestId: 'retry' };
    await expect(h.service.createMessage('session', input)).rejects.toThrow(
      'transport failure',
    );
    await h.service.createMessage('session', input);
    expect(h.messages.filter((m) => m.role === 'user')).toHaveLength(1);
    expect(h.messages.filter((m) => m.role === 'assistant')).toHaveLength(1);
    expect(h.db.message.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { sessionId: 'session', id: { not: 'm1' } },
      }),
    );
  });
  it('rejects reuse of an ID with a different question or position', async () => {
    const h = harness();
    await h.service.createMessage('session', {
      content: '열이 있나요?',
      requestId: 'same',
    });
    await expect(
      h.service.createMessage('session', {
        content: '머리 아파요?',
        requestId: 'same',
      }),
    ).rejects.toThrow('변경');
    await expect(
      h.service.createMessage('session', {
        content: '열이 있나요?',
        requestId: 'same',
        patientPosition: 'supine',
      }),
    ).rejects.toThrow('변경');
    expect(h.messages).toHaveLength(2);
  });
  it('keeps concurrent distinct questions in paired message order', async () => {
    const h = harness();
    await Promise.all([
      h.service.createMessage('session', {
        content: '열이 있나요?',
        requestId: 'a',
      }),
      h.service.createMessage('session', {
        content: '머리 아파요?',
        requestId: 'b',
      }),
    ]);
    expect(h.messages.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
    expect(h.messages[3].content).toContain('머리는 아프지 않았어요');
  });
  it('rejects empty input without saving a message', async () => {
    const h = harness();
    await expect(
      h.service.createMessage('session', { content: '   ' }),
    ).rejects.toThrow('질문');
    expect(h.messages).toHaveLength(0);
  });
});

describe('Evidence pipeline session integration', () => {
  it('records unavailable caregiver examinations as attempts, including natural pupil wording', async () => {
    const h = harness(true);
    h.session.case.slug = 'seizure_case_08';
    h.session.case.patientPrompt = JSON.stringify(dataset.증례목록[7].문진및신체진찰정보);
    h.session.case.patientProfile = { ...h.session.case.patientProfile, isGuardianCase: true } as any;
    await h.service.createMessage('session', { content: '눈에 빛을 비춰 동공 반응을 확인하겠습니다. 양쪽 팔과 다리의 힘을 확인하겠습니다.', requestId: 'unavailable' });
    expect(h.exams.map((event) => event.examKey)).toEqual(expect.arrayContaining(['pupil_light_reflex', 'motor_exam']));
    expect(h.exams.every((event) => event.execution === 'attempted' && event.resultAvailability === 'not_provided')).toBe(true);
    expect(h.exams.some((event) => event.result.includes('정상'))).toBe(false);
  });
  it('persists dialogue state and processing evidence atomically with duplicate protection', async () => {
    const h = harness(true);
    const input = { content: '열이 있나요? 머리가 아팠나요?', requestId: 'v2' };
    const first: any = await h.service.createMessage('session', input);
    const second = await h.service.createMessage('session', input);
    expect(JSON.parse(JSON.stringify(first))).toEqual(second);
    expect(h.messages).toHaveLength(2);
    expect(h.db.session.update).toHaveBeenCalledTimes(1);
    expect(h.receipts.get('v2').processing).toMatchObject({
      pipelineVersion: 'patient-pipeline-v2.5',
      understanding: 'offline_catalogue',
    });
    expect(first.processing.mode).toBe('offline');
    expect(h.receipts.get('v2').processing.verifiedFrameIds).toHaveLength(1);
    expect(h.receipts.get('v2').processing.pendingRepairCount).toBe(0);
    expect(h.receipts.get('v2').processing.deferredQuestions).toEqual(['머리가 아팠나요']);
  });
  it('records specific eye examinations and avoids limb findings for face examination', async () => {
    const h = harness(true);
    await h.service.createMessage('session', {
      content:
        '결막을 확인하겠습니다? 공막을 확인하겠습니다? 얼굴 근력과 감각, 반사를 검사하겠습니다?',
      requestId: 'exams',
    });
    expect(h.exams.map((e) => e.examKey)).toEqual(
      expect.arrayContaining(['conjunctiva_exam', 'sclera_exam']),
    );
    expect(
      h.exams.some((e) =>
        /extremity|motor_exam|sensory_exam|dtr_exam/.test(e.examKey),
      ),
    ).toBe(false);
    expect(h.exams.every((e) => e.execution === 'performed')).toBe(true);
  });
  it('does not record educational or planned actions as performed examinations', async () => {
    const h = harness(true);
    await h.service.createMessage('session', {
      content: '머리 CT 검사를 진행하겠습니다. 입에 물건을 넣지 마세요.',
      requestId: 'plan',
    });
    expect(h.exams).toHaveLength(0);
  });
  it('preserves the question and records technical failure without an invented patient response', async () => {
    const h = harness(true);
    jest
      .spyOn(h.pipeline, 'turn')
      .mockRejectedValueOnce(new Error('test failure'));
    await expect(
      h.service.createMessage('session', {
        content: '열이 있나요?',
        requestId: 'error',
      }),
    ).rejects.toThrow('test failure');
    expect(h.receipts.get('error').processing.status).toBe('failed');
    expect(h.messages.map((m) => m.role)).toEqual(['user']);
  });
  it('defers evaluation offline and does not create a fabricated score', async () => {
    const h = harness(true);
    await expect(h.service.evaluate('session')).rejects.toThrow('비활성화');
  });
  it('blocks grading when a technical failure remains unresolved', async () => {
    const h = harness(true);
    h.flags.set('PATIENT_AI_ENABLED', 'true');
    h.receipts.set('failed', {
      response: null,
      processing: { status: 'failed' },
    });
    await expect(h.service.evaluate('session')).rejects.toThrow('보류');
  });
  it('allows the evaluation endpoint only after every failed part has a later verified repair', async () => {
    const h = harness(true);
    h.flags.set('PATIENT_AI_ENABLED', 'true');
    h.receipts.set('failed', { requestId: 'failed', response: {}, processing: {
      status: 'degraded', failedRepairIds: ['p1_f1', 'p1_f2'],
      issues: [{ stage: 'generation', code: 'response_semantic_invalid' }],
    } });
    const repaired = { requestId: 'repaired', response: {}, processing: {
      pipelineVersion: 'patient-pipeline-v2.4', verifiedFrameIds: ['f1'], issues: [],
      repairResolutions: [{ id: 'p1_f1', requestId: 'failed', frameIds: ['f1'] }],
    } };
    h.receipts.set('repaired', repaired);
    await expect(h.service.evaluate('session')).rejects.toThrow('보류');
    expect(h.grader.evaluateConversation).not.toHaveBeenCalled();
    repaired.processing.repairResolutions.push({ id: 'p1_f2', requestId: 'failed', frameIds: ['f1'] });
    const result = await h.service.evaluate('session');
    expect(result.evaluation.id).toBe('evaluation');
    expect(h.grader.evaluateConversation).toHaveBeenCalledTimes(1);
    expect(h.session.status).toBe('completed');
  });
});
