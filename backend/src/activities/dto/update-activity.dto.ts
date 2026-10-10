import { IsString } from 'class-validator';

export class UpdateActivityDto {
  @IsString()
  placeId: string;
}
