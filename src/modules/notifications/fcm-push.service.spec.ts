import { ConfigService } from '@nestjs/config';

import { FcmPushService } from './fcm-push.service';

describe('FcmPushService', () => {
  it('omite el envío cuando FCM está desactivado', async () => {
    const configService = {
      get: jest.fn((key: string, fallback?: unknown) =>
        key === 'FCM_ENABLED' ? false : fallback,
      ),
    } as unknown as ConfigService;
    const service = new FcmPushService(configService);

    await expect(
      service.send({
        token: 'token-de-prueba-con-longitud-suficiente',
        title: 'Prueba',
        body: 'Mensaje',
        data: { rideId: 'ride-id' },
      }),
    ).resolves.toEqual({ kind: 'skipped' });
    expect(service.isEnabled()).toBe(false);
  });
});
