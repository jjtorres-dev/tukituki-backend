export declare class PasswordService {
    private readonly saltRounds;
    hash(password: string): Promise<string>;
    verify(password: string, passwordHash: string): Promise<boolean>;
}
