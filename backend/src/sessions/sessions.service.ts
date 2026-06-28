import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageRole, SessionStatus } from '@prisma/client';
import { CasesService } from '../cases/cases.service';
import { LlmService } from '../llm/llm.service';
import { PatientResponseService } from '../llm/patient-response.service';
import { PrismaService } from '../prisma/prisma.service';
import { CaseFactRetrieverService } from '../rag/case-fact-retriever.service';
import { EvaluationCriteriaService } from '../rag/evaluation-criteria.service';
import { SimulationRagRetrieverService } from '../rag/simulation-rag-retriever.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { CreateSessionDto } from './dto/create-session.dto';

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
    patterns: [
      /(뇌신경|동공|안구.?운동|시야|얼굴.?감각|얼굴.?운동|light reflex).*(검사|확인|보겠|볼게)/i,
      /눈.*움직.*(검사|확인|보겠|볼게)/i,
    ],
  },
  {
    expectedPosition: 'sitting',
    key: 'cerebellar_exam',
    label: '소뇌기능검사',
    patterns: [
      /(소뇌|finger.?to.?nose|rapid alternating|tandem).*(검사|확인|해보|보겠|볼게)?/i,
      /(손가락.*코|코.*찍|일자로.*걸|균형|보행검사).*(검사|확인|해보|보겠|볼게)?/i,
    ],
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
    patterns: [
      /(경부강직|목.*뻣뻣|목.*굳).*(검사|확인|보겠|볼게)?/i,
    ],
  },
  {
    expectedPosition: 'supine',
    key: 'kernig_sign',
    label: 'Kernig',
    patterns: [/(kernig|커니그).*(검사|징후|확인|보겠|볼게)?/i],
  },
  {
    expectedPosition: 'supine',
    key: 'brudzinski_sign',
    label: 'Brudzinski',
    patterns: [/(brudzinski|브루진스키).*(검사|징후|확인|보겠|볼게)?/i],
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly casesService: CasesService,
    private readonly llmService: LlmService,
    private readonly patientResponseService: PatientResponseService,
    private readonly caseFactRetriever: CaseFactRetrieverService,
    private readonly evaluationCriteriaService: EvaluationCriteriaService,
    private readonly simulationRagRetriever: SimulationRagRetrieverService,
    private readonly configService: ConfigService,
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

  async createMessage(sessionId: string, createMessageDto: CreateMessageDto) {
    const session = await this.getSessionForWork(sessionId);

    if (session.status === SessionStatus.completed) {
      throw new ConflictException('Cannot add messages to a completed session');
    }

    const userQuestion = createMessageDto.content.trim();
    const caseId = session.caseId;
    const isConversationDebugEnabled = this.isConversationDebugEnabled();

    this.debugConversation('message.received', {
      sessionId,
      caseId,
      caseSlug: session.case.slug,
      simulationCaseId: session.case.simulationCaseId,
      rawContent: createMessageDto.content,
      trimmedQuestion: userQuestion,
      questionLength: userQuestion.length,
    });

    await this.prisma.message.create({
      data: {
        sessionId,
        role: MessageRole.user,
        content: userQuestion,
      },
    });

    const patientPosition = createMessageDto.patientPosition ?? 'sitting';
    const physicalExamMatches = this.matchPhysicalExamIntents(userQuestion);
    if (physicalExamMatches.length > 0) {
      const messageCount = await this.prisma.message.count({
        where: {
          sessionId,
          role: MessageRole.user,
        },
      });
      const physicalExamEvents = await this.prisma.$transaction((tx) =>
        Promise.all(
          physicalExamMatches.map((match) => {
            const finding = this.buildPhysicalExamFinding(
              session.case.patientPrompt,
              match,
            );

            return tx.physicalExamEvent.create({
              data: {
                sessionId,
                examKey: match.key,
                expectedPosition: match.expectedPosition,
                label: match.label,
                matchedText: userQuestion,
                messageCount,
                position: patientPosition,
                result: finding.result,
                status: finding.status,
              },
            });
          }),
        ),
      );
      const updatedSession = await this.prisma.session.findUnique({
        where: { id: sessionId },
        include: this.sessionInclude(),
      });

      this.logger.log(
        JSON.stringify({
          event: 'clinicalAction.physicalExam.recorded',
          sessionId,
          caseId,
          patientPosition,
          exams: physicalExamEvents.map((event) => ({
            examKey: event.examKey,
            expectedPosition: event.expectedPosition,
            label: event.label,
            status: event.status,
          })),
        }),
      );

      return {
        physicalExamEvents,
        session: updatedSession,
      };
    }

    const recentConversation = await this.prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true },
      take: 20,
    });

    const simulationCaseId = session.case.simulationCaseId;

    const lastAssistantContent = recentConversation
      .filter((m) => m.role === 'assistant')
      .slice(-1)[0]?.content;
    const conversationContext = lastAssistantContent
      ? lastAssistantContent.slice(0, 80)
      : undefined;

    const simulationRetrieval = simulationCaseId
      ? await this.simulationRagRetriever.retrieve({
          caseId,
          question: userQuestion,
          conversationContext,
        })
      : null;
    const retrieval =
      simulationRetrieval?.hasSimulationChunks === true
        ? simulationRetrieval
        : await this.caseFactRetriever.retrieve({
            caseId,
            question: userQuestion,
          });
    const retrievalSource =
      simulationRetrieval?.hasSimulationChunks === true
        ? 'simulationRAG'
        : 'caseFact';

    this.logger.log(
      JSON.stringify({
        event: 'rag.retrieval.summary',
        sessionId,
        caseId,
        caseSlug: session.case.slug,
        simulationCaseId,
        questionPreview: this.preview(userQuestion),
        retrievedFactIds: retrieval.facts.map((f) => f.id),
        retrievalScores: retrieval.facts.map((f) => ({
          id: f.id,
          finalScore: f.finalScore,
        })),
        isFallback: retrieval.isFallback,
        fallbackType: retrieval.fallbackType ?? null,
        retrievalSource,
      }),
    );

    this.debugConversation('rag.retrieval.detail', {
      sessionId,
      caseId,
      caseSlug: session.case.slug,
      simulationCaseId,
      question: userQuestion,
      conversationContext,
      retrievalSource,
      hasSimulationChunks: simulationRetrieval?.hasSimulationChunks ?? null,
      isFallback: retrieval.isFallback,
      fallbackType: retrieval.fallbackType ?? null,
      rawResults: retrieval.rawResults ?? [],
      retrievedFacts: retrieval.facts.map((f) => ({
        id: f.id,
        category: f.category,
        label: f.label,
        source: f.source,
        semanticScore: f.semanticScore,
        keywordScore: f.keywordScore,
        finalScore: f.finalScore,
        answerPreview: this.preview(f.answer, 220),
      })),
    });

    const patientProfile = session.case.patientProfile as {
      name?: string | null;
      birthDate?: string | null;
      ageRaw?: string | null;
      sex?: string | null;
      tone?: string;
      isGuardianCase?: boolean;
      guardianRole?: string | null;
      witnessPresent?: boolean;
      witnessRelation?: string | null;
    } | null;

    const patientReply = await this.patientResponseService.generateReply({
      patientPersona: {
        name: patientProfile?.name ?? null,
        birthDate: patientProfile?.birthDate ?? null,
        ageRaw: patientProfile?.ageRaw ?? null,
        sex: patientProfile?.sex ?? null,
        tone: patientProfile?.tone ?? '불안하지만 협조적',
        isGuardianCase: patientProfile?.isGuardianCase ?? false,
        guardianRole: patientProfile?.guardianRole ?? null,
        witnessPresent: patientProfile?.witnessPresent ?? true,
        witnessRelation: patientProfile?.witnessRelation ?? null,
      },
      chiefComplaint: session.case.chiefComplaint,
      recentConversation: recentConversation.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      userQuestion,
      allowedFacts: retrieval.facts.map((f) => ({
        category: f.category,
        answer: f.answer,
        source: f.source,
      })),
      isFallback: retrieval.isFallback,
      fallbackType: retrieval.fallbackType,
      patientPrompt: retrieval.isFallback
        ? session.case.patientPrompt
        : undefined,
    });

    this.debugConversation('patient.reply.generated', {
      sessionId,
      caseId,
      caseSlug: session.case.slug,
      simulationCaseId,
      question: userQuestion,
      retrievalSource,
      isFallback: retrieval.isFallback,
      fallbackType: retrieval.fallbackType ?? null,
      reply: patientReply,
      allowedFactCount: retrieval.facts.length,
    });

    const assistantMessage = await this.prisma.message.create({
      data: {
        sessionId,
        role: MessageRole.assistant,
        content: patientReply,
      },
    });

    const isDebugEnabled =
      this.configService.get<string>('ENABLE_RAG_DEBUG') === 'true' ||
      isConversationDebugEnabled;

    const response: {
      message: typeof assistantMessage;
      debug?: object;
    } = { message: assistantMessage };

    if (isDebugEnabled) {
      response.debug = {
        caseId,
        query: userQuestion,
        rawResults: retrieval.rawResults ?? [],
        retrievedFacts: retrieval.facts.map((f) => ({
          id: f.id,
          category: f.category,
          semanticScore: f.semanticScore,
          keywordScore: f.keywordScore,
          finalScore: f.finalScore,
        })),
        isFallback: retrieval.isFallback,
        fallbackType: retrieval.fallbackType ?? null,
        retrievalSource,
        assistantReply: patientReply,
      };
    }

    return response;
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

    const { handHygieneEvent, updatedSession } =
      await this.prisma.$transaction(async (tx) => {
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
      });

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
    const session = await this.getSessionForWork(sessionId);

    if (session.evaluation) {
      return { evaluation: session.evaluation };
    }

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
        })),
      },
    );

    const savedEvaluation = await this.prisma.$transaction(async (tx) => {
      const createdEvaluation = await tx.evaluation.create({
        data: {
          sessionId,
          score: evaluation.score,
          strengths: evaluation.strengths,
          missedItems: evaluation.missedItems,
          riskAssessment: evaluation.riskAssessment,
          suggestions: evaluation.suggestions,
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
    return this.configService.get<string>('ENABLE_CONVERSATION_DEBUG') === 'true';
  }

  private debugConversation(event: string, payload: Record<string, unknown>) {
    if (!this.isConversationDebugEnabled()) return;

    this.logger.log(JSON.stringify({ event, ...payload }));
  }

  private preview(value: string | null | undefined, maxLength = 120) {
    if (!value) return '';

    return value.length > maxLength
      ? `${value.slice(0, maxLength)}...`
      : value;
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
    const matches = PHYSICAL_EXAM_DEFINITIONS.filter((definition) =>
      definition.patterns.some((pattern) => pattern.test(normalized)),
    );

    return matches.length > 0 ? matches : [];
  }

  private buildPhysicalExamFinding(
    patientPrompt: string,
    definition: PhysicalExamDefinition,
  ) {
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
      ['neck_stiffness', 'kernig_sign', 'brudzinski_sign', 'meningeal_sign'].includes(
        examKey,
      )
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
      skin_inspection: '피부 시진에서 발진, 청색증, 외상 소견은 뚜렷하지 않습니다.',
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
