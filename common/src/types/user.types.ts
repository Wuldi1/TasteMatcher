// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Uses TypeScript strict types (no `any`).
// 2. Defines the core User entity for shared use.
// 3. Includes JSDoc for all properties.

import { ArtworkStats } from "./artwork.types";
import { Comment } from "./sales.types";

// -----------------------------------------------------------
export type Role = "global_admin" | "domain_owner" | "dealer" | "customer";

/**
 * Represents the verification status of a user.
 * - `pending_verification`: The user has been invited but has not yet logged in.
 * - `active`: The user has logged in and is active.
 */
export type UserStatus = "pending_verification" | "active";

export type UserOnboardingStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "skipped";

/**
 * Aesthetic admiration section
 */
export interface AestheticAdmiration {
  description?: string;
  imageUrls?: string[];
}

export interface PersonalCollection extends AestheticAdmiration {}

/**
 * Complete personal questionnaire structure
 */
export interface PersonalQuestionnaire {
  // Basic info
  fullName?: string;
  primaryResidence?: string;

  // Decision Making
  collectionType?: "individual" | "group";
  decisionMakersDescription?: string;

  // About You
  aboutYourself?: string;

  // Location
  currentLocation?: string;

  // Relationship with art
  collectingStatus?: "collector" | "not_yet";
  collectingDetails?: string;

  // Other Residences
  hasOtherResidences?: boolean;
  otherResidencesDescription?: string;

  // Collection Goals
  collectionGoals?: string;
  collectingReasons?: string[];

  // Aesthetic Preferences
  aestheticAdmiration?: AestheticAdmiration;

  // Collection Ownership
  hasPersonalCollection?: boolean;
  personalCollection?: PersonalCollection;

  // Practical details
  practicalDetails?: string;

  // Professional collaborators
  worksWithDesigner?: boolean;
  designerDetails?: string;

  // Metadata
  completedAt?: number; // Timestamp when questionnaire was completed
}

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
  role: Role;

  /**
   * The user's current status.
   */
  status: UserStatus;

  /**
   * The user's onboarding status.
   */
  onboardingStatus: UserOnboardingStatus;

  /**
   * The ID of the user who invited this user. Optional.
   */
  invitedBy?: string;

  /**
   * A vector representing the user's learned taste preferences.
   * Initialized as a zero vector and updated with each swipe.
   * Dimensions: 1024 (to match artwork vectors).
   */
  preferenceVector: number[];

  /**
   * Timestamp of when the user was created (Unix epoch in milliseconds).
   */
  createdAt: number;

  /**
   * Timestamp of the last update to the user's record.
   */
  updatedAt: number;

  /**
   * Hashed verification code for login verification.
   */
  verificationCodeHash?: string;

  /**
   * Expiration timestamp for the verification code.
   */
  verificationCodeExpiresAt?: number;

  /**
   * The user's personal questionnaire responses.
   */
  personalQuestionnaire?: PersonalQuestionnaire;

  /**
   * Temporary storage for preference image vectors during onboarding
   * Cleared after finalization
   */
  tempPreferenceVectors?: number[][];

  /**
   * The user's amount of swipe interactions used for recommendations.
   */
  swipeCount?: number;

  /**
   * User comments associated with this user.
   */
  comments?: Comment[];

  /**
   * Shared gallery uploads provided outside the questionnaire context.
   */
  sharedCollectionUploads?: string[];
}

/**
 * Represents the response structure for the /users/stats endpoint.
 */
export interface UserStatsResponse extends ArtworkStats {
  totalLikes: number; // Total number of artworks liked by the user
  totalDislikes: number; // Total number of artworks disliked by the user
  recentlyAdded: number; // Number of artworks added in the last 7 days
}
