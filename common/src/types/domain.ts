export interface Domain {
  id: string; // UUID
  name: string;
  adminEmail: string;
  createdAt?: number; // timestamp
  updatedAt?: number; // timestamp

  verificationCodeHash?: string;
  verificationCodeExpiresAt?: number; // timestamp
}

export interface DomainVerificationResultResponse {
  token: string;
} // we need to late