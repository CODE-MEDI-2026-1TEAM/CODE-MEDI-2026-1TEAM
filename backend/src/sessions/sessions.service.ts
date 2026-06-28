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
            content: cpxCase.openingStatement,
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
        sessionId,
        caseId,
        question: userQuestion.slice(0, 50),
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

    const patientProfile = session.case.patientProfile as {
      tone?: string;
    } | null;

    const patientReply = await this.patientResponseService.generateReply({
      patientPersona: { tone: patientProfile?.tone ?? '불안하지만 협조적' },
      chiefComplaint: session.case.chiefComplaint,
      recentConversation: recentConversation.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      userQuestion,
      allowedFacts: retrieval.facts.map((f) => ({
        category: f.category,
        answer: f.answer,
      })),
      isFallback: retrieval.isFallback,
      fallbackType: retrieval.fallbackType,
      patientPrompt:
        retrieval.fallbackType === 'OUT_OF_SCOPE'
          ? session.case.patientPrompt
          : undefined,
    });

    const assistantMessage = await this.prisma.message.create({
      data: {
        sessionId,
        role: MessageRole.assistant,
        content: patientReply,
      },
    });

    const isDebugEnabled =
      this.configService.get<string>('ENABLE_RAG_DEBUG') === 'true';

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
      };
    }

    return response;
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
      evaluation: true,
    };
  }
}
