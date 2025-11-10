import { User } from '@tastematcher/common';

/**
 * Defines the shape of the user object attached to the request by the JwtAuthGuard.
 * This is derived from the JWT payload.
 */
export type AuthenticatedUser = Pick<User, 'id' | 'email' | 'domainId' | 'role'>;

/**
 * Represents a request that has been authenticated.
 * It contains a `user` property with the authenticated user's data.
 */
export interface AuthenticatedRequest {
  user: AuthenticatedUser;
}
