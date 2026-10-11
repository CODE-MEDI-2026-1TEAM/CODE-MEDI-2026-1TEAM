import { Injectable, Optional } from '@nestjs/common';
import { IntegratedTurnService } from './integrated-turn.service';
import { BoundedCache } from './bounded-cache';
import {
  PIPELINE_VERSION,
  type EvidenceCorpus,
  type PatientTurnInput,
} from './evidence-contract';
import { hashContent, normalizeEvidence } from './evidence-facts';
import { GroundedResponseService } from './grounded-response.service';
import { PatientEvidenceService } from './patient-evidence.service';
import {
  TurnUnderstandingService,
  initialDialogueState,
  offlineFrames,
} from './turn-understanding.service';
import { PatientModelError } from './patient-model.service';
import { recentDialogue, dialogueMemory, pendingRepairs } from './dialogue-repair';
import { firstResponseFrames, PATIENT_RESPONSE_POLICY } from './patient-turn-policy';

@Injectable()
export class PatientPipelineService {
  private readonly corpora = new BoundedCache<EvidenceCorpus>(64, 600_000);
  constructor(
    private readonly understanding: TurnUnderstandingService,
    private readonly evidence: PatientEvidenceService,
    private readonly response: GroundedResponseService,
    @Optional() private readonly integrated?: IntegratedTurnService,
  ) {}
  async turn(input: PatientTurnInput) {
    const key = hashContent([
      PIPELINE_VERSION,
      input.caseId,
      input.patientPrompt,
      input.persona,
      input.chiefComplaint,
    ]);
    let corpus = this.corpora.get(key);
    if (!corpus) {
      corpus = normalizeEvidence(
        input.caseId,
        input.patientPrompt,
        input.persona,
        input.chiefComplaint,
      );
      this.corpora.set(key, corpus);
    }
    const state = initialDialogueState(corpus.caseVersion, input.state);
    let combined:
      Awaited<ReturnType<IntegratedTurnService['process']>> | undefined;
    let combinedError = false;
    let combinedErrorCode = 'combined_processing_failed';
    if (this.integrated?.enabled) {
      try {
        combined = await this.integrated.process(input, state, corpus);
      } catch (error) {
        combinedError = true;
        if (error instanceof PatientModelError) combinedErrorCode = error.code;
        else if (error instanceof Error && /^selection_(?:id_invalid|scope_invalid|context_ambiguous)$/.test(error.message))
          combinedErrorCode = error.message;
      }
    }
    // Do not automatically make a second paid interpretation attempt after a failed combined call.
    const understood =
      combined?.understood ??
      (combinedError
        ? {
            frames: offlineFrames(input.content, state).map((f) => ({
              ...f, speechAct: 'clarify' as const, conceptId: null,
            })),
            source: 'offline_after_combined_error',
            issues: [
              { stage: 'understanding', code: combinedErrorCode },
            ],
            tokens: 0,
          }
        : await this.understanding.understand(input.content, state));
    const policy = firstResponseFrames(understood.frames);
    const retrieved =
      combined?.retrieved ??
      (combinedError
        ? {
            answers: policy.active.map((frame) => {
              // Interpretation failed: local topic guesses must not reveal clinical facts.
              const facts: EvidenceCorpus['facts'] = [];
              return {
                frame,
                facts,
                status:
                  frame.speechAct === 'clarify'
                    ? ('needs_clarification' as const)
                    : frame.speechAct !== 'ask_history'
                      ? ('acknowledge' as const)
                      : facts.length
                        ? ('known' as const)
                        : ('not_provided' as const),
              };
            }),
            issues: [],
            trace: { source: 'offline_after_combined_error' },
          }
        : await this.evidence.retrieve(
            corpus,
            policy.active,
            input.persona,
          ));
    const generated =
      combined?.generated ??
      (combinedError
        ? {
            reply: '질문을 이해하는 데 문제가 생겼어요. 다시 말씀해 주시겠어요?',
            source: 'technical_clarification_after_error',
            issues: [],
            tokens: 0,
          }
        : await this.response.generate(
            retrieved.answers,
            corpus,
            input.persona,
          ));
    const activeIds = new Set(retrieved.answers.map(a => a.frame.frameId));
    const issues = [
      ...understood.issues.filter(issue => !issue.frameIds?.length || issue.frameIds.some(id => activeIds.has(id))),
      ...retrieved.issues,
      ...generated.issues,
    ];
    const detail = generated as Awaited<ReturnType<GroundedResponseService['generate']>>;
    const resolutions = detail.repairResolutions ?? [];
    const outstanding = pendingRepairs(state).filter((pending) => !resolutions.some((item) => item.id === pending.id));
    const failing = retrieved.answers.filter((answer) => answer.status === 'processing_failed' ||
      issues.some((issue) => ['understanding', 'generation'].includes(issue.stage) &&
        (!issue.frameIds?.length || issue.frameIds.includes(answer.frame.frameId)) &&
        issue.code !== 'speech_act_corrected'));
    for (const answer of failing) outstanding.push({ id: `p${state.turn + 1}_${answer.frame.frameId}`,
      turn: state.turn + 1, requestId: input.requestId, question: answer.frame.text.slice(0, 900) });
    const verified = new Set(detail.verifiedFrameIds ?? (!combinedError && !issues.length
      ? retrieved.answers.map((answer) => answer.frame.frameId) : []));
    const selected = retrieved.answers.filter(a => verified.has(a.frame.frameId) && a.status === 'known')
      .flatMap(a => a.facts.map(f => f.id));
    const memory = [...dialogueMemory(state), ...retrieved.answers.filter((answer) => verified.has(answer.frame.frameId) &&
      ['known', 'not_provided'].includes(answer.status)).map((answer) => ({
        id: `d${state.turn + 1}_${answer.frame.frameId}`, turn: state.turn + 1,
        question: answer.frame.text.slice(0, 900), status: answer.status,
        factIds: answer.facts.map((fact) => fact.id),
        reply: (detail.answerTexts?.[answer.frame.frameId] ?? generated.reply).slice(0, 220),
      }))].slice(-12);
    const anchors = retrieved.answers.flatMap((a) => a.facts.length > 1
      ? a.facts.map((f, i) => ({ ...a.frame, frameId: `${a.frame.frameId}_${i + 1}`,
          conceptId: f.conceptId, aspect: f.aspect, subjectId: f.subjectId,
          eventId: f.eventId, timeScope: f.timeScope, phase: f.phase }))
      : [a.frame]);
    const nextState = {
      version: PIPELINE_VERSION,
      caseVersion: corpus.caseVersion,
      memory,
      pendingRepairs: outstanding.slice(-24),
      turn: state.turn + 1,
      recentTurns: [...recentDialogue(state), {
        turn: state.turn + 1,
        question: input.content.slice(0, 900),
        reply: generated.reply.slice(0, 500),
        processingStatus: issues.length ? 'degraded' as const : 'completed' as const,
      }].slice(-2),
      lastFrames: anchors.some((f) =>
        f.speechAct === 'ask_history' || f.speechAct === 'clarify',
      ) ? anchors : state.lastFrames,
      answeredFactIds: [
        ...new Set([...state.answeredFactIds, ...selected]),
      ].slice(-256),
    };
    return {
      reply: generated.reply,
      state: nextState,
      frames: understood.frames,
      answers: retrieved.answers,
      processing: {
        pipelineVersion: PIPELINE_VERSION,
        responsePolicy: PATIENT_RESPONSE_POLICY,
        activeQuestion: retrieved.answers[0]?.frame.text ?? null,
        deferredQuestions: understood.frames.filter(f => !activeIds.has(f.frameId)).map(f => f.text),
        caseVersion: corpus.caseVersion,
        status: issues.length ? 'degraded' : 'completed',
        issues,
        understanding: understood.source,
        retrieval: retrieved.trace.source,
        generation: generated.source,
        normalizationIssues: corpus.issues.length,
        generationTokens: generated.tokens,
        understandingTokens: understood.tokens,
        repairResolutions: resolutions,
        pendingRepairCount: outstanding.length,
        failedRepairIds: outstanding.filter((item) => item.turn === state.turn + 1).map((item) => item.id),
        verifiedFrameIds: [...verified],
      },
      trace: retrieved.trace,
    };
  }
}
