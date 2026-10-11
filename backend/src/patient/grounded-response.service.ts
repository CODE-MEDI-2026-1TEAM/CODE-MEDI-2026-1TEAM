import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  EvidenceAnswer,
  EvidenceCorpus,
  EvidenceFact,
  ProcessingIssue,
  TurnFrame,
  DialogueExchange,
  PendingRepair,
  RepairResolution,
} from './evidence-contract';
import type { PatientPersona } from './patient-facts';
import { PatientModelService } from './patient-model.service';
import { compactFact, compactFrame } from './model-evidence';
import { isClinicianActionStatement } from './clinician-statement';
import { quantityViolation } from './quantity-guards';
import { firstResponseFrames, PATIENT_REPLY_STYLE, PATIENT_RESPONSE_POLICY } from './patient-turn-policy';

export function canonicalAnswer(
  answer: EvidenceAnswer,
  persona: PatientPersona,
): string {
  const { frame, facts, status } = answer;
  if (status === 'processing_failed') return '이 질문을 처리하는 데 문제가 생겼어요. 이 부분을 다시 말씀해 주시겠어요?';
  if (status === 'needs_clarification')
    return '어떤 부분을 물으시는 건지 다시 말씀해 주세요.';
  if (status === 'not_provided') return '그 부분은 정확히 모르겠어요.';
  switch (frame.speechAct) {
    case 'off_topic':
      return persona.isGuardianCase
        ? '선생님, 아이의 증상에 대해 말씀드려도 될까요?'
        : '선생님, 제 증상에 대해 말씀드려도 될까요?';
    case 'ask_diagnosis':
      return '무슨 병인지는 저도 잘 모르겠어요. 선생님이 알려 주세요.';
    case 'social':
      return /감사|수고/.test(frame.text)
        ? '네, 감사합니다.'
        : /안녕하세요|반갑/.test(frame.text)
          ? '네, 안녕하세요. 잘 부탁드려요.'
          : '네, 알겠습니다.';
    case 'perform_exam':
      return '네, 그렇게 할게요.';
    case 'explain_plan':
    case 'educate':
    case 'empathize':
      return '네, 알겠습니다.';
  }
  return facts
    .map((f) => {
      if (
        [
          'name',
          'age',
          'birth_date',
          'sex',
          'guardian_relationship',
          'witness_relationship',
        ].includes(f.conceptId)
      )
        return f.reply;
      if (f.informationSource === 'witness')
        return persona.isGuardianCase
          ? `제가 봤을 때는 ${f.reply}`
          : `${persona.witnessRelation || '목격한 분'}에게 들었는데, ${f.reply}`;
      return f.reply;
    })
    .join(' ');
}

function joinPatientReplies(texts: string[], answers: EvidenceAnswer[]): string {
  const active = firstResponseFrames(answers.map(a => a.frame)).active[0];
  return (texts[answers.findIndex(a => a.frame === active)] ?? '다시 말씀해 주시겠어요?').trim();
}

