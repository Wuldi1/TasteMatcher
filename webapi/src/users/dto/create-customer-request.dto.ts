import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from "class-validator";

/**
 * DTO for requesting customer access
 */
export class CreateCustomerRequestDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsOptional()
  @IsString()
  message?: string;

  constructor() {
    this.name = "";
    this.email = "";
    this.message = "";
  }
}
