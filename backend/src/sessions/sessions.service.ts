import {
  BadRequestException,
  BadGatewayException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import {
  MessageRole,
  Prisma,
  SessionStatus,
  type PhysicalExamEvent,
} from '@prisma/client';
import { CasesService } from '../cases/cases.service';
import { LlmService } from '../llm/llm.service';
import {
  PatientResponseService,
  type PatientAnswer,
} from '../llm/patient-response.service';
import {
  PatientFactCache,
  selectPatientFacts,
  type PatientPersona,
  type PatientFact,
} from '../patient/patient-facts';
import { analyzePatientQuestions } from '../patient/patient-question';
import { PatientPipelineService } from '../patient/patient-pipeline.service';
import { ApiCostService } from '../llm/api-cost.service';
import { hashContent } from '../patient/evidence-facts';
import { PIPELINE_VERSION } from '../patient/evidence-contract';
import { unresolvedProcessingRequests } from '../patient/evaluation-recovery';
import { projectLegacyFacts } from '../patient/legacy-patient-facts';
import { PrismaService } from '../prisma/prisma.service';
import { CaseFactRetrieverService } from '../rag/case-fact-retriever.service';
import { EvaluationCriteriaService } from '../rag/evaluation-criteria.service';
import { SimulationRagRetrieverService } from '../rag/simulation-rag-retriever.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { CreateSessionDto } from './dto/create-session.dto';
import {
  getPhysicalExamCriteriaForCase,
  getPhysicalExamCriteriaItemsForEventKey,
  normalizePhysicalExamStatus,
} from './physical-exam-criteria';

const INITIAL_PATIENT_GREETING = '안녕하세요.';
const HAND_HYGIENE_PHASES = new Set([
  'initial_greeting',
  'before_patient_contact',
  'during_interview',
]);

type PatientPosition = 'sitting' | 'supine';

type PhysicalExamDefinition = {
  expectedPosition: PatientPosition;
  key: string;
  label: string;
  patterns: RegExp[];
};

const PHYSICAL_EXAM_DEFINITIONS: PhysicalExamDefinition[] = [
  {
    expectedPosition: 'sitting',
    key: 'vital_signs',
    label: '활력징후 확인',
    patterns: [
      /(활력징후|v\/?s|바이탈|혈압|맥박|호흡수|체온).*(확인|측정|재보|보겠|볼게)?/i,
    ],
  },
  {
    expectedPosition: 'sitting',
    key: 'growth_chart_review',
    label: '성장곡선 자료 확인',
    patterns: [/(성장곡선|키.*체중|머리둘레).*(확인|자료|보겠|볼게)/i],
  },
  {
    expectedPosition: 'sitting',
    key: 'conjunctiva_exam',
    label: '결막 확인',
    patterns: [/(결막|눈꺼풀).*(확인|살펴|보겠|볼게)/i],
  },
  {
    expectedPosition: 'sitting',
    key: 'sclera_exam',
    label: '공막 확인',
    patterns: [/(공막|눈 흰자|황달).*(확인|살펴|보겠|볼게)/i],
  },
  {
    expectedPosition: 'sitting',
    key: 'thyroid_exam',
    label: '갑상샘 촉진',
    patterns: [/(갑상샘|갑상선).*(촉진|확인|만져|보겠|볼게)/i],
  },
  {
    expectedPosition: 'sitting',
    key: 'cervical_lymph_node',
    label: '경부 림프절 촉진',
    patterns: [/(림프절|목.*멍울).*(촉진|확인|만져|보겠|볼게)/i],
  },
  {
    expectedPosition: 'sitting',
    key: 'dehydration_exam',
    label: '탈수 소견 확인',
    patterns: [/(탈수|입술.*건조|입.*건조).*(확인|살펴|보겠|볼게)/i],
  },
  {
    expectedPosition: 'sitting',
    key: 'skin_turgor_exam',
    label: '피부긴장도 확인',
    patterns: [/(피부긴장도|피부 탄력|skin turgor).*(확인|검사|보겠|볼게)/i],
  },
  {
    expectedPosition: 'sitting',
    key: 'pitting_edema_exam',
    label: '오목부종 확인',
    patterns: [/(오목부종|함요부종|부종).*(확인|눌러|보겠|볼게)/i],
  },
  {
    expectedPosition: 'sitting',
    key: 'head_trauma_inspection',
    label: '두부외상 시진',
    patterns: [/(두부|머리|외상|상처|멍).*(시진|흔적|확인|살펴|보겠|볼게)/i],
  },
  {
    expectedPosition: 'sitting',
    key: 'head_trauma_palpation',
    label: '두부외상 촉진',
    patterns: [/(두부|머리).*(촉진|만져|압통|보겠|볼게)/i],
  },
  {
    expectedPosition: 'sitting',
    key: 'eye_exam',
    label: '눈 진찰',
    patterns: [/(눈 상태|눈 진찰).*(확인|살펴|보겠|볼게)?/i],
  },
  {
    expectedPosition: 'sitting',
    key: 'pupil_light_reflex',
    label: '동공반사',
    patterns: [/(동공\s*(?:반사|반응)|light reflex|빛.*반사).*(확인|검사|보겠|볼게)?/i],
  },
  {
    expectedPosition: 'sitting',
    key: 'extraocular_movement',
    label: '안구운동 검사',
    patterns: [/(안구.?운동|눈.*움직).*(확인|검사|보겠|볼게)/i],
  },
  {
    expectedPosition: 'sitting',
    key: 'visual_field',
    label: '시야검사',
    patterns: [/(시야검사|시야).*(확인|검사|보겠|볼게)/i],
  },
  {
    expectedPosition: 'sitting',
    key: 'facial_sensation',
    label: '얼굴감각 검사',
    patterns: [/(얼굴|안면).*(감각).*(확인|검사|보겠|볼게)/i],
  },
  {
    expectedPosition: 'sitting',
    key: 'facial_motor',
    label: '얼굴운동 검사',
    patterns: [/(얼굴|안면).*(운동|근력|움직).*(확인|검사|보겠|볼게)/i],
  },
  {
    expectedPosition: 'sitting',
    key: 'facial_reflex',
    label: '얼굴반사 검사',
    patterns: [/(얼굴|안면).*(반사).*(확인|검사|보겠|볼게)/i],
  },
  {
    expectedPosition: 'sitting',
    key: 'finger_to_nose',
    label: 'Finger-to-nose',
    patterns: [
      /(finger.?to.?nose|손가락.*코|코.*찍).*(검사|확인|해보|보겠|볼게)?/i,
    ],
  },
  {
    expectedPosition: 'sitting',
    key: 'rapid_alternating',
    label: 'Rapid alternating movement',
    patterns: [
      /(rapid alternating|교대운동|손바닥.*뒤집|빠른.*운동).*(검사|확인|해보|보겠|볼게)?/i,
    ],
  },
  {
    expectedPosition: 'sitting',
    key: 'tandem_gait',
    label: 'Tandem gait',
    patterns: [/(tandem|일자로.*걷|일자.*보행).*(검사|확인|해보|보겠|볼게)?/i],
  },
  {
    expectedPosition: 'sitting',
    key: 'gait_exam',
    label: '보행검사',
    patterns: [/(보행검사|걸어보|걸음걸이).*(검사|확인|해보|보겠|볼게)?/i],
  },
  {
    expectedPosition: 'sitting',
    key: 'extremity_neuro_exam',
    label: '팔다리 감각/운동 검사',
    patterns: [
      /(팔다리|사지).*(감각.*운동|운동.*감각).*(확인|검사|보겠|볼게)?/i,
    ],
  },
  {
    expectedPosition: 'sitting',
    key: 'head_inspection_palpation',
    label: '두부 시진/촉진',
    patterns: [
      /(두부|머리).*(시진|촉진|확인|살펴|보겠|볼게|만져)/i,
      /외상.*(시진|촉진|확인|살펴|보겠|볼게)/i,
    ],
  },
  {
    expectedPosition: 'sitting',
    key: 'oral_tongue_exam',
    label: '구강·혀 검사',
    patterns: [
      /(입|구강|혀).*(검사|확인|살펴|보겠|볼게)/i,
      /혀.*(깨문|탈수).*(확인|살펴|보겠|볼게)/i,
    ],
  },
  {
    expectedPosition: 'sitting',
    key: 'skin_inspection',
    label: '피부 시진',
    patterns: [/피부.*(시진|검사|확인|살펴|보겠|볼게)/i],
  },
  {
    expectedPosition: 'sitting',
    key: 'cranial_nerve_exam',
    label: '뇌신경검사',
    patterns: [/(뇌신경).*(검사|확인|보겠|볼게)/i],
  },
  {
    expectedPosition: 'sitting',
    key: 'cerebellar_exam',
    label: '소뇌기능검사',
    patterns: [/(소뇌).*(검사|확인|해보|보겠|볼게)?/i],
  },
  {
    expectedPosition: 'supine',
    key: 'motor_exam',
    label: '운동검사',
    patterns: [
      /(운동검사|근력|사지.?근력|motor).*(검사|확인|보겠|볼게|줘보|주세요)?/i,
      /(팔|다리|팔다리).*(힘).*(줘보|주세요|확인|검사)/i,
    ],
  },
  {
    expectedPosition: 'supine',
    key: 'sensory_exam',
    label: '감각검사',
    patterns: [
      /(감각검사|사지.?감각|sensory).*(검사|확인|보겠|볼게)?/i,
      /(만지|찔렀|건드).*(느껴|느끼|아세요|확인)/i,
    ],
  },
  {
    expectedPosition: 'supine',
    key: 'dtr_exam',
    label: '심부건반사(DTR)',
    patterns: [
      /(심부건|DTR|무릎.?반사|아킬레스.?반사).*(검사|확인|보겠|볼게)?/i,
    ],
  },
  {
    expectedPosition: 'supine',
    key: 'neck_stiffness',
    label: '경부강직',
    patterns: [/(경부강직|목.*뻣뻣|목.*굳).*(검사|확인|보겠|볼게)?/i],
  },
  {
    expectedPosition: 'supine',
    key: 'kernig_sign',
    label: 'Kernig',
    patterns: [
      /(kernig|커니그).*(검사|징후|확인|보겠|볼게)?/i,
      /(다리.*(들|올리).*(무릎.*굽).*(펴|피)|무릎.*굽.*(펴|피)|다리\s*뒤쪽.*통증)/i,
    ],
  },
  {
    expectedPosition: 'supine',
    key: 'brudzinski_sign',
    label: 'Brudzinski',
    patterns: [
      /(brudzinski|브루진스키).*(검사|징후|확인|보겠|볼게)?/i,
      /목.*(앞으로|천천히).*(숙|굽).*(허리|고관절|무릎|반사)/i,
    ],
  },
  {
    expectedPosition: 'supine',
    key: 'meningeal_sign',
    label: '수막자극징후',
    patterns: [/(수막.?자극|뇌막.?자극).*(검사|징후|확인|보겠|볼게)?/i],
  },
];

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);
  private readonly patientFacts = new PatientFactCache();

  constructor(
    private readonly prisma: PrismaService,
    private readonly casesService: CasesService,
    private readonly llmService: LlmService,
    private readonly patientResponseService: PatientResponseService,
    private readonly caseFactRetriever: CaseFactRetrieverService,
    private readonly evaluationCriteriaService: EvaluationCriteriaService,
    private readonly simulationRagRetriever: SimulationRagRetrieverService,
    private readonly configService: ConfigService,
    @Optional() private readonly patientPipeline?: PatientPipelineService,
    @Optional() private readonly costs?: ApiCostService,
  ) {}

  async create(createSessionDto: CreateSessionDto) {
    const cpxCase = await this.casesService.findOneInternal(
      createSessionDto.caseId,
    );

    const session = await this.prisma.session.create({
      data: {
        caseId: cpxCase.id,
        messages: {
          create: {
            role: MessageRole.assistant,
            content: INITIAL_PATIENT_GREETING,
          },
        },
      },
      include: this.sessionInclude(),
    });

    return { session };
  }

  async findOne(sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: this.sessionInclude(),
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return { session };
  }

  async createMessage(sessionId: string, dto: CreateMessageDto) {
    const content = dto.content.trim();
    if (!content) throw new BadRequestException('질문을 입력해 주세요.');
    const requestId = dto.requestId ?? randomUUID();
    const work = () => this.prisma.withSessionLock(sessionId, async () => {
      try {
        return await this.createMessageLocked(sessionId, {
          ...dto,
          content,
          requestId,
        });
      } catch (error) {
        if (
          !(error instanceof ConflictException) &&
          !(error instanceof NotFoundException)
        ) {
          try {
            await this.prisma.sessionMessageRequest.updateMany({
              where: {
                sessionId,
                requestId,
                response: { equals: Prisma.DbNull },
              },
              data: {
                processing: {
                  status: 'failed',
                  issues: [{ stage: 'turn', code: 'turn_processing_failed' }],
                },
              },
            });
          } catch {
            this.logger.warn(
              JSON.stringify({
                event: 'patient.failure.recording_failed',
                sessionId,
                requestId,
              }),
            );
          }
        }
        throw error;
      }
    });
    return this.costs ? this.costs.context({ sessionId, requestId }, work) : work();
  }

  private async createMessageLocked(sessionId: string, dto: CreateMessageDto) {
    const started = Date.now();
    const requestId = dto.requestId ?? randomUUID();
    const userQuestion = dto.content;
    const patientPosition = dto.patientPosition ?? 'sitting';
    const inputHash = createHash('sha256')
      .update(JSON.stringify([userQuestion, patientPosition]))
      .digest('hex');
    const key = { sessionId_requestId: { sessionId, requestId } };
    let receipt = await this.prisma.sessionMessageRequest.findUnique({
      where: key,
    });
    if (receipt && receipt.inputHash !== inputHash)
      throw new ConflictException('같은 요청 ID의 질문 내용이 변경되었습니다.');
    if (receipt?.response) return receipt.response;

    const session = await this.getSessionForWork(sessionId);
    if (session.status === SessionStatus.completed)
      throw new ConflictException('Cannot add messages to a completed session');
    if (!receipt) {
      receipt = await this.prisma.$transaction(async (tx) => {
        const user = await tx.message.create({
          data: { sessionId, role: MessageRole.user, content: userQuestion },
        });
        return tx.sessionMessageRequest.create({
          data: { sessionId, requestId, inputHash, userMessageId: user.id },
        });
      });
    }
    // Exclude this request even on retry. Keep the student's original utterance for evaluation.
    const history = (
      await this.prisma.message.findMany({
        where: { sessionId, id: { not: receipt.userMessageId } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { role: true, content: true },
      })
    ).reverse();
    const previousQuestion = history
      .filter((m) => m.role === MessageRole.user)
      .at(-1)?.content;
    if (
      session.case.simulationCaseId &&
      this.patientPipeline &&
      this.configService.get<string>('PATIENT_PIPELINE_V2') !== 'false'
    ) {
      return this.createEvidenceMessage(session, dto, key, started);
    }
    const questions = await this.patientResponseService.resolveQuestions(
      analyzePatientQuestions(userQuestion, previousQuestion),
      previousQuestion,
      { sessionId, requestId },
    );
    const persona = (session.case.patientProfile ?? {}) as PatientPersona;
    let facts: PatientFact[];
    try {
      facts = this.patientFacts.get(
        session.caseId,
        session.case.patientPrompt,
        persona,
        session.case.chiefComplaint,
        !!session.case.simulationCaseId,
      );
    } catch {
      throw new BadGatewayException(
        '증례 정보를 읽지 못했습니다. 증례 설정을 확인한 뒤 다시 시도해 주세요.',
      );
    }
    const answers: PatientAnswer[] = [];
    const legacyFacts: PatientFact[] = [];
    for (const question of questions) {
      let selected = ['history', 'identity'].includes(question.kind)
        ? selectPatientFacts(question, facts, persona)
        : [];
      // Structured cases do not depend on vectors. Old prose cases use tightly scoped, high-confidence retrieval.
      if (
        !session.case.simulationCaseId &&
        question.kind === 'history' &&
        !selected.length
      ) {
        const retrieval = await this.caseFactRetriever.retrieve({
          caseId: session.caseId,
          question: question.text,
          questionIntent: question,
        });
        if (!retrieval.isFallback) {
          selected =
            retrieval.patientFacts ??
            projectLegacyFacts(question, retrieval.facts);
          legacyFacts.push(...selected);
        }
      }
      answers.push({ question, facts: selected });
    }
    const patientReply = await this.patientResponseService.generateReply({
      patientPersona: persona,
      answers,
      allowedFacts: [...facts, ...legacyFacts],
    });
    const examClauses = questions
      .filter((q) => q.kind === 'exam')
      .map((q) => q.text);
    const physicalExamMatches = [
      ...new Map(
        examClauses
          .flatMap((text) => this.matchPhysicalExamIntents(text))
          .map((exam) => [exam.key, exam]),
      ).values(),
    ];
    const messageCount = await this.prisma.message.count({
      where: { sessionId, role: MessageRole.user },
    });
    const debug = {
      questions: answers.map(({ question, facts: selected }) => ({
        ...question,
        factIds: selected.map((f) => f.id),
        result: selected.length
          ? 'known'
          : ['history', 'identity'].includes(question.kind)
            ? 'unknown'
            : question.kind,
      })),
      retrievalSource: session.case.simulationCaseId
        ? 'structured_case_cache'
        : 'caseFact',
      validation: 'passed',
      elapsedMs: Date.now() - started,
    };
    const response = await this.prisma.$transaction(async (tx) => {
      const physicalExamEvents: PhysicalExamEvent[] = [];
      for (const match of physicalExamMatches) {
        const finding = this.buildPhysicalExamFinding(
          session.case.slug,
          session.case.patientPrompt,
          match,
        );
        physicalExamEvents.push(
          await tx.physicalExamEvent.create({
            data: {
              sessionId,
              examKey: match.key,
              expectedPosition: match.expectedPosition,
              label: match.label,
              matchedText: examClauses.join(' / '),
              messageCount,
              position: patientPosition,
              result: finding.result,
              status: finding.status,
            },
          }),
        );
      }
      const message = await tx.message.create({
        data: { sessionId, role: MessageRole.assistant, content: patientReply },
      });
      const result = {
        message,
        physicalExamEvents,
        ...(this.configService.get<string>('ENABLE_RAG_DEBUG') === 'true' ||
        this.isConversationDebugEnabled()
          ? { debug }
          : {}),
      };
      await tx.sessionMessageRequest.update({
        where: key,
        data: { response: JSON.parse(JSON.stringify(result)) },
      });
      return result;
    });
    this.logger.log(
      JSON.stringify({
        event: 'patient.reply.validated',
        sessionId,
        requestId,
        caseId: session.caseId,
        questionCount: questions.length,
        selectedFactIds: answers.flatMap((a) => a.facts.map((f) => f.id)),
        unknownCount: debug.questions.filter((q) => q.result === 'unknown')
          .length,
        elapsedMs: Date.now() - started,
        generationTokens: 0,
      }),
    );
    this.debugConversation('patient.turn', {
      sessionId,
      requestId,
      originalQuestion: userQuestion,
      ...debug,
      reply: patientReply,
    });
    return response;
  }

  private async createEvidenceMessage(
    session: Awaited<ReturnType<SessionsService['getSessionForWork']>>,
    dto: CreateMessageDto,
    key: { sessionId_requestId: { sessionId: string; requestId: string } },
    started: number,
  ) {
    const turn = await this.patientPipeline!.turn({
      caseId: session.caseId,
      patientPrompt: session.case.patientPrompt,
      persona: session.case.patientProfile as PatientPersona,
      chiefComplaint: session.case.chiefComplaint,
      content: dto.content,
      state: session.dialogueState,
      requestId: key.sessionId_requestId.requestId,
    });
    const examFrames = turn.frames.filter(
      (f) => f.speechAct === 'perform_exam' && f.subjectId === 'patient',
    );
    const matches = [
      ...new Map(
        examFrames.flatMap((frame) =>
          this.matchPhysicalExamIntents(frame.text).map(
            (exam) => [exam.key, { exam, frame }] as const,
          ),
        ),
      ).values(),
    ];
    const messageCount = await this.prisma.message.count({
      where: { sessionId: session.id, role: MessageRole.user },
    });
    const result = await this.prisma.$transaction(async (tx) => {
      const physicalExamEvents: PhysicalExamEvent[] = [];
      for (const { exam, frame } of matches) {
        const finding = this.buildPhysicalExamFinding(
          session.case.slug,
          session.case.patientPrompt,
          exam,
        );
        physicalExamEvents.push(
          await tx.physicalExamEvent.create({
            data: {
              sessionId: session.id,
              examKey: exam.key,
              expectedPosition: exam.expectedPosition,
              label: exam.label,
              matchedText: frame.text,
              messageCount,
              position: dto.patientPosition ?? 'sitting',
              result: finding.result,
              status: finding.status,
              execution: getPhysicalExamCriteriaForCase(session.case.slug).physicalExamPerformed ? 'performed' : 'attempted',
              resultAvailability:
                finding.status === 'unavailable' ? 'not_provided' : 'available',
              details: {
                subject: 'patient',
                bodyRegion: /facial/.test(exam.key)
                  ? 'face'
                  : /motor_exam|sensory_exam|dtr_exam|extremity/.test(exam.key)
                    ? 'limbs'
                    : /conjunctiva|sclera|eye|pupil|visual|extraocular/.test(
                          exam.key,
                        )
                      ? 'eyes'
                      : /neck|kernig|brudzinski|meningeal/.test(exam.key)
                        ? 'neck'
                        : /head/.test(exam.key)
                          ? 'head'
                          : 'general',
                originalSpan: frame.originalSpan,
                execution: getPhysicalExamCriteriaForCase(session.case.slug).physicalExamPerformed ? 'now' : 'attempted',
              },
            },
          }),
        );
      }
      const message = await tx.message.create({
        data: {
          sessionId: session.id,
          role: MessageRole.assistant,
          content: turn.reply,
        },
      });
      await tx.session.update({
        where: { id: session.id },
        data: { dialogueState: JSON.parse(JSON.stringify(turn.state)) },
      });
      const response = {
        message,
        physicalExamEvents,
        processing: {
          status: turn.processing.status,
          mode:
            this.configService.get<string>('PATIENT_AI_ENABLED') === 'true'
              ? 'model_enabled'
              : 'offline',
        },
        ...(this.isConversationDebugEnabled() ||
        this.configService.get<string>('ENABLE_RAG_DEBUG') === 'true'
          ? {
              debug: {
                ...turn.processing,
                retrieval: turn.trace,
                questions: turn.answers.map((a) => ({
                  ...a.frame,
                  result: a.status,
                  factIds: a.facts.map((f) => f.id),
                })),
                elapsedMs: Date.now() - started,
              },
            }
          : {}),
      };
      await tx.sessionMessageRequest.update({
        where: key,
        data: {
          response: JSON.parse(JSON.stringify(response)),
          processing: JSON.parse(
            JSON.stringify({
              ...turn.processing,
              frames: turn.frames,
              selectedFactIds: turn.answers.flatMap((a) =>
                a.facts.map((f) => f.id),
              ),
            }),
          ),
        },
      });
      return response;
    });
    this.logger.log(
      JSON.stringify({
        event: 'patient.evidence.reply',
        sessionId: session.id,
        requestId: dto.requestId,
        ...turn.processing,
        retrieval: turn.trace,
        elapsedMs: Date.now() - started,
      }),
    );
    return result;
  }
  async recordHandHygiene(
    sessionId: string,
    input?: { label?: string; phase?: string },
  ) {
    const session = await this.getSessionForWork(sessionId);

    if (session.status === SessionStatus.completed) {
      throw new ConflictException(
        'Cannot record hand hygiene for a completed session',
      );
    }

    const phase = this.normalizeHandHygienePhase(input?.phase);
    const label = this.handHygienePhaseLabel(phase, input?.label);
    const messageCount = await this.prisma.message.count({
      where: {
        sessionId,
        role: MessageRole.user,
      },
    });

    const { handHygieneEvent, updatedSession } = await this.prisma.$transaction(
      async (tx) => {
        const createdEvent = await tx.handHygieneEvent.create({
          data: {
            sessionId,
            phase,
            label,
            messageCount,
          },
        });

        const nextSession = await tx.session.update({
          where: { id: sessionId },
          data: {
            handHygieneCount: {
              increment: 1,
            },
          },
          include: this.sessionInclude(),
        });

        return {
          handHygieneEvent: createdEvent,
          updatedSession: nextSession,
        };
      },
    );

    const handHygieneEvents = await this.prisma.handHygieneEvent.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        phase: true,
        label: true,
        messageCount: true,
        createdAt: true,
      },
    });

    const sessionWithEvents = {
      ...updatedSession,
      handHygieneEvents,
    };

    this.logger.log(
      JSON.stringify({
        event: 'clinicalAction.handHygiene.recorded',
        sessionId,
        caseId: updatedSession.caseId,
        handHygieneCount: updatedSession.handHygieneCount,
        handHygieneEvent: {
          id: handHygieneEvent.id,
          label: handHygieneEvent.label,
          messageCount: handHygieneEvent.messageCount,
          phase: handHygieneEvent.phase,
        },
      }),
    );

    return {
      handHygieneCount: updatedSession.handHygieneCount,
      handHygieneEvent,
      session: sessionWithEvents,
    };
  }

  async evaluate(sessionId: string) {
    const work = () => this.prisma.withSessionLock(sessionId, () =>
      this.evaluateLocked(sessionId),
    );
    return this.costs ? this.costs.context({ sessionId, requestId: 'evaluation' }, work) : work();
  }

  private async evaluateLocked(sessionId: string) {
    const session = await this.getSessionForWork(sessionId);

    if (session.evaluation) {
      return { evaluation: session.evaluation };
    }
    if (this.configService.get<string>('PATIENT_AI_ENABLED') !== 'true')
      throw new ServiceUnavailableException({
        code: 'evaluation_unavailable',
        message:
          '현재 자동 평가가 비활성화되어 있습니다. 문진 기록은 저장되며, API 사용이 가능해진 뒤 평가할 수 있습니다.',
      });
    const messageRequests = await this.prisma.sessionMessageRequest.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      select: {
        requestId: true,
        userMessageId: true,
        response: true,
        processing: true,
      },
    });
    const unresolved = unresolvedProcessingRequests(messageRequests);
    if (unresolved.length)
      throw new ConflictException({
        code: 'evaluation_blocked_by_system_error',
        unresolvedRequestIds: unresolved,
        message:
          '질문 해석 또는 응답 처리에 실패한 요청이 있어 자동 평가를 보류했습니다. 실패한 요청을 확인한 뒤 평가해 주세요.',
      });

    const messages = await this.prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true },
    });
    const handHygieneEvents = await this.prisma.handHygieneEvent.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      select: {
        phase: true,
        label: true,
        messageCount: true,
        createdAt: true,
      },
    });
    const physicalExamEvents = await this.prisma.physicalExamEvent.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      select: {
        createdAt: true,
        examKey: true,
        expectedPosition: true,
        label: true,
        matchedText: true,
        messageCount: true,
        position: true,
        result: true,
        status: true,
        execution: true,
        resultAvailability: true,
      },
    });

    const criteriaPack = this.evaluationCriteriaService.buildCriteriaPack(
      session.case,
    );

    this.logger.log(
      JSON.stringify({
        sessionId,
        caseId: session.caseId,
        evaluationModule: criteriaPack?.selectedModule.moduleId ?? null,
        evaluationModuleTitle: criteriaPack?.selectedModule.title ?? null,
      }),
    );

    const evaluation = await this.llmService.evaluateConversation(
      session.case,
      messages,
      criteriaPack,
      {
        processingRecords: messageRequests.map((r) => ({
          requestId: r.requestId,
          userMessageId: r.userMessageId,
          processing: r.processing,
        })),
        expectedPhysicalExamChecklist: getPhysicalExamCriteriaForCase(
          session.case.slug,
        ).items,
        handHygieneCount: session.handHygieneCount,
        handHygieneEvents: handHygieneEvents.map((event) => ({
          createdAt: event.createdAt.toISOString(),
          label: event.label,
          messageCount: event.messageCount,
          phase: event.phase,
        })),
        physicalExamEvents: physicalExamEvents.map((event) => ({
          createdAt: event.createdAt.toISOString(),
          examKey: event.examKey,
          expectedPosition: event.expectedPosition,
          label: event.label,
          matchedText: event.matchedText,
          messageCount: event.messageCount,
          position: event.position,
          result: event.result,
          status: event.status,
          execution: event.execution,
          resultAvailability: event.resultAvailability,
        })),
      },
    );

    const savedEvaluation = await this.prisma.$transaction(async (tx) => {
      const createdEvaluation = await tx.evaluation.create({
        data: {
          sessionId,
          score: evaluation.score,
          provenance: {
            pipelineVersion: PIPELINE_VERSION,
            criteriaHash: hashContent(criteriaPack),
            caseSourceHash: hashContent(session.case.patientPrompt),
            dialogueState: session.dialogueState ?? null,
            inputHash: hashContent([
              messages,
              physicalExamEvents,
              messageRequests.map((r) => r.processing),
            ]),
            model: this.configService.get<string>('PATIENT_EVALUATION_MODEL') ?? this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-5.5',
            scoringPolicy: 'model_provisional',
          },
          strengths: evaluation.strengths,
          missedItems: evaluation.missedItems,
          missedItemStatus: evaluation.missedItemStatus,
          riskAssessment: evaluation.riskAssessment,
          suggestions: evaluation.suggestions,
          caseInstructionStatus: evaluation.caseInstructionStatus,
          patientEducationStatus: evaluation.patientEducationStatus,
          handHygieneCount: session.handHygieneCount,
          handHygieneMoments: handHygieneEvents.map((event) => ({
            createdAt: event.createdAt.toISOString(),
            label: event.label,
            messageCount: event.messageCount,
            phase: event.phase,
          })),
          physicalExamFindings: physicalExamEvents.map((event) => ({
            createdAt: event.createdAt.toISOString(),
            examKey: event.examKey,
            expectedPosition: event.expectedPosition,
            label: event.label,
            matchedText: event.matchedText,
            messageCount: event.messageCount,
            position: event.position,
            result: event.result,
            status: event.status,
            execution: event.execution,
            resultAvailability: event.resultAvailability,
          })),
        },
      });

      await tx.session.update({
        where: { id: sessionId },
        data: {
          status: SessionStatus.completed,
          endedAt: new Date(),
        },
      });

      return createdEvaluation;
    });

    return { evaluation: savedEvaluation };
  }

  private async getSessionForWork(sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        case: true,
        evaluation: true,
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return session;
  }

  private sessionInclude() {
    return {
      case: {
        select: {
          id: true,
          slug: true,
          title: true,
          chiefComplaint: true,
          difficulty: true,
          simulationCaseId: true,
          simulationTopicId: true,
          evaluationModuleId: true,
          patientProfile: true,
          openingStatement: true,
        },
      },
      messages: {
        orderBy: { createdAt: 'asc' as const },
      },
      handHygieneEvents: {
        orderBy: { createdAt: 'asc' as const },
      },
      physicalExamEvents: {
        orderBy: { createdAt: 'asc' as const },
      },
      evaluation: true,
    };
  }

  private isConversationDebugEnabled() {
    return (
      this.configService.get<string>('ENABLE_CONVERSATION_DEBUG') === 'true'
    );
  }

  private debugConversation(event: string, payload: Record<string, unknown>) {
    if (!this.isConversationDebugEnabled()) return;

    this.logger.log(JSON.stringify({ event, ...payload }));
  }

  private preview(value: string | null | undefined, maxLength = 120) {
    if (!value) return '';

    return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
  }

  private normalizeHandHygienePhase(phase?: string) {
    if (phase && HAND_HYGIENE_PHASES.has(phase)) {
      return phase;
    }

    return 'during_interview';
  }

  private handHygienePhaseLabel(phase: string, label?: string) {
    if (label?.trim()) {
      return label.trim();
    }

    if (phase === 'initial_greeting') {
      return '환자 맞이 전 손소독';
    }

    if (phase === 'before_patient_contact') {
      return '환자 접촉 전 손소독';
    }

    return '문진 중 손소독';
  }

  private matchPhysicalExamIntents(text: string) {
    const normalized = text.trim();
    const matches = PHYSICAL_EXAM_DEFINITIONS.filter((definition) => {
      if (
        /얼굴|안면/.test(normalized) &&
        !/팔다리|사지|상지|하지/.test(normalized) &&
        /extremity|motor_exam|sensory_exam|dtr_exam/.test(definition.key)
      )
        return false;
      return definition.patterns.some((pattern) => pattern.test(normalized));
    });

    return matches.length > 0 ? matches : [];
  }

  private buildPhysicalExamFinding(
    caseSlug: string,
    patientPrompt: string,
    definition: PhysicalExamDefinition,
  ) {
    const criteria = getPhysicalExamCriteriaForCase(caseSlug);
    const caseItems = getPhysicalExamCriteriaItemsForEventKey(
      caseSlug,
      definition.key,
    );

    if (caseItems.length > 0) {
      const status = caseItems.some((item) => item.status === 'abnormal')
        ? 'abnormal'
        : caseItems.some((item) => item.status === 'unclear')
          ? 'unclear'
          : 'normal';

      return {
        result: caseItems
          .map((item) => `${item.label}: ${item.result}`)
          .join(' / '),
        status: normalizePhysicalExamStatus(status),
      };
    }

    if (criteria.items.length > 0 || !criteria.physicalExamPerformed) {
      return {
        result:
          '이 증례 자료에는 해당 신체진찰 결과가 제시되어 있지 않습니다. 케이스별로 필요한 진찰 항목을 우선 확인하세요.',
        status: 'unavailable',
      };
    }

    const sourceText = patientPrompt.toLowerCase();

    if (
      /신체진찰.?시행"?\s*:\s*false/i.test(patientPrompt) ||
      /신체\s*진찰은\s*시행하지\s*않음|아이가\s*밖에\s*있어/i.test(
        patientPrompt,
      )
    ) {
      return {
        result:
          '현재 시나리오에서는 해당 신체진찰 결과가 제공되지 않습니다. 가능한 병력 청취와 보호자 문진을 이어가세요.',
        status: 'unavailable',
      };
    }

    const abnormal = this.isAbnormalPhysicalExam(sourceText, definition.key);
    const result = abnormal
      ? this.abnormalPhysicalExamResult(definition.key, definition.label)
      : this.normalPhysicalExamResult(definition.key, definition.label);

    return {
      result,
      status: abnormal ? 'abnormal' : 'normal',
    };
  }

  private isAbnormalPhysicalExam(sourceText: string, examKey: string) {
    if (examKey === 'head_inspection_palpation') {
      return /두부\s*외상\s*흔적|외상\s*흔적/.test(sourceText);
    }

    if (
      [
        'neck_stiffness',
        'kernig_sign',
        'brudzinski_sign',
        'meningeal_sign',
      ].includes(examKey)
    ) {
      return /수막자극징후\s*있음|수막자극징후"?\s*:\s*true|뇌막\s*자극\s*징후|경부강직"?\s*[:：]\s*true|kernig"?\s*[:：]\s*true|brudzinski"?\s*[:：]\s*true|목이\s*뻣뻣/.test(
        sourceText,
      );
    }

    return false;
  }

  private normalPhysicalExamResult(examKey: string, label: string) {
    const results: Record<string, string> = {
      brudzinski_sign: 'Brudzinski 징후는 음성입니다.',
      cerebellar_exam:
        'Finger-to-nose, 빠른 교대운동, 보행/균형 검사에서 뚜렷한 이상 소견은 없습니다.',
      cranial_nerve_exam:
        '동공반사, 안구운동, 얼굴 감각과 얼굴 운동에서 뚜렷한 이상 소견은 없습니다.',
      dtr_exam: '심부건반사는 양측 대칭이며 병적 반사는 관찰되지 않습니다.',
      head_inspection_palpation:
        '두부 시진과 촉진에서 외상 흔적이나 압통은 뚜렷하지 않습니다.',
      kernig_sign: 'Kernig 징후는 음성입니다.',
      meningeal_sign:
        '경부강직, Kernig, Brudzinski 등 수막자극징후는 음성입니다.',
      motor_exam: '양측 상하지 근력 저하는 관찰되지 않습니다.',
      neck_stiffness: '경부강직은 관찰되지 않습니다.',
      oral_tongue_exam:
        '구강과 혀에서 혀 깨문 흔적이나 뚜렷한 탈수 소견은 없습니다.',
      sensory_exam: '양측 상하지 감각 저하는 관찰되지 않습니다.',
      skin_inspection:
        '피부 시진에서 발진, 청색증, 외상 소견은 뚜렷하지 않습니다.',
    };

    return results[examKey] ?? `${label}에서 뚜렷한 이상 소견은 없습니다.`;
  }

  private abnormalPhysicalExamResult(examKey: string, label: string) {
    const results: Record<string, string> = {
      brudzinski_sign: 'Brudzinski 징후가 양성으로 의심됩니다.',
      head_inspection_palpation: '두부 외상 흔적이 관찰됩니다.',
      kernig_sign: 'Kernig 징후가 양성으로 의심됩니다.',
      meningeal_sign:
        '수막자극징후가 관찰됩니다. 경부강직 및 Kernig/Brudzinski 징후 확인이 필요합니다.',
      neck_stiffness: '목이 뻣뻣한 경부강직 소견이 관찰됩니다.',
    };

    return results[examKey] ?? `${label}에서 비정상 소견이 관찰됩니다.`;
  }
}
