import { IsEmail, IsEnum, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { Role } from '@tastematcher/common';

/**
 * DTO for inviting a new user to a domain
 */
export class InviteUserDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsEnum(['dealer', 'customer'])
  role: Role;

  constructor()
  {
    this.name = '';
    this.email = '';
    this.role = 'customer';
  }
}
