import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Category, Pace } from '@prisma/client';

export class CreateTripDto {
  @IsString()
  city: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  travelers: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  budget: number;

  @IsOptional()
  @IsString()
  currency?: string = 'RUB';

  @IsEnum(Pace)
  pace: Pace;

  @IsArray()
  @IsEnum(Category, { each: true })
  categories: Category[];
}
