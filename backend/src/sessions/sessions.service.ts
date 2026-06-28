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
}
