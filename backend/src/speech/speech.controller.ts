import {
  BadRequestException,
  Body,
  Controller,
  Header,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { SpeechSynthesisInput } from './speech.service';
import { SpeechService } from './speech.service';

type UploadedAudioFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

@Controller('speech')
export class SpeechController {
  constructor(private readonly speechService: SpeechService) {}

  @Post('transcriptions')
  @UseInterceptors(
    FileInterceptor('audio', {
      limits: {
        fileSize: 25 * 1024 * 1024,
      },
    }),
  )
  async transcribe(@UploadedFile() audio?: UploadedAudioFile) {
    if (!audio?.buffer?.length) {
      throw new BadRequestException('Audio file is required');
    }

    const text = await this.speechService.transcribe(audio);
    return { text };
  }

  @Post('synthesis')
  @Header('Content-Type', 'audio/mpeg')
  @Header('Cache-Control', 'no-store')
  async synthesize(@Body() body: SpeechSynthesisInput) {
    return this.speechService.synthesize(body);
  }
}
