import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class AddActivityDto {
  @IsString()
  placeId: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
