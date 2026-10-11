import { ConfigService } from '@nestjs/config';
import fixtures from '../../test/fixtures/patient-conversation-cases.json';
import dataset from '../rag/simulationRAG/data/seizure_cases.json';
import { PatientResponseService } from '../llm/patient-response.service';
import { analyzePatientQuestions } from './patient-question';
import {
  extractPatientFacts,
  PatientFactCache,
  selectPatientFacts,
  type PatientPersona,
} from './patient-facts';

export function loadCase(caseNumber: number) {
  const item = dataset.증례목록.find((c) => c.증례번호 === caseNumber)!;
  const basic = item.문진및신체진찰정보.기본정보;
  const persona: PatientPersona = {
    name: basic.성함,
    ageRaw: basic.나이,
    birthDate: basic.생년월일,
    sex: basic.성별,
    isGuardianCase: basic.source === 'caregiver',
    witnessPresent: item.목격자정보.목격자유무,
    witnessRelation: item.목격자정보.관계,
  };
  return {
    item,
    persona,
    facts: extractPatientFacts(
      String(caseNumber),
      item.문진및신체진찰정보,
      persona,
      basic.주소,
    ),
  };
}

const service = new PatientResponseService({
  get: () => undefined,
} as unknown as ConfigService);
describe('8 cases: minimum factual patient responses', () => {
  for (const expected of fixtures.cases) {
    fixtures.questions.forEach(([text, topic], index) => {
      it(`case ${expected.caseNumber}: ${text}`, async () => {
        const { facts, persona, item } = loadCase(expected.caseNumber);
        const questions = analyzePatientQuestions(text);
        expect(questions.map((q) => q.topic)).toEqual([topic]);
        const selected = selectPatientFacts(questions[0], facts, persona);
        const value = expected.values[index];
        if (value === null) expect(selected).toHaveLength(0);
        else expect(selected.map((f) => f.value)).toEqual([value]);
        const reply = await service.generateReply({
          patientPersona: persona,
          answers: [{ question: questions[0], facts: selected }],
          allowedFacts: facts,
        });
        expect(reply).toBeTruthy();
        expect(reply).not.toMatch(
          /강직간대발작|근간대성경련|수막자극징후|\[|source|NRS/,
        );
        if (value === null) expect(reply).toContain('잘 모르겠어요');
        if (topic !== 'birth_date')
          expect(reply).not.toContain(
            item.문진및신체진찰정보.기본정보.생년월일,
          );
      });
    });
  }
});

describe('compound questions, role boundaries, and conversation context', () => {
  for (const edge of fixtures.edges) {
    it(
      edge.text + ('previous' in edge ? ` after ${edge.previous}` : ''),
      () => {
        const result = analyzePatientQuestions(
          edge.text,
          'previous' in edge ? edge.previous : undefined,
        );
        if ('topics' in edge)
          expect(result.map((q) => q.topic)).toEqual(edge.topics);
        if ('kinds' in edge)
          expect(result.map((q) => q.kind)).toEqual(edge.kinds);
        if ('phases' in edge)
          expect(result.map((q) => q.phase)).toEqual(edge.phases);
        if ('aspects' in edge)
          expect(result.map((q) => q.aspect)).toEqual(edge.aspects);
      },
    );
  }
  it('answers all mixed questions without extra history or recipes', async () => {
    const { facts, persona } = loadCase(5);
    const answers = analyzePatientQuestions(
      '이름이 뭐예요? 열이 있나요? 머리가 얼마나 아파요? 라면 레시피 알려줘',
    ).map((question) => ({
      question,
      facts: selectPatientFacts(question, facts, persona),
    }));
    const reply = await service.generateReply({
      patientPersona: persona,
      answers,
      allowedFacts: facts,
    });
    expect(reply).toContain('송창희');
    expect(reply).toContain('열이 났어요');
    expect(reply).toContain('7점');
    expect(reply).not.toMatch(/타이레놀|뇌졸중|라면|물.*끓|면을|1979/);
  });
  it('keeps post-event weakness distinct from current weakness', () => {
    const { facts, persona } = loadCase(4);
    expect(
      selectPatientFacts(
        analyzePatientQuestions('경련 후 힘이 빠졌나요?')[0],
        facts,
        persona,
      )[0].value,
    ).toBe(true);
    expect(
      selectPatientFacts(
        analyzePatientQuestions('지금 힘이 빠졌나요?')[0],
        facts,
        persona,
      )[0].value,
    ).toBe(false);
  });
  it('does not turn a preserved memory into amnesia', () => {
    const { facts, persona } = loadCase(6);
    expect(
      selectPatientFacts(
        analyzePatientQuestions('경련 후 기억이 나나요?')[0],
        facts,
        persona,
      )[0].value,
    ).toBe(true);
  });
  it('does not infer loss of consciousness from absent response', () => {
    const { facts, persona } = loadCase(8);
    expect(
      selectPatientFacts(
        analyzePatientQuestions('경련 중 의식을 잃었나요?')[0],
        facts,
        persona,
      )[0].value,
    ).toBe(false);
    expect(
      selectPatientFacts(
        analyzePatientQuestions('경련 중 부르면 반응했나요?')[0],
        facts,
        persona,
      )[0].value,
    ).toBe(true);
  });
  it('does not give witness facts when no witness was present', () => {
    const { facts, persona } = loadCase(1);
    expect(
      selectPatientFacts(
        analyzePatientQuestions('경련 중 어떤 모습이었나요?')[0],
        facts,
        { ...persona, witnessPresent: false },
      ),
    ).toEqual([]);
  });
  it('keeps exam data and hidden education out of the patient facts', () => {
    const { facts } = loadCase(5);
    expect(
      facts.some((f) => f.source === 'exam' || f.source === 'station'),
    ).toBe(false);
    expect(facts.some((f) => /V\/S|뇌압|CT|MRI|혈압/.test(f.reply))).toBe(
      false,
    );
  });
  it('rejects a fact from a different topic before rendering', async () => {
    const { facts, persona } = loadCase(5);
    await expect(
      service.generateReply({
        patientPersona: persona,
        answers: [
          {
            question: analyzePatientQuestions('열이 있나요?')[0],
            facts: facts.filter((f) => f.topic === 'medication'),
          },
        ],
        allowedFacts: facts,
      }),
    ).rejects.toThrow();
  });
  it('invalidates the cache when the source changes', () => {
    const cache = new PatientFactCache();
    const first = cache.get(
      'case',
      JSON.stringify({ A_F: { 발열: false } }),
      {},
      '',
    );
    const second = cache.get(
      'case',
      JSON.stringify({ A_F: { 발열: true } }),
      {},
      '',
    );
    expect(first.find((f) => f.topic === 'fever')!.value).toBe(false);
    expect(second.find((f) => f.topic === 'fever')!.value).toBe(true);
  });
  it('does not apply current symptoms to an undocumented earlier phase', () => {
    const { facts, persona } = loadCase(1);
    expect(
      selectPatientFacts(
        analyzePatientQuestions('경련 전에 머리 아팠나요?')[0],
        facts,
        persona,
      ),
    ).toEqual([]);
  });
  it('keeps a generic post-event question brief and grounded in the post-event state', async () => {
    const { facts, persona } = loadCase(4);
    const question = analyzePatientQuestions('경련 후에는 어땠나요?')[0];
    const selected = selectPatientFacts(question, facts, persona);
    expect(selected.map((f) => f.value)).toEqual([true]);
    expect(
      await service.generateReply({
        patientPersona: persona,
        answers: [{ question, facts: selected }],
        allowedFacts: facts,
      }),
    ).toBe('피곤했어요.');
  });
  it('does not disclose fecal incontinence when only urinary incontinence was asked', () => {
    expect(
      analyzePatientQuestions('요실금이 있었나요?').map((q) => q.topic),
    ).toEqual(['urinary_incontinence']);
    expect(
      analyzePatientQuestions('대소변 실금이 있었나요?').map((q) => q.topic),
    ).toEqual(['incontinence']);
  });
  it('keeps name and medication questions independent in one clause', () => {
    expect(
      analyzePatientQuestions('이름과 약 이름이 뭐예요?').map((q) => q.topic),
    ).toEqual(['name', 'medication']);
  });
  it('keeps upward and sideways eye movement distinct', () => {
    const { facts, persona } = loadCase(4);
    expect(
      selectPatientFacts(
        analyzePatientQuestions('경련 중 눈이 위로 올라갔나요?')[0],
        facts,
        persona,
      )[0].value,
    ).toBe(true);
    expect(
      selectPatientFacts(
        analyzePatientQuestions('경련 중 눈이 한쪽으로 돌아갔나요?')[0],
        facts,
        persona,
      )[0].value,
    ).toBe(false);
  });
  it('does not answer a body location question with a geographic location', () => {
    const { facts, persona } = loadCase(1);
    expect(
      selectPatientFacts(
        analyzePatientQuestions('어느 부위에서 경련했나요?')[0],
        facts,
        persona,
      ),
    ).toEqual([]);
  });
  it('does not assume a witness exists when metadata is missing', () => {
    const { facts, persona } = loadCase(1);
    expect(
      selectPatientFacts(
        analyzePatientQuestions('경련 중 어떤 모습이었나요?')[0],
        facts,
        { ...persona, witnessPresent: undefined },
      ),
    ).toEqual([]);
  });
  it('rejects changed text for an otherwise valid fact ID', async () => {
    const { facts, persona } = loadCase(1);
    const question = analyzePatientQuestions('열이 있나요?')[0];
    const selected = selectPatientFacts(question, facts, persona).map((f) => ({
      ...f,
      reply: '열이 났어요.',
    }));
    await expect(
      service.generateReply({
        patientPersona: persona,
        answers: [{ question, facts: selected }],
        allowedFacts: facts,
      }),
    ).rejects.toThrow('변경된');
  });
  it('reports corrupt structured case data instead of silently treating it as unknown history', () => {
    expect(() =>
      new PatientFactCache().get('case', '{invalid', {}, '', true),
    ).toThrow('Invalid structured patient case');
  });
});
