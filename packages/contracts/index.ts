export type UserRole = 'CLIENT' | 'CARRIER' | 'COURIER' | 'OPERATOR' | 'SUPPORT' | 'FINANCE' | 'ADMIN';

export type ApiError = {
  code: string;
  message: string;
  traceId: string;
};
