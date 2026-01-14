import { SetMetadata } from "@nestjs/common";
import { Role } from "@tastematcher/common";

export const ROLES_KEY = "roles";

/**
 * Decorator to specify required roles for a route
 * Usage: @Roles('domain_owner', 'dealer')
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
