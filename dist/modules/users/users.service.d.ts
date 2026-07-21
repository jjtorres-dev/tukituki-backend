import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserInput } from './interfaces/create-user.interface';
export declare class UsersService {
    private readonly usersRepository;
    constructor(usersRepository: Repository<User>);
    findById(id: string): Promise<User | null>;
    findByPhoneE164(phoneE164: string): Promise<User | null>;
    findByPhoneE164WithPassword(phoneE164: string): Promise<User | null>;
    create(input: CreateUserInput): Promise<User>;
    activatePhone(phoneE164: string): Promise<User>;
    markLastLogin(userId: string): Promise<void>;
    private isUniqueConstraintViolation;
}
