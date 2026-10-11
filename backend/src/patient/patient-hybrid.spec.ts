import { ConfigService } from '@nestjs/config';
import data from '../rag/simulationRAG/data/seizure_cases.json';
import { PatientEvidenceService } from './patient-evidence.service';
import { normalizeEvidence } from './evidence-facts';
import {
  offlineFrames,
  initialDialogueState,
} from './turn-understanding.service';
import {
  GroundedResponseService,
  canonicalAnswer,
} from './grounded-response.service';
import { PatientModelService } from './patient-model.service';
import { PatientEvidenceRepository } from './patient-evidence.repository';

function setup() {
  const persona = { witnessPresent: true };
  const c = data.증례목록[0].문진및신체진찰정보;
  const corpus = normalizeEvidence(
    'case1',
    JSON.stringify(c),
    persona,
    c.기본정보.주소,
  );
  const frames = offlineFrames(
    '열이 났나요? 머리가 아팠나요?',
    initialDialogueState(corpus.caseVersion, null),
  );
  const config = {
    get: (key: string) => (key === 'PATIENT_AI_ENABLED' ? 'true' : undefined),
  } as unknown as ConfigService;
  const model = new PatientModelService(config);
  const embeddings = {
    getCacheKey: () => 'mock-vectors',
    embedBatch: jest.fn(async (rows: Array<{ id: string }>) =>
      rows.map((r) => ({ id: r.id, embedding: [1, 0] })),
    ),
  };
  const repository = {
    ready: jest.fn(async () => true),
    vectors: jest.fn(async (_c, _p, _v, ids: string[]) =>
      ids.map((id) => ({ id, score: 0.99 })),
    ),
    lexical: jest.fn(async (_c, _p, _t, ids: string[]) =>
      ids.map((id) => ({ id, score: 3 })),
    ),
  };
  const service = new PatientEvidenceService(
    repository as any,
    embeddings as any,
    model,
    config,
  );
  return {
    persona,
    corpus,
    frames,
    config,
    model,
    embeddings,
    repository,
    service,
  };
}
describe('Hybrid retrieval and grounded generation with mocked providers', () => {
  it('batches question embeddings and uses vector plus PostgreSQL lexical rankings', async () => {
    const h = setup();
    const r = await h.service.retrieve(h.corpus, h.frames, h.persona);
    expect(h.embeddings.embedBatch).toHaveBeenCalledTimes(1);
    expect(h.embeddings.embedBatch.mock.calls[0][0]).toHaveLength(2);
    expect(h.repository.vectors).toHaveBeenCalledTimes(2);
    expect(h.repository.lexical).toHaveBeenCalledTimes(2);
    expect(r.trace.source).toBe('hybrid_rrf');
    expect(r.answers.every((a) => a.status === 'known')).toBe(true);
  });
  it('coalesces simultaneous embedding misses and caches scoped result rankings', async () => {
    const h = setup();
    await Promise.all([
      h.service.retrieve(h.corpus, h.frames, h.persona),
      h.service.retrieve(h.corpus, h.frames, h.persona),
    ]);
    await h.service.retrieve(h.corpus, h.frames, h.persona);
    expect(h.embeddings.embedBatch).toHaveBeenCalledTimes(1);
    expect(h.repository.vectors).toHaveBeenCalledTimes(2);
  });
  it('invalidates retrieval across case versions while sharing identical query embeddings', async () => {
    const h = setup();
    await h.service.retrieve(h.corpus, h.frames, h.persona);
    const other = normalizeEvidence(
      'case2',
      JSON.stringify(data.증례목록[1].문진및신체진찰정보),
      { isGuardianCase: true, witnessPresent: true },
      '아이가 떨었어요',
    );
    const r = await h.service.retrieve(other, h.frames, {
      isGuardianCase: true,
      witnessPresent: true,
    });
    expect(
      h.repository.vectors.mock.calls.some(
        (call) => call[0].caseId === 'case2',
      ),
    ).toBe(true);
    expect(
      r.answers.flatMap((a) => a.facts).every((f) => f.caseId === 'case2'),
    ).toBe(true);
  });
  it('shares rankings when only frame numbering or its original text position changes', async () => {
    const h = setup();
    await h.service.retrieve(h.corpus, h.frames, h.persona);
    const moved = h.frames.map((frame, index) => ({ ...frame, frameId: `moved${index}`,
      originalSpan: { start: frame.originalSpan.start + 50, end: frame.originalSpan.end + 50 } }));
    const result = await h.service.retrieve(h.corpus, moved, h.persona);
    expect(h.repository.vectors).toHaveBeenCalledTimes(2);
    expect(h.repository.lexical).toHaveBeenCalledTimes(2);
    expect(h.embeddings.embedBatch).toHaveBeenCalledTimes(1);
    expect(result.answers.map((answer) => answer.frame.frameId)).toEqual(['moved0', 'moved1']);
    expect(result.trace.cacheHits).toBe(4);
  });
  it('bounds database search concurrency and preserves question order', async () => {
    const h = setup();
    const frames = offlineFrames('열이 있나요? 머리가 아팠나요? 약을 드시나요? 담배 피우세요? 나이는요?',
      initialDialogueState(h.corpus.caseVersion, null));
    let active = 0, peak = 0;
    const search = async (ids: string[]) => {
      active++; peak = Math.max(peak, active);
      await new Promise((resolve) => setImmediate(resolve));
      active--;
      return ids.map((id) => ({ id, score: .9 }));
    };
    h.repository.vectors.mockImplementation(async (_c, _p, _v, ids) => search(ids));
    h.repository.lexical.mockImplementation(async (_c, _p, _t, ids) => search(ids));
    const result = await h.service.retrieve(h.corpus, frames, h.persona, true);
    expect(frames).toHaveLength(5);
    expect(result.trace.searchConcurrency).toBe(2);
    // Each admitted question runs two independent DB searches.
    expect(peak).toBe(4);
    expect(active).toBe(0);
    expect(result.answers.map((answer) => answer.frame.text)).toEqual(frames.map((frame) => frame.text));
  });
  it('rejects foreign retrieved IDs and never trusts database values as patient facts', async () => {
    const h = setup();
    h.repository.vectors.mockResolvedValue([{ id: 'foreign-case', score: 1 }]);
    const r = await h.service.retrieve(h.corpus, h.frames, h.persona);
    expect(r.trace.source).toBe('scoped_lexical');
    expect(r.trace.vectorCandidates).toBe(0);
    expect(
      r.answers.flatMap((a) => a.facts).every((f) => f.caseId === 'case1'),
    ).toBe(true);
  });
  it('does not spend embedding calls on an incomplete index', async () => {
    const h = setup();
    h.repository.ready.mockResolvedValue(false);
    const r = await h.service.retrieve(h.corpus, h.frames, h.persona);
    expect(h.embeddings.embedBatch).not.toHaveBeenCalled();
    expect(r.issues).toContainEqual({
      stage: 'retrieval',
      code: 'index_not_ready',
    });
  });
  it('recovers from embedding transport failures without confusing them with unknown clinical data', async () => {
    const h = setup();
    h.embeddings.embedBatch.mockRejectedValueOnce(new Error('unavailable'));
    const r = await h.service.retrieve(h.corpus, h.frames, h.persona);
    expect(r.issues.some((i) => i.stage === 'embedding')).toBe(true);
    expect(r.answers.every((a) => a.status === 'known')).toBe(true);
  });
  it('gives the writer only selected evidence and publishes only after semantic validation', async () => {
    const h = setup();
    const { answers } = await h.service.retrieve(h.corpus, h.frames, h.persona);
    const config = { get: () => 'true' } as unknown as ConfigService;
    const json = jest
      .spyOn(h.model, 'json')
      .mockImplementation(async (name, _schema, _prompt, input: any) =>
        name === 'grounded_patient_reply'
          ? {
              data: {
                answers: answers.map((a) => ({
                  frameId: a.frame.frameId,
                  text: canonicalAnswer(a, h.persona),
                  factIds: a.facts.map((f) => f.id),
                })),
              },
              tokens: 10,
            }
          : {
              data: {
                checks: answers.map((a) => ({
                  frameId: a.frame.frameId,
                  supported: true,
                  allQuestionsAnswered: true,
                  patientRole: true,
                  unsupportedClaims: [],
                })),
              },
              tokens: 5,
            },
      );
    const r = await new GroundedResponseService(h.model, config).generate(
      answers,
      h.corpus,
      h.persona,
    );
    expect(r.source).toBe('exact_fact_rendering');
    expect(r.tokens).toBe(10);
    expect(json).toHaveBeenCalledTimes(1);
    const input = JSON.stringify(json.mock.calls[0][3]);
    expect(input).not.toMatch(/hiddenDiagnosis|환자교육|P_E|checklist/);
    expect(input).not.toContain('매일 소주');
  });
  it('falls back to source facts when an ID-valid paraphrase changes the meaning', async () => {
    const h = setup();
    const { answers } = await h.service.retrieve(h.corpus, h.frames, h.persona);
    jest.spyOn(h.model, 'json').mockImplementation(async (name) =>
      name === 'grounded_patient_reply'
        ? {
            data: {
              answers: answers.map((a) => ({
                frameId: a.frame.frameId,
                text: '없지는 않았어요.',
                factIds: a.facts.map((f) => f.id),
              })),
            },
            tokens: 10,
          }
        : {
            data: {
              checks: answers.map((a) => ({
                frameId: a.frame.frameId,
                supported: false,
                allQuestionsAnswered: true,
                patientRole: true,
                unsupportedClaims: ['negation changed'],
              })),
            },
            tokens: 5,
          },
    );
    const r = await new GroundedResponseService(h.model, {
      get: () => 'true',
    } as unknown as ConfigService).generate(answers, h.corpus, h.persona);
    expect(r.source).toBe('verified_fact_rendering_after_error');
    expect(r.reply).toContain('열은 없었어요');
  });
  it('refuses incomplete/zero-norm vector publications before beginning a transaction', async () => {
    const h = setup();
    const connect = jest.fn();
    const repo = new PatientEvidenceRepository({ pgPool: { connect } } as any);
    await expect(repo.publish(h.corpus, 'model', new Map())).rejects.toThrow(
      'Incomplete',
    );
    await expect(
      repo.publish(
        h.corpus,
        'model',
        new Map(h.corpus.facts.map((f) => [f.id, [0, 0]])),
      ),
    ).rejects.toThrow('Invalid');
    expect(connect).not.toHaveBeenCalled();
  });
});
