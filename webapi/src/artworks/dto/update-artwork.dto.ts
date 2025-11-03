import { IsString, IsOptional, IsArray, MaxLength, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateArtworkDto {
  @ApiPropertyOptional({ description: 'Artwork title', minLength: 1, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: 'Artist name', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  artist?: string;

  @ApiPropertyOptional({ description: 'Artwork description', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ description: 'Tags for categorization', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
