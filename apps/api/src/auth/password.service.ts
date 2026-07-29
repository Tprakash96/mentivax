import { Injectable } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';

/** bcrypt work factor. 12 ≈ 250ms on modern hardware — tune with your infra. */
const SALT_ROUNDS = 12;

@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return hash(plain, SALT_ROUNDS);
  }

  verify(plain: string, passwordHash: string | null): Promise<boolean> {
    // Users provisioned without a password can never authenticate. Still run a
    // comparison against a dummy hash so the timing matches a real miss.
    if (!passwordHash) return compare(plain, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu');
    return compare(plain, passwordHash);
  }
}