export function validateGeneratedAnswers(
  rows: unknown,
  answers: EvidenceAnswer[],
  corpus: EvidenceCorpus,
): string[] {
  if (!Array.isArray(rows) || rows.length !== answers.length)
    throw new Error('response_coverage_invalid');
  const canonical = new Map(corpus.facts.map((f) => [f.id, f]));
  return answers.map((answer) => {
    const matches = rows.filter((r) => r.frameId === answer.frame.frameId);
    if (matches.length !== 1) throw new Error('response_coverage_invalid');
    const row = matches[0];
    if (
      typeof row.text !== 'string' ||
      !row.text.trim() ||
      !Array.isArray(row.factIds) ||
      new Set(row.factIds).size !== row.factIds.length ||
      row.factIds.some(
        (id) =>
          !answer.facts.some((f) => f.id === id) ||
          canonical.get(id)?.caseVersion !== corpus.caseVersion,
      ) ||
      answer.facts.some((f) => !row.factIds.includes(f.id))
    )
      throw new Error('response_grounding_invalid');
    if (
      /hiddenDiagnosis|system_prompt|평가\s*기준|정답은|레시피|\[PATIENT|\[ALLOWED/.test(
        row.text,
      )
    )
      throw new Error('response_disclosure_invalid');
    const selected = row.factIds.map((id) => canonical.get(id)!);
    // Hard checks cannot prove paraphrase support. A separate semantic check follows.
    const sourceNumbers = new Set(
      selected.flatMap(
        (f) => `${f.value} ${f.reply}`.match(/\d+(?:\.\d+)?/g) ?? [],
      ),
    );
    if (
      (row.text.replace(/\d+(?:\.\d+)?\s*(?:[~～\-]\s*\d+(?:\.\d+)?)?\s*(?:시간|개월|초|분|번|회|세|kg|cm|mm|g)(?![a-z])/gi, '').match(/\d+(?:\.\d+)?/g) ?? []).some(
        (n) => !sourceNumbers.has(n),
      )
    )
      throw new Error('response_number_invalid');
    const quantitativeIssue = quantityViolation(answer.frame.text, row.text, selected);
    if (quantitativeIssue) throw new Error(quantitativeIssue);
    if (
      selected.every((f) => f.polarity === 'negative') &&
      selected.length &&
      !/없|않|아니|못|안\s/.test(row.text)
    )
      throw new Error('response_negation_invalid');
    return row.text.trim();
  });
}

@Injectable()
export class GroundedResponseService {
  private readonly logger = new Logger(GroundedResponseService.name);
  constructor(
    private readonly model: PatientModelService,
    private readonly config: ConfigService,
  ) {}
  async generate(
    answers: EvidenceAnswer[],
    corpus: EvidenceCorpus,
    persona: PatientPersona,
    proposed?: any[],
    originalUtterance?: string,
    alternativeEvidence: EvidenceFact[] = [],
    referenceContext: TurnFrame[] = [],
    recentTurns: DialogueExchange[] = [],
    pendingRepairs: PendingRepair[] = [],
  ): Promise<{
    reply: string;
    issues: ProcessingIssue[];
    source: string;
    tokens: number;
    rejectedFrameIds?: string[];
    nonHistoryFrameIds?: string[];
    promotedHistoryFrameIds?: string[];
    verifiedFrameIds?: string[];
    repairResolutions?: RepairResolution[];
    answerTexts?: Record<string, string>;
  }> {
    const policy = firstResponseFrames(answers.map(a => a.frame));
    answers = answers.filter(a => policy.active.includes(a.frame));
    if (proposed) proposed = proposed.filter(row => answers.some(a => a.frame.frameId === row.frameId));
    // Validate the selected values themselves, rather than trusting IDs from a retriever.
    const facts = new Map(corpus.facts.map((f) => [f.id, JSON.stringify(f)]));
    if (
      alternativeEvidence.some((f) => facts.get(f.id) !== JSON.stringify(f)) ||
      answers.some((a) =>
        a.facts.some((f) => facts.get(f.id) !== JSON.stringify(f)),
      )
    )
      throw new Error('fact_scope_invalid');
    const baseline = () =>
      joinPatientReplies(answers.map((a) => canonicalAnswer(a, persona)), answers);
    if (
      !this.model.enabled ||
      this.config.get<string>('PATIENT_GENERATION_ENABLED') !== 'true'
    ) {
      return {
        reply: baseline(),
        issues: [],
        source: 'verified_fact_rendering',
        tokens: 0,
      };
    }
    let tokens = 0;
    try {
      const ids = new Map<string, string>();
      const originals = new Map<string, string>();
      const unknownCandidates = answers.some((a) =>
        (a.status === 'not_provided' && a.frame.speechAct === 'ask_history') ||
        (originalUtterance && recentTurns.length > 0 && !a.facts.length && a.frame.speechAct !== 'confirm_dialogue'))
        ? alternativeEvidence.slice(0, 96) : [];
      for (const fact of [...answers.flatMap((a) => a.facts), ...unknownCandidates]) {
        if (!ids.has(fact.id)) {
          const short = `e${ids.size + 1}`;
          ids.set(fact.id, short);
          originals.set(short, fact.id);
        }
      }
      const compactAnswers = answers.map((a) => ({
        frame: compactFrame(a.frame),
        status: a.status,
        facts: a.facts.map((f) => compactFact(f, ids.get(f.id)!)),
      }));
      const schema = {
        type: 'object',
        additionalProperties: false,
        required: ['answers'],
        properties: {
          answers: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['frameId', 'text', 'factIds'],
              properties: {
                frameId: {
                  type: 'string',
                },
                text: { type: 'string' },
                factIds: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      };
      const result = proposed
        ? { data: { answers: proposed }, tokens: 0 }
        : await this.model.json(
            'grounded_patient_reply',
            schema,
            `환자 또는 보호자의 역할만 수행한다. 주어진 첫 질문 하나만 답한다. ${PATIENT_REPLY_STYLE} 추가 질문의 답을 먼저 말하지 않는다. 제공된 질문별 사실만 사용하고 다른 질문의 사실을 가져오지 않는다. 전문 해설·추측·진단·묻지 않은 병력·추가 수치는 금지한다. known만 factIds의 근거에 따라 답한다. not_provided는 그 정보를 정확히 모른다고 짧게 말한다. 기술 오류를 기억 없음으로 바꾸지 않는다. 무관 요청에 레시피나 조언을 주지 않는다. 설명·계획·교육에는 짧게 반응한다.`,
            {
              role: persona.isGuardianCase ? 'caregiver' : 'patient',
              answers: compactAnswers,
            },
            { caseId: corpus.caseId, version: corpus.caseVersion, persona },
          );
      tokens += result.tokens;
      if (!proposed && Array.isArray(result.data.answers))
        result.data.answers = result.data.answers.map((r: any) => ({
          ...r,
          factIds: Array.isArray(r.factIds)
            ? r.factIds.map((id: string) => originals.get(id) ?? id)
            : r.factIds,
        }));
      if (Array.isArray(result.data.answers))
        result.data.answers = result.data.answers.filter((row: any) => answers.some(a => a.frame.frameId === row.frameId));
      const localRejected: string[] = [];
      const localIssues: ProcessingIssue[] = [];
      // A malformed part must not suppress independently verifiable sibling answers.
      const texts = proposed ? answers.map((answer) => {
        if (answer.status === 'processing_failed') {
          localRejected.push(answer.frame.frameId);
          return canonicalAnswer(answer, persona);
        }
        try {
          const rows = result.data.answers.filter((row: any) => row.frameId === answer.frame.frameId);
          return validateGeneratedAnswers(rows, [answer], corpus)[0];
        } catch (error) {
          localRejected.push(answer.frame.frameId);
          localIssues.push({ stage: 'generation', code: error instanceof Error ? error.message : 'response_grounding_invalid', frameIds: [answer.frame.frameId] });
          answer.facts = [];
          answer.status = 'processing_failed';
          return canonicalAnswer(answer, persona);
        }
      }) : validateGeneratedAnswers(result.data.answers, answers, corpus);
      // Exact source rendering in the compatibility path has already passed strict scope checks.
      // Integrated semantic selection still needs an independent question/evidence check.
      if (
        !proposed &&
        texts.every((t, i) => t === canonicalAnswer(answers[i], persona))
      ) {
        return {
          reply: joinPatientReplies(texts, answers),
          issues: [],
          source: 'exact_fact_rendering',
          tokens,
        };
      }
      const verification = await this.model.json(
        'patient_claim_verification',
        {
          type: 'object',
          additionalProperties: false,
          required: [...(originalUtterance ? ['checks', 'allRequestedAspectsCovered', 'noUnrequestedInformation'] : ['checks']), ...(pendingRepairs.length ? ['repairChecks'] : [])],
          properties: {
            ...(pendingRepairs.length ? { repairChecks: { type: 'array', items: {
              type: 'object', additionalProperties: false, required: ['id', 'fullyCovered', 'frameIds'],
              properties: { id: { type: 'string' }, fullyCovered: { type: 'boolean' }, frameIds: { type: 'array', items: { type: 'string' } } },
            } } } : {}),
            ...(originalUtterance ? {
              allRequestedAspectsCovered: { type: 'boolean' },
              noUnrequestedInformation: { type: 'boolean' },
            } : {}),
            checks: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: [
                  'frameId',
                  'supported',
                  'allQuestionsAnswered',
                  'patientRole',
                  'unsupportedClaims',
                  ...(originalUtterance ? ['isPatientHistoryRequest', 'ambiguousReference'] : []),
                ],
                properties: {
                  frameId: {
                    type: 'string',
                  },
                  supported: { type: 'boolean' },
                  allQuestionsAnswered: { type: 'boolean' },
                  patientRole: { type: 'boolean' },
                  ...(originalUtterance ? {
                    isPatientHistoryRequest: { type: 'boolean' },
                    ambiguousReference: { type: 'boolean' },
                  } : {}),
                  unsupportedClaims: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        'pendingRepairs가 있으면 과거 실패한 질문의 모든 측면을 현재의 검증된 답변들이 실제 해결했는지 repairChecks로 독립 판단한다. 같은 화제나 재질문 표현만으로 fullyCovered=true로 두지 않는다. 일부 측면만 답하면 false다. 실패/재질문 문구는 복구가 아니다. dialogueReference는 이전 발언을 확인하는 대화 출처이지 임상 근거가 아니다. confirm_dialogue에 이전 모른다는 답변의 대상만 확인하면 정상 대화이며 모른다는 사실을 새 임상 정보처럼 해석하지 않는다. ' +
        'patientRole은 지정된 응답자 역할 준수 여부다. role=caregiver면 아이의 보호자가 아이의 정보와 관찰을 말하는 것이 올바른 역할이며 patientRole=true다. 이때 subject=patient는 아이이고 화자인 보호자와 다르다. role=patient면 본인이 말한다. ' +
        '선택 근거가 없는 모른다는 응답은 1차 모델의 가설이다. unselectedCandidates에 질문에 답할 근거가 있으면 모른다는 응답을 supported=false로 거절한다. 없을 때만 정보 모름을 인정한다. 질문의 가정을 그대로 긍정하다가 뒤에서 반대로 말하는 자기모순도 거절한다. 원문이 의학 용어여도 답변은 쉬운 일상어여야 한다. ' +
        '원문 자체에서 isPatientHistoryRequest를 독립 판단한다. 환자 신원·병력·증상·걱정·생각을 묻는 질문만 true다. 학생이 사실을 설명하는 평서문·교육·계획·동의 요청·인사·무관 요청은 false다. 학생의 설명에 환자가 묻지 않은 병력을 되풀이하면 거절한다. referenceContext는 참조를 위한 이전 질문들이다. recentDialogue의 이전 reply와 학생의 정정 내용은 사실 출처가 아니다. 반복·정정 질문에서는 현재 질문이 의도한 대상·측면·시점을 공개 근거와 새로 대조한다. 이전 오답에 맞춘 답변은 거절하고, 근거와 일치하는 정정은 이전 답변과 다르다는 이유로 거절하지 않는다. 현재 발화에 명시된 대상을 우선한다. 그건/그때의 대상이 여러 이전 질문 중 모호한데 하나로 추정해 답하면 ambiguousReference=true로 거절한다. 모호한 참조에 재질문한 응답은 허용한다. ' +
        '각 질문과 응답의 모든 주장이 선택 근거로 지원되는지 독립 검증한다. 프레임의 추론 라벨을 정답으로 믿지 말고 원래 질문 의미를 우선한다. 증상·측면·대상·사건·시점과 수치·부정 범위·화자·환자 역할을 확인한다. not_provided에 해당 정보를 모른다고 답하면 답변한 것으로 인정하며 allQuestionsAnswered=true다. ' +
        'responsePolicy는 첫 질문 하나만 답하는 대화 정책이다. answers에 있는 선택된 질문의 요청 측면만 allRequestedAspectsCovered로 검사한다. 선택된 question에도 이름과 나이처럼 독립 질문이 묶여 있으면 첫 요청만 답하고 뒤의 답은 먼저 공개하지 않는다. utterance에 남아 있는 뒤의 질문·인사·설명을 답하지 않은 것은 정상이며 누락·모름·시스템 오류로 판단하지 않는다. 나중 질문에 먼저 답하면 noUnrequestedInformation=false다. ' +
        '묻지 않은 지속시간·횟수·증상을 추가하면 noUnrequestedInformation=false다. 근거의 value가 요구한 내용을 포함하면 aspect 같은 보조 라벨이 다르다는 이유만으로 거부하지 않는다. 엉뚱한 근거는 supported=false. 설명·계획에는 동의만 하고 진찰 결과를 환자가 설명하지 않는다.',
        {
          role: persona.isGuardianCase ? 'caregiver' : 'patient',
          responsePolicy: { mode: PATIENT_RESPONSE_POLICY, activeQuestion: answers[0]?.frame.text },
          ...(originalUtterance ? { utterance: originalUtterance } : {}),
          ...(referenceContext.length ? { referenceContext: referenceContext.map(compactFrame) } : {}),
          ...(recentTurns.length ? { recentDialogue: recentTurns } : {}),
          ...(pendingRepairs.length ? { pendingRepairs } : {}),
          ...(unknownCandidates.length ? { unselectedCandidates: unknownCandidates.map((f) => compactFact(f, ids.get(f.id)!)) } : {}),
          answers: originalUtterance ? answers.map((a) => ({
            frame: { frameId: a.frame.frameId, text: a.frame.text },
            facts: a.facts.map((f) => compactFact(f, ids.get(f.id)!)),
            ...(a.dialogueReference ? { dialogueReference: a.dialogueReference } : {}),
          })) : compactAnswers,
          result: answers.map((a, i) => ({
            frameId: a.frame.frameId, text: texts[i],
            factIds: a.facts.map((f) => ids.get(f.id)),
          })),
        },
        { caseId: corpus.caseId, version: corpus.caseVersion, persona },
      );
      tokens += verification.tokens;
      const checks = verification.data.checks;
      if (
        !Array.isArray(checks) ||
        checks.length !== answers.length ||
        checks.some((c) => !answers.some((a) => a.frame.frameId === c.frameId)) ||
        answers.some((a) => checks.filter((c) => c.frameId === a.frame.frameId).length !== 1)
        || (originalUtterance && checks.some((c) =>
          typeof c.isPatientHistoryRequest !== 'boolean' || typeof c.ambiguousReference !== 'boolean'))
      )
        throw new Error('response_verification_coverage_invalid');
      const nonHistoryFrameIds = originalUtterance ? answers.filter((a) => {
        const check = checks.find((c) => c.frameId === a.frame.frameId);
        return !localRejected.includes(a.frame.frameId) && a.frame.speechAct !== 'confirm_dialogue' && (a.frame.speechAct === 'ask_history' || a.facts.length > 0) &&
          check.isPatientHistoryRequest === false && check.ambiguousReference === false;
      }).map((a) => a.frame.frameId) : [];
      const canonicalStatementIds = answers.filter((a, i) =>
        isClinicianActionStatement(a.frame.text) && !a.facts.length &&
        ['perform_exam', 'explain_plan', 'educate'].includes(a.frame.speechAct) &&
        texts[i] === canonicalAnswer(a, persona),
      ).map((a) => a.frame.frameId);
      const rejectedFrameIds = [...localRejected, ...answers.filter(
          (a) =>
            !localRejected.includes(a.frame.frameId) && !canonicalStatementIds.includes(a.frame.frameId) &&
            !nonHistoryFrameIds.includes(a.frame.frameId) &&
            checks.filter(
              (c) =>
                c.frameId === a.frame.frameId &&
                c.supported === true &&
                c.allQuestionsAnswered === true &&
                c.patientRole === true &&
                (!originalUtterance || (c.ambiguousReference === false &&
                  (a.frame.speechAct === 'ask_history' || a.frame.speechAct === 'confirm_dialogue' || c.isPatientHistoryRequest === false ||
                    (c.isPatientHistoryRequest === true && a.facts.length > 0)))) &&
                Array.isArray(c.unsupportedClaims) &&
                c.unsupportedClaims.length === 0,
            ).length !== 1,
        ).map((a) => a.frame.frameId)];
      if (originalUtterance &&
        ((verification.data.allRequestedAspectsCovered !== true && !rejectedFrameIds.length) ||
         verification.data.noUnrequestedInformation !== true))
        for (const a of answers)
          if ((a.frame.speechAct === 'ask_history' || a.facts.length > 0) && !nonHistoryFrameIds.includes(a.frame.frameId) && !rejectedFrameIds.includes(a.frame.frameId))
            rejectedFrameIds.push(a.frame.frameId);
      const promotedHistoryFrameIds = originalUtterance ? answers.filter((a) =>
        !['ask_history', 'confirm_dialogue'].includes(a.frame.speechAct) && a.facts.length > 0 &&
        !rejectedFrameIds.includes(a.frame.frameId) && !nonHistoryFrameIds.includes(a.frame.frameId),
      ).map((a) => a.frame.frameId) : [];
      const verifiedFrameIds = answers.filter((a) => !rejectedFrameIds.includes(a.frame.frameId) &&
        !nonHistoryFrameIds.includes(a.frame.frameId)).map((a) => a.frame.frameId);
      const repairResolutions = pendingRepairs.flatMap((pending) => {
        const checks = (verification.data.repairChecks ?? []).filter((check: any) => check.id === pending.id);
        const check = checks.length === 1 ? checks[0] : null;
        return check?.fullyCovered === true && Array.isArray(check.frameIds) && check.frameIds.length > 0 &&
          check.frameIds.every((id: string) => verifiedFrameIds.includes(id) &&
            answers.some((a) => a.frame.frameId === id && ['known', 'not_provided'].includes(a.status)))
          ? [{ id: pending.id, requestId: pending.requestId, frameIds: check.frameIds }] : [];
      });
      const answerTexts = Object.fromEntries(answers.map((a, i) => [a.frame.frameId, texts[i]]));
      if (rejectedFrameIds.length || nonHistoryFrameIds.length) {
        if (this.config.get<string>('ENABLE_RAG_DEBUG') === 'true')
          this.logger.warn(JSON.stringify({ event: 'patient.verification.rejected', ...verification.data }));
        if (!proposed) throw new Error('response_semantic_invalid');
        return {
          reply: joinPatientReplies(texts.map((text, i) =>
            nonHistoryFrameIds.includes(answers[i].frame.frameId) ? '네, 알겠습니다.' :
            rejectedFrameIds.includes(answers[i].frame.frameId)
              ? canonicalAnswer({ ...answers[i], facts: [], status: localRejected.includes(answers[i].frame.frameId) ? 'processing_failed' : 'needs_clarification' }, persona)
              : text), answers),
          issues: [
            ...localIssues,
            ...(rejectedFrameIds.length ? [{ stage: 'generation', code: 'response_semantic_invalid', frameIds: rejectedFrameIds }] : []),
            ...(nonHistoryFrameIds.length ? [{ stage: 'generation', code: 'speech_act_corrected', frameIds: nonHistoryFrameIds }] : []),
          ],
          source: 'partial_verified_generation', tokens, rejectedFrameIds, nonHistoryFrameIds, promotedHistoryFrameIds, verifiedFrameIds, repairResolutions, answerTexts,
        };
      }
      return {
        reply: joinPatientReplies(texts, answers),
        issues: [],
        source: 'grounded_generation',
        tokens,
        promotedHistoryFrameIds,
        verifiedFrameIds, repairResolutions, answerTexts,
      };
    } catch (error) {
      if (this.config.get<string>('ENABLE_RAG_DEBUG') === 'true')
        this.logger.warn(JSON.stringify({
          event: 'patient.generation.rejected',
          code: error instanceof Error && /^response_[a-z_]+$/.test(error.message)
            ? error.message : 'generation_or_validation_failed',
        }));
      return {
        reply: proposed
          ? joinPatientReplies(
              answers.map((a) =>
                canonicalAnswer(
                  a.frame.speechAct === 'ask_history'
                    ? { ...a, facts: [], status: 'needs_clarification' }
                    : a,
                  persona,
                ),
              ),
              answers,
            )
          : baseline(),
        issues: [
          { stage: 'generation', code: 'generation_or_validation_failed' },
        ],
        source: 'verified_fact_rendering_after_error',
        tokens,
      };
    }
  }
}
