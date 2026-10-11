import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ApiCostService, ApiBudgetError } from '../llm/api-cost.service';
import { BoundedCache } from './bounded-cache';
import { hashContent } from './evidence-facts';

export class PatientModelError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
@Injectable()
export class PatientModelService {
  private readonly logger = new Logger(PatientModelService.name);
  private client?: OpenAI;
  private readonly cache = new BoundedCache<any>(512, 600_000);
  constructor(
    private readonly config: ConfigService,
    @Optional()
    private readonly costs: ApiCostService = new ApiCostService(config),
  ) {}
  get enabled() {
    return this.config.get<string>('PATIENT_AI_ENABLED') === 'true';
  }
  get profile() {
    return ['OPENAI_MODEL', 'PATIENT_GENERATION_MODEL', 'PATIENT_VERIFICATION_MODEL',
      'PATIENT_GENERATION_MAX_TOKENS', 'PATIENT_VERIFICATION_MAX_TOKENS',
      'PATIENT_GENERATION_REASONING_EFFORT', 'PATIENT_VERIFICATION_REASONING_EFFORT']
      .map((key) => [key, this.config.get<string>(key)]);
  }
  async json(
    name: string,
    schema: Record<string, unknown>,
    instruction: string,
    input: unknown,
    cacheScope?: unknown,
    options?: { cache?: boolean },
  ): Promise<{ data: any; tokens: number }> {
    if (!this.enabled) throw new PatientModelError('model_disabled');
    const key = this.config.get<string>('OPENAI_API_KEY');
    if (!key || key === 'sk-your-api-key')
      throw new PatientModelError('api_key_missing');
    this.client ??= new OpenAI({ apiKey: key, timeout: 20_000, maxRetries: 0 });
    const stage =
      (
        {
          patient_turn_frames: 'UNDERSTANDING',
          patient_evidence_rerank: 'RERANK',
          grounded_patient_reply: 'GENERATION',
          patient_claim_verification: 'VERIFICATION',
        } as Record<string, string>
      )[name] ?? 'GENERATION';
    const model =
      this.config.get<string>(`PATIENT_${stage}_MODEL`) ??
      this.config.get<string>('OPENAI_MODEL') ??
      'gpt-5.5';
    const maxOutput = Number(
      this.config.get<string>(`PATIENT_${stage}_MAX_TOKENS`) ??
        (stage === 'VERIFICATION' ? 1024 : 2048),
    );
    if (!Number.isInteger(maxOutput) || maxOutput < 128 || maxOutput > 32768)
      throw new PatientModelError('output_limit_invalid');
    const effort = this.config.get<string>(`PATIENT_${stage}_REASONING_EFFORT`);
    const request: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model,
      messages: [
        { role: 'system', content: instruction },
        { role: 'user', content: JSON.stringify(input) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name, strict: true, schema },
      },
      max_completion_tokens: maxOutput,
      ...(effort ? { reasoning_effort: effort as any } : {}),
    };
    const cacheKey = hashContent([request, cacheScope]);
    // Generation/verification JSON is not yet business-validated. Cache accepted
    // complete turns instead; do not persist a raw reply rejected downstream.
    const cacheable = options?.cache !== false && !['patient_turn_grounded', 'grounded_patient_reply', 'patient_claim_verification'].includes(name);
    const cached = cacheable ? this.cache.get(cacheKey) : undefined;
    if (cached) return { data: cached, tokens: 0 };
    const began = Date.now();
    try {
      const response = await this.costs.execute(
        name,
        model,
        request,
        maxOutput,
        () => this.client!.chat.completions.create(request),
      );
      this.logger.log(
        JSON.stringify({
          event: 'patient.model.call',
          stage: name,
          model,
          elapsedMs: Date.now() - began,
          usage: response.usage,
          finishReason: response.choices[0]?.finish_reason,
        }),
      );
      const choice = response.choices[0];
      if (
        choice?.finish_reason !== 'stop' ||
        choice.message.refusal ||
        !choice.message.content
      )
        throw new PatientModelError('model_output_invalid');
      const data = JSON.parse(choice.message.content);
      if (cacheable) this.cache.set(cacheKey, data);
      return {
        data,
        tokens: response.usage?.total_tokens ?? 0,
      };
    } catch (error) {
      if (error instanceof PatientModelError) throw error;
      if (error instanceof ApiBudgetError)
        throw new PatientModelError(error.code);
      // Provider errors can contain credentials/URLs; persist only a bounded status code.
      throw new PatientModelError(
        error instanceof OpenAI.APIError &&
          error.code &&
          /^[a-z0-9_]{1,80}$/i.test(error.code)
          ? error.code
          : 'provider_unavailable',
      );
    }
  }
}
