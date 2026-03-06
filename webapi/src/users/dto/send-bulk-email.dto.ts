import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

export class SendBulkEmailDto {
  @IsOptional()
  @IsUUID()
  domainId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  recipientUserIds: string[];

  @IsString()
  @MinLength(3)
  @MaxLength(140)
  subject: string;

  @IsString()
  @MinLength(20)
  @MaxLength(30000)
  htmlBody: string;

  @IsOptional()
  @IsString()
  @MaxLength(30000)
  textBody?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  templateId?: string;

  constructor() {
    this.recipientUserIds = [];
    this.subject = "";
    this.htmlBody = "";
  }
}
