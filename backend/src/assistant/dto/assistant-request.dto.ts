import { IsOptional, IsString, MinLength } from 'class-validator';

export class AssistantRequestDto {
  @IsString()
  @MinLength(1)
  message: string;

  @IsOptional()
  @IsString()
  dayId?: string;
}
