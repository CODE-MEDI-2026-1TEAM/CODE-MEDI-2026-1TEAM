import {
  BadGatewayException,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ApiCostService } from './api-cost.service';
import type { EvaluationCriteriaPack } from '../rag/evaluation-criteria.service';

type ConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export function evaluationFailureCode(error: unknown): string {
  if (error instanceof SyntaxError) return 'evaluation_json_invalid';
  if (!(error instanceof Error)) return 'evaluation_provider_unavailable';
  const known: Record<string, string> = {
    'Empty evaluation response': 'evaluation_output_incomplete',
    'Invalid evaluation response': 'evaluation_schema_invalid',
    'Invalid evaluation output limit': 'evaluation_config_invalid',
    'Incomplete missed item status': 'evaluation_items_incomplete',
    'Incomplete evaluation criteria': 'evaluation_items_incomplete',
    'Invalid missed item status': 'evaluation_item_status_invalid',
    'Invalid evaluation item status': 'evaluation_item_status_invalid',
    'Evaluation evidence contradicts status': 'evaluation_evidence_invalid',
    'Evaluation evidence missing': 'evaluation_evidence_missing',
    'Evaluation evidence is not a student quote': 'evaluation_evidence_not_original',
  };
  return known[error.message] ?? 'evaluation_provider_unavailable';
}

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
  processingRecords?: Array<{
    requestId: string;
    userMessageId: string;
    processing: unknown;
  }>;
  expectedPhysicalExamChecklist?: Array<{
    examKey: string;
    expectedPosition: string;
    label: string;
    result: string;
    status: string;
  }>;
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
    execution?: string;
    resultAvailability?: string;
  }>;
};

export type HistoryTakingCode =
  | 'O'
  | 'L'
  | 'D'
  | 'Co'
  | 'Ex'
  | 'C'
  | 'A_F'
  | '외'
  | '과'
  | '약'
  | '사'
  | '가'
  | '여';

export type MissedItemStatus = {
  item: string;
  historyCode: HistoryTakingCode | null;
  isPerformed: boolean;
};

export type EvaluationResult = {
  score: number;
  strengths: string[];
  missedItems: string[];
  missedItemStatus: MissedItemStatus[];
  riskAssessment: string;
  suggestions: string[];
  caseInstructionStatus: EvaluationItemStatus[];
  patientEducationStatus: EvaluationItemStatus[];
};

@Injectable()
export class LlmService {
  private readonly model: string;

  constructor(private readonly configService: ConfigService, @Optional() private readonly costs: ApiCostService = new ApiCostService(configService)) {
    this.model = this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-5.5';
  }

