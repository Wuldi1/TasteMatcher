import {
  IsString,
  IsOptional,
  IsArray,
  IsNumber,
  IsBoolean,
  IsPositive,
  MaxLength,
  MinLength,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class UpdateArtworkDto {
  @ApiPropertyOptional({
    description: "Artwork title",
    minLength: 1,
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: "Artist name", maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  artist?: string;

  @ApiPropertyOptional({ description: "Artwork description", maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    description: "Tags for categorization",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: "Artwork price in USD", type: Number })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  price?: number;

  @ApiPropertyOptional({
    description: "Auction max price in USD",
    type: Number,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  maxPrice?: number;

  @ApiPropertyOptional({
    description: "Whether this artwork is an auction item",
    type: Boolean,
  })
  @IsOptional()
  @IsBoolean()
  isAuction?: boolean;

  @ApiPropertyOptional({
    description: "Auction end date (ISO datetime)",
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  endDate?: string;

  @ApiPropertyOptional({
    description: "Whether to display the price to users",
    type: Boolean,
  })
  @IsOptional()
  @IsBoolean()
  shouldDisplayPrice?: boolean;

  @ApiPropertyOptional({
    description:
      "Whether this artwork should be available in the Taster experience",
    type: Boolean,
  })
  @IsOptional()
  @IsBoolean()
  useForTaster?: boolean;

  @ApiPropertyOptional({
    description:
      "Whether this artwork is private to the uploader and their invitees",
    type: Boolean,
  })
  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;

  @ApiPropertyOptional({
    description: "Artwork height in inches",
    type: Number,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  height?: number;

  @ApiPropertyOptional({ description: "Artwork depth in inches", type: Number })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  depth?: number;

  @ApiPropertyOptional({ description: "Artwork width in inches", type: Number })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  width?: number;

  @ApiPropertyOptional({ description: "Artwork medium", maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  medium?: string;

  @ApiPropertyOptional({
    description: "Artwork signature details",
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  signature?: string;

  @ApiPropertyOptional({ description: "Artwork creation date", maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  date?: string;
}
