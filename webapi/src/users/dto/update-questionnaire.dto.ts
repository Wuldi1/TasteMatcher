import { IsOptional, IsObject } from 'class-validator';
import { PersonalQuestionnaire } from '@tastematcher/common';

/**
 * DTO for updating user's personal questionnaire
 */
export class UpdateQuestionnaireDto {
  @IsOptional()
  @IsObject()
  personalQuestionnaire?: PersonalQuestionnaire;
}