  async generatePatientReply(
    cpxCase: CpxCaseForPrompt,
    messages: ConversationMessage[],
  ) {
    if (Number(this.configService.get<string>('API_BUDGET_USD')) > 0) throw new ServiceUnavailableException('비용 제한 문진은 근거 기반 환자 경로를 사용합니다.');
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
      const model = this.configService.get<string>('PATIENT_EVALUATION_MODEL') ?? this.model;
      const maxOutput = Number(this.configService.get<string>('PATIENT_EVALUATION_MAX_TOKENS') ?? '8192');
      if (!Number.isInteger(maxOutput) || maxOutput < 512 || maxOutput > 32768) throw new Error('Invalid evaluation output limit');
      const client = this.getClient();
      const request: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
        model,
        ...(!/^(gpt-5|gpt-6|o)/.test(model) ? { temperature: 0.2 } : {}),
        max_completion_tokens: maxOutput,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              this.buildEvaluationSystemPrompt(
                cpxCase,
                criteriaPack,
                clinicalActions,
              ) +
              '\n학생의 원래 질문·진찰 시도를 근거로 판정한다. processingRecords의 기술 실패·자료 미제공을 학생 미수행으로 감점하지 않는다. repairResolutions는 검증된 질문별 복구 연결이다. execution=attempted는 시나리오상 진찰을 시도한 기록이며 완료나 정상 소견을 뜻하지 않는다. execution=performed와 resultAvailability는 별개다. 실제 진찰과 검사 계획을 구분한다. 항목을 누락하거나 원문에 없는 근거를 만들지 않는다.',
          },
          {
            role: 'user',
            content: JSON.stringify(
              {
                clinicalActions: clinicalActions ?? {
                  expectedPhysicalExamChecklist: [],
                  handHygieneCount: 0,
                  handHygieneEvents: [],
                  physicalExamEvents: [],
                },
                conversation: messages,
              },
            ),
          },
        ],
      };
      const completion = await this.costs.execute('evaluation', model, request, maxOutput, () => client.chat.completions.create(request));

      const content = completion.choices[0]?.message?.content;
      if (!content || completion.choices[0]?.finish_reason !== 'stop') {
        throw new Error('Empty evaluation response');
      }

      const result = this.normalizeEvaluation(
        JSON.parse(content) as Partial<EvaluationResult>,
        criteriaPack,
      );
      this.validateEvaluationEvidence(result, messages, clinicalActions);
      return result;
    } catch (error) {
      const code = evaluationFailureCode(error);
      // Only a bounded diagnostic is logged: provider errors may contain sensitive data.
      new Logger(LlmService.name).warn(JSON.stringify({ event: 'evaluation.rejected', code }));
      throw new BadGatewayException({
        message: 'Failed to evaluate conversation',
        detail: code,
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
    if (this.configService.get<string>('PATIENT_AI_ENABLED') !== 'true')
      throw new ServiceUnavailableException(
        '자동 모델 호출이 비활성화되어 있습니다.',
      );
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!apiKey || apiKey === 'sk-your-api-key') {
      throw new BadGatewayException({
        message: 'OpenAI API key is not configured',
      });
    }

    return new OpenAI({ apiKey, timeout: 30000, maxRetries: 0 });
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
    const expectedPhysicalExamChecklist =
      clinicalActions?.expectedPhysicalExamChecklist ?? [];
    const handHygieneCount = clinicalActions?.handHygieneCount ?? 0;
    const handHygieneEvents = clinicalActions?.handHygieneEvents ?? [];
    const physicalExamEvents = clinicalActions?.physicalExamEvents ?? [];
    const criteriaSection = criteriaPack
      ? [
          '',
          'Evaluation RAG criteria pack:',
          JSON.stringify(criteriaPack),
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
      'Also evaluate supplied clinicalActions. execution=attempted with an unavailable scenario is an attempt, not a completed examination; do not invent findings or penalize source unavailability as student omission. Verified repairResolutions resolve only their referenced processing failures.',
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
      '- Evaluate physical exam performance against clinicalActions.expectedPhysicalExamChecklist only. Do not require every generic seizure physical exam for every case.',
      '- If expectedPhysicalExamChecklist is empty, do not penalize missing physical exams. This usually means the scenario does not provide bedside physical exam results.',
      '- Some pediatric/witness scenarios intentionally require document or setup review, such as growth chart review or initial vital-sign/fluid setup, instead of a full bedside exam.',
      '- Credit attempts only when the requested exam is specific enough and there is a matched physicalExamEvent. Generic phrases such as just "검사하겠습니다" should not count.',
      '- If position differs from expectedPosition, give partial credit but mention positioning/timing as a suggestion.',
      '- Use each expected item result/status to judge whether the student should incorporate abnormal findings into clinical reasoning and patient education.',
      '- If a performed physicalExamEvent is not part of expectedPhysicalExamChecklist, mention only as extra/unscored or lower-priority; do not count it as satisfying a required PE item.',
      'Return valid JSON only with this exact shape:',
      '{"score": number, "strengths": string[], "missedItems": string[], "missedItemStatus": [{"item": string, "historyCode": "O|L|D|Co|Ex|C|A_F|외|과|약|사|가|여|null", "isPerformed": boolean}], "riskAssessment": string, "suggestions": string[], "caseInstructionStatus": [{"item": string, "category": string, "status": "met|partial|unmet", "evidence": string[], "feedback": string}], "patientEducationStatus": [{"item": string, "category": string, "status": "met|partial|unmet", "evidence": string[], "feedback": string}]}',
      'score must be an integer from 0 to 100.',
      'missedItems must remain a string array. Do not replace missedItems with objects.',
      'missedItemStatus must contain one object for each missedItems string, using the exact same item text.',
      'For missedItemStatus.historyCode, use one of O, L, D, Co, Ex, C, A_F, 외, 과, 약, 사, 가, 여 when the missed item belongs to a history-taking category; otherwise use null.',
      'History-taking code mapping: O=onset/start timing, L=location, D=duration/frequency/repetition, Co=course/progression, Ex=experience/previous episodes, C=character/features before/during/after the seizure, A_F=associated symptoms and aggravating/relieving/trigger factors, 외=trauma/surgery history, 과=past medical history, 약=medication/allergy history, 사=social history, 가=family history, 여=gynecologic/obstetric history.',
      'For missedItemStatus.isPerformed, use true only when the student substantially performed or explained the item but it still needs improvement; use false when it was not performed or not mentioned.',
      'For patient education, met requires a patient-facing explanation in understandable Korean.',
      'Mentioning a diagnosis, test, or treatment only as internal reasoning is not enough for patientEducationStatus.',
      'Use partial when the student mentioned the topic but explanation was incomplete, unclear, or not patient-facing.',
      'Evidence must contain exact continuous quotes from student utterances or physicalExamEvents.matchedText; never paraphrase. Every met/partial item needs at least one quote. Use an empty evidence array when unmet.',
      '',
      `Case title: ${cpxCase.title}`,
      `Chief complaint: ${cpxCase.chiefComplaint}`,
      `Hidden diagnosis: ${cpxCase.hiddenDiagnosis}`,
      `Checklist: ${JSON.stringify(cpxCase.checklist)}`,
      `Red flags: ${JSON.stringify(cpxCase.redFlags)}`,
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
        : NaN;
    if (
      !Number.isFinite(score) ||
      score < 0 ||
      score > 100 ||
      typeof result.riskAssessment !== 'string' ||
      !Array.isArray(result.strengths) ||
      !Array.isArray(result.missedItems) ||
      !Array.isArray(result.suggestions)
    )
      throw new Error('Invalid evaluation response');
    const missedItems = this.normalizeStringArray(result.missedItems);

    return {
      score: Math.max(0, Math.min(100, score)),
      strengths: this.normalizeStringArray(result.strengths),
      missedItems,
      missedItemStatus: this.normalizeMissedItemStatus(
        result.missedItemStatus,
        missedItems,
      ),
      riskAssessment:
        typeof result.riskAssessment === 'string'
          ? result.riskAssessment
          : '위험도 평가를 생성하지 못했습니다.',
      suggestions: this.normalizeStringArray(result.suggestions),
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

  private normalizeStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private validateEvaluationEvidence(
    result: EvaluationResult,
    messages: ConversationMessage[],
    actions?: ClinicalActionSummary,
  ) {
    const source = [
      ...messages.filter((m) => m.role === 'user').map((m) => m.content),
      ...(actions?.physicalExamEvents ?? []).map((e) => e.matchedText),
    ];
    for (const item of [
      ...result.caseInstructionStatus,
      ...result.patientEducationStatus,
    ]) {
      if (item.status === 'unmet' && item.evidence.length)
        throw new Error('Evaluation evidence contradicts status');
      if (item.status !== 'unmet' && !item.evidence.length)
        throw new Error('Evaluation evidence missing');
      if (
        item.evidence.some(
          (quote) =>
            !quote.trim() || !source.some((text) => text.includes(quote)),
        )
      )
        throw new Error('Evaluation evidence is not a student quote');
    }
  }

  private normalizeMissedItemStatus(
    statuses: unknown,
    missedItems: string[],
  ): MissedItemStatus[] {
    const normalizedByItem = new Map<string, MissedItemStatus>();
    if (missedItems.length && !Array.isArray(statuses))
      throw new Error('Incomplete missed item status');

    if (Array.isArray(statuses)) {
      for (const status of statuses) {
        if (!status || typeof status !== 'object')
          throw new Error('Invalid missed item status');
        const candidate = status as Partial<MissedItemStatus>;
        if (typeof candidate.item !== 'string' || !candidate.item.trim()) {
          throw new Error('Invalid missed item status');
        }
        if (
          !missedItems.includes(candidate.item) ||
          normalizedByItem.has(candidate.item) ||
          typeof candidate.isPerformed !== 'boolean'
        )
          throw new Error('Invalid missed item status');

        normalizedByItem.set(candidate.item, {
          item: candidate.item,
          historyCode: this.normalizeHistoryCode(candidate.historyCode),
          isPerformed: candidate.isPerformed === true,
        });
      }
    }

    if (missedItems.some((item) => !normalizedByItem.has(item)))
      throw new Error('Incomplete missed item status');
    return missedItems.map((item) => normalizedByItem.get(item)!);
  }

  private normalizeHistoryCode(value: unknown): HistoryTakingCode | null {
    const allowedCodes = new Set<HistoryTakingCode>([
      'O',
      'L',
      'D',
      'Co',
      'Ex',
      'C',
      'A_F',
      '외',
      '과',
      '약',
      '사',
      '가',
      '여',
    ]);

    return typeof value === 'string' &&
      allowedCodes.has(value as HistoryTakingCode)
      ? (value as HistoryTakingCode)
      : null;
  }

  private inferHistoryCode(item: string): HistoryTakingCode | null {
    if (
      /\btrauma\b|\bsurgery\b|외상|수술|다친|손상|교통사고|두부외상|머리.*다침/i.test(
        item,
      )
    ) {
      return '외';
    }
    if (
      /\bpast medical\b|\bmedical history\b|과거력|기저질환|진단.*병|고혈압|당뇨|뇌졸중|뇌종양|뇌수막염/i.test(
        item,
      )
    ) {
      return '과';
    }
    if (
      /\bmedication\b|\bdrug\b|\ballergy\b|약물|복용|투약|항경련제|알레르기/i.test(
        item,
      )
    ) {
      return '약';
    }
    if (/\bsocial\b|사회력|음주|흡연|직업|카페인|생활습관/i.test(item)) {
      return '사';
    }
    if (/\bfamily\b|가족력|가족.*병|유전|부모|형제|자매/i.test(item)) {
      return '가';
    }
    if (
      /\bgynecologic\b|\bobstetric\b|여성력|월경|생리|임신|출산|폐경|LMP/i.test(
        item,
      )
    ) {
      return '여';
    }
    if (
      /\bA_F\b|associated|trigger|동반|유발|악화|완화|요인|발열|두통|수면|음주|스트레스/i.test(
        item,
      )
    ) {
      return 'A_F';
    }
    if (
      /\bEx\b|experience|previous|이전|과거|처음|재발|경험|항경련제/i.test(item)
    ) {
      return 'Ex';
    }
    if (/\bCo\b|course|progress|악화|호전|변화|경과|점점/i.test(item)) {
      return 'Co';
    }
    if (
      /\bD\b|duration|frequency|지속|시간|몇 분|몇 초|반복|빈도|횟수/i.test(
        item,
      )
    ) {
      return 'D';
    }
    if (/\bL\b|location|부위|위치|어디/i.test(item)) {
      return 'L';
    }
    if (/\bO\b|onset|시작|발생 시점|언제부터|처음 발생/i.test(item)) {
      return 'O';
    }
    if (
      /\bC\b|character|양상|전조|의식|목격|떨림|뻣뻣|눈|고개|혀|실금|자동증|경련 전|경련 중|경련 후/i.test(
        item,
      )
    ) {
      return 'C';
    }

    return null;
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
        throw new Error('Incomplete evaluation criteria');
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
    if (!allowedStatuses.has(candidate.status ?? ''))
      throw new Error('Invalid evaluation item status');
    const normalizedStatus = candidate.status;

    return {
      item: candidate.item,
      category:
        typeof candidate.category === 'string' ? candidate.category : undefined,
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
