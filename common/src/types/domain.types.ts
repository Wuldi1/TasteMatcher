import { User } from "./user.types";

/**
 * Status of a domain
 */
export type DomainStatus = 'pending_verification' | 'active';

/**
 * Represents a domain (tenant) in the system.
 * Each domain can have multiple users and artworks.
 */
export interface Domain {
  /**
   * Unique identifier for the domain (UUID).
   */
  id: string;

  /**
   * Display name of the domain.
   */
  name: string;

  /**
   * Email address of the domain administrator.
   */
  adminEmail: string;

  /**
   * Current status of the domain
   */
  status: DomainStatus;

  /**
   * Hashed verification code for email verification.
   */
  verificationCodeHash?: string;

  /**
   * Expiration timestamp for the verification code.
   */
  verificationCodeExpiresAt?: number;

  /**
   * Timestamp of when the domain was created.
   */
  createdAt: number;

  /**
   * Timestamp of the last update to the domain.
   */
  updatedAt: number;
}

export interface DomainVerificationResultResponse {
  user: User;
  token: string;
}

/**
 * Status of a domain creation request
 */
export type DomainRequestStatus = 'pending_verification' | 'approved' | 'rejected';

/**
 * Represents a request to create a new domain
 * Submitted by users who want to create their own domain
 */
export interface DomainRequest {
  /**
   * Unique identifier for the request (UUID)
   */
  id: string;

  /**
   * Email of the person requesting the domain
   */
  email: string;

  /**
   * Full name of the requester
   */
  name: string;

  /**
   * Proposed domain name
   */
  proposedDomainName: string;

  /**
   * Additional details or message from the requester
   */
  message?: string;

  /**
   * Current status of the request
   */
  status: DomainRequestStatus;

  /**
   * Timestamp of when the request was created
   */
  createdAt: number;

  /**
   * Timestamp of when the request was last updated
   */
  updatedAt: number;

  /**
   * ID of the admin who processed this request (if any)
   */
  processedBy?: string;

  /**
   * Notes from the admin who processed the request
   */
  adminNotes?: string;
}