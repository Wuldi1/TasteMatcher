import { IsEmail, IsNotEmpty } from 'class-validator';

/**
 * DTO for requesting login verification code
 */
export class LoginRequestDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  constructor() {
    this.email = '';
  }
}
