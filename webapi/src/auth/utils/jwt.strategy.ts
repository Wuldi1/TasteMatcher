import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";

/**
 * JWT Passport strategy
 * Validates JWT tokens and extracts user information
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>("JWT_SECRET") ||
        "your-secret-key-change-in-production",
    });
  }

  /**
   * Validates the JWT payload and returns user object
   * This object will be attached to request.user
   */
  async validate(payload: any) {
    if (!payload.id || !payload.domainId || !payload.email || !payload.role) {
      throw new UnauthorizedException("Invalid token payload");
    }

    return {
      id: payload.id,
      domainId: payload.domainId,
      email: payload.email,
      role: payload.role,
    };
  }
}
