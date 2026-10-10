import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class ReorderActivitiesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  activityIds: string[];
}
