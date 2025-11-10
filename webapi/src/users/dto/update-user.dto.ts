import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Role } from '@tastematcher/common';

/**
 * DTO for updating user information
 * Only name and role can be updated by domain owners
 */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsEnum(['dealer', 'customer'])
  role?: Role;
}
