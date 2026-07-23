import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { UserRole } from '../../users/enums/user-role.enum';
import type { AuthenticatedSocket } from './authenticated-socket.interface';
import { RideRealtimeAccessService } from './ride-realtime-access.service';
import { RidesGateway } from './rides.gateway';

describe('RidesGateway', () => {
  it('debe validar participación antes de unir el socket a la sala', async () => {
    const rideId = '3dbb6cbc-aee8-43f0-8247-e13d8e197b71';
    const user = {
      id: '2bb75614-f6d6-437f-b38f-e21aad622428',
      roles: [UserRole.PASSENGER],
    } as AuthenticatedUser;
    const accessService = {
      assertParticipant: jest.fn(() => Promise.resolve()),
    };
    const client = {
      data: { user },
      join: jest.fn(() => Promise.resolve()),
    } as unknown as AuthenticatedSocket;
    const gateway = new RidesGateway(
      accessService as unknown as RideRealtimeAccessService,
    );

    const result = await gateway.joinRide(client, { rideId });

    expect(accessService.assertParticipant).toHaveBeenCalledWith(user, rideId);
    expect(client.join).toHaveBeenCalledWith(`ride:${rideId}`);
    expect(result.event).toBe('ride.joined');
  });
});
