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

type ClinicalActionSummary = {
  handHygieneCount: number;
};

export type EvaluationResult = {
  score: number;
  strengths: string[];
  missedItems: string[];
  riskAssessment: string;
  suggestions: string[];
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
    const criteriaSection = criteriaPack
      ? [
          '',
          'Evaluation RAG criteria pack:',
          JSON.stringify(criteriaPack, null, 2),
          '',
          'Use the criteria pack as the primary evaluation reference.',
          'Case-specific checklist and red flags override general module guidance.',
          'When creating missedItems and suggestions, prefer actionable Korean feedback grounded in the criteria pack.',
          'If the student did not explicitly ask or explain something, do not mark it as completed.',
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
      'Hand hygiene rule: if clinicalActions.handHygieneCount is 1 or more, recognize hand hygiene as performed under clinical etiquette/infection control. If it is 0, mark missed hand hygiene as a missed item or suggestion when relevant. Do not require repeated hand hygiene more than once unless the encounter clearly requires it.',
      'Return valid JSON only with this exact shape:',
      '{"score": number, "strengths": string[], "missedItems": string[], "riskAssessment": string, "suggestions": string[]}',
      'score must be an integer from 0 to 100.',
      '',
      `Case title: ${cpxCase.title}`,
      `Chief complaint: ${cpxCase.chiefComplaint}`,
      `Hidden diagnosis: ${cpxCase.hiddenDiagnosis}`,
      `Checklist: ${JSON.stringify(cpxCase.checklist)}`,
      `Red flags: ${JSON.stringify(cpxCase.redFlags)}`,
      `Clinical actions: ${JSON.stringify({ handHygieneCount })}`,
      criteriaSection,
    ].join('\n');
  }

  private normalizeEvaluation(
    result: Partial<EvaluationResult>,
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
          : '위험 신호 평가를 생성하지 못했습니다.',
      suggestions: Array.isArray(result.suggestions) ? result.suggestions : [],
    };
  }
}
