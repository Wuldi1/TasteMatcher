import { IsOptional, IsString, MinLength } from "class-validator";

/**
 * DTO for updating domain information
 */
export class UpdateDomainDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;
}
