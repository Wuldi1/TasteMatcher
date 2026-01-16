import { Role } from "@tastematcher/common";
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  MinLength,
} from "class-validator";

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

  @IsEnum(["dealer", "customer", "domain_owner"])
  role: Role;

  @IsString()
  domainId: string;

  constructor() {
    this.name = "";
    this.email = "";
    this.domainId = "";
    this.role = "customer";
  }
}
