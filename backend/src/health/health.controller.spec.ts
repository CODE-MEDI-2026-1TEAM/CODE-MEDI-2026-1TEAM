import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns service health metadata', () => {
    const controller = new HealthController();

    expect(controller.getHealth()).toEqual(
      expect.objectContaining({
        status: 'ok',
        service: 'cpx-backend',
      }),
    );
  });
});
