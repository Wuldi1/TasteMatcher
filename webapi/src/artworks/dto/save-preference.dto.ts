import { IsString, IsBoolean, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SavePreferenceDto {
  @ApiProperty({ description: 'Artwork ID' })
  @IsString()
  artworkId!: string;

  @ApiProperty({ description: 'Domain ID' })
  @IsString()
  domainId!: string;


  @ApiPropertyOptional({ description: 'True for like, false for dislike' })
  @IsOptional()
  @IsBoolean()
  liked?: boolean;

  @ApiPropertyOptional({ description: 'Optional free text customer comment', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
