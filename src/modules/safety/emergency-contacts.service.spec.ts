import { DataSource } from 'typeorm';

import { EmergencyContactsService } from './emergency-contacts.service';
import { EmergencyContact } from './entities/emergency-contact.entity';
import { EmergencyContactRelationship } from './enums/emergency-contact-relationship.enum';

describe('EmergencyContactsService', () => {
  it('convierte automáticamente el primer contacto en principal', async () => {
    const now = new Date();
    const repository = {
      count: jest.fn<Promise<number>, [unknown]>(() => Promise.resolve(0)),
      findOne: jest.fn<Promise<EmergencyContact | null>, [unknown]>(() =>
        Promise.resolve(null),
      ),
      exists: jest.fn<Promise<boolean>, [unknown]>(() =>
        Promise.resolve(false),
      ),
      update: jest.fn<Promise<unknown>, [unknown, unknown]>(() =>
        Promise.resolve({ affected: 0 }),
      ),
      create: jest.fn<EmergencyContact, [Partial<EmergencyContact>]>((input) =>
        Object.assign(new EmergencyContact(), input, {
          id: 'a45e98c0-e3c8-44db-b4c2-4f643d7bed35',
          createdAt: now,
          updatedAt: now,
        }),
      ),
      save: jest.fn<Promise<EmergencyContact>, [EmergencyContact]>((contact) =>
        Promise.resolve(contact),
      ),
    };
    const manager = {
      getRepository: jest.fn(() => repository),
    };
    const dataSource = {
      transaction: jest.fn(
        (callback: (value: typeof manager) => Promise<EmergencyContact>) =>
          callback(manager),
      ),
    } as unknown as DataSource;
    const service = new EmergencyContactsService(dataSource);

    const result = await service.create(
      '2c9cf69d-37cf-4f5b-a6c1-65fb548d9a20',
      {
        name: 'María Torres',
        phoneE164: '+51987654321',
        relationship: EmergencyContactRelationship.PARENT,
      },
    );

    expect(result.isPrimary).toBe(true);
    expect(result.isVerified).toBe(false);
    expect(repository.save).toHaveBeenCalledTimes(1);
  });
});
