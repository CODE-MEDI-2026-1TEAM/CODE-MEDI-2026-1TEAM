import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, { toFile } from 'openai';

type UploadedAudioFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
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
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    this.model =
      this.configService.get<string>('OPENAI_TRANSCRIPTION_MODEL') ??
      'gpt-4o-mini-transcribe';
  }

  async transcribe(audio: UploadedAudioFile) {
    if (!allowedAudioTypes.has(audio.mimetype)) {
      throw new BadRequestException(`Unsupported audio type: ${audio.mimetype}`);
    }

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

      return text;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;

      throw new BadGatewayException({
        message: 'Failed to transcribe audio',
        detail: error instanceof Error ? error.message : 'Unknown STT error',
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
    const baseName = audio.originalname?.replace(/\.[a-z0-9]+$/i, '') || 'voice';
    return `${baseName}.${extension}`;
  }

  private extensionFor(mimetype: string) {
    if (mimetype.includes('mp4')) return 'mp4';
    if (mimetype.includes('mpeg')) return 'mp3';
    if (mimetype.includes('ogg')) return 'ogg';
    if (mimetype.includes('wav')) return 'wav';
    return 'webm';
  }
}
