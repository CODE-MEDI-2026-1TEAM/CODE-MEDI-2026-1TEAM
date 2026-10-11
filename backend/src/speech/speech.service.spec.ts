import { ConfigService } from '@nestjs/config';
import { SpeechService } from './speech.service';
describe('Offline voice API guard', () => {
  it('rejects STT and TTS before creating an API client', async () => {
    const service = new SpeechService({
      get: () => undefined,
    } as unknown as ConfigService);
    const client = jest.spyOn(service as any, 'getClient');
    await expect(
      service.transcribe({
        buffer: Buffer.alloc(0),
        size: 0,
        originalname: 'audio.webm',
        mimetype: 'audio/webm',
      }),
    ).rejects.toMatchObject({ status: 503 });
    await expect(
      service.synthesize({ text: '안녕하세요.' }),
    ).rejects.toMatchObject({ status: 503 });
    expect(client).not.toHaveBeenCalled();
  });
});
