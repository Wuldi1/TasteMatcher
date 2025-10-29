import { IsString, IsNotEmpty, IsEmail, MinLength, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class DomainDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsEmail({}, {
    message: 'Admin email must be a valid email address',
  })
  @IsNotEmpty()
  @Transform(({ value }) => value?.toLowerCase().trim())
  adminEmail: string;

  constructor() {
    this.name = '';
    this.adminEmail = '';
  }
}