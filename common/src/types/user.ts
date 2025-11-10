// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Uses TypeScript strict types (no `any`).
// 2. Defines the core User entity for shared use.
// 3. Includes JSDoc for all properties.
// -----------------------------------------------------------

/**
 * Represents a user in the system.
 * Each user belongs to a single domain.
 */
export interface User {
  /**
   * Unique identifier for the user (UUID).
   */
  id: string;

  /**
   * The ID of the domain this user belongs to.
   * This is also the partition key in Cosmos DB.
   */
  domainId: string;

  /**
   * The user's email address, used for login.
   */
  email: string;

  /**
   * The user's full name.
   */
  name: string;

  /**
   * The user's role within their domain.
   */
  role: 'domain_owner' | 'admin' | 'member';

  /**
   * A vector representing the user's learned taste preferences.
   * Initialized as a zero vector and updated with each swipe.
   * Dimensions: 1024 (to match artwork vectors).
   */
  preferenceVector: number[];

  /**
   * The total number of swipe interactions the user has made.
   * Used to calculate the learning rate for preference vector updates.
   */
  totalSwipes: number;

  /**
   * Timestamp of when the user was created (Unix epoch in milliseconds).
   */
  createdAt: number;

  /**
   * Timestamp of the last update to the user's record.
   */
  updatedAt: number;
}
