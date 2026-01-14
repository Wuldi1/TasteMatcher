import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";

/**
 * DTO for requesting a new domain
 */
export class CreateDomainRequestDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  proposedDomainName: string;

  @IsOptional()
  @IsString()
  message?: string;

  constructor() {
    this.name = "";
    this.email = "";
    this.proposedDomainName = "";
    this.message = "";
  }
}
