import type { UserRole, UserStatus } from '@prisma/client';

export interface AuthContext {
  sessionId: string;
  userId: string;
  phoneE164: string;
  locale: string;
  status: UserStatus;
  roles: UserRole[];
}
