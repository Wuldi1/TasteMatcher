import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is not set');
    }
    
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  /**
   * Validates the token payload and returns the user object,
   * which NestJS will attach to the Request object.
   */
  async validate(payload: any) {
    // The 'sub' (subject) claim of the JWT should be the user's ID.
    return {
      id: payload.sub,
      userId: payload.sub, // Add userId for clarity
      email: payload.email,
      domainId: payload.domainId,
      role: payload.role,
    };
  }
}
