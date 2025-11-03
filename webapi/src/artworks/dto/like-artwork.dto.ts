import { IsString, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LikeArtworkDto {
  @ApiProperty({ description: 'User ID performing the action' })
  @IsString()
  userId!: string;

  @ApiProperty({ description: 'True for like, false for dislike' })
  @IsBoolean()
  liked!: boolean;
}
