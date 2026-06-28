import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { EvaluationCriteriaPack } from '../rag/evaluation-criteria.service';

type ConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type CpxCaseForPrompt = {
  title: string;
  chiefComplaint: string;
  patientProfile: unknown;
  hiddenDiagnosis: string;
  checklist: unknown;
  redFlags: unknown;
  patientPrompt: string;
};

export type EvaluationItemStatus = {
  item: string;
  category?: string;
  status: 'met' | 'partial' | 'unmet';
  evidence: string[];
  feedback: string;
};

type ClinicalActionSummary = {
  handHygieneCount: number;
  handHygieneEvents?: Array<{
    createdAt: string;
    label: string;
    messageCount: number;
    phase: string;
  }>;
  physicalExamEvents?: Array<{
    createdAt: string;
    examKey: string;
    expectedPosition: string;
    label: string;
    matchedText: string;
    messageCount: number;
    position: string;
    result: string;
    status: string;
  }>;
};

export type EvaluationResult = {
  score: number;
  strengths: string[];
  missedItems: string[];
  riskAssessment: string;
  suggestions: string[];
  caseInstructionStatus: EvaluationItemStatus[];
  patientEducationStatus: EvaluationItemStatus[];
};

@Injectable()
export class LlmService {
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    this.model = this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-5.5';
  }

  async generatePatientReply(
    cpxCase: CpxCaseForPrompt,
    messages: ConversationMessage[],
  ) {
    try {
      const completion = await this.getClient().chat.completions.create({
        model: this.model,
        ...this.temperatureOptions(0.7),
        messages: [
          {
            role: 'system',
            content: this.buildPatientSystemPrompt(cpxCase),
          },
          ...messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        ],
      });

      const content = completion.choices[0]?.message?.content?.trim();
      if (!content) {
        throw new Error('Empty LLM response');
      }

      return content;
    } catch (error) {
      throw new BadGatewayException({
        message: 'Failed to generate patient response',
        detail: error instanceof Error ? error.message : 'Unknown LLM error',
      });
    }
  }

  async evaluateConversation(
    cpxCase: CpxCaseForPrompt,
    messages: ConversationMessage[],
    criteriaPack?: EvaluationCriteriaPack | null,
    clinicalActions?: ClinicalActionSummary,
  ): Promise<EvaluationResult> {
    try {
      const completion = await this.getClient().chat.completions.create({
        model: this.model,
        ...this.temperatureOptions(0.2),
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: this.buildEvaluationSystemPrompt(
              cpxCase,
              criteriaPack,
              clinicalActions,
            ),
          },
          {
            role: 'user',
            content: JSON.stringify(
              {
                clinicalActions: clinicalActions ?? {
                  handHygieneCount: 0,
                  handHygieneEvents: [],
                  physicalExamEvents: [],
                },
                conversation: messages,
              },
              null,
              2,
            ),
          },
        ],
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty evaluation response');
      }

      return this.normalizeEvaluation(
        JSON.parse(content) as Partial<EvaluationResult>,
        criteriaPack,
      );
    } catch (error) {
      throw new BadGatewayException({
        message: 'Failed to evaluate conversation',
        detail: error instanceof Error ? error.message : 'Unknown LLM error',
      });
    }
  }

  private buildPatientSystemPrompt(cpxCase: CpxCaseForPrompt) {
    return [
      'You are a standardized patient in a Korean CPX medical interview practice.',
      'Stay in patient role. Answer in natural Korean.',
      'Do not reveal the hidden diagnosis unless the student clearly explains it as their medical reasoning.',
      'Only disclose symptoms, history, medication, risk factors, and red flags when the student asks relevant questions.',
      'If the student uses difficult medical jargon, respond like a real patient who may not understand it.',
      'Keep each answer concise, usually 1-3 sentences.',
      '',
      `Case title: ${cpxCase.title}`,
      `Chief complaint: ${cpxCase.chiefComplaint}`,
      `Patient profile: ${JSON.stringify(cpxCase.patientProfile)}`,
      `Hidden diagnosis for simulation only: ${cpxCase.hiddenDiagnosis}`,
      `Red flags: ${JSON.stringify(cpxCase.redFlags)}`,
      '',
      cpxCase.patientPrompt,
    ].join('\n');
  }

  private getClient() {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!apiKey || apiKey === 'sk-your-api-key') {
      throw new BadGatewayException({
        message: 'OpenAI API key is not configured',
      });
    }

    return new OpenAI({ apiKey });
  }

  private temperatureOptions(temperature: number) {
    return this.supportsCustomTemperature() ? { temperature } : {};
  }

  private supportsCustomTemperature(): boolean {
    const normalizedModel = this.model.toLowerCase();
    return (
      !normalizedModel.startsWith('gpt-5') && !normalizedModel.startsWith('o')
    );
  }

  private buildEvaluationSystemPrompt(
    cpxCase: CpxCaseForPrompt,
    criteriaPack?: EvaluationCriteriaPack | null,
    clinicalActions?: ClinicalActionSummary,
  ) {
    const handHygieneCount = clinicalActions?.handHygieneCount ?? 0;
    const handHygieneEvents = clinicalActions?.handHygieneEvents ?? [];
    const physicalExamEvents = clinicalActions?.physicalExamEvents ?? [];
    const criteriaSection = criteriaPack
      ? [
          '',
          'Evaluation RAG criteria pack:',
          JSON.stringify(criteriaPack, null, 2),
          '',
          'Use the criteria pack as the primary evaluation reference.',
          'Case-specific checklist and red flags override general module guidance.',
          'Evaluate every item in criteriaPack.caseChecklist.instructionItems into caseInstructionStatus.',
          'Evaluate every item in criteriaPack.casePatientEducation.items into patientEducationStatus.',
          'When creating missedItems and suggestions, prefer actionable Korean feedback grounded in the criteria pack.',
          'If the student did not explicitly ask, explain, or perform something, do not mark it as completed.',
        ].join('\n')
      : [
          '',
          'No Evaluation RAG criteria pack was matched for this case.',
          'Use only the case checklist and red flags below.',
        ].join('\n');

    return [
      'You are an evaluator for Korean CPX medical interview practice.',
      'Evaluate only the student messages in the supplied conversation.',
      'Also evaluate supplied clinicalActions as actions performed in the simulation UI.',
      'Do not invent student actions or questions that are not present in the conversation.',
      'Hand hygiene scoring rule:',
      '- If clinicalActions.handHygieneCount is 0, mark missed hand hygiene as a missed item or suggestion under clinical etiquette/infection control.',
      '- If clinicalActions.handHygieneCount is 1-2, recognize it as partially performed. Award credit only when the timing is clinically appropriate.',
      '- If clinicalActions.handHygieneCount is 3 or more, award additional credit for infection control consistency, but do not let it compensate for critical missed history, red flags, diagnosis, or patient education.',
      '- Timing matters more than raw count. initial_greeting means hand hygiene before or at first patient greeting and should be strongly credited. before_patient_contact means hand hygiene before touching/examining/moving the patient and should be strongly credited. during_interview is supportive but less important unless it occurs before a patient-contact action.',
      '- Use clinicalActions.handHygieneEvents[].messageCount to judge timing relative to the conversation: messageCount 0 means before any student question; higher values mean later in the interview.',
      '- Mention hand hygiene timing explicitly in strengths, missedItems, or suggestions when it materially affects the score.',
      'Physical exam scoring rule:',
      '- clinicalActions.physicalExamEvents are system-observed physical exams. Treat them as completed actions, not patient dialogue.',
      '- For seizure CPX, strongly evaluate whether the student attempted the sitting exams: head inspection/palpation, oral/tongue exam, skin inspection, cranial nerve exam, cerebellar exam.',
      '- Also evaluate whether the student attempted the supine exams: motor exam, sensory exam, DTR, neck stiffness, Kernig, Brudzinski, or a complete meningeal sign exam.',
      '- Credit attempts only when the requested exam is specific enough. Generic phrases such as just "검사하겠습니다" should not count unless a matched physicalExamEvent exists.',
      '- If position differs from expectedPosition, give partial credit but mention positioning/timing as a suggestion.',
      '- Use the result/status to judge whether the student should incorporate abnormal findings into clinical reasoning and patient education.',
      'Return valid JSON only with this exact shape:',
      '{"score": number, "strengths": string[], "missedItems": string[], "riskAssessment": string, "suggestions": string[], "caseInstructionStatus": [{"item": string, "category": string, "status": "met|partial|unmet", "evidence": string[], "feedback": string}], "patientEducationStatus": [{"item": string, "category": string, "status": "met|partial|unmet", "evidence": string[], "feedback": string}]}',
      'score must be an integer from 0 to 100.',
      'For patient education, met requires a patient-facing explanation in understandable Korean.',
      'Mentioning a diagnosis, test, or treatment only as internal reasoning is not enough for patientEducationStatus.',
      'Use partial when the student mentioned the topic but explanation was incomplete, unclear, or not patient-facing.',
      'Evidence must quote or briefly paraphrase the relevant student utterance. Use an empty evidence array when unmet.',
      '',
      `Case title: ${cpxCase.title}`,
      `Chief complaint: ${cpxCase.chiefComplaint}`,
      `Hidden diagnosis: ${cpxCase.hiddenDiagnosis}`,
      `Checklist: ${JSON.stringify(cpxCase.checklist)}`,
      `Red flags: ${JSON.stringify(cpxCase.redFlags)}`,
      `Clinical actions: ${JSON.stringify({
        handHygieneCount,
        handHygieneEvents,
        physicalExamEvents,
      })}`,
      criteriaSection,
    ].join('\n');
  }

  private normalizeEvaluation(
    result: Partial<EvaluationResult>,
    criteriaPack?: EvaluationCriteriaPack | null,
  ): EvaluationResult {
    const score =
      typeof result.score === 'number' && Number.isInteger(result.score)
        ? result.score
        : 0;

    return {
      score: Math.max(0, Math.min(100, score)),
      strengths: Array.isArray(result.strengths) ? result.strengths : [],
      missedItems: Array.isArray(result.missedItems) ? result.missedItems : [],
      riskAssessment:
        typeof result.riskAssessment === 'string'
          ? result.riskAssessment
          : '위험도 평가를 생성하지 못했습니다.',
      suggestions: Array.isArray(result.suggestions) ? result.suggestions : [],
      caseInstructionStatus: this.normalizeItemStatuses(
        result.caseInstructionStatus,
        criteriaPack?.caseChecklist.instructionItems ?? [],
      ),
      patientEducationStatus: this.normalizeItemStatuses(
        result.patientEducationStatus,
        criteriaPack?.casePatientEducation.items ?? [],
      ),
    };
  }

  private normalizeItemStatuses(
    statuses: unknown,
    expectedItems: Array<{ item: string; category?: string }>,
  ): EvaluationItemStatus[] {
    const normalized = Array.isArray(statuses)
      ? statuses
          .map((status) => this.normalizeItemStatus(status))
          .filter((status): status is EvaluationItemStatus => Boolean(status))
      : [];
    const normalizedByKey = new Map(
      normalized.map((status) => [
        this.statusKey(status.item, status.category),
        status,
      ]),
    );

    for (const expected of expectedItems) {
      const key = this.statusKey(expected.item, expected.category);
      if (!normalizedByKey.has(key)) {
        normalizedByKey.set(key, {
          item: expected.item,
          category: expected.category,
          status: 'unmet',
          evidence: [],
          feedback: '평가 응답에 해당 항목 근거가 없어 미충족으로 처리했습니다.',
        });
      }
    }

    return Array.from(normalizedByKey.values());
  }

  private normalizeItemStatus(status: unknown): EvaluationItemStatus | null {
    if (!status || typeof status !== 'object') return null;
    const candidate = status as Partial<EvaluationItemStatus>;

    if (typeof candidate.item !== 'string' || !candidate.item.trim()) {
      return null;
    }

    const allowedStatuses = new Set(['met', 'partial', 'unmet']);
    const normalizedStatus = allowedStatuses.has(candidate.status ?? '')
      ? candidate.status
      : 'unmet';

    return {
      item: candidate.item,
      category:
        typeof candidate.category === 'string'
          ? candidate.category
          : undefined,
      status: normalizedStatus as EvaluationItemStatus['status'],
      evidence: Array.isArray(candidate.evidence)
        ? candidate.evidence.filter(
            (item): item is string => typeof item === 'string',
          )
        : [],
      feedback:
        typeof candidate.feedback === 'string' ? candidate.feedback : '',
    };
  }

  private statusKey(item: string, category: string | undefined) {
    return `${category ?? ''}:${item}`;
  }
}
