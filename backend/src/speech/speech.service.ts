import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, { toFile } from 'openai';
import type { SpeechCreateParams } from 'openai/resources/audio/speech';

type UploadedAudioFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

export type SpeechSynthesisProfile = {
  age?: number;
  ageRaw?: string;
  respondent?: string;
  sex?: string;
};

export type SpeechSynthesisInput = {
  text: string;
  profile?: SpeechSynthesisProfile;
};

const allowedAudioTypes = new Set([
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'video/mp4',
  'video/webm',
]);

@Injectable()
export class SpeechService {
  private readonly logger = new Logger(SpeechService.name);
  private readonly model: string;
  private readonly ttsModel: string;

  constructor(private readonly configService: ConfigService) {
    this.model =
      this.configService.get<string>('OPENAI_TRANSCRIPTION_MODEL') ??
      'gpt-4o-mini-transcribe';
    this.ttsModel =
      this.configService.get<string>('OPENAI_TTS_MODEL') ?? 'gpt-4o-mini-tts';
  }

  async transcribe(audio: UploadedAudioFile) {
    if (!allowedAudioTypes.has(audio.mimetype)) {
      throw new BadRequestException(
        `Unsupported audio type: ${audio.mimetype}`,
      );
    }

    this.debugConversation('speech.transcription.received', {
      mimetype: audio.mimetype,
      originalname: audio.originalname,
      size: audio.size,
      model: this.model,
    });

    try {
      const client = this.getClient();
      const filename = this.filenameFor(audio);
      const file = await toFile(audio.buffer, filename, {
        type: audio.mimetype,
      });

      const transcription = await client.audio.transcriptions.create({
        file,
        model: this.model,
        language: 'ko',
        prompt:
          'Korean medical CPX interview. The speaker is a clinician asking a simulated seizure patient short questions. Preserve Korean medical terms naturally.',
        response_format: 'json',
      });

      const text = transcription.text?.trim();
      if (!text) {
        throw new Error('Empty transcription response');
      }

      this.debugConversation('speech.transcription.completed', {
        mimetype: audio.mimetype,
        size: audio.size,
        model: this.model,
        transcript: text,
        transcriptLength: text.length,
      });

      return text;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;

      this.debugConversation('speech.transcription.failed', {
        mimetype: audio.mimetype,
        size: audio.size,
        model: this.model,
        detail: error instanceof Error ? error.message : 'Unknown STT error',
      });

      throw new BadGatewayException({
        message: 'Failed to transcribe audio',
        detail: error instanceof Error ? error.message : 'Unknown STT error',
      });
    }
  }

  async synthesize(synthesisInput: SpeechSynthesisInput) {
    const input = synthesisInput?.text?.trim();
    if (!input) {
      throw new BadRequestException('Text is required');
    }

    try {
      const voicePreset = this.voicePresetFor(synthesisInput.profile);
      const response = await this.getClient().audio.speech.create({
        input,
        instructions: voicePreset.instructions,
        model: this.ttsModel,
        response_format: 'mp3',
        speed: voicePreset.speed,
        voice: voicePreset.voice,
      });

      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (error instanceof BadRequestException) throw error;

      throw new BadGatewayException({
        message: 'Failed to synthesize speech',
        detail: error instanceof Error ? error.message : 'Unknown TTS error',
      });
    }
  }

  private getClient() {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey || apiKey === 'sk-your-api-key') {
      throw new BadGatewayException('OPENAI_API_KEY is not configured');
    }

    return new OpenAI({ apiKey });
  }

  private filenameFor(audio: UploadedAudioFile) {
    const extension = this.extensionFor(audio.mimetype);
    const baseName =
      audio.originalname?.replace(/\.[a-z0-9]+$/i, '') || 'voice';
    return `${baseName}.${extension}`;
  }

  private extensionFor(mimetype: string) {
    if (mimetype.includes('mp4')) return 'mp4';
    if (mimetype.includes('mpeg')) return 'mp3';
    if (mimetype.includes('ogg')) return 'ogg';
    if (mimetype.includes('wav')) return 'wav';
    return 'webm';
  }

  private voicePresetFor(profile?: SpeechSynthesisProfile) {
    if (profile?.respondent) {
      return {
        instructions:
          'Korean adult female guardian voice. Sound worried but calm, natural, and conversational. Do not sound like a child.',
        speed: 0.95,
        voice: 'nova' satisfies SpeechCreateParams['voice'],
      };
    }

    if (this.isChildProfile(profile)) {
      const isFemale = this.isFemale(profile?.sex);

      return {
        instructions: isFemale
          ? 'Korean young girl patient voice. Bright but slightly anxious, natural and age-appropriate.'
          : 'Korean young boy patient voice. Clear, young, slightly anxious, natural and age-appropriate.',
        speed: 1.02,
        voice: (isFemale ? 'shimmer' : 'echo') satisfies SpeechCreateParams['voice'],
      };
    }

    if (this.isAdolescentProfile(profile)) {
      const isFemale = this.isFemale(profile?.sex);

      return {
        instructions: isFemale
          ? 'Korean teenage female patient voice. Natural, a little nervous, not overly high-pitched.'
          : 'Korean teenage male patient voice. Natural lower teen male tone, a little nervous.',
        speed: 0.98,
        voice: (isFemale ? 'coral' : 'ash') satisfies SpeechCreateParams['voice'],
      };
    }

    if (this.isFemale(profile?.sex)) {
      return {
        instructions:
          'Korean adult female patient voice. Natural, calm, slightly anxious, conversational.',
        speed: 0.95,
        voice: 'nova' satisfies SpeechCreateParams['voice'],
      };
    }

    return {
      instructions:
        'Korean adult male patient voice. Clearly masculine, lower register, calm but slightly anxious, conversational.',
      speed: 0.93,
      voice: 'onyx' satisfies SpeechCreateParams['voice'],
    };
  }

  private isFemale(sex?: string) {
    return /female|여성|여자|여아/i.test(sex ?? '');
  }

  private isChildProfile(profile?: SpeechSynthesisProfile) {
    if (profile?.respondent) return false;
    if (typeof profile?.age === 'number') return profile.age <= 12;

    return /생후|개월|영유아|소아|아동|어린이|초등/i.test(
      profile?.ageRaw ?? '',
    );
  }

  private isAdolescentProfile(profile?: SpeechSynthesisProfile) {
    if (typeof profile?.age === 'number') {
      return profile.age > 12 && profile.age <= 18;
    }

    return /청소년|중학생|고등학생|고등/i.test(profile?.ageRaw ?? '');
  }

  private debugConversation(event: string, payload: Record<string, unknown>) {
    if (
      this.configService.get<string>('ENABLE_CONVERSATION_DEBUG') !== 'true'
    ) {
      return;
    }

    this.logger.log(JSON.stringify({ event, ...payload }));
  }
}
