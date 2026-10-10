import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateTripDto } from './create-trip.dto';

// PartialType требует @nestjs/mapped-types — добавлен ниже в package.json
export class UpdateTripDto extends PartialType(
  OmitType(CreateTripDto, [] as const),
) {}
