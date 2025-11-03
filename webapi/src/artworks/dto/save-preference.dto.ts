import { IsString, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SavePreferenceDto {
  @ApiProperty({ description: 'Artwork ID' })
  @IsString()
  artworkId!: string;

  @ApiProperty({ description: 'True for like, false for dislike' })
  @IsBoolean()
  liked!: boolean;
}
