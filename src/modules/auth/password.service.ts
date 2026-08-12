import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

const DUMMY_PASSWORD_HASH =
  '$2b$12$CXR2SckJJFl2vME2GomNl.tgUAL8dwOMcu7pO9eeIBsp6V2YLNQTy';

@Injectable()
export class PasswordService {
  private readonly saltRounds = 12;

  hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds);
  }

  verify(password: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(password, passwordHash);
  }

  async verifyWithFallback(
    password: string,
    passwordHash: string | null | undefined,
  ): Promise<boolean> {
    const matches = await bcrypt.compare(
      password,
      passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    return Boolean(passwordHash) && matches;
  }
}
